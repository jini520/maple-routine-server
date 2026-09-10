#!/usr/bin/env node
/**
 * 공지를 쓰고 보내는 자리. **운영자의 창구다.**
 *
 * 이것이 API 가 아니라 CLI 인 이유. 발송을 HTTP 로 열면 인증을 만들어야 하고, 인증이 없는
 * 서버에서 그 경로는 아무나 전 사용자에게 알림을 쏘는 문이 된다. CLI 는 그 문을 SSH 로
 * 대신하고, SSH 는 이미 열쇠로 잠겨 있다.
 *
 * **주 창구는 웹 폼(`/admin`)이다.** 이 CLI 는 그것이 안 될 때의 뒷문이고, 서버에 SSH 로
 * 들어갈 수 있으면 언제나 쓸 수 있다.
 *
 * ```
 * notice send --title 제목 --body 본문 [--push-title …] [--push-body …] [--link …] [--dry]
 * notice list [--limit 20]
 * ```
 *
 * `--push-title` 과 `--push-body` 를 둘 다 주면 알림까지 보낸다. 안 주면 공지만 저장한다.
 */
import { insertNotice, listNotices, markSent, migrate } from '../src/db.ts'
import { sendNotice, payloadBytes } from '../src/send.ts'
import { newNoticeId, type Notice } from '../src/notice.ts'

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 ? undefined : process.argv[i + 1]
}

function has(name: string): boolean {
  return process.argv.includes(`--${name}`)
}

async function send(): Promise<void> {
  const title = flag('title')
  const body = flag('body')
  if (title === undefined || body === undefined) {
    throw new Error('--title 과 --body 가 있어야 한다')
  }

  const link = flag('link')
  const notice: Notice = {
    id: flag('id') ?? newNoticeId(new Date()),
    // CLI 로 쓰는 것은 운영자 공지다. 넥슨에서 온 것은 폴러가 자기 분류로 넣는다.
    kind: 'app',
    title,
    body,
    publishedAt: new Date().toISOString(),
    ...(link === undefined ? {} : { link }),
  }

  const pushTitle = flag('push-title')
  const pushBody = flag('push-body')
  const push =
    pushTitle !== undefined && pushBody !== undefined
      ? { title: pushTitle, body: pushBody }
      : null

  console.log(`id ${notice.id} · 페이로드 ${payloadBytes(notice)}바이트`)

  const dry = has('dry')

  // **저장이 먼저다.** 발송에 성공했는데 저장이 실패하면 알림은 갔는데 목록에 없는 공지가
  // 생기고, 그 상태는 되돌릴 방법이 없다. 반대는 다시 쏘면 된다.
  if (!dry) await insertNotice(notice)

  if (push === null) {
    console.log(dry ? '검증만 했다. 알림은 안 보낸다' : '공지만 저장했다. 알림은 안 보냈다')
    return
  }

  const messageId = await sendNotice(notice, push, dry)
  if (!dry) await markSent(notice.id, push.title, push.body)

  console.log(dry ? `검증만 통과. ${messageId}` : `발송 완료. ${messageId}`)
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
  console.error('쓰는 법: notice send --title … --body … [--push-title … --push-body …] [--dry]')
  console.error('         notice list [--limit 20]')
  process.exitCode = 1
}
process.exit()
