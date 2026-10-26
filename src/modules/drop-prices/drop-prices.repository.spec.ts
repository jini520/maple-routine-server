import { eq } from 'drizzle-orm'

import { dropItems, dropPrices, users, worlds } from '../../database/schema'
import { BossesRepository } from '../bosses/bosses.repository'
import { describeDb, openTestDb, type TestDb } from '../../database/test-db'
import {
  type DropPriceInput,
  DropPricesRepository,
  NoDropItem,
  NoWorld,
} from './drop-prices.repository'

const RECORD = '0f1e2d3c-4b5a-4978-8a9b-0c1d2e3f4a5b'

describeDb('DropPricesRepository', () => {
  let db: TestDb
  let close: () => Promise<void>
  let truncate: () => Promise<void>
  let repo: DropPricesRepository
  let me: string
  let other: string

  const input = (over: Partial<DropPriceInput> = {}): DropPriceInput => ({
    userId: me,
    identifiedBy: 'key',
    dropRecordId: RECORD,
    itemKey: 'ring',
    priceMeso: 100,
    periodKey: '2026-10-08',
    worldKey: 'scania',
    ringLevel: 4,
    bossDifficultyId: null,
    periodRecordId: null,
    recordStatus: 'completed',
    ...over,
  })

  beforeAll(async () => {
    ;({ db, close, truncate } = await openTestDb())
    repo = new DropPricesRepository(db)
  })
  beforeEach(async () => {
    await truncate()
    const rows = await db.insert(users).values([{}, {}]).returning({ id: users.id })
    me = rows[0].id
    other = rows[1].id
    // 가격 줄이 아이템 · 월드 표의 줄을 가리킨다. 스펙이 쓰는 key 둘과 월드 하나를 먼저 세운다.
    await db.insert(dropItems).values([
      { key: 'ring', name: '반지', iconFile: null, valuable: true },
      { key: 'cape', name: '망토', iconFile: null, valuable: false },
    ])
    await db.insert(worlds).values({
      key: 'scania',
      name: '스카니아',
      emblem: null,
      challengers: false,
      event: false,
      sortOrder: 0,
    })
  })
  afterAll(() => close())

  // 어느 처치에서 나온 드롭인지 잇는 칸이다. 드롭은 처치하지 않은 기간에도 있어 외래키가 아니라 기기 id 다.
  it('처치 기간 id 를 적고 다시 보내면 덮는다', async () => {
    await repo.upsert(input({ periodRecordId: '2f1e2d3c-4b5a-4978-8a9b-0c1d2e3f4a5b' }))

    expect((await db.select().from(dropPrices))[0]?.periodRecordId).toBe(
      '2f1e2d3c-4b5a-4978-8a9b-0c1d2e3f4a5b',
    )
  })

  it('처음은 줄을 만들고 같은 기록을 다시 적으면 값만 덮는다', async () => {
    await repo.upsert(input())
    await repo.upsert(input({ priceMeso: 250, identifiedBy: 'login' }))

    const rows = await db.select().from(dropPrices)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.priceMeso).toBe(250)
    expect(rows[0]?.recordStatus).toBe('completed')
    expect(rows[0]?.identifiedBy).toBe('login')
    expect(rows[0]?.updatedAt.getTime()).toBeGreaterThanOrEqual(rows[0]?.createdAt.getTime() ?? 0)
  })

  // 기기는 그룹을 저장할 때마다 같은 값을 다시 보낸다. 그때 거래 시각이 움직이면 시세 차트의 날이 틀어진다.
  it('priced_at 은 같은 가격이 다시 오면 그대로이고, 가격이 바뀌거나 completed 가 되면 움직이고, 아니면 비운다', async () => {
    const past = new Date('2026-10-01T00:00:00Z')
    const pricedAt = async () => (await db.select().from(dropPrices))[0]?.pricedAt ?? null

    await repo.upsert(input())
    await db.update(dropPrices).set({ pricedAt: past })
    await repo.upsert(input())
    expect(await pricedAt()).toEqual(past)

    await repo.upsert(input({ priceMeso: 200 }))
    expect((await pricedAt())?.getTime()).toBeGreaterThan(past.getTime())

    await repo.upsert(input({ priceMeso: null, recordStatus: 'pending' }))
    expect(await pricedAt()).toBeNull()
    await repo.upsert(input({ priceMeso: 200 }))
    expect(await pricedAt()).not.toBeNull()

    await repo.markDeleted(me, RECORD)
    expect(await pricedAt()).toBeNull()
  })

  // 아이템 · 월드는 시세의 축이라 모르는 값을 받으면 어느 아이템의 시세인지 모르는 줄이 된다. 월드가 없는 줄은 받는다.
  it('표에 없는 아이템 · 월드 key 는 NoDropItem · NoWorld 로 거절하고 줄을 안 만든다. 월드 null 은 받는다', async () => {
    await expect(repo.upsert(input({ itemKey: 'nobody' }))).rejects.toThrow(
      new NoDropItem('nobody'),
    )
    await expect(repo.upsert(input({ worldKey: 'nowhere' }))).rejects.toThrow(
      new NoWorld('nowhere'),
    )
    expect(await db.select().from(dropPrices)).toHaveLength(0)

    await repo.upsert(input({ worldKey: null }))
    const rows = await repo.recent({ itemKey: null, periodKey: null }, 10)
    expect(rows.map((r) => [r.itemKey, r.worldKey])).toEqual([['ring', null]])
  })

  it('남의 기록 id 로 적어도 남의 줄은 안 건드리고 내 줄이 따로 생긴다', async () => {
    await repo.upsert(input({ userId: other, priceMeso: 999 }))

    await repo.upsert(input({ priceMeso: 1 }))

    const rows = await db.select().from(dropPrices).orderBy(dropPrices.priceMeso)
    expect(rows).toHaveLength(2)
    expect(rows.map((r) => [r.userId, r.priceMeso])).toEqual([
      [me, 1],
      [other, 999],
    ])
  })

  it('보스 난이도 줄을 가리킬 수 있고 recent 가 보스 key · 한글 이름 · 난이도를 함께 낸다', async () => {
    const bosses = new BossesRepository(db)
    await bosses.createBoss({
      key: 'lucid',
      name: '루시드',
      alias: '루시드',
      cycle: 'weekly',
      portraitSlug: 'lucid',
      difficulties: [{ difficulty: 'hard', requiredLevel: 220 }],
    })
    const found = await bosses.findDifficulty('lucid', 'hard')
    expect(found).not.toBeNull()
    expect(await bosses.findDifficulty('lucid', 'chaos')).toBeNull()
    expect(await bosses.findDifficulty('nobody', 'hard')).toBeNull()
    expect(await bosses.findDifficulty('lucid', 'ultra')).toBeNull()

    await repo.upsert(input({ bossDifficultyId: found?.id ?? null }))
    await repo.upsert(input({ dropRecordId: '0f1e2d3c-4b5a-4978-8a9b-0c1d2e3f4a52', priceMeso: 5 }))

    const rows = await repo.recent({ itemKey: null, periodKey: null }, 10)
    expect(rows.map((r) => [r.priceMeso, r.boss, r.bossName, r.difficulty])).toEqual([
      [5, null, null, null],
      [100, 'lucid', '루시드', 'hard'],
    ])
  })

  // 미입력 · 기록 안함도 줄이 된다. 가격은 completed 만 갖고, 분포는 completed 만 센다.
  it('pending · skipped 는 가격 없이 그 상태로 서고 분포에 안 든다', async () => {
    const pendingId = '0f1e2d3c-4b5a-4978-8a9b-0c1d2e3f4a61'
    const skippedId = '0f1e2d3c-4b5a-4978-8a9b-0c1d2e3f4a62'
    await repo.upsert(input({ dropRecordId: pendingId, priceMeso: null, recordStatus: 'pending' }))
    await repo.upsert(input({ dropRecordId: skippedId, priceMeso: null, recordStatus: 'skipped' }))
    await repo.upsert(input({ priceMeso: 300 }))

    const rows = await repo.recent({ itemKey: null, periodKey: null }, 10)
    expect(rows.map((r) => [r.dropRecordId, r.recordStatus, r.priceMeso])).toEqual([
      [RECORD, 'completed', 300],
      [skippedId, 'skipped', null],
      [pendingId, 'pending', null],
    ])
    expect(await repo.summary({ itemKey: null, periodKey: null })).toEqual([
      expect.objectContaining({ itemKey: 'ring', count: 1, min: 300, max: 300 }),
    ])

    // 가격이 들어오면 같은 줄이 completed 로 바뀐다
    await repo.upsert(input({ dropRecordId: pendingId, priceMeso: 500 }))
    const [priced] = await repo.recent({ itemKey: null, periodKey: null }, 1)
    expect([priced?.dropRecordId, priced?.recordStatus, priced?.priceMeso]).toEqual([
      pendingId,
      'completed',
      500,
    ])
  })

  // DTO 가 먼저 막지만 표도 막는다. 0 으로 적는 길이 생기면 미입력과 구분이 사라진다.
  it('상태와 가격의 유무가 어긋나는 줄은 표의 CHECK 가 거절한다', async () => {
    await expect(repo.upsert(input({ priceMeso: null }))).rejects.toThrow()
    await expect(repo.upsert(input({ recordStatus: 'pending' }))).rejects.toThrow()
    expect(await db.select().from(dropPrices)).toHaveLength(0)
  })

  it('markDeleted 는 내 줄만 deleted 로 표시하고 가격을 비운다. 다시 적으면 completed 로 돌아온다', async () => {
    await repo.upsert(input())
    await repo.upsert(input({ userId: other }))

    await repo.markDeleted(me, RECORD)

    const mine = await db.select().from(dropPrices).where(eq(dropPrices.userId, me))
    const theirs = await db.select().from(dropPrices).where(eq(dropPrices.userId, other))
    expect([mine[0]?.recordStatus, mine[0]?.priceMeso]).toEqual(['deleted', null])
    expect([theirs[0]?.recordStatus, theirs[0]?.priceMeso]).toEqual(['completed', 100])

    await repo.upsert(input())
    const revived = await db.select().from(dropPrices).where(eq(dropPrices.userId, me))
    expect([revived[0]?.recordStatus, revived[0]?.priceMeso]).toEqual(['completed', 100])
  })

  it('markDeleted 는 없는 줄이면 조용하다', async () => {
    await expect(repo.markDeleted(me, RECORD)).resolves.toBeUndefined()
    expect(await db.select().from(dropPrices)).toHaveLength(0)
  })

  it('recent 는 필터대로 최근 것부터 내고 지운 줄도 deleted 로 보인다', async () => {
    await repo.upsert(
      input({ dropRecordId: '0f1e2d3c-4b5a-4978-8a9b-0c1d2e3f4a51', priceMeso: 10 }),
    )
    await repo.upsert(
      input({
        dropRecordId: '0f1e2d3c-4b5a-4978-8a9b-0c1d2e3f4a52',
        priceMeso: 20,
        itemKey: 'cape',
      }),
    )
    await repo.upsert(
      input({
        dropRecordId: '0f1e2d3c-4b5a-4978-8a9b-0c1d2e3f4a53',
        priceMeso: 30,
        periodKey: '2026-10',
      }),
    )
    await repo.markDeleted(me, '0f1e2d3c-4b5a-4978-8a9b-0c1d2e3f4a51')

    const all = await repo.recent({ itemKey: null, periodKey: null }, 10)
    expect(all).toHaveLength(3)
    expect(all.map((r) => r.priceMeso)).toEqual([null, 30, 20])
    expect(all.map((r) => r.recordStatus)).toEqual(['deleted', 'completed', 'completed'])
    expect(all[0]).toMatchObject({
      identifiedBy: 'key',
      userId: me,
      itemKey: 'ring',
      itemName: '반지',
      worldKey: 'scania',
      worldName: '스카니아',
    })

    expect(
      (await repo.recent({ itemKey: 'ring', periodKey: null }, 10)).map((r) => r.priceMeso),
    ).toEqual([null, 30])
    // 화면이 이름을 보이므로 이름으로도 거른다
    expect(
      (await repo.recent({ itemKey: '망토', periodKey: null }, 10)).map((r) => r.priceMeso),
    ).toEqual([20])
    expect(
      (await repo.recent({ itemKey: 'ring', periodKey: '2026-10' }, 10)).map((r) => r.priceMeso),
    ).toEqual([30])
    expect(await repo.recent({ itemKey: null, periodKey: null }, 1)).toHaveLength(1)
  })

  it('summary 는 아이템 × 기간의 개수 · 최소 · 중앙값 · 최대이고 지운 줄은 안 센다', async () => {
    const ids = ['51', '52', '53', '54', '55'].map((t) => `0f1e2d3c-4b5a-4978-8a9b-0c1d2e3f4a${t}`)
    await repo.upsert(input({ dropRecordId: ids[0], priceMeso: 100 }))
    await repo.upsert(input({ dropRecordId: ids[1], priceMeso: 300 }))
    await repo.upsert(input({ dropRecordId: ids[2], priceMeso: 1_000_000 }))
    await repo.upsert(input({ dropRecordId: ids[3], priceMeso: 7, userId: other }))
    await repo.upsert(
      input({ dropRecordId: ids[4], priceMeso: 50, itemKey: 'cape', periodKey: '2026-10' }),
    )
    await repo.markDeleted(me, ids[2])

    const summary = await repo.summary({ itemKey: null, periodKey: null })

    // 기간 key 는 문자열 역순이라 '2026-10-08' 이 '2026-10' 앞이다
    expect(summary).toEqual([
      {
        itemKey: 'ring',
        itemName: '반지',
        periodKey: '2026-10-08',
        count: 3,
        min: 7,
        median: 100,
        max: 300,
      },
      {
        itemKey: 'cape',
        itemName: '망토',
        periodKey: '2026-10',
        count: 1,
        min: 50,
        median: 50,
        max: 50,
      },
    ])
    expect(await repo.summary({ itemKey: 'ring', periodKey: null })).toHaveLength(1)
    expect(await repo.summary({ itemKey: '반지', periodKey: null })).toHaveLength(1)
    expect(await repo.summary({ itemKey: 'none', periodKey: null })).toEqual([])
  })
})
