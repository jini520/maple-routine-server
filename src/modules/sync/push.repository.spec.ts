import { randomUUID } from 'node:crypto'

import { eq } from 'drizzle-orm'
import { Pool } from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'

import { sha256Hex } from '../../common/hash'
import {
  accountSettings,
  bossDrops,
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
  users,
} from '../../database/schema'
import * as schema from '../../database/schema'
import {
  describeDb,
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

  // 계정을 삭제하면 기록이 메이플 ID 를 따라 지워진다. 판매가는 사람만 비우고 남는다.
  it('사람을 지우면 올린 기록은 지워지고 판매가 줄은 사람만 빈다', async () => {
    const first = entry()
    await push(me, upsert('bossProfitEntries', first), upsert('bossDrops', drop(first.id)))

    await db.delete(users).where(eq(users.id, me.userId))

    expect(await db.select().from(bossProfitEntries)).toEqual([])
    expect((await db.select().from(dropSalePrices)).map((r) => r.userId)).toEqual([null])
  })
})
