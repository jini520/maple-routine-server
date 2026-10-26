import { dropPriceBody } from './drop-prices.dto'

const ok = {
  dropRecordId: '0f1e2d3c-4b5a-4978-8a9b-0c1d2e3f4a5b',
  itemKey: 'ring-of-restraint',
  priceMeso: 1_000_000,
  periodKey: '2026-10-08',
  worldKey: 'scania',
  ringLevel: 4,
  boss: 'lucid',
  difficulty: 'hard',
}

describe('dropPriceBody', () => {
  it('앱이 보내는 모양을 받는다. 월간 periodKey 도 된다', () => {
    expect(dropPriceBody.safeParse(ok).success).toBe(true)
    expect(dropPriceBody.safeParse({ ...ok, periodKey: '2026-10' }).success).toBe(true)
  })

  // 이 칸 둘이 생기기 전 OTA 가 둘 없이 보낸다. 거절하면 앱이 5회 뒤 그 건을 버린다.
  it('보스 · 난이도는 없어도 받는다', () => {
    const without: Record<string, unknown> = { ...ok }
    delete without.boss
    delete without.difficulty
    expect(dropPriceBody.safeParse(without).success).toBe(true)
    expect(dropPriceBody.safeParse({ ...ok, boss: '' }).success).toBe(false)
  })

  it('nullable 둘은 null 도 빠진 것도 받는다', () => {
    const parsed = dropPriceBody.parse({
      dropRecordId: ok.dropRecordId,
      itemKey: ok.itemKey,
      priceMeso: 1,
      periodKey: '2026-10',
    })
    expect(parsed.worldKey ?? null).toBeNull()
    expect(parsed.ringLevel ?? null).toBeNull()
  })

  // 이 칸이 생기기 전 OTA 는 안 보낸다. 거절하면 그 앱의 드롭이 5 회 뒤 버려진다.
  it('처치 기간 id 는 없어도 받고, 있으면 uuid 모양이어야 한다', () => {
    expect(
      dropPriceBody.safeParse({ ...ok, periodRecordId: '2f1e2d3c-4b5a-4978-8a9b-0c1d2e3f4a5b' })
        .success,
    ).toBe(true)
    expect(dropPriceBody.safeParse({ ...ok, periodRecordId: 'x' }).success).toBe(false)
  })

  it('가격은 1 이상의 안전한 정수다', () => {
    expect(dropPriceBody.safeParse({ ...ok, priceMeso: 0 }).success).toBe(false)
    expect(dropPriceBody.safeParse({ ...ok, priceMeso: 1.5 }).success).toBe(false)
    expect(dropPriceBody.safeParse({ ...ok, priceMeso: Number.MAX_SAFE_INTEGER }).success).toBe(
      true,
    )
    expect(dropPriceBody.safeParse({ ...ok, priceMeso: 2 ** 53 }).success).toBe(false)
  })

  // 이 칸이 생기기 전 OTA 는 가격만 보낸다. 그 전송은 전부 가격이 있는 기록이다.
  it('status 가 없으면 completed 다', () => {
    expect(dropPriceBody.parse(ok).status).toBe('completed')
  })

  it('pending · skipped 는 가격이 없어야 하고 completed 는 가격이 있어야 한다', () => {
    expect(dropPriceBody.safeParse({ ...ok, status: 'pending', priceMeso: null }).success).toBe(
      true,
    )
    const skipped: Record<string, unknown> = { ...ok, status: 'skipped' }
    delete skipped.priceMeso
    expect(dropPriceBody.safeParse(skipped).success).toBe(true)

    expect(dropPriceBody.safeParse({ ...ok, status: 'pending' }).success).toBe(false)
    expect(dropPriceBody.safeParse({ ...ok, status: 'completed', priceMeso: null }).success).toBe(
      false,
    )
    expect(dropPriceBody.safeParse({ ...ok, priceMeso: null }).success).toBe(false)
  })

  // 지우기는 DELETE 다. 본문으로 deleted 를 적으면 가격 줄을 만드는 요청이 지우기도 하게 된다.
  it('deleted 는 본문으로 못 보낸다', () => {
    expect(dropPriceBody.safeParse({ ...ok, status: 'deleted', priceMeso: null }).success).toBe(
      false,
    )
  })

  it('기록 id 와 기간 키의 모양을 본다', () => {
    expect(dropPriceBody.safeParse({ ...ok, dropRecordId: 'not-a-uuid' }).success).toBe(false)
    expect(dropPriceBody.safeParse({ ...ok, periodKey: '2026-10-08T00' }).success).toBe(false)
    expect(dropPriceBody.safeParse({ ...ok, itemKey: '' }).success).toBe(false)
  })
})
