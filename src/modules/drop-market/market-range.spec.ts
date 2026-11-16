import type { MarketRow } from './daily-reference'
import { rangeOf, type RangeDay } from './market-range'

const EOK = 100_000_000
const DAY = '2026-11-12'
const WEEK = ['2026-11-06', '2026-11-07', '2026-11-08', '2026-11-09', '2026-11-10', '2026-11-11', DAY]

function row(person: string, day: string, priceMeso: number): MarketRow {
  return { person, day, priceMeso, item: 'item' }
}

function steady(ref: number): RangeDay {
  return { ref, low: ref * 0.8, high: ref * 1.2 }
}

const everyone: (person: string) => number = () => 1
const noDummies = new Set<string>()

/** 그날 기준가 30억에서 각 표가 로그 눈금으로 떨어진 거리. 사람마다 한 줄이다 */
function spread(devs: number[]): MarketRow[] {
  return devs.map((d, i) => row(`p${i}`, DAY, 30 * EOK * Math.exp(d)))
}

describe('rangeOf', () => {
  it('범위는 그날 기준가에 서고, 폭은 7일 표가 저마다 자기 날 기준가에서 떨어진 정도다', () => {
    // 기준가가 30억에서 24억으로 내리는 주. 날마다 두 사람이 그날 기준가의 99% · 101% 에 판다.
    // 7일 줄을 가격 그대로 모으면 범위가 24억 ~ 30억에 퍼져 그날 기준가 24억을 따르지 못한다.
    const days = new Map(WEEK.map((d, i) => [d, steady((30 - i) * EOK)]))
    const rows = WEEK.flatMap((d, i) => [row(`${d}-a`, d, (30 - i) * EOK * 0.99), row(`${d}-b`, d, (30 - i) * EOK * 1.01)])

    expect(rangeOf({ day: DAY, rows, days, dummies: noDummies, weightOf: everyone })).toEqual({
      q1: Math.round(24 * EOK * 0.99),
      q3: Math.round(24 * EOK * 1.01),
    })
  })

  it('7일 표가 8개 미만이면 범위가 없다. 한 사람이 여러 날 · 여러 줄을 적어도 한 표다', () => {
    const days = new Map(WEEK.map((d) => [d, steady(30 * EOK)]))
    const seven = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].flatMap((p) => WEEK.slice(0, 3).map((d) => row(p, d, 30 * EOK)))
    const eighth = [...seven, row('h', DAY, 30 * EOK)]
    const range = (rows: MarketRow[], weightOf = everyone) => rangeOf({ day: DAY, rows, days, dummies: noDummies, weightOf })

    expect(range(seven)).toBeNull()
    expect(range(eighth)).not.toBeNull()
    // 신뢰도 무게가 0 인 사람은 표를 내지 못한다.
    expect(range(eighth, (p) => (p === 'h' ? 0 : 1))).toBeNull()
  })

  it('울타리 밖 · 더미 입력 · 기준가가 없는 날의 줄은 세지 않는다', () => {
    const days = new Map(WEEK.filter((d) => d !== '2026-11-08').map((d) => [d, steady(30 * EOK)]))
    const rows = [
      ...['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((p) => row(p, DAY, 30 * EOK)),
      row('typo', DAY, 300 * EOK),
      row('dummy', DAY, 30 * EOK),
      row('pending', '2026-11-08', 30 * EOK),
    ]

    expect(rangeOf({ day: DAY, rows, days, dummies: new Set([`${DAY}|dummy`]), weightOf: everyone })).toBeNull()
  })

  it('혼자 동떨어진 표는 무게가 작아 범위 끝을 끌지 못한다', () => {
    // 2026-11-12 신념의 연마석(스카니아)처럼 몰린 표 위에 두 표가 15% · 20% 떨어져 있다.
    // 표 차례의 75% 지점으로 내면 위 끝이 기준가보다 5% 넘게 올라간다. 울타리는 그날 표가 흩어져 넓어진 실측값이다.
    const days = new Map([[DAY, { ref: 30 * EOK, low: 22.87 * EOK, high: 37.74 * EOK }]])
    const range = rangeOf({
      day: DAY,
      rows: spread([-0.02, -0.01, 0, 0, 0.01, 0.02, 0.15, 0.2]),
      days,
      dummies: noDummies,
      weightOf: everyone,
    })

    expect(range?.q3).toBeLessThan(30 * EOK * 1.02)
    expect(range?.q1).toBeGreaterThan(30 * EOK * 0.98)
  })

  it('신뢰도 무게가 절반인 표는 반만 센다', () => {
    const days = new Map([[DAY, steady(30 * EOK)]])
    const rows = spread([-0.03, -0.02, -0.01, 0, 0, 0.01, 0.02, 0.03])
    const full = rangeOf({ day: DAY, rows, days, dummies: noDummies, weightOf: everyone })
    // 기준가보다 높게 판 세 사람(p5 · p6 · p7)의 무게를 절반으로 하면 위 끝이 내려온다.
    const half = rangeOf({ day: DAY, rows, days, dummies: noDummies, weightOf: (p) => (['p5', 'p6', 'p7'].includes(p) ? 0.5 : 1) })

    expect(half?.q3).toBeLessThan(full?.q3 as number)
  })
})
