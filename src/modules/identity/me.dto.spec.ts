import { sha256Hex } from '../../common/hash'
import { mapleId, nexonIdHash } from './me.dto'

describe('nexonIdHash', () => {
  it('SHA-256 소문자 16진 64자만 받는다', () => {
    expect(nexonIdHash.safeParse(sha256Hex('ocid')).success).toBe(true)
  })

  it('원문으로 보이는 값은 받지 않는다. 서버에 넥슨 식별자 원문이 쌓이면 안 된다', () => {
    for (const raw of [
      'm1',
      'ocid-1',
      sha256Hex('ocid').toUpperCase(),
      sha256Hex('ocid').slice(0, 32),
      `${sha256Hex('ocid')}0`,
    ]) {
      expect(nexonIdHash.safeParse(raw).success).toBe(false)
    }
  })

  it('메이플 ID 도 같은 형식이다', () => {
    expect(mapleId.safeParse(sha256Hex('maple')).success).toBe(true)
    expect(mapleId.safeParse('maple_id-1').success).toBe(false)
  })
})
