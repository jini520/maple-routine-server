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
import { moveOldDb, NotEmpty, UnknownAssetPath } from './move-old-db'

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

    expect(await moveOldDb(oldDb, newDb)).toEqual({ assets: 1, bosses: 3, bossDifficulties: 6 })

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

  it('새 DB 의 옮길 표에 줄이 있으면 아무것도 옮기지 않는다', async () => {
    const portrait = await insertOldAsset('bosses/maerin.webp')
    await insertOldBoss('meirin', 'event_weekly', portrait)
    await moveOldDb(oldDb, newDb)

    await expect(moveOldDb(oldDb, newDb)).rejects.toBeInstanceOf(NotEmpty)
    expect(await newDb.select().from(schema.bosses)).toHaveLength(1)
    expect(await newDb.select().from(schema.assets)).toHaveLength(1)
  })
})
