import {
  delta,
  hourGrid,
  kstDays,
  kstWeekday,
  periodEndingYesterday,
  previousOf,
  weekdayStats,
} from './usage-dashboard'

describe('대시보드 기간', () => {
  // 오늘을 넣으면 마지막 막대가 늘 줄어든 것처럼 보인다.
  it('오늘을 빼고 한국 시각 어제까지 센다', () => {
    const range = periodEndingYesterday(28, new Date('2026-12-09T03:00:00Z'))

    expect(range).toEqual({
      since: new Date('2026-11-10T15:00:00Z'),
      until: new Date('2026-12-08T15:00:00Z'),
    })
    const days = kstDays(range)
    expect(days).toHaveLength(28)
    expect(days[0]).toBe('2026-11-11')
    expect(days[27]).toBe('2026-12-08')
  })

  // UTC 로 자르면 한국 시각 0시 ~ 9시에는 어제가 하루 밀린다.
  it('한국 시각 자정을 넘기면 하루가 넘어가고, 넘기기 전에는 넘어가지 않는다', () => {
    const before = periodEndingYesterday(1, new Date('2026-12-08T14:59:00Z'))
    const after = periodEndingYesterday(1, new Date('2026-12-08T15:00:00Z'))

    expect(kstDays(before)).toEqual(['2026-12-07'])
    expect(kstDays(after)).toEqual(['2026-12-08'])
  })

  it('앞 기간은 바로 앞의 같은 길이다', () => {
    const range = periodEndingYesterday(7, new Date('2026-12-09T03:00:00Z'))

    expect(kstDays(previousOf(range))).toEqual([
      '2026-11-25',
      '2026-11-26',
      '2026-11-27',
      '2026-11-28',
      '2026-11-29',
      '2026-11-30',
      '2026-12-01',
    ])
  })

  it('앞 기간에 사건이 없으면 증감을 비운다', () => {
    expect(delta(10, 0, false)).toBeNull()
    expect(delta(10, 14, true)).toBe(-4)
  })
})

describe('요일별', () => {
  it('요일은 월요일이 0, 일요일이 6 이다', () => {
    expect(kstWeekday('2026-11-09')).toBe(0)
    expect(kstWeekday('2026-11-15')).toBe(6)
  })

  it('요일마다 평균 · 가장 적은 날 · 가장 많은 날을 내고, 기간에 없는 요일은 비운다', () => {
    const stats = weekdayStats([
      { day: '2026-11-11', value: 200 },
      { day: '2026-11-18', value: 260 },
      { day: '2026-11-12', value: 300 },
    ])

    expect(stats[2]).toEqual({ weekday: 2, avg: 230, min: 200, max: 260 })
    expect(stats[3]).toEqual({ weekday: 3, avg: 300, min: 300, max: 300 })
    expect(stats[0]).toEqual({ weekday: 0, avg: null, min: null, max: null })
  })

  // 10일이면 수 · 목 · 금은 두 번, 나머지는 한 번 든다. 합계를 그대로 두면 그 요일이 부풀어 보인다.
  it('시간대 칸은 그 요일이 기간에 든 날 수로 나눈다', () => {
    const days = kstDays({
      since: new Date('2026-11-10T15:00:00Z'),
      until: new Date('2026-11-20T15:00:00Z'),
    })
    const grid = hourGrid(
      [
        { weekday: 2, hour: 21, visits: 10 },
        { weekday: 0, hour: 21, visits: 10 },
      ],
      days,
    )

    expect(grid).toHaveLength(7)
    expect(grid[2][21]).toBe(5)
    expect(grid[0][21]).toBe(10)
    expect(grid[1][3]).toBe(0)
  })
})
