import { eq } from 'drizzle-orm'

import { sha256 } from '../../common/hash'
import { nexonAccounts, usageEvents, users } from '../../database/schema'
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

  // 다시 왔다고 예약을 거두면 사용자가 모르는 채로 삭제가 취소된다. 취소는 앱이 물은 뒤에만 한다.
  it('삭제를 예약한 사람이 다시 와도 같은 사람이고 예약은 그대로다', async () => {
    const { id } = await repo.upsertByNexonUid('uid-1')
    await repo.requestDeletion(id)

    const again = await repo.upsertByNexonUid('uid-1')

    expect(again.id).toBe(id)
    await expect(repo.deletionRequestedAt(id)).resolves.not.toBeNull()
  })

  it('키 해시도 같은 규칙이다. 처음은 만들고 다시 오면 같은 계정이다', async () => {
    const hash = sha256('a'.repeat(64))
    const first = await repo.upsertByApiKeyHash(hash)

    const second = await repo.upsertByApiKeyHash(hash)

    expect(second).toEqual(first)
    const [account] = await db.select().from(nexonAccounts)
    expect(account).toEqual(
      expect.objectContaining({ identitySource: 'key', apiKeyHash: hash, nexonUid: null }),
    )
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

  // 다시 누를 때마다 시각을 덮으면 유예가 끝없이 밀린다.
  it('삭제 예약은 처음 시각을 남기고, 취소하면 비운다', async () => {
    const { id } = await repo.upsertByNexonUid('uid-1')
    await db
      .update(users)
      .set({ deletionRequestedAt: new Date('2026-01-01T00:00:00Z') })
      .where(eq(users.id, id))

    await repo.requestDeletion(id)
    expect((await repo.deletionRequestedAt(id))?.toISOString()).toBe('2026-01-01T00:00:00.000Z')

    await repo.cancelDeletion(id)
    await expect(repo.deletionRequestedAt(id)).resolves.toBeNull()
  })

  it('기준보다 앞서 예약한 사람만 지우고, 남기는 표의 줄은 사람과의 연결만 끊는다', async () => {
    const hash = sha256('b'.repeat(64))
    const due = await repo.upsertByApiKeyHash(hash)
    const kept = await repo.upsertByNexonUid('uid-2')
    await db
      .update(users)
      .set({ deletionRequestedAt: new Date('2026-10-01T00:00:00Z') })
      .where(eq(users.id, due.id))
    await db
      .update(users)
      .set({ deletionRequestedAt: new Date('2026-11-01T00:00:00Z') })
      .where(eq(users.id, kept.id))
    const event = {
      identifiedBy: 'key' as const,
      type: 'visit' as const,
      name: '',
      platform: 'ios' as const,
      appVersion: '1.0.13',
      occurredAt: new Date('2026-10-01T00:00:00Z'),
    }
    await db.insert(usageEvents).values([
      { ...event, userId: due.id },
      { ...event, userId: kept.id },
    ])

    await expect(repo.purgeDeletionsBefore(new Date('2026-10-15T00:00:00Z'))).resolves.toBe(1)

    expect((await db.select().from(users)).map((row) => row.id)).toEqual([kept.id])
    expect((await db.select().from(nexonAccounts)).map((row) => row.userId)).toEqual([kept.id])
    expect((await db.select().from(usageEvents)).map((row) => row.userId).sort()).toEqual(
      [kept.id, null].sort(),
    )
  })

  // 지운 사람의 기록과 이어지면 익명이 아니다.
  it('지운 뒤 같은 키로 오면 새 사람이다', async () => {
    const hash = sha256('c'.repeat(64))
    const before = await repo.upsertByApiKeyHash(hash)
    await db
      .update(users)
      .set({ deletionRequestedAt: new Date('2026-01-01T00:00:00Z') })
      .where(eq(users.id, before.id))
    await repo.purgeDeletionsBefore(new Date('2026-02-01T00:00:00Z'))

    const after = await repo.upsertByApiKeyHash(hash)

    expect(after.id).not.toBe(before.id)
  })
})
