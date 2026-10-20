import { Inject, Injectable } from '@nestjs/common'
import { and, asc, eq, gte, isNotNull, isNull, sql } from 'drizzle-orm'

import { DB, type Db } from '../../database/database.module'
import { dropItems, dropPrices, worlds } from '../../database/schema'

/** 장비를 서로 거래할 수 있는 월드들. worlds.price_group 이 같은 월드다. */
export interface PriceGroup {
  key: string
  /** general 은 일반 월드, 아니면 든 월드 이름을 잇는다. */
  name: string
  /** 든 월드 이름. 월드 표의 차례다. */
  worlds: string[]
}

/** 고를 수 있는 범위. 장비는 거래권, 소비는 월드다. 거래권이 없는 월드는 양쪽 다 빠진다. */
export interface MarketScopes {
  groups: PriceGroup[]
  worlds: { key: string; name: string }[]
}

/** 시세 하나를 세는 범위. 장비는 거래권 key, 소비는 월드 key 다. 월드끼리 거래할 수 없는 소비 아이템은 값이 월드마다 다르다. */
export interface MarketScope {
  kind: 'equipment' | 'consumable'
  key: string
}

/** 시세에 쓰는 거래 한 줄. completed 만 온다. */
export interface MarketRow {
  id: string
  itemKey: string
  itemName: string
  ringLevel: number | null
  priceMeso: number
  pricedAt: Date
  worldKey: string
  worldName: string
}

/** 시세 하나. ringLevel null 은 반지가 아닌 아이템이다. */
export interface MarketKey {
  itemKey: string
  ringLevel: number | null
}

const GENERAL_NAME = '일반 월드'

/** 드롭 가격 줄을 시세 범위 단위로 읽는다. 판정과 봉은 fence · candles 가 만든다. */
@Injectable()
export class DropMarketRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** 거래권과 월드. 월드 표의 차례이고 거래권은 든 첫 월드의 차례다. */
  async scopes(): Promise<MarketScopes> {
    const rows = await this.db
      .select({ key: worlds.key, name: worlds.name, priceGroup: worlds.priceGroup })
      .from(worlds)
      .where(isNotNull(worlds.priceGroup))
      .orderBy(asc(worlds.sortOrder), asc(worlds.key))
    const groups = new Map<string, PriceGroup>()
    for (const r of rows) {
      const key = r.priceGroup as string
      const group = groups.get(key) ?? { key, name: '', worlds: [] }
      group.worlds.push(r.name)
      groups.set(key, group)
    }
    return {
      groups: [...groups.values()].map((g) => ({
        ...g,
        name: g.key === 'general' ? GENERAL_NAME : g.worlds.join(' · '),
      })),
      worlds: rows.map((r) => ({ key: r.key, name: r.name })),
    }
  }

  /**
   * 범위 안에서 since 뒤에 거래된 completed 줄. 월드를 모르는 줄은 어느 범위에도 없다. 에오스 기록일 수도 있어서다.
   *
   * @param market 주면 그 시세 하나만 읽는다
   */
  async rows(scope: MarketScope, since: Date, market?: MarketKey): Promise<MarketRow[]> {
    const equipment = scope.kind === 'equipment'
    // bigint 는 문자열로 오므로 float8 로 받는다. 시세는 안전한 정수 안이다.
    const rows = await this.db
      .select({
        id: dropPrices.id,
        itemKey: dropItems.key,
        itemName: dropItems.name,
        ringLevel: dropPrices.ringLevel,
        priceMeso: sql<number>`${dropPrices.priceMeso}::float8`,
        pricedAt: dropPrices.pricedAt,
        worldKey: worlds.key,
        worldName: worlds.name,
      })
      .from(dropPrices)
      .innerJoin(dropItems, eq(dropPrices.itemId, dropItems.id))
      .innerJoin(worlds, eq(dropPrices.worldId, worlds.id))
      .where(
        and(
          eq(dropPrices.recordStatus, 'completed'),
          eq(dropItems.worldBound, !equipment),
          isNotNull(worlds.priceGroup),
          equipment ? eq(worlds.priceGroup, scope.key) : eq(worlds.key, scope.key),
          gte(dropPrices.pricedAt, since),
          market === undefined ? undefined : eq(dropItems.key, market.itemKey),
          market === undefined
            ? undefined
            : market.ringLevel === null
              ? isNull(dropPrices.ringLevel)
              : eq(dropPrices.ringLevel, market.ringLevel),
        ),
      )
      .orderBy(asc(dropPrices.pricedAt), asc(dropPrices.id))
    // completed 줄은 표의 CHECK 가 priced_at 을 채운다.
    return rows.map((r) => ({ ...r, pricedAt: r.pricedAt as Date }))
  }
}
