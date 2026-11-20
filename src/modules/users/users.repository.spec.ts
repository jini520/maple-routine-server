import { eq } from 'drizzle-orm'

import { sha256Hex } from '../../common/hash'
import { isCheckViolation, isUniqueViolation } from '../../common/pg-errors'
import {
  mapleIds,
  nexonAccounts,
  referrals,
  subAccountRegistrations,
  usageEvents,
  users,
} from '../../database/schema'
import { describeDb, openTestDb, type TestDb } from '../../database/test-db'
import * as referralCode from './referral-code'
import { UsersRepository } from './users.repository'

async function errorOf(query: PromiseLike<unknown>): Promise<unknown> {
  try {
    await query
  } catch (error) {
    return error
  }
  return undefined
}

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

  it('처음 보는 uid 는 사람과 로그인 계정을 함께 만들고, uid 는 원문이 아니라 해시로 둔다', async () => {
    const found = await repo.upsertByNexonUid('uid-1')

    expect(await db.select().from(users)).toEqual([expect.objectContaining({ id: found.id })])
    expect(await db.select().from(nexonAccounts)).toEqual([
      expect.objectContaining({
        id: found.nexonAccountId,
        userId: found.id,
        uidHash: sha256Hex('uid-1'),
      }),
    ])
    expect(await db.select().from(mapleIds)).toEqual([])
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

  // 키는 다시 받으면 바뀌어, 키 해시로 찾으면 그때마다 새 사람이 생겼다. 메이플 ID 는 바뀌지 않는다.
  it('처음 보는 메이플 ID 는 사람 · 넥슨 계정 줄 · 메이플 ID 줄을 만들고, 다시 오면 같은 계정이다', async () => {
    const first = await repo.upsertByMapleId('m1')

    const second = await repo.upsertByMapleId('m1')

    expect(second).toEqual(first)
    expect(await db.select().from(nexonAccounts)).toEqual([
      expect.objectContaining({ id: first.nexonAccountId, userId: first.id, uidHash: null }),
    ])
    expect(await db.select().from(mapleIds)).toEqual([
      expect.objectContaining({ nexonAccountId: first.nexonAccountId, hash: 'm1' }),
    ])
  })

  it('같은 메이플 ID 가 동시에 와도 사람과 넥슨 계정 줄은 하나다', async () => {
    const [a, b] = await Promise.all([repo.upsertByMapleId('m1'), repo.upsertByMapleId('m1')])

    expect(a).toEqual(b)
    expect(await db.select().from(users)).toHaveLength(1)
    expect(await db.select().from(nexonAccounts)).toHaveLength(1)
  })

  it('세션 경로는 그 사람의 로그인 계정을 찾는다', async () => {
    const { id, nexonAccountId } = await repo.upsertByNexonUid('uid-1')
    const keyUser = await repo.upsertByMapleId('m1')

    await expect(repo.findLoginAccount(id)).resolves.toEqual({ nexonAccountId })
    await expect(repo.findLoginAccount(keyUser.id)).resolves.toBeNull()
    await expect(repo.findLoginAccount('00000000-0000-4000-8000-000000000000')).resolves.toBeNull()
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
    const due = await repo.upsertByMapleId('m-due')
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
  it('지운 뒤 같은 메이플 ID 로 오면 새 사람이다', async () => {
    const before = await repo.upsertByMapleId('m1')
    await db
      .update(users)
      .set({ deletionRequestedAt: new Date('2026-01-01T00:00:00Z') })
      .where(eq(users.id, before.id))
    await repo.purgeDeletionsBefore(new Date('2026-02-01T00:00:00Z'))

    const after = await repo.upsertByMapleId('m1')

    expect(after.id).not.toBe(before.id)
  })

  it('전체 사용자는 삭제를 예약한 사람을 빼고, 기준 시각 앞에 만든 사람만 따로 셀 수 있다', async () => {
    await db.insert(users).values([
      { createdAt: new Date('2026-11-01T00:00:00Z') },
      { createdAt: new Date('2026-11-03T00:00:00Z') },
      {
        createdAt: new Date('2026-11-03T00:00:00Z'),
        deletionRequestedAt: new Date('2026-11-04T00:00:00Z'),
      },
    ])

    expect(await repo.countActive()).toBe(2)
    expect(await repo.countActive(new Date('2026-11-02T00:00:00Z'))).toBe(1)
  })

  // UTC 로 자르면 한국 시각 오전 9시 전에 만든 사람이 전날로 간다.
  it('새 사용자를 한국 시각 날짜로 세고, 그 중 삭제를 예약하지 않은 사람을 따로 센다', async () => {
    await db.insert(users).values([
      { createdAt: new Date('2026-11-02T14:00:00Z') },
      { createdAt: new Date('2026-11-02T15:30:00Z') },
      {
        createdAt: new Date('2026-11-03T03:00:00Z'),
        deletionRequestedAt: new Date('2026-11-04T00:00:00Z'),
      },
    ])

    const range = {
      since: new Date('2026-11-02T15:00:00Z'),
      until: new Date('2026-11-03T15:00:00Z'),
    }
    expect(await repo.createdDaily(range)).toEqual([{ day: '2026-11-03', created: 2, active: 1 }])
  })

  // 부계정은 등록할 때 자기 사람 줄을 만든다. 따로 세면 다계정 사용자가 계정 수만큼 잡힌다.
  it('부계정으로 등록된 계정의 사람은 전체 사용자와 새 사용자에 세지 않는다', async () => {
    const login = await repo.upsertByNexonUid('uid-1')
    const sub = await repo.upsertByMapleId('m-sub')
    await repo.upsertByMapleId('m-key-user')
    await db
      .insert(subAccountRegistrations)
      .values({ loginNexonAccountId: login.nexonAccountId, subNexonAccountId: sub.nexonAccountId })

    const range = {
      since: new Date(Date.now() - 86_400_000),
      until: new Date(Date.now() + 86_400_000),
    }
    expect(await repo.countActive()).toBe(2)
    expect((await repo.createdDaily(range)).map((d) => [d.created, d.active])).toEqual([[2, 2]])
  })

  describe('추천인 코드', () => {
    afterEach(() => jest.restoreAllMocks())

    async function codeOf(nexonAccountId: string): Promise<string | null | undefined> {
      const [row] = await db
        .select({ code: nexonAccounts.referralCode })
        .from(nexonAccounts)
        .where(eq(nexonAccounts.id, nexonAccountId))
      return row?.code
    }

    it('로그인 계정 줄은 코드를 받고 로그인 없는 줄은 받지 않는다', async () => {
      const login = await repo.upsertByNexonUid('uid-1')
      const key = await repo.upsertByMapleId('m1')

      expect(await codeOf(login.nexonAccountId)).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/)
      expect(await codeOf(key.nexonAccountId)).toBeNull()
    })

    it('뽑은 코드가 다른 계정의 것과 겹치면 다시 뽑는다', async () => {
      jest
        .spyOn(referralCode, 'newReferralCode')
        .mockReturnValueOnce('AAAAAAAA')
        .mockReturnValueOnce('AAAAAAAA')
        .mockReturnValueOnce('BBBBBBBB')
      const first = await repo.upsertByNexonUid('uid-1')

      const second = await repo.upsertByNexonUid('uid-2')

      expect(await codeOf(first.nexonAccountId)).toBe('AAAAAAAA')
      expect(await codeOf(second.nexonAccountId)).toBe('BBBBBBBB')
      expect(await db.select().from(users)).toHaveLength(2)
    })

    // 코드를 만드는 곳은 upsertByNexonUid 하나뿐이라, 다른 경로로 코드 없는 로그인 줄이 생기면 DB 가 막아야 한다.
    it('코드 없는 로그인 줄과 코드 있는 로그인 없는 줄은 DB 가 거절한다', async () => {
      const [{ id }] = await db.insert(users).values({}).returning({ id: users.id })

      const login = db.insert(nexonAccounts).values({ userId: id, uidHash: 'uid-1' })
      expect(isCheckViolation(await errorOf(login))).toBe(true)
      const key = db.insert(nexonAccounts).values({ userId: id, referralCode: 'AAAAAAAA' })
      expect(isCheckViolation(await errorOf(key))).toBe(true)
    })
  })

  describe('referrals', () => {
    it('자기 계정 추천과 한 계정의 두 번째 추천은 거절된다', async () => {
      const a = await repo.upsertByNexonUid('uid-1')
      const b = await repo.upsertByNexonUid('uid-2')
      const c = await repo.upsertByNexonUid('uid-3')
      await db.insert(referrals).values({
        referredNexonAccountId: a.nexonAccountId,
        referrerNexonAccountId: b.nexonAccountId,
      })

      const self = db.insert(referrals).values({
        referredNexonAccountId: c.nexonAccountId,
        referrerNexonAccountId: c.nexonAccountId,
      })
      expect(isCheckViolation(await errorOf(self))).toBe(true)
      const again = db.insert(referrals).values({
        referredNexonAccountId: a.nexonAccountId,
        referrerNexonAccountId: c.nexonAccountId,
      })
      expect(isUniqueViolation(await errorOf(again))).toBe(true)
    })

    // 추천인을 넣었다는 줄이 남아야 추천받은 계정이 다른 코드를 다시 넣지 못한다.
    it('지운 계정이 추천받은 줄은 지워지고, 추천한 줄은 그 칸만 빈다', async () => {
      const a = await repo.upsertByNexonUid('uid-1')
      const b = await repo.upsertByNexonUid('uid-2')
      const c = await repo.upsertByNexonUid('uid-3')
      await db.insert(referrals).values([
        { referredNexonAccountId: b.nexonAccountId, referrerNexonAccountId: a.nexonAccountId },
        { referredNexonAccountId: c.nexonAccountId, referrerNexonAccountId: b.nexonAccountId },
      ])
      await db
        .update(users)
        .set({ deletionRequestedAt: new Date('2026-01-01T00:00:00Z') })
        .where(eq(users.id, b.id))

      await repo.purgeDeletionsBefore(new Date('2026-02-01T00:00:00Z'))

      expect(
        await db
          .select({
            referred: referrals.referredNexonAccountId,
            referrer: referrals.referrerNexonAccountId,
          })
          .from(referrals),
      ).toEqual([{ referred: c.nexonAccountId, referrer: null }])
    })
  })
})
