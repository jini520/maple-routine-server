import { eq } from 'drizzle-orm'

import { bossDifficulties, items } from '../../database/schema'
import {
  describeDb,
  insertAsset,
  insertAssets,
  insertItems,
  openTestDb,
  type TestDb,
} from '../../database/test-db'
import { BossesRepository } from '../bosses/bosses.repository'
import {
  BossDropsRepository,
  NoBossDifficulty,
  NoDropItem,
  RewardExists,
} from './boss-drops.repository'

/** 이 스펙의 그림 칸이 가리키는 그림. 그림 칸이 FK 라 줄을 넣기 전에 그림부터 둔다. */
const SPEC_ASSETS = ['bosses/lotus.webp']

describeDb('BossDropsRepository', () => {
  let db: TestDb
  let close: () => Promise<void>
  let truncate: () => Promise<void>
  let repo: BossDropsRepository

  beforeAll(async () => {
    ;({ db, close, truncate } = await openTestDb())
    repo = new BossDropsRepository(db)
  })
  beforeEach(async () => {
    await truncate()
    await insertAssets(db, SPEC_ASSETS)
    await new BossesRepository(db).createBoss({
      key: 'lotus',
      name: '스우',
      shortName: '스우',
      isSeasonBoss: false,
      portraitAssetId: await insertAsset(db, 'bosses/lotus.webp'),
      difficulties: [
        { difficulty: 'hard', cycle: 'weekly', requiredLevel: 190, maxPartySize: null },
        { difficulty: 'extreme', cycle: 'weekly', requiredLevel: 190, maxPartySize: null },
      ],
    })
    await insertItems(db, [
      {
        key: 'loose_control_machine_mark',
        name: '루즈 컨트롤 머신 마크',
        isValuable: true,
        isDrop: true,
      },
      { key: 'red_boss_ring_box', name: '홍옥의 보스 반지 상자', isDrop: true },
      { key: 'spell_trace', name: '주문의 흔적', isDrop: true },
    ])
  })
  afterAll(() => close())

  const row = (over: Partial<Parameters<BossDropsRepository['create']>[0]> = {}) => ({
    boss: 'lotus',
    difficulty: 'hard' as const,
    category: 'equipment' as const,
    item: 'loose_control_machine_mark',
    quantity: null,
    validFrom: null,
    validUntil: null,
    ...over,
  })
  const itemId = async (key: string) =>
    (await db.select({ id: items.id }).from(items).where(eq(items.key, key)))[0]?.id
  const difficultyId = async (difficulty: 'hard' | 'extreme') =>
    (
      await db
        .select({ id: bossDifficulties.id })
        .from(bossDifficulties)
        .where(eq(bossDifficulties.difficulty, difficulty))
    )[0]?.id

  it('줄을 더하면 그 조합 · 분류의 맨 뒤에 서고, 칸은 표 이름의 배열에 난이도 · 아이템 줄 id 로 분류 ENUM 순 · 줄 순으로 난다', async () => {
    await repo.create(row({ category: 'consumable', item: 'red_boss_ring_box' }))
    await repo.create(row({ category: 'fixed', item: 'spell_trace', quantity: 160 }))
    await repo.create(row())
    await repo.create(row({ difficulty: 'extreme' }))

    const section = await repo.section()
    expect(section.updatedAt).not.toBeNull()
    const hard = await difficultyId('hard')
    const extreme = await difficultyId('extreme')
    const mark = await itemId('loose_control_machine_mark')
    expect(
      section.bossDifficultyRewards.map((r) => [r.bossDifficultyId, r.category, r.itemId]),
    ).toEqual([
      [hard, 'fixed', await itemId('spell_trace')],
      [hard, 'equipment', mark],
      [hard, 'consumable', await itemId('red_boss_ring_box')],
      [extreme, 'equipment', mark],
    ])
    expect(section.bossDifficultyRewards[0]).toEqual({
      bossDifficultyId: hard,
      category: 'fixed',
      itemId: await itemId('spell_trace'),
      quantity: 160,
      validFrom: null,
      validUntil: null,
    })
    expect((await repo.rows('lotus', 'hard')).map((r) => r.itemName)).toEqual([
      '주문의 흔적',
      '루즈 컨트롤 머신 마크',
      '홍옥의 보스 반지 상자',
    ])
  })

  // 드롭 기록은 한 수익 건에서 같은 아이템이 한 줄이라 분류만 다른 줄을 두면 둘을 가르지 못한다.
  it('모르는 조합 · 아이템과 같은 줄은 던지고, 분류만 다른 같은 아이템도 같은 줄로 본다. 시작이 다르면 같은 아이템이 둘 설 수 있다', async () => {
    await expect(repo.create(row({ difficulty: 'easy' }))).rejects.toBeInstanceOf(NoBossDifficulty)
    await expect(repo.create(row({ item: 'nobody' }))).rejects.toBeInstanceOf(NoDropItem)
    await repo.create(row())
    await expect(repo.create(row())).rejects.toBeInstanceOf(RewardExists)
    await expect(repo.create(row({ category: 'consumable' }))).rejects.toBeInstanceOf(RewardExists)
    const later = await repo.create(row({ validFrom: '2026-09-17T10:00' }))
    expect(typeof later.id).toBe('string')
  })

  it('수량 · 기간을 고치고 차례를 옮기고 지운다', async () => {
    const a = await repo.create(row({ category: 'consumable', item: 'red_boss_ring_box' }))
    const b = await repo.create(row({ category: 'consumable', item: 'spell_trace' }))

    expect(
      await repo.update(a.id, { quantity: null, validFrom: null, validUntil: '2026-09-17T10:00' }),
    ).toBe(true)
    expect(await repo.move(b.id, 'up')).toBe(true)
    expect((await repo.rows('lotus', 'hard')).map((r) => [r.item, r.validUntil])).toEqual([
      ['spell_trace', null],
      ['red_boss_ring_box', '2026-09-17T10:00'],
    ])
    expect(await repo.move(b.id, 'up')).toBe(true)
    expect(await repo.remove(a.id)).toBe(true)
    expect(await repo.remove(a.id)).toBe(false)
    expect(await repo.update(a.id, { quantity: null, validFrom: null, validUntil: null })).toBe(
      false,
    )
    expect(await repo.move(a.id, 'down')).toBe(false)
  })
})
