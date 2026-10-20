import { judge, type PricePoint } from './fence'

/** KST 날짜와 시각으로 거래 시각을 만든다. */
function at(day: string, time = '12:00'): Date {
  return new Date(`${day}T${time}:00+09:00`)
}

function point(id: string, priceMeso: number, pricedAt: Date): PricePoint {
  return { id, priceMeso, pricedAt }
}

function verdicts(points: PricePoint[]): Record<string, string> {
  return Object.fromEntries(judge(points).map((j) => [j.id, j.verdict]))
}

describe('judge', () => {
  it('0 을 하나 더 친 값은 빠지고 나머지는 남는다', () => {
    // 2026-10-20 에오스 몽환의 벨트 실측값.
    const prices = [3_000_000_000, 3_600_000_000, 3_650_000_000, 3_700_000_000, 3_730_000_000, 3_877_777_777]
    const points = prices.map((p, i) => point(`ok${i}`, p, at('2026-10-17')))
    points.push(point('typo', 40_000_000_000, at('2026-10-17')))

    const result = verdicts(points)

    expect(result.typo).toBe('excluded')
    expect(Object.entries(result).filter(([id]) => id !== 'typo').map(([, v]) => v)).toEqual(
      Array(6).fill('included'),
    )
  })

  it('7일 표본이 4개 미만이면 30일로 넓혀 판정한다', () => {
    // 7일 안에는 셋뿐이고, 20일 전 줄까지 더하면 넷이 된다.
    const points = [
      point('old', 1_000, at('2026-09-30')),
      point('a', 1_000, at('2026-10-18')),
      point('b', 1_000, at('2026-10-19')),
      point('far', 10_000, at('2026-10-20')),
    ]

    expect(verdicts(points).far).toBe('excluded')
  })

  it('30일로 넓혀도 4개 미만이면 빼지 않고 pending 이다', () => {
    const points = [
      point('a', 1_000, at('2026-10-18')),
      point('b', 1_000, at('2026-10-19')),
      point('far', 10_000, at('2026-10-20')),
    ]

    expect(verdicts(points)).toEqual({ a: 'pending', b: 'pending', far: 'pending' })
  })

  it('표본은 그 줄의 거래일까지이고 뒤의 날은 안 본다', () => {
    // 10-01 줄은 그날까지 표본이 하나뿐이다. 뒤에 같은 값이 많이 와도 판단이 바뀌지 않는다.
    const points = [
      point('first', 5_000, at('2026-10-01')),
      ...[0, 1, 2, 3].map((i) => point(`later${i}`, 1_000, at('2026-10-02'))),
    ]

    expect(verdicts(points).first).toBe('pending')
  })

  it('같은 값이 몰려 IQR 이 0 이어도 중앙값 ±20% 안은 남는다', () => {
    const points = [0, 1, 2, 3, 4].map((i) => point(`same${i}`, 3_700_000_000, at('2026-10-17')))
    points.push(point('near', 3_800_000_000, at('2026-10-17')))
    points.push(point('far', 5_000_000_000, at('2026-10-17')))

    const result = verdicts(points)

    expect(result.near).toBe('included')
    expect(result.far).toBe('excluded')
  })

  it('KST 0시로 날을 가른다', () => {
    // 10-14 00:30 KST 는 UTC 로 10-13 이다. KST 로 갈라야 10-20 의 7일 표본에 들어 넷이 된다.
    const points = [
      point('edge', 1_000, at('2026-10-14', '00:30')),
      point('a', 1_000, at('2026-10-20')),
      point('b', 1_000, at('2026-10-20')),
      point('c', 1_000, at('2026-10-20')),
    ]

    const judged = judge(points).find((j) => j.id === 'c')

    expect(judged?.sampleDays).toBe(7)
  })

  it('판정마다 그 줄의 울타리를 함께 돌려준다', () => {
    const points = [1_000, 1_100, 1_200, 1_300].map((p, i) => point(`p${i}`, p, at('2026-10-17')))

    const judged = judge(points)[0]

    expect(judged?.fence).not.toBeNull()
    expect(judged?.fence?.low).toBeLessThan(1_000)
    expect(judged?.fence?.high).toBeGreaterThan(1_300)
  })
})
