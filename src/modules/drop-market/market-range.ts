import { shiftDay, type MarketRow } from './daily-reference'

/** 그날의 기준가와 울타리. 유지한 날은 유지한 값이다. 줄을 판정하고 줄이 떨어진 정도를 잴 때 쓴다. */
export interface RangeDay {
  ref: number
  low: number
  high: number
}

/** 범위의 두 끝. 메소 정수다. */
export interface MarketRange {
  q1: number
  q3: number
}

/** 범위의 폭을 내는 날 수. 그날과 앞의 6일이다. 하루 표는 3 ~ 6개라 한두 표가 25% · 75% 지점을 정한다. */
export const RANGE_DAYS = 7
/** 7일 표가 이보다 적으면 7일로 모아도 한두 표가 폭을 정해 범위를 내지 않는다. */
const MIN_VOTES = 8
/** 밀집도 무게의 폭. 로그 눈금이다. */
const DENSITY_WIDTH = Math.log(1.03)

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/**
 * 무게를 실은 분위수. 표마다 앞 표들의 무게에 자기 무게의 절반을 더한 몫을 자리로 삼아 표 사이를 곧게 나눈다.
 *
 * @param sorted 값 차례로 선 표
 */
function weightedQuantile(sorted: { value: number; weight: number }[], q: number): number {
  const total = sorted.reduce((s, v) => s + v.weight, 0)
  let acc = 0
  const at = sorted.map((v) => {
    const position = (acc + v.weight / 2) / total
    acc += v.weight
    return { position, value: v.value }
  })
  if (q <= at[0].position) return at[0].value
  for (let i = 1; i < at.length; i++) {
    if (q > at[i].position) continue
    const [a, b] = [at[i - 1], at[i]]
    return a.value + ((b.value - a.value) * (q - a.position)) / (b.position - a.position)
  }
  return at[at.length - 1].value
}

/**
 * 한 시세의 그날 범위. 위치는 그날 기준가이고, 폭은 7일 동안 울타리 안 줄이 저마다 자기 날 기준가에서 떨어진 정도다.
 * 사람마다 한 표로 접고, 다른 표와 몰린 표일수록 무게를 크게 둬 25% · 75% 지점을 낸다. 7일 표가 8개 미만이면 `null` 이다.
 *
 * @param input.rows 그 시세의 줄. 7일 밖의 줄은 세지 않는다
 * @param input.days 그 시세의 날마다 기준가와 울타리. 없는 날의 줄은 판단 보류라 세지 않는다
 * @param input.dummies `날짜|사람` 꼴의 더미 입력
 */
export function rangeOf(input: {
  day: string
  rows: MarketRow[]
  days: ReadonlyMap<string, RangeDay>
  dummies: ReadonlySet<string>
  weightOf: (person: string) => number
}): MarketRange | null {
  const today = input.days.get(input.day)
  if (today === undefined) return null
  const from = shiftDay(input.day, -(RANGE_DAYS - 1))
  const byPerson = new Map<string, Map<string, number[]>>()
  for (const r of input.rows) {
    const day = input.days.get(r.day)
    if (r.day < from || r.day > input.day || day === undefined) continue
    if (
      input.dummies.has(`${r.day}|${r.person}`) ||
      r.priceMeso < day.low ||
      r.priceMeso > day.high
    )
      continue
    const days = byPerson.get(r.person) ?? new Map<string, number[]>()
    days.set(r.day, [...(days.get(r.day) ?? []), Math.log(r.priceMeso / day.ref)])
    byPerson.set(r.person, days)
  }
  const votes: { value: number; trust: number }[] = []
  for (const [person, days] of byPerson) {
    const trust = input.weightOf(person)
    if (trust > 0) votes.push({ value: median([...days.values()].map(median)), trust })
  }
  if (votes.length < MIN_VOTES) return null
  const weighted = votes
    .map((v, i) => ({
      value: v.value,
      weight:
        v.trust *
        (1 +
          votes.reduce(
            (s, o, j) =>
              j === i ? s : s + Math.exp(-((v.value - o.value) ** 2) / (2 * DENSITY_WIDTH ** 2)),
            0,
          )),
    }))
    .sort((a, b) => a.value - b.value)
  return {
    q1: Math.round(today.ref * Math.exp(weightedQuantile(weighted, 0.25))),
    q3: Math.round(today.ref * Math.exp(weightedQuantile(weighted, 0.75))),
  }
}
