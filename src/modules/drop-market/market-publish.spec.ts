import { randomUUID } from 'node:crypto'

import { eq, type AnyColumn } from 'drizzle-orm'

import { dropPrices, items, marketDays, marketJudgements, marketResponses, maspiDays, users, worlds } from '../../database/schema'
import { describeDb, openTestDb, type TestDb } from '../../database/test-db'
import { shiftDay } from './daily-reference'
import { MarketDailyRepository } from './market-daily.repository'
import { MarketPublishService } from './market-publish.service'

const EOK = 100_000_000

describeDb('MarketPublishService', () => {
  let db: TestDb
  let close: () => Promise<void>
  let truncate: () => Promise<void>
  let repo: MarketDailyRepository
  let service: MarketPublishService
  const item: Record<string, string> = {}
  const world: Record<string, string> = {}
  const person: Record<string, string> = {}

  async function trade(who: string, day: string, priceMeso: number, over: { itemKey?: string; world?: string; ringLevel?: number | null } = {}) {
    await db.insert(dropPrices).values({
      userId: person[who],
      dropRecordId: randomUUID(),
      identifiedBy: 'key',
      itemId: item[over.itemKey ?? 'ring'],
      priceMeso,
      recordStatus: 'completed',
      periodKey: '2026-10-22',
      worldId: world[over.world ?? 'scania'],
      ringLevel: over.ringLevel === undefined ? 4 : over.ringLevel,
      pricedAt: new Date(`${day}T12:00:00+09:00`),
    })
  }

  /** from ~ to 날마다 세 사람이 같은 값에 판다. 기준 기간에는 두 사람이 더 판다. */
  async function steadyMarket(from: string, to: string, price: number, over: { itemKey?: string; world?: string; ringLevel?: number | null } = {}) {
    for (let d = from; d <= to; d = shiftDay(d, 1)) {
      for (const who of ['a', 'b', 'c']) await trade(who, d, price, over)
      if (d <= '2026-10-28') for (const who of ['d', 'e']) await trade(who, d, price, over)
    }
  }

  /** from ~ to 날마다 여덟 사람이 기준가 둘레에 판다. 7일 표가 8개라 범위가 선다. */
  async function crowdMarket(from: string, to: string, price: number) {
    const spread = [0.99, 0.995, 1, 1, 1, 1.005, 1.01, 1.02]
    for (let d = from; d <= to; d = shiftDay(d, 1)) {
      for (const [i, who] of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].entries()) await trade(who, d, Math.round(price * spread[i]))
    }
  }

  beforeAll(async () => {
    ;({ db, close, truncate } = await openTestDb())
    repo = new MarketDailyRepository(db)
    service = new MarketPublishService(repo)
  })
  beforeEach(async () => {
    await truncate()
    for (const who of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'x']) {
      ;[{ id: person[who] }] = await db.insert(users).values({}).returning({ id: users.id })
    }
    const itemRows = await db
      .insert(items)
      .values([
        { key: 'ring', name: '반지', isDrop: true },
        { key: 'whetstone', name: '연마석', worldBound: true, isDrop: true },
      ])
      .returning({ id: items.id, key: items.key })
    for (const r of itemRows) item[r.key] = r.id
    const worldRows = await db
      .insert(worlds)
      .values([
        { key: 'scania', name: '스카니아', sortOrder: 0 },
        { key: 'eos', name: '에오스', sortOrder: 1, priceGroup: 'helios_eos' },
      ])
      .returning({ id: worlds.id, key: worlds.key })
    for (const r of worldRows) world[r.key] = r.id
  })
  afterAll(() => close())

  it('처음 채우면 기준 기간 첫날의 MASPI 가 10,000 이고, 응답에는 판 사람 수와 기준가의 근거가 없다', async () => {
    await steadyMarket('2026-10-22', '2026-11-05', 30 * EOK)
    await steadyMarket('2026-10-22', '2026-11-05', 8 * EOK, { itemKey: 'whetstone', ringLevel: null })

    await service.backfill('2026-11-05')

    const [base] = await db.select().from(maspiDays).where(sqlDay(maspiDays.day, '2026-10-22'))
    expect(base.value).toBeCloseTo(10_000)
    const list = await repo.latestResponse('items:scania')
    const body = JSON.parse(list?.body ?? '{}') as { equipment: { itemKey: string; price: number; grade: string }[]; consumable: { items: unknown[] } }
    expect(body.equipment).toEqual([expect.objectContaining({ itemKey: 'ring', price: 30 * EOK, grade: 'many' })])
    expect(body.consumable.items).toHaveLength(1)
    expect(list?.body).not.toMatch(/voters|source|persons|fresh/)
    // 에오스는 신뢰 시세가 없어 소비 목록이 비고, 앱은 빈 상태를 그린다.
    expect((await repo.latestResponse('items:eos'))?.body).toContain('"items":[]')
  })

  it('낸 날은 뒤늦은 줄이 와도 다시 계산하지 않고, 하루 작업은 끝내지 않은 날만 낸다', async () => {
    await steadyMarket('2026-10-22', '2026-11-05', 30 * EOK)
    await service.backfill('2026-11-05')
    const before = await db.select().from(marketDays).where(sqlDay(marketDays.day, '2026-11-03'))

    // 지난 날짜로 줄을 보내도 이미 낸 11/03 은 바뀌지 않는다.
    for (const who of ['x', 'd', 'e']) await trade(who, '2026-11-03', 90 * EOK)
    await service.catchUp('2026-11-06')

    const after = await db.select().from(marketDays).where(sqlDay(marketDays.day, '2026-11-03'))
    expect(after).toEqual(before)
    expect(await repo.ranDays()).toContain('2026-11-06')
    await expect(service.backfill('2026-11-06')).rejects.toThrow()
  })

  it('7일 표가 8개면 범위가 서고, 유지한 날은 마지막 새 기준가 날의 범위를 그대로 둔다', async () => {
    await crowdMarket('2026-11-01', '2026-11-05', 30 * EOK)

    // 11/06 · 11/07 은 3일 표로 새 기준가가 서고, 11/08 은 3일 안에 거래가 없어 유지한다.
    await service.backfill('2026-11-08')

    const [fresh] = await db.select().from(marketDays).where(sqlDay(marketDays.day, '2026-11-07'))
    const [carry] = await db.select().from(marketDays).where(sqlDay(marketDays.day, '2026-11-08'))
    expect(fresh.q1Meso).not.toBeNull()
    expect(carry.source).toBe('carry')
    expect([carry.q1Meso, carry.q3Meso]).toEqual([fresh.q1Meso, fresh.q3Meso])
  })

  it('지난 날의 범위를 다시 계산해도 기준가 · 판정 · MASPI 는 그대로이고, 마지막 날의 응답을 다시 만든다', async () => {
    await crowdMarket('2026-10-22', '2026-11-05', 30 * EOK)
    await service.backfill('2026-11-05')
    const days = await db.select().from(marketDays)
    const judgements = await db.select().from(marketJudgements)
    const maspi = await db.select().from(maspiDays)
    const response = await repo.latestResponse('items:scania')
    // 옛 방식의 범위와 그것으로 만든 응답이 남아 있던 상태.
    await db.update(marketDays).set({ q1Meso: 1, q3Meso: 1 })
    await db.update(marketResponses).set({ body: '{}', etag: '"old"' })

    await service.recomputeRanges()

    expect(await db.select().from(marketDays)).toEqual(days)
    expect(await db.select().from(marketJudgements)).toEqual(judgements)
    expect(await db.select().from(maspiDays)).toEqual(maspi)
    expect(await repo.latestResponse('items:scania')).toEqual(response)
  })

  it('같은 날 응답을 다시 만들어도 몸과 ETag 가 같다', async () => {
    await steadyMarket('2026-10-22', '2026-11-05', 30 * EOK)
    await service.backfill('2026-11-05')
    const first = await repo.latestResponse('maspi')

    await service.buildResponses('2026-11-05')

    expect(await repo.latestResponse('maspi')).toEqual(first)
    expect(first?.etag).toMatch(/^"[0-9a-f]{40}"$/)
  })
})


function sqlDay(column: AnyColumn, day: string) {
  return eq(column, day)
}
