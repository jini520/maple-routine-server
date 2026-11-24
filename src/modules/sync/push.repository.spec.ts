import { randomUUID } from 'node:crypto'

import { eq, sql } from 'drizzle-orm'
import { Pool } from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'

import { sha256Hex } from '../../common/hash'
import {
  accountSettings,
  bossDrops,
  bossProfitCalculatorRecords,
  bossProfitEntries,
  cashbookEntries,
  cashbookEntryFragmentUses,
  cashbookEntryTransferInputs,
  characters,
  characterWorldLeaps,
  dropSalePrices,
  enhancementSettledDays,
  enhancementTotals,
  manualTrackedItems,
  mapleIds,
  partyAppointmentBosses,
  partyAppointmentExceptions,
  sharedContentProgress,
  trackedCharacters,
  users,
} from '../../database/schema'
import * as schema from '../../database/schema'
import {
  type ClearedDropTables,
  describeDb,
  insertAsset,
  insertClearedDropTables,
  insertNexonAccount,
  insertRecordReferences,
  openTestDb,
  type RecordReferences,
  TEST_DATABASE_URL,
  type TestDb,
} from '../../database/test-db'
import type { IdentityContext } from '../identity/identity.guard'
import { lockOwners } from '../users/owner-locks'
import { SyncPushRepository } from './push.repository'

const M_ME = sha256Hex('m-me')
const M_SUB = sha256Hex('m-sub')
const M_OTHER = sha256Hex('m-other')
const O_ME = sha256Hex('o-me')
const O_ALT = sha256Hex('o-alt')
const O_NEW = sha256Hex('o-new')

describeDb('SyncPushRepository', () => {
  let db: TestDb
  let close: () => Promise<void>
  let truncate: () => Promise<void>
  let repo: SyncPushRepository
  let ref: RecordReferences
  let me: IdentityContext
  let other: IdentityContext

  /** 처치한 수익 건. 기본은 내 캐릭터가 이번 주 루시드 하드를 잡은 줄이다. */
  const entry = (over: Record<string, unknown> = {}) => ({
    id: randomUUID(),
    mapleId: M_ME,
    ocid: O_ME,
    bossDifficultyId: ref.hard,
    periodCode: 'W202647',
    worldId: ref.worldId,
    crystalPriceMeso: 300,
    crystalReceivedMeso: 150,
    splitType: 'even',
    partySize: 2,
    splitShareMillipercent: null,
    splitFeePercent: null,
    splitFeeFollowsMvpGrade: false,
    clearedDate: '2026-11-20',
    clearRecordedBy: 'auto',
    ...over,
  })
  /** 가격을 적은 드롭 */
  const drop = (profitEntryId: string, over: Record<string, unknown> = {}) => ({
    id: randomUUID(),
    profitEntryId,
    itemId: ref.itemId,
    category: 'equipment',
    priceStatus: 'entered',
    salePriceMeso: 1_000,
    saleReceivedMeso: 500,
    pricedAt: '2026-11-20T03:00:00Z',
    saleFeePercent: null,
    saleFeeFollowsMvpGrade: false,
    splitType: 'even',
    partySize: 2,
    splitShareMillipercent: null,
    splitFeePercent: null,
    splitFeeFollowsMvpGrade: false,
    ...over,
  })
  const total = (over: Record<string, unknown> = {}) => ({
    id: randomUUID(),
    mapleId: M_ME,
    ocid: O_ME,
    historyDate: '2026-10-20',
    category: 'cube_reset',
    itemName: '아케인셰이드 클로',
    attemptCount: 2,
    attemptCostMeso: 900_000,
    destroyDefenceCostMeso: 0,
    worldId: null,
    superiorCostMeso: null,
    fromStar: null,
    toStar: null,
    isEventWorld: false,
    ...over,
  })
  /** 주간 보스 수입 이전 기록. 기본은 내 캐릭터가 메소를 옮긴 기록이다. */
  const transfer = (transferInput: Record<string, unknown>) => ({
    id: randomUUID(),
    mapleId: M_ME,
    ocid: O_ME,
    categoryId: ref.categoryId,
    date: '2026-11-20',
    recordedAt: '2026-11-20T03:00:00Z',
    items: [{ itemName: '주간 보스 수입 이전', amountMeso: -5 }],
    transferInput: { transferMeso: 100, feeFollowsMvpGrade: true, ...transferInput },
  })
  const upsert = (table: string, row: object) => ({ table, action: 'upsert', row })
  const remove = (table: string, row: object) => ({ table, action: 'delete', row })
  const push = (identity: IdentityContext, ...records: object[]) => repo.push(identity, records)
  /** 표의 줄마다 줄 id · 변경 번호 · 고친 시각. 줄 id 차례다. */
  const stamps = async (table: string) =>
    (
      await db.execute<{ id: string; change_seq: string; updated_at: Date }>(
        sql.raw(`SELECT id, change_seq, updated_at FROM ${table} ORDER BY id`),
      )
    ).rows
  const maxSeq = (rows: { change_seq: string }[]) =>
    Math.max(...rows.map((row) => Number(row.change_seq)))

  beforeAll(async () => {
    ;({ db, close, truncate } = await openTestDb())
    repo = new SyncPushRepository(db)
  })
  beforeEach(async () => {
    await truncate()
    ref = await insertRecordReferences(db)
    const mine = await insertNexonAccount(db, [M_ME])
    const theirs = await insertNexonAccount(db, [M_OTHER])
    me = { userId: mine.userId, source: 'login', nexonAccountId: mine.nexonAccountId }
    other = { userId: theirs.userId, source: 'key', nexonAccountId: theirs.nexonAccountId }
  })
  afterAll(() => close())

  // 같은 기록을 두 기기가 고치면 나중에 도착한 쪽이 남는다. 기기 시계는 틀릴 수 있어 시각을 견주지 않는다.
  it('같은 기록 id 는 나중에 도착한 값으로 덮고, 보스 줄은 난이도에서 채운다', async () => {
    const first = entry()
    await push(me, upsert('bossProfitEntries', first))
    const [result] = await push(
      me,
      upsert('bossProfitEntries', { ...first, crystalReceivedMeso: 100 }),
    )

    expect(result).toEqual({ recordId: first.id, ok: true, id: first.id })
    const rows = await db.select().from(bossProfitEntries)
    expect(rows.map((r) => [r.id, r.bossId, r.crystalReceivedMeso])).toEqual([
      [first.id, ref.bossId, 100],
    ])
  })

  // 남의 메이플 ID 를 아는 사람이 그 기록을 덮거나 막지 못한다. 남이 먼저 쓴 id 로 보내도 그 줄을 덮지 않는다.
  it('남의 메이플 ID 는 maple_id_not_registered 로, 남의 줄의 기록 id 는 코드 없이 거절하고 적지 않는다', async () => {
    const theirs = entry({ mapleId: M_OTHER, ocid: O_ALT })
    await push(other, upsert('bossProfitEntries', theirs))

    const results = await push(
      me,
      upsert('bossProfitEntries', entry({ mapleId: M_OTHER, ocid: O_ALT })),
      upsert('bossProfitEntries', { ...theirs, mapleId: M_ME, ocid: O_ME }),
    )

    expect(results.map((r) => (r.ok ? null : r.code))).toEqual(['maple_id_not_registered', null])
    expect(results.every((r) => !r.ok)).toBe(true)
    const rows = await db.select().from(bossProfitEntries)
    expect(rows.map((r) => [r.id, r.crystalReceivedMeso])).toEqual([[theirs.id, 150]])
  })

  // 넥슨이 준 처치를 두 기기가 각자 올리면 같은 기록이다. 먼저 온 줄을 두고 그 id 를 알려 줘 기기가 자기 id 를 바꾼다.
  it('유일 기준이 같고 내용도 같으면 받고 먼저 있던 줄의 id 를 돌려주며, 내용이 다르면 duplicate_record 다', async () => {
    const first = entry()
    await push(me, upsert('bossProfitEntries', first))

    const [same, differs] = await push(
      me,
      upsert('bossProfitEntries', entry()),
      upsert('bossProfitEntries', entry({ crystalReceivedMeso: 1 })),
    )

    expect(same).toEqual(expect.objectContaining({ ok: true, id: first.id }))
    expect(differs).toEqual(expect.objectContaining({ ok: false, code: 'duplicate_record' }))
    expect(await db.select({ id: bossProfitEntries.id }).from(bossProfitEntries)).toEqual([
      { id: first.id },
    ])
  })

  // 이미 올린 기록을 고쳐 다른 줄과 같은 기록이 되면 그 줄로 합쳐진다. 고친 줄이 남으면 다른 기기에 옛 값으로 남는다.
  it('고친 수익 건이 내용까지 같은 다른 줄과 겹치면 그 줄의 id 를 돌려주고, 고친 줄은 지우며 그 드롭은 남는 줄로 옮긴다', async () => {
    const kept = entry()
    const edited = entry({
      bossDifficultyId: ref.normal,
      crystalPriceMeso: null,
      crystalReceivedMeso: null,
      clearedDate: null,
      clearRecordedBy: null,
      splitFeeFollowsMvpGrade: true,
    })
    const moved = drop(edited.id)
    await push(
      me,
      upsert('bossProfitEntries', kept),
      upsert('bossProfitEntries', edited),
      upsert('bossDrops', moved),
    )

    const [result] = await push(me, upsert('bossProfitEntries', { ...entry(), id: edited.id }))

    expect(result).toEqual(expect.objectContaining({ ok: true, id: kept.id }))
    const entries = await db.select().from(bossProfitEntries)
    expect(entries.map((r) => [r.id, r.deletedAt === null]).sort()).toEqual(
      [
        [kept.id, true],
        [edited.id, false],
      ].sort(),
    )
    const [dropRow] = await db.select().from(bossDrops)
    expect([dropRow?.profitEntryId, dropRow?.deletedAt]).toEqual([kept.id, null])
  })

  // 한 캐릭터는 한 기간에 한 보스를 한 번만 잡는다. 처치 전 줄은 다른 난이도로 함께 있을 수 있다.
  it('같은 기간 · 보스를 다른 난이도로 잡은 처치는 duplicate_record 이고, 처치 전 줄은 다른 난이도로 받는다', async () => {
    await push(me, upsert('bossProfitEntries', entry()))
    const notCleared = {
      crystalPriceMeso: null,
      crystalReceivedMeso: null,
      clearedDate: null,
      clearRecordedBy: null,
      // 처치 전 줄의 수수료는 자동이면 요율이 빈다.
      splitFeeFollowsMvpGrade: true,
    }

    const results = await push(
      me,
      upsert('bossProfitEntries', entry({ bossDifficultyId: ref.normal })),
      upsert('bossProfitEntries', entry({ bossDifficultyId: ref.normal, ...notCleared })),
    )

    expect(results.map((r) => (r.ok ? 'ok' : r.code))).toEqual(['duplicate_record', 'ok'])
  })

  // 다른 기기가 지운 기록을 고쳐 올리면 지운 것이 이긴다. 기기는 그 줄을 지우고 알린다.
  it('지우기는 삭제 표식을 적고, 표식이 선 기록의 수정은 record_deleted 다', async () => {
    const first = entry()
    await push(me, upsert('bossProfitEntries', first))

    const [removed] = await push(me, remove('bossProfitEntries', { id: first.id }))
    const [edited] = await push(me, upsert('bossProfitEntries', { ...first, partySize: 3 }))

    expect(removed).toEqual(expect.objectContaining({ ok: true, id: first.id }))
    expect(edited).toEqual(expect.objectContaining({ ok: false, code: 'record_deleted' }))
    const [row] = await db.select().from(bossProfitEntries)
    expect([row?.partySize, row?.deletedAt]).toEqual([2, expect.any(Date)])
  })

  // 통째로 거절하면 앱이 같은 묶음을 계속 다시 보내 그 사용자의 올리기가 멈춘다.
  it('한 건이 거절돼도 같은 요청의 나머지 건은 적고, 결과는 올린 차례대로 돌려준다', async () => {
    const good = entry()
    const results = await push(
      me,
      { table: 'unknownTable', action: 'upsert', row: {} },
      upsert('bossProfitEntries', { ...entry(), periodCode: 'M202611' }),
      upsert('bossProfitEntries', good),
      remove('accountSettings', {}),
    )

    expect(results.map((r) => (r.ok ? r.id : null))).toEqual([null, null, good.id, null])
  })

  // 판매가는 시세를 재는 표라 서버가 드롭을 받을 때 적는다. 지운 처치의 판매가가 시세에 남으면 안 된다.
  it('가격을 적은 드롭은 판매가 줄을 적고, 수익 건을 지우면 그 드롭에 표식을 적고 판매가 줄을 지운다', async () => {
    const first = entry()
    const priced = drop(first.id)
    await push(me, upsert('bossProfitEntries', first), upsert('bossDrops', priced))
    const sale = await db.select().from(dropSalePrices)
    expect(sale.map((r) => [r.id, r.userId, r.worldId, r.salePriceMeso])).toEqual([
      [priced.id, me.userId, ref.worldId, 1_000],
    ])

    await push(me, remove('bossProfitEntries', { id: first.id }))

    const [gone] = await db.select().from(bossDrops)
    expect(gone?.deletedAt).toEqual(expect.any(Date))
    expect(await db.select().from(dropSalePrices)).toEqual([])
  })

  // 기기 시계가 앞서면 판매가가 아직 오지 않은 날의 시세에 잡힌다. 드롭 기록은 기기가 적은 값 그대로 둔다.
  it('판매가 줄의 거래 시각이 미래면 지금으로 자르고, 드롭의 거래 시각은 그대로 둔다', async () => {
    const first = entry()
    const priced = { ...drop(first.id), pricedAt: '2099-01-01T00:00:00Z' }
    await push(me, upsert('bossProfitEntries', first), upsert('bossDrops', priced))

    // 지금은 DB 의 시계다. 테스트를 돌리는 쪽의 시계와 조금 어긋나도 되게 1분 안인지만 본다.
    const [sale] = await db.select().from(dropSalePrices)
    expect(Math.abs(sale.pricedAt.getTime() - Date.now())).toBeLessThan(60_000)
    const [kept] = await db.select().from(bossDrops)
    expect(kept?.pricedAt?.toISOString()).toBe('2099-01-01T00:00:00.000Z')
  })

  // 옛 DB 에서 옮겨 온 같은 id 의 판매가 줄은 요청한 사람의 것이거나 사람이 빈 줄일 때만 덮는다.
  it('같은 id 의 남의 판매가 줄은 덮지 않고, 가격을 지우면 내 판매가 줄만 지운다', async () => {
    const first = entry()
    const priced = drop(first.id)
    await db.insert(dropSalePrices).values({
      id: priced.id,
      userId: other.userId,
      itemId: ref.itemId,
      salePriceMeso: 7,
      pricedAt: new Date('2026-11-01T00:00:00Z'),
    })

    await push(me, upsert('bossProfitEntries', first), upsert('bossDrops', priced))
    await push(
      me,
      upsert('bossDrops', {
        ...priced,
        priceStatus: 'pending',
        salePriceMeso: null,
        saleReceivedMeso: null,
        pricedAt: null,
      }),
    )

    expect(
      (await db.select().from(dropSalePrices)).map((r) => [r.userId, r.salePriceMeso]),
    ).toEqual([[other.userId, 7]])
  })

  // 앱은 수익 건을 먼저 올린다. 수익 건이 아직 없으면 다음 회차에 맞을 수 있어 코드 없이 거절하고 앱이 다시 보낸다.
  it('수익 건이 없는 드롭은 코드 없이 거절하고, 지운 수익 건의 드롭은 record_deleted 다', async () => {
    const first = entry()
    await push(
      me,
      upsert('bossProfitEntries', first),
      remove('bossProfitEntries', { id: first.id }),
    )

    const results = await push(
      me,
      upsert('bossDrops', drop(randomUUID())),
      upsert('bossDrops', drop(first.id)),
    )

    expect(results.map((r) => (r.ok ? 'ok' : r.code))).toEqual([null, 'record_deleted'])
  })

  // 드롭은 아이템 줄 id 하나만 들어 참조로는 그 보스의 것인지 못 막는다. 처치 전 수익 건에는 다른 난이도에서 고른 드롭도 적힌다.
  it('드롭은 그 보스에서 얻을 수 있는 아이템만 받는다. 다른 난이도의 드롭 · 상자 내용물 · 레벨 범위 안의 반지 레벨 줄은 받고, 다른 보스의 아이템 · 드롭 표에 없는 아이템 · 범위 밖의 레벨 줄은 코드 없이 거절한다', async () => {
    const madeItems = await db
      .insert(schema.items)
      .values(
        ['normal-only', 'ring-box', 'box-content', 'ring', 'ring_lv4', 'ring_lv1', 'will-only'].map(
          (key) => ({ key, name: key }),
        ),
      )
      .returning({ id: schema.items.id, key: schema.items.key })
    const item = Object.fromEntries(madeItems.map((r) => [r.key, r.id]))
    const [box] = await db
      .insert(schema.dropBoxes)
      .values({ itemId: item['ring-box'], ringLevelMin: 3, ringLevelMax: 4 })
      .returning({ id: schema.dropBoxes.id })
    await db.insert(schema.dropBoxContents).values([
      { boxId: box.id, itemId: item['box-content'], sortOrder: 0 },
      { boxId: box.id, itemId: item.ring, sortOrder: 1 },
    ])
    await db.insert(schema.ringLevelItems).values([
      { itemId: item.ring_lv4, ringItemId: item.ring, ringLevel: 4 },
      { itemId: item.ring_lv1, ringItemId: item.ring, ringLevel: 1 },
    ])
    const [will] = await db
      .insert(schema.bosses)
      .values({
        key: 'will',
        name: '윌',
        shortName: '윌',
        isSeasonBoss: false,
        portraitAssetId: await insertAsset(db, 'bosses/will.webp'),
        sortOrder: 1,
      })
      .returning({ id: schema.bosses.id })
    const [willHard] = await db
      .insert(schema.bossDifficulties)
      .values({ bossId: will.id, difficulty: 'hard', cycle: 'weekly', requiredLevel: 235 })
      .returning({ id: schema.bossDifficulties.id })
    const reward = (bossDifficultyId: string, itemId: string) => ({
      bossDifficultyId,
      category: 'equipment' as const,
      itemId,
      sortOrder: 0,
    })
    await db
      .insert(schema.bossDifficultyRewards)
      .values([
        reward(ref.normal, item['normal-only']),
        reward(ref.normal, item['ring-box']),
        reward(willHard.id, item['will-only']),
      ])
    // 처치한 수익 건이면 받은 뒤 처치 난이도로 가려 지워진다. 받는지만 보려고 처치 전 수익 건에 올린다.
    const hard = entry({
      crystalPriceMeso: null,
      crystalReceivedMeso: null,
      clearedDate: null,
      clearRecordedBy: null,
      splitFeeFollowsMvpGrade: true,
    })
    await push(me, upsert('bossProfitEntries', hard))

    const results = await push(
      me,
      ...[
        item['normal-only'],
        item['box-content'],
        item.ring_lv4,
        item['will-only'],
        ref.otherItemId,
        item.ring_lv1,
      ].map((itemId) => upsert('bossDrops', drop(hard.id, { itemId }))),
    )

    expect(results.map((r) => (r.ok ? 'ok' : r.code))).toEqual(['ok', 'ok', 'ok', null, null, null])
    expect((await db.select().from(bossDrops)).filter((r) => r.deletedAt === null)).toHaveLength(3)
  })

  // 합계 표의 유일 기준은 지운 줄도 쥔다. 데이터 삭제 뒤 넥슨에서 다시 받은 합계가 새 id 로 와도 받아야 한다.
  it('같은 합계의 지운 줄이 있으면 받은 값으로 되살리고 그 줄의 id 를 돌려준다', async () => {
    const first = total()
    await push(
      me,
      upsert('enhancementTotals', first),
      remove('enhancementTotals', { id: first.id }),
    )

    const [result] = await push(me, upsert('enhancementTotals', total({ attemptCount: 5 })))

    expect(result).toEqual(expect.objectContaining({ ok: true, id: first.id }))
    const rows = await db.select().from(enhancementTotals)
    expect(rows.map((r) => [r.id, r.attemptCount, r.deletedAt])).toEqual([[first.id, 5, null]])
  })

  // 기기는 캐릭터 줄 id 를 몰라 해시를 싣는다. 같은 ocid 의 기록은 한 캐릭터 줄을 가리켜야 리프 때 그 줄만 고친다.
  it('처음 보는 ocid 는 캐릭터 줄을 만들고, 다른 메이플 ID 아래의 ocid 는 maple_id_not_registered 다', async () => {
    await push(other, upsert('enhancementTotals', total({ mapleId: M_OTHER, ocid: O_ALT })))

    const results = await push(
      me,
      upsert('enhancementTotals', total()),
      upsert('enhancementTotals', total({ historyDate: '2026-10-21' })),
      upsert('enhancementTotals', total({ ocid: O_ALT })),
    )

    expect(results.map((r) => (r.ok ? 'ok' : r.code))).toEqual([
      'ok',
      'ok',
      'maple_id_not_registered',
    ])
    expect((await db.select().from(characters)).map((r) => r.ocid).sort()).toEqual(
      [O_ME, O_ALT].sort(),
    )
  })

  // 부계정의 기록은 로그인의 세션으로 온다. 로그인에 등록된 부계정의 메이플 ID 는 그 사람의 것이다.
  it('로그인에 등록된 부계정의 메이플 ID 로 온 기록을 받는다', async () => {
    const sub = await insertNexonAccount(db, [M_SUB])
    await db.insert(schema.subAccountRegistrations).values({
      loginNexonAccountId: me.nexonAccountId,
      subNexonAccountId: sub.nexonAccountId,
    })

    const [result] = await push(me, upsert('enhancementTotals', total({ mapleId: M_SUB })))

    expect(result?.ok).toBe(true)
  })

  // 손으로 적는 기록이라 같은 날 같은 물건을 두 번 산 기록도 맞다. 딸린 줄이 남으면 지운 품목이 다른 기기에 남는다.
  it('가계부 기록은 내용으로 가리지 않고, 다시 보내면 딸린 줄을 갈아 끼우며 기록의 캐릭터를 캐릭터 줄로 적는다', async () => {
    const record = {
      id: randomUUID(),
      mapleId: M_ME,
      ocid: O_ME,
      categoryId: ref.categoryId,
      date: '2026-11-20',
      memo: '메모',
      recordedAt: '2026-11-20T03:00:00Z',
      items: [{ itemName: '직접 친 품목', amountMeso: -1_000 }],
      transferInput: {
        receiverMapleId: M_ME,
        receiverOcid: O_ALT,
        transferMeso: 100,
        feeFollowsMvpGrade: true,
      },
      fragmentUses: [{ fragmentSource: 'hunt', ocid: O_ALT, fragmentQuantity: 3 }],
    }
    await push(
      me,
      upsert('cashbookEntries', record),
      upsert('cashbookEntries', { ...record, id: randomUUID() }),
    )

    await push(me, upsert('cashbookEntries', { ...record, transferInput: null, fragmentUses: [] }))

    expect(await db.select({ id: cashbookEntries.id }).from(cashbookEntries)).toHaveLength(2)
    expect(
      await db
        .select()
        .from(cashbookEntryTransferInputs)
        .where(eq(cashbookEntryTransferInputs.entryId, record.id)),
    ).toEqual([])
    expect(await db.select().from(cashbookEntryFragmentUses)).toHaveLength(1)
    const [entryRow] = await db
      .select()
      .from(cashbookEntries)
      .where(eq(cashbookEntries.id, record.id))
    const [character] = await db.select().from(characters).where(eq(characters.ocid, O_ME))
    expect(entryRow?.characterId).toBe(character?.id)
  })

  // 받는 캐릭터는 보통 다른 계정의 캐릭터다. 기록의 메이플 ID 로 찾으면 다른 메이플 ID 아래의 받는 캐릭터는 거절되고, 처음 보는
  // 받는 캐릭터는 보내는 쪽 메이플 ID 아래에 줄이 생겨 그 캐릭터 자신의 기록이 거절된다.
  it('받는 캐릭터는 몸에 실은 메이플 ID 아래의 캐릭터 줄로 적고, 처음 보는 받는 캐릭터의 기록도 이어서 받는다', async () => {
    const sub = await insertNexonAccount(db, [M_SUB])
    await db.insert(schema.subAccountRegistrations).values({
      loginNexonAccountId: me.nexonAccountId,
      subNexonAccountId: sub.nexonAccountId,
    })
    await push(me, upsert('enhancementTotals', total({ mapleId: M_SUB, ocid: O_ALT })))
    const known = transfer({ receiverMapleId: M_SUB, receiverOcid: O_ALT })
    const unseen = transfer({ receiverMapleId: M_SUB, receiverOcid: O_NEW })

    const results = await push(
      me,
      upsert('cashbookEntries', known),
      upsert('cashbookEntries', unseen),
      upsert('enhancementTotals', total({ mapleId: M_SUB, ocid: O_NEW })),
    )

    expect(results.map((r) => (r.ok ? 'ok' : r.code))).toEqual(['ok', 'ok', 'ok'])
    const receivers = await db
      .select({
        entryId: cashbookEntryTransferInputs.entryId,
        ocid: characters.ocid,
        mapleId: mapleIds.hash,
      })
      .from(cashbookEntryTransferInputs)
      .innerJoin(characters, eq(characters.id, cashbookEntryTransferInputs.receiverCharacterId))
      .innerJoin(mapleIds, eq(mapleIds.id, characters.mapleId))
    expect(receivers.map((r) => [r.entryId, r.ocid, r.mapleId]).sort()).toEqual(
      [
        [known.id, O_ALT, M_SUB],
        [unseen.id, O_NEW, M_SUB],
      ].sort(),
    )
  })

  // 받는 캐릭터의 메이플 ID 도 보낸 신원의 것이어야 한다. 메이플 ID 없이 온 ocid 는 어느 메이플 ID 아래에 둘지 모른다.
  it('받는 캐릭터의 메이플 ID 가 신원의 것이 아니면 maple_id_not_registered 이고, 받는 캐릭터의 ocid 와 메이플 ID 는 함께 차거나 함께 빈다', async () => {
    await push(other, upsert('enhancementTotals', total({ mapleId: M_OTHER, ocid: O_ALT })))
    const empty = transfer({ receiverMapleId: null, receiverOcid: null })

    const results = await push(
      me,
      upsert('cashbookEntries', transfer({ receiverMapleId: M_OTHER, receiverOcid: O_ALT })),
      upsert('cashbookEntries', transfer({ receiverOcid: O_NEW })),
      upsert('cashbookEntries', transfer({ receiverMapleId: M_ME, receiverOcid: null })),
      upsert('cashbookEntries', empty),
    )

    expect(results.map((r) => (r.ok ? 'ok' : r.code))).toEqual([
      'maple_id_not_registered',
      null,
      null,
      'ok',
    ])
    expect(await db.select({ id: cashbookEntries.id }).from(cashbookEntries)).toEqual([
      { id: empty.id },
    ])
  })

  // 유일 기준이 같은 다른 기록은 적기 전에 찾아 duplicate_record 로 답한다. 한 기록 안에서 딸린 줄끼리 겹친 것은 기록의 모양이
  // 틀린 것이다. duplicate_record 로 답하면 앱이 결정대로 자기 기록을 지워 사용자가 적은 기록이 사라진다.
  it('한 기록 안의 딸린 줄끼리 겹치면 코드 없이 거절하고 그 기록은 적지 않는다', async () => {
    const record = (over: Record<string, unknown>) => ({
      id: randomUUID(),
      mapleId: M_ME,
      ocid: O_ME,
      categoryId: ref.categoryId,
      date: '2026-11-20',
      recordedAt: '2026-11-20T03:00:00Z',
      items: [{ itemName: '품목', amountMeso: -1 }],
      ...over,
    })
    const boss = {
      bossDifficultyId: ref.hard,
      splitType: 'even',
      partySize: 2,
      splitFeeFollowsMvpGrade: false,
    }

    const results = await push(
      me,
      upsert(
        'cashbookEntries',
        record({
          items: [
            { itemName: '리워드 종류가 없는 품목 가', amountMeso: -1 },
            { itemName: '리워드 종류가 없는 품목 나', amountMeso: -2 },
          ],
        }),
      ),
      upsert(
        'cashbookEntries',
        record({
          fragmentUses: [
            { fragmentSource: 'hunt', ocid: O_ALT, fragmentQuantity: 1 },
            { fragmentSource: 'hunt', ocid: O_ALT, fragmentQuantity: 2 },
          ],
        }),
      ),
      upsert('bossProfitCalculatorRecords', {
        id: randomUUID(),
        savedAt: '2026-11-20T03:00:00Z',
        characters: [{ sortOrder: 0, mapleId: M_ME, ocid: O_ME, bosses: [boss, boss] }],
      }),
    )

    expect(results.map((r) => (r.ok ? 'ok' : r.code))).toEqual([null, null, null])
    expect(results.every((r) => !r.ok && r.reason !== '')).toBe(true)
    expect(await db.select().from(cashbookEntries)).toEqual([])
    expect(await db.select().from(bossProfitCalculatorRecords)).toEqual([])
  })

  // 품목의 대상 칸 하나가 여섯 표를 가리켜 DB 참조를 걸 수 없다. 종류와 다른 표의 id 를 받으면 기기마다 다른 대상으로 읽힌다.
  it('가계부 품목의 대상 id 가 종류가 말하는 표에 없으면 코드 없이 거절하고 그 기록은 적지 않는다', async () => {
    const [stat] = await db
      .insert(schema.hexaStats)
      .values({ key: 'boss_damage', name: '보스 데미지 증가', sortOrder: 0 })
      .returning({ id: schema.hexaStats.id })
    const record = (targetType: string, targetId: string) => ({
      id: randomUUID(),
      mapleId: M_ME,
      categoryId: ref.categoryId,
      date: '2026-11-20',
      recordedAt: '2026-11-20T03:00:00Z',
      items: [{ targetType, targetId, amountMeso: -1 }],
    })
    const kept = [record('item', ref.itemId), record('hexa_stat', stat.id)]

    const results = await push(
      me,
      ...kept.map((r) => upsert('cashbookEntries', r)),
      upsert('cashbookEntries', record('hexa_core', stat.id)),
      upsert('cashbookEntries', record('spend_item', ref.itemId)),
    )

    expect(results.map((r) => (r.ok ? 'ok' : r.code))).toEqual(['ok', 'ok', null, null])
    expect(
      (await db.select({ id: cashbookEntries.id }).from(cashbookEntries)).map((r) => r.id).sort(),
    ).toEqual(kept.map((r) => r.id).sort())
  })

  // 기록의 메이플 ID 는 캐릭터 줄에도 있다. 둘이 어긋난 기록을 받으면 메이플 ID 로 받는 기기와 캐릭터로 읽는 기기가 다른 기록을 본다.
  it('가계부 기록의 캐릭터가 몸의 메이플 ID 가 아닌 메이플 ID 아래에 있으면 maple_id_not_registered 다', async () => {
    const sub = await insertNexonAccount(db, [M_SUB])
    await db.insert(schema.subAccountRegistrations).values({
      loginNexonAccountId: me.nexonAccountId,
      subNexonAccountId: sub.nexonAccountId,
    })
    await push(me, upsert('enhancementTotals', total({ mapleId: M_SUB, ocid: O_ALT })))
    const record = (mapleId: string) => ({
      id: randomUUID(),
      mapleId,
      ocid: O_ALT,
      categoryId: ref.categoryId,
      date: '2026-11-20',
      recordedAt: '2026-11-20T03:00:00Z',
      items: [{ itemName: '품목', amountMeso: -1 }],
    })
    const matched = record(M_SUB)

    const results = await push(
      me,
      upsert('cashbookEntries', record(M_ME)),
      upsert('cashbookEntries', matched),
    )

    expect(results.map((r) => (r.ok ? 'ok' : r.code))).toEqual(['maple_id_not_registered', 'ok'])
    expect(await db.select({ id: cashbookEntries.id }).from(cashbookEntries)).toEqual([
      { id: matched.id },
    ])
  })

  // 대상 칸 하나가 심볼과 헥사 코어 두 표를 가리킨다. 종류와 다른 표의 id 를 받으면 폼이 엉뚱한 레벨을 채운다.
  it('기억한 레벨의 대상 id 가 종류가 말하는 표에 없으면 코드 없이 거절한다', async () => {
    const [group] = await db
      .insert(schema.symbolGroups)
      .values({
        key: 'arcane',
        name: '아케인',
        maxLevel: 20,
        defaultFromLevel: 1,
        defaultToLevel: 20,
        sortOrder: 0,
      })
      .returning({ id: schema.symbolGroups.id })
    const [symbol] = await db
      .insert(schema.symbols)
      .values({
        key: 'vanishing_journey',
        groupId: group.id,
        name: '소멸의 여로',
        requiredLevel: 200,
        iconAssetId: await insertAsset(db, 'items/vanishing_journey.png'),
        sortOrder: 0,
      })
      .returning({ id: schema.symbols.id })
    const level = (type: string, targetId: string) => ({
      id: randomUUID(),
      mapleId: M_ME,
      ocid: O_ME,
      type,
      targetId,
      level: 5,
    })

    const results = await push(
      me,
      upsert('rememberedLevels', level('symbol', symbol.id)),
      upsert('rememberedLevels', level('hexa', symbol.id)),
      upsert('rememberedLevels', level('symbol', ref.contentId)),
    )

    expect(results.map((r) => (r.ok ? 'ok' : r.code))).toEqual(['ok', null, null])
  })

  // 장비가 아닌 아이템은 메이플 ID · 월드 · 아이템마다 한 줄이다. 장비는 같은 아이템도 하나씩 따로라 기록 id 로 가린다.
  it('장비가 아닌 인벤토리 줄은 같은 아이템이면 duplicate_record 이고, 장비 줄은 따로 받는다', async () => {
    const item = (typeId: string, quantity: number) => ({
      id: randomUUID(),
      mapleId: M_ME,
      worldId: ref.worldId,
      itemId: ref.itemId,
      cashbookItemTypeId: typeId,
      addedQuantity: quantity,
    })
    await push(me, upsert('inventoryItems', item(ref.consumableTypeId, 3)))

    const results = await push(
      me,
      upsert('inventoryItems', item(ref.consumableTypeId, 4)),
      upsert('inventoryItems', item(ref.equipmentTypeId, 1)),
      upsert('inventoryItems', item(ref.equipmentTypeId, 1)),
    )

    expect(results.map((r) => (r.ok ? 'ok' : r.code))).toEqual(['duplicate_record', 'ok', 'ok'])
  })

  // 기기에 id 가 없는 Preferences 의 기록은 유일 기준으로 같은 줄을 가리킨다. 다시 더한 항목은 지운 줄을 되살린다.
  it('기기에 id 가 없는 표는 유일 기준이 같으면 덮고 서버의 줄 id 를 돌려준다', async () => {
    const tracked = { mapleId: M_ME, ocid: O_ME, type: 'boss', targetId: ref.hard }
    const progress = {
      mapleId: M_ME,
      worldId: null,
      contentId: ref.contentId,
      isRegistered: true,
      nowCount: 1,
      maxCount: 3,
      questState: null,
      periodCode: 'W202647',
    }
    const [added] = await push(me, upsert('manualTrackedItems', tracked))
    const [first] = await push(me, upsert('sharedContentProgress', progress))

    const results = await push(
      me,
      remove('manualTrackedItems', tracked),
      upsert('manualTrackedItems', tracked),
      upsert('sharedContentProgress', { ...progress, nowCount: 2 }),
      upsert('manualTrackedItems', { ...tracked, type: 'weekly', targetId: ref.hard }),
    )

    const ids = results.map((r) => (r.ok ? r.id : r.code))
    expect(ids).toEqual([added?.ok && added.id, added?.ok && added.id, first?.ok && first.id, null])
    const [trackedRow] = await db.select().from(manualTrackedItems)
    expect(trackedRow?.deletedAt).toBeNull()
    expect((await db.select().from(sharedContentProgress)).map((r) => r.nowCount)).toEqual([2])
  })

  // 두 기기가 서로 다른 설정을 고쳐 올려도 서로를 덮지 않는다.
  it('설정은 실은 칸만 고친다', async () => {
    await push(me, upsert('accountSettings', { trackingType: 'manual', isMvpWeeklyCheckOff: true }))
    await push(me, upsert('accountSettings', { quickLinkRowCount: 2 }))

    const rows = await db.select().from(accountSettings)
    expect(rows.map((r) => [r.trackingType, r.isMvpWeeklyCheckOff, r.quickLinkRowCount])).toEqual([
      ['manual', true, 2],
    ])
  })

  // 넥슨 계정마다 대표는 하나다. 앞 대표가 키가 없는 부계정의 캐릭터면 대표를 바꾼 기기는 그 줄을 몰라 거짓으로 올리지 못한다.
  it('대표로 올린 추적 캐릭터 말고 같은 넥슨 계정의 대표 표시는 내리고 그 줄의 변경 번호를 올리며, 다른 넥슨 계정의 대표는 두지 않는다', async () => {
    const tracked = (ocid: string, isRepresentative: boolean) => ({
      mapleId: M_ME,
      ocid,
      sortOrder: 0,
      isRepresentative,
    })
    await push(me, upsert('trackedCharacters', tracked(O_ME, true)))
    await push(other, upsert('trackedCharacters', { ...tracked(O_NEW, true), mapleId: M_OTHER }))
    const representatives = async () =>
      db
        .select({
          ocid: characters.ocid,
          isRepresentative: trackedCharacters.isRepresentative,
          changeSeq: trackedCharacters.changeSeq,
        })
        .from(trackedCharacters)
        .innerJoin(characters, eq(characters.id, trackedCharacters.characterId))
        .orderBy(trackedCharacters.changeSeq)
    const [before] = await representatives()

    await push(me, upsert('trackedCharacters', tracked(O_ALT, true)))

    const after = await representatives()
    expect(after.map((r) => [r.ocid, r.isRepresentative])).toEqual([
      [O_NEW, true],
      [O_ALT, true],
      [O_ME, false],
    ])
    expect(Number(after[2]?.changeSeq)).toBeGreaterThan(Number(before?.changeSeq))
  })

  // 서버의 기록은 캐릭터 줄을 가리킨다. 리프 때 그 줄의 ocid 만 고치면 기록을 하나씩 옮기지 않아도 된다.
  it('리프는 옛 ocid 의 캐릭터 줄을 새 ocid 로 고치고 옛 ocid 를 적으며, 같은 리프는 먼저 있던 줄의 id 를 돌려준다', async () => {
    await push(me, upsert('enhancementTotals', total()))
    const [before] = await db.select().from(characters)
    const leap = { id: randomUUID(), mapleId: M_ME, previousOcid: O_ME, ocid: O_NEW }

    await push(me, upsert('characterWorldLeaps', leap))
    const [again] = await push(me, upsert('characterWorldLeaps', { ...leap, id: randomUUID() }))

    expect(again).toEqual(expect.objectContaining({ ok: true, id: leap.id }))
    expect(await db.select({ id: characters.id, ocid: characters.ocid }).from(characters)).toEqual([
      { id: before?.id, ocid: O_NEW },
    ])
    expect(
      (await db.select().from(characterWorldLeaps)).map((r) => [r.characterId, r.previousOcid]),
    ).toEqual([[before?.id, O_ME]])
  })

  // 기기에서는 리프를 잇기 전에 새 ocid 의 기록이 먼저 생기는 일이 흔하다. 그 리프를 버리면 다른 기기가 옛 기록을 옮기지 못한다.
  it('새 ocid 의 캐릭터 줄이 따로 있으면 리프가 그 줄을 가리키고, 옛 기록을 새 ocid 로 다시 올리면 그 줄로 옮겨 간다', async () => {
    const old = total()
    await push(me, upsert('enhancementTotals', old))
    await push(me, upsert('enhancementTotals', total({ ocid: O_NEW, historyDate: '2026-10-21' })))
    const ocidOf = async (ocid: string) =>
      (await db.select().from(characters).where(eq(characters.ocid, ocid)))[0]?.id
    const [previous, next] = [await ocidOf(O_ME), await ocidOf(O_NEW)]
    const leap = { id: randomUUID(), mapleId: M_ME, previousOcid: O_ME, ocid: O_NEW }

    const [leaped] = await push(me, upsert('characterWorldLeaps', leap))
    const [moved] = await push(me, upsert('enhancementTotals', { ...old, ocid: O_NEW }))

    expect([leaped?.ok, moved?.ok]).toEqual([true, true])
    expect((await db.select().from(characterWorldLeaps)).map((r) => r.characterId)).toEqual([next])
    expect(await ocidOf(O_ME)).toBe(previous)
    const [row] = await db.select().from(enhancementTotals).where(eq(enhancementTotals.id, old.id))
    expect(row?.characterId).toBe(next)
  })

  // 굳은 날은 넥슨 계정의 것이다. 기기는 서버의 넥슨 계정 줄 id 를 몰라 그 계정의 메이플 ID 로 가리킨다.
  it('굳은 날은 메이플 ID 가 달린 넥슨 계정에 한 번만 적고, 남의 메이플 ID 는 받지 않는다', async () => {
    const day = { mapleId: M_ME, apiType: 'cube', historyDate: '2026-10-20' }

    const results = await push(
      me,
      upsert('enhancementSettledDays', day),
      upsert('enhancementSettledDays', day),
      upsert('enhancementSettledDays', { ...day, mapleId: M_OTHER }),
    )

    expect(results.map((r) => (r.ok ? 'ok' : r.code))).toEqual([
      'ok',
      'ok',
      'maple_id_not_registered',
    ])
    expect((await db.select().from(enhancementSettledDays)).map((r) => r.nexonAccountId)).toEqual([
      me.nexonAccountId,
    ])
  })

  // 데이터 삭제로 지운 날을 다른 기기가 다시 받아 올리면 받은 날이다. 살아 있는 날을 다시 올릴 때 번호가 오르면 모든 기기가 다시 받는다.
  it('지운 굳은 날이 다시 오면 같은 줄을 되살리고, 살아 있는 줄은 고치지 않는다', async () => {
    const day = { mapleId: M_ME, apiType: 'cube', historyDate: '2026-10-20' }
    await push(me, upsert('enhancementSettledDays', day))
    const [first] = await db.select().from(enhancementSettledDays)
    await push(me, upsert('enhancementSettledDays', day))
    const [unchanged] = await db.select().from(enhancementSettledDays)
    await db.update(enhancementSettledDays).set({ deletedAt: new Date() })

    const [result] = await push(me, upsert('enhancementSettledDays', day))

    const [revived] = await db.select().from(enhancementSettledDays)
    expect(unchanged?.changeSeq).toBe(first?.changeSeq)
    expect(result).toEqual(expect.objectContaining({ ok: true, id: first?.id }))
    expect([revived?.id, revived?.deletedAt]).toEqual([first?.id, null])
  })

  // 약속을 고쳐 올리면 지운 보스와 예외가 다른 기기에 남지 않게 통째로 갈아 끼운다.
  it('약속은 보스와 예외를 받을 때마다 갈아 끼운다', async () => {
    const appointment = {
      id: randomUUID(),
      time: '21:00',
      durationMinutes: 60,
      scheduleType: 'weekly',
      weekday: 4,
      fromWeekCode: 'W202647',
      bosses: [{ sortOrder: 0, bossDifficultyId: ref.hard, mapleId: M_ME, ocid: O_ME }],
      exceptions: [
        {
          weekCode: 'W202648',
          date: '2026-11-27',
          time: '22:00',
          durationMinutes: 30,
          bosses: [{ sortOrder: 0, bossDifficultyId: ref.normal, mapleId: M_ME, ocid: O_ME }],
        },
      ],
    }
    await push(me, upsert('partyAppointments', appointment))

    const [result] = await push(me, upsert('partyAppointments', { ...appointment, exceptions: [] }))

    expect(result?.ok).toBe(true)
    expect(await db.select().from(partyAppointmentExceptions)).toEqual([])
    expect(
      (await db.select().from(partyAppointmentBosses)).map((r) => [
        r.bossDifficultyId,
        r.exceptionId,
      ]),
    ).toEqual([[ref.hard, null]])
  })

  // 순번은 번호를 받은 차례와 커밋 차례가 다를 수 있다. 한 주인의 쓰기를 한 줄로 세워야 받기가 작은 번호를 놓치지 않는다.
  it('같은 메이플 ID 의 쓰기는 먼저 잠근 쓰기가 끝나야 적고, 늦게 적은 줄이 더 큰 변경 번호를 받는다', async () => {
    const first = total()
    await push(me, upsert('enhancementTotals', first))
    const pool = new Pool({ connectionString: TEST_DATABASE_URL })
    const holder = drizzle(pool, { schema })
    let release: () => void = () => undefined
    const held = new Promise<void>((resolve) => (release = resolve))
    let locked: () => void = () => undefined
    const lockTaken = new Promise<void>((resolve) => (locked = resolve))
    const holding = holder.transaction(async (tx) => {
      await lockOwners(tx, [{ type: 'maple_id', hash: M_ME }], 'write')
      locked()
      await held
      await tx
        .update(enhancementTotals)
        .set({ attemptCount: 9 })
        .where(eq(enhancementTotals.id, first.id))
    })
    await lockTaken
    const second = total({ historyDate: '2026-10-21' })
    let written = false
    const waiting = push(me, upsert('enhancementTotals', second)).then(() => (written = true))
    await new Promise((resolve) => setTimeout(resolve, 300))
    const writtenWhileHeld = written

    release()
    await Promise.all([holding, waiting])
    await pool.end()

    expect(writtenWhileHeld).toBe(false)
    const rows = await db.select().from(enhancementTotals)
    const seq = (id: string) => rows.find((r) => r.id === id)?.changeSeq ?? 0
    expect(seq(second.id)).toBeGreaterThan(seq(first.id))
  })

  describe('처치 난이도', () => {
    let t: ClearedDropTables
    /** 처치 전 수익 건. 분배도 비어 드롭이 빠지면 기기가 지우는 줄이다. */
    const notCleared = {
      crystalPriceMeso: null,
      crystalReceivedMeso: null,
      clearedDate: null,
      clearRecordedBy: null,
      splitType: null,
      partySize: null,
      splitFeeFollowsMvpGrade: true,
    }
    const pending = {
      priceStatus: 'pending',
      salePriceMeso: null,
      saleReceivedMeso: null,
      pricedAt: null,
    }
    const itemDrop = (profitEntryId: string, key: string, over: Record<string, unknown> = {}) =>
      drop(profitEntryId, { itemId: t.item[key], category: 'consumable', ...pending, ...over })
    /** 드롭마다 [id, 수익 건, 아이템 key, 살아 있는지]. id 차례다. */
    const dropRows = async () => {
      const keyOf = Object.fromEntries(Object.entries(t.item).map(([key, id]) => [id, key]))
      const rows = await db.select().from(bossDrops)
      return rows
        .map((r) => [r.id, r.profitEntryId, keyOf[r.itemId], r.deletedAt === null])
        .sort((a, b) => String(a[0]).localeCompare(String(b[0])))
    }
    const byId = <T extends unknown[]>(rows: T[]) =>
      rows.sort((a, b) => String(a[0]).localeCompare(String(b[0])))

    beforeEach(async () => {
      t = await insertClearedDropTables(db)
    })

    // 앱 lib/__tests__/drop-item-ids.spec.ts 의 처치한 수익 건으로 모으기와 같은 세 예다. 기기와 서버의 규칙이 다르면 받기가 기기가
    // 먼저 고친 값을 되돌린다.
    it('처치한 수익 건을 받으면 다른 난이도의 드롭을 옮기고, 얻는 반지는 남기고 못 얻는 반지는 지우며, 다른 경로로만 얻는 연마석은 상자용 줄로 바꾼다', async () => {
      const kalosNormal = entry({ bossDifficultyId: t.kalos.normal, ...notCleared })
      const bellonaNormal = entry({ bossDifficultyId: t.bellona.normal, ...notCleared })
      const restraint = itemDrop(kalosNormal.id, 'restraint_ring_lv4')
      const ultimatum = itemDrop(kalosNormal.id, 'ultimatum_ring_lv4', {
        priceStatus: 'entered',
        salePriceMeso: 1_000,
        saleReceivedMeso: 500,
        pricedAt: '2026-11-20T03:00:00Z',
      })
      const whetstone = itemDrop(bellonaNormal.id, 'life_whetstone', {
        priceStatus: 'entered',
        salePriceMeso: 2_000,
        saleReceivedMeso: 1_000,
        pricedAt: '2026-11-20T03:00:00Z',
      })
      await push(
        me,
        upsert('bossProfitEntries', kalosNormal),
        upsert('bossProfitEntries', bellonaNormal),
        upsert('bossDrops', restraint),
        upsert('bossDrops', ultimatum),
        upsert('bossDrops', whetstone),
      )
      const kalosChaos = entry({ bossDifficultyId: t.kalos.chaos })
      const bellonaHard = entry({ bossDifficultyId: t.bellona.hard })

      const results = await push(
        me,
        upsert('bossProfitEntries', kalosChaos),
        upsert('bossProfitEntries', bellonaHard),
      )

      expect(results.every((r) => r.ok)).toBe(true)
      expect(await dropRows()).toEqual(
        byId([
          [restraint.id, kalosChaos.id, 'restraint_ring_lv4', true],
          [ultimatum.id, kalosNormal.id, 'ultimatum_ring_lv4', false],
          [whetstone.id, bellonaHard.id, 'life_whetstone_from_box', true],
        ]),
      )
      // 드롭이 빠져 처치도 분배도 드롭도 없는 수익 건은 기기도 지운다.
      const gone = (await db.select().from(bossProfitEntries)).filter((r) => r.deletedAt !== null)
      expect(gone.map((r) => r.id).sort()).toEqual([kalosNormal.id, bellonaNormal.id].sort())
      // 바꾼 드롭은 판매가 줄도 그 아이템으로 세고, 지운 드롭의 판매가는 시세에 남지 않는다.
      const sales = await db.select().from(dropSalePrices)
      expect(sales.map((r) => [r.id, r.itemId])).toEqual([
        [whetstone.id, t.item.life_whetstone_from_box],
      ])
    })

    // 드롭 시트는 상자 하나에 결과를 하나만 둔다. 같은 상자의 결과가 둘이면 하나는 먹은 것이 아니고 금액만 두 번 센다.
    it('처치한 수익 건에 있던 드롭이 먼저 남고, 같은 아이템이나 같은 상자로 옮겨 오는 드롭은 지운다', async () => {
      const kalosChaos = entry({ bossDifficultyId: t.kalos.chaos })
      const kalosNormal = entry({ bossDifficultyId: t.kalos.normal, ...notCleared })
      const keptRing = itemDrop(kalosChaos.id, 'continuous_ring_lv3')
      const keptWhetstone = itemDrop(kalosChaos.id, 'life_whetstone')
      const movedRing = itemDrop(kalosNormal.id, 'restraint_ring_lv4')
      const movedWhetstone = itemDrop(kalosNormal.id, 'life_whetstone')
      await push(
        me,
        upsert('bossProfitEntries', { ...kalosChaos, ...notCleared }),
        upsert('bossProfitEntries', kalosNormal),
        upsert('bossDrops', keptRing),
        upsert('bossDrops', keptWhetstone),
        upsert('bossDrops', movedRing),
        upsert('bossDrops', movedWhetstone),
      )

      await push(me, upsert('bossProfitEntries', kalosChaos))

      expect(await dropRows()).toEqual(
        byId([
          [keptRing.id, kalosChaos.id, 'continuous_ring_lv3', true],
          [keptWhetstone.id, kalosChaos.id, 'life_whetstone', true],
          [movedRing.id, kalosNormal.id, 'restraint_ring_lv4', false],
          [movedWhetstone.id, kalosNormal.id, 'life_whetstone', false],
        ]),
      )
    })

    // 서버와 기기가 같은 드롭을 남기려면 둘 다 가진 값으로 차례를 정해야 한다. 드롭 시트의 차례는 기기에만 있다.
    it('옮겨 오는 드롭끼리 겹치면 난이도 차례로, 같은 수익 건 안에서는 드롭 id 차례로 앞선 것이 남는다', async () => {
      const kalosEasy = entry({ bossDifficultyId: t.kalos.easy, ...notCleared })
      const kalosNormal = entry({ bossDifficultyId: t.kalos.normal, ...notCleared })
      const [first, second] = [randomUUID(), randomUUID()].sort()
      const a = itemDrop(kalosEasy.id, 'restraint_ring_lv3', { id: first })
      const c = itemDrop(kalosEasy.id, 'continuous_ring_lv4', { id: second })
      const b = itemDrop(kalosNormal.id, 'restraint_ring_lv4')
      await push(
        me,
        upsert('bossProfitEntries', kalosEasy),
        upsert('bossProfitEntries', kalosNormal),
        upsert('bossDrops', b),
        upsert('bossDrops', c),
        upsert('bossDrops', a),
      )
      const kalosChaos = entry({ bossDifficultyId: t.kalos.chaos })

      await push(me, upsert('bossProfitEntries', kalosChaos))

      const live = (await dropRows()).filter((row) => row[3])
      expect(live).toEqual([[a.id, kalosChaos.id, 'restraint_ring_lv3', true]])
    })

    // 2026-09-17 패치는 오전 10시이고 그 주(W202638)는 00:00 에 열린다. 그 열 시간에 먹은 교환권을 지우면 안 된다.
    it('드롭 표 줄의 기간은 그 기간 어느 때라도 유효했으면 든 것으로 보고, 고정 보상 기록은 처치한 난이도가 주지 않아도 둔다', async () => {
      const normalOf = (periodCode: string) =>
        entry({ bossDifficultyId: t.kalos.normal, periodCode, ...notCleared })
      const patchWeek = normalOf('W202638')
      const nextWeek = normalOf('W202639')
      const keptVoucher = itemDrop(patchWeek.id, 'magical_weapon_scroll_voucher')
      const fixed = itemDrop(patchWeek.id, 'lingering_kalos_will_fragment', { category: 'fixed' })
      const goneVoucher = itemDrop(nextWeek.id, 'magical_weapon_scroll_voucher')
      await push(
        me,
        upsert('bossProfitEntries', patchWeek),
        upsert('bossProfitEntries', nextWeek),
        upsert('bossDrops', keptVoucher),
        upsert('bossDrops', fixed),
        upsert('bossDrops', goneVoucher),
      )
      const chaosOf = (periodCode: string) => entry({ bossDifficultyId: t.kalos.chaos, periodCode })
      const patchChaos = chaosOf('W202638')
      const nextChaos = chaosOf('W202639')

      await push(
        me,
        upsert('bossProfitEntries', patchChaos),
        upsert('bossProfitEntries', nextChaos),
      )

      expect(await dropRows()).toEqual(
        byId([
          [keptVoucher.id, patchChaos.id, 'magical_weapon_scroll_voucher', true],
          [fixed.id, patchChaos.id, 'lingering_kalos_will_fragment', true],
          [goneVoucher.id, nextWeek.id, 'magical_weapon_scroll_voucher', false],
        ]),
      )
    })

    // 앱은 직접 완료의 난이도를 바꾸면 옛 처치를 걷는 쓰기를 새 처치보다 먼저 올린다. 새 처치가 먼저 닿으면 옛 처치와 같은 기간 ·
    // 보스의 처치라 거절되고, 옛 수익 건의 지우기가 먼저 닿으면 아직 옮기지 않은 드롭이 함께 지워진다.
    it('한 요청에 옛 수익 건의 처치를 걷는 쓰기와 새 난이도의 처치를 차례로 받으면 드롭을 새 수익 건으로 옮기고 빈 옛 수익 건을 지운다', async () => {
      const previous = entry({ bossDifficultyId: t.kalos.chaos, clearRecordedBy: 'manual' })
      const ring = itemDrop(previous.id, 'restraint_ring_lv4')
      await push(me, upsert('bossProfitEntries', previous), upsert('bossDrops', ring))
      const next = entry({ bossDifficultyId: t.kalos.normal, clearRecordedBy: 'manual' })

      const results = await push(
        me,
        upsert('bossProfitEntries', { ...previous, ...notCleared }),
        upsert('bossProfitEntries', next),
      )

      expect(results.map((r) => (r.ok ? r.id : r.code))).toEqual([previous.id, next.id])
      expect(await dropRows()).toEqual([[ring.id, next.id, 'restraint_ring_lv4', true]])
      const [gone] = await db
        .select()
        .from(bossProfitEntries)
        .where(eq(bossProfitEntries.id, previous.id))
      expect(gone?.deletedAt).toEqual(expect.any(Date))
      // 두 기기가 같은 기간 · 보스를 다른 난이도로 처치했다고 적으면 뒤에 온 처치는 지금처럼 거절한다.
      const [other] = await push(
        me,
        upsert('bossProfitEntries', entry({ bossDifficultyId: t.kalos.chaos })),
      )
      expect(other).toEqual(expect.objectContaining({ ok: false, code: 'duplicate_record' }))
    })

    it('옛 처치가 아직 서버에 없으면 옛 수익 건을 처치 전 수익 건으로 받았다가 새 처치를 받을 때 빈 수익 건으로 지운다', async () => {
      const previous = entry({ bossDifficultyId: t.kalos.chaos, ...notCleared })
      const next = entry({ bossDifficultyId: t.kalos.normal, clearRecordedBy: 'manual' })
      const ring = itemDrop(next.id, 'restraint_ring_lv4')

      const results = await push(
        me,
        upsert('bossProfitEntries', previous),
        upsert('bossProfitEntries', next),
      )
      await push(me, upsert('bossDrops', ring))

      expect(results.every((r) => r.ok)).toBe(true)
      expect(await dropRows()).toEqual([[ring.id, next.id, 'restraint_ring_lv4', true]])
      const live = (await db.select().from(bossProfitEntries)).filter((r) => r.deletedAt === null)
      expect(live.map((r) => r.id)).toEqual([next.id])
    })

    // 처치를 아직 받지 못한 기기가 나중에 올린 드롭이 다른 난이도 수익 건에 남으면 기기마다 다르게 보인다. 앱은 드롭을 한 건씩 올려
    // 첫 드롭을 옮기며 비운 수익 건을 뒤 드롭이 가리킨다. 그 드롭을 지운 기록의 수정으로 거절하면 앱이 드롭을 지운다.
    it('처치한 수익 건이 있는 묶음의 드롭을 받으면 그 드롭도 옮기고 가리며, 그러다 비운 수익 건을 가리키는 뒤 드롭도 받는다', async () => {
      const kalosChaos = entry({ bossDifficultyId: t.kalos.chaos })
      await push(me, upsert('bossProfitEntries', kalosChaos))
      const kalosNormal = entry({ bossDifficultyId: t.kalos.normal, ...notCleared })
      const late = itemDrop(kalosNormal.id, 'restraint_ring_lv4')
      const later = itemDrop(kalosNormal.id, 'life_whetstone')
      const wrong = itemDrop(kalosNormal.id, 'ultimatum_ring_lv4')

      const results = await push(
        me,
        upsert('bossProfitEntries', kalosNormal),
        upsert('bossDrops', late),
        upsert('bossDrops', later),
        upsert('bossDrops', wrong),
      )

      expect(results.map((r) => (r.ok ? r.id : r.code))).toEqual([
        kalosNormal.id,
        late.id,
        later.id,
        wrong.id,
      ])
      expect(await dropRows()).toEqual(
        byId([
          [late.id, kalosChaos.id, 'restraint_ring_lv4', true],
          [later.id, kalosChaos.id, 'life_whetstone', true],
          [wrong.id, kalosChaos.id, 'ultimatum_ring_lv4', false],
        ]),
      )
      const [normal] = await db
        .select()
        .from(bossProfitEntries)
        .where(eq(bossProfitEntries.id, kalosNormal.id))
      expect(normal?.deletedAt).toEqual(expect.any(Date))
    })
  })

  // 서버의 줄과 같은 값을 다시 올리는 일은 흔하다. 다른 기기가 올린 값을 받은 기기가 같은 값을 다시 적고, 처음 동기화는 받은 기록을
  // 다시 올린다. 그때 변경 번호가 오르면 같은 줄이 모든 기기의 받기로 되돌아간다.
  describe('값이 같은 올리기', () => {
    interface Case {
      /** 올리기의 표 이름 */
      table: string
      /** 변경 번호를 견줄 서버 표 */
      dbTable: string
      /** 먼저 올려 둘 기록 */
      before?: object[]
      row: object
      /** 칸 하나만 바꾼 몸 */
      changed: object
    }
    const appointment = (time: string) => ({
      id: '6f1f6b8e-6a3c-4a8e-9f5d-2f4f7b3a9c11',
      time: '21:00',
      durationMinutes: 60,
      scheduleType: 'weekly',
      weekday: 4,
      fromWeekCode: 'W202647',
      bosses: [{ sortOrder: 0, bossDifficultyId: ref.hard, mapleId: M_ME, ocid: O_ME }],
      exceptions: [
        {
          weekCode: 'W202648',
          date: '2026-11-27',
          time,
          durationMinutes: 30,
          bosses: [{ sortOrder: 0, bossDifficultyId: ref.normal, mapleId: M_ME, ocid: O_ME }],
        },
      ],
    })
    const calculator = (partySize: number) => ({
      id: '0b7d3f0e-3a51-4f5e-8f61-6c8e8f5f2d22',
      savedAt: '2026-11-20T03:00:00Z',
      characters: [
        {
          sortOrder: 0,
          mapleId: M_ME,
          ocid: O_ME,
          bosses: [
            {
              bossDifficultyId: ref.hard,
              splitType: 'even',
              partySize,
              splitFeeFollowsMvpGrade: false,
            },
          ],
        },
      ],
    })
    const cashbook = (amountMeso: number) => ({
      id: '4d0c6f8a-1b2e-4c3d-9e8f-7a6b5c4d3e33',
      mapleId: M_ME,
      ocid: O_ME,
      categoryId: ref.categoryId,
      date: '2026-11-20',
      memo: '메모',
      recordedAt: '2026-11-20T03:00:00Z',
      items: [{ itemName: '직접 친 품목', amountMeso }],
      fragmentUses: [{ fragmentSource: 'hunt', ocid: O_ALT, fragmentQuantity: 3 }],
    })
    const progress = (nowCount: number) => ({
      mapleId: M_ME,
      worldId: ref.worldId,
      contentId: ref.contentId,
      isRegistered: true,
      nowCount,
      maxCount: 3,
      questState: null,
      periodCode: 'W202647',
    })
    const motion = {
      mapleId: M_ME,
      ocid: O_ME,
      actions: ['A00'],
      emotions: ['E00'],
      durationMs: 1_000,
      restsBetweenActions: true,
    }
    const cases: Record<string, () => Case> = {
      공유진행: () => ({
        table: 'sharedContentProgress',
        dbTable: 'shared_content_progress',
        row: progress(1),
        changed: progress(2),
      }),
      메이플ID이름: () => ({
        table: 'mapleIdNames',
        dbTable: 'maple_id_names',
        row: { mapleId: M_ME, name: '본캐' },
        changed: { mapleId: M_ME, name: '부캐' },
      }),
      대표캐릭터동작: () => ({
        table: 'representativeCharacterMotions',
        dbTable: 'representative_character_motions',
        row: motion,
        changed: { ...motion, emotions: ['E00', 'E01'] },
      }),
      추적캐릭터: () => ({
        table: 'trackedCharacters',
        dbTable: 'tracked_characters',
        row: { mapleId: M_ME, ocid: O_ME, sortOrder: 0, isRepresentative: true },
        changed: { mapleId: M_ME, ocid: O_ME, sortOrder: 1, isRepresentative: true },
      }),
      수동추적: () => ({
        table: 'manualTrackedItems',
        dbTable: 'manual_tracked_items',
        row: { mapleId: M_ME, ocid: O_ME, type: 'weekly', targetId: ref.contentId },
        changed: { mapleId: M_ME, ocid: O_ME, type: 'boss', targetId: ref.hard },
      }),
      설정: () => ({
        table: 'accountSettings',
        dbTable: 'account_settings',
        row: { trackingType: 'manual', quickLinkKeys: ['A', 'B'] },
        changed: { quickLinkKeys: ['B', 'A'] },
      }),
      하위페이지차례: () => ({
        table: 'bottomBarSubPageOrders',
        dbTable: 'bottom_bar_sub_page_orders',
        row: { groupKey: 'schedule', subPageKeys: ['Boss', 'Content'] },
        changed: { groupKey: 'schedule', subPageKeys: ['Content', 'Boss'] },
      }),
      수익건: () => {
        const row = entry()
        return {
          table: 'bossProfitEntries',
          dbTable: 'boss_profit_entries',
          row,
          changed: { ...row, crystalReceivedMeso: 100 },
        }
      },
      드롭: () => {
        const profit = entry()
        const row = drop(profit.id)
        return {
          table: 'bossDrops',
          dbTable: 'boss_drops',
          before: [upsert('bossProfitEntries', profit)],
          row,
          changed: { ...row, salePriceMeso: 2_000 },
        }
      },
      분배설정: () => {
        const row = {
          id: randomUUID(),
          mapleId: M_ME,
          ocid: O_ME,
          bossDifficultyId: ref.hard,
          splitType: 'even',
          partySize: 2,
          splitFeeFollowsMvpGrade: true,
        }
        return {
          table: 'bossSplitSettings',
          dbTable: 'boss_split_settings',
          row,
          changed: { ...row, partySize: 3 },
        }
      },
      강화합계: () => {
        const row = total()
        return {
          table: 'enhancementTotals',
          dbTable: 'enhancement_totals',
          row,
          changed: { ...row, attemptCount: 3 },
        }
      },
      MVP등급: () => {
        const row = { id: randomUUID(), mapleId: M_ME, fromDate: '2026-11-20', gradeId: null }
        return {
          table: 'mvpGradeHistory',
          dbTable: 'mvp_grade_history',
          row,
          changed: { ...row, fromDate: '2026-11-21' },
        }
      },
      인벤토리: () => {
        const row = {
          id: randomUUID(),
          mapleId: M_ME,
          worldId: ref.worldId,
          itemId: ref.itemId,
          cashbookItemTypeId: ref.consumableTypeId,
          addedQuantity: 3,
        }
        return {
          table: 'inventoryItems',
          dbTable: 'inventory_items',
          row,
          changed: { ...row, addedQuantity: 4 },
        }
      },
      // 딸린 줄만 바뀌어도 주인 줄의 번호가 올라야 다른 기기가 받는다.
      가계부딸린줄: () => ({
        table: 'cashbookEntries',
        dbTable: 'cashbook_entries',
        row: cashbook(-1_000),
        changed: cashbook(-2_000),
      }),
      가계부: () => ({
        table: 'cashbookEntries',
        dbTable: 'cashbook_entries',
        row: cashbook(-1_000),
        changed: { ...cashbook(-1_000), memo: '고친 메모' },
      }),
      약속예외: () => ({
        table: 'partyAppointments',
        dbTable: 'party_appointments',
        row: appointment('22:00'),
        changed: appointment('23:00'),
      }),
      계산기보스: () => ({
        table: 'bossProfitCalculatorRecords',
        dbTable: 'boss_profit_calculator_records',
        row: calculator(2),
        changed: calculator(3),
      }),
    }

    it.each(Object.keys(cases))(
      '%s: 같은 값을 다시 올리면 같은 결과를 돌려주고 줄의 변경 번호와 고친 시각을 두며, 바꾼 값을 올리면 번호를 올린다',
      async (name) => {
        const { table, dbTable, before = [], row, changed } = cases[name]()
        if (before.length > 0) await push(me, ...before)
        const [first] = await push(me, upsert(table, row))
        const written = await stamps(dbTable)

        const [again] = await push(me, upsert(table, row))

        expect(first?.ok).toBe(true)
        expect(again).toEqual(first)
        expect(await stamps(dbTable)).toEqual(written)
        const [result] = await push(me, upsert(table, changed))
        expect(result?.ok).toBe(true)
        expect(maxSeq(await stamps(dbTable))).toBeGreaterThan(maxSeq(written))
      },
    )

    it('지운 줄을 다시 올리면 되살리고 번호를 올린다', async () => {
      const tracked = { mapleId: M_ME, ocid: O_ME, type: 'weekly', targetId: ref.contentId }
      await push(me, upsert('manualTrackedItems', tracked), remove('manualTrackedItems', tracked))
      const [gone] = await stamps('manual_tracked_items')

      await push(me, upsert('manualTrackedItems', tracked))

      const [revived] = await db.select().from(manualTrackedItems)
      expect(revived?.deletedAt).toBeNull()
      expect(Number(revived?.changeSeq)).toBeGreaterThan(Number(gone?.change_seq))
    })
  })

  // 계정을 삭제하면 기록이 메이플 ID 를 따라 지워진다. 판매가는 사람만 비우고 남는다.
  it('사람을 지우면 올린 기록은 지워지고 판매가 줄은 사람만 빈다', async () => {
    const first = entry()
    await push(me, upsert('bossProfitEntries', first), upsert('bossDrops', drop(first.id)))

    await db.delete(users).where(eq(users.id, me.userId))

    expect(await db.select().from(bossProfitEntries)).toEqual([])
    expect((await db.select().from(dropSalePrices)).map((r) => r.userId)).toEqual([null])
  })
})
