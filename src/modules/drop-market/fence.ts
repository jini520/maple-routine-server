import type { ReferenceSource } from './daily-reference'

/** 시세 하나(아이템 · 반지 레벨 · 범위)의 거래 한 줄. */
export interface PricePoint {
  id: string
  priceMeso: number
  /** 가격이 처음 적히거나 바뀐 시각. 거래 시각으로 쓴다. */
  pricedAt: Date
}

/** 판정할 줄. 더미 입력을 가리려고 사람을 함께 싣는다. */
export interface StoredPoint extends PricePoint {
  /** 넥슨 계정 · 메이플 ID · 사용자 id 중 줄에 있는 것의 앞쪽 */
  person: string
}

/** included 만 시세에 든다. pending 은 그날 울타리가 아직 없어 판단하지 않은 줄이다. */
export type Verdict = 'included' | 'pending' | 'excluded'

export interface Fence {
  low: number
  high: number
}

/** 그 줄을 판정한 근거. 울타리를 그날 표로 냈는지 · 3일 표로 냈는지 · 유지한 값인지, 또는 더미 입력이다. */
export type VerdictBasis = ReferenceSource | 'dummy'

export interface VerdictFields {
  verdict: Verdict
  /** 판정에 쓴 울타리. pending 은 null */
  fence: Fence | null
  basis: VerdictBasis | null
}

/** 판정을 붙인 줄. 줄의 다른 칸은 그대로 둔다. */
export type Judged<T = PricePoint> = T & VerdictFields

const DAY_MS = 86_400_000
const KST_OFFSET_MS = 9 * 3_600_000

/** KST 0시를 경계로 센 날 번호. 메이플의 하루가 그때 바뀐다. */
export function kstDayNumber(date: Date): number {
  return Math.floor((date.getTime() + KST_OFFSET_MS) / DAY_MS)
}

/** KST 날짜 글자. YYYY-MM-DD. */
export function kstDay(date: Date): string {
  return new Date(kstDayNumber(date) * DAY_MS).toISOString().slice(0, 10)
}

/**
 * 줄마다 하루 작업이 남긴 그날 울타리로 판정한다. 다시 계산하지 않아서 앱이 받는 기준가와 같은 근거다.
 * 그날 더미 입력을 한 사람의 줄은 제외이고, 그날 울타리가 없으면(아직 내지 않은 오늘 · 기준가가 빈 날) 판단 보류다.
 *
 * @param fences 그 시세의 날짜별 울타리
 * @param dummies `날짜|사람` 꼴의 더미 입력
 */
export function judgeStored<T extends StoredPoint>(
  points: T[],
  fences: ReadonlyMap<string, Fence & { source: ReferenceSource }>,
  dummies: ReadonlySet<string>,
): Judged<Omit<T, 'person'>>[] {
  return points.map(({ person, ...p }) => {
    const day = kstDay(p.pricedAt)
    const stored = fences.get(day)
    const fence = stored === undefined ? null : { low: stored.low, high: stored.high }
    if (dummies.has(`${day}|${person}`)) return { ...p, verdict: 'excluded', fence, basis: 'dummy' }
    if (stored === undefined) return { ...p, verdict: 'pending', fence: null, basis: null }
    const verdict = p.priceMeso < stored.low || p.priceMeso > stored.high ? 'excluded' : 'included'
    return { ...p, verdict, fence, basis: stored.source }
  })
}
