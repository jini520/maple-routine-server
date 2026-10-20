import { dailyCandles, summarize } from './candles'
import type { Judged } from './fence'

function at(day: string, time = '12:00'): Date {
  return new Date(`${day}T${time}:00+09:00`)
}

function judged(
  id: string,
  priceMeso: number,
  pricedAt: Date,
  verdict: Judged['verdict'] = 'included',
): Judged {
  return { id, priceMeso, pricedAt, verdict, fence: null, sampleDays: null }
}

describe('dailyCandles', () => {
  it('시가 · 종가는 거래 시각 차례이고 excluded 는 봉에 안 들어간다', () => {
    const rows = [
      judged('close', 120, at('2026-10-17', '22:00')),
      judged('open', 100, at('2026-10-17', '09:00')),
      judged('typo', 9_999, at('2026-10-17', '15:00'), 'excluded'),
      judged('mid', 80, at('2026-10-17', '13:00'), 'pending'),
    ]

    expect(dailyCandles(rows)).toEqual([
      { day: '2026-10-17', open: 100, high: 120, low: 80, close: 120, count: 3 },
    ])
  })

  it('KST 0시로 날이 갈리고 거래가 없는 날은 봉이 없다', () => {
    const rows = [
      judged('a', 100, at('2026-10-15', '23:59')),
      judged('b', 200, at('2026-10-16', '00:01')),
      judged('c', 300, at('2026-10-18')),
    ]

    expect(dailyCandles(rows).map((c) => c.day)).toEqual(['2026-10-15', '2026-10-16', '2026-10-18'])
  })
})

describe('summarize', () => {
  const now = at('2026-10-20', '18:00')

  it('오늘 거래가 없으면 금일 값은 비우고 최근 거래가는 보인다', () => {
    const summary = summarize([judged('a', 100, at('2026-10-18'))], now)

    expect(summary.lastPrice).toBe(100)
    expect(summary.todayLow).toBeNull()
    expect(summary.todayHigh).toBeNull()
    expect(summary.todayCount).toBe(0)
  })

  it('전일 대비는 최근 거래일 앞의 마지막 종가와 비교하고 excluded 는 안 본다', () => {
    const rows = [
      judged('prev', 100, at('2026-10-17', '20:00')),
      judged('prev-typo', 1_000, at('2026-10-17', '23:00'), 'excluded'),
      judged('today1', 130, at('2026-10-20', '09:00')),
      judged('today2', 110, at('2026-10-20', '10:00')),
      judged('today-typo', 5, at('2026-10-20', '11:00'), 'excluded'),
    ]

    const summary = summarize(rows, now)

    expect(summary).toMatchObject({
      lastPrice: 110,
      todayLow: 110,
      todayHigh: 130,
      todayCount: 2,
      change: 10,
      excludedCount: 2,
    })
  })

  it('앞선 봉이 없으면 전일 대비를 비운다', () => {
    const summary = summarize([judged('a', 100, at('2026-10-20', '09:00'))], now)

    expect(summary.change).toBeNull()
  })
})
