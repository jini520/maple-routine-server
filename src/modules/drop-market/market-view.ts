import { createHash } from 'node:crypto'

/** 그래프에 그릴 하루. 그날 거래가 있었는지는 싣지 않는다. 응답만 열어 봐도 거래가 적은 날이 드러나기 때문이다. */
export interface FilledPoint {
  date: string
  price: number
  low: number
  high: number
}

export type Grade = 'many' | 'normal' | 'few'

/** 최근 14일 중 이만큼 새 기준가가 서야 신뢰 시세다. 유지한 값이 많은 시세를 지금 시세처럼 보이지 않게 한다. */
const RELIABLE_FRESH_DAYS = 7

export function isReliable(freshDaysInLast14: number): boolean {
  return freshDaysInLast14 >= RELIABLE_FRESH_DAYS
}

/** 최근 7일 판 사람 수를 같은 목록 1위와 견준 등급. 비율이라 한 사람이 더해져도 거의 바뀌지 않는다. */
export function gradeOf(persons: number, leader: number): Grade {
  const ratio = leader === 0 ? 0 : persons / leader
  if (ratio >= 0.6) return 'many'
  if (ratio < 0.3) return 'few'
  return 'normal'
}

/**
 * 날마다의 기준가를 그래프 값으로 잇는다. 새 기준가가 없는 날(유지 · 비움)은 앞뒤 새 기준가 사이를 곧게 잇고, 마지막 새
 * 기준가 뒤는 그 값을 쓴다. 첫 새 기준가 앞의 날은 넣지 않는다.
 *
 * @param days 날짜 차례. `fresh` 는 그날 새 기준가가 섰는지
 */
export function fillSeries(
  days: { day: string; ref: number | null; q1: number | null; q3: number | null; fresh: boolean }[],
): FilledPoint[] {
  const anchors = days.map((d, i) => ({ d, i })).filter(({ d }) => d.fresh && d.ref !== null && d.q1 !== null && d.q3 !== null)
  if (anchors.length === 0) return []
  const out: FilledPoint[] = []
  for (let i = anchors[0].i; i < days.length; i++) {
    const before = [...anchors].reverse().find((a) => a.i <= i)
    const after = anchors.find((a) => a.i >= i)
    const at = (key: 'ref' | 'q1' | 'q3'): number => {
      const a = before?.d[key] as number
      if (after === undefined || after.i === before?.i) return a
      const t = (i - (before?.i ?? 0)) / (after.i - (before?.i ?? 0))
      return Math.round(a + ((after.d[key] as number) - a) * t)
    }
    out.push({ date: days[i].day, price: at('ref'), low: at('q1'), high: at('q3') })
  }
  return out
}

/** 키를 차례로 늘어놓은 JSON. 같은 값이면 누가 만들어도 같은 바이트다. */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`
  }
  return JSON.stringify(value)
}

/** 저장해 두고 그대로 돌려줄 응답. ETag 는 몸의 해시라 같은 몸이면 같다. */
export function toResponse(value: unknown): { body: string; etag: string } {
  const body = stableStringify(value)
  return { body, etag: `"${createHash('sha1').update(body).digest('hex')}"` }
}
