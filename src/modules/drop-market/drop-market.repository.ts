import { Inject, Injectable } from '@nestjs/common'
import { and, asc, eq, gte, isNull, ne, or, sql } from 'drizzle-orm'

import { DB, type Db } from '../../database/database.module'
import {
  dropPrices,
  itemGroups,
  items,
  ringLevelItems,
  tradeGroups,
  worlds,
} from '../../database/schema'
import { WORLD_BOUND_TYPE } from '../items/items'
import { SUB_OWNERS, subOwnerOf } from '../users/sub-owners'

/** 장비를 서로 거래할 수 있는 월드들. 같은 거래권 줄을 가리키는 월드다. */
export interface PriceGroup {
  key: string
  /** 거래권 표의 이름. */
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
  itemId: string
  /** 시세의 아이템. 반지는 그 레벨의 아이템 줄이고, 기준가가 이 줄로 저장된다 */
  marketItemId: string
  itemKey: string
  itemName: string
  ringLevel: number | null
  priceMeso: number
  pricedAt: Date
  worldKey: string
  worldName: string
  /** 사람 줄(부계정은 등록한 로그인의 사람), 없으면 줄마다 따로. 하루 작업과 같은 값이라 더미 입력을 가린다 */
  person: string
}

/** 시세 하나. ringLevel null 은 반지가 아닌 아이템이다. */
export interface MarketKey {
  itemKey: string
  ringLevel: number | null
}

/** 드롭 가격 줄을 시세 범위 단위로 읽는다. 판정과 봉은 fence · candles 가 만든다. */
@Injectable()
export class DropMarketRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** 거래권과 월드. 월드 표의 차례이고 거래권은 든 첫 월드의 차례다. */
  async scopes(): Promise<MarketScopes> {
    const rows = await this.db
      .select({
        key: worlds.key,
        name: worlds.name,
        groupKey: tradeGroups.key,
        groupName: tradeGroups.name,
      })
      .from(worlds)
      .innerJoin(tradeGroups, eq(tradeGroups.id, worlds.tradeGroupId))
      .orderBy(asc(worlds.sortOrder), asc(worlds.key))
    const groups = new Map<string, PriceGroup>()
    for (const r of rows) {
      const group = groups.get(r.groupKey) ?? { key: r.groupKey, name: r.groupName, worlds: [] }
      group.worlds.push(r.name)
      groups.set(r.groupKey, group)
    }
    return {
      groups: [...groups.values()],
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
        itemId: dropPrices.itemId,
        marketItemId: sql<string>`coalesce(${ringLevelItems.itemId}, ${dropPrices.itemId})`,
        itemKey: items.key,
        itemName: items.name,
        ringLevel: dropPrices.ringLevel,
        priceMeso: sql<number>`${dropPrices.priceMeso}::float8`,
        pricedAt: dropPrices.pricedAt,
        worldKey: worlds.key,
        worldName: worlds.name,
        person: sql<string>`coalesce('u:' || coalesce(so.owner_user_id, ${dropPrices.userId})::text, 'r:' || ${dropPrices.id}::text)`,
      })
      .from(dropPrices)
      .innerJoin(items, eq(dropPrices.itemId, items.id))
      .leftJoin(itemGroups, eq(itemGroups.id, items.groupId))
      .innerJoin(worlds, eq(dropPrices.worldId, worlds.id))
      .innerJoin(tradeGroups, eq(tradeGroups.id, worlds.tradeGroupId))
      .leftJoin(
        ringLevelItems,
        and(
          eq(ringLevelItems.ringItemId, dropPrices.itemId),
          eq(ringLevelItems.ringLevel, dropPrices.ringLevel),
        ),
      )
      .leftJoin(SUB_OWNERS, subOwnerOf(dropPrices.userId))
      .where(
        and(
          eq(dropPrices.recordStatus, 'completed'),
          equipment
            ? or(isNull(itemGroups.type), ne(itemGroups.type, WORLD_BOUND_TYPE))
            : eq(itemGroups.type, WORLD_BOUND_TYPE),
          equipment ? eq(tradeGroups.key, scope.key) : eq(worlds.key, scope.key),
          gte(dropPrices.pricedAt, since),
          market === undefined ? undefined : eq(items.key, market.itemKey),
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
