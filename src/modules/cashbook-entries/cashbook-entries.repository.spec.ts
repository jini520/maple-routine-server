import { asc } from 'drizzle-orm'

import {
  nexonAccounts,
  serverCashbookEntries,
  serverCashbookEntryItems,
  users,
} from '../../database/schema'
import { describeDb, openTestDb, type TestDb } from '../../database/test-db'
import { type CashbookEntryInput, CashbookEntriesRepository } from './cashbook-entries.repository'

const RECORD = '0f1e2d3c-4b5a-4978-8a9b-0c1d2e3f4a5b'
const ACCOUNT = '1f1e2d3c-4b5a-4978-8a9b-0c1d2e3f4a5b'

describeDb('CashbookEntriesRepository', () => {
  let db: TestDb
  let close: () => Promise<void>
  let truncate: () => Promise<void>
  let repo: CashbookEntriesRepository
  let me: string
  let myAccount: string

  const input = (over: Partial<CashbookEntryInput> = {}): CashbookEntryInput => ({
    userId: me,
    identifiedBy: 'login',
    entryRecordId: RECORD,
    ocid: null,
    accountRecordId: ACCOUNT,
    entryType: 'spend',
    categoryKey: 'content',
    entryDate: '2026-10-26',
    items: [
      { itemKey: 'high_mountain_1', formKey: 'exp', amountPoint: 20_000 },
      { itemKey: 'high_mountain_2', formKey: 'sol_erda', amountPoint: 17_501 },
    ],
    ...over,
  })

  beforeAll(async () => {
    ;({ db, close, truncate } = await openTestDb())
    repo = new CashbookEntriesRepository(db)
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

  // 기기에서 품목을 고치면 서버 사본도 그 품목만 남아야 한다. 덧붙이면 금액이 두 번 센다.
  it('다시 적으면 기록은 한 줄이고 품목은 통째로 갈린다', async () => {
    await repo.upsert(input())
    await repo.upsert(
      input({ items: [{ itemKey: 'high_mountain_1', formKey: 'exp', amountPoint: 15_000 }] }),
    )

    expect(await db.select().from(serverCashbookEntries)).toHaveLength(1)
    const items = await db
      .select()
      .from(serverCashbookEntryItems)
      .orderBy(asc(serverCashbookEntryItems.sortOrder))
    expect(items.map((item) => [item.sortOrder, item.itemKey, item.amountPoint])).toEqual([
      [0, 'high_mountain_1', 15_000],
    ])
  })

  // 수정으로 다시 열 때 앱이 이 칸으로 폼을 세우므로 보낸 값 그대로 남아야 한다. 안 보낸 품목은 NULL 이다.
  it('헥사 품목의 조각 칸 셋과 활성화 여부를 적고, 다른 품목은 비워 둔다', async () => {
    await repo.upsert(
      input({
        categoryKey: 'hexa_matrix',
        items: [
          {
            itemKey: '인페르날 웨이브',
            fromLevel: 0,
            toLevel: 1,
            amountMeso: 4_000_000_000,
            fragmentCount: 100,
            untradableFragmentCount: 60,
            fragmentPriceMeso: 100_000_000,
          },
          {
            itemKey: 'hexa_stat_1',
            amountMeso: 0,
            fragmentCount: 10,
            untradableFragmentCount: 10,
            fragmentPriceMeso: 100_000_000,
            hexaActivation: true,
          },
          { itemKey: 'high_mountain_1', formKey: 'exp', amountPoint: 20_000 },
        ],
      }),
    )
    const items = await db
      .select()
      .from(serverCashbookEntryItems)
      .orderBy(asc(serverCashbookEntryItems.sortOrder))
    expect(
      items.map((item) => [
        item.fragmentCount,
        item.untradableFragmentCount,
        item.fragmentPriceMeso,
        item.hexaActivation,
      ]),
    ).toEqual([
      [100, 60, 100_000_000, null],
      [10, 10, 100_000_000, true],
      [null, null, null, null],
    ])
  })

  it('캐릭터 없는 기록은 기기 계정 id 로 그 사람의 넥슨 계정을 적고, 캐릭터가 있거나 못 찾으면 비운다', async () => {
    await repo.upsert(input())
    expect((await db.select().from(serverCashbookEntries))[0]?.nexonAccountId).toBe(myAccount)

    await repo.upsert(input({ ocid: 'ocid-1' }))
    expect((await db.select().from(serverCashbookEntries))[0]?.nexonAccountId).toBeNull()

    await repo.upsert(input({ accountRecordId: '2f1e2d3c-4b5a-4978-8a9b-0c1d2e3f4a5b' }))
    expect((await db.select().from(serverCashbookEntries))[0]?.nexonAccountId).toBeNull()
  })

  it('지우면 줄을 남기고 지운 시각을 적으며, 다시 적으면 되살아난다', async () => {
    await repo.upsert(input())

    await repo.markDeleted(me, RECORD)
    expect((await db.select().from(serverCashbookEntries))[0]?.deletedAt).not.toBeNull()

    await repo.upsert(input())
    expect((await db.select().from(serverCashbookEntries))[0]?.deletedAt).toBeNull()
  })
})
