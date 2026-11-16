import { randomUUID } from 'node:crypto'

import { dropPrices, items, users, worlds } from '../../database/schema'
import { describeDb, openTestDb, type TestDb } from '../../database/test-db'
import { shiftDay } from './daily-reference'
import { DropMarketRepository } from './drop-market.repository'
import { DropMarketService } from './drop-market.service'
import { MarketDailyRepository } from './market-daily.repository'
import { MarketPublishService } from './market-publish.service'

const EOK = 100_000_000
const GENERAL = { kind: 'equipment', key: 'general' } as const
const RING = { itemKey: 'ring', ringLevel: 4 }
/** 하루 작업이 11/05 까지 낸 뒤인 11/06 아침 */
const NOW = new Date('2026-11-06T10:00:00+09:00')

describeDb('DropMarketService', () => {
  let db: TestDb
  let close: () => Promise<void>
  let truncate: () => Promise<void>
  let service: DropMarketService
  let publish: MarketPublishService
  const item: Record<string, string> = {}
  const person: Record<string, string> = {}
  let scania: string

  async function trade(who: string, itemKey: string, day: string, priceMeso: number, time = '12:00') {
    await db.insert(dropPrices).values({
      userId: person[who],
      dropRecordId: randomUUID(),
      identifiedBy: 'key',
      itemId: item[itemKey],
      priceMeso,
      recordStatus: 'completed',
      periodKey: '2026-10-22',
      worldId: scania,
      ringLevel: itemKey === 'ring' ? 4 : null,
      pricedAt: new Date(`${day}T${time}:00+09:00`),
    })
  }

  beforeAll(async () => {
    ;({ db, close, truncate } = await openTestDb())
    const daily = new MarketDailyRepository(db)
    service = new DropMarketService(new DropMarketRepository(db), daily)
    publish = new MarketPublishService(daily)
  })
  beforeEach(async () => {
    await truncate()
    for (const who of ['a', 'b', 'c', 'd', 'x']) {
      ;[{ id: person[who] }] = await db.insert(users).values({}).returning({ id: users.id })
    }
    const itemRows = await db
      .insert(items)
      .values([
        { key: 'ring', name: '반지', isDrop: true },
        { key: 'belt', name: '벨트', isDrop: true },
        { key: 'eye', name: '눈장식', isDrop: true },
      ])
      .returning({ id: items.id, key: items.key })
    for (const r of itemRows) item[r.key] = r.id
    ;[{ id: scania }] = await db.insert(worlds).values({ key: 'scania', name: '스카니아', sortOrder: 0 }).returning({ id: worlds.id })

    const prices = { ring: 30 * EOK, belt: 20 * EOK, eye: 10 * EOK }
    for (let d = '2026-10-22'; d <= '2026-11-05'; d = shiftDay(d, 1)) {
      for (const [key, price] of Object.entries(prices)) for (const who of ['a', 'b', 'c']) await trade(who, key, d, price)
    }
  })
  afterAll(() => close())

  it('아이템 화면의 줄은 하루 작업이 남긴 그날 울타리로 판정하고, 아직 내지 않은 오늘 줄은 판단 보류다', async () => {
    await trade('d', 'ring', '2026-11-04', 300 * EOK, '13:00')
    await trade('d', 'ring', '2026-11-06', 31 * EOK, '09:00')
    await publish.backfill('2026-11-05')

    const { rows } = await service.detail(GENERAL, RING, NOW)

    const byPrice = (p: number) => rows.find((r) => r.priceMeso === p)
    expect(byPrice(300 * EOK)).toMatchObject({ verdict: 'excluded', basis: 'today' })
    expect(byPrice(300 * EOK)?.fence?.high).toBeLessThan(300 * EOK)
    expect(byPrice(31 * EOK)).toMatchObject({ verdict: 'pending', fence: null, basis: null })
    expect(rows.filter((r) => r.priceMeso === 30 * EOK).every((r) => r.verdict === 'included')).toBe(true)
    expect(rows[0]).not.toHaveProperty('person')
  })

  it('그날 더미 입력을 한 사람의 줄은 울타리 안이어도 제외이고, 한눈에 보는 화면의 제외 수에 든다', async () => {
    // x 가 11/03 에 시세가 다른 세 아이템에 모두 50억을 적고, 반지에는 시세 그대로 30억도 적었다.
    for (const key of ['ring', 'belt', 'eye']) await trade('x', key, '2026-11-03', 50 * EOK, '13:00')
    await trade('x', 'ring', '2026-11-03', 30 * EOK, '14:00')
    await publish.backfill('2026-11-05')

    const { rows } = await service.detail(GENERAL, RING, NOW)
    const overview = await service.overview(GENERAL, NOW)

    const xRows = rows.filter((r) => r.pricedAt.getTime() >= new Date('2026-11-03T13:00:00+09:00').getTime() && r.pricedAt < new Date('2026-11-04T00:00:00+09:00'))
    expect(xRows.map((r) => [r.priceMeso / EOK, r.verdict, r.basis])).toEqual([
      [50, 'excluded', 'dummy'],
      [30, 'excluded', 'dummy'],
    ])
    expect(overview.find((m) => m.itemKey === 'ring')?.excludedCount).toBe(2)
  })
})
