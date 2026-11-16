/** 바스켓 아이템의 범위 하나(장비는 거래권, 소비는 월드). 기준 기간의 기준가와 판 사람 수다. */
export interface BasketScope {
  scope: string
  basePrice: number
  persons: number
}

export interface BasketItem {
  /** 아이템과 반지 레벨 */
  key: string
  scopes: BasketScope[]
  /** 지수 안의 무게. 모두 더하면 1 */
  weight: number
  /** 이 날부터 지수에 든다. 출시 직후라 시세가 자리 잡지 않은 아이템을 늦게 넣는다 */
  entersOn: string | null
}

/** 기준 기간 = 이 값이다. */
export const BASE_VALUE = 10_000
/** 한 아이템이 지수를 혼자 움직이지 않게 하는 무게 상한 */
const WEIGHT_CAP = 0.2

/** 무게를 기준가 × 판 사람 수의 비중으로 매기고, 상한을 넘는 아이템을 잘라 나머지에 다시 나눈다. */
export function buildBasket(items: Omit<BasketItem, 'weight'>[]): BasketItem[] {
  const value = new Map(items.map((i) => [i.key, i.scopes.reduce((s, x) => s + x.basePrice * x.persons, 0)]))
  const total = [...value.values()].reduce((s, v) => s + v, 0)
  let weights = new Map([...value].map(([k, v]) => [k, v / total]))
  for (let round = 0; round < items.length; round++) {
    const capped = new Set([...weights].filter(([, w]) => w >= WEIGHT_CAP - 1e-12).map(([k]) => k))
    if (![...weights.values()].some((w) => w > WEIGHT_CAP + 1e-12)) break
    const rest = [...weights].filter(([k]) => !capped.has(k)).reduce((s, [, w]) => s + w, 0)
    const left = 1 - WEIGHT_CAP * capped.size
    weights = new Map([...weights].map(([k, w]) => [k, capped.has(k) ? WEIGHT_CAP : (w / rest) * left]))
  }
  return items.map((i) => ({ ...i, weight: weights.get(i.key) ?? 0 }))
}

/**
 * 그날 기준가 ÷ 기준 기간 기준가. 범위마다 구해 판 사람 수로 평균한다(로그 평균). 범위마다 가격 수준이 달라도 등락비는 같은
 * 단위라 섞을 수 있다. 들어오기 전이거나 기준가가 있는 범위가 없으면 `null` 이다.
 */
export function relativeOf(item: BasketItem, refOf: (scope: string) => number | null, day: string): number | null {
  if (item.entersOn !== null && day < item.entersOn) return null
  let num = 0
  let den = 0
  for (const s of item.scopes) {
    const ref = refOf(s.scope)
    if (ref === null || ref <= 0) continue
    num += s.persons * Math.log(ref / s.basePrice)
    den += s.persons
  }
  return den === 0 ? null : Math.exp(num / den)
}

/** 전날 지수에 곱할 비율. 이틀 모두 등락비가 있는 아이템으로만 세어, 아이템이 빠지거나 돌아와도 지수가 튀지 않는다. */
export function linkOf(
  weights: ReadonlyMap<string, number>,
  before: ReadonlyMap<string, number>,
  after: ReadonlyMap<string, number>,
): number | null {
  let num = 0
  let den = 0
  for (const [key, rel] of after) {
    const prev = before.get(key)
    const w = weights.get(key)
    if (prev === undefined || w === undefined) continue
    num += w * rel
    den += w * prev
  }
  return den === 0 ? null : num / den
}

/** 등락비가 있는 아이템만으로 센 그날의 지수. 기준 기간의 첫날에 이어 붙이는 시작값으로 쓴다. */
export function directIndex(basket: BasketItem[], relatives: ReadonlyMap<string, number>): number {
  let num = 0
  let den = 0
  for (const b of basket) {
    const rel = relatives.get(b.key)
    if (rel === undefined) continue
    num += b.weight * rel
    den += b.weight
  }
  return den === 0 ? BASE_VALUE : (BASE_VALUE * num) / den
}
