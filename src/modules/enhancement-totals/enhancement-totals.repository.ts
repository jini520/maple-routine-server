import { Inject, Injectable } from '@nestjs/common'
import { and, eq, sql } from 'drizzle-orm'

import { DB, type Db } from '../../database/database.module'
import { enhancementTotals } from '../../database/schema'
import type { IdentityContext, IdentitySource } from '../identity/identity.guard'
import { assertOwnsMapleId, ownedMapleIds } from '../users/maple-id-ownership'
import type { EnhancementTotalBody } from './enhancement-totals.dto'

/** 전송값 그대로에 신원을 더한 것. */
export interface EnhancementTotalInput extends Omit<EnhancementTotalBody, 'itemKey'> {
  /** 보낸 신원의 넥슨 계정. 메이플 ID 가 이 계정의 것이어야 적는다. */
  nexonAccountId: string
  identifiedBy: IdentitySource
  itemKey: string | null
}

/**
 * 강화 합계의 사본. 같은 합계(ocid · 날짜 · 분류 · 장비 묶음)는 한 줄이고, 기기에서 사라지면 deleted_at 이 남는다. 이름을 바꾼
 * 캐릭터도 ocid 가 같아 한 줄이다.
 */
@Injectable()
export class EnhancementTotalsRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  /**
   * 같은 합계면 덮어 적는다. 지운 줄도 다시 적으면 되살아난다. 다시 설치한 기기는 같은 합계에 새 기록 id 를 붙이므로 그 id 로
   * 바꾼다. 다른 메이플 ID 의 줄은 덮지 않는다. 남의 메이플 ID 는 MapleIdNotOwned 다.
   */
  async upsert(input: EnhancementTotalInput): Promise<void> {
    const { nexonAccountId, ...values } = input
    await this.db.transaction(async (tx) => {
      await assertOwnsMapleId(tx, nexonAccountId, values.mapleId)
      await tx
        .insert(enhancementTotals)
        .values(values)
        .onConflictDoUpdate({
          target: [
            enhancementTotals.ocid,
            enhancementTotals.historyDate,
            enhancementTotals.enhancementCategory,
            enhancementTotals.itemGroup,
          ],
          set: { ...values, deletedAt: null, updatedAt: sql`now()` },
          setWhere: eq(enhancementTotals.mapleId, values.mapleId),
        })
    })
  }

  /** 내 계정의 메이플 ID 줄에 지운 시각을 적는다. 없는 줄이면 아무 일도 없다. 이미 적힌 시각은 안 덮는다. */
  async markDeleted(
    identity: Pick<IdentityContext, 'nexonAccountId'>,
    totalRecordId: string,
  ): Promise<void> {
    await this.db
      .update(enhancementTotals)
      .set({
        deletedAt: sql`COALESCE(${enhancementTotals.deletedAt}, now())`,
        updatedAt: sql`now()`,
      })
      .where(
        and(
          eq(enhancementTotals.totalRecordId, totalRecordId),
          sql`${enhancementTotals.mapleId} IN ${ownedMapleIds(identity.nexonAccountId)}`,
        ),
      )
  }
}
