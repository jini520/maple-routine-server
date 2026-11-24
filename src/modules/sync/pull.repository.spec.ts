import { randomUUID } from 'node:crypto'

import { eq, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'

import { sha256Hex } from '../../common/hash'
import * as schema from '../../database/schema'
import { bossProfitEntries, mapleIds, mvpGradeHistory } from '../../database/schema'
import {
  describeDb,
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
import { DeletedRowsRepository } from './deleted-rows.repository'
import { PULL_ROW_LIMIT, type PullResponse, SyncPullRepository } from './pull.repository'
import { SyncPushRepository } from './push.repository'
import type { PullBody } from './sync.dto'

const M_ME = sha256Hex('m-me')
const M_SUB = sha256Hex('m-sub')
const M_OTHER = sha256Hex('m-other')
const O_ME = sha256Hex('o-me')

describeDb('SyncPullRepository', () => {
  let db: TestDb
  let close: () => Promise<void>
  let truncate: () => Promise<void>
  let pulls: SyncPullRepository
  let pushes: SyncPushRepository
  let ref: RecordReferences
  let me: IdentityContext
  let other: IdentityContext

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
  const upsert = (table: string, row: object) => ({ table, action: 'upsert', row })
  const remove = (table: string, row: object) => ({ table, action: 'delete', row })
  const push = async (identity: IdentityContext, ...records: object[]) => {
    const results = await pushes.push(identity, records)
    if (results.some((r) => !r.ok)) throw new Error(JSON.stringify(results))
    return results
  }
  const pull = (identity: IdentityContext, cursors: Partial<PullBody['cursors']> = {}) =>
    pulls.pull(identity, { cursors: { mapleIds: {}, ...cursors } })
  const idsOf = (response: PullResponse, table: keyof PullResponse['records']) =>
    (response.records[table] ?? []).map((row) => row.id)

  beforeAll(async () => {
    ;({ db, close, truncate } = await openTestDb())
    pulls = new SyncPullRepository(db, new DeletedRowsRepository(db))
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

  // 기기는 주인마다 마지막으로 받은 번호를 기억하고 그 뒤에 바뀐 줄만 받는다. 서버에는 식별자 원문이 없어 해시로 돌려준다.
  it('주인마다 보낸 번호보다 큰 줄만 돌려주고, 캐릭터 줄 id 대신 메이플 ID · ocid 해시를 싣는다', async () => {
    const old = total()
    await push(me, upsert('enhancementTotals', old))
    const first = await pull(me)
    const fresh = total({ historyDate: '2026-10-21' })
    await push(me, upsert('enhancementTotals', fresh))

    const second = await pull(me, { mapleIds: { [M_ME]: first.cursors.mapleIds[M_ME] ?? 0 } })

    expect(idsOf(first, 'enhancementTotals')).toEqual([old.id])
    expect(idsOf(second, 'enhancementTotals')).toEqual([fresh.id])
    const [row] = second.records.enhancementTotals ?? []
    expect([row?.mapleId, row?.ocid, 'characterId' in (row ?? {})]).toEqual([M_ME, O_ME, false])
  })

  // 바뀐 것이 없는 주인도 번호가 올라야 남은 삭제 표식의 가장 작은 번호보다 뒤에 선다. 아니면 쓰지 않는 메이플 ID 를 매번 다시 받는다.
  it('다 받은 주인에게는 순번의 지금 값을 돌려주고, 남은 삭제 표식의 가장 작은 번호를 싣는다', async () => {
    const gone = total()
    await push(me, upsert('enhancementTotals', gone), remove('enhancementTotals', { id: gone.id }))
    await push(
      other,
      upsert('enhancementTotals', total({ mapleId: M_OTHER, ocid: sha256Hex('o-x') })),
    )
    const [deleted] = await db
      .select()
      .from(schema.enhancementTotals)
      .where(eq(schema.enhancementTotals.id, gone.id))

    const response = await pull(me, { mapleIds: { [M_ME]: 999_999 } })

    const sequence = await db.execute<{ last_value: string }>(
      sql`SELECT last_value FROM record_change_seq`,
    )
    expect(response.cursors.mapleIds[M_ME]).toBe(Number(sequence.rows[0]?.last_value))
    expect(response.oldestDeletedChangeSeq).toBe(deleted?.changeSeq)
  })

  // 처음 받는 기기에는 지울 줄이 없다. 번호를 기억한 기기는 그 사이에 지운 줄을 받아 지운다.
  it('번호 0 으로 받으면 지운 줄을 빼고, 번호를 보내면 그 뒤에 지운 줄도 싣는다', async () => {
    const kept = total()
    const gone = total({ historyDate: '2026-10-21' })
    await push(me, upsert('enhancementTotals', kept), upsert('enhancementTotals', gone))
    const before = await pull(me)
    await push(me, remove('enhancementTotals', { id: gone.id }))

    const fresh = await pull(me)
    const after = await pull(me, { mapleIds: { [M_ME]: before.cursors.mapleIds[M_ME] ?? 0 } })

    expect(idsOf(fresh, 'enhancementTotals')).toEqual([kept.id])
    expect(after.records.enhancementTotals?.map((row) => [row.id, row.deletedAt !== null])).toEqual(
      [[gone.id, true]],
    )
  })

  // 부계정을 새로 등록하면 그 메이플 ID 의 옛 줄이 한꺼번에 이 사람의 것이 된다. 그래서 번호를 메이플 ID 마다 기억한다.
  it('응답에 이 사람의 메이플 ID 해시 목록을 싣고, 처음 보는 메이플 ID 는 0 부터 주며 남의 메이플 ID 번호는 무시한다', async () => {
    const sub = await insertNexonAccount(db, [M_SUB])
    const subIdentity: IdentityContext = {
      userId: sub.userId,
      source: 'key',
      nexonAccountId: sub.nexonAccountId,
    }
    const subTotal = total({ mapleId: M_SUB, ocid: sha256Hex('o-sub') })
    await push(subIdentity, upsert('enhancementTotals', subTotal))
    const before = await pull(me)
    await db.insert(schema.subAccountRegistrations).values({
      loginNexonAccountId: me.nexonAccountId,
      subNexonAccountId: sub.nexonAccountId,
    })

    const after = await pull(me, {
      mapleIds: { [M_ME]: before.cursors.mapleIds[M_ME] ?? 0, [M_OTHER]: 0 },
    })

    expect(before.mapleIds).toEqual([M_ME])
    expect(after.mapleIds).toEqual([M_ME, M_SUB].sort())
    expect(Object.keys(after.cursors.mapleIds).sort()).toEqual([M_ME, M_SUB].sort())
    expect(idsOf(after, 'enhancementTotals')).toEqual([subTotal.id])
  })

  // 넥슨 계정 줄이 합쳐지거나 다른 사람으로 로그인하면 옛 번호로는 새 사람의 줄을 건너뛴다.
  it('사람의 번호는 넥슨 계정 줄 id 가 다르면 0 부터 준다', async () => {
    await push(me, upsert('accountSettings', { trackingType: 'manual' }))
    const first = await pull(me)

    const same = await pull(me, { nexonAccount: first.cursors.nexonAccount })
    const switched = await pull(me, {
      nexonAccount: { id: other.nexonAccountId, changeSeq: first.cursors.nexonAccount.changeSeq },
    })

    expect(first.records.accountSettings?.map((row) => row.trackingType)).toEqual(['manual'])
    expect(same.records.accountSettings).toBeUndefined()
    expect(switched.records.accountSettings?.map((row) => row.trackingType)).toEqual(['manual'])
    expect(first.cursors.nexonAccount.id).toBe(me.nexonAccountId)
  })

  // 한 번에 받는 줄 수에 상한을 둔다. 상한에 닿은 주인은 마지막으로 실은 줄의 번호를 돌려줘 다음 요청이 그 뒤부터 잇는다.
  it('상한을 넘으면 hasMore 를 켜고 마지막으로 실은 줄의 번호를 돌려주며, 이어 받으면 나머지를 준다', async () => {
    const [mapleId] = await db
      .select({ id: mapleIds.id })
      .from(mapleIds)
      .where(eq(mapleIds.hash, M_ME))
    const day = (n: number) => new Date(Date.UTC(2020, 0, 1 + n)).toISOString().slice(0, 10)
    await db.insert(mvpGradeHistory).values(
      Array.from({ length: PULL_ROW_LIMIT + 2 }, (_, n) => ({
        mapleId: mapleId.id,
        fromDate: day(n),
      })),
    )

    const first = await pull(me)
    const rest = await pull(me, { mapleIds: first.cursors.mapleIds })

    const firstRows = first.records.mvpGradeHistory ?? []
    expect([
      first.hasMore,
      firstRows.length,
      rest.hasMore,
      rest.records.mvpGradeHistory?.length,
    ]).toEqual([true, PULL_ROW_LIMIT, false, 2])
    expect(first.cursors.mapleIds[M_ME]).toBe(firstRows.at(-1)?.changeSeq)
  })

  // 드롭은 수익 건을 가리킨다. 수익 건을 나중에 고쳐 번호가 이 쪽 뒤에 있으면 기기는 수익 건 없이 드롭을 넣지 못한다.
  it('실은 드롭이 가리키는 수익 건의 번호가 뒤에 있으면 그 수익 건도 함께 싣는다', async () => {
    const entryId = randomUUID()
    const entry = {
      id: entryId,
      mapleId: M_ME,
      ocid: O_ME,
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
    }
    const dropRow = {
      id: randomUUID(),
      profitEntryId: entryId,
      itemId: ref.itemId,
      category: 'equipment',
      priceStatus: 'pending',
      saleFeeFollowsMvpGrade: false,
      splitFeeFollowsMvpGrade: false,
    }
    await push(me, upsert('bossProfitEntries', entry), upsert('bossDrops', dropRow))
    const [dropped] = await db.select().from(schema.bossDrops)
    await push(me, upsert('bossProfitEntries', { ...entry, partySize: 3 }))

    const response = await pull(me, { mapleIds: { [M_ME]: (dropped?.changeSeq ?? 1) - 1 } })

    expect(idsOf(response, 'bossDrops')).toEqual([dropRow.id])
    expect(idsOf(response, 'bossProfitEntries')).toEqual([entryId])
    expect(Object.keys(response.records)).toEqual(['bossProfitEntries', 'bossDrops'])
  })

  // 받기가 도는 쓰기를 기다리지 않으면, 받기가 지나간 뒤에 더 작은 번호의 줄이 커밋돼 그 줄을 놓친다.
  it('받기는 그 주인의 쓰기가 끝난 뒤에 읽고, 그 쓰기의 줄을 싣는다', async () => {
    const pool = new Pool({ connectionString: TEST_DATABASE_URL })
    const holder = drizzle(pool, { schema })
    let release: () => void = () => undefined
    const held = new Promise<void>((resolve) => (release = resolve))
    let locked: () => void = () => undefined
    const lockTaken = new Promise<void>((resolve) => (locked = resolve))
    const [mapleId] = await db
      .select({ id: mapleIds.id })
      .from(mapleIds)
      .where(eq(mapleIds.hash, M_ME))
    const writing = holder.transaction(async (tx) => {
      await lockOwners(tx, [{ type: 'maple_id', hash: M_ME }], 'write')
      await tx.insert(mvpGradeHistory).values({ mapleId: mapleId.id, fromDate: '2026-11-20' })
      locked()
      await held
    })
    await lockTaken
    let done = false
    const reading = pull(me).then((response) => {
      done = true
      return response
    })
    await new Promise((resolve) => setTimeout(resolve, 300))
    const doneWhileWriting = done

    release()
    const [, response] = await Promise.all([writing, reading])
    await pool.end()

    expect(doneWhileWriting).toBe(false)
    expect(response.records.mvpGradeHistory?.map((row) => row.fromDate)).toEqual(['2026-11-20'])
  })

  // 기록은 메이플 ID 줄을 줄 id 로 가리켜 캐릭터와 같은 방식으로 맞춘다. 기기는 그 줄 id 를 몰라 해시로 올리고 해시로 받는다.
  it('메이플 ID 를 바로 가리키는 기록 표는 올린 해시로 찾은 메이플 ID 줄 id 로 적고, 받기의 응답에는 그 해시를 싣는다', async () => {
    await push(
      me,
      upsert('cashbookEntries', {
        id: randomUUID(),
        mapleId: M_ME,
        categoryId: ref.categoryId,
        date: '2026-11-20',
        recordedAt: '2026-11-20T03:00:00Z',
        items: [{ itemName: '품목', amountMeso: -1 }],
      }),
      upsert('inventoryItems', {
        id: randomUUID(),
        mapleId: M_ME,
        worldId: ref.worldId,
        itemId: ref.itemId,
        cashbookItemTypeId: ref.consumableTypeId,
        addedQuantity: 1,
      }),
      upsert('mvpGradeHistory', { id: randomUUID(), mapleId: M_ME, fromDate: '2026-11-20' }),
      upsert('mapleIdNames', { mapleId: M_ME, name: '본계정' }),
      upsert('sharedContentProgress', {
        mapleId: M_ME,
        contentId: ref.contentId,
        isRegistered: true,
        periodCode: 'W202647',
      }),
    )
    const [row] = await db.select({ id: mapleIds.id }).from(mapleIds).where(eq(mapleIds.hash, M_ME))

    const stored = [
      await db.select({ mapleId: schema.cashbookEntries.mapleId }).from(schema.cashbookEntries),
      await db.select({ mapleId: schema.inventoryItems.mapleId }).from(schema.inventoryItems),
      await db.select({ mapleId: mvpGradeHistory.mapleId }).from(mvpGradeHistory),
      await db.select({ mapleId: schema.mapleIdNames.mapleId }).from(schema.mapleIdNames),
      await db
        .select({ mapleId: schema.sharedContentProgress.mapleId })
        .from(schema.sharedContentProgress),
    ]
    const response = await pull(me)

    const tables = [
      'cashbookEntries',
      'inventoryItems',
      'mvpGradeHistory',
      'mapleIdNames',
      'sharedContentProgress',
    ] as const
    expect(stored.map((rows) => rows.map((r) => r.mapleId))).toEqual(tables.map(() => [row.id]))
    expect(tables.map((table) => response.records[table]?.map((r) => r.mapleId))).toEqual(
      tables.map(() => [M_ME]),
    )
  })

  // 같은 날의 기록은 기기가 저장한 시각 차례로 선다. 메모와 그 시각이 비면 다른 기기에서 같은 기록이 다르게 보인다.
  it('가계부 기록의 메모와 기기가 저장한 시각은 올린 값 그대로 받기의 응답에 실린다', async () => {
    const id = randomUUID()
    await push(
      me,
      upsert('cashbookEntries', {
        id,
        mapleId: M_ME,
        categoryId: ref.categoryId,
        date: '2026-11-20',
        memo: '파티원에게 나눔',
        recordedAt: '2026-11-20T03:04:05.678Z',
        items: [{ itemName: '품목', amountMeso: -1 }],
      }),
    )

    const response = await pull(me)

    const [entry] = response.records.cashbookEntries ?? []
    expect([
      entry?.id,
      entry?.memo,
      (entry?.recordedAt as Date | undefined)?.toISOString(),
    ]).toEqual([id, '파티원에게 나눔', '2026-11-20T03:04:05.678Z'])
  })

  // 사람의 기록이 가리키는 캐릭터는 여러 메이플 ID 의 것이라 메이플 ID 해시와 ocid 해시를 함께 싣는다.
  it('사람의 기록은 넥슨 계정 줄에서 읽고, 딸린 줄과 캐릭터를 해시로 싣는다', async () => {
    const appointmentId = randomUUID()
    await push(
      me,
      upsert('trackedCharacters', {
        mapleId: M_ME,
        ocid: O_ME,
        sortOrder: 0,
        isRepresentative: true,
      }),
      upsert('partyAppointments', {
        id: appointmentId,
        time: '21:00',
        durationMinutes: 60,
        scheduleType: 'once',
        date: '2026-11-20',
        bosses: [{ sortOrder: 0, bossDifficultyId: ref.hard, mapleId: M_ME, ocid: O_ME }],
      }),
    )

    const response = await pull(me)

    expect(response.records.trackedCharacters?.map((row) => [row.mapleId, row.ocid])).toEqual([
      [M_ME, O_ME],
    ])
    const [appointment] = response.records.partyAppointments ?? []
    expect([appointment?.id, appointment?.bosses, appointment?.exceptions]).toEqual([
      appointmentId,
      [{ sortOrder: 0, bossDifficultyId: ref.hard, mapleId: M_ME, ocid: O_ME }],
      [],
    ])
    expect(await db.select().from(bossProfitEntries)).toEqual([])
  })
  // 서버가 처치한 수익 건으로 드롭을 모으면 그 드롭을 올린 기기도 다른 기기도 받기로 그 결과를 받는다. 번호가 오르지 않으면 이미 받은
  // 기기는 옛 수익 건에 드롭을 둔 채 남는다.
  it('처치한 수익 건으로 옮기고 바꾸고 지운 드롭과 비운 수익 건은 변경 번호가 올라 받기에 다시 온다', async () => {
    const t = await insertClearedDropTables(db)
    const entry = (bossDifficultyId: string, cleared: boolean) => ({
      id: randomUUID(),
      mapleId: M_ME,
      ocid: O_ME,
      bossDifficultyId,
      periodCode: 'W202647',
      worldId: null,
      crystalPriceMeso: cleared ? 300 : null,
      crystalReceivedMeso: cleared ? 150 : null,
      splitType: cleared ? 'even' : null,
      partySize: cleared ? 1 : null,
      splitFeeFollowsMvpGrade: !cleared,
      clearedDate: cleared ? '2026-11-20' : null,
      clearRecordedBy: cleared ? 'auto' : null,
    })
    const drop = (profitEntryId: string, key: string) => ({
      id: randomUUID(),
      profitEntryId,
      itemId: t.item[key],
      category: 'consumable',
      priceStatus: 'pending',
      saleFeeFollowsMvpGrade: false,
      splitFeeFollowsMvpGrade: false,
    })
    const normal = entry(t.bellona.normal, false)
    const whetstone = drop(normal.id, 'life_whetstone')
    const ring = drop(normal.id, 'ultimatum_ring_lv4')
    await push(
      me,
      upsert('bossProfitEntries', normal),
      upsert('bossDrops', whetstone),
      upsert('bossDrops', ring),
    )
    const before = await pull(me)
    const hard = entry(t.bellona.hard, true)
    await push(me, upsert('bossProfitEntries', hard))

    const after = await pull(me, { mapleIds: { [M_ME]: before.cursors.mapleIds[M_ME] ?? 0 } })

    const sorted = (rows: unknown[][]) =>
      rows.sort((a, b) => String(a[0]).localeCompare(String(b[0])))
    expect(
      sorted(
        (after.records.bossDrops ?? []).map((row) => [
          row.id,
          row.profitEntryId,
          row.itemId,
          row.deletedAt !== null,
        ]),
      ),
    ).toEqual(
      sorted([
        [whetstone.id, hard.id, t.item.life_whetstone_from_box, false],
        [ring.id, normal.id, t.item.ultimatum_ring_lv4, true],
      ]),
    )
    expect(
      sorted(
        (after.records.bossProfitEntries ?? []).map((row) => [row.id, row.deletedAt !== null]),
      ),
    ).toEqual(
      sorted([
        [hard.id, false],
        [normal.id, true],
      ]),
    )
  })
})
