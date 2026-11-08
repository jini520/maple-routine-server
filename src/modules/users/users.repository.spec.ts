import { eq } from 'drizzle-orm'

import { sha256 } from '../../common/hash'
import { isCheckViolation, isUniqueViolation } from '../../common/pg-errors'
import {
  bossClears,
  dropItems,
  dropPrices,
  enhancementAnomalies,
  nexonAccounts,
  nexonSessions,
  referrals,
  usageEvents,
  users,
} from '../../database/schema'
import { describeDb, openTestDb, type TestDb } from '../../database/test-db'
import * as referralCode from './referral-code'
import { UsersRepository } from './users.repository'

const RECORD_A = '0a0a0a0a-0000-4000-8000-00000000000a'
const RECORD_B = '0b0b0b0b-0000-4000-8000-00000000000b'

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

  describe('linkApiKey', () => {
    const KEY = sha256('k'.repeat(64))
    const RECORD_C = '0c0c0c0c-0000-4000-8000-00000000000c'
    let itemId: string

    beforeEach(async () => {
      const [item] = await db
        .insert(dropItems)
        .values({ key: 'ring', name: '반지', iconFile: null, valuable: true })
        .returning({ id: dropItems.id })
      itemId = item.id
    })

    function dropPrice(userId: string, dropRecordId: string, updatedAt: string) {
      return {
        userId,
        dropRecordId,
        identifiedBy: 'key' as const,
        itemId,
        recordStatus: 'pending' as const,
        periodKey: '2026-11-05',
        updatedAt: new Date(updatedAt),
      }
    }

    function anomaly(userId: string, updatedAt: string) {
      return {
        userId,
        identifiedBy: 'key' as const,
        historyDate: '2026-11-01',
        enhancementType: 'cube' as const,
        anomalyType: 'event_world_unknown' as const,
        itemName: '',
        rowCount: 1,
        updatedAt: new Date(updatedAt),
      }
    }

    async function ownerOfKey(): Promise<string | undefined> {
      const [row] = await db
        .select({ userId: nexonAccounts.userId })
        .from(nexonAccounts)
        .where(eq(nexonAccounts.apiKeyHash, KEY))
      return row?.userId
    }

    // 다른 기기가 아직 그 키를 쓰면 그 기기가 보내는 값도 로그인한 사람으로 모여야 한다.
    it('처음 보는 키는 로그인한 사람 아래에 키 줄을 만든다', async () => {
      const login = await repo.upsertByNexonUid('uid-1')

      await repo.linkApiKey(login.id, KEY)

      expect(await ownerOfKey()).toBe(login.id)
      expect((await repo.upsertByApiKeyHash(KEY)).id).toBe(login.id)
      expect(await db.select().from(users)).toHaveLength(1)
    })

    // 앱은 로그인 직후와 앱을 켤 때 같은 키를 다시 보낼 수 있다.
    it('이미 이은 키를 다시 보내도 바뀌는 것이 없다', async () => {
      const login = await repo.upsertByNexonUid('uid-1')
      await repo.linkApiKey(login.id, KEY)
      const before = await db.select().from(nexonAccounts)

      await repo.linkApiKey(login.id, KEY)

      expect(await db.select().from(nexonAccounts)).toEqual(before)
    })

    // identified_by 는 받을 때의 값이다. 합치는 일도 해시만 보고 해서, 그 줄을 믿을 정도는 그대로다.
    it('키 사람의 기록과 키 줄을 로그인한 사람에게 옮기고 키 사람을 지운다', async () => {
      const key = await repo.upsertByApiKeyHash(KEY)
      const login = await repo.upsertByNexonUid('uid-1')
      await db.insert(dropPrices).values(dropPrice(key.id, RECORD_A, '2026-11-01T00:00:00Z'))
      await db.insert(enhancementAnomalies).values(anomaly(key.id, '2026-11-01T00:00:00Z'))
      await db.insert(usageEvents).values({
        userId: key.id,
        identifiedBy: 'key',
        type: 'visit',
        name: '',
        platform: 'ios',
        appVersion: '1.0.13',
        occurredAt: new Date('2026-11-01T00:00:00Z'),
      })

      await repo.linkApiKey(login.id, KEY)

      expect((await db.select().from(users)).map((row) => row.id)).toEqual([login.id])
      expect(await ownerOfKey()).toBe(login.id)
      expect(await db.select().from(dropPrices)).toEqual([
        expect.objectContaining({ userId: login.id, dropRecordId: RECORD_A, identifiedBy: 'key' }),
      ])
      expect(await db.select().from(enhancementAnomalies)).toEqual([
        expect.objectContaining({ userId: login.id, identifiedBy: 'key' }),
      ])
      expect((await db.select().from(usageEvents)).map((row) => row.userId)).toEqual([login.id])
      expect((await repo.upsertByApiKeyHash(KEY)).id).toBe(login.id)
    })

    // 같은 사람 안에서는 나중 값이 앞 값을 덮는다. 합칠 때도 같은 규칙이라야 UNIQUE 가 깨지지 않는다.
    it('같은 기록이 양쪽에 있으면 updated_at 이 늦은 줄을 남긴다', async () => {
      const key = await repo.upsertByApiKeyHash(KEY)
      const login = await repo.upsertByNexonUid('uid-1')
      const [keyNewer] = await db
        .insert(dropPrices)
        .values(dropPrice(key.id, RECORD_A, '2026-11-03T00:00:00Z'))
        .returning({ id: dropPrices.id })
      await db.insert(dropPrices).values(dropPrice(login.id, RECORD_A, '2026-11-02T00:00:00Z'))
      await db.insert(dropPrices).values(dropPrice(key.id, RECORD_B, '2026-11-02T00:00:00Z'))
      const [loginNewer] = await db
        .insert(dropPrices)
        .values(dropPrice(login.id, RECORD_B, '2026-11-03T00:00:00Z'))
        .returning({ id: dropPrices.id })
      await db.insert(enhancementAnomalies).values(anomaly(key.id, '2026-11-02T00:00:00Z'))
      const [anomalyNewer] = await db
        .insert(enhancementAnomalies)
        .values(anomaly(login.id, '2026-11-03T00:00:00Z'))
        .returning({ id: enhancementAnomalies.id })

      await repo.linkApiKey(login.id, KEY)

      const prices = await db.select().from(dropPrices)
      expect(prices.map((row) => row.id).sort()).toEqual([keyNewer.id, loginNewer.id].sort())
      expect(prices.every((row) => row.userId === login.id)).toBe(true)
      expect((await db.select().from(enhancementAnomalies)).map((row) => row.id)).toEqual([
        anomalyNewer.id,
      ])
    })

    // (user_id, account_record_id) 가 UNIQUE 다. 겹친 채 옮기면 합치기 전체가 실패한다.
    it('옮기는 키 줄의 계정 id 가 로그인한 사람의 것과 겹치면 그 칸을 비운다', async () => {
      const key = await repo.upsertByApiKeyHash(KEY)
      const login = await repo.upsertByNexonUid('uid-1')
      await repo.recordAccountId(key.nexonAccountId, RECORD_C)
      await repo.recordAccountId(login.nexonAccountId, RECORD_C)

      await repo.linkApiKey(login.id, KEY)

      const [moved] = await db.select().from(nexonAccounts).where(eq(nexonAccounts.apiKeyHash, KEY))
      expect(moved).toEqual(expect.objectContaining({ userId: login.id, accountRecordId: null }))
    })

    it('옛 표의 줄은 옮기지 않고 키 사람과 함께 지운다', async () => {
      const key = await repo.upsertByApiKeyHash(KEY)
      const login = await repo.upsertByNexonUid('uid-1')
      await db.insert(bossClears).values({
        userId: key.id,
        identifiedBy: 'key',
        periodRecordId: RECORD_A,
        ocid: 'o1',
        cycle: 'weekly',
        periodKey: '2026-11-05',
        priceMeso: 0,
        payoutMeso: 0,
        splitMode: 'even',
        partySize: 1,
        source: 'auto',
      })

      await repo.linkApiKey(login.id, KEY)

      expect(await db.select().from(bossClears)).toEqual([])
    })

    // 로그인한 두 사람을 해시 하나로 합치지 않는다. 해시는 신원의 증명이 아니다.
    it('키 줄이 로그인한 다른 사람에게 붙어 있으면 옮기지 않는다', async () => {
      const key = await repo.upsertByApiKeyHash(KEY)
      const other = await repo.upsertByNexonUid('uid-2')
      await db
        .update(nexonAccounts)
        .set({ userId: other.id })
        .where(eq(nexonAccounts.id, key.nexonAccountId))
      await db.delete(users).where(eq(users.id, key.id))
      const login = await repo.upsertByNexonUid('uid-1')

      await repo.linkApiKey(login.id, KEY)

      expect(await ownerOfKey()).toBe(other.id)
      expect(await db.select().from(users)).toHaveLength(2)
    })

    it('키 사람에게 세션이 있으면 옮기지 않는다', async () => {
      const key = await repo.upsertByApiKeyHash(KEY)
      await db.insert(nexonSessions).values({
        sessionHash: sha256('session'),
        userId: key.id,
        platform: 'ios',
        accessSealed: Buffer.from('a'),
        accessExpiresAt: new Date('2026-12-01T00:00:00Z'),
        refreshSealed: Buffer.from('r'),
        refreshExpiresAt: new Date('2026-12-01T00:00:00Z'),
      })
      const login = await repo.upsertByNexonUid('uid-1')

      await repo.linkApiKey(login.id, KEY)

      expect(await ownerOfKey()).toBe(key.id)
    })

    // 합치면 사용자가 한 삭제 요청이 말없이 사라진다. 키 사람은 예약대로 지워진다.
    it('키 사람이 삭제를 예약했으면 옮기지 않는다', async () => {
      const key = await repo.upsertByApiKeyHash(KEY)
      await repo.requestDeletion(key.id)
      const login = await repo.upsertByNexonUid('uid-1')

      await repo.linkApiKey(login.id, KEY)

      expect(await ownerOfKey()).toBe(key.id)
      expect(await repo.deletionRequestedAt(key.id)).not.toBeNull()
    })
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

  describe('추천인 코드', () => {
    afterEach(() => jest.restoreAllMocks())

    async function codeOf(nexonAccountId: string): Promise<string | null | undefined> {
      const [row] = await db
        .select({ code: nexonAccounts.referralCode })
        .from(nexonAccounts)
        .where(eq(nexonAccounts.id, nexonAccountId))
      return row?.code
    }

    it('로그인 계정 줄은 코드를 받고 키 줄은 받지 않는다', async () => {
      const login = await repo.upsertByNexonUid('uid-1')
      const key = await repo.upsertByApiKeyHash(sha256('k'))

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

    // 코드를 만드는 곳은 upsertAccount 하나뿐이라, 다른 경로로 코드 없는 로그인 줄이 생기면 DB 가 막아야 한다.
    it('코드 없는 로그인 줄과 코드 있는 키 줄은 DB 가 거절한다', async () => {
      const [{ id }] = await db.insert(users).values({}).returning({ id: users.id })

      const login = db
        .insert(nexonAccounts)
        .values({ userId: id, identitySource: 'login', nexonUid: 'uid-1' })
      expect(isCheckViolation(await errorOf(login))).toBe(true)
      const key = db.insert(nexonAccounts).values({
        userId: id,
        identitySource: 'key',
        apiKeyHash: sha256('k'),
        referralCode: 'AAAAAAAA',
      })
      expect(isCheckViolation(await errorOf(key))).toBe(true)
    })
  })

  describe('referrals', () => {
    it('자기 계정 추천과 한 계정의 두 번째 추천은 거절된다', async () => {
      const a = await repo.upsertByNexonUid('uid-1')
      const b = await repo.upsertByNexonUid('uid-2')
      const c = await repo.upsertByNexonUid('uid-3')
      await db
        .insert(referrals)
        .values({ referredAccountId: a.nexonAccountId, referrerAccountId: b.nexonAccountId })

      const self = db
        .insert(referrals)
        .values({ referredAccountId: c.nexonAccountId, referrerAccountId: c.nexonAccountId })
      expect(isCheckViolation(await errorOf(self))).toBe(true)
      const again = db
        .insert(referrals)
        .values({ referredAccountId: a.nexonAccountId, referrerAccountId: c.nexonAccountId })
      expect(isUniqueViolation(await errorOf(again))).toBe(true)
    })

    // 추천인을 넣었다는 줄이 남아야 추천받은 계정이 다른 코드를 다시 넣지 못한다.
    it('지운 계정이 추천받은 줄은 지워지고, 추천한 줄은 그 칸만 빈다', async () => {
      const a = await repo.upsertByNexonUid('uid-1')
      const b = await repo.upsertByNexonUid('uid-2')
      const c = await repo.upsertByNexonUid('uid-3')
      await db.insert(referrals).values([
        { referredAccountId: b.nexonAccountId, referrerAccountId: a.nexonAccountId },
        { referredAccountId: c.nexonAccountId, referrerAccountId: b.nexonAccountId },
      ])
      await db
        .update(users)
        .set({ deletionRequestedAt: new Date('2026-01-01T00:00:00Z') })
        .where(eq(users.id, b.id))

      await repo.purgeDeletionsBefore(new Date('2026-02-01T00:00:00Z'))

      expect(
        await db
          .select({ referred: referrals.referredAccountId, referrer: referrals.referrerAccountId })
          .from(referrals),
      ).toEqual([{ referred: c.nexonAccountId, referrer: null }])
    })
  })
})
