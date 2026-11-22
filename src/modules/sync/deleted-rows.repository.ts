import { Inject, Injectable } from '@nestjs/common'
import { lt, sql } from 'drizzle-orm'

import { DB, type Db } from '../../database/database.module'
import {
  bossDrops,
  bossProfitCalculatorRecords,
  bossProfitEntries,
  bossSplitSettings,
  cashbookEntries,
  characterWorldLeaps,
  enhancementTotals,
  inventoryItems,
  manualTrackedItems,
  mapleIdNames,
  mvpGradeHistory,
  partyAppointments,
  rememberedLevels,
  representativeCharacterMotions,
  sharedContentProgress,
  trackedCharacters,
} from '../../database/schema'
import type { Tx } from '../users/nexon-account-store'

/** 삭제 표식(`deleted_at`)이 있는 기록 표. 설정 · 하위 페이지 차례 · 굳은 날은 지우는 일이 없어 표식이 없다. */
const TABLES_WITH_DELETED_AT = [
  characterWorldLeaps,
  inventoryItems,
  cashbookEntries,
  bossProfitEntries,
  bossDrops,
  bossSplitSettings,
  enhancementTotals,
  rememberedLevels,
  mvpGradeHistory,
  manualTrackedItems,
  sharedContentProgress,
  mapleIdNames,
  trackedCharacters,
  representativeCharacterMotions,
  partyAppointments,
  bossProfitCalculatorRecords,
] as const

/**
 * 삭제 표식이 선 줄. 다른 기기가 받아 지우도록 남겨 두고, 표식이 선 지 오래된 줄은 지운다. 받기는 남아 있는 표식 가운데 가장
 * 작은 변경 번호를 알려 준다. 그보다 작은 번호를 기억한 기기는 지운 줄의 표식을 놓쳤을 수 있어 그 주인의 기록을 비우고 0 부터
 * 다시 받는다.
 */
@Injectable()
export class DeletedRowsRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** 서버 전체에 남아 있는 삭제 표식 가운데 가장 작은 변경 번호. 표식이 없으면 null 이다. */
  async oldestDeletedChangeSeq(tx: Tx | Db = this.db): Promise<number | null> {
    const parts = TABLES_WITH_DELETED_AT.map(
      (table) =>
        sql`(SELECT min(${table.changeSeq}) FROM ${table} WHERE ${table.deletedAt} IS NOT NULL)`,
    )
    const result = await tx.execute<{ oldest: string | null }>(
      sql`SELECT LEAST(${sql.join(parts, sql`, `)}) AS oldest`,
    )
    const oldest = result.rows[0]?.oldest ?? null
    return oldest === null ? null : Number(oldest)
  }

  /** 표식이 cutoff 보다 앞에 선 줄을 지우고 지운 줄 수를 돌려준다. 딸린 줄은 외래키를 따라 함께 지워진다. */
  async purgeBefore(cutoff: Date): Promise<number> {
    return this.db.transaction(async (tx) => {
      let deleted = 0
      for (const table of TABLES_WITH_DELETED_AT) {
        const result = await tx.delete(table).where(lt(table.deletedAt, cutoff))
        deleted += result.rowCount ?? 0
      }
      return deleted
    })
  }
}
