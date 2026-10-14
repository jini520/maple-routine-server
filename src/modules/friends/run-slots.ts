import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

import type { Env } from '../../config/env.schema'

/**
 * 전역 동시 회차 수. 메모리가 MAX_RUNS × FANOUT × 870KB 라 이 수가 힙의 상한이다.
 *
 * 넘는 요청은 기다리게 두지 않는다. 기다리는 연결도 메모리를 들고 서 있어 상한을 둔 이유가 없어진다.
 */
@Injectable()
export class RunSlots {
  private readonly max: number
  private count = 0

  constructor(config: ConfigService<Env, true>) {
    this.max = config.get('FRIENDS_MAX_RUNS', { infer: true })
  }

  get active(): number {
    return this.count
  }

  /** 자리가 있으면 돌려주는 함수를 준다. 두 번 불러도 한 번만 센다. 없으면 null 이다. */
  tryAcquire(): (() => void) | null {
    if (this.count >= this.max) return null
    this.count += 1
    let released = false
    return () => {
      if (released) return
      released = true
      this.count -= 1
    }
  }
}
