/**
 * 운영자 창구. 공지를 쓰고 알림까지 한 자리에서 보내고, 이미 쓴 것을 고치고 지운다.
 *
 * **수정과 삭제는 운영자 공지에만 닿는다**(`kind = 'app'`). 넥슨에서 받아 온 글은 지난
 * 것이면 넥슨이 상세를 거절해 우리 DB 가 유일한 사본이고, 아직 넥슨 목록에 떠 있는 글이면
 * 폴러가 1분 뒤 다시 넣으면서 알림까지 다시 쏜다. 잠그는 자리는 SQL 의 `WHERE` 다.
 *
 * **인증은 앞단 nginx 가 한다**(`auth_basic`). 여기서 또 하지 않는 이유는 비밀번호 저장과
 * 세션을 우리가 만들면 그것이 곧 새로 감사해야 할 코드이기 때문이다. nginx 의 것은 이미
 * 검증된 물건이고 TLS 뒤에 있다.
 *
 * **그래도 토큰을 한 번 더 본다.** nginx 설정은 언젠가 깨질 수 있고, 그때 이 경로가 무방비로
 * 열리면 아무나 전 사용자에게 알림을 쏜다. nginx 가 넣어 주는 헤더를 확인해서, 앞단이
 * 무너져도 이쪽이 혼자 거부하게 둔다.
 */
import type { IncomingMessage, ServerResponse } from 'node:http'

import {
  closeManualCompletionBoss,
  deleteNotice,
  insertNotice,
  listAppNotices,
  listManualCompletionRows,
  markSent,
  openManualCompletionBoss,
  updateNotice,
} from './db.ts'
import { BOSS_OPTIONS, bossNameOf, isDateKey, isKnownBoss, todayKst } from './manual-completion.ts'
import { newNoticeId, type Notice } from './notice.ts'
import { payloadBytes, sendNotice, truncateBytes } from './send.ts'

/** nginx 가 넣어 주는 헤더 이름. 값은 환경변수로만 안다. */
const TOKEN_HEADER = 'x-admin-token'

/** 목록에 한 번에 세우는 건수. 운영자 공지는 드물게 쓰여 이 창이면 몇 년 치가 들어온다. */
const LIST_LIMIT = 50

export function isAuthorized(req: IncomingMessage): boolean {
  const expected = process.env.ADMIN_TOKEN
  // 토큰이 설정 안 돼 있으면 **닫는다.** 열어 두면 설정을 빠뜨린 서버가 조용히 무방비가 된다.
  if (expected === undefined || expected === '') return false
  return req.headers[TOKEN_HEADER] === expected
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    size += (chunk as Buffer).length
    // 본문이 아무리 길어도 이 정도면 넉넉하다. 상한이 없으면 메모리를 먹이는 길이 된다.
    if (size > 256 * 1024) throw new Error('본문이 너무 크다')
    chunks.push(chunk as Buffer)
  }
  return Buffer.concat(chunks).toString('utf8')
}

/** 작성 폼과 수정 폼이 같은 모양으로 온다. 두 화면의 칸이 같아서다. */
export interface AdminForm {
  title: string
  body: string
  pushTitle: string
  pushBody: string
  push: boolean
  dryRun: boolean
}

/**
 * 못 채운 칸의 이름. 빈 배열이면 다 찼다.
 *
 * **알림 칸은 알림을 켠 경우에만 따진다.** 늘 따지면 공지만 저장하는 길이 막힌다.
 * 순서가 화면에 뜨는 순서와 같아서 무엇을 채워야 하는지 눈으로 좇을 수 있다.
 */
export function missingFields(form: AdminForm): string[] {
  const missing: string[] = []
  if (form.title === '') missing.push('제목')
  if (form.body === '') missing.push('내용')
  if (form.push) {
    if (form.pushTitle === '') missing.push('알림 제목')
    if (form.pushBody === '') missing.push('알림 내용')
  }
  return missing
}

/**
 * `/admin/notices/{id}` 가 가리키는 공지. 다른 경로면 `null`.
 *
 * **`/admin/notices` 자체는 `null` 이다.** 그 경로는 목록과 작성이 쓰고, 여기서 id 를 읽으면
 * 목록 조회가 상세 수정으로 새어 나간다.
 *
 * 인코딩을 푸는 이유는 공백이나 슬래시가 든 id 가 주소에 인코딩돼 오기 때문이다. 안 풀면
 * DB 의 id 와 안 맞아 멀쩡한 공지가 없는 것이 된다.
 */
export function adminNoticeId(pathname: string): string | null {
  const found = /^\/admin\/notices\/(.+)$/.exec(pathname)
  return found?.[1] === undefined ? null : decodeURIComponent(found[1])
}

function parseForm(raw: string): AdminForm {
  const v: unknown = JSON.parse(raw)
  const o = (typeof v === 'object' && v !== null ? v : {}) as Record<string, unknown>
  const str = (k: string): string => (typeof o[k] === 'string' ? o[k].trim() : '')

  return {
    title: str('title'),
    body: str('body'),
    pushTitle: str('pushTitle'),
    pushBody: str('pushBody'),
    push: o.push === true,
    dryRun: o.dryRun === true,
  }
}

/**
 * 공지를 저장하고, 고른 경우 알림까지 보낸다.
 *
 * **저장이 발송보다 먼저다.** 발송에 성공했는데 저장이 실패하면 알림은 갔는데 목록에 없는
 * 공지가 생기고 되돌릴 방법이 없다. 반대는 다시 쏘면 된다.
 */
export async function handleCreate(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const form = parseForm(await readBody(req))

  const missing = missingFields(form)
  if (missing.length > 0) {
    json(res, 400, { error: `${missing.join(' · ')} 를 채워 주세요` })
    return
  }

  const notice: Notice = {
    id: newNoticeId(new Date()),
    // 이 창구로 쓰는 것은 언제나 운영자 공지다.
    kind: 'app',
    title: form.title,
    body: form.body,
    publishedAt: new Date().toISOString(),
  }

  // 검증만 하는 경우에는 저장도 안 한다. 눌러 볼 때마다 목록이 지저분해진다.
  if (form.dryRun) {
    const messageId = form.push
      ? await sendNotice(notice, { title: form.pushTitle, body: form.pushBody }, true)
      : null
    json(res, 200, {
      ok: true,
      dryRun: true,
      bytes: payloadBytes(notice),
      truncated: truncateBytes(notice.body, 2800) !== notice.body,
      messageId,
    })
    return
  }

  await insertNotice(notice)

  if (!form.push) {
    json(res, 200, { ok: true, id: notice.id, sent: false })
    return
  }

  const messageId = await sendNotice(notice, { title: form.pushTitle, body: form.pushBody })
  await markSent(notice.id, form.pushTitle, form.pushBody)
  json(res, 200, { ok: true, id: notice.id, sent: true, messageId })
}

/** 목록 화면이 그릴 것. 운영자 공지만 온다. */
export async function handleList(res: ServerResponse): Promise<void> {
  json(res, 200, { items: await listAppNotices(LIST_LIMIT) })
}

/**
 * 제목과 내용을 갈고, 고른 경우 알림을 다시 보낸다.
 *
 * **알림은 켠 경우에만 나간다.** 오타 하나를 고칠 때마다 전 사용자의 트레이가 울면 안 된다.
 *
 * 저장이 발송보다 먼저인 것은 작성과 같은 이유다. 발송만 성공하면 트레이의 문구와 목록의
 * 공지가 어긋나고 되돌릴 방법이 없다.
 */
export async function handleUpdate(
  req: IncomingMessage,
  res: ServerResponse,
  id: string,
): Promise<void> {
  const form = parseForm(await readBody(req))

  const missing = missingFields(form)
  if (missing.length > 0) {
    json(res, 400, { error: `${missing.join(' · ')} 를 채워 주세요` })
    return
  }

  const notice = await updateNotice(id, form.title, form.body)
  if (notice === null) {
    json(res, 404, { error: '없는 공지거나 운영자 공지가 아닙니다' })
    return
  }

  if (!form.push) {
    json(res, 200, { ok: true, id, sent: false })
    return
  }

  const messageId = await sendNotice(notice, { title: form.pushTitle, body: form.pushBody })
  await markSent(id, form.pushTitle, form.pushBody)
  json(res, 200, { ok: true, id, sent: true, messageId })
}

/**
 * 지운다.
 *
 * **이미 나간 알림은 못 거둔다.** 지우는 것은 목록과 상세뿐이고, 기기의 사본에서는 앱이
 * 다음에 목록을 받을 때 빠진다.
 */
export async function handleDelete(res: ServerResponse, id: string): Promise<void> {
  if (!(await deleteNotice(id))) {
    json(res, 404, { error: '없는 공지거나 운영자 공지가 아닙니다' })
    return
  }
  json(res, 200, { ok: true, id })
}

/**
 * 직접 완료를 열어 둔 보스 목록. 고를 수 있는 보스까지 함께 낸다.
 *
 * 화면이 두 번 물지 않게 한 응답에 싫는다. 드롭다운은 목록이 있어야 그려진다.
 */
export async function handleManualCompletionList(res: ServerResponse): Promise<void> {
  json(res, 200, {
    items: (await listManualCompletionRows()).map((row) => ({ ...row, name: bossNameOf(row.boss) })),
    bosses: BOSS_OPTIONS,
    today: todayKst(),
  })
}

/**
 * 보스를 열어 둔다. 목록에 없는 key 는 거절한다.
 *
 * **모르는 key 를 받으면 조용히 아무 보스도 안 열린다.** 앱은 자기 보스 표에서 못 찾으면 그냥 지나간다.
 * 여기서 막는 편이 운영자에게 바로 말한다.
 */
export async function handleManualCompletionOpen(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const raw: unknown = JSON.parse(await readBody(req))
  const form = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {}
  const boss = typeof form.boss === 'string' ? form.boss : ''
  const from = typeof form.from === 'string' && form.from !== '' ? form.from : todayKst()

  if (!isKnownBoss(boss)) {
    json(res, 400, { error: '보스 표에 없는 key 입니다' })
    return
  }
  if (!isDateKey(from)) {
    json(res, 400, { error: '여는 날은 YYYY-MM-DD 입니다' })
    return
  }

  await openManualCompletionBoss(boss, from)
  json(res, 200, { ok: true, boss, from })
}

/**
 * 닫는다. 행을 안 지우고 `closed_at` 만 적는다.
 *
 * 여는 것과 닫는 것이 따로 도는 동작이라(사용자 지정 2026-09-18) 언제 켜고 언제 꿄는지가 남아야 한다.
 */
export async function handleManualCompletionClose(res: ServerResponse, boss: string): Promise<void> {
  if (!(await closeManualCompletionBoss(boss))) {
    json(res, 404, { error: '안 열려 있는 보스입니다' })
    return
  }
  json(res, 200, { ok: true, boss })
}

function json(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(text),
    'cache-control': 'no-store',
  })
  res.end(text)
}
