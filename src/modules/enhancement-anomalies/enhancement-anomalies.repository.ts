import { Inject, Injectable } from '@nestjs/common'
import { sql } from 'drizzle-orm'

import { DB, type Db } from '../../database/database.module'
import { enhancementAnomalies } from '../../database/schema'
import type { IdentitySource } from '../identity/identity.guard'
import type { EnhancementAnomalyBody } from './enhancement-anomalies.dto'

/** 같은 사람의 같은 날 · 종류 · 이유 · 장비는 한 줄이다. */
const keyOf = (item: EnhancementAnomalyBody) =>
  [item.historyDate, item.enhancementType, item.anomalyType, item.itemName].join('|')

@Injectable()
export class EnhancementAnomaliesRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  /**
   * 상황들을 덮어 적는다. 앱은 굳지 않은 날을 받을 때마다 그 날을 다시 세므로, 쌓지 않고 받은 수로 덮는다.
   * 한 문장에 같은 열쇠가 둘이면 Postgres 가 거절해, 나중 것만 남긴다.
   */
  async upsert(
    userId: string,
    identifiedBy: IdentitySource,
    items: readonly EnhancementAnomalyBody[],
  ): Promise<void> {
    const unique = [...new Map(items.map((item) => [keyOf(item), item])).values()]
    await this.db
      .insert(enhancementAnomalies)
      .values(
        unique.map((item) => ({
          userId,
          identifiedBy,
          historyDate: item.historyDate,
          enhancementType: item.enhancementType,
          anomalyType: item.anomalyType,
          itemKey: item.itemKey ?? null,
          itemName: item.itemName,
          rowCount: item.rowCount,
          detail: item.detail ?? null,
        })),
      )
      .onConflictDoUpdate({
        target: [
          enhancementAnomalies.userId,
          enhancementAnomalies.historyDate,
          enhancementAnomalies.enhancementType,
          enhancementAnomalies.anomalyType,
          enhancementAnomalies.itemName,
        ],
        set: {
          identifiedBy: sql`excluded.identified_by`,
          itemKey: sql`excluded.item_key`,
          rowCount: sql`excluded.row_count`,
          detail: sql`excluded.detail`,
          updatedAt: sql`now()`,
        },
      })
  }
}
