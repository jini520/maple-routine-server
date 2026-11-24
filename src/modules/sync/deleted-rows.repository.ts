import { Inject, Injectable } from '@nestjs/common'
import { max, sql } from 'drizzle-orm'

import { DB, type Db } from '../../database/database.module'
import {
  bossDrops,
  bossProfitCalculatorRecords,
  bossProfitEntries,
  bossSplitSettings,
  cashbookEntries,
  characterWorldLeaps,
  deletedRowPurges,
  enhancementSettledDays,
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

/** 삭제 표식(`deleted_at`)이 있는 기록 표. 설정 · 하위 페이지 차례는 지우는 일이 없어 표식이 없다. */
const TABLES_WITH_DELETED_AT = [
  characterWorldLeaps,
  inventoryItems,
  cashbookEntries,
  bossProfitEntries,
  bossDrops,
  bossSplitSettings,
  enhancementTotals,
  enhancementSettledDays,
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
 * 삭제 표식이 선 줄. 다른 기기가 받아 지우도록 남겨 두고, 표식이 선 지 오래된 줄은 지운다. 지운 줄의 가장 큰 변경 번호를 지울
 * 때마다 적고, 받기는 그 값을 알려 준다. 기기는 그 값이 바뀌었을 때 번호가 그보다 작은 주인의 기록을 비우고 0 부터 다시 받는다.
 * 그 주인은 표식을 받기 전에 줄이 지워졌을 수 있다. 남은 표식은 다른 기기가 아직 받을 수 있어 세지 않는다.
 */
@Injectable()
export class DeletedRowsRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** 지금까지 지운 기록 줄의 가장 큰 변경 번호. 지운 적이 없으면 null 이다. */
  async purgedChangeSeq(tx: Tx | Db = this.db): Promise<number | null> {
    const [row] = await tx
      .select({ largest: max(deletedRowPurges.maxChangeSeq) })
      .from(deletedRowPurges)
    return row?.largest ?? null
  }

  /**
   * 표식이 cutoff 보다 앞에 선 줄을 지우고 지운 줄 수를 돌려준다. 딸린 줄은 외래키를 따라 함께 지워진다. 같은 트랜잭션에서 지운 줄의
   * 가장 큰 변경 번호를 적는다. 따로 적으면 줄은 지워졌는데 번호가 오르기 전에 받은 기기가 표식을 놓친 것을 모른다.
   */
  async purgeBefore(cutoff: Date): Promise<number> {
    return this.db.transaction(async (tx) => {
      let deleted = 0
      let largest: number | null = null
      for (const table of TABLES_WITH_DELETED_AT) {
        const result = await tx.execute<{ deleted: string; largest: string | null }>(sql`
          WITH gone AS (
            DELETE FROM ${table} WHERE ${table.deletedAt} < ${cutoff} RETURNING ${table.changeSeq} AS seq
          )
          SELECT count(*) AS deleted, max(seq) AS largest FROM gone`)
        const row = result.rows[0]
        deleted += Number(row?.deleted ?? 0)
        if (row?.largest != null) largest = Math.max(largest ?? 0, Number(row.largest))
      }
      if (largest !== null) await tx.insert(deletedRowPurges).values({ maxChangeSeq: largest })
      return deleted
    })
  }
}
