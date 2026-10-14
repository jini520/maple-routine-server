/**
 * 넥슨 공지를 주기로 받아 새것만 저장하고 알림을 보낸다.
 *
 * **1분마다 도는 이유는 나중에 받아 오는 길이 없기 때문이다.** 넥슨 상세는 목록에 지금 떠
 * 있는 것만 답한다(실측 2026-09-10). 목록에서 빠지면 그 글은 영영 못 받는다. 썬데이 메이플은
 * 일요일 하루짜리라 그날의 목록에만 잠깐 뜬다. 그래서 새 항목을 본 그 회차에서 상세까지
 * 받아 저장하고, 우리 DB 가 그 글의 유일한 아카이브가 된다.
 *
 * **저장이 발송보다 먼저다.** 발송에 성공했는데 저장이 실패하면 알림은 갔는데 목록에 없는
 * 공지가 생기고 되돌릴 방법이 없다. 반대는 다시 쏘면 된다.
 *
 * **못 보낸 것을 다시 보내지 않는다.** 발송 실패는 그 회차에서 끝난다. 재시도를 넣으면 서버가
 * 오래 죽었다 살아날 때 밀린 알림이 한꺼번에 터진다.
 */
import { parseContents } from './html.ts'
import { NEXON_KINDS, type NexonDetail, type NexonKind, type NexonListItem } from './nexon.ts'
import {
  isSundayMaple,
  nexonNoticeId,
  pushTextFor,
  shouldNotify,
  type Notice,
  type NoticeKind,
  type PushText,
} from './notice.ts'
import { runAnyway, type RunExclusively } from './single-runner.ts'
import type { NexonMeta } from './db.ts'

/** 목록과 푸시에 실리는 미리보기 길이. 상세는 `blocks` 가 온전히 든다. */

/**
 * 넥슨을 부르는 사이 간격. 한 회차에 상세가 스물까지 나갈 수 있어 한 번에 몰지 않는다.
 *
 * 250ms 인 것은 **개발 단계 키의 초당 5건**을 안 넘기려는 것이다. 서비스 단계 키(초당 500건)
 * 에는 여유가 넘치지만, 키를 잘못 꽂았을 때 429 로 회차가 통째로 죽는 것보다 느린 편이 낫다.
 */
const PACE_MS = 250

/**
 * 이만큼 지난 글은 **저장만 하고 알림을 안 보낸다.**
 *
 * 두 가지 사고를 같은 규칙으로 막는다. ① 씨 뿌리기가 중간에 429 로 끊기면 다음 회차의
 * `hasAny` 가 참이 되어 남은 열몇 건이 전부 알림으로 나간다. ② 서버가 하루 죽었다 살아나면
 * 그 사이 올라온 글이 한꺼번에 터진다. 둘 다 «오래된 글을 새 글로 읽는» 같은 실수다.
 *
 * 폴링이 1분이라 정상 회차의 글은 언제나 몇 분 안쪽이다. 이 창을 넓게 잡아도 새 글은 다 잡힌다.
 */
const NOTIFY_WINDOW_MS = 6 * 60 * 60 * 1000

export interface PollDeps {
  list: (kind: NexonKind) => Promise<NexonListItem[]>
  detail: (kind: NexonKind, item: NexonListItem) => Promise<NexonDetail | null>
  knownIds: (ids: readonly string[]) => Promise<Set<string>>
  hasAny: (kind: NoticeKind) => Promise<boolean>
  save: (notice: Notice, meta: NexonMeta) => Promise<void>
  send: (notice: Notice, push: PushText) => Promise<void>
  /** 테스트가 0으로 만든다. */
  pace?: (ms: number) => Promise<void>
  /** 테스트가 고정한다. */
  now?: () => number
}

export interface PollResult {
  saved: number
  sent: number
  /** 목록에서 방금 빠져 상세를 못 받은 건수. */
  missing: number
  /** 저장은 됐는데 발송이 실패한 건수. */
  failed: number
  /** 저장만 하고 알림을 안 보낸 건수. 씨 뿌리기 · 오래된 글 · 썬데이가 아닌 이벤트. */
  quiet: number
}

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * 목록 값만으로 만든 공지. **상세를 안 받는 길이다.**
 *
 * 본문이 빈 것이 요점이다. 넥슨 공지의 푸시는 제목으로 만들고(`pushTextFor` 의 비-`app` 분기),
 * 앱은 넥슨 네 분류를 넥슨에서 직접 받는다. 그래서 미리보기를 읽는 자리가 없다.
 */
function noticeFromList(kind: NexonKind, one: NexonListItem): Notice {
  return {
    id: nexonNoticeId(kind, one.sourceId),
    kind,
    title: one.title,
    body: '',
    publishedAt: one.publishedAt,
    ...(one.url === '' ? {} : { link: one.url }),
  }
}

/**
 * 상세까지 받은 공지. **썬데이 메이플만 이 길로 온다.**
 *
 * `blocks` 를 드는 것은 `/v1/sunday-maple` 이 응답에 싣기 때문이고, 그것이 유일한 소비자다.
 */
function noticeFromDetail(kind: NexonKind, detail: NexonDetail): Notice {
  return {
    ...noticeFromList(kind, detail),
    blocks: parseContents(detail.contents),
  }
}

/**
 * 저장이 끝난 공지의 알림을 보낸다. 안 보내는 경우 셋을 여기서 가린다.
 *
 * **`result` 를 고친다.** 두 저장 경로(목록만 · 상세까지)가 같은 판정을 써야 해서 빼낸 것이고,
 * 베끼면 한쪽만 고쳐지는 날이 온다.
 */
async function notify(
  kind: NexonKind,
  notice: Notice,
  deps: PollDeps,
  result: PollResult,
  seeding: boolean,
  now: () => number,
): Promise<void> {
  const stale = now() - Date.parse(notice.publishedAt) > NOTIFY_WINDOW_MS
  if (seeding || stale || !shouldNotify(kind, notice.title)) {
    result.quiet += 1
    return
  }

  try {
    await deps.send(notice, pushTextFor(notice))
    result.sent += 1
  } catch (error) {
    // 저장은 이미 끝났다. 목록에는 나오고 알림만 안 간 상태로 남는다.
    console.error(`[poll] ${notice.id} 발송 실패`, error)
    result.failed += 1
  }
}

/** 한 분류 한 회차. */
export async function pollKind(kind: NexonKind, deps: PollDeps): Promise<PollResult> {
  const pace = deps.pace ?? wait
  const now = deps.now ?? Date.now
  const result: PollResult = { saved: 0, sent: 0, missing: 0, failed: 0, quiet: 0 }

  // 목록 조회도 간격을 둔다. 넷을 잇달아 부르면 그것만으로 개발 단계 키의 초당 5건에 닿는다
  // (실측 2026-09-10: 여기에 간격이 없어 회차 경계마다 429 가 났다).
  await pace(PACE_MS)

  const listed = await deps.list(kind)
  if (listed.length === 0) return result

  const known = await deps.knownIds(listed.map((one) => nexonNoticeId(kind, one.sourceId)))
  const fresh = listed
    .filter((one) => !known.has(nexonNoticeId(kind, one.sourceId)))
    // 오래된 것부터. 알림이 발행 순서대로 도착해야 한다.
    .sort((a, b) => a.publishedAt.localeCompare(b.publishedAt))

  if (fresh.length === 0) return result

  // 이 분류를 한 번도 받은 적 없으면 이번 회차는 씨를 뿌리는 것이다. 목록 20건이 전부 새
  // 항목이라 그대로 쏘면 알림이 스무 번 울린다.
  const seeding = !(await deps.hasAny(kind))

  for (const one of fresh) {
    // **상세는 썬데이 메이플만 받는다.** 판정이 제목만 보고 제목은 목록에 있어서, 상세를 받기
    // 전에 가린다. 나머지 공지의 상세는 받아도 읽는 자리가 없다 - `blocks` 는 썬데이 응답만
    // 쓰고 미리보기는 아무도 안 쓴다.
    if (!isSundayMaple(one.title)) {
      const notice = noticeFromList(kind, one)
      await deps.save(notice, { sourceId: one.sourceId, startsAt: null, endsAt: null })
      result.saved += 1
      await notify(kind, notice, deps, result, seeding, now)
      continue
    }

    await pace(PACE_MS)

    const detail = await deps.detail(kind, one)
    if (detail === null) {
      // 목록에서 방금 빠졌다. 다시 부른다고 오지 않으므로 저장할 것이 없다.
      result.missing += 1
      continue
    }

    const notice = noticeFromDetail(kind, detail)
    await deps.save(notice, {
      sourceId: detail.sourceId,
      startsAt: detail.startsAt,
      endsAt: detail.endsAt,
    })
    result.saved += 1
    await notify(kind, notice, deps, result, seeding, now)
  }

  return result
}

export interface PollSummary extends PollResult {
  /** 분류째 실패한 수. 목록 조회가 죽으면 그 분류는 이번 회차를 통째로 건너뛴다. */
  errors: number
}

/**
 * 네 분류 한 회차. **한 분류가 실패해도 나머지는 돈다.**
 *
 * 넥슨이 한 엔드포인트만 느리거나 429 를 줄 수 있는데, 그것 때문에 나머지 셋을 못 받으면
 * 그 사이 목록에서 빠진 글을 잃는다.
 */
export async function pollOnce(deps: PollDeps): Promise<PollSummary> {
  const summary: PollSummary = { saved: 0, sent: 0, missing: 0, failed: 0, quiet: 0, errors: 0 }

  for (const kind of NEXON_KINDS) {
    try {
      const result = await pollKind(kind, deps)
      summary.saved += result.saved
      summary.sent += result.sent
      summary.missing += result.missing
      summary.failed += result.failed
      summary.quiet += result.quiet
    } catch (error) {
      console.error(`[poll] ${kind} 실패`, error)
      summary.errors += 1
    }
  }

  return summary
}

/**
 * 폴링을 건다. 돌려주는 함수를 부르면 멈춘다.
 *
 * **회차가 겹치지 않게 한다.** 넥슨이 느린 날 `setInterval` 로 걸면 이전 회차가 끝나기 전에
 * 다음이 시작되고, 같은 글을 두 번 저장하며 알림도 두 번 나간다.
 *
 * @param exclusive 인스턴스가 여럿일 때 한 쪽에서만 돌게 하는 자물쇠. 못 잡으면 그 회차를
 *   건너뛴다. 안 주면 아무도 안 막는다
 */
export function startPolling(
  deps: PollDeps,
  intervalMs: number,
  exclusive: RunExclusively = runAnyway,
): () => void {
  let stopped = false
  let timer: NodeJS.Timeout | undefined

  const loop = async (): Promise<void> => {
    if (stopped) return

    try {
      await exclusive(async () => {
        const summary = await pollOnce(deps)
        if (summary.saved > 0 || summary.errors > 0) {
          console.log('[poll]', JSON.stringify(summary))
        }
      })
    } catch (error) {
      console.error('[poll] 회차 실패', error)
    }

    if (!stopped) timer = setTimeout(() => void loop(), intervalMs)
  }

  void loop()

  return () => {
    stopped = true
    if (timer !== undefined) clearTimeout(timer)
  }
}
