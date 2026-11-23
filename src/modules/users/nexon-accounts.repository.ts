import { Inject, Injectable } from '@nestjs/common'
import { and, eq, inArray } from 'drizzle-orm'

import { ERROR_CODES, type SubAccountRejection } from '../../common/error-codes'
import { DB, type Db } from '../../database/database.module'
import { mapleIds, subAccountRegistrations } from '../../database/schema'
import {
  addMapleIds,
  findOrCreateMapleIdAccount,
  lockNexonAccounts,
  mapleIdsOf,
} from './nexon-account-store'

export type SubAccountRegistration = 'registered' | SubAccountRejection

/** 거절할 때 트랜잭션을 되돌리려고 던진다. 처음 보는 메이플 ID 로 만든 사람 · 계정 줄이 남지 않게 한다. */
class Rejected extends Error {
  constructor(readonly result: SubAccountRejection) {
    super(result)
  }
}

/** 넥슨 계정의 메이플 ID 와 부계정 등록. 같은 넥슨 ID 의 줄은 메이플 ID 로 알아보고 한 줄로 합친다. */
@Injectable()
export class NexonAccountsRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** 앱이 알린 메이플 ID 를 적고, 합친 뒤 그 계정이 가진 메이플 ID 전부를 돌려준다. 받지 않은 메이플 ID 는 빠져 있다. */
  reportMapleIds(nexonAccountId: string, hashes: readonly string[]): Promise<string[]> {
    return this.db.transaction(async (tx) => {
      await lockNexonAccounts(tx)
      return mapleIdsOf(tx, await addMapleIds(tx, nexonAccountId, hashes))
    })
  }

  /**
   * 메이플 ID 의 넥슨 계정을 이 로그인의 부계정으로 잇는다. 처음 보는 메이플 ID 는 사람과 계정 줄을 만들고, 목록의 다른 메이플
   * ID 로 같은 넥슨 ID 의 줄과 합친다. 이미 이 로그인의 부계정이면 그대로 둔다. 같은 넥슨 ID 가 다른 기기에서 다시 등록한 것이다.
   *
   * 거절은 넷이다. 메이플 ID 가 로그인 자신의 것과 겹치면 같은 넥슨 ID 다. 다른 로그인에 등록된 계정은 옮기지 않는다. 옮기면
   * 먼저 등록한 사람의 기록이 말없이 다른 사람에게 넘어간다. 부계정을 가진 계정은 부계정이 될 수 없고, 부계정인 로그인은 등록할
   * 수 없다. 두 로그인이 서로를 부계정으로 두면 누가 메인인지 가릴 수 없다.
   *
   * 부계정 수는 세지 않는다. 상한은 기기가 센다.
   */
  async registerSubAccount(
    loginNexonAccountId: string,
    hashes: readonly string[],
  ): Promise<SubAccountRegistration> {
    const unique = [...new Set(hashes)]
    const [first] = unique
    if (first === undefined) throw new Error('메이플 ID 없이 부계정을 등록할 수 없다')
    try {
      await this.db.transaction(async (tx) => {
        await lockNexonAccounts(tx)
        const [overlap] = await tx
          .select({ id: mapleIds.id })
          .from(mapleIds)
          .where(
            and(eq(mapleIds.nexonAccountId, loginNexonAccountId), inArray(mapleIds.hash, unique)),
          )
          .limit(1)
        if (overlap !== undefined) throw new Rejected(ERROR_CODES.sameAccount)
        const holder = await findOrCreateMapleIdAccount(tx, first)
        const sub = await addMapleIds(tx, holder.nexonAccountId, unique)
        if (sub === loginNexonAccountId) throw new Rejected(ERROR_CODES.sameAccount)

        const [registered] = await tx
          .select({ login: subAccountRegistrations.loginNexonAccountId })
          .from(subAccountRegistrations)
          .where(eq(subAccountRegistrations.subNexonAccountId, sub))
        if (registered?.login === loginNexonAccountId) return
        if (registered !== undefined) throw new Rejected(ERROR_CODES.registeredElsewhere)
        const [owned] = await tx
          .select({ id: subAccountRegistrations.id })
          .from(subAccountRegistrations)
          .where(eq(subAccountRegistrations.loginNexonAccountId, sub))
          .limit(1)
        if (owned !== undefined) throw new Rejected(ERROR_CODES.hasSubAccounts)
        const [owner] = await tx
          .select({ id: subAccountRegistrations.id })
          .from(subAccountRegistrations)
          .where(eq(subAccountRegistrations.subNexonAccountId, loginNexonAccountId))
        if (owner !== undefined) throw new Rejected(ERROR_CODES.loginIsSubAccount)

        await tx
          .insert(subAccountRegistrations)
          .values({ loginNexonAccountId, subNexonAccountId: sub })
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
  async unregisterSubAccount(
    loginNexonAccountId: string,
    hashes: readonly string[],
  ): Promise<void> {
    if (hashes.length === 0) return
    await this.db.transaction(async (tx) => {
      await lockNexonAccounts(tx)
      const holders = tx
        .select({ id: mapleIds.nexonAccountId })
        .from(mapleIds)
        .where(inArray(mapleIds.hash, [...hashes]))
      await tx
        .delete(subAccountRegistrations)
        .where(
          and(
            eq(subAccountRegistrations.loginNexonAccountId, loginNexonAccountId),
            inArray(subAccountRegistrations.subNexonAccountId, holders),
          ),
        )
    })
  }
}
