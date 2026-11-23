import { randomUUID } from 'node:crypto'

import { eq, sql } from 'drizzle-orm'

import { sha256Hex } from '../../common/hash'
import { cashbookEntries, cashbookEntryItems, mapleIdNames, mapleIds } from '../../database/schema'
import {
  describeDb,
  insertNexonAccount,
  insertRecordReferences,
  openTestDb,
  type RecordReferences,
  type TestDb,
} from '../../database/test-db'
import { DeletedRowsRepository } from './deleted-rows.repository'

const DAY_MS = 86_400_000

describeDb('DeletedRowsRepository', () => {
  let db: TestDb
  let close: () => Promise<void>
  let truncate: () => Promise<void>
  let repo: DeletedRowsRepository
  let ref: RecordReferences

  beforeAll(async () => {
    ;({ db, close, truncate } = await openTestDb())
    repo = new DeletedRowsRepository(db)
  })
  beforeEach(async () => {
    await truncate()
    ref = await insertRecordReferences(db)
  })
  afterAll(() => close())

  /** 메이플 ID 하나와 그 줄 id */
  async function mapleIdRow(hash: string): Promise<string> {
    await insertNexonAccount(db, [hash])
    const [row] = await db.select({ id: mapleIds.id }).from(mapleIds).where(eq(mapleIds.hash, hash))
    if (row === undefined) throw new Error('메이플 ID 를 못 넣었다')
    return row.id
  }

  /** 가계부 기록 한 건과 품목 한 줄. deletedAt 을 주면 그때 표식이 선 줄이다. */
  async function insertEntry(mapleId: string, deletedAt: Date | null): Promise<string> {
    const id = randomUUID()
    await db.insert(cashbookEntries).values({
      id,
      mapleId,
      categoryId: ref.categoryId,
      date: '2026-11-20',
      recordedAt: new Date(),
      deletedAt,
    })
    await db.insert(cashbookEntryItems).values({ entryId: id, itemName: '품목', amountMeso: -1 })
    return id
  }

  // 표식은 다른 기기가 받아 지우도록 남긴다. 오래된 표식만 지워야 받지 않은 기기가 표식을 놓치지 않는다.
  it('표식이 기준보다 앞에 선 줄만 딸린 줄과 함께 지우고, 살아 있는 줄과 최근 표식은 남긴다', async () => {
    const mapleId = await mapleIdRow(sha256Hex('m-me'))
    const now = Date.now()
    const old = await insertEntry(mapleId, new Date(now - 200 * DAY_MS))
    const recent = await insertEntry(mapleId, new Date(now - 10 * DAY_MS))
    const alive = await insertEntry(mapleId, null)

    const deleted = await repo.purgeBefore(new Date(now - 180 * DAY_MS))

    expect(deleted).toBe(1)
    expect(
      (await db.select({ id: cashbookEntries.id }).from(cashbookEntries)).map((r) => r.id).sort(),
    ).toEqual([recent, alive].sort())
    expect(
      await db.select().from(cashbookEntryItems).where(eq(cashbookEntryItems.entryId, old)),
    ).toEqual([])
  })

  // 받기가 이 번호를 알려 줘야 오래 받지 않은 기기가 표식을 놓쳤는지 안다.
  it('남은 표식 가운데 가장 작은 변경 번호를 표를 가로질러 돌려주고, 표식이 없으면 null 이다', async () => {
    expect(await repo.oldestDeletedChangeSeq()).toBeNull()
    const mapleId = await mapleIdRow(sha256Hex('m-me'))
    await db.insert(mapleIdNames).values({ mapleId, name: '본캐', deletedAt: new Date() })
    await insertEntry(mapleId, new Date())

    const [name] = await db.select().from(mapleIdNames)
    const result = await db.execute<{ min: string }>(
      sql`SELECT min(change_seq) AS min FROM cashbook_entries WHERE deleted_at IS NOT NULL`,
    )

    expect(await repo.oldestDeletedChangeSeq()).toBe(
      Math.min(name?.changeSeq ?? Infinity, Number(result.rows[0]?.min)),
    )
  })
})
