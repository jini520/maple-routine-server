import { eq } from 'drizzle-orm'

import { sha256 } from '../../common/hash'
import { users } from '../../database/schema'
import { describeDb, openTestDb, type TestDb } from '../../database/test-db'
import { UsersRepository } from './users.repository'

describeDb('UsersRepository', () => {
  let db: TestDb
  let close: () => Promise<void>
  let truncate: () => Promise<void>
  let repo: UsersRepository

  beforeAll(async () => {
    ;({ db, close, truncate } = await openTestDb())
    repo = new UsersRepository(db)
  })
  beforeEach(() => truncate())
  afterAll(() => close())

  it('처음 보는 uid 는 행을 만든다', async () => {
    const { id } = await repo.upsertByNexonUid('uid-1')

    const rows = await db.select().from(users)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.id).toBe(id)
    expect(rows[0]?.nexonUid).toBe('uid-1')
  })

  it('같은 uid 로 다시 오면 같은 행이 된다', async () => {
    const first = await repo.upsertByNexonUid('uid-1')
    const second = await repo.upsertByNexonUid('uid-1')

    expect(second.id).toBe(first.id)
    expect(await db.select().from(users)).toHaveLength(1)
  })

  it('탈퇴한 사람이 다시 로그인하면 탈퇴 표시를 거둔다', async () => {
    const { id } = await repo.upsertByNexonUid('uid-1')
    await db.update(users).set({ deletedAt: new Date() }).where(eq(users.id, id))

    await repo.upsertByNexonUid('uid-1')

    const [row] = await db.select().from(users).where(eq(users.id, id))
    expect(row?.deletedAt).toBeNull()
  })

  it('키 해시도 같은 규칙이다. 처음은 만들고 다시 오면 같은 행이고 탈퇴 표시를 거둔다', async () => {
    const hash = sha256('a'.repeat(64))
    const first = await repo.upsertByApiKeyHash(hash)
    await db.update(users).set({ deletedAt: new Date() }).where(eq(users.id, first.id))

    const second = await repo.upsertByApiKeyHash(hash)

    expect(second.id).toBe(first.id)
    const [row] = await db.select().from(users).where(eq(users.id, first.id))
    expect(row?.apiKeyHash).toEqual(hash)
    expect(row?.nexonUid).toBeNull()
    expect(row?.deletedAt).toBeNull()
    expect(await db.select().from(users)).toHaveLength(1)
  })

  it('markDeleted 는 탈퇴 시각을 적고 두 번째는 안 덮는다', async () => {
    const { id } = await repo.upsertByNexonUid('uid-1')

    await repo.markDeleted(id)
    const [first] = await db.select().from(users).where(eq(users.id, id))
    expect(first?.deletedAt).not.toBeNull()

    await db
      .update(users)
      .set({ deletedAt: new Date('2026-01-01T00:00:00Z') })
      .where(eq(users.id, id))
    await repo.markDeleted(id)
    const [second] = await db.select().from(users).where(eq(users.id, id))
    expect(second?.deletedAt?.toISOString()).toBe('2026-01-01T00:00:00.000Z')
  })
})
