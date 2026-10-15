import { dropPriceBody } from './drop-prices.dto'

const ok = {
  dropRecordId: '0f1e2d3c-4b5a-4978-8a9b-0c1d2e3f4a5b',
  itemKey: 'ring-of-restraint',
  priceMeso: 1_000_000,
  periodKey: '2026-10-08',
  worldKey: 'scania',
  ringLevel: 4,
  slot: null,
}

describe('dropPriceBody', () => {
  it('앱이 보내는 모양을 받는다. 월간 periodKey 도 된다', () => {
    expect(dropPriceBody.safeParse(ok).success).toBe(true)
    expect(dropPriceBody.safeParse({ ...ok, periodKey: '2026-10' }).success).toBe(true)
  })

  it('nullable 셋은 null 도 빠진 것도 받는다', () => {
    const parsed = dropPriceBody.parse({
      dropRecordId: ok.dropRecordId,
      itemKey: ok.itemKey,
      priceMeso: 1,
      periodKey: '2026-10',
    })
    expect(parsed.worldKey ?? null).toBeNull()
    expect(parsed.ringLevel ?? null).toBeNull()
    expect(parsed.slot ?? null).toBeNull()
  })

  it('가격은 1 이상의 안전한 정수다', () => {
    expect(dropPriceBody.safeParse({ ...ok, priceMeso: 0 }).success).toBe(false)
    expect(dropPriceBody.safeParse({ ...ok, priceMeso: 1.5 }).success).toBe(false)
    expect(dropPriceBody.safeParse({ ...ok, priceMeso: Number.MAX_SAFE_INTEGER }).success).toBe(
      true,
    )
    expect(dropPriceBody.safeParse({ ...ok, priceMeso: 2 ** 53 }).success).toBe(false)
  })

  it('기록 id 와 기간 키의 모양을 본다', () => {
    expect(dropPriceBody.safeParse({ ...ok, dropRecordId: 'not-a-uuid' }).success).toBe(false)
    expect(dropPriceBody.safeParse({ ...ok, periodKey: '2026-10-08T00' }).success).toBe(false)
    expect(dropPriceBody.safeParse({ ...ok, itemKey: '' }).success).toBe(false)
  })
})
