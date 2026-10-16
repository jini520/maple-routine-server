import { Inject, Injectable } from '@nestjs/common'
import { and, desc, eq, isNull, sql } from 'drizzle-orm'

import { DB, type Db } from '../../database/database.module'
import { bossDifficulties, bosses, dropPrices } from '../../database/schema'
import type { IdentitySource } from '../identity/identity.guard'

export interface DropPriceInput {
  userId: string
  identifiedBy: IdentitySource
  dropRecordId: string
  itemKey: string
  priceMeso: number
  periodKey: string
  worldKey: string | null
  ringLevel: number | null
  /** 보스 난이도 줄. 표에 없는 쌍이면 null. */
  bossDifficultyId: string | null
}

/** 관리 화면이 보는 줄. 뺀 가격도 deleted_at 을 달고 그대로 보인다. 노이즈를 보는 자리라 숨기지 않는다. */
export interface DropPriceAdminRow {
  id: string
  userId: string
  identifiedBy: IdentitySource
  dropRecordId: string
  itemKey: string
  priceMeso: number
  periodKey: string
  worldKey: string | null
  ringLevel: number | null
  /** 보스 key 와 난이도. 줄이 안 가리키면 둘 다 null. */
  boss: string | null
  difficulty: string | null
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

/** 아이템 × 기간의 분포. 뺀 가격은 안 센다. */
export interface DropPriceSummary {
  itemKey: string
  periodKey: string
  count: number
  min: number
  median: number
  max: number
}

export interface DropPriceFilter {
  itemKey: string | null
  periodKey: string | null
}

/** 시세 표본. 같은 사람의 같은 기록은 한 줄이고, 뺀 가격은 deleted_at 으로 남는다. */
@Injectable()
export class DropPricesRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** 최근 것부터. 필터는 아이템 key 와 기간 key 둘이고 비우면 전부다. */
  async recent(filter: DropPriceFilter, limit: number): Promise<DropPriceAdminRow[]> {
    const rows = await this.db
      .select({
        price: dropPrices,
        boss: bosses.key,
        difficulty: bossDifficulties.difficulty,
      })
      .from(dropPrices)
      .leftJoin(bossDifficulties, eq(dropPrices.bossDifficultyId, bossDifficulties.id))
      .leftJoin(bosses, eq(bossDifficulties.bossId, bosses.id))
      .where(
        and(
          filter.itemKey === null ? undefined : eq(dropPrices.itemKey, filter.itemKey),
          filter.periodKey === null ? undefined : eq(dropPrices.periodKey, filter.periodKey),
        ),
      )
      .orderBy(desc(dropPrices.updatedAt), desc(dropPrices.id))
      .limit(limit)
    return rows.map(({ price: r, boss, difficulty }) => ({
      id: r.id,
      userId: r.userId,
      identifiedBy: r.identifiedBy,
      dropRecordId: r.dropRecordId,
      itemKey: r.itemKey,
      priceMeso: r.priceMeso,
      periodKey: r.periodKey,
      worldKey: r.worldKey,
      ringLevel: r.ringLevel,
      boss,
      difficulty,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      deletedAt: r.deletedAt?.toISOString() ?? null,
    }))
  }

  /** 아이템 × 기간마다 개수 · 최소 · 중앙값 · 최대. 최근 기간부터, 같은 기간은 개수 많은 것부터. */
  async summary(filter: DropPriceFilter): Promise<DropPriceSummary[]> {
    // bigint 집계는 문자열로 오므로 float8 로 받는다. 시세는 안전한 정수 안이다.
    const rows = await this.db
      .select({
        itemKey: dropPrices.itemKey,
        periodKey: dropPrices.periodKey,
        count: sql<number>`count(*)::int`,
        min: sql<number>`min(${dropPrices.priceMeso})::float8`,
        median: sql<number>`percentile_cont(0.5) within group (order by ${dropPrices.priceMeso})::float8`,
        max: sql<number>`max(${dropPrices.priceMeso})::float8`,
      })
      .from(dropPrices)
      .where(
        and(
          isNull(dropPrices.deletedAt),
          filter.itemKey === null ? undefined : eq(dropPrices.itemKey, filter.itemKey),
          filter.periodKey === null ? undefined : eq(dropPrices.periodKey, filter.periodKey),
        ),
      )
      .groupBy(dropPrices.itemKey, dropPrices.periodKey)
      .orderBy(desc(dropPrices.periodKey), desc(sql`count(*)`), dropPrices.itemKey)
    return rows
  }

  /** 사람과 기록 id 로 upsert 한다. 다시 적으면 값을 덮고 뺐던 가격은 되살아난다. */
  async upsert(input: DropPriceInput): Promise<void> {
    const { userId, dropRecordId, ...values } = input
    await this.db
      .insert(dropPrices)
      .values({ userId, dropRecordId, ...values })
      .onConflictDoUpdate({
        target: [dropPrices.userId, dropPrices.dropRecordId],
        set: { ...values, updatedAt: sql`now()`, deletedAt: null },
      })
  }

  /** 내 줄의 가격을 뺀다. 처음 뺀 시각은 안 덮고, 없는 줄이면 아무 일도 없다. 뺀 것도 고친 것이라 updated_at 이 움직인다. */
  async markDeleted(userId: string, dropRecordId: string): Promise<void> {
    await this.db
      .update(dropPrices)
      .set({ deletedAt: sql`COALESCE(${dropPrices.deletedAt}, now())`, updatedAt: sql`now()` })
      .where(and(eq(dropPrices.userId, userId), eq(dropPrices.dropRecordId, dropRecordId)))
  }
}
