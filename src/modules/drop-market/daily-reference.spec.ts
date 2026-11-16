import {
  agreed,
  dummyPersons,
  logFence,
  referenceOf,
  runDay,
  trustWeight,
  votesOf,
  weightedMedian,
  type DayReference,
  type MarketRow,
} from './daily-reference'

const EOK = 100_000_000

function row(person: string, day: string, priceMeso: number, item = 'item'): MarketRow {
  return { person, day, priceMeso, item }
}

const everyone = (): number => 1

describe('votesOf', () => {
  it('한 사람이 하루에 여러 줄을 적어도 그 사람의 중앙값 한 표다', () => {
    const votes = votesOf(
      [row('a', '2026-11-12', 8 * EOK), row('a', '2026-11-12', 8 * EOK), row('a', '2026-11-12', 9 * EOK), row('b', '2026-11-12', 7 * EOK)],
      everyone,
    )

    expect(votes.size).toBe(2)
    expect(votes.get('a')?.value).toBe(8 * EOK)
  })

  it('여러 날을 함께 보면 날마다의 중앙값을 다시 중앙값으로 접는다', () => {
    // 하루에 줄을 많이 적은 날이 그 사람의 표를 혼자 정하지 못한다.
    const votes = votesOf(
      [row('a', '2026-11-10', 2 * EOK), row('a', '2026-11-11', 6 * EOK), row('a', '2026-11-11', 6 * EOK), row('a', '2026-11-11', 6 * EOK)],
      everyone,
    )

    expect(votes.get('a')?.value).toBe(4 * EOK)
  })

  it('무게가 0 인 사람은 표를 내지 못한다', () => {
    const votes = votesOf([row('a', '2026-11-12', EOK), row('b', '2026-11-12', EOK)], (p) => (p === 'b' ? 0 : 1))

    expect([...votes.keys()]).toEqual(['a'])
  })
})

describe('logFence', () => {
  it('0 을 하나 더 친 값과 덜 친 값 · 1메소가 울타리 밖이다', () => {
    // 2026-10-20 몽환의 벨트 실측값 근처.
    const fence = logFence([36, 37, 37, 38, 39].map((v) => v * EOK))

    expect(400 * EOK).toBeGreaterThan(fence.high)
    expect(3.7 * EOK).toBeLessThan(fence.low)
    expect(1).toBeLessThan(fence.low)
  })

  it('같은 값이 몰려도 중앙값의 80% ~ 120% 는 울타리 안이다', () => {
    const fence = logFence([37, 37, 37, 37, 37].map((v) => v * EOK))

    expect(fence.low).toBeLessThanOrEqual(37 * EOK * 0.8 + 1)
    expect(fence.high).toBeGreaterThanOrEqual(37 * EOK * 1.2 - 1)
  })
})

describe('weightedMedian', () => {
  it('무게 절반인 표는 반만 센다', () => {
    // 무게를 그대로 세면 11 이 가운데이고, 절반짜리 둘을 반으로 세면 10 이 가운데다.
    expect(weightedMedian([{ value: 10, weight: 1 }, { value: 11, weight: 0.5 }, { value: 12, weight: 0.5 }])).toBe(10)
  })
})

describe('agreed', () => {
  it('중앙값 80% ~ 120% 안에 3명이 모이면 앞 기준가와 멀어도 합의다', () => {
    expect(agreed([10 * EOK, 10.2 * EOK, 9.8 * EOK], 13.5 * EOK)).toBe(true)
  })

  it('셋 중 둘이 동떨어지고 중앙값도 앞 기준가와 멀면 합의가 아니다', () => {
    // 2026-10-31 1단계 소울 에테르(크로아) 실측. 그 주 시세는 2.4억 근처였다.
    expect(agreed([6.5 * EOK, 4.0 * EOK, 1.9 * EOK], 2.44 * EOK)).toBe(false)
  })

  it('흩어져 있어도 중앙값이 앞 기준가의 80% ~ 120% 안이면 합의다', () => {
    expect(agreed([3 * EOK, 8 * EOK, 30 * EOK], 7.5 * EOK)).toBe(true)
  })
})

describe('referenceOf', () => {
  const previous = (day: string, ref: number, source: DayReference['source'] = 'today'): DayReference => ({
    day, source, ref, q1: ref, q3: ref, low: ref * 0.8, high: ref * 1.2, voters: 3, freshDay: day,
  })

  it('이벤트로 3명이 새 값에 모이면 그날 바로 새 기준가가 된다', () => {
    const rows = [row('a', '2026-11-05', 11 * EOK), row('b', '2026-11-05', 11.2 * EOK), row('c', '2026-11-05', 10.8 * EOK)]

    const ref = referenceOf({ day: '2026-11-05', rows, previous: previous('2026-11-04', 13.5 * EOK), weightOf: everyone })

    expect(ref?.source).toBe('today')
    expect(ref?.ref).toBe(11 * EOK)
  })

  it('그날 표가 합의하지 않으면 3일 표로 다시 본다', () => {
    const rows = [
      row('a', '2026-10-29', 3.1 * EOK), row('b', '2026-10-29', 2.4 * EOK), row('c', '2026-10-30', 2.8 * EOK),
      row('d', '2026-10-30', 2.4 * EOK), row('e', '2026-10-31', 6.5 * EOK), row('f', '2026-10-31', 4.0 * EOK),
      row('g', '2026-10-31', 1.9 * EOK),
    ]

    const ref = referenceOf({ day: '2026-10-31', rows, previous: previous('2026-10-30', 2.44 * EOK), weightOf: everyone })

    expect(ref?.source).toBe('three_day')
    expect(ref?.ref).toBeLessThan(3.2 * EOK)
  })

  it('합의가 없으면 마지막 새 기준가를 3일까지 두고 4일째에 비운다', () => {
    const last = previous('2026-11-01', 5 * EOK)
    const lonely = [row('a', '2026-11-04', 9 * EOK)]

    const day3 = referenceOf({ day: '2026-11-04', rows: lonely, previous: { ...last, day: '2026-11-03', source: 'carry' }, weightOf: everyone })
    const day4 = referenceOf({ day: '2026-11-05', rows: [], previous: day3, weightOf: everyone })

    expect(day3).toMatchObject({ source: 'carry', ref: 5 * EOK, freshDay: '2026-11-01' })
    expect(day4).toBeNull()
  })

  it('비운 뒤에는 앞 기준가 없이 3명이 모여야 다시 선다', () => {
    const rows = [row('a', '2026-11-10', 2 * EOK), row('b', '2026-11-10', 6 * EOK), row('c', '2026-11-10', 30 * EOK)]

    expect(referenceOf({ day: '2026-11-10', rows, previous: previous('2026-11-01', 6 * EOK), weightOf: everyone })).toBeNull()
  })
})

describe('trustWeight', () => {
  it('판정이 5개 미만이면 무게를 깎지 않는다', () => {
    expect(trustWeight({ judged: 4, excluded: 4 })).toBe(1)
  })

  it('빠진 비율이 30% 이상이면 절반, 50% 이상이면 0 이다', () => {
    expect(trustWeight({ judged: 10, excluded: 2 })).toBe(1)
    expect(trustWeight({ judged: 10, excluded: 3 })).toBe(0.5)
    expect(trustWeight({ judged: 10, excluded: 5 })).toBe(0)
  })
})

describe('dummyPersons', () => {
  const fences = new Map([
    ['eyepatch', { low: 22 * EOK, high: 34 * EOK }],
    ['ether1', { low: 1.6 * EOK, high: 2.4 * EOK }],
    ['faith', { low: 24 * EOK, high: 36 * EOK }],
    ['ether4', { low: 25 * EOK, high: 36 * EOK }],
  ])

  it('같은 가격을 아이템 셋에 적었고 셋 다 울타리 밖이면 더미 입력이다', () => {
    // 2026-11-09 실측: 2억 ~ 50억인 아이템들을 모두 10억으로 적었다.
    const rows = [
      { person: 'x', market: 'eyepatch', item: 'eyepatch', priceMeso: 10 * EOK },
      { person: 'x', market: 'ether1', item: 'ether1', priceMeso: 10 * EOK },
      { person: 'x', market: 'faith', item: 'faith', priceMeso: 10 * EOK },
    ]

    expect([...dummyPersons(rows, fences)]).toEqual(['x'])
  })

  it('같은 가격이어도 아이템마다 울타리 안이면 정상 기록이다', () => {
    // 시세가 30억 근처인 아이템 셋에 30억을 적은 정상 기록이 있었다.
    const rows = ['eyepatch', 'faith', 'ether4'].map((m) => ({ person: 'y', market: m, item: m, priceMeso: 30 * EOK }))

    expect(dummyPersons(rows, fences).size).toBe(0)
  })
})

describe('runDay', () => {
  it('더미 입력을 한 사람의 그날 표는 기준가에서 빠지고 모두 빠진 판정으로 남는다', () => {
    const day = '2026-11-09'
    const honest = (market: string, value: number) => ['a', 'b', 'c'].map((p) => ({ ...row(p, day, value, market), market }))
    const rowsByMarket = new Map([
      ['eyepatch', [...honest('eyepatch', 27 * EOK), { ...row('x', day, 10 * EOK, 'eyepatch'), market: 'eyepatch' }]],
      ['ether1', [...honest('ether1', 2 * EOK), { ...row('x', day, 10 * EOK, 'ether1'), market: 'ether1' }]],
      ['faith', [...honest('faith', 29 * EOK), { ...row('x', day, 10 * EOK, 'faith'), market: 'faith' }]],
    ])

    const result = runDay({ day, rowsByMarket, previous: new Map(), judgements: new Map() })

    expect([...result.dummies]).toEqual(['x'])
    expect(result.references.get('ether1')?.voters).toBe(3)
    expect(result.judged.get('x')).toEqual({ judged: 3, excluded: 3 })
    expect(result.judged.get('a')).toEqual({ judged: 3, excluded: 0 })
  })

  it('지난 30일 판정으로 무게 0 이 된 사람의 표는 기준가를 움직이지 않는다', () => {
    const day = '2026-11-12'
    const rows = [
      ...['a', 'b', 'c'].map((p) => ({ ...row(p, day, 8 * EOK, 'life'), market: 'life' })),
      ...['w1', 'w2'].map((p) => ({ ...row(p, day, 7.5 * EOK, 'life'), market: 'life' })),
      ...['bad1', 'bad2', 'bad3'].map((p) => ({ ...row(p, day, 7 * EOK, 'life'), market: 'life' })),
    ]
    const judgements = new Map(['bad1', 'bad2', 'bad3'].map((p) => [p, { judged: 10, excluded: 6 }]))

    const result = runDay({ day, rowsByMarket: new Map([['life', rows]]), previous: new Map(), judgements })

    expect(result.references.get('life')?.ref).toBe(8 * EOK)
    expect(result.references.get('life')?.voters).toBe(5)
  })
})
