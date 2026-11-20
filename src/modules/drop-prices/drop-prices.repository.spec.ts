import { randomUUID } from 'node:crypto'

import {
  bossDifficulties,
  bossDifficultyRewards,
  bossDrops,
  bossProfitEntries,
  bosses,
  characters,
  dropBoxContents,
  dropBoxes,
  dropSalePrices,
  items,
  mapleIds,
  nexonAccounts,
  ringLevelItems,
  users,
  worlds,
} from '../../database/schema'
import { describeDb, insertAsset, openTestDb, type TestDb } from '../../database/test-db'
import { type DropPriceFilter, DropPricesRepository } from './drop-prices.repository'

const ALL: DropPriceFilter = { itemKey: null, periodCode: null, source: 'all' }

describeDb('DropPricesRepository', () => {
  let db: TestDb
  let close: () => Promise<void>
  let truncate: () => Promise<void>
  let repo: DropPricesRepository
  const ids = { boxed: randomUUID(), direct: randomUUID(), old: randomUUID() }

  beforeAll(async () => {
    ;({ db, close, truncate } = await openTestDb())
    repo = new DropPricesRepository(db)
  })
  afterAll(() => close())

  /**
   * 루시드 하드의 수익 건 하나에 상자에서 나온 반지 4레벨과 직접 떨어진 보석이 있고, 드롭 기록 없이 옮겨 온 옛 판매가 줄이
   * 하나 있다. 반지 상자는 원래 반지를 담고, 판매가 줄은 레벨 줄을 가리킨다.
   */
  beforeEach(async () => {
    await truncate()
    const portrait = await insertAsset(db, 'bosses/lucid.webp')
    const [boss] = await db
      .insert(bosses)
      .values({
        key: 'lucid',
        name: '루시드',
        shortName: '루시드',
        isSeasonBoss: false,
        portraitAssetId: portrait,
        sortOrder: 0,
      })
      .returning({ id: bosses.id })
    const [difficulty] = await db
      .insert(bossDifficulties)
      .values({ bossId: boss.id, difficulty: 'hard', cycle: 'weekly', requiredLevel: 220 })
      .returning({ id: bossDifficulties.id })
    const made = await db
      .insert(items)
      .values([
        { key: 'ring', name: '반지', isDrop: true },
        { key: 'ring_lv4', name: '반지 4레벨', isDrop: true },
        { key: 'ring_box', name: '반지 상자', isDrop: true },
        { key: 'gem', name: '보석', isDrop: true },
      ])
      .returning({ id: items.id, key: items.key })
    const item = Object.fromEntries(made.map((r) => [r.key, r.id]))
    await db
      .insert(ringLevelItems)
      .values({ itemId: item.ring_lv4, ringItemId: item.ring, ringLevel: 4 })
    const [box] = await db
      .insert(dropBoxes)
      .values({ itemId: item.ring_box, ringLevelMin: 1, ringLevelMax: 4 })
      .returning({ id: dropBoxes.id })
    await db.insert(dropBoxContents).values({ boxId: box.id, itemId: item.ring, sortOrder: 0 })
    await db.insert(bossDifficultyRewards).values({
      bossDifficultyId: difficulty.id,
      category: 'equipment',
      itemId: item.ring_box,
      sortOrder: 0,
    })
    const [world] = await db
      .insert(worlds)
      .values({ key: 'scania', name: '스카니아', sortOrder: 0 })
      .returning({ id: worlds.id })

    const [user] = await db.insert(users).values({}).returning({ id: users.id })
    const [account] = await db
      .insert(nexonAccounts)
      .values({ userId: user.id, uidHash: 'u'.repeat(64), referralCode: 'AAAAAAAA' })
      .returning({ id: nexonAccounts.id })
    const [maple] = await db
      .insert(mapleIds)
      .values({ nexonAccountId: account.id, hash: 'm1' })
      .returning({ id: mapleIds.id })
    const [character] = await db
      .insert(characters)
      .values({ mapleId: maple.id, ocid: 'o1' })
      .returning({ id: characters.id })
    const entry = randomUUID()
    await db.insert(bossProfitEntries).values({
      id: entry,
      characterId: character.id,
      bossId: boss.id,
      bossDifficultyId: difficulty.id,
      periodCode: 'W202647',
      splitFeeFollowsMvpGrade: true,
    })
    const pricedAt = new Date('2026-11-20T03:00:00Z')
    const drop = (id: string, itemId: string, salePriceMeso: number) => ({
      id,
      profitEntryId: entry,
      itemId,
      category: 'equipment' as const,
      priceStatus: 'entered' as const,
      salePriceMeso,
      saleReceivedMeso: salePriceMeso,
      pricedAt,
      saleFeeFollowsMvpGrade: false,
      splitFeeFollowsMvpGrade: false,
    })
    await db
      .insert(bossDrops)
      .values([drop(ids.boxed, item.ring_lv4, 300), drop(ids.direct, item.gem, 100)])
    await db.insert(dropSalePrices).values([
      {
        id: ids.boxed,
        userId: user.id,
        itemId: item.ring_lv4,
        worldId: world.id,
        salePriceMeso: 300,
        pricedAt,
      },
      {
        id: ids.direct,
        userId: user.id,
        itemId: item.gem,
        worldId: world.id,
        salePriceMeso: 100,
        pricedAt,
      },
      {
        id: ids.old,
        userId: null,
        itemId: item.gem,
        worldId: world.id,
        salePriceMeso: 200,
        pricedAt,
      },
    ])
  })

  // 판매가 줄에는 보스 · 기간 · 상자가 없다. 드롭 기록을 따라가 보이고, 드롭 기록이 없는 옛 줄은 비어 보인다.
  it('줄마다 드롭 기록의 보스 · 난이도 · 기간과, 수익 건의 난이도가 주는 상자로 가른 획득처를 붙인다', async () => {
    const rows = await repo.recent(ALL, 10)

    expect(
      Object.fromEntries(
        rows.map((r) => [
          r.id,
          [r.itemKey, r.bossName, r.difficulty, r.periodCode, r.source, r.boxKey, r.identity],
        ]),
      ),
    ).toEqual({
      [ids.boxed]: ['ring_lv4', '루시드', 'hard', 'W202647', 'box', 'ring_box', 'login'],
      [ids.direct]: ['gem', '루시드', 'hard', 'W202647', 'direct', null, 'login'],
      [ids.old]: ['gem', null, null, null, 'unknown', null, null],
    })
  })

  it('획득처 · 상자 · 기간 · 아이템 이름으로 거르고, 아이템 목록은 가격 셋을 세며, 기간 목록은 드롭 기록의 기간이다', async () => {
    const idsOf = async (filter: Partial<DropPriceFilter>) =>
      (await repo.recent({ ...ALL, ...filter }, 10)).map((r) => r.id).sort()

    expect(await idsOf({ source: 'box' })).toEqual([ids.boxed])
    expect(await idsOf({ source: 'ring_box' })).toEqual([ids.boxed])
    expect(await idsOf({ source: 'unknown' })).toEqual([ids.old])
    expect(await idsOf({ periodCode: 'W202647' })).toEqual([ids.boxed, ids.direct].sort())
    expect(await idsOf({ itemKey: '보석' })).toEqual([ids.direct, ids.old].sort())
    expect(await repo.items({ ...ALL, itemKey: 'gem' })).toEqual([
      { itemKey: 'gem', itemName: '보석', count: 2, min: 100, median: 150, max: 200 },
    ])
    expect(await repo.periods()).toEqual(['W202647'])
  })
})
