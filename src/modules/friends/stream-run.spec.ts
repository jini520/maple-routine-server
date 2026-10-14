import { ReloginRequired } from '../auth/token.service'
import type { StreamTask } from './friends.dto'
import { type PageResult, type RunOptions, runStream } from './stream-run'

function page(body: string, status = 200): PageResult {
  return { status, body: Buffer.from(body) }
}

function sinkOf() {
  const lines: string[] = []
  return {
    lines,
    write: jest.fn(async (line: Buffer) => {
      lines.push(line.toString())
    }),
  }
}

function parsed(lines: string[]): Record<string, unknown>[] {
  return lines.map((line) => JSON.parse(line) as Record<string, unknown>)
}

const cube = (date: string): StreamTask => ({ kind: 'cube', date })
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function build(over: Partial<RunOptions> = {}): RunOptions {
  return {
    tasks: [],
    fanout: 4,
    deadlineMs: 120_000,
    maxBytes: 16 * 1024 * 1024,
    maxPages: 50,
    signal: new AbortController().signal,
    now: () => Date.now(),
    tokenFor: async () => 'AT',
    fetchPage: async () => page('{"count":0}'),
    sink: sinkOf(),
    ...over,
  }
}

describe('runStream', () => {
  it('작업마다 쪽을 줄로 흘리고 커서가 끝나면 done 이다. 다 끝나면 end 는 done 이다', async () => {
    const sink = sinkOf()
    const fetchPage = jest.fn(async () => page('{"count":1,"next_cursor":"","cube_history":[]}'))

    const summary = await runStream(
      build({ tasks: [cube('2026-10-01'), cube('2026-10-02')], fetchPage, sink }),
    )

    const lines = parsed(sink.lines)
    const of = (date: string) => lines.filter((l) => l.date === date)
    expect(of('2026-10-01').map((l) => l.t)).toEqual(['page', 'done'])
    expect(of('2026-10-02').map((l) => l.t)).toEqual(['page', 'done'])
    expect(of('2026-10-01')[0]).toMatchObject({ n: 1, body: { count: 1 } })
    expect(of('2026-10-01')[1]).toMatchObject({ pages: 1 })
    expect(lines.at(-1)).toEqual({ t: 'end', reason: 'done' })
    expect(summary).toMatchObject({ reason: 'done', tasks: 2, done: 2, failed: 0, pages: 2 })
    expect(summary.bytes).toBe(
      2 * Buffer.byteLength('{"count":1,"next_cursor":"","cube_history":[]}'),
    )
  })

  it('커서가 있으면 다음 쪽을 cursor 로 부른다', async () => {
    const sink = sinkOf()
    const fetchPage = jest.fn(async (_task: StreamTask, cursor: string | null) =>
      page(cursor === null ? '{"next_cursor":"C2"}' : '{"next_cursor":""}'),
    )
    const task = cube('2026-10-01')

    await runStream(build({ tasks: [task], fetchPage, sink }))

    expect(fetchPage.mock.calls.map((c) => c[1])).toEqual([null, 'C2'])
    expect(fetchPage).toHaveBeenCalledWith(task, null, 'AT', expect.any(AbortSignal))
    expect(parsed(sink.lines).map((l) => [l.t, l.n ?? l.pages])).toEqual([
      ['page', 1],
      ['page', 2],
      ['done', 2],
      ['end', undefined],
    ])
  })

  it('200 이 아니거나 JSON 이 아니면 body 없는 fail 이고 그 작업은 멈춘다', async () => {
    const sink = sinkOf()
    const fetchPage = jest.fn(async (task: StreamTask) =>
      task.kind === 'cube' ? page('{"error":1}', 500) : page('<html>'),
    )

    const summary = await runStream(
      build({ tasks: [cube('2026-10-01'), { kind: 'character-list' }], fetchPage, sink }),
    )

    const lines = parsed(sink.lines)
    expect(lines.find((l) => l.kind === 'cube')).toEqual({
      t: 'fail',
      kind: 'cube',
      date: '2026-10-01',
      status: 500,
    })
    expect(lines.find((l) => l.kind === 'character-list')).toEqual({
      t: 'fail',
      kind: 'character-list',
      status: 200,
    })
    expect(fetchPage).toHaveBeenCalledTimes(2)
    expect(summary).toMatchObject({ reason: 'done', done: 0, failed: 2, pages: 0, bytes: 0 })
  })

  it('동시에 여는 넥슨 요청은 fanout 까지다', async () => {
    let active = 0
    let peak = 0
    const fetchPage = jest.fn(async () => {
      active += 1
      peak = Math.max(peak, active)
      await sleep(5)
      active -= 1
      return page('{"count":0}')
    })
    const tasks = Array.from({ length: 10 }, (_, i) =>
      cube(`2026-10-${String(i + 1).padStart(2, '0')}`),
    )

    await runStream(build({ tasks, fanout: 2, fetchPage }))

    expect(peak).toBe(2)
    expect(fetchPage).toHaveBeenCalledTimes(10)
  })

  it('기한이 지나면 새 작업을 안 시작하고 진행 중은 끝까지 보내며 end 는 deadline 이다', async () => {
    let clock = 0
    const sink = sinkOf()
    const fetchPage = jest.fn(async (_task: StreamTask, cursor: string | null) => {
      if (cursor === null) {
        clock = 200_000
        return page('{"next_cursor":"C2"}')
      }
      return page('{"next_cursor":""}')
    })

    const summary = await runStream(
      build({
        tasks: [cube('2026-10-01'), cube('2026-10-02'), cube('2026-10-03')],
        fanout: 1,
        fetchPage,
        sink,
        now: () => clock,
      }),
    )

    expect(parsed(sink.lines).map((l) => [l.t, l.date])).toEqual([
      ['page', '2026-10-01'],
      ['page', '2026-10-01'],
      ['done', '2026-10-01'],
      ['end', undefined],
    ])
    expect(fetchPage).toHaveBeenCalledTimes(2)
    expect(summary).toMatchObject({ reason: 'deadline', done: 1, elapsedMs: 200_000 })
  })

  it('바이트 예산도 같고 end 는 budget 이다', async () => {
    const sink = sinkOf()
    const fetchPage = jest.fn(async () => page('{"count":1,"cube_history":[1,2,3]}'))

    const summary = await runStream(
      build({
        tasks: [cube('2026-10-01'), cube('2026-10-02')],
        fanout: 1,
        maxBytes: 10,
        fetchPage,
        sink,
      }),
    )

    expect(fetchPage).toHaveBeenCalledTimes(1)
    expect(parsed(sink.lines).at(-1)).toEqual({ t: 'end', reason: 'budget' })
    expect(summary).toMatchObject({ reason: 'budget', done: 1 })
  })

  it('토큰이 거절되면 end 는 relogin 이다', async () => {
    const sink = sinkOf()
    const tokenFor = jest
      .fn<Promise<string>, []>()
      .mockResolvedValueOnce('AT')
      .mockRejectedValue(new ReloginRequired('죽었다'))
    const fetchPage = jest.fn(async () => page('{"count":0}'))

    const summary = await runStream(
      build({
        tasks: [cube('2026-10-01'), cube('2026-10-02')],
        fanout: 1,
        tokenFor,
        fetchPage,
        sink,
      }),
    )

    expect(fetchPage).toHaveBeenCalledTimes(1)
    expect(parsed(sink.lines).at(-1)).toEqual({ t: 'end', reason: 'relogin' })
    expect(summary.reason).toBe('relogin')
  })

  it('sink 가 배수를 기다리는 동안 다음 쪽을 당기지 않는다', async () => {
    let release = () => {}
    const first = new Promise<void>((resolve) => {
      release = resolve
    })
    let writes = 0
    const sink = {
      write: jest.fn(() => {
        writes += 1
        return writes === 1 ? first : Promise.resolve()
      }),
    }
    const fetchPage = jest.fn(async (_task: StreamTask, cursor: string | null) =>
      page(cursor === null ? '{"next_cursor":"C2"}' : '{"next_cursor":""}'),
    )

    const run = runStream(build({ tasks: [cube('2026-10-01')], fanout: 1, fetchPage, sink }))
    await sleep(20)
    expect(fetchPage).toHaveBeenCalledTimes(1)

    release()
    await run
    expect(fetchPage).toHaveBeenCalledTimes(2)
  })

  it('signal 이 끊기면 end 없이 끝난다', async () => {
    const ctrl = new AbortController()
    const sink = sinkOf()
    const fetchPage = jest.fn(async () => {
      ctrl.abort()
      throw new Error('aborted')
    })

    const summary = await runStream(
      build({
        tasks: [cube('2026-10-01'), cube('2026-10-02')],
        fanout: 1,
        signal: ctrl.signal,
        fetchPage,
        sink,
      }),
    )

    expect(sink.lines).toEqual([])
    expect(fetchPage).toHaveBeenCalledTimes(1)
    expect(summary.reason).toBe('aborted')
  })

  it('쪽이 안전핀을 넘으면 status 0 의 fail 이다', async () => {
    const sink = sinkOf()
    const fetchPage = jest.fn(async () => page('{"next_cursor":"again"}'))

    const summary = await runStream(
      build({ tasks: [cube('2026-10-01')], maxPages: 2, fetchPage, sink }),
    )

    expect(fetchPage).toHaveBeenCalledTimes(2)
    expect(parsed(sink.lines).map((l) => l.t)).toEqual(['page', 'page', 'fail', 'end'])
    expect(parsed(sink.lines)[2]).toMatchObject({ status: 0 })
    expect(summary).toMatchObject({ failed: 1, pages: 2 })
  })
})
