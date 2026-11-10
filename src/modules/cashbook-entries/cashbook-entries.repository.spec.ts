import { asc, eq } from 'drizzle-orm'

import { serverCashbookEntries, serverCashbookEntryItems, users } from '../../database/schema'
import { describeDb, insertNexonAccount, openTestDb, type TestDb } from '../../database/test-db'
import { MapleIdNotOwned } from '../users/maple-id-ownership'
import { type CashbookEntryInput, CashbookEntriesRepository } from './cashbook-entries.repository'

const RECORD = '0f1e2d3c-4b5a-4978-8a9b-0c1d2e3f4a5b'

describeDb('CashbookEntriesRepository', () => {
  let db: TestDb
  let close: () => Promise<void>
  let truncate: () => Promise<void>
  let repo: CashbookEntriesRepository
  let me: { userId: string; nexonAccountId: string }

  const input = (over: Partial<CashbookEntryInput> = {}): CashbookEntryInput => ({
    nexonAccountId: me.nexonAccountId,
    identifiedBy: 'login',
    entryRecordId: RECORD,
    mapleId: 'm-me',
    ocid: null,
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
    me = await insertNexonAccount(db, ['m-me', 'm-me-2'])
    await insertNexonAccount(db, ['m-other'])
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

  // 같은 날 같은 물건을 두 번 산 기록은 내용이 같아도 둘 다 맞는 기록이라, 내용으로 가리면 하나가 사라진다.
  it('메이플 ID 안에서 기록 id 로 가리고, 내용이 같아도 기록 id 가 다르면 따로 적는다', async () => {
    await repo.upsert(input())
    await repo.upsert(input({ entryRecordId: '2f1e2d3c-4b5a-4978-8a9b-0c1d2e3f4a5b' }))
    await repo.upsert(input({ mapleId: 'm-me-2' }))

    expect(await db.select().from(serverCashbookEntries)).toHaveLength(3)
  })

  it('남의 메이플 ID 면 MapleIdNotOwned 로 거절하고 적지 않는다', async () => {
    await expect(repo.upsert(input({ mapleId: 'm-other' }))).rejects.toBeInstanceOf(MapleIdNotOwned)
    expect(await db.select().from(serverCashbookEntries)).toEqual([])
  })

  it('계정을 지우면 그 메이플 ID 의 기록과 품목도 함께 지워진다', async () => {
    await repo.upsert(input())

    await db.delete(users).where(eq(users.id, me.userId))

    expect(await db.select().from(serverCashbookEntries)).toEqual([])
    expect(await db.select().from(serverCashbookEntryItems)).toEqual([])
  })

  it('지우면 줄을 남기고 지운 시각을 적으며, 다시 적으면 되살아난다', async () => {
    await repo.upsert(input())

    await repo.markDeleted(me, RECORD)
    expect((await db.select().from(serverCashbookEntries))[0]?.deletedAt).not.toBeNull()

    await repo.upsert(input())
    expect((await db.select().from(serverCashbookEntries))[0]?.deletedAt).toBeNull()
  })
})
