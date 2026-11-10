import { Inject, Injectable } from '@nestjs/common'
import { and, eq, gte, isNotNull, isNull, lt, sql } from 'drizzle-orm'

import { DB, type Db } from '../../database/database.module'
import { nexonAccountKeys, nexonAccounts, users } from '../../database/schema'
import {
  ACCOUNT_COLUMNS,
  findOrCreateKeyAccount,
  type FoundAccount,
  lockNexonAccounts,
  mergeNexonAccounts,
} from './nexon-account-store'
import { newReferralCode } from './referral-code'

export type { FoundAccount } from './nexon-account-store'

/** 추천인 코드가 겹쳐 다시 뽑는 횟수의 끝. 코드가 1조 가지가 넘어 한 번 겹치는 일도 드물다. */
const ACCOUNT_INSERT_ATTEMPTS = 5

@Injectable()
export class UsersRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  /**
   * 넥슨 uid 로 넥슨 계정을 찾고, 없으면 사람 · 로그인 계정 줄 · 추천인 코드를 함께 만든다. 삭제 예약은 건드리지 않는다.
   * 취소는 앱이 물은 뒤에만 한다.
   *
   * 같은 uid 가 동시에 오면 둘 다 사람을 만들 수 있다. uid 의 UNIQUE 에 진 쪽은 만든 사람을 지우고 이긴 쪽을 다시 읽는다.
   * 이긴 쪽이 없으면 겹친 것은 추천인 코드라서 코드를 다시 뽑는다.
   */
  upsertByNexonUid(nexonUid: string): Promise<FoundAccount> {
    const match = eq(nexonAccounts.nexonUid, nexonUid)
    return this.db.transaction(async (tx) => {
      const [found] = await tx.select(ACCOUNT_COLUMNS).from(nexonAccounts).where(match)
      if (found !== undefined) return found
      const [user] = await tx.insert(users).values({}).returning({ id: users.id })
      if (user === undefined) throw new Error('사람을 만들지 못했다')
      for (let attempt = 0; attempt < ACCOUNT_INSERT_ATTEMPTS; attempt += 1) {
        const [created] = await tx
          .insert(nexonAccounts)
          .values({ userId: user.id, nexonUid, referralCode: newReferralCode() })
          .onConflictDoNothing()
          .returning(ACCOUNT_COLUMNS)
        if (created !== undefined) return created
        const [winner] = await tx.select(ACCOUNT_COLUMNS).from(nexonAccounts).where(match)
        if (winner !== undefined) {
          await tx.delete(users).where(eq(users.id, user.id))
          return winner
        }
      }
      throw new Error('계정 줄을 만들지 못했다')
    })
  }

  /** 키 해시로 넥슨 계정을 찾는다. 처음 보는 해시는 사람과 계정 줄을 만든다. 증명은 없고 표본을 묶는 꼬리표다. */
  upsertByApiKeyHash(apiKeyHash: Buffer): Promise<FoundAccount> {
    return this.db.transaction((tx) => findOrCreateKeyAccount(tx, apiKeyHash))
  }

  /** 세션 경로의 계정. 세션은 사람만 가리키므로 그 사람의 로그인 계정 줄(`nexon_uid` 가 있는 줄)을 찾는다. */
  async findLoginAccount(userId: string): Promise<Omit<FoundAccount, 'id'> | null> {
    const [row] = await this.db
      .select({ nexonAccountId: nexonAccounts.id })
      .from(nexonAccounts)
      .where(and(eq(nexonAccounts.userId, userId), isNotNull(nexonAccounts.nexonUid)))
      .limit(1)
    return row ?? null
  }

  /**
   * 키 사용자가 로그인을 붙였을 때 키를 로그인 계정 줄에 단다. 앱은 메이플 ID 가 같은 것을 확인한 키만, 기기에서 지우기 전에 보낸다.
   * 같은 넥슨 ID 라 키의 계정 줄은 로그인 줄로 합친다.
   *
   * 키가 다른 로그인 줄에 달려 있거나 그 사람이 삭제를 예약했으면 옮기지 않는다. 앞은 어느 넥슨 ID 인지 가릴 수 없고, 뒤는 합치면
   * 그 삭제 요청이 사라진다.
   */
  async linkApiKey(userId: string, apiKeyHash: Buffer): Promise<void> {
    await this.db.transaction(async (tx) => {
      await lockNexonAccounts(tx)
      const [login] = await tx
        .select({ id: nexonAccounts.id })
        .from(nexonAccounts)
        .where(and(eq(nexonAccounts.userId, userId), isNotNull(nexonAccounts.nexonUid)))
        .limit(1)
      if (login === undefined) return
      const [holder] = await tx
        .select({
          id: nexonAccounts.id,
          nexonUid: nexonAccounts.nexonUid,
          deletionRequestedAt: users.deletionRequestedAt,
        })
        .from(nexonAccountKeys)
        .innerJoin(nexonAccounts, eq(nexonAccounts.id, nexonAccountKeys.nexonAccountId))
        .innerJoin(users, eq(users.id, nexonAccounts.userId))
        .where(eq(nexonAccountKeys.apiKeyHash, apiKeyHash))
      if (holder === undefined) {
        await tx
          .insert(nexonAccountKeys)
          .values({ nexonAccountId: login.id, apiKeyHash })
          .onConflictDoNothing()
        return
      }
      if (holder.id === login.id || holder.nexonUid !== null || holder.deletionRequestedAt !== null)
        return
      await mergeNexonAccounts(tx, holder.id, login.id)
    })
  }

  /** 계정 삭제를 예약한다. 이미 적힌 시각은 안 덮는다. 덮으면 다시 누를 때마다 유예가 밀린다. */
  async requestDeletion(id: string): Promise<void> {
    await this.db
      .update(users)
      .set({ deletionRequestedAt: sql`COALESCE(${users.deletionRequestedAt}, now())` })
      .where(eq(users.id, id))
  }

  async cancelDeletion(id: string): Promise<void> {
    await this.db.update(users).set({ deletionRequestedAt: null }).where(eq(users.id, id))
  }

  /** 삭제를 예약한 때. 예약이 없거나 사람이 없으면 NULL. */
  async deletionRequestedAt(id: string): Promise<Date | null> {
    const [row] = await this.db
      .select({ at: users.deletionRequestedAt })
      .from(users)
      .where(eq(users.id, id))
    return row?.at ?? null
  }

  /**
   * 기준보다 앞서 예약한 사람을 지우고 지운 수를 돌려준다. 열쇠 · 세션 · 옛 표의 줄은 함께 지워지고, 드롭 가격 · 사용 로그 ·
   * 강화 상황은 `user_id` 만 비워 남는다(외래키가 정한다).
   */
  async purgeDeletionsBefore(cutoff: Date): Promise<number> {
    const deleted = await this.db
      .delete(users)
      .where(lt(users.deletionRequestedAt, cutoff))
      .returning({ id: users.id })
    return deleted.length
  }

  /** 삭제를 예약하지 않은 사람 수. createdBefore 를 주면 그 앞에 만든 사람만 센다. 예약한 사람은 30일 뒤 지워진다. */
  async countActive(createdBefore?: Date): Promise<number> {
    const [row] = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(users)
      .where(
        and(
          isNull(users.deletionRequestedAt),
          createdBefore ? lt(users.createdAt, createdBefore) : undefined,
        ),
      )
    return row?.n ?? 0
  }

  /** 날마다(한국 시각) 새로 만든 사람과 그 중 삭제를 예약하지 않은 사람. 오래된 날부터. */
  createdDaily(range: {
    since: Date
    until: Date
  }): Promise<{ day: string; created: number; active: number }[]> {
    const day = sql<string>`to_char(${users.createdAt} at time zone 'Asia/Seoul', 'YYYY-MM-DD')`
    return this.db
      .select({
        day,
        created: sql<number>`count(*)::int`,
        active: sql<number>`(count(*) filter (where ${users.deletionRequestedAt} is null))::int`,
      })
      .from(users)
      .where(and(gte(users.createdAt, range.since), lt(users.createdAt, range.until)))
      .groupBy(day)
      .orderBy(sql`1`)
  }
}
