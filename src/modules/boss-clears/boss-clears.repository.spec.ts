import { randomUUID } from 'node:crypto'

import { eq } from 'drizzle-orm'

import { isCheckViolation } from '../../common/pg-errors'
import { bossDifficulties, bossProfitEntries, bosses, users } from '../../database/schema'
import {
  describeDb,
  insertAsset,
  insertNexonAccount,
  openTestDb,
  type TestDb,
} from '../../database/test-db'
import { MapleIdNotOwned } from '../users/maple-id-ownership'
import {
  type BossClearInput,
  BossClearsRepository,
  NoBossDifficulty,
  PeriodCycleMismatch,
} from './boss-clears.repository'

describeDb('BossClearsRepository', () => {
  let db: TestDb
  let close: () => Promise<void>
  let truncate: () => Promise<void>
  let repo: BossClearsRepository
  let me: { userId: string; nexonAccountId: string }
  let other: { userId: string; nexonAccountId: string }
  let bossId: string
  const difficulty: Record<'hard' | 'normal' | 'monthly', string> = {
    hard: '',
    normal: '',
    monthly: '',
  }

  /** 처치한 수익 건. 기본은 내 캐릭터가 이번 주 루시드 하드를 잡은 줄이다. */
  const input = (over: Partial<BossClearInput> = {}): BossClearInput => ({
    nexonAccountId: me.nexonAccountId,
    id: randomUUID(),
    mapleId: 'm-me',
    ocid: 'o-me',
    bossDifficultyId: difficulty.hard,
    periodCode: 'W202647',
    worldId: null,
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
  const rows = () => db.select().from(bossProfitEntries)

  beforeAll(async () => {
    ;({ db, close, truncate } = await openTestDb())
    repo = new BossClearsRepository(db)
  })
  beforeEach(async () => {
    await truncate()
    me = await insertNexonAccount(db, ['m-me'])
    other = await insertNexonAccount(db, ['m-other'])
    const [boss] = await db
      .insert(bosses)
      .values({
        key: 'lucid',
        name: '루시드',
        shortName: '루시드',
        isSeasonBoss: false,
        portraitAssetId: await insertAsset(db, 'bosses/lucid.webp'),
        sortOrder: 0,
      })
      .returning({ id: bosses.id })
    bossId = boss.id
    const made = await db
      .insert(bossDifficulties)
      .values([
        { bossId, difficulty: 'hard', cycle: 'weekly', requiredLevel: 220 },
        { bossId, difficulty: 'normal', cycle: 'weekly', requiredLevel: 220 },
        { bossId, difficulty: 'extreme', cycle: 'monthly', requiredLevel: 220 },
      ])
      .returning({ id: bossDifficulties.id, difficulty: bossDifficulties.difficulty })
    for (const r of made)
      difficulty[r.difficulty === 'extreme' ? 'monthly' : (r.difficulty as 'hard' | 'normal')] =
        r.id
  })
  afterAll(() => close())

  // 기기는 같은 기간 행을 고칠 때마다 다시 보낸다. 같은 줄 id 면 나중 값이 남고, 지운 줄도 되살아난다.
  it('줄 id 로 덮어 적고 보스 줄은 난이도에서 채우며, 지운 줄도 다시 적으면 되살아난다', async () => {
    const first = input()
    await repo.upsert(first)
    await repo.markDeleted(me, first.id)

    await repo.upsert({ ...first, crystalReceivedMeso: 100 })

    expect((await rows()).map((r) => [r.id, r.bossId, r.crystalReceivedMeso, r.deletedAt])).toEqual(
      [[first.id, bossId, 100, null]],
    )
  })

  // 한 캐릭터는 한 기간에 한 보스를 한 번 잡는다. 다른 난이도로 한 번 더 온 처치는 먼저 온 줄이 남는다.
  it('같은 기간 · 보스를 다른 난이도로 잡은 줄은 적지 않고, 처치 전 줄은 다른 난이도로 함께 둔다', async () => {
    await repo.upsert(input())
    await repo.upsert(input({ bossDifficultyId: difficulty.normal }))
    const before = {
      crystalPriceMeso: null,
      crystalReceivedMeso: null,
      clearRecordedBy: null,
      clearedDate: null,
      splitFeeFollowsMvpGrade: true,
    }
    await repo.upsert(input({ ...before, bossDifficultyId: difficulty.normal }))

    expect((await rows()).map((r) => [r.bossDifficultyId, r.clearRecordedBy]).sort()).toEqual(
      [
        [difficulty.hard, 'auto'],
        [difficulty.normal, null],
      ].sort(),
    )
  })

  it('모르는 난이도 · 주기와 다른 기간 · 처치와 금액이 어긋난 줄은 거절한다', async () => {
    await expect(repo.upsert(input({ bossDifficultyId: randomUUID() }))).rejects.toBeInstanceOf(
      NoBossDifficulty,
    )
    await expect(
      repo.upsert(input({ bossDifficultyId: difficulty.monthly })),
    ).rejects.toBeInstanceOf(PeriodCycleMismatch)
    const error: unknown = await repo
      .upsert(input({ crystalPriceMeso: null }))
      .catch((e: unknown) => e)
    expect(isCheckViolation(error)).toBe(true)
    expect(await rows()).toEqual([])
  })

  // 남의 메이플 ID 를 아는 사람이 그 기록을 덮거나 지우지 못해야 한다.
  it('남의 메이플 ID 는 MapleIdNotOwned 이고, 남의 줄은 같은 id 로 보내도 덮거나 지우지 못한다', async () => {
    const mine = input()
    await repo.upsert(mine)

    await expect(repo.upsert(input({ mapleId: 'm-other' }))).rejects.toBeInstanceOf(MapleIdNotOwned)
    await repo.upsert(
      input({
        id: mine.id,
        nexonAccountId: other.nexonAccountId,
        mapleId: 'm-other',
        ocid: 'o-other',
      }),
    )
    await repo.markDeleted(other, mine.id)

    expect((await rows()).map((r) => [r.id, r.crystalReceivedMeso, r.deletedAt])).toEqual([
      [mine.id, 150, null],
    ])
  })

  it('계정을 지우면 그 캐릭터의 수익 건도 지워진다', async () => {
    await repo.upsert(input())

    await db.delete(users).where(eq(users.id, me.userId))

    expect(await rows()).toEqual([])
  })
})
