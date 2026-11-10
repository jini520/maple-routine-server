import { eq } from 'drizzle-orm'

import { sha256 } from '../../common/hash'
import { isCheckViolation, isUniqueViolation } from '../../common/pg-errors'
import {
  dropPrices,
  enhancementAnomalies,
  items,
  nexonAccountKeys,
  nexonAccountMapleIds,
  nexonAccounts,
  subAccounts,
  users,
} from '../../database/schema'
import { describeDb, openTestDb, type TestDb } from '../../database/test-db'
import { NexonAccountsRepository } from './nexon-accounts.repository'
import { UsersRepository } from './users.repository'

const KEY_OLD = sha256('o'.repeat(64))
const KEY_NEW = sha256('n'.repeat(64))
const RECORD_A = '0a0a0a0a-0000-4000-8000-00000000000a'

async function errorOf(query: PromiseLike<unknown>): Promise<unknown> {
  try {
    await query
  } catch (error) {
    return error
  }
  return undefined
}

describeDb('NexonAccountsRepository', () => {
  let db: TestDb
  let close: () => Promise<void>
  let truncate: () => Promise<void>
  let users$: UsersRepository
  let repo: NexonAccountsRepository

  beforeAll(async () => {
    ;({ db, close, truncate } = await openTestDb())
    users$ = new UsersRepository(db)
    repo = new NexonAccountsRepository(db)
  })
  beforeEach(() => truncate())
  afterAll(() => close())

  /** 키가 달린 넥슨 계정 줄. */
  async function holderOf(hash: Buffer): Promise<string | undefined> {
    const [row] = await db
      .select({ id: nexonAccountKeys.nexonAccountId })
      .from(nexonAccountKeys)
      .where(eq(nexonAccountKeys.apiKeyHash, hash))
    return row?.id
  }

  async function accountIds(): Promise<string[]> {
    return (await db.select({ id: nexonAccounts.id }).from(nexonAccounts)).map((r) => r.id).sort()
  }

  async function backdate(nexonAccountId: string, createdAt: string): Promise<void> {
    await db
      .update(nexonAccounts)
      .set({ createdAt: new Date(createdAt) })
      .where(eq(nexonAccounts.id, nexonAccountId))
  }

  describe('reportMapleIds', () => {
    // 메이플 ID 는 다른 넥슨 ID 로 옮겨 가지 않는다. 지우면 그 메이플 ID 의 기록이 주인을 잃는다.
    it('처음 보는 메이플 ID 는 그 계정 줄에 더하고, 목록에서 빠진 것은 지우지 않는다', async () => {
      const key = await users$.upsertByApiKeyHash(KEY_OLD)

      await expect(repo.reportMapleIds(key.nexonAccountId, ['m2', 'm1', 'm1'])).resolves.toEqual([
        'm1',
        'm2',
      ])
      await expect(repo.reportMapleIds(key.nexonAccountId, ['m2', 'm3'])).resolves.toEqual([
        'm1',
        'm2',
        'm3',
      ])
    })

    // 키를 다시 받은 같은 넥슨 ID 다. 계정 id · 부계정 등록 · 기록이 옛 줄 하나로 이어진다(사용자 선택 2026-11-10).
    it('다른 키 줄의 메이플 ID 를 알리면 먼저 생긴 줄로 합치고, 새 줄의 사람을 지운다', async () => {
      const old = await users$.upsertByApiKeyHash(KEY_OLD)
      await backdate(old.nexonAccountId, '2026-10-01T00:00:00Z')
      await repo.reportMapleIds(old.nexonAccountId, ['m1'])
      const fresh = await users$.upsertByApiKeyHash(KEY_NEW)

      const owned = await repo.reportMapleIds(fresh.nexonAccountId, ['m1', 'm2'])

      expect(owned).toEqual(['m1', 'm2'])
      expect(await accountIds()).toEqual([old.nexonAccountId])
      expect(await holderOf(KEY_NEW)).toBe(old.nexonAccountId)
      expect(await users$.upsertByApiKeyHash(KEY_NEW)).toEqual(old)
      expect((await db.select().from(users)).map((r) => r.id)).toEqual([old.id])
    })

    // 로그인은 넥슨이 넥슨 ID 를 보증한다. 키 줄이 더 오래됐어도 로그인 줄이 남는다.
    it('로그인 줄과 겹치면 로그인 줄이 남는다', async () => {
      const key = await users$.upsertByApiKeyHash(KEY_OLD)
      await backdate(key.nexonAccountId, '2026-10-01T00:00:00Z')
      await repo.reportMapleIds(key.nexonAccountId, ['m1'])
      const login = await users$.upsertByNexonUid('uid-1')

      await expect(repo.reportMapleIds(login.nexonAccountId, ['m1'])).resolves.toEqual(['m1'])

      expect(await accountIds()).toEqual([login.nexonAccountId])
      expect(await holderOf(KEY_OLD)).toBe(login.nexonAccountId)
    })

    it('겹치는 줄이 여럿이면 모두 한 줄로 합친다', async () => {
      const x = await users$.upsertByApiKeyHash(sha256('x'))
      await backdate(x.nexonAccountId, '2026-10-01T00:00:00Z')
      await repo.reportMapleIds(x.nexonAccountId, ['m1'])
      const y = await users$.upsertByApiKeyHash(sha256('y'))
      await backdate(y.nexonAccountId, '2026-10-02T00:00:00Z')
      await repo.reportMapleIds(y.nexonAccountId, ['m2'])
      const z = await users$.upsertByApiKeyHash(sha256('z'))

      await expect(repo.reportMapleIds(z.nexonAccountId, ['m1', 'm2'])).resolves.toEqual([
        'm1',
        'm2',
      ])

      expect(await accountIds()).toEqual([x.nexonAccountId])
      expect(await holderOf(sha256('y'))).toBe(x.nexonAccountId)
      expect(await holderOf(sha256('z'))).toBe(x.nexonAccountId)
    })

    // 넥슨 ID 가 다른 두 로그인은 메이플 ID 가 겹칠 수 없다. 앱이 잘못 알린 값으로 남의 계정을 가져가면 안 된다.
    it('둘 다 로그인 줄이면 합치지 않고, 남의 메이플 ID 는 받지 않는다', async () => {
      const first = await users$.upsertByNexonUid('uid-1')
      await repo.reportMapleIds(first.nexonAccountId, ['m1'])
      const second = await users$.upsertByNexonUid('uid-2')

      await expect(repo.reportMapleIds(second.nexonAccountId, ['m1', 'm2'])).resolves.toEqual([
        'm2',
      ])

      expect(await accountIds()).toEqual([first.nexonAccountId, second.nexonAccountId].sort())
      await expect(repo.reportMapleIds(first.nexonAccountId, [])).resolves.toEqual(['m1'])
    })

    // 합치면 사용자가 한 삭제 요청이 말없이 사라진다. 유예가 끝나 그 줄이 지워진 뒤 다시 알리면 붙는다.
    it('겹친 줄의 사람이 삭제를 예약했으면 합치지 않고, 지워진 뒤 다시 알리면 받는다', async () => {
      const old = await users$.upsertByApiKeyHash(KEY_OLD)
      await repo.reportMapleIds(old.nexonAccountId, ['m1'])
      await db
        .update(users)
        .set({ deletionRequestedAt: new Date('2026-01-01T00:00:00Z') })
        .where(eq(users.id, old.id))
      const fresh = await users$.upsertByApiKeyHash(KEY_NEW)

      await expect(repo.reportMapleIds(fresh.nexonAccountId, ['m1'])).resolves.toEqual([])
      expect(await holderOf(KEY_OLD)).toBe(old.nexonAccountId)

      await users$.purgeDeletionsBefore(new Date('2026-02-01T00:00:00Z'))
      await expect(repo.reportMapleIds(fresh.nexonAccountId, ['m1'])).resolves.toEqual(['m1'])
    })

    it('합칠 때 강화 이상 보고를 남기는 줄로 옮기고, 같은 열쇠면 늦게 고친 줄을 남긴다', async () => {
      const old = await users$.upsertByApiKeyHash(KEY_OLD)
      await backdate(old.nexonAccountId, '2026-10-01T00:00:00Z')
      await repo.reportMapleIds(old.nexonAccountId, ['m1'])
      const fresh = await users$.upsertByApiKeyHash(KEY_NEW)
      const anomaly = (userId: string, nexonAccountId: string, itemName: string, at: string) => ({
        userId,
        nexonAccountId,
        identifiedBy: 'key' as const,
        historyDate: '2026-11-01',
        enhancementType: 'cube' as const,
        anomalyType: 'no_cost' as const,
        itemName,
        rowCount: 1,
        updatedAt: new Date(at),
      })
      await db
        .insert(enhancementAnomalies)
        .values([
          anomaly(old.id, old.nexonAccountId, '같은 장비', '2026-11-01T00:00:00Z'),
          anomaly(fresh.id, fresh.nexonAccountId, '같은 장비', '2026-11-02T00:00:00Z'),
          anomaly(fresh.id, fresh.nexonAccountId, '새 장비', '2026-11-02T00:00:00Z'),
        ])

      await repo.reportMapleIds(fresh.nexonAccountId, ['m1'])

      const rows = await db.select().from(enhancementAnomalies)
      expect(
        rows.map((r) => [r.itemName, r.nexonAccountId, r.userId, r.updatedAt.toISOString()]).sort(),
      ).toEqual([
        ['같은 장비', old.nexonAccountId, old.id, '2026-11-02T00:00:00.000Z'],
        ['새 장비', old.nexonAccountId, old.id, '2026-11-02T00:00:00.000Z'],
      ])
    })

    // 1.0.13 을 잠그기 전에는 옛 드롭 줄을 사람으로 찾는다. 사람을 지우면 그 칸이 비어 익명 줄이 된다.
    it('새 줄의 사람을 지울 때 그 사람의 옛 드롭 줄은 남기는 줄의 사람으로 옮긴다', async () => {
      const [item] = await db
        .insert(items)
        .values({ key: 'ring', name: '반지', valuable: true, isDrop: true })
        .returning({ id: items.id })
      const old = await users$.upsertByApiKeyHash(KEY_OLD)
      await backdate(old.nexonAccountId, '2026-10-01T00:00:00Z')
      await repo.reportMapleIds(old.nexonAccountId, ['m1'])
      const fresh = await users$.upsertByApiKeyHash(KEY_NEW)
      await db.insert(dropPrices).values({
        userId: fresh.id,
        dropRecordId: RECORD_A,
        identifiedBy: 'key',
        itemId: item.id,
        recordStatus: 'pending',
        periodKey: '2026-11-05',
      })

      await repo.reportMapleIds(fresh.nexonAccountId, ['m1'])

      expect(await db.select().from(dropPrices)).toEqual([
        expect.objectContaining({ userId: old.id, dropRecordId: RECORD_A }),
      ])
    })

    // 로그인의 부계정으로 등록했던 키가 사실 그 로그인과 같은 넥슨 ID 였다. 자기 자신을 잇는 등록은 뜻이 없다.
    it('합친 뒤 자기 자신을 잇게 된 부계정 등록은 지운다', async () => {
      const login = await users$.upsertByNexonUid('uid-1')
      await repo.registerSubAccount(login.nexonAccountId, KEY_OLD, ['m1'])

      await repo.reportMapleIds(login.nexonAccountId, ['m0', 'm1'])

      expect(await db.select().from(subAccounts)).toEqual([])
      expect(await holderOf(KEY_OLD)).toBe(login.nexonAccountId)
    })
  })

  describe('부계정', () => {
    it('처음 보는 키는 사람 · 계정 줄을 만들어 로그인에 잇고, 목록은 키 해시와 메이플 ID 를 준다', async () => {
      const login = await users$.upsertByNexonUid('uid-1')

      await expect(
        repo.registerSubAccount(login.nexonAccountId, KEY_OLD, ['m2', 'm1']),
      ).resolves.toBe('registered')

      expect(await repo.listSubAccounts(login.nexonAccountId)).toEqual([
        { apiKeyHashes: [KEY_OLD.toString('hex')], mapleIds: ['m1', 'm2'] },
      ])
      expect(await db.select().from(users)).toHaveLength(2)
    })

    // 키를 다시 받은 부계정은 키가 여럿이다. 앱은 기기에 있는 키로 어느 하나와 맞춘다.
    it('키를 다시 받아 등록하면 같은 부계정에 키가 하나 더 달린다', async () => {
      const login = await users$.upsertByNexonUid('uid-1')
      await repo.registerSubAccount(login.nexonAccountId, KEY_OLD, ['m1'])

      await repo.registerSubAccount(login.nexonAccountId, KEY_NEW, ['m1'])

      const [entry] = await repo.listSubAccounts(login.nexonAccountId)
      expect(entry?.apiKeyHashes.sort()).toEqual(
        [KEY_OLD.toString('hex'), KEY_NEW.toString('hex')].sort(),
      )
      expect(await repo.listSubAccounts(login.nexonAccountId)).toHaveLength(1)
    })

    // 같은 넥슨 ID 를 부계정으로 등록하면 자기 자신의 부계정이 된다. 거절하면서 키 줄도 남기지 않는다.
    it('로그인의 메이플 ID 와 겹치거나 로그인에 달린 키면 거절하고 아무것도 남기지 않는다', async () => {
      const login = await users$.upsertByNexonUid('uid-1')
      await repo.reportMapleIds(login.nexonAccountId, ['m1'])

      await expect(
        repo.registerSubAccount(login.nexonAccountId, KEY_OLD, ['m1', 'm2']),
      ).resolves.toBe('same_account')
      expect(await holderOf(KEY_OLD)).toBeUndefined()
      expect(await db.select().from(users)).toHaveLength(1)

      await users$.linkApiKey(login.id, KEY_NEW)
      await expect(repo.registerSubAccount(login.nexonAccountId, KEY_NEW, ['m3'])).resolves.toBe(
        'same_account',
      )
      expect(await db.select().from(subAccounts)).toEqual([])
    })

    // 계정은 로그인을 포함해 다섯까지라 부계정은 넷까지다.
    it('다섯째 부계정은 거절하고, 이미 등록한 계정을 다시 보내는 것은 받는다', async () => {
      const login = await users$.upsertByNexonUid('uid-1')
      for (const n of [1, 2, 3, 4]) {
        await repo.registerSubAccount(login.nexonAccountId, sha256(`k${n}`), [`m${n}`])
      }

      await expect(
        repo.registerSubAccount(login.nexonAccountId, sha256('k5'), ['m5']),
      ).resolves.toBe('limit')
      expect(await holderOf(sha256('k5'))).toBeUndefined()
      await expect(
        repo.registerSubAccount(login.nexonAccountId, sha256('k4'), ['m4']),
      ).resolves.toBe('registered')
      expect(await repo.listSubAccounts(login.nexonAccountId)).toHaveLength(4)
    })

    // 기기에서 키의 귀속은 하나라, 연동으로 다른 로그인에 옮긴 키의 등록도 따라 옮긴다.
    it('다른 로그인이 같은 계정을 등록하면 등록을 그 로그인으로 옮긴다', async () => {
      const first = await users$.upsertByNexonUid('uid-1')
      const second = await users$.upsertByNexonUid('uid-2')
      await repo.registerSubAccount(first.nexonAccountId, KEY_OLD, ['m1'])

      await repo.registerSubAccount(second.nexonAccountId, KEY_OLD, ['m1'])

      expect(await repo.listSubAccounts(first.nexonAccountId)).toEqual([])
      expect(await repo.listSubAccounts(second.nexonAccountId)).toHaveLength(1)
    })

    // 그 키를 다른 기기에서 메인으로 쓰고 있을 수 있어, 등록만 지운다.
    it('지우기는 메이플 ID 로 찾아 등록만 지우고 부계정의 줄과 사람은 남긴다', async () => {
      const login = await users$.upsertByNexonUid('uid-1')
      await repo.registerSubAccount(login.nexonAccountId, KEY_OLD, ['m1', 'm2'])

      await repo.unregisterSubAccount(login.nexonAccountId, 'm2')

      expect(await repo.listSubAccounts(login.nexonAccountId)).toEqual([])
      expect(await holderOf(KEY_OLD)).toBeDefined()
      expect(await db.select().from(users)).toHaveLength(2)
    })

    // 등록 정보는 유예 30일이 지나 로그인 줄이 지워질 때 함께 지워진다(사용자 선택 2026-11-10).
    it('메인 계정을 지우면 등록 정보만 지워지고 부계정은 남는다', async () => {
      const login = await users$.upsertByNexonUid('uid-1')
      await repo.registerSubAccount(login.nexonAccountId, KEY_OLD, ['m1'])
      await db
        .update(users)
        .set({ deletionRequestedAt: new Date('2026-01-01T00:00:00Z') })
        .where(eq(users.id, login.id))

      await users$.purgeDeletionsBefore(new Date('2026-02-01T00:00:00Z'))

      expect(await db.select().from(subAccounts)).toEqual([])
      expect(await holderOf(KEY_OLD)).toBeDefined()
    })
  })

  describe('표의 제약', () => {
    it('메이플 ID 는 서버 전체에서 한 줄이고, 키 해시도 한 줄이다', async () => {
      const a = await users$.upsertByApiKeyHash(KEY_OLD)
      const b = await users$.upsertByApiKeyHash(KEY_NEW)
      await db
        .insert(nexonAccountMapleIds)
        .values({ nexonAccountId: a.nexonAccountId, mapleId: 'm1' })

      const maple = db
        .insert(nexonAccountMapleIds)
        .values({ nexonAccountId: b.nexonAccountId, mapleId: 'm1' })
      expect(isUniqueViolation(await errorOf(maple))).toBe(true)
      const key = db
        .insert(nexonAccountKeys)
        .values({ nexonAccountId: b.nexonAccountId, apiKeyHash: KEY_OLD })
      expect(isUniqueViolation(await errorOf(key))).toBe(true)
    })

    it('부계정 등록은 자기 자신을 잇지 못하고, 한 계정은 로그인 하나에만 붙는다', async () => {
      const first = await users$.upsertByNexonUid('uid-1')
      const second = await users$.upsertByNexonUid('uid-2')
      const sub = await users$.upsertByApiKeyHash(KEY_OLD)

      const self = db
        .insert(subAccounts)
        .values({ loginAccountId: first.nexonAccountId, subAccountId: first.nexonAccountId })
      expect(isCheckViolation(await errorOf(self))).toBe(true)
      await db
        .insert(subAccounts)
        .values({ loginAccountId: first.nexonAccountId, subAccountId: sub.nexonAccountId })
      const twice = db
        .insert(subAccounts)
        .values({ loginAccountId: second.nexonAccountId, subAccountId: sub.nexonAccountId })
      expect(isUniqueViolation(await errorOf(twice))).toBe(true)
    })
  })
})
