import { Inject, Injectable } from '@nestjs/common'
import { and, inArray, sql } from 'drizzle-orm'

import { DB, type Db } from '../../database/database.module'
import { enhancementAnomalies, mapleIds } from '../../database/schema'
import type { IdentityContext } from '../identity/identity.guard'
import { ownedMapleIds } from '../users/maple-id-ownership'
import type { EnhancementAnomalyBody } from './enhancement-anomalies.dto'

/** 적을 상황 하나. 실어 온 메이플 ID 를 그 메이플 ID 가 달린 넥슨 계정으로 바꾼 것이다. */
type AccountAnomaly = Omit<EnhancementAnomalyBody, 'mapleId'> & { nexonAccountId: string }

/** 같은 넥슨 계정의 같은 날 · API 종류 · 이유 · 장비 · 상세는 한 줄이다. 강화 내역은 넥슨 계정마다 받는다. */
const keyOf = (item: AccountAnomaly) =>
  [
    item.nexonAccountId,
    item.historyDate,
    item.apiType,
    item.reason,
    item.itemName,
    item.detail ?? '',
  ].join('|')

@Injectable()
export class EnhancementAnomaliesRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  /**
   * 상황들을 그 내역을 받은 넥슨 계정의 줄에 덮어 적는다. 앱은 굳지 않은 날을 받을 때마다 그 날을 다시 세므로, 쌓지 않고 받은
   * 수로 덮는다. 한 문장에 같은 열쇠가 둘이면 Postgres 가 거절해, 나중 것만 남긴다.
   *
   * 보낸 신원이 쓸 수 없는 메이플 ID 의 상황은 그 상황만 버린다. 앱이 실패해도 다시 보내지 않는 진단 값이라, 묶음째 거절하면 같은
   * 묶음의 맞는 상황까지 사라진다.
   *
   * 한 줄의 기준이 상세를 `coalesce` 로 견주는 식 인덱스라 SQL 로 적는다. drizzle 의 충돌 대상은 칸만 받는다.
   */
  async upsert(identity: IdentityContext, items: readonly EnhancementAnomalyBody[]): Promise<void> {
    const accounts = await this.accountsOf(identity, items)
    const owned = items.flatMap(({ mapleId, ...item }) => {
      const nexonAccountId = accounts.get(mapleId)
      return nexonAccountId === undefined ? [] : [{ ...item, nexonAccountId }]
    })
    const unique = [...new Map(owned.map((item) => [keyOf(item), item])).values()]
    if (unique.length === 0) return
    const rows = unique.map(
      (item) =>
        sql`(${item.nexonAccountId}::uuid, ${item.historyDate}, ${item.apiType}::enhancement_api_type, ${item.reason}::enhancement_anomaly_reason, ${item.itemName}, ${item.rowCount}, ${item.detail ?? null})`,
    )
    await this.db.execute(sql`
      INSERT INTO ${enhancementAnomalies}
        (nexon_account_id, history_date, api_type, reason, item_name, row_count, detail)
      VALUES ${sql.join(rows, sql`, `)}
      ON CONFLICT (nexon_account_id, history_date, api_type, reason, item_name, coalesce(detail, ''))
        WHERE nexon_account_id IS NOT NULL
      DO UPDATE SET row_count = excluded.row_count, updated_at = now()`)
  }

  /**
   * 실어 온 메이플 ID 해시마다 그 메이플 ID 가 달린 넥슨 계정 줄 id. 보낸 신원이 쓸 수 있는 메이플 ID 만 든다. 기록 올리기와 같은
   * 규칙이라 로그인에 등록된 부계정의 메이플 ID 도 든다.
   */
  private async accountsOf(
    identity: IdentityContext,
    items: readonly EnhancementAnomalyBody[],
  ): Promise<Map<string, string>> {
    const hashes = [...new Set(items.map((item) => item.mapleId))]
    if (hashes.length === 0) return new Map()
    const rows = await this.db
      .select({ hash: mapleIds.hash, nexonAccountId: mapleIds.nexonAccountId })
      .from(mapleIds)
      .where(
        and(
          inArray(mapleIds.hash, hashes),
          sql`${mapleIds.hash} IN ${ownedMapleIds(identity.nexonAccountId)}`,
        ),
      )
    return new Map(rows.map((row) => [row.hash, row.nexonAccountId]))
  }
}
