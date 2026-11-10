import { Inject, Injectable } from '@nestjs/common'
import { and, asc, eq, inArray, sql } from 'drizzle-orm'

import { DB, type Db } from '../../database/database.module'
import { nexonAccountKeys, nexonAccountMapleIds, subAccounts } from '../../database/schema'
import {
  addMapleIds,
  findOrCreateKeyAccount,
  lockNexonAccounts,
  mapleIdsOf,
} from './nexon-account-store'

/** 넥슨 계정은 로그인을 포함해 다섯까지라 부계정은 넷까지다. */
export const SUB_ACCOUNT_LIMIT = 4

export type SubAccountRegistration = 'registered' | 'same_account' | 'limit'

export interface SubAccountEntry {
  /** 서버가 저장한 키 해시(앱이 보낸 해시의 sha256)의 16진. 키를 다시 받은 계정은 여럿이다. */
  apiKeyHashes: string[]
  mapleIds: string[]
}

/** 거절할 때 트랜잭션을 되돌리려고 던진다. 처음 보는 키로 만든 사람 · 계정 줄이 남지 않게 한다. */
class Rejected extends Error {
  constructor(readonly result: Exclude<SubAccountRegistration, 'registered'>) {
    super(result)
  }
}

/** 넥슨 계정의 메이플 ID 와 부계정 등록. 같은 넥슨 ID 의 줄은 메이플 ID 로 알아보고 한 줄로 합친다. */
@Injectable()
export class NexonAccountsRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** 앱이 알린 메이플 ID 를 적고, 합친 뒤 그 계정이 가진 메이플 ID 전부를 돌려준다. 받지 않은 메이플 ID 는 빠져 있다. */
  reportMapleIds(nexonAccountId: string, mapleIds: readonly string[]): Promise<string[]> {
    return this.db.transaction(async (tx) => {
      await lockNexonAccounts(tx)
      return mapleIdsOf(tx, await addMapleIds(tx, nexonAccountId, mapleIds))
    })
  }

  async listSubAccounts(loginAccountId: string): Promise<SubAccountEntry[]> {
    const subs = await this.db
      .select({ id: subAccounts.subAccountId })
      .from(subAccounts)
      .where(eq(subAccounts.loginAccountId, loginAccountId))
      .orderBy(asc(subAccounts.createdAt))
    const entries: SubAccountEntry[] = []
    for (const sub of subs) {
      const keys = await this.db
        .select({ hash: nexonAccountKeys.apiKeyHash })
        .from(nexonAccountKeys)
        .where(eq(nexonAccountKeys.nexonAccountId, sub.id))
        .orderBy(asc(nexonAccountKeys.createdAt))
      entries.push({
        apiKeyHashes: keys.map((key) => key.hash.toString('hex')),
        mapleIds: await mapleIdsOf(this.db, sub.id),
      })
    }
    return entries
  }

  /**
   * 키의 넥슨 계정을 이 로그인의 부계정으로 잇는다. 처음 보는 키는 사람과 계정 줄을 만들고, 메이플 ID 로 같은 넥슨 ID 의 줄과
   * 합친다. 다른 로그인에 붙어 있던 계정이면 등록을 이 로그인으로 옮긴다.
   *
   * 메이플 ID 가 로그인 자신의 것과 겹치거나 키가 로그인 줄에 달려 있으면 같은 넥슨 ID 라 거절한다. 부계정이 넷이면 거절한다.
   */
  async registerSubAccount(
    loginAccountId: string,
    apiKeyHash: Buffer,
    mapleIds: readonly string[],
  ): Promise<SubAccountRegistration> {
    try {
      await this.db.transaction(async (tx) => {
        await lockNexonAccounts(tx)
        const unique = [...new Set(mapleIds)]
        const [overlap] = await tx
          .select({ id: nexonAccountMapleIds.id })
          .from(nexonAccountMapleIds)
          .where(
            and(
              eq(nexonAccountMapleIds.nexonAccountId, loginAccountId),
              inArray(nexonAccountMapleIds.mapleId, unique),
            ),
          )
          .limit(1)
        if (overlap !== undefined) throw new Rejected('same_account')
        const holder = await findOrCreateKeyAccount(tx, apiKeyHash)
        if (holder.nexonAccountId === loginAccountId) throw new Rejected('same_account')
        const sub = await addMapleIds(tx, holder.nexonAccountId, unique)
        if (sub === loginAccountId) throw new Rejected('same_account')

        const [registered] = await tx
          .select({ loginAccountId: subAccounts.loginAccountId })
          .from(subAccounts)
          .where(eq(subAccounts.subAccountId, sub))
        if (registered?.loginAccountId !== loginAccountId) {
          const [row] = await tx
            .select({ n: sql<number>`count(*)::int` })
            .from(subAccounts)
            .where(eq(subAccounts.loginAccountId, loginAccountId))
          if ((row?.n ?? 0) >= SUB_ACCOUNT_LIMIT) throw new Rejected('limit')
        }
        await tx
          .insert(subAccounts)
          .values({ loginAccountId, subAccountId: sub })
          .onConflictDoUpdate({ target: subAccounts.subAccountId, set: { loginAccountId } })
      })
      return 'registered'
    } catch (error) {
      if (error instanceof Rejected) return error.result
      throw error
    }
  }

  /** 그 메이플 ID 가 속한 부계정의 등록을 이 로그인에서 지운다. 부계정의 줄과 기록은 남는다. */
  async unregisterSubAccount(loginAccountId: string, mapleId: string): Promise<void> {
    await this.db.execute(sql`
      DELETE FROM ${subAccounts}
       WHERE login_account_id = ${loginAccountId}
         AND sub_account_id = (SELECT nexon_account_id FROM ${nexonAccountMapleIds} WHERE maple_id = ${mapleId})`)
  }
}
