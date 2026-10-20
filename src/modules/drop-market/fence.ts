/** 시세 하나(아이템 · 반지 레벨 · 월드 묶음)의 거래 한 줄. */
export interface PricePoint {
  id: string
  priceMeso: number
  /** 가격이 처음 적히거나 바뀐 시각. 거래 시각으로 쓴다. */
  pricedAt: Date
}

/** included 와 pending 은 시세에 들고 excluded 만 빠진다. pending 은 표본이 모자라 판단하지 않은 줄이다. */
export type Verdict = 'included' | 'pending' | 'excluded'

export interface Fence {
  low: number
  high: number
}

export interface Judged extends PricePoint {
  verdict: Verdict
  /** 판정에 쓴 울타리. pending 은 null. */
  fence: Fence | null
  /** 판정에 쓴 표본의 날 수(7 · 30). pending 은 null. */
  sampleDays: 7 | 30 | null
}

const DAY_MS = 86_400_000
const KST_OFFSET_MS = 9 * 3_600_000
/** 사분위수가 서는 최소 표본. */
const MIN_SAMPLE = 4
/** 같은 값이 몰려 IQR 이 0 이 되면 조금만 다른 정상 값도 빠진다. 울타리는 중앙값의 이 비율보다 좁아지지 않는다. */
const MIN_SPREAD = 0.2

/** KST 0시를 경계로 센 날 번호. 메이플의 하루가 그때 바뀐다. */
export function kstDayNumber(date: Date): number {
  return Math.floor((date.getTime() + KST_OFFSET_MS) / DAY_MS)
}

/** KST 날짜 글자. YYYY-MM-DD. */
export function kstDay(date: Date): string {
  return new Date(kstDayNumber(date) * DAY_MS).toISOString().slice(0, 10)
}

/** 정렬된 배열의 분위수. Postgres percentile_cont 와 같은 선형 보간이다. */
function quantile(sorted: number[], q: number): number {
  const pos = (sorted.length - 1) * q
  const lower = Math.floor(pos)
  const upper = Math.ceil(pos)
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (pos - lower)
}

function fenceOf(prices: number[]): Fence {
  const sorted = [...prices].sort((a, b) => a - b)
  const q1 = quantile(sorted, 0.25)
  const median = quantile(sorted, 0.5)
  const q3 = quantile(sorted, 0.75)
  const iqr = q3 - q1
  return {
    low: Math.min(q1 - 1.5 * iqr, median * (1 - MIN_SPREAD)),
    high: Math.max(q3 + 1.5 * iqr, median * (1 + MIN_SPREAD)),
  }
}

/**
 * 줄마다 시세에 넣을지 판정한다. 표본은 같은 시세의 줄 중 그 줄의 거래일까지 7일이고, 4개 미만이면 30일, 그래도 모자라면 pending 이다.
 * 뒤의 날은 표본에 안 넣는다. 새 줄이 들어와도 지난 날의 판정이 바뀌지 않게 하기 위해서다.
 *
 * @param points 시세 하나의 줄. 차례는 상관없다
 */
export function judge(points: PricePoint[]): Judged[] {
  const days = points.map((p) => kstDayNumber(p.pricedAt))
  return points.map((p, i) => {
    const day = days[i]
    for (const sampleDays of [7, 30] as const) {
      const sample = points.filter((_, j) => days[j] <= day && days[j] > day - sampleDays)
      if (sample.length < MIN_SAMPLE) continue
      const fence = fenceOf(sample.map((s) => s.priceMeso))
      const verdict = p.priceMeso < fence.low || p.priceMeso > fence.high ? 'excluded' : 'included'
      return { ...p, verdict, fence, sampleDays }
    }
    return { ...p, verdict: 'pending', fence: null, sampleDays: null }
  })
}
