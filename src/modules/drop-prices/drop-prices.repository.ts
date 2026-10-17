import { Inject, Injectable } from '@nestjs/common'
import { and, desc, eq, isNull, or, sql } from 'drizzle-orm'

import { DB, type Db } from '../../database/database.module'
import { bossDifficulties, bosses, dropItems, dropPrices, worlds } from '../../database/schema'
import type { IdentitySource } from '../identity/identity.guard'

/** 전송값 그대로 key 를 든다. 서버가 적을 때 표에서 id 를 찾고, 모르는 key 는 NoDropItem · NoWorld 다. */
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
  /** 아이템 표의 한글 이름. 화면이 key 대신 이것을 보인다. */
  itemName: string
  priceMeso: number
  periodKey: string
  worldKey: string | null
  /** 월드 표의 한글 이름. 월드가 없는 줄은 null. */
  worldName: string | null
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
  itemName: string
  periodKey: string
  count: number
  min: number
  median: number
  max: number
}

/** itemKey 는 아이템 표의 key 또는 한글 이름 중 하나와 같으면 걸린다. 화면이 이름을 보이므로 이름으로도 거른다. */
export interface DropPriceFilter {
  itemKey: string | null
  periodKey: string | null
}

function itemMatches(value: string | null) {
  return value === null ? undefined : or(eq(dropItems.key, value), eq(dropItems.name, value))
}

/** 아이템 표에 없는 key 다. message 가 그 key 다. */
export class NoDropItem extends Error {}
/** 월드 표에 없는 key 다. message 가 그 key 다. */
export class NoWorld extends Error {}

/** 시세 표본. 같은 사람의 같은 기록은 한 줄이고, 뺀 가격은 deleted_at 으로 남는다. */
@Injectable()
export class DropPricesRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** 최근 것부터. 필터는 아이템 key 와 기간 key 둘이고 비우면 전부다. */
  async recent(filter: DropPriceFilter, limit: number): Promise<DropPriceAdminRow[]> {
    const rows = await this.db
      .select({
        price: dropPrices,
        itemKey: dropItems.key,
        itemName: dropItems.name,
        worldKey: worlds.key,
        worldName: worlds.name,
        boss: bosses.key,
        difficulty: bossDifficulties.difficulty,
      })
      .from(dropPrices)
      .innerJoin(dropItems, eq(dropPrices.itemId, dropItems.id))
      .leftJoin(worlds, eq(dropPrices.worldId, worlds.id))
      .leftJoin(bossDifficulties, eq(dropPrices.bossDifficultyId, bossDifficulties.id))
      .leftJoin(bosses, eq(bossDifficulties.bossId, bosses.id))
      .where(
        and(
          itemMatches(filter.itemKey),
          filter.periodKey === null ? undefined : eq(dropPrices.periodKey, filter.periodKey),
        ),
      )
      .orderBy(desc(dropPrices.updatedAt), desc(dropPrices.id))
      .limit(limit)
    return rows.map(({ price: r, itemKey, itemName, worldKey, worldName, boss, difficulty }) => ({
      id: r.id,
      userId: r.userId,
      identifiedBy: r.identifiedBy,
      dropRecordId: r.dropRecordId,
      itemKey,
      itemName,
      priceMeso: r.priceMeso,
      periodKey: r.periodKey,
      worldKey,
      worldName,
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
        itemKey: dropItems.key,
        itemName: dropItems.name,
        periodKey: dropPrices.periodKey,
        count: sql<number>`count(*)::int`,
        min: sql<number>`min(${dropPrices.priceMeso})::float8`,
        median: sql<number>`percentile_cont(0.5) within group (order by ${dropPrices.priceMeso})::float8`,
        max: sql<number>`max(${dropPrices.priceMeso})::float8`,
      })
      .from(dropPrices)
      .innerJoin(dropItems, eq(dropPrices.itemId, dropItems.id))
      .where(
        and(
          isNull(dropPrices.deletedAt),
          itemMatches(filter.itemKey),
          filter.periodKey === null ? undefined : eq(dropPrices.periodKey, filter.periodKey),
        ),
      )
      .groupBy(dropItems.key, dropItems.name, dropPrices.periodKey)
      .orderBy(desc(dropPrices.periodKey), desc(sql`count(*)`), dropItems.key)
    return rows
  }

  /**
   * 사람과 기록 id 로 upsert 한다. 다시 적으면 값을 덮고 뺐던 가격은 되살아난다. 아이템 · 월드는 key 로 표에서 id 를
   * 찾아 적고, 모르는 key 는 NoDropItem · NoWorld 로 거절한다. 월드가 없는(null) 줄은 그대로 받는다.
   */
  async upsert(input: DropPriceInput): Promise<void> {
    const { userId, dropRecordId, itemKey, worldKey, ...rest } = input
    const [item] = await this.db
      .select({ id: dropItems.id })
      .from(dropItems)
      .where(eq(dropItems.key, itemKey))
    if (item === undefined) throw new NoDropItem(itemKey)
    let worldId: string | null = null
    if (worldKey !== null) {
      const [world] = await this.db
        .select({ id: worlds.id })
        .from(worlds)
        .where(eq(worlds.key, worldKey))
      if (world === undefined) throw new NoWorld(worldKey)
      worldId = world.id
    }
    const values = { ...rest, itemId: item.id, worldId }
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
