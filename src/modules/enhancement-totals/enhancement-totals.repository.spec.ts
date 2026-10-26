import { enhancementTotals, nexonAccounts, users } from '../../database/schema'
import { describeDb, openTestDb, type TestDb } from '../../database/test-db'
import {
  type EnhancementTotalInput,
  EnhancementTotalsRepository,
} from './enhancement-totals.repository'

const RECORD = '0f1e2d3c-4b5a-4978-8a9b-0c1d2e3f4a5b'
const ACCOUNT = '1f1e2d3c-4b5a-4978-8a9b-0c1d2e3f4a5b'

describeDb('EnhancementTotalsRepository', () => {
  let db: TestDb
  let close: () => Promise<void>
  let truncate: () => Promise<void>
  let repo: EnhancementTotalsRepository
  let me: string
  let myAccount: string

  const input = (over: Partial<EnhancementTotalInput> = {}): EnhancementTotalInput => ({
    userId: me,
    identifiedBy: 'login',
    totalRecordId: RECORD,
    accountRecordId: ACCOUNT,
    characterName: '낟낟',
    historyDate: '2026-10-20',
    enhancementCategory: 'cube_reset',
    itemKey: 'arcane_umbra_knuckle',
    itemName: '아케인셰이드 클로',
    attempts: 2,
    attemptCostMeso: 900_000,
    destroyDefenceCostMeso: 0,
    ...over,
  })

  beforeAll(async () => {
    ;({ db, close, truncate } = await openTestDb())
    repo = new EnhancementTotalsRepository(db)
  })
  beforeEach(async () => {
    await truncate()
    ;[{ id: me }] = await db.insert(users).values({}).returning({ id: users.id })
    ;[{ id: myAccount }] = await db
      .insert(nexonAccounts)
      .values({ userId: me, identitySource: 'login', nexonUid: 'uid', accountRecordId: ACCOUNT })
      .returning({ id: nexonAccounts.id })
  })
  afterAll(() => close())

  // 앱은 오늘 합계를 받을 때마다 다시 보낸다. 줄이 늘면 같은 강화가 여러 번 센다.
  it('다시 적으면 한 줄을 덮고, 지운 줄도 되살린다', async () => {
    await repo.upsert(input())
    await repo.markDeleted(me, RECORD)
    await repo.upsert(input({ attempts: 5, attemptCostMeso: 2_250_000 }))

    const rows = await db.select().from(enhancementTotals)
    expect(rows.map((row) => [row.attempts, row.attemptCostMeso, row.deletedAt])).toEqual([
      [5, 2_250_000, null],
    ])
  })

  it('기기 계정 id 로 그 사람의 넥슨 계정을 적고, 못 찾으면 비운다', async () => {
    await repo.upsert(input())
    expect((await db.select().from(enhancementTotals))[0]?.nexonAccountId).toBe(myAccount)

    await repo.upsert(input({ accountRecordId: '2f1e2d3c-4b5a-4978-8a9b-0c1d2e3f4a5b' }))
    expect((await db.select().from(enhancementTotals))[0]?.nexonAccountId).toBeNull()
  })

  // 다른 사람이 같은 합계 id 를 보내도 내 줄을 지우지 못해야 한다.
  it('지우기는 내 줄에만 시각을 적는다', async () => {
    await repo.upsert(input())
    const [{ id: other }] = await db.insert(users).values({}).returning({ id: users.id })

    await repo.markDeleted(other, RECORD)

    expect((await db.select().from(enhancementTotals))[0]?.deletedAt).toBeNull()
  })
})
