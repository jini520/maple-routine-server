/**
 * 옛 DB 를 새 DB 로 옮기는 것을 진짜 Postgres 에서 본다. 옛 DB 는 옛 표의 마지막 마이그레이션까지, 새 DB 는 끝까지 올린다.
 */
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { join } from 'node:path'
import { Pool } from 'pg'

import { migrationFoldersUpTo } from '../database/migration-folders'
import * as oldSchema from '../database/old-schema'
import * as schema from '../database/schema'
import { describeDb, TEST_DATABASE_URL } from '../database/test-db'
import { moveOldDb, SwappedDatabases, UnknownAssetPath, UnknownTradeGroup } from './move-old-db'

/** 옛 DB 의 마지막 마이그레이션. 1.0.14 운영 DB 가 여기까지 올라 있다. */
const OLD_LAST = '0045_market_range_nullable'

describeDb('moveOldDb', () => {
  let names = { old: '', next: '' }
  let run = 0
  let admin: Pool
  let oldPool: Pool
  let newPool: Pool
  let oldDb: NodePgDatabase<typeof oldSchema>
  let newDb: NodePgDatabase<typeof schema>
  let folders: Record<typeof OLD_LAST, string>
  let cleanup: () => void

  const urlOf = (name: string): string => {
    const url = new URL(TEST_DATABASE_URL ?? '')
    url.pathname = `/${name}`
    return url.toString()
  }

  beforeAll(async () => {
    admin = new Pool({ connectionString: TEST_DATABASE_URL })
    ;({ folders, cleanup } = migrationFoldersUpTo([OLD_LAST]))
  })
  beforeEach(async () => {
    run += 1
    const stamp = `${process.pid}_${Date.now()}_${run}`
    names = { old: `move_old_${stamp}`, next: `move_new_${stamp}` }
    await admin.query(`CREATE DATABASE ${names.old}`)
    await admin.query(`CREATE DATABASE ${names.next}`)
    oldPool = new Pool({ connectionString: urlOf(names.old) })
    newPool = new Pool({ connectionString: urlOf(names.next) })
    // DB 를 지울 때 남은 유휴 연결이 끊기며 내는 오류다. 처리기가 없으면 다음 테스트의 실패로 올라온다.
    for (const pool of [oldPool, newPool]) pool.on('error', () => undefined)
    oldDb = drizzle(oldPool, { schema: oldSchema })
    newDb = drizzle(newPool, { schema })
    await migrate(oldDb, { migrationsFolder: folders[OLD_LAST] })
    await migrate(newDb, { migrationsFolder: join(__dirname, '..', 'database', 'migrations') })
  })
  afterEach(async () => {
    await oldPool.end()
    await newPool.end()
    await admin.query(`DROP DATABASE ${names.old} WITH (FORCE)`)
    await admin.query(`DROP DATABASE ${names.next} WITH (FORCE)`)
  })
  afterAll(async () => {
    cleanup()
    await admin.end()
  })

  async function insertOldAsset(path: string, name: string | null = null): Promise<string> {
    const [row] = await oldDb
      .insert(oldSchema.assets)
      .values({ path, sha256: 'a'.repeat(64), size: 1234, width: 10, height: 20, name })
      .returning({ id: oldSchema.assets.id })
    if (row === undefined) throw new Error('옛 그림을 못 넣었다')
    return row.id
  }

  async function insertOldBoss(
    key: string,
    cycle: 'weekly' | 'event_weekly' | 'monthly',
    portraitAssetId: string,
  ): Promise<{ bossId: string; difficultyIds: string[] }> {
    const [boss] = await oldDb
      .insert(oldSchema.bosses)
      .values({
        key,
        name: `${key} 이름`,
        alias: `${key} 별칭`,
        cycle,
        portraitAssetId,
        sortOrder: 3,
        from: '2026-07-03',
        until: '2026-11-05T10:00',
      })
      .returning({ id: oldSchema.bosses.id })
    if (boss === undefined) throw new Error('옛 보스를 못 넣었다')
    const difficulties = await oldDb
      .insert(oldSchema.bossDifficulties)
      .values([
        { bossId: boss.id, difficulty: 'normal', requiredLevel: 270 },
        {
          bossId: boss.id,
          difficulty: 'hard',
          requiredLevel: 280,
          maxPartySize: 3,
          from: '2026-08-14',
          until: null,
        },
      ])
      .returning({ id: oldSchema.bossDifficulties.id })
    return { bossId: boss.id, difficultyIds: difficulties.map((d) => d.id) }
  }

  it('그림은 줄 id 를 그대로 두고 옛 경로를 분류 · 파일 이름 · 확장자로 나눈다. 셋을 이으면 옛 경로의 폴더와 이름이 된다', async () => {
    const paths = [
      'bosses/bellona.webp',
      'items/rings/Weapon_Jump_Ring.png',
      'maps/icons/소멸의여로.png',
      'drop-effect/loop/10.webp',
    ]
    const ids = new Map<string, string>()
    for (const path of paths)
      ids.set(path, await insertOldAsset(path, path === paths[0] ? '벨로나' : null))

    expect(await moveOldDb(oldDb, newDb)).toMatchObject({ assets: 4 })

    const rows = await newDb.select().from(schema.assets)
    expect(rows).toHaveLength(4)
    for (const path of paths) {
      const row = rows.find((r) => r.id === ids.get(path))
      expect(row).toMatchObject({ sha256: 'a'.repeat(64), sizeBytes: 1234, width: 10, height: 20 })
      expect(`${row?.fileName}.${row?.extension}`).toBe(path.slice(path.lastIndexOf('/') + 1))
    }
    expect(rows.find((r) => r.id === ids.get('items/rings/Weapon_Jump_Ring.png'))?.category).toBe(
      'item_ring',
    )
    expect(rows.find((r) => r.id === ids.get('bosses/bellona.webp'))?.name).toBe('벨로나')
  })

  it('보스는 별칭 · 기간 칸을 새 이름으로 옮기고, 시즌 보스는 표시를 켜고 난이도의 주기를 주간으로, 월간 보스는 난이도의 주기를 월간으로 적는다', async () => {
    const portrait = await insertOldAsset('bosses/maerin.webp')
    const weekly = await insertOldBoss('lotus', 'weekly', portrait)
    const season = await insertOldBoss('meirin', 'event_weekly', portrait)
    const monthly = await insertOldBoss('black_mage', 'monthly', portrait)

    expect(await moveOldDb(oldDb, newDb)).toMatchObject({
      assets: 1,
      bosses: 3,
      bossDifficulties: 6,
    })

    const bosses = await newDb.select().from(schema.bosses)
    expect(bosses.find((b) => b.id === season.bossId)).toMatchObject({
      key: 'meirin',
      name: 'meirin 이름',
      shortName: 'meirin 별칭',
      isSeasonBoss: true,
      portraitAssetId: portrait,
      sortOrder: 3,
      validFrom: '2026-07-03',
      validUntil: '2026-11-05T10:00',
    })
    expect(bosses.find((b) => b.id === weekly.bossId)?.isSeasonBoss).toBe(false)
    expect(bosses.find((b) => b.id === monthly.bossId)?.isSeasonBoss).toBe(false)

    const difficulties = await newDb.select().from(schema.bossDifficulties)
    const cycleOf = (ids: string[]) => ids.map((id) => difficulties.find((d) => d.id === id)?.cycle)
    expect(cycleOf(weekly.difficultyIds)).toEqual(['weekly', 'weekly'])
    expect(cycleOf(season.difficultyIds)).toEqual(['weekly', 'weekly'])
    expect(cycleOf(monthly.difficultyIds)).toEqual(['monthly', 'monthly'])
    expect(difficulties.find((d) => d.id === season.difficultyIds[1])).toMatchObject({
      bossId: season.bossId,
      difficulty: 'hard',
      requiredLevel: 280,
      maxPartySize: 3,
      validFrom: '2026-08-14',
      validUntil: null,
    })
  })

  it('폴더를 분류로 읽지 못하는 그림이 있으면 그 경로를 알리고 아무것도 옮기지 않는다', async () => {
    await insertOldAsset('bosses/bellona.webp')
    await oldPool.query(
      `INSERT INTO assets (path, sha256, size, width, height) VALUES ('themes/a.webp', repeat('0', 64), 1, 1, 1)`,
    )

    await expect(moveOldDb(oldDb, newDb)).rejects.toEqual(new UnknownAssetPath('themes/a.webp'))
    expect(await newDb.select().from(schema.assets)).toEqual([])
  })

  // 옛 마이그레이션 0041 이 빈 DB 에도 묶음 줄을 넣는다. 그 줄은 옛 DB 의 묶음으로 갈아 끼운다.
  it('다시 돌리면 옮길 표를 비우고 다시 채운다. 새 DB 에 마이그레이션이 넣은 묶음 줄도 옛 DB 의 줄로 바뀐다', async () => {
    const seeded = await newDb.select({ id: schema.itemGroups.id }).from(schema.itemGroups)
    expect(seeded.length).toBeGreaterThan(0)
    const portrait = await insertOldAsset('bosses/maerin.webp')
    await insertOldBoss('meirin', 'event_weekly', portrait)
    await insertOldGroup('spec_ring', 'accessory')

    const first = await moveOldDb(oldDb, newDb)
    const second = await moveOldDb(oldDb, newDb)

    expect(second).toEqual(first)
    expect(await newDb.select().from(schema.bosses)).toHaveLength(1)
    const oldIds = (await oldDb.select().from(oldSchema.itemGroups)).map((g) => g.id).sort()
    const newIds = (await newDb.select().from(schema.itemGroups)).map((g) => g.id).sort()
    expect(newIds).toEqual(oldIds)
    expect(newIds).not.toEqual(seeded.map((g) => g.id).sort())
  })

  it('옛 DB 와 새 DB 를 바꿔 넣으면 아무것도 하지 않고 멈춘다', async () => {
    await insertOldAsset('bosses/maerin.webp')
    const swapped = moveOldDb(
      newDb as unknown as NodePgDatabase<typeof oldSchema>,
      oldDb as unknown as NodePgDatabase<typeof schema>,
    )
    await expect(swapped).rejects.toBeInstanceOf(SwappedDatabases)
    expect(await oldDb.select().from(oldSchema.assets)).toHaveLength(1)
  })

  async function insertOldGroup(key: string, kind: string): Promise<string> {
    const [row] = await oldDb
      .insert(oldSchema.itemGroups)
      .values({ key, kind, name: `${key} 이름`, sortOrder: 0 })
      .returning({ id: oldSchema.itemGroups.id })
    if (row === undefined) throw new Error('옛 묶음을 못 넣었다')
    return row.id
  }

  async function insertOldItem(
    key: string,
    values: Partial<typeof oldSchema.items.$inferInsert> = {},
  ): Promise<string> {
    const [row] = await oldDb
      .insert(oldSchema.items)
      .values({ key, name: `${key} 이름`, isDrop: true, ...values })
      .returning({ id: oldSchema.items.id })
    if (row === undefined) throw new Error('옛 아이템을 못 넣었다')
    return row.id
  }

  /** 레벨 범위가 있는 상자 하나와 그 내용물. */
  async function insertOldBox(
    key: string,
    level: [number, number] | null,
    contents: string[],
  ): Promise<void> {
    const boxItem = await insertOldItem(key)
    const [box] = await oldDb
      .insert(oldSchema.dropBoxes)
      .values({ itemId: boxItem, levelMin: level?.[0] ?? null, levelMax: level?.[1] ?? null })
      .returning({ id: oldSchema.dropBoxes.id })
    if (box === undefined) throw new Error('옛 상자를 못 넣었다')
    await oldDb
      .insert(oldSchema.dropBoxContents)
      .values(contents.map((itemId, i) => ({ boxId: box.id, itemId, sortOrder: i })))
  }

  it('아이템은 줄 id 를 그대로 두고 묶음 key 를 묶음 줄 id 로, 고가 · 착용 레벨을 새 칸으로 옮기고 월드 간 거래 불가는 버린다', async () => {
    const group = await insertOldGroup('spec_pendant', 'accessory')
    const icon = await insertOldAsset('items/pendant.png')
    const id = await insertOldItem('dominator', {
      category: 'spec_pendant',
      iconAssetId: icon,
      valuable: true,
      worldBound: true,
      level: 140,
      isEquipment: true,
    })

    await moveOldDb(oldDb, newDb)

    const groups = await newDb.select().from(schema.itemGroups)
    expect(groups.find((g) => g.id === group)).toMatchObject({
      key: 'spec_pendant',
      type: 'accessory',
    })
    expect((await newDb.select().from(schema.items)).find((i) => i.id === id)).toMatchObject({
      key: 'dominator',
      name: 'dominator 이름',
      groupId: group,
      iconAssetId: icon,
      isValuable: true,
      requiredLevel: 140,
      isDrop: true,
      isEquipment: true,
    })
  })

  it('레벨 범위가 있는 상자의 장신구 묶음 아이템은 레벨마다 줄을 더하고, 상자에서도 나오는 연마석은 같은 물건의 줄을 하나 더한다', async () => {
    const ringGroup = await insertOldGroup('spec_ring', 'accessory')
    await insertOldGroup('spec_loot', 'consumable')
    const icon = await insertOldAsset('items/rings/restraint.png')
    const ring = await insertOldItem('restraint_ring', {
      name: '리스트레인트 링',
      category: 'spec_ring',
      iconAssetId: icon,
      valuable: true,
    })
    const whetstone = await insertOldItem('life_whetstone', {
      name: '생명의 연마석',
      category: 'spec_loot',
      valuable: true,
    })
    await insertOldBox('life_boss_ring_box', [3, 4], [ring, whetstone])
    await insertOldBox('white_boss_ring_box', [1, 3], [ring])

    await moveOldDb(oldDb, newDb)

    const all = await newDb.select().from(schema.items)
    const levels = await newDb.select().from(schema.ringLevelItems)
    expect(levels.map((l) => [l.ringItemId, l.ringLevel]).sort()).toEqual([
      [ring, 1],
      [ring, 2],
      [ring, 3],
      [ring, 4],
    ])
    const lv4 = all.find((i) => i.id === levels.find((l) => l.ringLevel === 4)?.itemId)
    expect(lv4).toMatchObject({
      key: 'restraint_ring_lv4',
      name: '리스트레인트 링 lv.4',
      groupId: ringGroup,
      iconAssetId: icon,
      isValuable: true,
      isDrop: true,
      isEquipment: false,
      requiredLevel: null,
    })
    expect(all.some((i) => i.key.startsWith('life_whetstone_lv'))).toBe(false)

    const boxed = all.find((i) => i.key === 'life_whetstone_from_box')
    const original = all.find((i) => i.id === whetstone)
    expect(boxed && { ...boxed, id: '', key: '', updatedAt: null }).toEqual(
      original && { ...original, id: '', key: '', updatedAt: null },
    )
    expect(
      (await newDb.select().from(schema.sameItemLinks)).map((l) => [l.itemId, l.originalItemId]),
    ).toEqual([[boxed?.id, whetstone]])
  })

  it('거래권 글자를 거래권 줄로 만들어 월드가 가리키게 하고, 월드의 참 · 거짓 칸과 열린 기간을 새 이름으로 옮긴다', async () => {
    const [scania, eos, special] = await oldDb
      .insert(oldSchema.worlds)
      .values([
        { key: 'scania', name: '스카니아', priceGroup: 'general', sortOrder: 0 },
        { key: 'eos', name: '에오스', priceGroup: 'helios_eos', challengers: true, sortOrder: 1 },
        { key: 'special', name: '스페셜', priceGroup: null, event: true, sortOrder: 2 },
      ])
      .returning({ id: oldSchema.worlds.id })
    const [period] = await oldDb
      .insert(oldSchema.worldPeriods)
      .values({ worldId: eos?.id ?? '', from: '2026-06-18', until: '2026-09-17' })
      .returning({ id: oldSchema.worldPeriods.id })

    await moveOldDb(oldDb, newDb)

    const groups = await newDb.select().from(schema.tradeGroups)
    expect(groups.map((g) => [g.key, g.name]).sort()).toEqual([
      ['general', '일반 월드'],
      ['helios_eos', '에오스 · 핼리오스'],
    ])
    const groupOf = new Map(groups.map((g) => [g.id, g.key]))
    const worlds = await newDb.select().from(schema.worlds)
    const byId = new Map(worlds.map((w) => [w.id, w]))
    expect(groupOf.get(byId.get(scania?.id ?? '')?.tradeGroupId ?? '')).toBe('general')
    expect(byId.get(eos?.id ?? '')).toMatchObject({ isChallengers: true, isEvent: false })
    expect(byId.get(special?.id ?? '')).toMatchObject({ tradeGroupId: null, isEvent: true })
    expect(
      (await newDb.select().from(schema.worldOpenPeriods)).map(({ updatedAt, ...p }) => ({
        ...p,
        hasUpdatedAt: updatedAt instanceof Date,
      })),
    ).toEqual([
      {
        id: period?.id,
        worldId: eos?.id,
        validFrom: '2026-06-18',
        validUntil: '2026-09-17',
        hasUpdatedAt: true,
      },
    ])
  })

  it('이름을 정하지 않은 거래권 글자가 있으면 알리고 아무것도 옮기지 않는다', async () => {
    await oldDb
      .insert(oldSchema.worlds)
      .values({ key: 'nova', name: '노바', priceGroup: 'challengers_5', sortOrder: 0 })

    await expect(moveOldDb(oldDb, newDb)).rejects.toEqual(new UnknownTradeGroup('challengers_5'))
    expect(await newDb.select().from(schema.worlds)).toEqual([])
  })
})
