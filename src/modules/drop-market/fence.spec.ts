import { judgeStored, type StoredPoint } from './fence'

const EOK = 100_000_000

/** KST 날짜와 시각으로 거래 시각을 만든다. */
function at(day: string, time = '12:00'): Date {
  return new Date(`${day}T${time}:00+09:00`)
}

function point(id: string, priceMeso: number, day: string, person = 'u:a'): StoredPoint {
  return { id, priceMeso, pricedAt: at(day), person }
}

const fences = new Map([
  ['2026-11-12', { low: 7 * EOK, high: 9 * EOK, source: 'today' as const }],
  ['2026-11-13', { low: 7 * EOK, high: 9 * EOK, source: 'carry' as const }],
])

describe('judgeStored', () => {
  it('그날 하루 작업이 남긴 울타리 안이면 포함, 밖이면 제외다', () => {
    const judged = judgeStored(
      [point('in', 8 * EOK, '2026-11-12'), point('typo', 80 * EOK, '2026-11-12')],
      fences,
      new Set(),
    )

    expect(judged.map((j) => [j.id, j.verdict, j.basis])).toEqual([
      ['in', 'included', 'today'],
      ['typo', 'excluded', 'today'],
    ])
  })

  it('유지한 날은 마지막 새 기준가의 울타리로 판정한다', () => {
    const [j] = judgeStored([point('late', 1, '2026-11-13')], fences, new Set())

    expect(j).toMatchObject({
      verdict: 'excluded',
      basis: 'carry',
      fence: { low: 7 * EOK, high: 9 * EOK },
    })
  })

  it('그날 울타리가 아직 없으면(오늘 줄 · 기준가가 빈 날) 판단 보류이고 기준가에 넣지 않는다', () => {
    const [j] = judgeStored([point('today', 8 * EOK, '2026-11-14')], fences, new Set())

    expect(j).toMatchObject({ verdict: 'pending', fence: null, basis: null })
  })

  it('그날 더미 입력을 한 사람의 줄은 울타리 안이어도 제외다', () => {
    const [j] = judgeStored(
      [point('dummy', 8 * EOK, '2026-11-12', 'u:x')],
      fences,
      new Set(['2026-11-12|u:x']),
    )

    expect(j).toMatchObject({ verdict: 'excluded', basis: 'dummy' })
  })
})
