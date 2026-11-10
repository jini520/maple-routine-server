import { eq } from 'drizzle-orm'

import { bossClears, users, worlds } from '../../database/schema'
import {
  describeDb,
  insertAssets,
  insertNexonAccount,
  openTestDb,
  type TestDb,
} from '../../database/test-db'
import { BossesRepository } from '../bosses/bosses.repository'
import { NoWorld } from '../drop-prices/drop-prices.repository'
import { MapleIdNotOwned } from '../users/maple-id-ownership'
import { type BossClearInput, BossClearsRepository } from './boss-clears.repository'

const RECORD = '0f1e2d3c-4b5a-4978-8a9b-0c1d2e3f4a5b'
const OTHER_RECORD = '1f1e2d3c-4b5a-4978-8a9b-0c1d2e3f4a5b'

describeDb('BossClearsRepository', () => {
  let db: TestDb
  let close: () => Promise<void>
  let truncate: () => Promise<void>
  let repo: BossClearsRepository
  let me: { userId: string; nexonAccountId: string }
  let other: { userId: string; nexonAccountId: string }
  let lucid: string

  const input = (over: Partial<BossClearInput> = {}): BossClearInput => ({
    nexonAccountId: me.nexonAccountId,
    identifiedBy: 'key',
    periodRecordId: RECORD,
    mapleId: 'm-me',
    ocid: 'ocid-1',
    bossId: lucid,
    bossDifficultyId: null,
    cycle: 'weekly',
    periodKey: '2026-10-22',
    worldKey: 'scania',
    priceMeso: 300_000_000,
    payoutMeso: 145_500_000,
    splitMode: 'even',
    partySize: 2,
    myShare: null,
    sharesTotal: null,
    splitFeePercent: 3,
    defeatedDate: '2026-10-23',
    source: 'auto',
    ...over,
  })
  const rows = () => db.select().from(bossClears).orderBy(bossClears.createdAt)

  beforeAll(async () => {
    ;({ db, close, truncate } = await openTestDb())
    repo = new BossClearsRepository(db)
  })
  beforeEach(async () => {
    await truncate()
    await insertAssets(db, ['bosses/lucid.webp'])
    me = await insertNexonAccount(db, ['m-me'])
    other = await insertNexonAccount(db, ['m-other'])
    await db.insert(worlds).values({
      key: 'scania',
      name: '스카니아',
      challengers: false,
      event: false,
      sortOrder: 0,
    })
    lucid = (
      await new BossesRepository(db).createBoss({
        key: 'lucid',
        name: '루시드',
        alias: '루시드',
        cycle: 'weekly',
        portraitSlug: 'lucid',
        difficulties: [{ difficulty: 'hard', requiredLevel: 220 }],
      })
    ).id
  })
  afterAll(() => close())

  // 기기가 기준이라 같은 기간을 고쳐 다시 보내면 서버 사본이 그 값을 따라간다. 리프하면 기기가 기간을 새 ocid 로 옮긴다.
  it('같은 메이플 ID · 기간 행을 다시 적으면 줄이 안 늘고 값만 덮으며, 리프로 ocid 가 바뀌어도 같은 줄이다', async () => {
    await repo.upsert(input())
    await repo.upsert(input({ ocid: 'ocid-2', payoutMeso: 100_000_000, source: 'manual' }))

    expect(await rows()).toEqual([
      expect.objectContaining({
        ocid: 'ocid-2',
        mapleId: 'm-me',
        payoutMeso: 100_000_000,
        source: 'manual',
        deletedAt: null,
      }),
    ])
  })

  // 한 캐릭터는 한 기간에 한 보스를 한 번 잡는다. 기기 id 가 달라도 같은 처치라 통계에 두 번 세면 안 된다.
  it('같은 처치(ocid · 보스 · 기간)가 이미 있으면 다른 기간 행 id 로 와도 적지 않는다', async () => {
    await repo.upsert(input())

    await repo.upsert(input({ periodRecordId: OTHER_RECORD, payoutMeso: 1 }))

    expect((await rows()).map((r) => [r.periodRecordId, r.payoutMeso])).toEqual([
      [RECORD, 145_500_000],
    ])
  })

  it('남의 메이플 ID 면 MapleIdNotOwned 로 거절하고 적지 않는다', async () => {
    await expect(repo.upsert(input({ mapleId: 'm-other' }))).rejects.toBeInstanceOf(MapleIdNotOwned)
    expect(await rows()).toEqual([])
  })

  it('모르는 월드 key 는 NoWorld 로 거절하고, 월드가 없으면 그대로 받는다', async () => {
    await expect(repo.upsert(input({ worldKey: 'nowhere' }))).rejects.toBeInstanceOf(NoWorld)
    await repo.upsert(input({ worldKey: null }))

    expect((await rows())[0]?.worldId).toBeNull()
  })

  it('지우면 줄을 남기고 지운 시각을 적으며, 지운 처치는 같은 처치 판정에서 빠지고 다시 적으면 되살아난다', async () => {
    await repo.upsert(input())

    await repo.markDeleted(me, RECORD)
    expect((await rows())[0]?.deletedAt).not.toBeNull()
    await repo.markDeleted(other, RECORD)
    await repo.upsert(input({ periodRecordId: OTHER_RECORD }))
    expect((await rows()).map((r) => [r.periodRecordId, r.deletedAt === null])).toEqual([
      [RECORD, false],
      [OTHER_RECORD, true],
    ])

    await repo.markDeleted(me, OTHER_RECORD)
    await repo.upsert(input())
    expect((await rows()).map((r) => [r.periodRecordId, r.deletedAt === null])).toEqual([
      [RECORD, true],
      [OTHER_RECORD, false],
    ])
  })

  // 옛 앱이 보낸 표라 익명 표본으로 남길 까닭이 없다. 캐릭터 식별자가 있어 연결을 끊어도 익명이 아니다.
  it('계정을 지우면 그 메이플 ID 의 처치도 함께 지워진다', async () => {
    await repo.upsert(input())

    await db.delete(users).where(eq(users.id, me.userId))

    expect(await rows()).toEqual([])
  })
})
