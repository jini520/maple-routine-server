import { randomBytes } from 'node:crypto'
import { once } from 'node:events'
import { PassThrough, Writable } from 'node:stream'
import { constants, gunzipSync } from 'node:zlib'

import { NdjsonOutput } from './ndjson-output'

function inflate(chunks: Buffer[]): string {
  return gunzipSync(Buffer.concat(chunks), { finishFlush: constants.Z_SYNC_FLUSH }).toString()
}

const never = new AbortController().signal
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

describe('NdjsonOutput', () => {
  it('줄마다 gzip 으로 동기 플러시해 흘린다', async () => {
    const chunks: Buffer[] = []
    const down = new PassThrough()
    down.on('data', (chunk: Buffer) => chunks.push(chunk))
    const out = new NdjsonOutput(down, never, 60_000)

    const arrived = once(down, 'data')
    await out.write(Buffer.from('{"t":"page"}\n'))
    await arrived

    expect(inflate(chunks)).toBe('{"t":"page"}\n')
    await out.end()
  })

  it('15초마다 빈 줄을 흘린다', async () => {
    const chunks: Buffer[] = []
    const down = new PassThrough()
    down.on('data', (chunk: Buffer) => chunks.push(chunk))
    const out = new NdjsonOutput(down, never, 30)

    await sleep(100)
    await out.end()

    expect(inflate(chunks)).toMatch(/^\n{2,}$/)
  })

  it('쓰기가 쌓이면 배수까지 기다린다', async () => {
    const pending: (() => void)[] = []
    let stuck = true
    const down = new Writable({
      highWaterMark: 1024,
      write(_chunk, _encoding, callback) {
        if (stuck) pending.push(callback)
        else callback()
      },
    })
    const out = new NdjsonOutput(down, never, 60_000)

    // gzip 의 안팎 버퍼(기본 64KB 둘)가 찰 때까지 쓴다. 그 뒤의 쓰기가 멈춰 있어야 한다.
    let stalled: Promise<void> | null = null
    for (let i = 0; i < 8 && stalled === null; i += 1) {
      let resolved = false
      const write = out
        .write(Buffer.concat([randomBytes(64 * 1024), Buffer.from('\n')]))
        .then(() => {
          resolved = true
        })
      await sleep(30)
      if (!resolved) stalled = write
    }
    expect(stalled).not.toBeNull()

    stuck = false
    for (const callback of pending.splice(0)) callback()
    await stalled
    await out.end()
  })

  it('end 는 gzip 을 닫아 아래를 finish 시킨다', async () => {
    const chunks: Buffer[] = []
    const down = new PassThrough()
    down.on('data', (chunk: Buffer) => chunks.push(chunk))
    const out = new NdjsonOutput(down, never, 60_000)

    await out.write(Buffer.from('{"t":"end"}\n'))
    await out.end()

    expect(down.writableEnded).toBe(true)
    expect(gunzipSync(Buffer.concat(chunks)).toString()).toBe('{"t":"end"}\n')
  })

  it('signal 이 끊기면 기다리던 쓰기가 거절되고 하트비트가 멈춘다', async () => {
    const ctrl = new AbortController()
    const down = new Writable({
      highWaterMark: 1024,
      write() {
        /* 영원히 안 받는다 */
      },
    })
    const out = new NdjsonOutput(down, ctrl.signal, 30)

    const write = out.write(Buffer.concat([randomBytes(64 * 1024), Buffer.from('\n')]))
    ctrl.abort()

    await expect(write).rejects.toThrow()
    await out.end()
  })
})
