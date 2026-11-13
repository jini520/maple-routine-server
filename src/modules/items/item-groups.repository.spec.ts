import { gameDataSections, itemGroups } from '../../database/schema'
import { describeDb, insertItems, openTestDb, type TestDb } from '../../database/test-db'
import {
  ItemGroupExists,
  ItemGroupInUse,
  ItemGroupNameTaken,
  ItemGroupsRepository,
} from './item-groups.repository'

describeDb('ItemGroupsRepository', () => {
  let db: TestDb
  let close: () => Promise<void>
  let truncate: () => Promise<void>
  let repo: ItemGroupsRepository
  let migrated: (typeof itemGroups.$inferSelect)[]

  beforeAll(async () => {
    ;({ db, close, truncate } = await openTestDb())
    repo = new ItemGroupsRepository(db)
    // 묶음 표는 이관이 채운 그대로 다른 스펙이 쓴다. 여기서 비웠다가 끝나면 되돌린다.
    migrated = await db.select().from(itemGroups)
  })
  beforeEach(async () => {
    await truncate()
    await db.delete(itemGroups)
    await db.insert(itemGroups).values([
      { key: 'box', kind: 'consumable', name: '상자', sortOrder: 1 },
      { key: 'boss_loot', kind: 'consumable', name: '보스 전리품', sortOrder: 2 },
      { key: 'etc_boss_loot', kind: 'etc', name: '보스 전리품', sortOrder: 1 },
      { key: 'cash', kind: 'cash', name: '캐시', sortOrder: 1 },
    ])
  })
  afterAll(async () => {
    await truncate()
    await db.delete(itemGroups)
    await db.insert(itemGroups).values(migrated)
    await close()
  })

  const touched = async () =>
    (await db.select({ key: gameDataSections.key }).from(gameDataSections)).map((r) => r.key)
  const groupsOf = async (kind: string) =>
    (await repo.tree()).find((k) => k.key === kind)?.groups.map((g) => g.key)

  it('종류는 코드의 차례로 모두 서고 묶음은 차례대로 선다. 더한 묶음은 그 종류의 맨 뒤이고 앱 칸의 시각은 그대로다', async () => {
    await repo.create({ key: 'boutique', kind: 'consumable', name: '부티크' })
    expect(await repo.tree()).toEqual([
      { key: 'equipment', name: '장비', groups: [] },
      { key: 'accessory', name: '장신구', groups: [] },
      {
        key: 'consumable',
        name: '소비',
        groups: [
          { key: 'box', name: '상자' },
          { key: 'boss_loot', name: '보스 전리품' },
          { key: 'boutique', name: '부티크' },
        ],
      },
      { key: 'etc', name: '기타', groups: [{ key: 'etc_boss_loot', name: '보스 전리품' }] },
      { key: 'cash', name: '캐시', groups: [{ key: 'cash', name: '캐시' }] },
    ])
    expect(await touched()).toEqual([])
  })

  it('같은 key 는 ItemGroupExists, 같은 종류 안의 같은 이름은 ItemGroupNameTaken 이다. 종류가 다르면 이름이 같아도 된다', async () => {
    await expect(repo.create({ key: 'box', kind: 'etc', name: '새 상자' })).rejects.toBeInstanceOf(
      ItemGroupExists,
    )
    await expect(
      repo.create({ key: 'boxes', kind: 'consumable', name: '상자' }),
    ).rejects.toBeInstanceOf(ItemGroupNameTaken)
    await expect(
      repo.update('box', { kind: 'consumable', name: '보스 전리품' }),
    ).rejects.toBeInstanceOf(ItemGroupNameTaken)
    await repo.create({ key: 'acc_boss_loot', kind: 'accessory', name: '보스 전리품' })
    expect(await groupsOf('accessory')).toEqual(['acc_boss_loot'])
  })

  it('↑ ↓ 는 같은 종류 안에서 이웃과 차례를 바꾸고, 끝에서는 그대로다. 모르는 key 는 false 다', async () => {
    expect(await repo.move('boss_loot', 'up')).toBe(true)
    expect(await groupsOf('consumable')).toEqual(['boss_loot', 'box'])
    expect(await repo.move('boss_loot', 'up')).toBe(true)
    expect(await groupsOf('consumable')).toEqual(['boss_loot', 'box'])
    expect(await repo.move('cash', 'down')).toBe(true)
    expect(await groupsOf('cash')).toEqual(['cash'])
    expect(await repo.move('nobody', 'up')).toBe(false)
  })

  it('이름만 바꾸면 앱 칸의 시각을 안 민다. 다른 종류로 옮긴 묶음은 그 종류의 맨 뒤에 서고, 아이템이 든 묶음일 때만 items 칸의 시각을 민다', async () => {
    expect(await repo.update('box', { kind: 'consumable', name: '상자들' })).toBe(true)
    expect((await repo.tree()).find((k) => k.key === 'consumable')?.groups[0]).toEqual({
      key: 'box',
      name: '상자들',
    })
    expect(await repo.update('cash', { kind: 'etc', name: '캐시' })).toBe(true)
    expect(await groupsOf('etc')).toEqual(['etc_boss_loot', 'cash'])
    expect(await groupsOf('cash')).toEqual([])
    expect(await touched()).toEqual([])

    await insertItems(db, [{ key: 'red_cube', name: '레드 큐브', category: 'cash' }])
    expect(await repo.update('cash', { kind: 'cash', name: '캐시' })).toBe(true)
    expect(await touched()).toEqual(['items'])
    expect(await repo.update('nobody', { kind: 'cash', name: '없음' })).toBe(false)
  })

  it('아이템이 든 묶음은 ItemGroupInUse 로 거절하고, 빈 묶음은 지운다. 모르는 key 는 false 다', async () => {
    await insertItems(db, [{ key: 'red_cube', name: '레드 큐브', category: 'cash' }])
    await expect(repo.remove('cash')).rejects.toBeInstanceOf(ItemGroupInUse)
    expect(await repo.remove('box')).toBe(true)
    expect(await groupsOf('consumable')).toEqual(['boss_loot'])
    expect(await repo.remove('nobody')).toBe(false)
  })
})
