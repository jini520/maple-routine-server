import type { ConfigService } from '@nestjs/config'

import type { Env } from '../../config/env.schema'
import { RunSlots } from './run-slots'

const config = { get: () => 2 } as unknown as ConfigService<Env, true>

function acquire(slots: RunSlots): () => void {
  const release = slots.tryAcquire()
  if (release === null) throw new Error('슬롯이 없다')
  return release
}

describe('RunSlots', () => {
  it('상한까지는 받고 넘으면 null 이다', () => {
    const slots = new RunSlots(config)
    acquire(slots)
    acquire(slots)
    expect(slots.tryAcquire()).toBeNull()
    expect(slots.active).toBe(2)
  })

  it('돌려주면 다시 받는다. 두 번 돌려줘도 수가 안 줄어든다', () => {
    const slots = new RunSlots(config)
    const release = acquire(slots)
    acquire(slots)
    release()
    release()
    expect(slots.active).toBe(1)
    acquire(slots)
    expect(slots.tryAcquire()).toBeNull()
  })
})
