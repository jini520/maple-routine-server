import { parseArgs } from 'node:util'

import { NOTICE_KINDS, type NoticeKind } from '../modules/notices/notice.types'

export type NoticeCommand =
  | {
      command: 'send'
      id: string | undefined
      title: string
      body: string
      link: string | undefined
      dry: boolean
    }
  | { command: 'list'; kind: NoticeKind | undefined; limit: number }
  | { command: 'push'; id: string; dry: boolean }

const OPTIONS = {
  id: { type: 'string' },
  title: { type: 'string' },
  body: { type: 'string' },
  link: { type: 'string' },
  kind: { type: 'string' },
  limit: { type: 'string' },
  dry: { type: 'boolean', default: false },
} as const

/** `npm run notice -- send|list|push …` 의 인자. 틀리면 무엇이 빠졌는지가 메시지다. */
export function parseNoticeArgs(argv: readonly string[]): NoticeCommand {
  const [command, ...rest] = argv
  const { values } = parseArgs({ args: [...rest], options: OPTIONS, strict: true })
  const dry = values.dry ?? false

  switch (command) {
    case 'send': {
      if (values.title === undefined || values.title === '') throw new Error('--title 이 필요하다')
      if (values.body === undefined || values.body === '') throw new Error('--body 가 필요하다')
      return {
        command,
        id: values.id,
        title: values.title,
        body: values.body,
        link: values.link,
        dry,
      }
    }
    case 'list': {
      const kind = values.kind
      if (kind !== undefined && !(NOTICE_KINDS as readonly string[]).includes(kind)) {
        throw new Error(`모르는 kind: ${kind}. ${NOTICE_KINDS.join(' | ')}`)
      }
      const limit = values.limit === undefined ? 20 : Number(values.limit)
      if (!Number.isInteger(limit) || limit < 1) throw new Error('--limit 은 1 이상의 정수다')
      return { command, kind: kind as NoticeKind | undefined, limit }
    }
    case 'push': {
      if (values.id === undefined || values.id === '') throw new Error('--id 가 필요하다')
      return { command, id: values.id, dry }
    }
    default:
      throw new Error(`모르는 명령: ${command ?? '(없음)'}. send | list | push`)
  }
}
