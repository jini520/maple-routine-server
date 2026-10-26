import { eq, sql } from 'drizzle-orm'

import { sha256 } from '../../common/hash'
import { nexonSessions, users } from '../../database/schema'
import { describeDb, openTestDb, type TestDb } from '../../database/test-db'
import { SessionsRepository } from './sessions.repository'

describeDb('SessionsRepository', () => {
  let db: TestDb
  let close: () => Promise<void>
  let truncate: () => Promise<void>
  let repo: SessionsRepository
  let userId: string

  const future = () => new Date(Date.now() + 60_000)

  function input(hash = 's') {
    return {
      sessionHash: sha256(hash),
      userId,
      platform: 'ios' as const,
      accessSealed: Buffer.from('a'),
      accessExpiresAt: future(),
      refreshSealed: Buffer.from('r'),
      refreshExpiresAt: future(),
    }
  }

  beforeAll(async () => {
    ;({ db, close, truncate } = await openTestDb())
    repo = new SessionsRepository(db)
  })
  beforeEach(async () => {
    await truncate()
    const [user] = await db.insert(users).values({}).returning({ id: users.id })
    userId = user.id
  })
  afterAll(() => close())

  it('create 한 뒤 hash 로 찾으면 그 행이 나온다', async () => {
    const { id } = await repo.create(input())

    const row = await repo.findByHash(sha256('s'))
    expect(row?.id).toBe(id)
    expect(row?.userId).toBe(userId)
    expect(row?.platform).toBe('ios')
    expect(row?.accessSealed.toString()).toBe('a')
  })

  it('모르는 hash 는 null 이다', async () => {
    expect(await repo.findByHash(sha256('nope'))).toBeNull()
  })

  it('updateTokens 는 토큰과 만료 시각을 갈아 끼운다', async () => {
    const { id } = await repo.create(input())
    const later = new Date(Date.now() + 3_600_000)

    await repo.updateTokens(id, {
      accessSealed: Buffer.from('a2'),
      accessExpiresAt: later,
      refreshSealed: Buffer.from('r2'),
      refreshExpiresAt: later,
    })

    const row = await repo.findById(id)
    expect(row?.accessSealed.toString()).toBe('a2')
    expect(row?.refreshSealed.toString()).toBe('r2')
    expect(row?.accessExpiresAt.getTime()).toBe(later.getTime())
  })

  it('touch 는 last_used_at 을 지금으로 바꾼다', async () => {
    const { id } = await repo.create(input())
    await db
      .update(nexonSessions)
      .set({ lastUsedAt: sql`now() - interval '1 day'` })
      .where(eq(nexonSessions.id, id))

    await repo.touch(id)

    const [row] = await db.select().from(nexonSessions).where(eq(nexonSessions.id, id))
    expect(Date.now() - row.lastUsedAt.getTime()).toBeLessThan(5_000)
  })

  it('deleteByHash 는 행을 지운다', async () => {
    await repo.create(input())

    await repo.deleteByHash(sha256('s'))

    expect(await repo.findByHash(sha256('s'))).toBeNull()
  })

  it('deleteByUserId 는 그 사람의 세션을 전부 지우고 남의 것은 둔다', async () => {
    await repo.create(input('ios'))
    await repo.create({ ...input('android'), platform: 'android' })
    const [other] = await db.insert(users).values({}).returning({ id: users.id })
    await repo.create({ ...input('other'), userId: other.id })

    await repo.deleteByUserId(userId)

    expect(await repo.findByHash(sha256('ios'))).toBeNull()
    expect(await repo.findByHash(sha256('android'))).toBeNull()
    expect(await repo.findByHash(sha256('other'))).not.toBeNull()
  })

  it('deleteExpired 는 refresh 가 만료된 행만 지운다', async () => {
    await repo.create(input('live'))
    await repo.create({ ...input('dead'), refreshExpiresAt: new Date(Date.now() - 1_000) })

    const removed = await repo.deleteExpired()

    expect(removed).toBe(1)
    expect(await repo.findByHash(sha256('live'))).not.toBeNull()
    expect(await repo.findByHash(sha256('dead'))).toBeNull()
  })
})
