import { buildBasket, directIndex, linkOf, relativeOf, type BasketItem } from './market-index'

describe('buildBasket', () => {
  it('무게는 기준가 × 판 사람 수의 비중이고 한 아이템이 20% 를 넘으면 잘라 나머지에 나눈다', () => {
    const basket = buildBasket([
      { key: 'big', scopes: [{ scope: 'general', basePrice: 900, persons: 10 }], entersOn: null },
      ...['a', 'b', 'c', 'd', 'e'].map((k) => ({ key: k, scopes: [{ scope: 'general', basePrice: 100, persons: 10 }], entersOn: null })),
    ])

    const weights = Object.fromEntries(basket.map((b) => [b.key, b.weight]))
    expect(weights.big).toBeCloseTo(0.2)
    expect(weights.a).toBeCloseTo(0.16)
    expect(basket.reduce((s, b) => s + b.weight, 0)).toBeCloseTo(1)
  })
})

describe('relativeOf', () => {
  it('월드마다 등락비를 구해 판 사람 수로 평균한다. 가격 수준이 달라도 섞인다', () => {
    const item: BasketItem = {
      key: 'life', weight: 1, entersOn: null,
      scopes: [{ scope: 'elysium', basePrice: 800, persons: 30 }, { scope: 'eos', basePrice: 400, persons: 10 }],
    }

    expect(relativeOf(item, (s) => (s === 'elysium' ? 880 : 440), '2026-11-14')).toBeCloseTo(1.1)
  })

  it('들어오는 날 전에는 등락비가 없다', () => {
    const ether: BasketItem = { key: 'ether', weight: 1, entersOn: '2026-11-01', scopes: [{ scope: 'w', basePrice: 4, persons: 9 }] }

    expect(relativeOf(ether, () => 2, '2026-10-31')).toBeNull()
    expect(relativeOf(ether, () => 2, '2026-11-01')).toBeCloseTo(0.5)
  })
})

describe('linkOf', () => {
  it('이틀 다 등락비가 있는 아이템으로만 이어 붙여, 아이템이 들어오거나 빠져도 지수가 튀지 않는다', () => {
    const weights = new Map([['a', 0.5], ['b', 0.5]])
    const before = new Map([['a', 1.0]])
    const after = new Map([['a', 1.1], ['b', 0.3]])

    expect(linkOf(weights, before, after)).toBeCloseTo(1.1)
  })

  it('이틀에 함께 있는 아이템이 없으면 이을 수 없다', () => {
    expect(linkOf(new Map([['a', 1]]), new Map([['a', 1]]), new Map())).toBeNull()
  })
})

describe('directIndex', () => {
  it('기준 기간 값이면 10,000 이다', () => {
    const basket = buildBasket([
      { key: 'a', scopes: [{ scope: 'g', basePrice: 10, persons: 5 }], entersOn: null },
      { key: 'b', scopes: [{ scope: 'g', basePrice: 20, persons: 5 }], entersOn: null },
    ])

    expect(directIndex(basket, new Map([['a', 1], ['b', 1]]))).toBeCloseTo(10000)
  })
})
