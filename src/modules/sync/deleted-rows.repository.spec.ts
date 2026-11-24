import { randomUUID } from 'node:crypto'

import { eq } from 'drizzle-orm'

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

  // 표식을 놓치는 것은 표식이 선 줄이 실제로 지워질 때뿐이다. 받기가 이 번호를 알려 줘야 그 사이에 받지 않은 기기가 비우고
  // 다시 받는다. 남은 표식까지 세면 줄이 많은 주인이 비우고 다시 받기를 되풀이하고, 내려가면 이미 견준 기기가 다시 비운다.
  it('지운 줄의 가장 큰 변경 번호를 표를 가로질러 적고, 지울 때마다 오르며 내려가지 않는다. 지운 적이 없으면 null 이다', async () => {
    const mapleId = await mapleIdRow(sha256Hex('m-me'))
    const now = Date.now()
    const seqOf = async (id: string): Promise<number> => {
      const [row] = await db
        .select({ changeSeq: cashbookEntries.changeSeq })
        .from(cashbookEntries)
        .where(eq(cashbookEntries.id, id))
      if (row === undefined) throw new Error('가계부 기록이 없다')
      return row.changeSeq
    }
    const purge = (daysAgo: number) => repo.purgeBefore(new Date(now - daysAgo * DAY_MS))

    const early = await insertEntry(mapleId, new Date(now - 10 * DAY_MS))
    const earlySeq = await seqOf(early)
    await purge(180)
    expect(await repo.purgedChangeSeq()).toBeNull()

    await insertEntry(mapleId, new Date(now - 200 * DAY_MS))
    const [name] = await db
      .insert(mapleIdNames)
      .values({ mapleId, name: '본캐', deletedAt: new Date(now - 200 * DAY_MS) })
      .returning()
    const recent = await insertEntry(mapleId, new Date(now - DAY_MS))
    const recentSeq = await seqOf(recent)
    await purge(180)
    expect(await repo.purgedChangeSeq()).toBe(name?.changeSeq)
    expect(recentSeq).toBeGreaterThan(name?.changeSeq ?? Infinity)

    await purge(5)
    expect(earlySeq).toBeLessThan(name?.changeSeq ?? -Infinity)
    expect(await repo.purgedChangeSeq()).toBe(name?.changeSeq)

    await purge(0)
    expect(await repo.purgedChangeSeq()).toBe(recentSeq)
  })
})
