import { isPeriodBoundary, isPeriodText } from './period-boundary'

describe('isPeriodText', () => {
  it('KST 날짜 글자와 시각 붙은 글자를 받는다', () => {
    expect(isPeriodText('2026-10-22')).toBe(true)
    expect(isPeriodText('2026-09-17T10:00')).toBe(true)
  })

  it('모양이 틀리거나 없는 날짜는 거절한다', () => {
    expect(isPeriodText('2026-10')).toBe(false)
    expect(isPeriodText('2026-02-30')).toBe(false)
    expect(isPeriodText('2026-10-22T10')).toBe(false)
  })
})

describe('isPeriodBoundary', () => {
  // 2026-10-22 는 목요일, 2026-10-16 은 금요일이다.
  it('주간 · 시즌 보스는 목요일이어야 한다', () => {
    expect(isPeriodBoundary('2026-10-22', 'weekly')).toBe(true)
    expect(isPeriodBoundary('2026-10-22T10:00', 'event_weekly')).toBe(true)
    expect(isPeriodBoundary('2026-10-16', 'weekly')).toBe(false)
  })

  it('월간 보스는 1일이어야 한다', () => {
    expect(isPeriodBoundary('2026-11-01', 'monthly')).toBe(true)
    expect(isPeriodBoundary('2026-10-22', 'monthly')).toBe(false)
  })
})
