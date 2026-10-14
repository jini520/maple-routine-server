import { randomToken, sha256 } from './hash'

describe('hash', () => {
  it('sha256 은 32바이트 Buffer 이고 같은 입력에는 같은 값이 나온다', () => {
    expect(sha256('a')).toHaveLength(32)
    expect(sha256('a').equals(sha256('a'))).toBe(true)
    expect(sha256('a').equals(sha256('b'))).toBe(false)
  })

  it('randomToken 은 URL 에 그대로 실을 수 있는 글자만 쓰고 매번 다르다', () => {
    const t = randomToken()
    expect(t).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(t).not.toBe(randomToken())
  })
})
