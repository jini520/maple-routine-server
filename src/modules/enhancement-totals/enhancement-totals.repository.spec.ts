import { eq } from 'drizzle-orm'

import { characters, enhancementTotals, users } from '../../database/schema'
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
    id: RECORD,
    mapleId: 'm-me',
    ocid: 'ocid-1',
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

  // 앱은 오늘 합계를 받을 때마다 다시 보낸다. 다른 기기가 같은 합계를 새 id 로 보내도 같은 줄이고, 서버의 id 가 남는다.
  it('같은 합계(캐릭터 · 날짜 · 분류 · 장비 이름)는 기록 id 가 달라도 한 줄을 덮고, 지운 줄도 되살린다', async () => {
    await repo.upsert(input())
    await repo.markDeleted(me, RECORD)

    await repo.upsert(input({ id: NEW_RECORD, attemptCount: 5, attemptCostMeso: 2_250_000 }))

    expect(
      (await rows()).map((r) => [r.id, r.attemptCount, r.attemptCostMeso, r.deletedAt]),
    ).toEqual([[RECORD, 5, 2_250_000, null]])
  })

  // 기기는 캐릭터 줄 id 를 모른다. 같은 ocid 의 기록은 모두 한 캐릭터 줄을 가리켜야 리프 때 그 줄만 고친다.
  it('처음 보는 ocid 는 캐릭터 줄을 만들고, 같은 ocid 의 다음 기록은 그 줄을 가리킨다', async () => {
    await repo.upsert(input())
    await repo.upsert(input({ id: NEW_RECORD, historyDate: '2026-10-21' }))

    const made = await db.select().from(characters)
    expect(made.map((r) => r.ocid)).toEqual(['ocid-1'])
    expect((await rows()).map((r) => r.characterId)).toEqual([made[0]?.id, made[0]?.id])
  })

  // 남의 메이플 ID 를 아는 사람이 그 기록을 덮지 못하고, 남의 캐릭터를 자기 메이플 ID 아래로 옮기지도 못한다.
  it('남의 메이플 ID 나, 다른 메이플 ID 아래에 있는 캐릭터면 MapleIdNotOwned 로 거절하고 적지 않는다', async () => {
    await expect(repo.upsert(input({ mapleId: 'm-other' }))).rejects.toBeInstanceOf(MapleIdNotOwned)
    await repo.upsert(input({ nexonAccountId: other.nexonAccountId, mapleId: 'm-other' }))

    await expect(repo.upsert(input({ id: NEW_RECORD }))).rejects.toBeInstanceOf(MapleIdNotOwned)
    expect((await rows()).map((r) => r.id)).toEqual([RECORD])
  })

  // 다른 계정이 같은 합계 id 를 보내도 내 줄을 지우지 못해야 한다.
  it('지우기는 내 계정의 캐릭터 줄에만 시각을 적는다', async () => {
    await repo.upsert(input())

    await repo.markDeleted(other, RECORD)

    expect((await rows())[0]?.deletedAt).toBeNull()
  })

  it('계정을 지우면 그 캐릭터의 합계도 함께 지워진다', async () => {
    await repo.upsert(input())

    await db.delete(users).where(eq(users.id, me.userId))

    expect(await rows()).toEqual([])
  })
})
