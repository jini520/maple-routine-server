/** 시세 하나(아이템 · 반지 레벨 · 범위)의 줄 하나. 거래일은 KST 날짜(YYYY-MM-DD)다. */
export interface MarketRow {
  /** 사람을 가르는 값. 넥슨 계정 · 메이플 ID · 사용자 id 중 있는 것의 앞쪽 */
  person: string
  day: string
  priceMeso: number
  /** 아이템. 더미 입력은 아이템이 다른 줄끼리 같은 가격을 본다 */
  item: string
}

export interface Vote {
  value: number
  weight: number
}

/** 기준가의 근거. 응답에는 싣지 않는다. 거래가 적은 날이 드러나기 때문이다. */
export type ReferenceSource = 'today' | 'three_day' | 'carry'

export interface DayReference {
  day: string
  source: ReferenceSource
  /** 기준가. 울타리 안 표의 무게 중앙값 */
  ref: number
  /** 범위의 두 끝. 7일 표로 따로 낸다(market-range). 모자라면 `null` 이다 */
  q1: number | null
  q3: number | null
  /** 울타리. 그날 줄의 판정에 쓴다 */
  low: number
  high: number
  /** 표를 낸 사람 수(울타리 전) */
  voters: number
  /** 마지막 새 기준가의 날. 유지 중이면 그 값을 처음 낸 날이다 */
  freshDay: string
}

export interface Judgement {
  judged: number
  excluded: number
}

const DAY_MS = 86_400_000
/** 같은 값이 몰려 MAD 가 0 이 돼도 이 폭은 남긴다. 조금만 다른 정상 값까지 빠지지 않게 하려는 것이다. */
const MIN_LOW = Math.log(0.8)
const MIN_HIGH = Math.log(1.2)
/** 서로 다른 3명의 중앙값은 나머지 두 사람 값 사이에 머문다. 한 사람이 혼자 기준가를 끌 수 없는 가장 작은 수다. */
const MIN_VOTERS = 3
/** 합의가 없을 때 마지막 새 기준가를 두는 날 수. 넘으면 비운다. 기한이 없으면 시세가 무너지는 동안 옛 값이 남는다. */
const CARRY_DAYS = 3
const TRUST_MIN_JUDGED = 5

function dayNumber(day: string): number {
  return Date.parse(`${day}T00:00:00Z`) / DAY_MS
}

/** `day` 에서 `n` 일 앞의 날. */
export function shiftDay(day: string, n: number): string {
  return new Date((dayNumber(day) + n) * DAY_MS).toISOString().slice(0, 10)
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/**
 * 사람마다 한 표. 날마다 그 사람 줄의 중앙값을 내고, 여러 날이면 그 값들의 중앙값으로 접는다.
 * 무게가 0 인 사람은 표를 내지 못한다.
 */
export function votesOf(
  rows: MarketRow[],
  weightOf: (person: string) => number,
): Map<string, Vote> {
  const byPerson = new Map<string, Map<string, number[]>>()
  for (const r of rows) {
    const days = byPerson.get(r.person) ?? new Map<string, number[]>()
    days.set(r.day, [...(days.get(r.day) ?? []), r.priceMeso])
    byPerson.set(r.person, days)
  }
  const votes = new Map<string, Vote>()
  for (const [person, days] of byPerson) {
    const weight = weightOf(person)
    if (weight <= 0) continue
    votes.set(person, { value: median([...days.values()].map(median)), weight })
  }
  return votes
}

/** 로그 눈금의 울타리. 중앙값에서 3 × 1.4826 × MAD 까지이고, 중앙값의 80% ~ 120% 보다 좁아지지 않는다. */
export function logFence(values: number[]): { low: number; high: number } {
  const logs = values.map(Math.log)
  const m = median(logs)
  const mad = median(logs.map((x) => Math.abs(x - m))) * 1.4826
  return {
    low: Math.exp(Math.min(m - 3 * mad, m + MIN_LOW)),
    high: Math.exp(Math.max(m + 3 * mad, m + MIN_HIGH)),
  }
}

/** 무게를 실은 중앙값. 무게를 차례로 더해 절반에 처음 닿는 값이다. */
export function weightedMedian(votes: Vote[]): number {
  const sorted = [...votes].sort((a, b) => a.value - b.value)
  const total = sorted.reduce((s, v) => s + v.weight, 0)
  let acc = 0
  for (const v of sorted) {
    acc += v.weight
    if (acc >= total / 2) return v.value
  }
  return sorted[sorted.length - 1].value
}

/** 표들이 합의했는가. 중앙값 80% ~ 120% 안에 3명 이상이 모였거나, 중앙값이 앞 기준가의 80% ~ 120% 안이다. */
export function agreed(values: number[], previous: number | null): boolean {
  const m = median(values)
  if (values.filter((v) => v >= 0.8 * m && v <= 1.2 * m).length >= MIN_VOTERS) return true
  return previous !== null && m >= 0.8 * previous && m <= 1.2 * previous
}

/** 표들로 낸 기준가 · 울타리. 범위는 비워 두고 market-range 가 채운다. MASPI 의 기준 기간 기준가도 이것으로 낸다. */
export function referenceFromVotes(
  day: string,
  source: ReferenceSource,
  votes: Map<string, Vote>,
): DayReference {
  const all = [...votes.values()]
  const fence = logFence(all.map((v) => v.value))
  const inside = all.filter((v) => v.value >= fence.low && v.value <= fence.high)
  return {
    day,
    source,
    ref: Math.round(weightedMedian(inside)),
    q1: null,
    q3: null,
    low: fence.low,
    high: fence.high,
    voters: all.length,
    freshDay: day,
  }
}

/**
 * 한 시세의 그날 기준가. 그날 3명 이상이 합의하면 그날 표, 아니면 3일 표로 같은 검사를 하고, 그래도 안 되면 마지막 새
 * 기준가를 3일까지 둔다. 그 뒤는 `null` 이다.
 *
 * @param input.rows 그 시세의 줄. 적어도 그날까지 3일치. 더미 입력으로 뺀 줄은 미리 걸러 둔다
 * @param input.previous 앞날까지 마지막으로 낸 기준가(유지 포함)
 */
export function referenceOf(input: {
  day: string
  rows: MarketRow[]
  previous: DayReference | null
  weightOf: (person: string) => number
}): DayReference | null {
  const { day, rows, weightOf } = input
  const usable =
    input.previous !== null && dayNumber(day) - dayNumber(input.previous.freshDay) <= CARRY_DAYS
      ? input.previous
      : null
  const windows: [ReferenceSource, number][] = [
    ['today', 1],
    ['three_day', 3],
  ]
  for (const [source, span] of windows) {
    const from = shiftDay(day, -(span - 1))
    const votes = votesOf(
      rows.filter((r) => r.day >= from && r.day <= day),
      weightOf,
    )
    if (votes.size < MIN_VOTERS) continue
    if (
      !agreed(
        [...votes.values()].map((v) => v.value),
        usable?.ref ?? null,
      )
    )
      continue
    return referenceFromVotes(day, source, votes)
  }
  return usable === null ? null : { ...usable, day, source: 'carry' }
}

/** 지난 30일 판정으로 정한 표의 무게. 잘못 적기를 되풀이하는 사람이 기준가를 흔들지 못하게 한다. */
export function trustWeight(j: Judgement): number {
  if (j.judged < TRUST_MIN_JUDGED) return 1
  const rate = j.excluded / j.judged
  if (rate >= 0.5) return 0
  if (rate >= 0.3) return 0.5
  return 1
}

/** 같은 날 아이템 3개 이상에 같은 가격을 적었고 그 값이 아이템마다 울타리 밖인 사람. */
export function dummyPersons(
  rows: { person: string; market: string; item: string; priceMeso: number }[],
  fences: Map<string, { low: number; high: number }>,
): Set<string> {
  const outside = new Map<string, Map<number, Set<string>>>()
  for (const r of rows) {
    const f = fences.get(r.market)
    if (f === undefined || (r.priceMeso >= f.low && r.priceMeso <= f.high)) continue
    const byPrice = outside.get(r.person) ?? new Map<number, Set<string>>()
    byPrice.set(r.priceMeso, (byPrice.get(r.priceMeso) ?? new Set()).add(r.item))
    outside.set(r.person, byPrice)
  }
  const out = new Set<string>()
  for (const [person, byPrice] of outside) {
    if ([...byPrice.values()].some((items) => items.size >= 3)) out.add(person)
  }
  return out
}

/**
 * 하루치 계산. 모든 시세의 그날 기준가와, 그날 더미 입력을 한 사람, 사람마다 그날 판정 수를 낸다.
 *
 * @param input.rowsByMarket 시세마다 그날까지 3일치 줄. 앞날들에 더미 입력으로 뺀 줄은 미리 걸러 둔다
 * @param input.previous 시세마다 앞날까지 마지막으로 낸 기준가
 * @param input.judgements 사람마다 그날보다 앞선 30일의 판정 수
 */
export function runDay(input: {
  day: string
  rowsByMarket: Map<string, MarketRow[]>
  previous: Map<string, DayReference>
  judgements: Map<string, Judgement>
}): {
  references: Map<string, DayReference | null>
  dummies: Set<string>
  judged: Map<string, Judgement>
} {
  const { day, rowsByMarket } = input
  const weightOf = (person: string): number =>
    trustWeight(input.judgements.get(person) ?? { judged: 0, excluded: 0 })
  const compute = (market: string, rows: MarketRow[]): DayReference | null =>
    referenceOf({ day, rows, previous: input.previous.get(market) ?? null, weightOf })

  const references = new Map<string, DayReference | null>()
  for (const [market, rows] of rowsByMarket) references.set(market, compute(market, rows))

  const fences = new Map<string, { low: number; high: number }>()
  for (const [market, ref] of references) if (ref !== null) fences.set(market, ref)
  const todayRows = [...rowsByMarket].flatMap(([market, rows]) =>
    rows.filter((r) => r.day === day).map((r) => ({ ...r, market })),
  )
  const dummies = dummyPersons(todayRows, fences)

  if (dummies.size > 0) {
    for (const [market, rows] of rowsByMarket) {
      if (!rows.some((r) => r.day === day && dummies.has(r.person))) continue
      references.set(
        market,
        compute(
          market,
          rows.filter((r) => !(r.day === day && dummies.has(r.person))),
        ),
      )
    }
  }

  const judged = new Map<string, Judgement>()
  const add = (person: string, excluded: boolean): void => {
    const j = judged.get(person) ?? { judged: 0, excluded: 0 }
    judged.set(person, { judged: j.judged + 1, excluded: j.excluded + (excluded ? 1 : 0) })
  }
  for (const [market, rows] of rowsByMarket) {
    const ref = references.get(market)
    const today = rows.filter((r) => r.day === day)
    for (const person of new Set(today.map((r) => r.person))) {
      if (dummies.has(person)) {
        add(person, true)
        continue
      }
      if (ref === null || ref === undefined) continue
      const value = median(today.filter((r) => r.person === person).map((r) => r.priceMeso))
      add(person, value < ref.low || value > ref.high)
    }
  }
  return { references, dummies, judged }
}
