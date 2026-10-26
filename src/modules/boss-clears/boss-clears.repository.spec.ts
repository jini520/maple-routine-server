import { bossClears, users, worlds } from '../../database/schema'
import { describeDb, openTestDb, type TestDb } from '../../database/test-db'
import { NoWorld } from '../drop-prices/drop-prices.repository'
import { type BossClearInput, BossClearsRepository } from './boss-clears.repository'

const RECORD = '0f1e2d3c-4b5a-4978-8a9b-0c1d2e3f4a5b'

describeDb('BossClearsRepository', () => {
  let db: TestDb
  let close: () => Promise<void>
  let truncate: () => Promise<void>
  let repo: BossClearsRepository
  let me: string
  let other: string

  const input = (over: Partial<BossClearInput> = {}): BossClearInput => ({
    userId: me,
    identifiedBy: 'key',
    periodRecordId: RECORD,
    ocid: 'ocid-1',
    bossDifficultyId: null,
    cycle: 'weekly',
    periodKey: '2026-10-22',
    worldKey: 'scania',
    priceMeso: 300_000_000,
    payoutMeso: 145_500_000,
    splitMode: 'even',
    partySize: 2,
    myShare: null,
    sharesTotal: null,
    splitFeePercent: 3,
    defeatedDate: '2026-10-23',
    source: 'auto',
    ...over,
  })

  beforeAll(async () => {
    ;({ db, close, truncate } = await openTestDb())
    repo = new BossClearsRepository(db)
  })
  beforeEach(async () => {
    await truncate()
    const rows = await db.insert(users).values([{}, {}]).returning({ id: users.id })
    me = rows[0].id
    other = rows[1].id
    await db
      .insert(worlds)
      .values({
        key: 'scania',
        name: '스카니아',
        emblem: null,
        challengers: false,
        event: false,
        sortOrder: 0,
      })
  })
  afterAll(() => close())

  // 기기가 기준이라 같은 기간을 고쳐 다시 보내면 서버 사본이 그 값을 따라간다. 줄이 늘면 통계가 두 번 센다.
  it('같은 기간 행을 다시 적으면 줄이 안 늘고 값만 덮는다', async () => {
    await repo.upsert(input())
    await repo.upsert(input({ payoutMeso: 100_000_000, source: 'manual' }))

    const rows = await db.select().from(bossClears)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toEqual(
      expect.objectContaining({ payoutMeso: 100_000_000, source: 'manual', deletedAt: null }),
    )
  })

  // 기기 id 는 사람 안에서만 유일하다. 남의 기록 id 로 남의 줄을 덮으면 안 된다.
  it('같은 기간 행 id 라도 사람이 다르면 줄이 따로다', async () => {
    await repo.upsert(input())
    await repo.upsert(input({ userId: other, payoutMeso: 1 }))

    expect(await db.select().from(bossClears)).toHaveLength(2)
  })

  it('모르는 월드 key 는 NoWorld 로 거절하고, 월드가 없으면 그대로 받는다', async () => {
    await expect(repo.upsert(input({ worldKey: 'nowhere' }))).rejects.toBeInstanceOf(NoWorld)
    await repo.upsert(input({ worldKey: null }))

    expect((await db.select().from(bossClears))[0]?.worldId).toBeNull()
  })

  it('지우면 줄을 남기고 지운 시각을 적으며, 다시 적으면 되살아난다', async () => {
    await repo.upsert(input())

    await repo.markDeleted(me, RECORD)
    expect((await db.select().from(bossClears))[0]?.deletedAt).not.toBeNull()

    await repo.upsert(input())
    expect((await db.select().from(bossClears))[0]?.deletedAt).toBeNull()
  })
})
