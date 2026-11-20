import { Inject, Injectable } from '@nestjs/common'
import { sql } from 'drizzle-orm'

import { DB, type Db } from '../../database/database.module'
import { enhancementAnomalies } from '../../database/schema'
import type { IdentityContext } from '../identity/identity.guard'
import type { EnhancementAnomalyBody } from './enhancement-anomalies.dto'

/** 같은 넥슨 계정의 같은 날 · API 종류 · 이유 · 장비 · 상세는 한 줄이다. 강화 내역은 넥슨 계정마다 받는다. */
const keyOf = (item: EnhancementAnomalyBody) =>
  [item.historyDate, item.apiType, item.reason, item.itemName, item.detail ?? ''].join('|')

@Injectable()
export class EnhancementAnomaliesRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  /**
   * 상황들을 덮어 적는다. 앱은 굳지 않은 날을 받을 때마다 그 날을 다시 세므로, 쌓지 않고 받은 수로 덮는다.
   * 한 문장에 같은 열쇠가 둘이면 Postgres 가 거절해, 나중 것만 남긴다.
   *
   * 한 줄의 기준이 상세를 `coalesce` 로 견주는 식 인덱스라 SQL 로 적는다. drizzle 의 충돌 대상은 칸만 받는다.
   */
  async upsert(identity: IdentityContext, items: readonly EnhancementAnomalyBody[]): Promise<void> {
    const unique = [...new Map(items.map((item) => [keyOf(item), item])).values()]
    if (unique.length === 0) return
    const rows = unique.map(
      (item) =>
        sql`(${identity.nexonAccountId}::uuid, ${item.historyDate}, ${item.apiType}::enhancement_api_type, ${item.reason}::enhancement_anomaly_reason, ${item.itemName}, ${item.rowCount}, ${item.detail ?? null})`,
    )
    await this.db.execute(sql`
      INSERT INTO ${enhancementAnomalies}
        (nexon_account_id, history_date, api_type, reason, item_name, row_count, detail)
      VALUES ${sql.join(rows, sql`, `)}
      ON CONFLICT (nexon_account_id, history_date, api_type, reason, item_name, coalesce(detail, ''))
        WHERE nexon_account_id IS NOT NULL
      DO UPDATE SET row_count = excluded.row_count, updated_at = now()`)
  }
}
