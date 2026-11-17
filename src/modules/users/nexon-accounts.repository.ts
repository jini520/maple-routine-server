import { Inject, Injectable } from '@nestjs/common'
import { and, eq, inArray } from 'drizzle-orm'

import { DB, type Db } from '../../database/database.module'
import { nexonAccountMapleIds, subAccounts } from '../../database/schema'
import {
  addMapleIds,
  findOrCreateKeyAccount,
  findOrCreateMapleIdAccount,
  lockNexonAccounts,
  mapleIdsOf,
} from './nexon-account-store'

export type SubAccountRegistration =
  | 'registered'
  | 'same_account'
  | 'registered_elsewhere'
  | 'has_sub_accounts'
  | 'login_is_sub_account'

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

  /**
   * 메이플 ID 의 넥슨 계정을 이 로그인의 부계정으로 잇는다. 처음 보는 메이플 ID 는 사람과 계정 줄을 만든다. 이미 이 로그인의
   * 부계정이면 그대로 둔다. 키 해시는 1.0.14 까지의 앱이 보내고, 오면 그 키의 줄을 메이플 ID 로 같은 넥슨 ID 의 줄과 합친다.
   *
   * 거절은 넷이다. 메이플 ID 가 로그인 자신의 것과 겹치거나 키가 로그인 줄에 달려 있으면 같은 넥슨 ID 다. 다른 로그인에 등록된
   * 계정은 옮기지 않는다. 옮기면 먼저 등록한 사람의 기록이 다른 사람에게 넘어간다. 부계정을 가진 계정은 부계정이 될 수 없고,
   * 부계정인 로그인은 등록할 수 없다. 누가 메인인지 가릴 수 없게 된다.
   *
   * 부계정 수는 세지 않는다. 상한은 기기가 센다.
   */
  async registerSubAccount(
    loginAccountId: string,
    apiKeyHash: Buffer | null,
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
        const [first] = unique
        if (first === undefined) throw new Error('메이플 ID 없이 부계정을 등록할 수 없다')
        const holder =
          apiKeyHash === null
            ? await findOrCreateMapleIdAccount(tx, first)
            : await findOrCreateKeyAccount(tx, apiKeyHash)
        if (holder.nexonAccountId === loginAccountId) throw new Rejected('same_account')
        const sub = await addMapleIds(tx, holder.nexonAccountId, unique)
        if (sub === loginAccountId) throw new Rejected('same_account')

        const [registered] = await tx
          .select({ loginAccountId: subAccounts.loginAccountId })
          .from(subAccounts)
          .where(eq(subAccounts.subAccountId, sub))
        if (registered?.loginAccountId === loginAccountId) return
        if (registered !== undefined) throw new Rejected('registered_elsewhere')
        const [owned] = await tx
          .select({ id: subAccounts.id })
          .from(subAccounts)
          .where(eq(subAccounts.loginAccountId, sub))
          .limit(1)
        if (owned !== undefined) throw new Rejected('has_sub_accounts')
        const [owner] = await tx
          .select({ id: subAccounts.id })
          .from(subAccounts)
          .where(eq(subAccounts.subAccountId, loginAccountId))
        if (owner !== undefined) throw new Rejected('login_is_sub_account')

        await tx.insert(subAccounts).values({ loginAccountId, subAccountId: sub })
      })
      return 'registered'
    } catch (error) {
      if (error instanceof Rejected) return error.result
      throw error
    }
  }

  /**
   * 메이플 ID 의 넥슨 계정과 이 로그인을 잇는 등록을 지운다. 계정 줄 · 메이플 ID · 기록은 남는다. 등록이 없거나 처음 보는
   * 메이플 ID 면 아무 일도 하지 않는다. 같은 해제를 여러 기기가 보낸다.
   */
  async unregisterSubAccount(loginAccountId: string, mapleIds: readonly string[]): Promise<void> {
    if (mapleIds.length === 0) return
    await this.db.transaction(async (tx) => {
      await lockNexonAccounts(tx)
      const holders = tx
        .select({ id: nexonAccountMapleIds.nexonAccountId })
        .from(nexonAccountMapleIds)
        .where(inArray(nexonAccountMapleIds.mapleId, [...mapleIds]))
      await tx
        .delete(subAccounts)
        .where(
          and(
            eq(subAccounts.loginAccountId, loginAccountId),
            inArray(subAccounts.subAccountId, holders),
          ),
        )
    })
  }
}
