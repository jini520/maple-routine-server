/**
 * 운영자 창구. 공지를 쓰고 알림까지 한 자리에서 보낸다.
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

import { insertNotice, markSent } from './db.ts'
import { newNoticeId, type Notice } from './notice.ts'
import { payloadBytes, sendNotice, truncateBytes } from './send.ts'

/** nginx 가 넣어 주는 헤더 이름. 값은 환경변수로만 안다. */
const TOKEN_HEADER = 'x-admin-token'

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

interface AdminForm {
  title: string
  body: string
  pushTitle: string
  pushBody: string
  push: boolean
  dryRun: boolean
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

  const missing: string[] = []
  if (form.title === '') missing.push('제목')
  if (form.body === '') missing.push('내용')
  if (form.push) {
    if (form.pushTitle === '') missing.push('알림 제목')
    if (form.pushBody === '') missing.push('알림 내용')
  }
  if (missing.length > 0) {
    json(res, 400, { error: `${missing.join(' · ')} 를 채워 주세요` })
    return
  }

  const notice: Notice = {
    id: newNoticeId(new Date()),
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

function json(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(text),
    'cache-control': 'no-store',
  })
  res.end(text)
}
