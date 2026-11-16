import { fillSeries, gradeOf, isReliable, toResponse, type FilledPoint } from './market-view'

describe('isReliable', () => {
  it('최근 14일 중 새 기준가가 선 날이 7일 이상이면 신뢰 시세다', () => {
    expect(isReliable(7)).toBe(true)
    expect(isReliable(6)).toBe(false)
  })
})

describe('gradeOf', () => {
  it('최근 7일 판 사람 수를 목록 1위와 견줘 60% 이상 많음 · 30% 미만 적음이다', () => {
    // 2026-11-15 장비 목록 실측: 1위 59명.
    expect(gradeOf(40, 59)).toBe('many')
    expect(gradeOf(20, 59)).toBe('normal')
    expect(gradeOf(10, 59)).toBe('few')
    expect(gradeOf(59, 59)).toBe('many')
  })
})

describe('fillSeries', () => {
  const fresh = (day: string, ref: number) => ({ day, ref, q1: ref - 10, q3: ref + 10, fresh: true })
  const stale = (day: string, ref: number | null) => ({ day, ref, q1: ref, q3: ref, fresh: false })

  it('새 기준가가 없는 날은 앞뒤 새 기준가 사이를 곧게 잇는다. 유지한 값도 잇는 값으로 바뀐다', () => {
    const out = fillSeries([fresh('2026-11-01', 100), stale('2026-11-02', 100), stale('2026-11-03', null), fresh('2026-11-04', 130)])

    expect(out.map((p) => p.price)).toEqual([100, 110, 120, 130])
    expect(out.map((p) => p.low)).toEqual([90, 100, 110, 120])
  })

  it('마지막 새 기준가 뒤의 날은 그 값으로 잇고, 첫 새 기준가 앞의 날은 넣지 않는다', () => {
    const out = fillSeries([stale('2026-11-01', null), fresh('2026-11-02', 50), stale('2026-11-03', 50), stale('2026-11-04', null)])

    expect(out.map((p) => [p.date, p.price])).toEqual([['2026-11-02', 50], ['2026-11-03', 50], ['2026-11-04', 50]])
  })

  it('잇는 값에는 그날 거래가 있었는지 알 수 있는 칸이 없다', () => {
    const [point] = fillSeries([fresh('2026-11-01', 100)])

    expect(Object.keys(point).sort()).toEqual(['date', 'high', 'low', 'price'])
  })
})

describe('toResponse', () => {
  it('같은 값이면 몸과 ETag 가 바이트까지 같다', () => {
    const series: FilledPoint[] = [{ date: '2026-11-14', price: 1, low: 1, high: 1 }]
    const a = toResponse({ date: '2026-11-14', series })
    const b = toResponse({ series, date: '2026-11-14' })

    expect(a.body).toBe(b.body)
    expect(a.etag).toBe(b.etag)
    expect(a.etag).toMatch(/^"[0-9a-f]{40}"$/)
  })
})
