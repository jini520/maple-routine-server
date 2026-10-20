import { type Judged, kstDay, kstDayNumber } from './fence'

const DAY_MS = 86_400_000

/** 봉 하나. excluded 를 뺀 줄로 만든다. */
export interface Candle {
  /** 기간의 첫날. KST YYYY-MM-DD. 주봉은 그 주의 목요일이다. */
  day: string
  open: number
  high: number
  low: number
  close: number
  count: number
}

/** 한눈에 보는 화면의 한 줄. 오늘 거래가 없으면 금일 값은 null 이다. */
export interface MarketSummary {
  /** excluded 가 아닌 줄 중 가장 늦은 거래의 가격. */
  lastPrice: number | null
  lastPricedAt: Date | null
  todayLow: number | null
  todayHigh: number | null
  todayCount: number
  /** 최근 거래가 - 그 거래일 앞의 마지막 종가. 앞선 봉이 없으면 null. */
  change: number | null
  /** 최근 30일 동안 excluded 로 판정된 줄 수. */
  excludedCount: number
}

function byPricedAt(a: Judged, b: Judged): number {
  return a.pricedAt.getTime() - b.pricedAt.getTime()
}

/** 거래가 없는 기간은 봉이 없다. 앞 봉의 종가로 채우면 없던 거래가 있는 것처럼 보인다. */
function candlesBy(rows: Judged[], periodStart: (pricedAt: Date) => string): Candle[] {
  const candles: Candle[] = []
  for (const row of rows.filter((r) => r.verdict !== 'excluded').sort(byPricedAt)) {
    const day = periodStart(row.pricedAt)
    const last = candles.at(-1)
    if (last?.day === day) {
      last.high = Math.max(last.high, row.priceMeso)
      last.low = Math.min(last.low, row.priceMeso)
      last.close = row.priceMeso
      last.count += 1
    } else {
      const p = row.priceMeso
      candles.push({ day, open: p, high: p, low: p, close: p, count: 1 })
    }
  }
  return candles
}

export function dailyCandles(rows: Judged[]): Candle[] {
  return candlesBy(rows, kstDay)
}

/** 메이플 주간 초기화가 목요일 0시(KST)다. 날 번호 0 인 1970-01-01 이 목요일이라 7 로 나누면 목요일에서 끊긴다. */
export function weeklyCandles(rows: Judged[]): Candle[] {
  return candlesBy(rows, (pricedAt) => {
    const thursday = Math.floor(kstDayNumber(pricedAt) / 7) * 7
    return new Date(thursday * DAY_MS).toISOString().slice(0, 10)
  })
}

/** 시세 하나를 한 줄로 줄인다. */
export function summarize(rows: Judged[], now: Date): MarketSummary {
  const candles = dailyCandles(rows)
  const today = kstDay(now)
  const todayCandle = candles.at(-1)?.day === today ? candles.at(-1) : undefined
  const last = rows.filter((r) => r.verdict !== 'excluded').sort(byPricedAt).at(-1)
  const previous = candles.at(-2)
  const nowDay = kstDayNumber(now)
  return {
    lastPrice: last?.priceMeso ?? null,
    lastPricedAt: last?.pricedAt ?? null,
    todayLow: todayCandle?.low ?? null,
    todayHigh: todayCandle?.high ?? null,
    todayCount: todayCandle?.count ?? 0,
    change: last !== undefined && previous !== undefined ? last.priceMeso - previous.close : null,
    excludedCount: rows.filter(
      (r) => r.verdict === 'excluded' && kstDayNumber(r.pricedAt) > nowDay - 30,
    ).length,
  }
}
