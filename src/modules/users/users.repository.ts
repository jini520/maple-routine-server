import { Inject, Injectable } from '@nestjs/common'
import { and, eq, gte, isNull, lt, notExists, sql } from 'drizzle-orm'

import { DB, type Db } from '../../database/database.module'
import {
  dropPrices,
  enhancementAnomalies,
  nexonAccounts,
  nexonSessions,
  usageEvents,
  users,
} from '../../database/schema'
import { newReferralCode } from './referral-code'

/** 찾은 사람과 그 자격의 넥슨 계정. */
export interface FoundAccount {
  /** 사람(users.id). */
  id: string
  nexonAccountId: string
  /** 기기가 만든 계정 id. 앱이 아직 안 알려 줬으면 NULL. */
  accountRecordId: string | null
}

type Credential =
  { identitySource: 'login'; nexonUid: string } | { identitySource: 'key'; apiKeyHash: Buffer }

/** 추천인 코드가 겹쳐 다시 뽑는 횟수의 끝. 코드가 1조 가지가 넘어 한 번 겹치는 일도 드물다. */
const ACCOUNT_INSERT_ATTEMPTS = 5

const ACCOUNT_COLUMNS = {
  id: nexonAccounts.userId,
  nexonAccountId: nexonAccounts.id,
  accountRecordId: nexonAccounts.accountRecordId,
}

@Injectable()
export class UsersRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** 넥슨 uid 로 사람을 하나로 묶는다. 삭제 예약은 건드리지 않는다. 취소는 앱이 물은 뒤에만 한다. */
  upsertByNexonUid(nexonUid: string): Promise<FoundAccount> {
    return this.upsertAccount({ identitySource: 'login', nexonUid })
  }

  /** 키 해시로 사람을 하나로 묶는다. 처음 보는 해시는 사람을 만든다. 증명은 없고 표본을 묶는 꼬리표다. */
  upsertByApiKeyHash(apiKeyHash: Buffer): Promise<FoundAccount> {
    return this.upsertAccount({ identitySource: 'key', apiKeyHash })
  }

  /** 세션 경로의 계정. 세션은 사람만 가리키므로 그 사람의 로그인 계정을 찾는다. */
  async findLoginAccount(userId: string): Promise<Omit<FoundAccount, 'id'> | null> {
    const [row] = await this.db
      .select({ nexonAccountId: nexonAccounts.id, accountRecordId: nexonAccounts.accountRecordId })
      .from(nexonAccounts)
      .where(and(eq(nexonAccounts.userId, userId), eq(nexonAccounts.identitySource, 'login')))
      .limit(1)
    return row ?? null
  }

  /**
   * 앱이 헤더로 알려 준 기기 계정 id 를 적는다. 같은 사람의 다른 계정이 그 id 를 이미 가졌으면 적지 않는다.
   *
   * 던지지 않는 이유는 이것이 쓰기 요청에 얹힌 일이라서다. 여기서 실패하면 멀쩡한 기록까지 거절된다.
   */
  async recordAccountId(nexonAccountId: string, accountRecordId: string): Promise<void> {
    await this.db.execute(sql`
      UPDATE ${nexonAccounts} SET account_record_id = ${accountRecordId}, updated_at = now()
       WHERE id = ${nexonAccountId}
         AND account_record_id IS DISTINCT FROM ${accountRecordId}
         AND NOT EXISTS (
           SELECT 1 FROM ${nexonAccounts} other
            WHERE other.user_id = ${nexonAccounts.userId} AND other.account_record_id = ${accountRecordId}
              AND other.id <> ${nexonAccountId})`)
  }

  /**
   * 키 사용자가 로그인을 붙였을 때 키의 사람을 로그인한 사람에 합친다. 앱이 기기에서 키를 지우기 전에 부른다.
   *
   * 키 줄이 로그인한 다른 사람이나 삭제를 예약한 사람에게 붙어 있으면 옮기지 않는다. 해시는 신원의 증명이 아니고,
   * 예약한 사람을 합치면 그 삭제 요청이 사라진다.
   */
  async linkApiKey(userId: string, apiKeyHash: Buffer): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .insert(nexonAccounts)
        .values({ userId, identitySource: 'key', apiKeyHash })
        .onConflictDoNothing()
      const [key] = await tx
        .select({ userId: nexonAccounts.userId })
        .from(nexonAccounts)
        .where(eq(nexonAccounts.apiKeyHash, apiKeyHash))
        .for('update')
      if (key === undefined) throw new Error('키 줄을 읽지 못했다')
      const from = key.userId
      if (from === userId) return

      const [movable] = await tx
        .select({ id: users.id })
        .from(users)
        .where(
          and(
            eq(users.id, from),
            isNull(users.deletionRequestedAt),
            notExists(
              tx
                .select()
                .from(nexonAccounts)
                .where(
                  and(eq(nexonAccounts.userId, from), eq(nexonAccounts.identitySource, 'login')),
                ),
            ),
            notExists(tx.select().from(nexonSessions).where(eq(nexonSessions.userId, from))),
          ),
        )
      if (movable === undefined) return

      // 같은 기록이 양쪽에 있으면 늦게 고친 줄만 남긴다. 시각이 같으면 키 쪽을 버린다.
      await tx.execute(sql`
        DELETE FROM ${dropPrices} d USING ${dropPrices} o
         WHERE d.user_id IN (${from}, ${userId}) AND o.user_id IN (${from}, ${userId})
           AND d.user_id <> o.user_id AND d.drop_record_id = o.drop_record_id
           AND (d.updated_at < o.updated_at OR (d.updated_at = o.updated_at AND d.user_id = ${from}))`)
      await tx.execute(sql`
        DELETE FROM ${enhancementAnomalies} d USING ${enhancementAnomalies} o
         WHERE d.user_id IN (${from}, ${userId}) AND o.user_id IN (${from}, ${userId})
           AND d.user_id <> o.user_id
           AND d.history_date = o.history_date AND d.enhancement_type = o.enhancement_type
           AND d.anomaly_type = o.anomaly_type AND d.item_name = o.item_name
           AND (d.updated_at < o.updated_at OR (d.updated_at = o.updated_at AND d.user_id = ${from}))`)
      await tx.update(dropPrices).set({ userId }).where(eq(dropPrices.userId, from))
      await tx
        .update(enhancementAnomalies)
        .set({ userId })
        .where(eq(enhancementAnomalies.userId, from))
      await tx.update(usageEvents).set({ userId }).where(eq(usageEvents.userId, from))
      // (user_id, account_record_id) 가 UNIQUE 라 로그인한 사람의 줄과 겹치는 계정 id 는 비운다.
      await tx.execute(sql`
        UPDATE ${nexonAccounts} a
           SET user_id = ${userId}, updated_at = now(),
               account_record_id = CASE WHEN EXISTS (
                 SELECT 1 FROM ${nexonAccounts} o
                  WHERE o.user_id = ${userId} AND o.account_record_id = a.account_record_id
               ) THEN NULL ELSE a.account_record_id END
         WHERE a.user_id = ${from}`)
      // 옛 표(boss_clears 등)의 줄은 외래키가 함께 지운다.
      await tx.delete(users).where(eq(users.id, from))
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

  /**
   * 자격으로 계정을 찾고, 없으면 사람과 계정을 함께 만든다. 로그인 계정이면 추천인 코드도 함께 만든다.
   *
   * 같은 자격이 동시에 오면 둘 다 사람을 만들 수 있다. 계정의 UNIQUE 에 진 쪽은 만든 사람을 지우고 이긴 쪽을 다시 읽는다.
   * 이긴 쪽이 없으면 겹친 것은 추천인 코드라서 코드를 다시 뽑는다.
   */
  private async upsertAccount(credential: Credential): Promise<FoundAccount> {
    const match =
      credential.identitySource === 'login'
        ? eq(nexonAccounts.nexonUid, credential.nexonUid)
        : eq(nexonAccounts.apiKeyHash, credential.apiKeyHash)
    return this.db.transaction(async (tx) => {
      const [found] = await tx.select(ACCOUNT_COLUMNS).from(nexonAccounts).where(match)
      if (found !== undefined) return found
      const [user] = await tx.insert(users).values({}).returning({ id: users.id })
      if (user === undefined) throw new Error('사람을 만들지 못했다')
      for (let attempt = 0; attempt < ACCOUNT_INSERT_ATTEMPTS; attempt += 1) {
        const referralCode = credential.identitySource === 'login' ? newReferralCode() : null
        const [created] = await tx
          .insert(nexonAccounts)
          .values({ userId: user.id, ...credential, referralCode })
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
}
