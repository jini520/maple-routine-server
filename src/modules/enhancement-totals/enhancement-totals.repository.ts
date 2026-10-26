import { Inject, Injectable } from '@nestjs/common'
import { and, eq, sql } from 'drizzle-orm'

import { DB, type Db } from '../../database/database.module'
import { enhancementTotals, nexonAccounts } from '../../database/schema'
import type { IdentitySource } from '../identity/identity.guard'
import type { EnhancementTotalBody } from './enhancement-totals.dto'

/** 전송값 그대로에 사람과 신원을 더한 것. */
export interface EnhancementTotalInput extends Omit<
  EnhancementTotalBody,
  'accountRecordId' | 'itemKey'
> {
  userId: string
  identifiedBy: IdentitySource
  accountRecordId: string | null
  itemKey: string | null
}

/** 강화 합계의 사본. 같은 사람의 같은 합계는 한 줄이고, 기기에서 사라지면 deleted_at 이 남는다. */
@Injectable()
export class EnhancementTotalsRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** 사람과 합계 id 로 덮어 적는다. 지운 줄도 다시 적으면 되살아난다. 넥슨 계정은 그 사람의 계정 줄에서 찾고 못 찾으면 비운다. */
  async upsert(input: EnhancementTotalInput): Promise<void> {
    const { userId, totalRecordId, accountRecordId, ...rest } = input
    let nexonAccountId: string | null = null
    if (accountRecordId !== null) {
      const [account] = await this.db
        .select({ id: nexonAccounts.id })
        .from(nexonAccounts)
        .where(
          and(eq(nexonAccounts.userId, userId), eq(nexonAccounts.accountRecordId, accountRecordId)),
        )
      nexonAccountId = account?.id ?? null
    }
    const values = { ...rest, nexonAccountId }
    await this.db
      .insert(enhancementTotals)
      .values({ userId, totalRecordId, ...values })
      .onConflictDoUpdate({
        target: [enhancementTotals.userId, enhancementTotals.totalRecordId],
        set: { ...values, deletedAt: null, updatedAt: sql`now()` },
      })
  }

  /** 내 줄에 지운 시각을 적는다. 없는 줄이면 아무 일도 없다. 이미 적힌 시각은 안 덮는다. */
  async markDeleted(userId: string, totalRecordId: string): Promise<void> {
    await this.db
      .update(enhancementTotals)
      .set({
        deletedAt: sql`COALESCE(${enhancementTotals.deletedAt}, now())`,
        updatedAt: sql`now()`,
      })
      .where(
        and(
          eq(enhancementTotals.userId, userId),
          eq(enhancementTotals.totalRecordId, totalRecordId),
        ),
      )
  }
}
