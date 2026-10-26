import { randomUUID } from 'node:crypto'

import { dropItems, dropPrices, users, worlds } from '../../database/schema'
import { describeDb, openTestDb, type TestDb } from '../../database/test-db'
import { DropMarketRepository } from './drop-market.repository'

describeDb('DropMarketRepository', () => {
  let db: TestDb
  let close: () => Promise<void>
  let truncate: () => Promise<void>
  let repo: DropMarketRepository
  let me: string
  const item: Record<string, string> = {}
  const world: Record<string, string> = {}
  const since = new Date('2026-10-01T00:00:00Z')

  /** 거래 한 줄. 기본은 스카니아의 반지 4레벨 completed 줄이다. */
  async function trade(
    priceMeso: number | null,
    over: {
      itemKey?: string
      world?: string | null
      ringLevel?: number | null
      status?: 'completed' | 'pending'
    } = {},
  ) {
    const status = over.status ?? 'completed'
    const worldKey = over.world === undefined ? 'scania' : over.world
    await db.insert(dropPrices).values({
      userId: me,
      dropRecordId: randomUUID(),
      identifiedBy: 'key',
      itemId: item[over.itemKey ?? 'ring'],
      priceMeso,
      recordStatus: status,
      periodKey: '2026-10-15',
      worldId: worldKey === null ? null : world[worldKey],
      ringLevel: over.ringLevel === undefined ? 4 : over.ringLevel,
      pricedAt: status === 'completed' ? new Date('2026-10-17T03:00:00Z') : null,
    })
  }

  beforeAll(async () => {
    ;({ db, close, truncate } = await openTestDb())
    repo = new DropMarketRepository(db)
  })
  beforeEach(async () => {
    await truncate()
    ;[{ id: me }] = await db.insert(users).values({}).returning({ id: users.id })
    const items = await db
      .insert(dropItems)
      .values([
        { key: 'ring', name: '반지', iconFile: null },
        { key: 'whetstone', name: '연마석', iconFile: null, worldBound: true },
      ])
      .returning({ id: dropItems.id, key: dropItems.key })
    for (const r of items) item[r.key] = r.id
    const rows = await db
      .insert(worlds)
      .values([
        { key: 'scania', name: '스카니아', emblem: null, sortOrder: 0 },
        { key: 'bera', name: '베라', emblem: null, sortOrder: 1 },
        { key: 'eos', name: '에오스', emblem: null, sortOrder: 2, priceGroup: 'helios_eos' },
        { key: 'helios', name: '핼리오스', emblem: null, sortOrder: 3, priceGroup: 'helios_eos' },
        { key: 'special', name: '스페셜', emblem: null, sortOrder: 4, priceGroup: null },
      ])
      .returning({ id: worlds.id, key: worlds.key })
    for (const r of rows) world[r.key] = r.id
  })
  afterAll(() => close())

  it('거래권 이름은 general 이면 일반 월드, 아니면 든 월드 이름이고, 거래권이 없는 월드는 어디에도 없다', async () => {
    expect(await repo.scopes()).toEqual({
      groups: [
        { key: 'general', name: '일반 월드', worlds: ['스카니아', '베라'] },
        { key: 'helios_eos', name: '에오스 · 핼리오스', worlds: ['에오스', '핼리오스'] },
      ],
      worlds: [
        { key: 'scania', name: '스카니아' },
        { key: 'bera', name: '베라' },
        { key: 'eos', name: '에오스' },
        { key: 'helios', name: '핼리오스' },
      ],
    })
  })

  it('장비는 거래권의 월드를 함께 세고 소비 아이템은 안 센다', async () => {
    await trade(100)
    await trade(200, { world: 'bera' })
    await trade(5, { world: 'eos' })
    await trade(9, { itemKey: 'whetstone', ringLevel: null })

    const general = await repo.rows({ kind: 'equipment', key: 'general' }, since)
    const heliosEos = await repo.rows({ kind: 'equipment', key: 'helios_eos' }, since)

    expect(general.map((r) => r.priceMeso).sort()).toEqual([100, 200])
    expect(heliosEos.map((r) => r.priceMeso)).toEqual([5])
  })

  it('소비 아이템은 그 월드만 세고 장비는 안 센다', async () => {
    await trade(9, { itemKey: 'whetstone', ringLevel: null })
    await trade(20, { itemKey: 'whetstone', ringLevel: null, world: 'bera' })
    await trade(100)

    const scania = await repo.rows({ kind: 'consumable', key: 'scania' }, since)

    expect(scania.map((r) => [r.itemKey, r.priceMeso])).toEqual([['whetstone', 9]])
  })

  it('거래권이 없는 월드 · 월드 없는 줄 · completed 가 아닌 줄은 안 센다', async () => {
    await trade(7, { world: null })
    await trade(8, { world: 'special' })
    await trade(9, { itemKey: 'whetstone', ringLevel: null, world: 'special' })
    await trade(null, { status: 'pending' })

    expect(await repo.rows({ kind: 'equipment', key: 'general' }, since)).toEqual([])
    expect(await repo.rows({ kind: 'consumable', key: 'special' }, since)).toEqual([])
  })

  it('반지 레벨이 다르면 다른 시세이고 아이템 · 레벨로 거를 수 있다', async () => {
    await trade(100, { ringLevel: 4 })
    await trade(30, { ringLevel: 3 })

    const level4 = await repo.rows({ kind: 'equipment', key: 'general' }, since, {
      itemKey: 'ring',
      ringLevel: 4,
    })

    expect(level4.map((r) => [r.itemKey, r.itemName, r.ringLevel, r.priceMeso])).toEqual([
      ['ring', '반지', 4, 100],
    ])
  })
})
