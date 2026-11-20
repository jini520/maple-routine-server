import { Inject, Injectable } from '@nestjs/common'
import { and, eq, sql } from 'drizzle-orm'

import { isUniqueViolation } from '../../common/pg-errors'
import { DB, type Db } from '../../database/database.module'
import { bossDifficulties, bossProfitEntries } from '../../database/schema'
import type { IdentityContext } from '../identity/identity.guard'
import { characterIdFor, ownedCharacterIds } from '../users/characters'
import type { BossClearBody } from './boss-clears.dto'

/** 전송값 그대로에 신원을 더한 것. */
export interface BossClearInput extends BossClearBody {
  /** 보낸 신원의 넥슨 계정. 메이플 ID 가 이 계정의 것이어야 적는다. */
  nexonAccountId: string
}

/** 난이도 표에 없는 줄 id 다. message 가 그 id 다. */
export class NoBossDifficulty extends Error {}
/** 기간 값의 첫 글자가 난이도의 주기와 다르다. message 가 그 기간 값이다. */
export class PeriodCycleMismatch extends Error {}

/** 같은 수익 건이 다른 줄 id 로 이미 있다는 유일 기준 둘. 먼저 도착한 줄이 남는다. */
const SAME_ENTRY = [
  'boss_profit_entries_character_difficulty_period_unique',
  'boss_profit_entries_cleared_character_boss_period_unique',
]

/**
 * 보스 수익 건의 사본. 줄 id 는 기기의 기간 행 id 다. 한 캐릭터의 한 기간 · 난이도는 한 줄이고, 처치한 줄은 한 기간 · 보스도 한
 * 줄이다. 기기에서 사라지면 deleted_at 이 남는다.
 */
@Injectable()
export class BossClearsRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  /**
   * 줄 id 로 덮어 적는다. 지운 줄도 다시 적으면 되살아난다. 같은 수익 건이 다른 줄 id 로 이미 있으면 적지 않는다. 남의 줄은 같은
   * id 로 보내도 덮지 않는다. 모르는 난이도는 NoBossDifficulty, 주기가 다른 기간은 PeriodCycleMismatch, 남의 메이플 ID 나
   * 캐릭터는 MapleIdNotOwned 다.
   */
  async upsert(input: BossClearInput): Promise<void> {
    const { nexonAccountId, mapleId, ocid, id, ...values } = input
    try {
      await this.db.transaction(async (tx) => {
        const characterId = await characterIdFor(tx, nexonAccountId, mapleId, ocid)
        const [difficulty] = await tx
          .select({ bossId: bossDifficulties.bossId, cycle: bossDifficulties.cycle })
          .from(bossDifficulties)
          .where(eq(bossDifficulties.id, values.bossDifficultyId))
        if (difficulty === undefined) throw new NoBossDifficulty(values.bossDifficultyId)
        if (values.periodCode[0] !== (difficulty.cycle === 'weekly' ? 'W' : 'M'))
          throw new PeriodCycleMismatch(values.periodCode)
        const row = { ...values, characterId, bossId: difficulty.bossId }
        await tx
          .insert(bossProfitEntries)
          .values({ id, ...row })
          .onConflictDoUpdate({
            target: bossProfitEntries.id,
            set: { ...row, deletedAt: null, updatedAt: sql`now()` },
            setWhere: sql`${bossProfitEntries.characterId} IN ${ownedCharacterIds(nexonAccountId)}`,
          })
      })
    } catch (error) {
      if (SAME_ENTRY.some((name) => isUniqueViolation(error, name))) return
      throw error
    }
  }

  /** 내 계정의 캐릭터 줄에 지운 시각을 적는다. 없는 줄이면 아무 일도 없다. 이미 적힌 시각은 안 덮는다. */
  async markDeleted(identity: Pick<IdentityContext, 'nexonAccountId'>, id: string): Promise<void> {
    await this.db
      .update(bossProfitEntries)
      .set({
        deletedAt: sql`COALESCE(${bossProfitEntries.deletedAt}, now())`,
        updatedAt: sql`now()`,
      })
      .where(
        and(
          eq(bossProfitEntries.id, id),
          sql`${bossProfitEntries.characterId} IN ${ownedCharacterIds(identity.nexonAccountId)}`,
        ),
      )
  }
}
