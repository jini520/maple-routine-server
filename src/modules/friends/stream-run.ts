import { ReloginRequired } from '../auth/token.service'
import type { StreamTask } from './friends.dto'
import {
  doneLine,
  endLine,
  type EndReason,
  failLine,
  isJsonObject,
  nextCursorOf,
  pageLine,
  sanitizeBody,
} from './lines'

/** 넥슨 쪽 하나. status 0 은 못 닿은 것이다. */
export interface PageResult {
  status: number
  body: Buffer
}

export type PageFetcher = (
  task: StreamTask,
  cursor: string | null,
  token: string,
  signal: AbortSignal,
) => Promise<PageResult>

/** 줄을 받는 곳. write 는 배수가 빠져 다음 쪽을 당겨도 될 때 풀린다. */
export interface LineSink {
  write(line: Buffer): Promise<void>
}

export interface RunOptions {
  tasks: readonly StreamTask[]
  /** 동시에 여는 넥슨 요청 수 */
  fanout: number
  /** 지나면 새 작업을 안 시작한다 */
  deadlineMs: number
  /** 원본 바이트. 지나면 새 작업을 안 시작한다 */
  maxBytes: number
  /** 작업 하나의 쪽 수 안전핀 */
  maxPages: number
  signal: AbortSignal
  now: () => number
  tokenFor: () => Promise<string>
  fetchPage: PageFetcher
  sink: LineSink
}

export interface RunSummary {
  reason: EndReason | 'aborted'
  tasks: number
  done: number
  failed: number
  pages: number
  bytes: number
  elapsedMs: number
}

/** 작업 하나가 넘길 수 없는 쪽 수. 무한 루프를 막는 안전핀이지 용량 예산이 아니다. */
export const MAX_PAGES_PER_TASK = 50

/**
 * 작업 목록을 fanout 개의 일꾼이 나눠 돌며 쪽마다 줄을 흘린다.
 *
 * 시간과 바이트는 새 작업을 시작할 때만 본다. 진행 중 작업을 자르면 그 작업이 매 회차 같은
 * 자리에서 잘려 영원히 안 적히므로, 예산이 넘어도 하던 작업은 done 까지 보낸다.
 * 끊기면 end 없이 돌아온다. 앱은 end 없는 끝을 end 와 똑같이 다룬다.
 */
export async function runStream(options: RunOptions): Promise<RunSummary> {
  const { tasks, signal, sink } = options
  const startedAt = options.now()
  const state = { next: 0, done: 0, failed: 0, pages: 0, bytes: 0, stop: null as EndReason | null }

  const runTask = async (task: StreamTask, token: string): Promise<void> => {
    let cursor: string | null = null
    for (let n = 1; ; n += 1) {
      let page: PageResult
      try {
        page = await options.fetchPage(task, cursor, token, signal)
      } catch {
        if (signal.aborted) return
        page = { status: 0, body: Buffer.alloc(0) }
      }
      if (signal.aborted) return
      if (page.status !== 200 || !isJsonObject(page.body)) {
        state.failed += 1
        await sink.write(failLine(task, page.status))
        return
      }
      const body = sanitizeBody(page.body)
      state.pages += 1
      state.bytes += body.length
      await sink.write(pageLine(task, n, body))
      cursor = nextCursorOf(body)
      if (cursor === null) {
        state.done += 1
        await sink.write(doneLine(task, n))
        return
      }
      if (n >= options.maxPages) {
        state.failed += 1
        await sink.write(failLine(task, 0))
        return
      }
    }
  }

  const worker = async (): Promise<void> => {
    while (!signal.aborted && state.stop === null) {
      if (state.next >= tasks.length) return
      if (options.now() - startedAt >= options.deadlineMs) {
        state.stop = 'deadline'
        return
      }
      if (state.bytes >= options.maxBytes) {
        state.stop = 'budget'
        return
      }
      const task = tasks[state.next]
      state.next += 1
      let token: string
      try {
        token = await options.tokenFor()
      } catch (error) {
        if (error instanceof ReloginRequired) {
          state.stop = 'relogin'
          return
        }
        throw error
      }
      await runTask(task, token)
    }
  }

  try {
    await Promise.all(Array.from({ length: Math.min(options.fanout, tasks.length) }, worker))
  } catch (error) {
    if (!signal.aborted) throw error
  }

  const summary = {
    tasks: tasks.length,
    done: state.done,
    failed: state.failed,
    pages: state.pages,
    bytes: state.bytes,
    elapsedMs: options.now() - startedAt,
  }
  if (signal.aborted) return { reason: 'aborted', ...summary }
  const reason = state.stop ?? 'done'
  await sink.write(endLine(reason))
  return { reason, ...summary }
}
