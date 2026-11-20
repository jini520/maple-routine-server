import { randomUUID } from 'node:crypto'

import { eq } from 'drizzle-orm'

import {
  cashbookCategories,
  cashbookEntries,
  cashbookEntryFragmentUses,
  cashbookEntryHuntInputs,
  cashbookEntryItems,
  cashbookEntryTransferInputs,
  characters,
  users,
} from '../../database/schema'
import {
  describeDb,
  insertAsset,
  insertNexonAccount,
  openTestDb,
  type TestDb,
} from '../../database/test-db'
import { MapleIdNotOwned } from '../users/maple-id-ownership'
import { cashbookEntryItemBody } from './cashbook-entries.dto'
import { type CashbookEntryInput, CashbookEntriesRepository } from './cashbook-entries.repository'

describeDb('CashbookEntriesRepository', () => {
  let db: TestDb
  let close: () => Promise<void>
  let truncate: () => Promise<void>
  let repo: CashbookEntriesRepository
  let me: { userId: string; nexonAccountId: string }
  let other: { userId: string; nexonAccountId: string }
  let categoryId: string

  /** 품목 한 줄. 빠진 칸은 몸을 읽을 때처럼 비운다. */
  const item = (over: Record<string, unknown> = {}) =>
    cashbookEntryItemBody.parse({ itemName: '직접 친 품목', amountMeso: -1_000, ...over })
  /** 내 캐릭터의 지출 한 건. 품목 하나와 다른 캐릭터에서 가져온 사냥 조각 · 기타 조각이 있다. */
  const input = (over: Partial<CashbookEntryInput> = {}): CashbookEntryInput => ({
    nexonAccountId: me.nexonAccountId,
    id: randomUUID(),
    mapleId: 'm-me',
    ocid: 'o-me',
    worldId: null,
    categoryId,
    date: '2026-11-20',
    memo: '메모',
    recordedAt: new Date('2026-11-20T03:00:00Z'),
    items: [item()],
    huntInput: null,
    transferInput: {
      receiverOcid: 'o-alt',
      transferMeso: 100,
      feePercent: null,
      feeFollowsMvpGrade: true,
    },
    exchangeInput: null,
    fragmentUses: [
      { fragmentSource: 'hunt', ocid: 'o-alt', fragmentQuantity: 3 },
      { fragmentSource: 'inventory', ocid: null, fragmentQuantity: 2 },
    ],
    ...over,
  })

  beforeAll(async () => {
    ;({ db, close, truncate } = await openTestDb())
    repo = new CashbookEntriesRepository(db)
  })
  beforeEach(async () => {
    await truncate()
    me = await insertNexonAccount(db, ['m-me'])
    other = await insertNexonAccount(db, ['m-other'])
    const [category] = await db
      .insert(cashbookCategories)
      .values({
        entryType: 'spend',
        key: 'etc',
        name: '기타',
        cardTitle: '기타',
        iconAssetId: await insertAsset(db, 'items/etc.webp'),
        description: '기타',
        sortOrder: 0,
      })
      .returning({ id: cashbookCategories.id })
    categoryId = category.id
  })
  afterAll(() => close())

  // 기기는 기록을 고칠 때마다 통째로 다시 보낸다. 딸린 줄이 남으면 지운 품목이 다른 기기에 남는다.
  it('기록과 딸린 줄을 적고, 다시 보내면 딸린 줄을 갈아 끼우며 지운 기록도 되살린다', async () => {
    const first = input({
      huntInput: {
        characterLevel: 270,
        missedMobQuantity: 0,
        usesWealthPotion: true,
        usesUnionWealth: false,
        unionWealthTier: null,
        fragmentQuantity: 5,
        fragmentPriceMeso: 1,
        mesoAcquisitionPercent: 100,
        typedMeso: null,
      },
    })
    await repo.upsert(first)
    const made = Object.fromEntries((await db.select().from(characters)).map((c) => [c.ocid, c.id]))
    expect(await db.select().from(cashbookEntryTransferInputs)).toEqual([
      expect.objectContaining({ receiverCharacterId: made['o-alt'] }),
    ])
    expect(
      (await db.select().from(cashbookEntryFragmentUses))
        .map((r) => [r.fragmentSource, r.characterId])
        .sort(),
    ).toEqual(
      [
        ['hunt', made['o-alt']],
        ['inventory', null],
      ].sort(),
    )

    await repo.markDeleted(me, first.id)
    await repo.upsert({
      ...first,
      items: [item({ itemName: '바꾼 품목' })],
      huntInput: null,
      fragmentUses: [],
    })

    expect(
      (await db.select().from(cashbookEntries)).map((r) => [r.characterId, r.deletedAt]),
    ).toEqual([[made['o-me'], null]])
    expect((await db.select().from(cashbookEntryItems)).map((r) => r.itemName)).toEqual([
      '바꾼 품목',
    ])
    expect(await db.select().from(cashbookEntryHuntInputs)).toEqual([])
    expect(await db.select().from(cashbookEntryFragmentUses)).toEqual([])
  })

  // 남의 줄 id 로 보내 그 기록의 딸린 줄을 바꾸거나, 남의 메이플 ID 아래 캐릭터를 자기 기록에 붙이지 못해야 한다.
  it('남의 메이플 ID · 남의 캐릭터 · 남의 줄 id 는 MapleIdNotOwned 이고 아무것도 바꾸지 않는다', async () => {
    const mine = input()
    await repo.upsert(mine)
    await repo.upsert(
      input({
        nexonAccountId: other.nexonAccountId,
        mapleId: 'm-other',
        ocid: 'o-other',
        transferInput: null,
        fragmentUses: [],
      }),
    )

    await expect(repo.upsert(input({ mapleId: 'm-other' }))).rejects.toBeInstanceOf(MapleIdNotOwned)
    await expect(repo.upsert(input({ ocid: 'o-other' }))).rejects.toBeInstanceOf(MapleIdNotOwned)
    await expect(
      repo.upsert({
        ...mine,
        nexonAccountId: other.nexonAccountId,
        mapleId: 'm-other',
        ocid: null,
        transferInput: null,
        fragmentUses: [],
        items: [item({ itemName: '남이 바꾼 품목' })],
      }),
    ).rejects.toBeInstanceOf(MapleIdNotOwned)
    await repo.markDeleted(other, mine.id)

    const entry = (await db.select().from(cashbookEntries)).find((r) => r.id === mine.id)
    expect(entry?.deletedAt).toBeNull()
    expect(
      (
        await db.select().from(cashbookEntryItems).where(eq(cashbookEntryItems.entryId, mine.id))
      ).map((r) => r.itemName),
    ).toEqual(['직접 친 품목'])
  })

  it('계정을 지우면 그 메이플 ID 의 기록과 딸린 줄이 지워진다', async () => {
    await repo.upsert(input())

    await db.delete(users).where(eq(users.id, me.userId))

    expect(await db.select().from(cashbookEntries)).toEqual([])
    expect(await db.select().from(cashbookEntryItems)).toEqual([])
  })
})
