import { once } from 'node:events'
import type { Writable } from 'node:stream'
import { finished } from 'node:stream/promises'
import { constants, createGzip, type Gzip } from 'node:zlib'

import { abortError } from '../../common/abort-error'
import { HEARTBEAT } from './lines'
import type { LineSink } from './stream-run'

/** 빈 줄 사이 간격. 이동통신 NAT 와 nginx 의 proxy_read_timeout(60s) 보다 짧아야 연결이 안 끊긴다. */
export const HEARTBEAT_MS = 15_000

/**
 * 응답에 gzip 으로 NDJSON 을 흘린다. 줄마다 동기 플러시라 앱이 줄 단위로 받는다.
 *
 * gzip 의 write 가 false 를 돌려주면 그 바이트는 보내진 것이 아니라 쌓인 것이다. 그래서 drain 까지
 * 기다리고 나서야 풀린다. 그 사이 일꾼은 다음 쪽을 당기지 않는다.
 */
export class NdjsonOutput implements LineSink {
  private readonly gzip: Gzip
  private readonly timer: NodeJS.Timeout

  constructor(
    private readonly down: Writable,
    private readonly signal: AbortSignal,
    heartbeatMs = HEARTBEAT_MS,
  ) {
    this.gzip = createGzip({ flush: constants.Z_SYNC_FLUSH })
    // 아래쪽이 먼저 죽으면 쓰기가 에러를 낸다. 듣는 이가 없으면 프로세스가 죽는다.
    this.gzip.on('error', () => undefined)
    down.on('error', () => undefined)
    this.gzip.pipe(down)
    this.timer = setInterval(() => {
      if (!this.gzip.destroyed && !this.gzip.writableEnded) this.gzip.write(HEARTBEAT)
    }, heartbeatMs)
    this.timer.unref()
    signal.addEventListener('abort', () => this.tearDown(), { once: true })
  }

  async write(line: Buffer): Promise<void> {
    if (this.signal.aborted) throw abortError()
    if (!this.gzip.write(line)) await once(this.gzip, 'drain', { signal: this.signal })
  }

  /** gzip 을 닫고 아래쪽이 끝날 때까지 기다린다. 끊긴 뒤면 버리고 바로 돌아온다. */
  async end(): Promise<void> {
    clearInterval(this.timer)
    if (this.signal.aborted || this.gzip.destroyed) {
      this.tearDown()
      return
    }
    const closed = finished(this.down, { readable: false }).catch(() => undefined)
    this.gzip.end()
    await closed
  }

  private tearDown(): void {
    clearInterval(this.timer)
    this.gzip.destroy()
  }
}
