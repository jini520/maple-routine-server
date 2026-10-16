import { describeDb, openTestDb, type TestDb } from '../../database/test-db'
import { BossesRepository } from '../bosses/bosses.repository'
import { DropItemsRepository } from '../drop-items/drop-items.repository'
import {
  BossDropsRepository,
  NoBossDifficulty,
  NoDropItem,
  RewardExists,
} from './boss-drops.repository'

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
    await new BossesRepository(db).createBoss({
      key: 'lotus',
      name: '스우',
      alias: '스우',
      cycle: 'weekly',
      portraitSlug: 'lotus',
      difficulties: [
        { difficulty: 'hard', requiredLevel: 190, maxPartySize: null },
        { difficulty: 'extreme', requiredLevel: 190, maxPartySize: null },
      ],
    })
    const items = new DropItemsRepository(db)
    await items.create({
      key: 'loose_control_machine_mark',
      name: '루즈 컨트롤 머신 마크',
      iconFile: null,
      valuable: true,
    })
    await items.create({
      key: 'red_boss_ring_box',
      name: '홍옥의 보스 반지 상자',
      iconFile: null,
      valuable: false,
    })
    await items.create({ key: 'spell_trace', name: '주문의 흔적', iconFile: null, valuable: false })
  })
  afterAll(() => close())

  const row = (over: Partial<Parameters<BossDropsRepository['create']>[0]> = {}) => ({
    boss: 'lotus',
    difficulty: 'hard' as const,
    category: 'equipment' as const,
    item: 'loose_control_machine_mark',
    amount: null,
    from: null,
    until: null,
    ...over,
  })

  it('줄을 더하면 그 조합 · 갈래의 맨 뒤에 서고 칸은 갈래 ENUM 순 · 줄 순으로 난다', async () => {
    await repo.create(row({ category: 'consumable', item: 'red_boss_ring_box' }))
    await repo.create(row({ category: 'fixed', item: 'spell_trace', amount: '160개' }))
    await repo.create(row())
    await repo.create(row({ difficulty: 'extreme' }))

    const section = await repo.section()
    expect(section.updatedAt).not.toBeNull()
    expect(section.rewards.map((r) => `${r.difficulty}/${r.category}/${r.item}`)).toEqual([
      'hard/fixed/spell_trace',
      'hard/equipment/loose_control_machine_mark',
      'hard/consumable/red_boss_ring_box',
      'extreme/equipment/loose_control_machine_mark',
    ])
    expect(section.rewards[0]).toEqual({
      boss: 'lotus',
      difficulty: 'hard',
      category: 'fixed',
      item: 'spell_trace',
      amount: '160개',
      from: null,
      until: null,
    })
    expect((await repo.rows('lotus', 'hard')).map((r) => r.itemName)).toEqual([
      '주문의 흔적',
      '루즈 컨트롤 머신 마크',
      '홍옥의 보스 반지 상자',
    ])
  })

  it('모르는 조합 · 아이템과 같은 줄은 던진다. 시작이 다르면 같은 아이템이 둘 설 수 있다', async () => {
    await expect(repo.create(row({ difficulty: 'easy' }))).rejects.toBeInstanceOf(NoBossDifficulty)
    await expect(repo.create(row({ item: 'nobody' }))).rejects.toBeInstanceOf(NoDropItem)
    await repo.create(row())
    await expect(repo.create(row())).rejects.toBeInstanceOf(RewardExists)
    const later = await repo.create(row({ from: '2026-09-17T10:00' }))
    expect(typeof later.id).toBe('string')
  })

  it('수량 · 기간을 고치고 차례를 옮기고 지운다', async () => {
    const a = await repo.create(row({ category: 'consumable', item: 'red_boss_ring_box' }))
    const b = await repo.create(row({ category: 'consumable', item: 'spell_trace' }))

    expect(await repo.update(a.id, { amount: null, from: null, until: '2026-09-17T10:00' })).toBe(
      true,
    )
    expect(await repo.move(b.id, 'up')).toBe(true)
    expect((await repo.rows('lotus', 'hard')).map((r) => [r.item, r.until])).toEqual([
      ['spell_trace', null],
      ['red_boss_ring_box', '2026-09-17T10:00'],
    ])
    expect(await repo.move(b.id, 'up')).toBe(true)
    expect(await repo.remove(a.id)).toBe(true)
    expect(await repo.remove(a.id)).toBe(false)
    expect(await repo.update(a.id, { amount: null, from: null, until: null })).toBe(false)
    expect(await repo.move(a.id, 'down')).toBe(false)
  })
})
