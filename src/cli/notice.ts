import { NestFactory } from '@nestjs/core'

import { formatKst } from '../common/kst'

import { operatorNoticeKey } from '../modules/notices/notice-key'
import { type NewNotice, NoticesRepository } from '../modules/notices/notices.repository'
import { messageFor, type PushableNotice } from '../modules/push/push-text'
import { PushService } from '../modules/push/push.service'
import { parseNoticeArgs } from './notice-args'

async function main(): Promise<void> {
  const args = parseNoticeArgs(process.argv.slice(2))
  // 인자가 틀리면 env 검사 전에 끝나야 한다. AppModule 은 import 시점에 env 를 검사한다.
  const { AppModule } = await import('../app.module.js')
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] })
  try {
    const repo = app.get(NoticesRepository)
    const push = app.get(PushService)

    switch (args.command) {
      case 'send': {
        const now = new Date()
        const row: NewNotice = {
          noticeKey: args.id ?? operatorNoticeKey(now),
          kind: 'app',
          title: args.title,
          body: args.body,
          link: args.link ?? null,
          publishedAt: now,
        }
        const pushable: PushableNotice = {
          noticeKey: row.noticeKey,
          kind: 'app',
          title: row.title,
          body: args.body,
          publishedAt: now,
          link: args.link ?? null,
          pushTitle: null,
          pushBody: null,
        }
        if (args.dry) {
          console.log(JSON.stringify(messageFor(pushable), null, 2))
          console.log(`dry ${await push.sendNotice(pushable, true)}`)
          return
        }
        // 저장이 발송보다 먼저다. 알림은 갔는데 목록에 없는 공지는 되돌릴 방법이 없다.
        const { id } = await repo.insert(row)
        const messageId = await push.sendNotice(pushable)
        await repo.markSent(id, new Date())
        console.log(`보냈다 ${row.noticeKey} ${messageId}`)
        return
      }
      case 'list': {
        const rows = await repo.list(args.kind === undefined ? null : [args.kind], args.limit)
        for (const row of rows) {
          console.log(
            [
              row.noticeKey,
              row.kind,
              formatKst(row.publishedAt),
              row.sentAt === null ? '-' : '보냄',
              row.title,
            ].join('\t'),
          )
        }
        return
      }
      case 'push': {
        const row = await repo.findByKey(args.id)
        if (row === null) throw new Error(`없는 공지: ${args.id}`)
        const messageId = await push.sendNotice(row, args.dry)
        if (!args.dry) await repo.markSent(row.id, new Date())
        console.log(`${args.dry ? 'dry' : '보냈다'} ${row.noticeKey} ${messageId}`)
        return
      }
    }
  } finally {
    await app.close()
  }
}

main().catch((error: unknown) => {
  console.error(String(error))
  process.exitCode = 1
})
