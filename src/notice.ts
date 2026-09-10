/**
 * 공지 한 건. **앱의 `src/types/notice.ts` 와 같은 모양이어야 한다.**
 *
 * 이 타입이 세 자리에 그대로 나간다. 푸시 페이로드의 `data` · 목록 응답의 항목 · 상세 응답.
 * 셋이 같은 모양인 것이 의도다. 앱의 화면이 출처를 안 가리게 하려는 것이고, 한쪽만 바꾸면
 * 다른 저장소의 타입 검사가 못 잡으므로 필드를 더할 때 양쪽을 함께 볼 것.
 */
import type { NoticeBlock } from './html.ts'

/**
 * 어디서 온 공지인가. **다섯이고, 구독 토글은 넷이다.**
 *
 * 넷으로 접지 않고 다섯으로 두는 이유는 원본이 다섯이기 때문이다. 업데이트와 이벤트를 저장
 * 단계에서 합치면 목록 화면이 둘을 가를 방법이 없어지고, 나중에 토글을 쪼갤 때 이미 쌓인
 * 기록을 되살릴 수 없다.
 */
export type NoticeKind = 'app' | 'game' | 'update' | 'event' | 'cashshop'

export const NOTICE_KINDS: readonly NoticeKind[] = ['app', 'game', 'update', 'event', 'cashshop']

export function isNoticeKind(value: unknown): value is NoticeKind {
  return typeof value === 'string' && (NOTICE_KINDS as readonly string[]).includes(value)
}

export interface Notice {
  id: string
  kind: NoticeKind
  title: string
  /** 개행을 담는다. 화면이 그대로 그린다. 넥슨 공지는 블록에서 뽑은 평문이 여기 온다. */
  body: string
  /** ISO 8601. 정렬 기준이다. */
  publishedAt: string
  /** 밖으로 나가는 주소. 없을 수 있다. */
  link?: string
  /**
   * 상세 본문. **목록 응답에는 안 실린다.**
   *
   * 업데이트 한 건이 블록 797개 · JSON 57KB다(실측). 목록 20건에 실으면 한 응답이 MB 단위가
   * 된다. `GET /v1/notices/{id}` 에서만 준다.
   */
  blocks?: NoticeBlock[]
}

/**
 * 알림에 뜰 문구. **공지 문구와 별개다.**
 *
 * 알림은 트레이에 한두 줄로 뜨고 공지 본문은 길 수 있다. 같은 글을 두 자리에 쓰면 한쪽이
 * 늘 어색해진다. 그래서 운영자가 따로 적고, 넥슨 공지는 아래 `pushTextFor` 가 만든다.
 */
export interface PushText {
  title: string
  body: string
}

/**
 * 분류가 어느 토픽으로 가는가. **`app` 이 `notice` 인 것은 호환 때문이다.**
 *
 * 이미 스토어에 나간 바이너리가 `notice` 를 구독하고 있다. 그 이름을 게임 공지로 돌리면
 * 업데이트를 안 받은 기기가 어느 날 갑자기 켠 적 없는 알림을 받는다.
 *
 * 업데이트와 이벤트가 한 토픽을 쓰는 것은 사용자가 정한 토글이 그 묶음이어서다.
 */
export const TOPIC_BY_KIND: Record<NoticeKind, string> = {
  app: 'notice',
  game: 'notice-game',
  update: 'notice-update-event',
  event: 'notice-update-event',
  cashshop: 'notice-cashshop',
}

/**
 * FCM `data` 로 나갈 모양. **값이 전부 문자열이어야 한다.**
 *
 * FCM 이 그렇게 정해 뒀고, 숫자나 불리언을 넣으면 발송이 거부된다. 그리고 메시지 전체가
 * 4KB 를 넘으면 안 된다. 넘는지 재는 것은 `send.ts` 가 한다.
 *
 * **`blocks` 는 안 싣는다.** 상세 본문은 4KB 에 절대 안 들어가고, 앱은 알림을 탭한 뒤 서버
 * 조회로 온전한 것을 받는다.
 */
export function toPushData(notice: Notice): Record<string, string> {
  return {
    noticeId: notice.id,
    kind: notice.kind,
    title: notice.title,
    body: notice.body,
    publishedAt: notice.publishedAt,
    ...(notice.link === undefined ? {} : { link: notice.link }),
  }
}

/** 사람이 읽을 id. 시각이 들어가 목록에서 순서가 눈에 보인다. 앱 공지 전용이다. */
export function newNoticeId(now: Date): string {
  const p = (n: number): string => String(n).padStart(2, '0')
  return `notice-${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`
}

/**
 * 넥슨 공지의 id. **분류를 앞에 붙이는 것이 요건이다.**
 *
 * `notice_id` 의 번호 체계가 분류마다 다르다(실측: 공지 149862 · 업데이트 811 · 이벤트 1374 ·
 * 캐시샵 642). 번호 하나로는 어느 글인지 못 가린다.
 */
export function nexonNoticeId(kind: NoticeKind, sourceId: number): string {
  return `${kind}-${sourceId}`
}

/**
 * 이 공지를 알림으로 보내는가.
 *
 * **이벤트는 썬데이만 보낸다**(사용자 지정). 나머지 이벤트를 빼는 이유는 한 번에 몰려서다.
 * 8월 20일 패치 날 이벤트 5건과 캐시샵 4건이 같은 8시 14분에 올라왔다(실측).
 *
 * 판정이 제목 완전 일치가 아닌 이유는 관측된 제목이 셋이기 때문이다. `썬데이 메이플` ·
 * `스페셜 썬데이 메이플` · `스페셜 썬데이`. 공백을 지우고 `썬데이` 를 담는지 보면 넥슨이
 * 접두어를 붙이거나 띄어쓰기를 바꿔도 살아남는다.
 */
export function shouldNotify(kind: NoticeKind, title: string): boolean {
  if (kind !== 'event') return true
  return isSundayMaple(title)
}

/**
 * 썬데이 메이플인가. **알림 판정과 기록 판정이 같은 함수를 쓴다.**
 *
 * 관측된 제목이 셋이다 - `썬데이 메이플` · `스페셜 썬데이 메이플` · `스페셜 썬데이`. 그래서
 * 완전 일치가 아니라 공백을 지운 제목이 `썬데이` 를 담는지 본다. 넥슨이 접두어를 붙이거나
 * 띄어쓰기를 바꿔도 살아남는다.
 *
 * ⚠️ **아직 실물을 못 봤다.** 위 셋은 웹 게시판 제목이고, 이 API 가 주는 제목을 받아 본 적이
 * 없다(썬데이는 일요일 하루만 목록에 뜨고 지나면 상세도 400 이다). 실물을 본 날 이 함수만
 * 고치면 되고, **기록은 이 함수를 조회 때마다 돌리므로 이미 쌓인 것도 함께 바로잡힌다.**
 */
export function isSundayMaple(title: string): boolean {
  return title.replace(/\s+/g, '').includes('썬데이')
}

/**
 * 넥슨 공지의 알림 문구. 제목이 그대로 알림 제목이 된다.
 *
 * **본문이 비면 제목을 대신 쓴다.** 이벤트·캐시샵 본문은 이미지 한 장이라 평문이 0자다
 * (실측). 그대로 두면 알림 둘째 줄이 빈칸으로 뜬다.
 */
export function pushTextFor(notice: Notice): PushText {
  const body = notice.body.trim()
  return {
    title: notice.title,
    body: body === '' ? notice.title : body.split('\n')[0] ?? notice.title,
  }
}

/**
 * 썬데이 메이플 기록 한 줄. **`Notice` 와 달리 기간을 든다.**
 *
 * 기록에서 가장 중요한 값이 «어느 일요일이었나» 인데 `publishedAt` 은 등록 시각이라 그것과
 * 다를 수 있다. 그래서 이 응답에만 `startsAt`·`endsAt` 을 싣는다.
 */
export interface SundayRecord {
  id: string
  title: string
  publishedAt: string
  /** 이벤트 시작. 넥슨이 안 주면 `null`. */
  startsAt: string | null
  endsAt: string | null
  link?: string
  /** 본문. 썬데이는 이미지 한두 장이라 목록에 실어도 무겁지 않다. */
  blocks?: NoticeBlock[]
}

/**
 * 쌓인 이벤트에서 썬데이만 골라 최근 순으로.
 *
 * **판정을 조회 때마다 돌린다.** 저장할 때 표식을 박아 두면 빠르지만, 아직 이 API 가 주는
 * 썬데이 제목을 받아 본 적이 없어서 지금 박는 표식은 틀릴 수 있다. 조회 때 돌리면 판정을
 * 고치는 것만으로 **이미 쌓인 기록도 함께 바로잡힌다.**
 *
 * 정렬 축은 **이벤트 시작일**이다. 등록일이 아니라 그날이 기록의 이름이기 때문이고, 넥슨이
 * 기간을 안 주면 등록일로 떨어진다.
 */
export function sundayRecordsFrom(rows: readonly SundayRecord[]): SundayRecord[] {
  const when = (row: SundayRecord): string => row.startsAt ?? row.publishedAt

  return rows
    .filter((row) => isSundayMaple(row.title))
    .sort((a, b) => when(b).localeCompare(when(a)))
}
