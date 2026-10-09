import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  parseDropPrice,
  saveDropPrice,
  withdrawDropPrice,
  type DropPrice,
  type DropPriceDeps,
} from './drop-prices.ts'

const ME = '11111111-1111-4111-8111-111111111111'
const SOMEONE = '22222222-2222-4222-8222-222222222222'
const RECORD = '33333333-3333-4333-8333-333333333333'

function body(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    dropRecordId: RECORD,
    itemKey: 'ring-restraint',
    priceMeso: 10_000_000_000,
    periodKey: '2026-10-15',
    worldKey: 'challengers_2',
    ringLevel: 4,
    slot: 'ring',
    ...over,
  }
}

function price(over: Partial<DropPrice> = {}): DropPrice {
  return {
    dropRecordId: RECORD,
    itemKey: 'ring-restraint',
    priceMeso: 10_000_000_000,
    periodKey: '2026-10-15',
    worldKey: 'challengers_2',
    ringLevel: 4,
    slot: 'ring',
    ...over,
  }
}

/**
 * 부른 것을 적는 가짜. 유효한 줄이 없는 상태가 기본이다.
 *
 * **기록은 감싸는 쪽이 한다.** `...over` 로 함수를 덮으면 그 안의 `calls.push` 가 함께 사라져,
 * 덮은 테스트에서는 부른 순서를 단언할 수 없다(이 파일을 쓸 때 실제로 그렇게 걸렸다).
 */
function fakeDeps(over: Partial<DropPriceDeps> = {}): DropPriceDeps & {
  calls: string[]
  seen: unknown[]
} {
  const calls: string[] = []
  const seen: unknown[] = []
  const base: DropPriceDeps = {
    currentDropPrice: async () => null,
    supersedeDropPrice: async () => undefined,
    insertDropPrice: async () => undefined,
    ...over,
  }
  return {
    calls,
    seen,
    currentDropPrice: async (dropRecordId) => {
      calls.push('current')
      seen.push(dropRecordId)
      return base.currentDropPrice(dropRecordId)
    },
    supersedeDropPrice: async (dropRecordId) => {
      calls.push('supersede')
      seen.push(dropRecordId)
      return base.supersedeDropPrice(dropRecordId)
    },
    insertDropPrice: async (userId, one) => {
      calls.push('insert')
      seen.push({ userId, one })
      return base.insertDropPrice(userId, one)
    },
  }
}

describe('본문 읽기', () => {
  it('계약을 지킨 본문을 통과시킨다', () => {
    assert.deepEqual(parseDropPrice(body()), price())
  })

  it('월드 · 반지 레벨 · 슬롯은 없어도 된다', () => {
    const got = parseDropPrice(body({ worldKey: null, ringLevel: null, slot: null }))
    assert.deepEqual(got, price({ worldKey: null, ringLevel: null, slot: null }))
  })

  it('아예 빠진 칸은 null 로 읽는다', () => {
    // 옛 앱이 칸을 안 실어 보낼 수 있다. 없는 것과 모르는 것이 같은 뜻이다.
    const { worldKey: _w, ringLevel: _r, slot: _s, ...rest } = body()
    assert.deepEqual(parseDropPrice(rest), price({ worldKey: null, ringLevel: null, slot: null }))
  })

  it('기록 식별자가 uuid 가 아니면 거부한다', () => {
    assert.equal(parseDropPrice(body({ dropRecordId: 'not-a-uuid' })), null)
    assert.equal(parseDropPrice(body({ dropRecordId: '' })), null)
  })

  it('아이템 key 가 비면 거부한다', () => {
    // 빈 key 를 받으면 분포에 축이 없는 표본이 쌓인다.
    assert.equal(parseDropPrice(body({ itemKey: '' })), null)
    assert.equal(parseDropPrice(body({ itemKey: 42 })), null)
  })

  it('가격이 양의 정수가 아니면 거부한다', () => {
    assert.equal(parseDropPrice(body({ priceMeso: 0 })), null)
    assert.equal(parseDropPrice(body({ priceMeso: -1 })), null)
    assert.equal(parseDropPrice(body({ priceMeso: 1.5 })), null)
    assert.equal(parseDropPrice(body({ priceMeso: '10' })), null)
    // 안전 정수를 넘으면 자리값이 이미 틀어져 있다.
    assert.equal(parseDropPrice(body({ priceMeso: Number.MAX_SAFE_INTEGER + 2 })), null)
  })

  it('기간 열쇠는 주간 모양과 월간 모양만 받는다', () => {
    assert.ok(parseDropPrice(body({ periodKey: '2026-10' })) !== null)
    assert.equal(parseDropPrice(body({ periodKey: '2026' })), null)
    assert.equal(parseDropPrice(body({ periodKey: '2026-13-01' })), null)
    assert.equal(parseDropPrice(body({ periodKey: '26-10-15' })), null)
  })

  it('본문이 객체가 아니면 거부한다', () => {
    assert.equal(parseDropPrice(null), null)
    assert.equal(parseDropPrice('가격'), null)
    assert.equal(parseDropPrice([]), null)
  })
})

describe('가격 저장', () => {
  it('유효한 줄이 없으면 그냥 넣는다', async () => {
    const deps = fakeDeps()

    assert.equal(await saveDropPrice(deps, ME, price()), 'inserted')
    assert.deepEqual(deps.calls, ['current', 'insert'])
    assert.deepEqual(deps.seen[1], { userId: ME, one: price() })
  })

  it('가격이 바뀌었으면 옛 줄을 덮고 새 줄을 넣는다', async () => {
    const deps = fakeDeps({
      currentDropPrice: async () => ({ userId: ME, priceMeso: 10_000_000_000 }),
    })

    assert.equal(await saveDropPrice(deps, ME, price({ priceMeso: 3_000_000_000 })), 'inserted')
    // 덮기가 넣기보다 먼저여야 한다. 반대로 하면 유효한 줄이 둘인 순간이 생겨 유일 인덱스가 막는다.
    assert.deepEqual(deps.calls, ['current', 'supersede', 'insert'])
  })

  it('같은 가격이 다시 오면 아무것도 안 한다', async () => {
    // 응답만 유실돼 기기가 다시 보내는 경우다. 줄이 늘면 한 기록이 분포에 두 번 센다.
    const deps = fakeDeps({
      currentDropPrice: async () => ({ userId: ME, priceMeso: 10_000_000_000 }),
    })

    assert.equal(await saveDropPrice(deps, ME, price()), 'unchanged')
    assert.deepEqual(deps.calls, ['current'])
  })

  it('남의 기록이면 아무것도 안 한다', async () => {
    // uuid 를 맞혀도 남의 표본을 못 덮는다. 제약으로는 못 막는 자리다.
    const deps = fakeDeps({
      currentDropPrice: async () => ({ userId: SOMEONE, priceMeso: 10_000_000_000 }),
    })

    assert.equal(await saveDropPrice(deps, ME, price({ priceMeso: 1 })), 'not_mine')
    assert.deepEqual(deps.calls, ['current'])
  })

  it('가격이 같아도 남의 기록이면 남의 기록이라고 답한다', async () => {
    // `unchanged` 로 뭉치면 남의 uuid 를 맞혔을 때 그 가격까지 알아낼 수 있다.
    const deps = fakeDeps({
      currentDropPrice: async () => ({ userId: SOMEONE, priceMeso: 10_000_000_000 }),
    })

    assert.equal(await saveDropPrice(deps, ME, price()), 'not_mine')
  })
})

describe('가격 거두기', () => {
  it('유효한 줄을 덮는다. 줄을 지우지 않는다', async () => {
    const deps = fakeDeps({
      currentDropPrice: async () => ({ userId: ME, priceMeso: 10_000_000_000 }),
    })

    assert.equal(await withdrawDropPrice(deps, ME, RECORD), 'withdrawn')
    assert.deepEqual(deps.calls, ['current', 'supersede'])
  })

  it('이미 거둔 기록이면 아무것도 안 한다', async () => {
    const deps = fakeDeps()

    assert.equal(await withdrawDropPrice(deps, ME, RECORD), 'unchanged')
    assert.deepEqual(deps.calls, ['current'])
  })

  it('남의 기록은 못 거둔다', async () => {
    const deps = fakeDeps({
      currentDropPrice: async () => ({ userId: SOMEONE, priceMeso: 1 }),
    })

    assert.equal(await withdrawDropPrice(deps, ME, RECORD), 'not_mine')
    assert.deepEqual(deps.calls, ['current'])
  })

  it('기록 식별자가 uuid 가 아니면 DB 를 안 건드린다', async () => {
    const deps = fakeDeps()

    assert.equal(await withdrawDropPrice(deps, ME, 'not-a-uuid'), 'not_mine')
    assert.deepEqual(deps.calls, [])
  })
})
