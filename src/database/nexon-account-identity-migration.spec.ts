/**
 * 0035 이관을 진짜 Postgres 에서 본다. 0034 까지 올린 새 DB 에 옛 모양의 계정 줄을 넣고 0035 를 적용한다.
 * 줄을 옮기고 합치는 SQL 이라, 빈 표에서만 도는 test-db 의 마이그레이션으로는 한 번도 안 돈다.
 */
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { Pool } from 'pg'

import { migrationFoldersUpTo } from './migration-folders'
import { describeDb, TEST_DATABASE_URL } from './test-db'

const BEFORE = '0034_world_periods'
const AFTER = '0035_nexon_account_identity'

describeDb('0035 넥슨 계정 줄을 넥슨 ID 하나로', () => {
  const name = `mig_nexon_identity_${process.pid}_${Date.now()}`
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

  async function person(): Promise<string> {
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO users DEFAULT VALUES RETURNING id`,
    )
    return rows[0]?.id ?? ''
  }
  async function loginRow(userId: string, uid: string): Promise<string> {
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO nexon_accounts (user_id, identity_source, nexon_uid, referral_code)
       VALUES ($1, 'login', $2, upper(substr(md5($2), 1, 8))) RETURNING id`,
      [userId, uid],
    )
    return rows[0]?.id ?? ''
  }
  async function keyRow(userId: string, hash: string): Promise<string> {
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO nexon_accounts (user_id, identity_source, api_key_hash)
       VALUES ($1, 'key', decode($2, 'hex')) RETURNING id`,
      [userId, hash],
    )
    return rows[0]?.id ?? ''
  }
  async function anomaly(userId: string | null): Promise<void> {
    await pool.query(
      `INSERT INTO enhancement_anomalies (user_id, identified_by, history_date, enhancement_type, anomaly_type, item_name, row_count)
       VALUES ($1, 'key', '2026-11-01', 'cube', 'no_cost', '', 1)`,
      [userId],
    )
  }
  const keys = async () =>
    (
      await pool.query<{ account: string; hash: string }>(
        `SELECT nexon_account_id AS account, encode(api_key_hash, 'hex') AS hash FROM nexon_account_keys ORDER BY hash`,
      )
    ).rows
  const accounts = async () =>
    (
      await pool.query<{ id: string; user_id: string; nexon_uid: string | null }>(
        `SELECT id, user_id, nexon_uid FROM nexon_accounts ORDER BY created_at, id`,
      )
    ).rows

  it('키만 가진 사람은 그 줄이 넥슨 계정 줄로 남고 해시는 키 표로 옮겨진다', async () => {
    const u = await person()
    const row = await keyRow(u, 'aa'.repeat(32))

    await migrate(db, { migrationsFolder: folders[AFTER] })

    expect(await accounts()).toEqual([{ id: row, user_id: u, nexon_uid: null }])
    expect(await keys()).toEqual([{ account: row, hash: 'aa'.repeat(32) }])
  })

  // 로그인 밑의 키 줄은 앱이 메이플 ID 가 같은 것을 확인하고 보낸 키로만 들어왔다. 같은 넥슨 ID 다.
  it('로그인 줄과 키 줄을 함께 가진 사람은 키를 로그인 줄에 달고 키 줄을 지운다', async () => {
    const u = await person()
    const login = await loginRow(u, 'uid-1')
    await keyRow(u, 'bb'.repeat(32))
    const other = await person()
    const otherKey = await keyRow(other, 'cc'.repeat(32))

    await migrate(db, { migrationsFolder: folders[AFTER] })

    expect(await accounts()).toEqual([
      { id: login, user_id: u, nexon_uid: 'uid-1' },
      { id: otherKey, user_id: other, nexon_uid: null },
    ])
    expect(await keys()).toEqual([
      { account: login, hash: 'bb'.repeat(32) },
      { account: otherKey, hash: 'cc'.repeat(32) },
    ])
  })

  // 이관 뒤에는 사람마다 넥슨 계정 줄이 하나라 어느 계정의 것인지 고를 수 있다.
  it('강화 이상 보고는 그 사람의 넥슨 계정 줄이 하나면 그 줄로 채우고, 아니면 비운다', async () => {
    const merged = await person()
    const login = await loginRow(merged, 'uid-1')
    await keyRow(merged, 'dd'.repeat(32))
    const twoKeys = await person()
    await keyRow(twoKeys, 'ee'.repeat(32))
    await keyRow(twoKeys, 'ff'.repeat(32))
    await anomaly(merged)
    await anomaly(twoKeys)
    await anomaly(null)

    await migrate(db, { migrationsFolder: folders[AFTER] })

    const { rows } = await pool.query<{ user_id: string | null; nexon_account_id: string | null }>(
      `SELECT user_id, nexon_account_id FROM enhancement_anomalies`,
    )
    expect(rows).toEqual(
      expect.arrayContaining([
        { user_id: merged, nexon_account_id: login },
        { user_id: twoKeys, nexon_account_id: null },
        { user_id: null, nexon_account_id: null },
      ]),
    )
    expect(rows).toHaveLength(3)
  })
})
