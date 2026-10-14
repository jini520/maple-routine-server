import type { ConfigService } from '@nestjs/config'

import type { Env } from '../config/env.schema'
import { NexonBucket } from './nexon-bucket'

function bucketOf(rps: number): NexonBucket {
  return new NexonBucket({ get: () => rps } as unknown as ConfigService<Env, true>)
}

const never = new AbortController().signal
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

describe('NexonBucket', () => {
  it('같은 플랫폼은 버킷 하나이고 초당 수를 넘는 몫은 다음 초까지 기다린다', async () => {
    const bucket = bucketOf(2)
    const t0 = Date.now()
    const started: number[] = []
    await Promise.all(
      [1, 2, 3].map(() =>
        bucket.run('ios', never, async () => {
          started.push(Date.now() - t0)
        }),
      ),
    )
    expect(started[0]).toBeLessThan(200)
    expect(started[1]).toBeLessThan(200)
    expect(started[2]).toBeGreaterThanOrEqual(900)
  })

  it('플랫폼이 다르면 버킷이 다르다', async () => {
    const bucket = bucketOf(1)
    const t0 = Date.now()
    const started: number[] = []
    const tick = async () => {
      started.push(Date.now() - t0)
    }
    await Promise.all([bucket.run('ios', never, tick), bucket.run('android', never, tick)])
    expect(Math.max(...started)).toBeLessThan(200)
  })

  it('이미 끊긴 signal 이면 부르지 않고 거절한다', async () => {
    const bucket = bucketOf(10)
    const fn = jest.fn()
    await expect(bucket.run('ios', AbortSignal.abort(), fn)).rejects.toThrow()
    expect(fn).not.toHaveBeenCalled()
  })

  it('기다리는 동안 끊기면 바로 거절하고 fn 은 안 불린다', async () => {
    const bucket = bucketOf(1)
    const ctrl = new AbortController()
    void bucket.run('ios', never, () => sleep(10))
    const fn = jest.fn().mockResolvedValue(undefined)
    const queued = bucket.run('ios', ctrl.signal, fn)
    ctrl.abort()
    await expect(queued).rejects.toThrow()
    await sleep(1200)
    expect(fn).not.toHaveBeenCalled()
  })

  it('drain 은 이 초의 남은 몫을 비운다', async () => {
    const bucket = bucketOf(5)
    await bucket.drain('ios')
    const t0 = Date.now()
    await bucket.run('ios', never, async () => undefined)
    expect(Date.now() - t0).toBeGreaterThanOrEqual(700)
  })
})
