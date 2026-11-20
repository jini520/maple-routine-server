import { eq } from 'drizzle-orm'

import { isCheckViolation, isUniqueViolation } from '../../common/pg-errors'
import {
  bossClears,
  dropPrices,
  enhancementAnomalies,
  items,
  mapleIds,
  nexonAccounts,
  subAccountRegistrations,
  usageEvents,
  users,
} from '../../database/schema'
import { describeDb, openTestDb, type TestDb } from '../../database/test-db'
import { NexonAccountsRepository } from './nexon-accounts.repository'
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

  /** 그 메이플 ID 가 달린 넥슨 계정 줄. */
  async function holderOf(hash: string): Promise<string | undefined> {
    const [row] = await db
      .select({ id: mapleIds.nexonAccountId })
      .from(mapleIds)
      .where(eq(mapleIds.hash, hash))
    return row?.id
  }

  /** 그 로그인에 붙은 부계정의 넥슨 계정 줄. */
  async function registrationsOf(loginNexonAccountId: string): Promise<string[]> {
    const rows = await db
      .select({ id: subAccountRegistrations.subNexonAccountId })
      .from(subAccountRegistrations)
      .where(eq(subAccountRegistrations.loginNexonAccountId, loginNexonAccountId))
    return rows.map((row) => row.id)
  }

  async function mapleIdsOfAccount(nexonAccountId: string): Promise<string[]> {
    const rows = await db
      .select({ hash: mapleIds.hash })
      .from(mapleIds)
      .where(eq(mapleIds.nexonAccountId, nexonAccountId))
    return rows.map((row) => row.hash).sort()
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
      const key = await users$.upsertByMapleId('m1')

      await expect(repo.reportMapleIds(key.nexonAccountId, ['m3', 'm2', 'm2'])).resolves.toEqual([
        'm1',
        'm2',
        'm3',
      ])
      await expect(repo.reportMapleIds(key.nexonAccountId, ['m3', 'm4'])).resolves.toEqual([
        'm1',
        'm2',
        'm3',
        'm4',
      ])
    })

    // 앱이 헤더에 실은 메이플 ID 가 바뀌면 같은 넥슨 ID 가 줄 둘로 들어온다. 계정 id · 부계정 등록 · 기록이 옛 줄 하나로 이어진다.
    it('로그인 없는 다른 줄의 메이플 ID 를 알리면 먼저 생긴 줄로 합치고, 새 줄의 사람을 지운다', async () => {
      const old = await users$.upsertByMapleId('m1')
      await backdate(old.nexonAccountId, '2026-10-01T00:00:00Z')
      const fresh = await users$.upsertByMapleId('m2')

      const owned = await repo.reportMapleIds(fresh.nexonAccountId, ['m1', 'm2'])

      expect(owned).toEqual(['m1', 'm2'])
      expect(await accountIds()).toEqual([old.nexonAccountId])
      expect(await users$.upsertByMapleId('m2')).toEqual(old)
      expect((await db.select().from(users)).map((r) => r.id)).toEqual([old.id])
    })

    // 로그인은 넥슨이 넥슨 ID 를 보증한다. 로그인 없는 줄이 더 오래됐어도 로그인 줄이 남는다. 키 사용자가 로그인을 붙이면 이렇게 이어진다.
    it('로그인 줄과 겹치면 로그인 줄이 남는다', async () => {
      const key = await users$.upsertByMapleId('m1')
      await backdate(key.nexonAccountId, '2026-10-01T00:00:00Z')
      const login = await users$.upsertByNexonUid('uid-1')

      await expect(repo.reportMapleIds(login.nexonAccountId, ['m1'])).resolves.toEqual(['m1'])

      expect(await accountIds()).toEqual([login.nexonAccountId])
      expect(await holderOf('m1')).toBe(login.nexonAccountId)
      expect(await users$.upsertByMapleId('m1')).toEqual(login)
    })

    it('겹치는 줄이 여럿이면 모두 한 줄로 합친다', async () => {
      const x = await users$.upsertByMapleId('m1')
      await backdate(x.nexonAccountId, '2026-10-01T00:00:00Z')
      const y = await users$.upsertByMapleId('m2')
      await backdate(y.nexonAccountId, '2026-10-02T00:00:00Z')
      const z = await users$.upsertByMapleId('m3')

      await expect(repo.reportMapleIds(z.nexonAccountId, ['m1', 'm2'])).resolves.toEqual([
        'm1',
        'm2',
        'm3',
      ])

      expect(await accountIds()).toEqual([x.nexonAccountId])
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
      const old = await users$.upsertByMapleId('m1')
      await db
        .update(users)
        .set({ deletionRequestedAt: new Date('2026-01-01T00:00:00Z') })
        .where(eq(users.id, old.id))
      const login = await users$.upsertByNexonUid('uid-1')

      await expect(repo.reportMapleIds(login.nexonAccountId, ['m1'])).resolves.toEqual([])
      expect(await holderOf('m1')).toBe(old.nexonAccountId)

      await users$.purgeDeletionsBefore(new Date('2026-02-01T00:00:00Z'))
      await expect(repo.reportMapleIds(login.nexonAccountId, ['m1'])).resolves.toEqual(['m1'])
    })

    it('합칠 때 강화 이상 보고를 남기는 줄로 옮기고, 같은 열쇠면 늦게 고친 줄을 남긴다', async () => {
      const old = await users$.upsertByMapleId('m1')
      await backdate(old.nexonAccountId, '2026-10-01T00:00:00Z')
      const fresh = await users$.upsertByMapleId('m2')
      const anomaly = (nexonAccountId: string, itemName: string, at: string) => ({
        nexonAccountId,
        historyDate: '2026-11-01',
        apiType: 'cube' as const,
        reason: 'no_cost' as const,
        itemName,
        rowCount: 1,
        updatedAt: new Date(at),
      })
      await db
        .insert(enhancementAnomalies)
        .values([
          anomaly(old.nexonAccountId, '같은 장비', '2026-11-01T00:00:00Z'),
          anomaly(fresh.nexonAccountId, '같은 장비', '2026-11-02T00:00:00Z'),
          anomaly(fresh.nexonAccountId, '새 장비', '2026-11-02T00:00:00Z'),
        ])

      await repo.reportMapleIds(fresh.nexonAccountId, ['m1'])

      const rows = await db.select().from(enhancementAnomalies)
      expect(
        rows.map((r) => [r.itemName, r.nexonAccountId, r.updatedAt.toISOString()]).sort(),
      ).toEqual([
        ['같은 장비', old.nexonAccountId, '2026-11-02T00:00:00.000Z'],
        ['새 장비', old.nexonAccountId, '2026-11-02T00:00:00.000Z'],
      ])
    })

    describe('없앨 줄의 사람의 옛 기록', () => {
      let itemId: string

      beforeEach(async () => {
        const [item] = await db
          .insert(items)
          .values({ key: 'ring', name: '반지', isValuable: true, isDrop: true })
          .returning({ id: items.id })
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

      // ocid 가 없는 드롭 줄과 사용 로그는 사람으로 찾는다. 사람을 지우면 그 칸이 비어 익명 줄이 된다.
      it('키 사람에게 다른 줄이 없으면 옛 드롭 줄 · 사용 로그를 로그인 사람으로, 강화 이상 보고를 로그인 계정으로 옮기고 사람을 지운다', async () => {
        const key = await users$.upsertByMapleId('m1')
        const login = await users$.upsertByNexonUid('uid-1')
        await db.insert(dropPrices).values(dropPrice(key.id, RECORD_A, '2026-11-01T00:00:00Z'))
        await db.insert(enhancementAnomalies).values({
          nexonAccountId: key.nexonAccountId,
          historyDate: '2026-11-01',
          apiType: 'cube',
          reason: 'event_world_unknown',
          itemName: '',
          rowCount: 1,
        })
        await db.insert(usageEvents).values({
          userId: key.id,
          type: 'visit',
          name: '',
          platform: 'ios',
          appVersion: '1.0.15',
          occurredAt: new Date('2026-11-01T00:00:00Z'),
        })

        await repo.reportMapleIds(login.nexonAccountId, ['m1'])

        expect((await db.select().from(users)).map((row) => row.id)).toEqual([login.id])
        expect(await db.select().from(dropPrices)).toEqual([
          expect.objectContaining({ userId: login.id, dropRecordId: RECORD_A }),
        ])
        expect(await db.select().from(enhancementAnomalies)).toEqual([
          expect.objectContaining({ nexonAccountId: login.nexonAccountId }),
        ])
        expect((await db.select().from(usageEvents)).map((row) => row.userId)).toEqual([login.id])
      })

      // 옛 드롭 줄은 사람 안에서 기록 id 로 유일하다. 합칠 때도 나중 값이 앞 값을 덮어야 UNIQUE 가 깨지지 않는다.
      it('같은 옛 드롭 기록이 양쪽 사람에게 있으면 updated_at 이 늦은 줄을 남긴다', async () => {
        const key = await users$.upsertByMapleId('m1')
        const login = await users$.upsertByNexonUid('uid-1')
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

        await repo.reportMapleIds(login.nexonAccountId, ['m1'])

        const prices = await db.select().from(dropPrices)
        expect(prices.map((row) => row.id).sort()).toEqual([keyNewer.id, loginNewer.id].sort())
        expect(prices.every((row) => row.userId === login.id)).toBe(true)
      })

      // 처치 · 가계부 · 강화 합계는 메이플 ID 를 가리킨다. 메이플 ID 가 로그인 줄로 옮겨 가면 기록도 함께 이어진다.
      it('메이플 ID 를 가리키는 기록은 키 사람을 지워도 남아 로그인 계정으로 이어진다', async () => {
        const key = await users$.upsertByMapleId('m1')
        const login = await users$.upsertByNexonUid('uid-1')
        await db.insert(bossClears).values({
          identifiedBy: 'key',
          periodRecordId: RECORD_A,
          mapleId: 'm1',
          ocid: 'o1',
          cycle: 'weekly',
          periodKey: '2026-11-05',
          priceMeso: 0,
          payoutMeso: 0,
          splitMode: 'even',
          partySize: 1,
          source: 'auto',
        })

        await repo.reportMapleIds(login.nexonAccountId, ['m1'])

        expect(await db.select().from(users)).toEqual([expect.objectContaining({ id: login.id })])
        expect(key.id).not.toBe(login.id)
        expect(await db.select().from(bossClears)).toEqual([
          expect.objectContaining({ mapleId: 'm1' }),
        ])
        expect(await holderOf('m1')).toBe(login.nexonAccountId)
      })

      // 넥슨 ID 가 같은 줄은 한 줄이어야 한다. 키 사람의 다른 로그인은 다른 넥슨 ID 라 그대로 둔다.
      it('키 사람에게 다른 로그인 줄이 있으면 키의 줄만 합치고, 그 사람과 로그인 줄과 옛 기록은 남긴다', async () => {
        const other = await users$.upsertByNexonUid('uid-2')
        const key = await users$.upsertByMapleId('m1')
        await db
          .update(nexonAccounts)
          .set({ userId: other.id })
          .where(eq(nexonAccounts.id, key.nexonAccountId))
        await db.delete(users).where(eq(users.id, key.id))
        await db.insert(dropPrices).values(dropPrice(other.id, RECORD_A, '2026-11-01T00:00:00Z'))
        const login = await users$.upsertByNexonUid('uid-1')

        await repo.reportMapleIds(login.nexonAccountId, ['m1'])

        expect(await holderOf('m1')).toBe(login.nexonAccountId)
        expect(await accountIds()).toEqual([other.nexonAccountId, login.nexonAccountId].sort())
        expect(await db.select().from(dropPrices)).toEqual([
          expect.objectContaining({ userId: other.id }),
        ])
      })
    })

    // 로그인의 부계정으로 등록했던 계정이 사실 그 로그인과 같은 넥슨 ID 였다. 자기 자신을 잇는 등록은 뜻이 없다.
    it('합친 뒤 자기 자신을 잇게 된 부계정 등록은 지운다', async () => {
      const login = await users$.upsertByNexonUid('uid-1')
      await repo.registerSubAccount(login.nexonAccountId, ['m1'])

      await repo.reportMapleIds(login.nexonAccountId, ['m0', 'm1'])

      expect(await db.select().from(subAccountRegistrations)).toEqual([])
      expect(await holderOf('m1')).toBe(login.nexonAccountId)
    })
  })

  describe('부계정', () => {
    it('처음 보는 메이플 ID 는 사람 · 계정 줄을 만들어 메이플 ID 를 적고 로그인에 잇는다', async () => {
      const login = await users$.upsertByNexonUid('uid-1')

      await expect(repo.registerSubAccount(login.nexonAccountId, ['m2', 'm1'])).resolves.toBe(
        'registered',
      )

      const sub = await holderOf('m1')
      expect(await registrationsOf(login.nexonAccountId)).toEqual([sub])
      expect(await mapleIdsOfAccount(sub!)).toEqual(['m1', 'm2'])
      expect(await db.select().from(users)).toHaveLength(2)
    })

    // 키 사용자로 먼저 들어온 계정을 나중에 부계정으로 등록하면 그 줄을 쓴다. 기록이 그 줄의 메이플 ID 를 가리킨다.
    it('이미 있는 계정을 등록하면 그 계정 줄을 잇고, 목록의 다른 메이플 ID 를 더한다', async () => {
      const key = await users$.upsertByMapleId('m1')
      const login = await users$.upsertByNexonUid('uid-1')

      await repo.registerSubAccount(login.nexonAccountId, ['m1', 'm2'])

      expect(await registrationsOf(login.nexonAccountId)).toEqual([key.nexonAccountId])
      expect(await mapleIdsOfAccount(key.nexonAccountId)).toEqual(['m1', 'm2'])
    })

    // 같은 넥슨 ID 가 다른 기기에서 같은 계정을 다시 등록하는 것은 거절이 아니다.
    it('같은 로그인이 같은 계정을 다시 등록하면 그대로 둔다', async () => {
      const login = await users$.upsertByNexonUid('uid-1')
      await repo.registerSubAccount(login.nexonAccountId, ['m1'])

      await expect(repo.registerSubAccount(login.nexonAccountId, ['m1'])).resolves.toBe(
        'registered',
      )

      expect(await registrationsOf(login.nexonAccountId)).toHaveLength(1)
    })

    // 같은 넥슨 ID 를 부계정으로 등록하면 자기 자신의 부계정이 된다. 거절하면서 계정 줄도 남기지 않는다.
    it('로그인의 메이플 ID 와 겹치면 same_account 로 거절하고 아무것도 남기지 않는다', async () => {
      const login = await users$.upsertByNexonUid('uid-1')
      await repo.reportMapleIds(login.nexonAccountId, ['m1'])

      await expect(repo.registerSubAccount(login.nexonAccountId, ['m2', 'm1'])).resolves.toBe(
        'same_account',
      )

      expect(await holderOf('m2')).toBeUndefined()
      expect(await db.select().from(users)).toHaveLength(1)
      expect(await db.select().from(subAccountRegistrations)).toEqual([])
    })

    // 옮기면 먼저 등록한 사람의 기록이 말없이 다른 사람에게 넘어간다(사용자 지정 2026-11-17).
    it('다른 로그인에 등록된 계정은 registered_elsewhere 로 거절하고, 해제한 뒤에는 받는다', async () => {
      const first = await users$.upsertByNexonUid('uid-1')
      const second = await users$.upsertByNexonUid('uid-2')
      await repo.registerSubAccount(first.nexonAccountId, ['m1'])

      await expect(repo.registerSubAccount(second.nexonAccountId, ['m1'])).resolves.toBe(
        'registered_elsewhere',
      )
      expect(await registrationsOf(first.nexonAccountId)).toHaveLength(1)
      expect(await registrationsOf(second.nexonAccountId)).toEqual([])

      await repo.unregisterSubAccount(first.nexonAccountId, ['m1'])
      await expect(repo.registerSubAccount(second.nexonAccountId, ['m1'])).resolves.toBe(
        'registered',
      )
    })

    // 두 로그인이 서로를 부계정으로 두면 누가 메인인지 가릴 수 없다.
    it('부계정을 가진 계정은 has_sub_accounts, 부계정인 로그인은 login_is_sub_account 로 거절한다', async () => {
      const main = await users$.upsertByNexonUid('uid-1')
      await repo.reportMapleIds(main.nexonAccountId, ['m-main'])
      await repo.registerSubAccount(main.nexonAccountId, ['m-sub'])
      const other = await users$.upsertByNexonUid('uid-2')
      await repo.reportMapleIds(other.nexonAccountId, ['m-other'])

      await expect(repo.registerSubAccount(other.nexonAccountId, ['m-main'])).resolves.toBe(
        'has_sub_accounts',
      )

      await repo.registerSubAccount(main.nexonAccountId, ['m-other'])
      await expect(repo.registerSubAccount(other.nexonAccountId, ['m-new'])).resolves.toBe(
        'login_is_sub_account',
      )
      expect(await holderOf('m-new')).toBeUndefined()
    })

    // 상한은 기기가 센다. 서버에는 여러 기기의 부계정이 모인다.
    it('부계정 수를 세지 않는다', async () => {
      const login = await users$.upsertByNexonUid('uid-1')
      for (const n of [1, 2, 3, 4, 5, 6]) {
        await expect(repo.registerSubAccount(login.nexonAccountId, [`m${n}`])).resolves.toBe(
          'registered',
        )
      }

      expect(await registrationsOf(login.nexonAccountId)).toHaveLength(6)
    })

    // 해제는 등록 줄만 지운다. 그 계정의 기록은 계정 줄에 남는다.
    it('해제하면 이 로그인의 등록만 지우고 계정 줄과 메이플 ID 는 남긴다. 등록이 없으면 아무 일도 없다', async () => {
      const first = await users$.upsertByNexonUid('uid-1')
      const second = await users$.upsertByNexonUid('uid-2')
      await repo.registerSubAccount(first.nexonAccountId, ['m1'])
      const sub = await holderOf('m1')

      await repo.unregisterSubAccount(second.nexonAccountId, ['m1'])
      expect(await registrationsOf(first.nexonAccountId)).toEqual([sub])

      await repo.unregisterSubAccount(first.nexonAccountId, ['m1', 'm-unknown'])
      expect(await registrationsOf(first.nexonAccountId)).toEqual([])
      expect(await holderOf('m1')).toBe(sub)
      expect(await holderOf('m-unknown')).toBeUndefined()
    })

    // 등록 정보는 유예 30일이 지나 로그인 줄이 지워질 때 함께 지워진다(사용자 선택 2026-11-10).
    it('메인 계정을 지우면 등록 정보만 지워지고 부계정은 남는다', async () => {
      const login = await users$.upsertByNexonUid('uid-1')
      await repo.registerSubAccount(login.nexonAccountId, ['m1'])
      await db
        .update(users)
        .set({ deletionRequestedAt: new Date('2026-01-01T00:00:00Z') })
        .where(eq(users.id, login.id))

      await users$.purgeDeletionsBefore(new Date('2026-02-01T00:00:00Z'))

      expect(await db.select().from(subAccountRegistrations)).toEqual([])
      expect(await holderOf('m1')).toBeDefined()
    })
  })

  describe('표의 제약', () => {
    it('메이플 ID 는 서버 전체에서 한 줄이다', async () => {
      const a = await users$.upsertByMapleId('m1')
      const b = await users$.upsertByMapleId('m2')

      const maple = db.insert(mapleIds).values({ nexonAccountId: b.nexonAccountId, hash: 'm1' })

      expect(a.nexonAccountId).not.toBe(b.nexonAccountId)
      expect(isUniqueViolation(await errorOf(maple))).toBe(true)
    })

    it('부계정 등록은 자기 자신을 잇지 못하고, 한 계정은 로그인 하나에만 붙는다', async () => {
      const first = await users$.upsertByNexonUid('uid-1')
      const second = await users$.upsertByNexonUid('uid-2')
      const sub = await users$.upsertByMapleId('m1')

      const self = db.insert(subAccountRegistrations).values({
        loginNexonAccountId: first.nexonAccountId,
        subNexonAccountId: first.nexonAccountId,
      })
      expect(isCheckViolation(await errorOf(self))).toBe(true)
      await db.insert(subAccountRegistrations).values({
        loginNexonAccountId: first.nexonAccountId,
        subNexonAccountId: sub.nexonAccountId,
      })
      const twice = db.insert(subAccountRegistrations).values({
        loginNexonAccountId: second.nexonAccountId,
        subNexonAccountId: sub.nexonAccountId,
      })
      expect(isUniqueViolation(await errorOf(twice))).toBe(true)
    })
  })
})
