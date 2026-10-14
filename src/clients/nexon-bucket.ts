import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import Bottleneck from 'bottleneck'

import { abortError } from '../common/abort-error'
import type { Env } from '../config/env.schema'
import type { Platform } from './nexon-open-id.client'

/**
 * 자격 쌍마다 하나씩 두는 초당 토큰 버킷. 넥슨 fetch 는 여기서 토큰을 집어야 나간다.
 *
 * 동시 회차 상한만으로는 넥슨의 초당 한도가 안 지켜진다. 작은 쪽은 왕복 30ms 로 돌아 소켓 160개가
 * 초당 5,000건을 넘긴다. 공지 폴러는 개발자 키라 할당량이 달라 이 버킷을 안 거친다.
 */
@Injectable()
export class NexonBucket {
  private readonly rps: number
  private readonly limiters = new Map<Platform, Bottleneck>()

  constructor(config: ConfigService<Env, true>) {
    this.rps = config.get('FRIENDS_NEXON_RPS', { infer: true })
  }

  /** 토큰을 집은 뒤 fn 을 부른다. signal 이 끊기면 줄에 서 있던 것도 바로 거절되고 fn 은 안 불린다. */
  run<T>(platform: Platform, signal: AbortSignal, fn: () => Promise<T>): Promise<T> {
    if (signal.aborted) return Promise.reject(abortError())
    const limiter = this.limiterOf(platform)
    return new Promise<T>((resolve, reject) => {
      const onAbort = () => reject(abortError())
      signal.addEventListener('abort', onAbort, { once: true })
      limiter
        .schedule(() => (signal.aborted ? Promise.resolve(undefined as T) : fn()))
        .then(resolve, reject)
        .finally(() => signal.removeEventListener('abort', onAbort))
    })
  }

  /** 이 초의 남은 토큰을 비운다. 429 뒤에 쓴다. 다음 초에 다시 찬다. */
  async drain(platform: Platform): Promise<void> {
    const limiter = this.limiterOf(platform)
    const left = await limiter.currentReservoir()
    if (left !== null && left > 0) await limiter.incrementReservoir(-left)
  }

  private limiterOf(platform: Platform): Bottleneck {
    let limiter = this.limiters.get(platform)
    if (limiter === undefined) {
      limiter = new Bottleneck({
        reservoir: this.rps,
        reservoirRefreshAmount: this.rps,
        reservoirRefreshInterval: 1000,
      })
      this.limiters.set(platform, limiter)
    }
    return limiter
  }
}
