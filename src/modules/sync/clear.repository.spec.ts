import { randomUUID } from 'node:crypto'

import { sha256Hex } from '../../common/hash'
import {
  bossDrops,
  bossProfitEntries,
  bossSplitSettings,
  cashbookEntries,
  dropSalePrices,
  enhancementSettledDays,
  enhancementTotals,
  manualTrackedItems,
  partyAppointments,
} from '../../database/schema'
import {
  describeDb,
  insertNexonAccount,
  insertRecordReferences,
  openTestDb,
  type RecordReferences,
  type TestDb,
} from '../../database/test-db'
import type { IdentityContext } from '../identity/identity.guard'
import { SyncClearRepository } from './clear.repository'
import { SyncPushRepository } from './push.repository'

const M_ME = sha256Hex('m-me')
const M_OTHER = sha256Hex('m-other')
const O_ME = sha256Hex('o-me')
const O_OTHER = sha256Hex('o-other')

describeDb('SyncClearRepository', () => {
  let db: TestDb
  let close: () => Promise<void>
  let truncate: () => Promise<void>
  let clears: SyncClearRepository
  let pushes: SyncPushRepository
  let ref: RecordReferences
  let me: IdentityContext
  let other: IdentityContext

  const upsert = (table: string, row: object) => ({ table, action: 'upsert', row })
  const push = async (identity: IdentityContext, ...records: object[]) => {
    const results = await pushes.push(identity, records)
    if (results.some((r) => !r.ok)) throw new Error(JSON.stringify(results))
  }
  /** 수익 건. 처치한 줄 · 분배만 고친 처치 전 줄 · 드롭이 붙은 처치 전 줄을 만든다. */
  const entry = (mapleId: string, ocid: string, over: Record<string, unknown> = {}) => ({
    id: randomUUID(),
    mapleId,
    ocid,
    bossDifficultyId: ref.hard,
    periodCode: 'W202647',
    worldId: null,
    crystalPriceMeso: 300,
    crystalReceivedMeso: 150,
    splitType: 'even',
    partySize: 2,
    splitFeeFollowsMvpGrade: false,
    clearedDate: '2026-11-20',
    clearRecordedBy: 'auto',
    ...over,
  })
  const notCleared = {
    crystalPriceMeso: null,
    crystalReceivedMeso: null,
    clearedDate: null,
    clearRecordedBy: null,
    splitFeeFollowsMvpGrade: true,
  }
  const drop = (profitEntryId: string) => ({
    id: randomUUID(),
    profitEntryId,
    itemId: ref.itemId,
    category: 'equipment',
    priceStatus: 'entered',
    salePriceMeso: 1_000,
    saleReceivedMeso: 500,
    pricedAt: '2026-11-20T03:00:00Z',
    saleFeeFollowsMvpGrade: false,
    splitFeeFollowsMvpGrade: false,
  })
  const live = <T extends { deletedAt: Date | null }>(rows: T[]) =>
    rows.filter((r) => r.deletedAt === null)

  beforeAll(async () => {
    ;({ db, close, truncate } = await openTestDb())
    clears = new SyncClearRepository(db)
    pushes = new SyncPushRepository(db)
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

  // 기기에서만 지우면 다음 받기가 서버의 기록을 다시 넣는다. 다른 기기도 지우도록 표식을 적고, 남의 기록은 건드리지 않는다.
  it('보스 묶음은 드롭과 처치한 수익 건에 표식을 적고 판매가 줄을 지우며, 그 기간 값만 남은 처치 전 줄과 남의 기록은 남긴다', async () => {
    const cleared = entry(M_ME, O_ME)
    const splitOnly = entry(M_ME, O_ME, { ...notCleared, bossDifficultyId: ref.normal })
    const theirs = entry(M_OTHER, O_OTHER)
    await push(me, upsert('bossProfitEntries', cleared), upsert('bossProfitEntries', splitOnly))
    await push(me, upsert('bossDrops', drop(cleared.id)))
    await push(other, upsert('bossProfitEntries', theirs))

    await clears.clear(me, ['boss'])

    expect(
      live(await db.select().from(bossProfitEntries))
        .map((r) => r.id)
        .sort(),
    ).toEqual([splitOnly.id, theirs.id].sort())
    expect(live(await db.select().from(bossDrops))).toEqual([])
    expect(await db.select().from(dropSalePrices)).toEqual([])
  })

  // 드롭이 남은 처치 전 수익 건은 지우면 드롭까지 사라져 줄을 남기고 분배 칸만 비운다. 기기의 데이터 삭제와 같다.
  it('수동 선택 묶음은 분배 설정 · 추적 항목에 표식을 적고, 드롭 없는 처치 전 줄은 지우며 드롭이 남은 줄은 분배 칸만 비운다', async () => {
    const empty = entry(M_ME, O_ME, notCleared)
    const withDrop = entry(M_ME, O_ME, { ...notCleared, bossDifficultyId: ref.normal })
    await push(
      me,
      upsert('bossProfitEntries', empty),
      upsert('bossProfitEntries', withDrop),
      upsert('bossDrops', drop(withDrop.id)),
      upsert('bossSplitSettings', {
        id: randomUUID(),
        mapleId: M_ME,
        ocid: O_ME,
        bossDifficultyId: ref.hard,
        splitType: 'even',
        partySize: 2,
        splitFeeFollowsMvpGrade: true,
      }),
      upsert('manualTrackedItems', { mapleId: M_ME, ocid: O_ME, type: 'boss', targetId: ref.hard }),
    )

    await clears.clear(me, ['manual'])

    const entries = live(await db.select().from(bossProfitEntries))
    expect(entries.map((r) => [r.id, r.splitType, r.partySize, r.splitFeeFollowsMvpGrade])).toEqual(
      [[withDrop.id, null, null, true]],
    )
    expect(live(await db.select().from(bossSplitSettings))).toEqual([])
    expect(live(await db.select().from(manualTrackedItems))).toEqual([])
    expect(live(await db.select().from(bossDrops))).toHaveLength(1)
  })

  // 굳은 날만 남으면 새 기기가 그 날을 넥슨에서 다시 받지 않아 합계가 빈 채로 굳는다. 굳은 날 표에는 표식이 없다.
  it('강화 묶음은 합계에 표식을 적고 그 넥슨 계정의 굳은 날을 지우며, 가계부 묶음과 사람의 기록은 남긴다', async () => {
    await push(
      me,
      upsert('enhancementTotals', {
        id: randomUUID(),
        mapleId: M_ME,
        ocid: O_ME,
        historyDate: '2026-10-20',
        category: 'cube_reset',
        itemName: '아케인셰이드 클로',
        attemptCount: 2,
        attemptCostMeso: 900_000,
        destroyDefenceCostMeso: 0,
      }),
      upsert('enhancementSettledDays', {
        mapleId: M_ME,
        apiType: 'cube',
        historyDate: '2026-10-20',
      }),
      upsert('cashbookEntries', {
        id: randomUUID(),
        mapleId: M_ME,
        categoryId: ref.categoryId,
        date: '2026-11-20',
        recordedAt: '2026-11-20T03:00:00Z',
        items: [{ itemName: '직접 친 품목', amountMeso: -1_000 }],
      }),
      upsert('partyAppointments', {
        id: randomUUID(),
        time: '21:00',
        durationMinutes: 60,
        scheduleType: 'once',
        date: '2026-11-20',
        bosses: [],
      }),
    )
    await push(
      other,
      upsert('enhancementSettledDays', {
        mapleId: M_OTHER,
        apiType: 'cube',
        historyDate: '2026-10-20',
      }),
    )

    await clears.clear(me, ['enhancement'])

    expect(live(await db.select().from(enhancementTotals))).toEqual([])
    expect((await db.select().from(enhancementSettledDays)).map((r) => r.nexonAccountId)).toEqual([
      other.nexonAccountId,
    ])
    expect(live(await db.select().from(cashbookEntries))).toHaveLength(1)
    expect(live(await db.select().from(partyAppointments))).toHaveLength(1)
  })
})
