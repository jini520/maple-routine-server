import { eq } from 'drizzle-orm'

import { sha256 } from '../../common/hash'
import { nexonAccounts, users } from '../../database/schema'
import { describeDb, openTestDb, type TestDb } from '../../database/test-db'
import { UsersRepository } from './users.repository'

const RECORD_A = '0a0a0a0a-0000-4000-8000-00000000000a'
const RECORD_B = '0b0b0b0b-0000-4000-8000-00000000000b'

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

  it('처음 보는 uid 는 사람과 로그인 계정을 함께 만든다', async () => {
    const found = await repo.upsertByNexonUid('uid-1')

    expect(await db.select().from(users)).toEqual([expect.objectContaining({ id: found.id })])
    expect(await db.select().from(nexonAccounts)).toEqual([
      expect.objectContaining({
        id: found.nexonAccountId,
        userId: found.id,
        identitySource: 'login',
        nexonUid: 'uid-1',
        apiKeyHash: null,
        accountRecordId: null,
      }),
    ])
  })

  it('같은 uid 로 다시 오면 같은 사람 · 같은 계정이다', async () => {
    const first = await repo.upsertByNexonUid('uid-1')
    const second = await repo.upsertByNexonUid('uid-1')

    expect(second).toEqual(first)
    expect(await db.select().from(users)).toHaveLength(1)
    expect(await db.select().from(nexonAccounts)).toHaveLength(1)
  })

  // 두 요청이 같은 uid 로 겹쳐 와도 사람이 둘 생기면 안 된다. 한 사람의 기록이 갈라진다.
  it('같은 uid 가 동시에 와도 사람은 하나다', async () => {
    const [a, b] = await Promise.all([
      repo.upsertByNexonUid('uid-1'),
      repo.upsertByNexonUid('uid-1'),
    ])

    expect(a.id).toBe(b.id)
    expect(await db.select().from(users)).toHaveLength(1)
  })

  it('탈퇴한 사람이 다시 로그인하면 탈퇴 표시를 거둔다', async () => {
    const { id } = await repo.upsertByNexonUid('uid-1')
    await db.update(users).set({ deletedAt: new Date() }).where(eq(users.id, id))

    await repo.upsertByNexonUid('uid-1')

    const [row] = await db.select().from(users).where(eq(users.id, id))
    expect(row?.deletedAt).toBeNull()
  })

  it('키 해시도 같은 규칙이다. 처음은 만들고 다시 오면 같은 계정이고 탈퇴 표시를 거둔다', async () => {
    const hash = sha256('a'.repeat(64))
    const first = await repo.upsertByApiKeyHash(hash)
    await db.update(users).set({ deletedAt: new Date() }).where(eq(users.id, first.id))

    const second = await repo.upsertByApiKeyHash(hash)

    expect(second).toEqual(first)
    const [account] = await db.select().from(nexonAccounts)
    expect(account).toEqual(
      expect.objectContaining({ identitySource: 'key', apiKeyHash: hash, nexonUid: null }),
    )
    const [row] = await db.select().from(users).where(eq(users.id, first.id))
    expect(row?.deletedAt).toBeNull()
  })

  it('세션 경로는 그 사람의 로그인 계정을 찾는다', async () => {
    const { id, nexonAccountId } = await repo.upsertByNexonUid('uid-1')

    await expect(repo.findLoginAccount(id)).resolves.toEqual({
      nexonAccountId,
      accountRecordId: null,
    })
    await expect(repo.findLoginAccount('00000000-0000-4000-8000-000000000000')).resolves.toBeNull()
  })

  it('기기 계정 id 를 적고, 바뀌면 덮는다', async () => {
    const { id, nexonAccountId } = await repo.upsertByNexonUid('uid-1')

    await repo.recordAccountId(nexonAccountId, RECORD_A)
    await expect(repo.findLoginAccount(id)).resolves.toEqual({
      nexonAccountId,
      accountRecordId: RECORD_A,
    })

    await repo.recordAccountId(nexonAccountId, RECORD_B)
    await expect(repo.findLoginAccount(id)).resolves.toEqual({
      nexonAccountId,
      accountRecordId: RECORD_B,
    })
  })

  // 같은 사람의 다른 계정이 이미 그 id 를 가졌다. 사람 안에서 유일해야 하므로 요청을 막지 않고 적지 않는다.
  it('같은 사람의 다른 계정이 쓰는 id 면 적지 않고 던지지도 않는다', async () => {
    const login = await repo.upsertByNexonUid('uid-1')
    const [key] = await db
      .insert(nexonAccounts)
      .values({
        userId: login.id,
        identitySource: 'key',
        apiKeyHash: sha256('k'),
        accountRecordId: RECORD_A,
      })
      .returning({ id: nexonAccounts.id })

    await expect(repo.recordAccountId(login.nexonAccountId, RECORD_A)).resolves.toBeUndefined()

    await expect(repo.findLoginAccount(login.id)).resolves.toEqual({
      nexonAccountId: login.nexonAccountId,
      accountRecordId: null,
    })
    expect(key?.id).toBeDefined()
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
