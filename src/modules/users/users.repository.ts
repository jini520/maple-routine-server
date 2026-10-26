import { Inject, Injectable } from '@nestjs/common'
import { and, eq, sql } from 'drizzle-orm'

import { DB, type Db } from '../../database/database.module'
import { nexonAccounts, users } from '../../database/schema'

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

const ACCOUNT_COLUMNS = {
  id: nexonAccounts.userId,
  nexonAccountId: nexonAccounts.id,
  accountRecordId: nexonAccounts.accountRecordId,
}

@Injectable()
export class UsersRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** 넥슨 uid 로 사람을 하나로 묶는다. 탈퇴 표시는 다시 로그인한 순간 거둔다. */
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

  /** 탈퇴를 적는다. 이미 적힌 시각은 안 덮는다. 처음 탈퇴한 때가 답이어야 한다. */
  async markDeleted(id: string): Promise<void> {
    await this.db
      .update(users)
      .set({ deletedAt: sql`COALESCE(${users.deletedAt}, now())` })
      .where(eq(users.id, id))
  }

  /**
   * 자격으로 계정을 찾고, 없으면 사람과 계정을 함께 만든다.
   *
   * 같은 자격이 동시에 오면 둘 다 사람을 만들 수 있다. 계정의 UNIQUE 에 진 쪽은 만든 사람을 지우고 이긴 쪽을 다시 읽는다.
   */
  private async upsertAccount(credential: Credential): Promise<FoundAccount> {
    const match =
      credential.identitySource === 'login'
        ? eq(nexonAccounts.nexonUid, credential.nexonUid)
        : eq(nexonAccounts.apiKeyHash, credential.apiKeyHash)
    return this.db.transaction(async (tx) => {
      const [found] = await tx.select(ACCOUNT_COLUMNS).from(nexonAccounts).where(match)
      if (found !== undefined) {
        await tx.update(users).set({ deletedAt: null }).where(eq(users.id, found.id))
        return found
      }
      const [user] = await tx.insert(users).values({}).returning({ id: users.id })
      if (user === undefined) throw new Error('사람을 만들지 못했다')
      const [created] = await tx
        .insert(nexonAccounts)
        .values({ userId: user.id, ...credential })
        .onConflictDoNothing()
        .returning(ACCOUNT_COLUMNS)
      if (created !== undefined) return created
      await tx.delete(users).where(eq(users.id, user.id))
      const [winner] = await tx.select(ACCOUNT_COLUMNS).from(nexonAccounts).where(match)
      if (winner === undefined) throw new Error('겹친 계정을 다시 읽지 못했다')
      return winner
    })
  }
}
