/**
 * 0032 이관을 진짜 Postgres 에서 본다. 0031 까지 올린 새 DB 에 옮긴 이름 · 해외 전용 · 겹친 장비 줄을 넣고 0032 를 적용한다.
 * 운영 DB 는 아이템 표가 차 있어서, 빈 표에서만 도는 test-db 의 마이그레이션으로는 고치는 SQL 이 한 번도 안 돈다.
 */
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { Pool } from 'pg'

import { migrationFoldersUpTo } from './migration-folders'
import { describeDb, TEST_DATABASE_URL } from './test-db'

const BEFORE = '0031_app_images'
const AFTER = '0032_item_names_kms'

describeDb('0032 장비 이름을 한국 서버 이름으로', () => {
  const name = `mig_item_names_${process.pid}_${Date.now()}`
  let admin: Pool
  let pool: Pool
  let db: NodePgDatabase
  let folders: Record<typeof BEFORE | typeof AFTER, string>
  let cleanup: () => void

  beforeAll(async () => {
    admin = new Pool({ connectionString: TEST_DATABASE_URL })
    ;({ folders, cleanup } = migrationFoldersUpTo([BEFORE, AFTER]))
  })
  beforeEach(async () => {
    await admin.query(`CREATE DATABASE ${name}`)
    const url = new URL(TEST_DATABASE_URL ?? '')
    url.pathname = `/${name}`
    pool = new Pool({ connectionString: url.toString() })
    db = drizzle(pool)
    await migrate(db, { migrationsFolder: folders[BEFORE] })
  })
  afterEach(async () => {
    await pool.end()
    await admin.query(`DROP DATABASE ${name} WITH (FORCE)`)
  })
  afterAll(async () => {
    cleanup()
    await admin.end()
  })

  async function insertEquipment(rows: readonly [string, string][]): Promise<void> {
    await pool.query(
      `INSERT INTO items (key, name, level, is_equipment)
       SELECT k, n, 160, true FROM unnest($1::text[], $2::text[]) AS t(k, n)`,
      [rows.map(([k]) => k), rows.map(([, n]) => n)],
    )
  }
  const names = async (): Promise<Record<string, string>> =>
    Object.fromEntries(
      (await pool.query<{ key: string; name: string }>(`SELECT key, name FROM items`)).rows.map(
        (r) => [r.key, r.name],
      ),
    )

  it('옮긴 이름을 고치고 해외 전용 · 겹친 줄을 지우며 다른 줄과 관리 화면에서 고친 이름은 둔다', async () => {
    await insertEquipment([
      ['absolab_forked_cane', '앱솔랩스포크드케인'],
      ['supreme_glorion_ring', '슈프림글로리온링'],
      ['absolab_hellslayer', '앱솔랩스 핼버드'],
      ['absolab_goeseon', '앱솔랩스괴선'],
      ['absolab_monster_ritual_fan', '앱솔랩스몬스터리추얼팬'],
      ['destiny_katana', '데스티니카타나'],
      ['arcane_umbra_illusory_sword', '아케인셰이드일루저리소드'],
    ])
    await migrate(db, { migrationsFolder: folders[AFTER] })
    expect(await names()).toEqual({
      absolab_forked_cane: '앱솔랩스핀쳐케인',
      supreme_glorion_ring: '글로리온링:슈프림',
      absolab_hellslayer: '앱솔랩스 핼버드',
      absolab_goeseon: '앱솔랩스괴선',
    })
    const { rows } = await pool.query(
      `SELECT 1 FROM game_data_sections WHERE key = 'equipmentItems'`,
    )
    expect(rows).toHaveLength(1)
  })

  it('지울 장비를 강화 기록이 가리키면 아무것도 바꾸지 않고 멈춘다', async () => {
    await insertEquipment([
      ['absolab_forked_cane', '앱솔랩스포크드케인'],
      ['genesis_katana', '제네시스카타나'],
    ])
    await pool.query(
      `INSERT INTO enhancement_anomalies (identified_by, history_date, enhancement_type, anomaly_type, item_key, item_name, row_count)
       VALUES ('key', '2026-11-01', 'starforce', 'no_level', 'genesis_katana', '제네시스카타나', 1)`,
    )
    await expect(migrate(db, { migrationsFolder: folders[AFTER] })).rejects.toThrow()
    expect(await names()).toEqual({
      absolab_forked_cane: '앱솔랩스포크드케인',
      genesis_katana: '제네시스카타나',
    })
  })
})
