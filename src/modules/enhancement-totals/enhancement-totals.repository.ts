import { Inject, Injectable } from '@nestjs/common'
import { and, eq, sql } from 'drizzle-orm'

import { DB, type Db } from '../../database/database.module'
import { enhancementTotals } from '../../database/schema'
import type { IdentityContext } from '../identity/identity.guard'
import { characterIdFor, ownedCharacterIds } from '../users/characters'
import type { EnhancementTotalBody } from './enhancement-totals.dto'

/** 전송값 그대로에 신원을 더한 것. */
export interface EnhancementTotalInput extends EnhancementTotalBody {
  /** 보낸 신원의 넥슨 계정. 메이플 ID 가 이 계정의 것이어야 적는다. */
  nexonAccountId: string
}

/**
 * 강화 합계의 사본. 같은 합계(캐릭터 · 날짜 · 분류 · 장비 이름)는 한 줄이고, 기기에서 사라지면 deleted_at 이 남는다. 이름을 바꾼
 * 캐릭터도 같은 캐릭터 줄이라 한 줄이다.
 */
@Injectable()
export class EnhancementTotalsRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  /**
   * 같은 합계면 덮어 적고 서버의 줄 id 는 그대로 둔다. 기기는 다음 받기에서 같은 합계의 줄 id 를 서버 것으로 바꾼다. 지운 줄도
   * 다시 적으면 되살아난다. 남의 메이플 ID 나 남의 캐릭터는 MapleIdNotOwned 다.
   */
  async upsert(input: EnhancementTotalInput): Promise<void> {
    const { nexonAccountId, mapleId, ocid, id, ...values } = input
    await this.db.transaction(async (tx) => {
      const characterId = await characterIdFor(tx, nexonAccountId, mapleId, ocid)
      await tx
        .insert(enhancementTotals)
        .values({ id, characterId, ...values })
        .onConflictDoUpdate({
          target: [
            enhancementTotals.characterId,
            enhancementTotals.historyDate,
            enhancementTotals.category,
            enhancementTotals.itemName,
          ],
          set: { ...values, deletedAt: null, updatedAt: sql`now()` },
        })
    })
  }

  /** 내 계정의 캐릭터 줄에 지운 시각을 적는다. 없는 줄이면 아무 일도 없다. 이미 적힌 시각은 안 덮는다. */
  async markDeleted(identity: Pick<IdentityContext, 'nexonAccountId'>, id: string): Promise<void> {
    await this.db
      .update(enhancementTotals)
      .set({
        deletedAt: sql`COALESCE(${enhancementTotals.deletedAt}, now())`,
        updatedAt: sql`now()`,
      })
      .where(
        and(
          eq(enhancementTotals.id, id),
          sql`${enhancementTotals.characterId} IN ${ownedCharacterIds(identity.nexonAccountId)}`,
        ),
      )
  }
}
