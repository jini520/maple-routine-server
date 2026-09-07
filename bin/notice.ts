#!/usr/bin/env node
/**
 * 공지를 쓰고 보내는 자리. **운영자의 창구다.**
 *
 * 이것이 API 가 아니라 CLI 인 이유. 발송을 HTTP 로 열면 인증을 만들어야 하고, 인증이 없는
 * 서버에서 그 경로는 아무나 전 사용자에게 알림을 쏘는 문이 된다. CLI 는 그 문을 SSH 로
 * 대신하고, SSH 는 이미 열쇠로 잠겨 있다.
 *
 * ```
 * notice send  --id 2026-09-08-maint --title 점검 --body 본문 [--link URL] [--dry]
 * notice list  [--limit 20]
 * ```
 */
import { insertNotice, listNotices, markSent, migrate } from '../src/db.ts'
import { sendNotice, payloadBytes } from '../src/send.ts'
import type { Notice } from '../src/notice.ts'

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 ? undefined : process.argv[i + 1]
}

function has(name: string): boolean {
  return process.argv.includes(`--${name}`)
}

async function send(): Promise<void> {
  const id = flag('id')
  const title = flag('title')
  const body = flag('body')
  if (id === undefined || title === undefined || body === undefined) {
    throw new Error('--id --title --body 가 다 있어야 한다')
  }

  const link = flag('link')
  const notice: Notice = {
    id,
    title,
    body,
    publishedAt: new Date().toISOString(),
    ...(link === undefined ? {} : { link }),
  }

  console.log(`페이로드 ${payloadBytes(notice)}바이트`)

  // **저장이 먼저다.** 발송에 성공했는데 저장이 실패하면 알림은 갔는데 목록에 없는 공지가
  // 생기고, 그 상태는 되돌릴 방법이 없다. 반대는 다시 쏘면 된다.
  await insertNotice(notice)

  const dry = has('dry')
  const messageId = await sendNotice(notice, dry)
  if (!dry) await markSent(id)

  console.log(dry ? `검증만 통과. id ${messageId}` : `발송 완료. id ${messageId}`)
}

async function list(): Promise<void> {
  const { items } = await listNotices(Number(flag('limit') ?? 20), null)
  for (const n of items) console.log(`${n.publishedAt}  ${n.id}  ${n.title}`)
  if (items.length === 0) console.log('(없음)')
}

await migrate()
const command = process.argv[2]
if (command === 'send') await send()
else if (command === 'list') await list()
else {
  console.error('쓰는 법: notice send --id … --title … --body … [--link …] [--dry]')
  console.error('         notice list [--limit 20]')
  process.exitCode = 1
}
process.exit()
