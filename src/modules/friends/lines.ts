import type { StreamTask } from './friends.dto'

export type EndReason = 'done' | 'deadline' | 'budget' | 'relogin'

/** 한 쪽에 달라고 하는 줄 수. 넥슨 상한이고 줄당 0.886KB 라 쪽 하나가 최대 870KB 다. */
const PAGE_SIZE = 1000

const CURSOR_KEY = '"next_cursor"'
const CLOSE_LINE = Buffer.from('}\n')

/** 하트비트. 빈 줄 하나이고 앱은 빈 줄을 버린다. */
export const HEARTBEAT = Buffer.from('\n')

/** 작업과 커서로 넥슨 경로를 만든다. 내역은 첫 쪽만 date 를 들고 다음 쪽은 cursor 만 든다. */
export function pathOf(task: StreamTask, cursor: string | null): string {
  switch (task.kind) {
    case 'character-list':
      return '/maplestory/v1/character/list'
    case 'character-state': {
      // date 가 없으면 오늘이다. 자정 전 결산 중에도 200 을 주는 조회라 앱이 그대로 쓴다.
      const date = task.date === undefined ? '' : `&date=${task.date}`
      return `/maplestory/v1/scheduler/character-state?ocid=${encodeURIComponent(task.ocid)}${date}`
    }
    default: {
      const tail = cursor === null ? `date=${task.date}` : `cursor=${encodeURIComponent(cursor)}`
      return `/maplestory/v1/history/${task.kind}?count=${PAGE_SIZE}&${tail}`
    }
  }
}

/** 개행과 CR 을 공백으로 바꾼 사본. JSON 문자열 안에는 날개행이 올 수 없어 모든 개행이 공백이어도 뜻이 안 바뀐다. */
export function sanitizeBody(body: Buffer): Buffer {
  const out = Buffer.from(body)
  for (let i = 0; i < out.length; i += 1) {
    const byte = out[i]
    if (byte === 0x0a || byte === 0x0d) out[i] = 0x20
  }
  return out
}

/** 본문에서 next_cursor 를 꺼낸다. 없거나 비었거나 null 이면 null 이다. 본문을 파싱하지 않는다. */
export function nextCursorOf(body: Buffer): string | null {
  const at = body.indexOf(CURSOR_KEY)
  if (at < 0) return null
  const from = at + CURSOR_KEY.length
  const tail = body.toString('utf8', from, Math.min(body.length, from + 4096))
  const match = /^\s*:\s*"([^"]*)"/.exec(tail)
  return match !== null && match[1].length > 0 ? match[1] : null
}

/** 앞 공백 뒤가 { 인가. 넥슨 에러 화면(HTML)과 빈 본문을 거른다. */
export function isJsonObject(body: Buffer): boolean {
  for (let i = 0; i < body.length; i += 1) {
    const byte = body[i]
    if (byte === 0x20 || byte === 0x0a || byte === 0x0d || byte === 0x09) continue
    return byte === 0x7b
  }
  return false
}

/** 쪽 줄. body 는 파싱 없이 바이트 그대로 끼운다. */
export function pageLine(task: StreamTask, n: number, body: Buffer): Buffer {
  const head = JSON.stringify({ t: 'page', ...task, n })
  return Buffer.concat([Buffer.from(`${head.slice(0, -1)},"body":`), body, CLOSE_LINE])
}

export function doneLine(task: StreamTask, pages: number): Buffer {
  return Buffer.from(`${JSON.stringify({ t: 'done', ...task, pages })}\n`)
}

/**
 * status 0 은 HTTP 가 아니다. 못 닿았거나 10초를 넘겼거나 쪽이 안전핀을 넘은 것이다.
 * code 는 넥슨 본문의 error.name 이다. 앱이 400 을 날짜 문제(OPENAPI00004) · 결산 중(00009) · 영구 불가(00003)로 가른다.
 */
export function failLine(task: StreamTask, status: number, code: string | null = null): Buffer {
  const line = code === null ? { t: 'fail', ...task, status } : { t: 'fail', ...task, status, code }
  return Buffer.from(`${JSON.stringify(line)}\n`)
}

export function endLine(reason: EndReason): Buffer {
  return Buffer.from(`${JSON.stringify({ t: 'end', reason })}\n`)
}
