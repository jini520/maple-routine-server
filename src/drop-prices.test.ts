import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  deleteDropPrice,
  parseDropPrice,
  saveDropPrice,
  type DropPrice,
  type DropPriceDeps,
} from './drop-prices.ts'

const ME = '11111111-1111-4111-8111-111111111111'
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
 * 부른 것을 적는 가짜. 손댄 줄 수를 테스트가 정한다.
 *
 * **기록은 감싸는 쪽이 한다.** `...over` 로 함수를 덮으면 그 안의 `calls.push` 가 함께 사라져,
 * 덮은 테스트에서는 부른 순서를 단언할 수 없다.
 */
function fakeDeps(over: Partial<DropPriceDeps> = {}): DropPriceDeps & {
  calls: string[]
  seen: unknown[]
} {
  const calls: string[] = []
  const seen: unknown[] = []
  const base: DropPriceDeps = {
    upsertDropPrice: async () => 1,
    deleteDropPrice: async () => 1,
    ...over,
  }
  return {
    calls,
    seen,
    upsertDropPrice: async (userId, one) => {
      calls.push('upsert')
      seen.push({ userId, one })
      return base.upsertDropPrice(userId, one)
    },
    deleteDropPrice: async (userId, dropRecordId) => {
      calls.push('delete')
      seen.push({ userId, dropRecordId })
      return base.deleteDropPrice(userId, dropRecordId)
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
  it('한 문장으로 넣거나 덮어쓴다', async () => {
    const deps = fakeDeps()

    assert.equal(await saveDropPrice(deps, ME, price()), 'saved')
    // 읽어서 비교한 뒤 쓰지 않는다. 그 사이에 다른 요청이 끼면 둘이 서로를 덮는다.
    assert.deepEqual(deps.calls, ['upsert'])
    assert.deepEqual(deps.seen[0], { userId: ME, one: price() })
  })

  it('같은 값이 다시 와도 그냥 덮어쓴다', async () => {
    // 줄을 쌓던 시절에는 이 구분이 「줄이 하나 더 생기나」를 갈랐다. 이제는 결과가 같다.
    const deps = fakeDeps()

    assert.equal(await saveDropPrice(deps, ME, price()), 'saved')
    assert.deepEqual(deps.calls, ['upsert'])
  })

  it('남의 기록이면 손댄 줄이 0 이고 그것이 답이다', async () => {
    // uuid 를 맞혀도 남의 표본을 못 덮는다. 제약이 아니라 문장이 막는 자리다.
    const deps = fakeDeps({ upsertDropPrice: async () => 0 })

    assert.equal(await saveDropPrice(deps, ME, price()), 'not_mine')
  })
})

describe('가격 빼기', () => {
  it('손댄 줄이 있으면 뺐다고 답한다', async () => {
    const deps = fakeDeps()

    assert.equal(await deleteDropPrice(deps, ME, RECORD), 'deleted')
    assert.deepEqual(deps.calls, ['delete'])
    assert.deepEqual(deps.seen[0], { userId: ME, dropRecordId: RECORD })
  })

  it('없는 기록 · 이미 뺀 기록 · 남의 기록이 모두 unchanged 다', async () => {
    // 셋 다 손댄 줄이 0 이고, 앱이 할 수 있는 일이 셋 다 없어 가르지 않는다.
    const deps = fakeDeps({ deleteDropPrice: async () => 0 })

    assert.equal(await deleteDropPrice(deps, ME, RECORD), 'unchanged')
  })

  it('기록 식별자가 uuid 가 아니면 DB 를 안 건드린다', async () => {
    const deps = fakeDeps()

    assert.equal(await deleteDropPrice(deps, ME, 'not-a-uuid'), 'unchanged')
    assert.deepEqual(deps.calls, [])
  })
})
