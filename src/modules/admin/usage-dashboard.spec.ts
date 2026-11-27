import {
  delta,
  heatScale,
  hourGrid,
  kstDays,
  kstWeekday,
  periodEndingToday,
  previousOf,
  weekdayStats,
} from './usage-dashboard'

describe('대시보드 기간', () => {
  // 오늘도 다른 날과 똑같이 센다(사용자 지정). 오늘 값은 새로고침할 때마다 늘어난다.
  it('한국 시각 오늘까지 센다', () => {
    const range = periodEndingToday(28, new Date('2026-12-09T03:00:00Z'))

    expect(range).toEqual({
      since: new Date('2026-11-11T15:00:00Z'),
      until: new Date('2026-12-09T15:00:00Z'),
    })
    const days = kstDays(range)
    expect(days).toHaveLength(28)
    expect(days[0]).toBe('2026-11-12')
    expect(days[27]).toBe('2026-12-09')
  })

  // UTC 로 자르면 한국 시각 0시 ~ 9시에는 오늘이 하루 밀린다.
  it('한국 시각 자정을 넘기면 하루가 넘어가고, 넘기기 전에는 넘어가지 않는다', () => {
    const before = periodEndingToday(1, new Date('2026-12-08T14:59:00Z'))
    const after = periodEndingToday(1, new Date('2026-12-08T15:00:00Z'))

    expect(kstDays(before)).toEqual(['2026-12-08'])
    expect(kstDays(after)).toEqual(['2026-12-09'])
  })

  it('앞 기간은 바로 앞의 같은 길이다', () => {
    const range = periodEndingToday(7, new Date('2026-12-09T03:00:00Z'))

    expect(kstDays(previousOf(range))).toEqual([
      '2026-11-26',
      '2026-11-27',
      '2026-11-28',
      '2026-11-29',
      '2026-11-30',
      '2026-12-01',
      '2026-12-02',
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

describe('요일 · 시간대 칸의 색 단계', () => {
  /** 7 × 24 칸을 0 으로 채우고 values 를 앞 칸부터 넣는다. */
  function gridOf(values: number[]): number[][] {
    const grid = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0))
    values.forEach((v, i) => (grid[Math.floor(i / 24)][i % 24] = v))
    return grid
  }

  // 다섯 등분하면 방문이 있는 칸의 20% 가 늘 가장 진해 관대하다. 윗단을 좁혀 정말 붐비는 칸만 진하게 남긴다.
  it('방문이 있는 칸을 하위 50% · 75% · 90% · 97% 에서 끊어, 가장 진한 단계는 상위 3% 뿐이다', () => {
    const values = Array.from({ length: 100 }, (_, i) => i + 1)
    const { levels } = heatScale(gridOf(values))

    const counts = [0, 0, 0, 0, 0, 0]
    levels.flat().forEach((l, i) => i < values.length && (counts[l] += 1))
    expect(counts).toEqual([0, 50, 25, 15, 7, 3])
  })

  // 가장 많은 칸으로 나누면 알림 시각에 몰린 칸 하나가 나머지를 모두 가장 옅은 단계로 밀어낸다.
  it('몰린 칸 하나가 있어도 나머지 칸이 순위대로 단계를 받는다', () => {
    const values = [...Array.from({ length: 19 }, (_, i) => i + 1), 500]
    const { levels } = heatScale(gridOf(values))

    expect(levels[0].slice(0, 20)).toEqual([
      1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 3, 3, 3, 4, 5,
    ])
  })

  it('0 인 칸은 0 단계이고, 같은 값은 같은 단계다', () => {
    const { levels } = heatScale(gridOf([3, 3, 3, 1]))

    expect(levels[0][0]).toBe(levels[0][1])
    expect(levels[0][1]).toBe(levels[0][2])
    expect(levels[0][0]).toBe(5)
    expect(levels[0][3]).toBe(1)
    expect(levels[6][23]).toBe(0)
  })

  it('범례는 단계마다 든 칸의 값 범위이고, 든 칸이 없는 단계는 비운다', () => {
    const { steps } = heatScale(gridOf([3, 3, 3, 1]))

    expect(steps).toEqual([
      { min: 0, max: 0 },
      { min: 1, max: 1 },
      null,
      null,
      null,
      { min: 3, max: 3 },
    ])
  })

  it('방문이 하나도 없으면 모든 칸이 0 단계이고 1 ~ 5 단계는 비운다', () => {
    const { levels, steps } = heatScale(gridOf([]))

    expect(new Set(levels.flat())).toEqual(new Set([0]))
    expect(steps).toEqual([{ min: 0, max: 0 }, null, null, null, null, null])
  })
})
