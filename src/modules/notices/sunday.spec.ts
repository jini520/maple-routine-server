import { isSundayMaple } from './sunday'

describe('isSundayMaple', () => {
  it('공백을 뺀 제목에 썬데이 가 들어 있으면 참이다', () => {
    expect(isSundayMaple('썬데이 메이플')).toBe(true)
    expect(isSundayMaple('스페셜 썬데이 메이플')).toBe(true)
    expect(isSundayMaple('썬 데이 메이플')).toBe(true)
    expect(isSundayMaple('  스페셜 썬데이 ')).toBe(true)
  })

  it('썬데이 가 없으면 거짓이다', () => {
    expect(isSundayMaple('넥슨 정기점검 안내')).toBe(false)
    expect(isSundayMaple('')).toBe(false)
  })
})
