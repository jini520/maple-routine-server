import { eq } from 'drizzle-orm'

import { enhancementTotals, users } from '../../database/schema'
import { describeDb, insertNexonAccount, openTestDb, type TestDb } from '../../database/test-db'
import { MapleIdNotOwned } from '../users/maple-id-ownership'
import {
  type EnhancementTotalInput,
  EnhancementTotalsRepository,
} from './enhancement-totals.repository'

const RECORD = '0f1e2d3c-4b5a-4978-8a9b-0c1d2e3f4a5b'
const NEW_RECORD = '1f1e2d3c-4b5a-4978-8a9b-0c1d2e3f4a5b'

describeDb('EnhancementTotalsRepository', () => {
  let db: TestDb
  let close: () => Promise<void>
  let truncate: () => Promise<void>
  let repo: EnhancementTotalsRepository
  let me: { userId: string; nexonAccountId: string }
  let other: { userId: string; nexonAccountId: string }

  const input = (over: Partial<EnhancementTotalInput> = {}): EnhancementTotalInput => ({
    nexonAccountId: me.nexonAccountId,
    identifiedBy: 'login',
    totalRecordId: RECORD,
    mapleId: 'm-me',
    ocid: 'ocid-1',
    historyDate: '2026-10-20',
    enhancementCategory: 'cube_reset',
    itemGroup: 'key:arcane_umbra_knuckle',
    itemKey: 'arcane_umbra_knuckle',
    itemName: '아케인셰이드 클로',
    attempts: 2,
    attemptCostMeso: 900_000,
    destroyDefenceCostMeso: 0,
    ...over,
  })
  const rows = () => db.select().from(enhancementTotals)

  beforeAll(async () => {
    ;({ db, close, truncate } = await openTestDb())
    repo = new EnhancementTotalsRepository(db)
  })
  beforeEach(async () => {
    await truncate()
    me = await insertNexonAccount(db, ['m-me'])
    other = await insertNexonAccount(db, ['m-other'])
  })
  afterAll(() => close())

  // 앱은 오늘 합계를 받을 때마다 다시 보낸다. 다시 설치한 기기는 같은 합계에 새 id 를 붙여도 같은 줄이다.
  it('같은 합계(ocid · 날짜 · 분류 · 장비 묶음)는 기록 id 가 달라도 한 줄을 덮고, 지운 줄도 되살린다', async () => {
    await repo.upsert(input())
    await repo.markDeleted(me, RECORD)

    await repo.upsert(input({ totalRecordId: NEW_RECORD, attempts: 5, attemptCostMeso: 2_250_000 }))

    expect(
      (await rows()).map((r) => [r.totalRecordId, r.attempts, r.attemptCostMeso, r.deletedAt]),
    ).toEqual([[NEW_RECORD, 5, 2_250_000, null]])
  })

  it('남의 메이플 ID 면 MapleIdNotOwned 로 거절하고 적지 않는다', async () => {
    await expect(repo.upsert(input({ mapleId: 'm-other' }))).rejects.toBeInstanceOf(MapleIdNotOwned)
    expect(await rows()).toEqual([])
  })

  // 다른 계정이 같은 합계 id 를 보내도 내 줄을 지우지 못해야 한다.
  it('지우기는 내 계정의 메이플 ID 줄에만 시각을 적는다', async () => {
    await repo.upsert(input())

    await repo.markDeleted(other, RECORD)

    expect((await rows())[0]?.deletedAt).toBeNull()
  })

  it('계정을 지우면 그 메이플 ID 의 합계도 함께 지워진다', async () => {
    await repo.upsert(input())

    await db.delete(users).where(eq(users.id, me.userId))

    expect(await rows()).toEqual([])
  })
})
