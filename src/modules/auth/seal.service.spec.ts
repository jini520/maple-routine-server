import type { ConfigService } from '@nestjs/config'

import type { Env } from '../../config/env.schema'
import { SealError, SealService } from './seal.service'

const KEY = 'ab'.repeat(32)

function service(key = KEY): SealService {
  const config = { get: () => key } as unknown as ConfigService<Env, true>
  return new SealService(config)
}

describe('SealService', () => {
  it('봉한 것을 같은 용도로 열면 원문이 나온다', () => {
    const s = service()
    const blob = s.seal('access', 'token-value')

    expect(s.open('access', blob)).toBe('token-value')
  })

  it('블롭은 version 1바이트 · iv 12 · tag 16 · 암호문 순서다', () => {
    const blob = service().seal('session', 'x')

    expect(blob[0]).toBe(1)
    expect(blob.length).toBe(1 + 12 + 16 + 1)
  })

  it('같은 원문이라도 매번 다른 블롭이 된다', () => {
    const s = service()

    expect(s.seal('access', 'a').equals(s.seal('access', 'a'))).toBe(false)
  })

  it('다른 용도로 열면 실패한다', () => {
    const s = service()
    const blob = s.seal('refresh', 'r')

    expect(() => s.open('access', blob)).toThrow(SealError)
  })

  it('한 바이트라도 바뀌면 실패한다', () => {
    const s = service()
    const blob = s.seal('access', 'a')
    blob[blob.length - 1] ^= 0x01

    expect(() => s.open('access', blob)).toThrow(SealError)
  })

  it('모르는 version 이면 실패한다', () => {
    const s = service()
    const blob = s.seal('access', 'a')
    blob[0] = 9

    expect(() => s.open('access', blob)).toThrow(SealError)
  })
})
