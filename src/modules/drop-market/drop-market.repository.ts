import { Inject, Injectable } from '@nestjs/common'
import { and, asc, eq, gte, isNull, ne, or, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'

import { DB, type Db } from '../../database/database.module'
import {
  dropSalePrices,
  itemGroups,
  items,
  ringLevelItems,
  sameItemLinks,
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

/** 시세에 쓰는 거래 한 줄. 판매가를 적은 줄만 있다. */
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

/** 화면에 보이는 아이템. 반지는 원래 반지, 따로 둔 줄은 원래 아이템이다. 판매가 줄의 아이템과 같은 표라 별칭으로 한 번 더 붙인다. */
const shownItems = alias(items, 'shown_items')

/** 드롭 판매가 줄을 시세 범위 단위로 읽는다. 판정과 봉은 fence · candles 가 만든다. */
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
   * 범위 안에서 since 뒤에 거래된 판매가 줄. 반지는 레벨 줄이라 이름과 레벨은 원래 반지와 그 레벨로 보이고, 상자에서 나온
   * 연마석처럼 따로 둔 줄은 같은 물건 연결을 따라 원래 아이템의 시세에 든다.
   *
   * @param market 주면 그 시세 하나만 읽는다
   */
  async rows(scope: MarketScope, since: Date, market?: MarketKey): Promise<MarketRow[]> {
    const equipment = scope.kind === 'equipment'
    // bigint 는 문자열로 오므로 float8 로 받는다. 시세는 안전한 정수 안이다.
    const rows = await this.db
      .select({
        id: dropSalePrices.id,
        itemId: dropSalePrices.itemId,
        marketItemId: sql<string>`coalesce(${sameItemLinks.originalItemId}, ${dropSalePrices.itemId})`,
        itemKey: shownItems.key,
        itemName: shownItems.name,
        ringLevel: ringLevelItems.ringLevel,
        priceMeso: sql<number>`${dropSalePrices.salePriceMeso}::float8`,
        pricedAt: dropSalePrices.pricedAt,
        worldKey: worlds.key,
        worldName: worlds.name,
        person: sql<string>`coalesce('u:' || coalesce(so.owner_user_id, ${dropSalePrices.userId})::text, 'r:' || ${dropSalePrices.id}::text)`,
      })
      .from(dropSalePrices)
      .innerJoin(items, eq(dropSalePrices.itemId, items.id))
      .leftJoin(itemGroups, eq(itemGroups.id, items.groupId))
      .leftJoin(ringLevelItems, eq(ringLevelItems.itemId, dropSalePrices.itemId))
      .leftJoin(sameItemLinks, eq(sameItemLinks.itemId, dropSalePrices.itemId))
      .innerJoin(
        shownItems,
        eq(
          shownItems.id,
          sql`coalesce(${ringLevelItems.ringItemId}, ${sameItemLinks.originalItemId}, ${dropSalePrices.itemId})`,
        ),
      )
      .innerJoin(worlds, eq(dropSalePrices.worldId, worlds.id))
      .innerJoin(tradeGroups, eq(tradeGroups.id, worlds.tradeGroupId))
      .leftJoin(SUB_OWNERS, subOwnerOf(dropSalePrices.userId))
      .where(
        and(
          equipment
            ? or(isNull(itemGroups.type), ne(itemGroups.type, WORLD_BOUND_TYPE))
            : eq(itemGroups.type, WORLD_BOUND_TYPE),
          equipment ? eq(tradeGroups.key, scope.key) : eq(worlds.key, scope.key),
          gte(dropSalePrices.pricedAt, since),
          market === undefined ? undefined : eq(shownItems.key, market.itemKey),
          market === undefined
            ? undefined
            : market.ringLevel === null
              ? isNull(ringLevelItems.ringLevel)
              : eq(ringLevelItems.ringLevel, market.ringLevel),
        ),
      )
      .orderBy(asc(dropSalePrices.pricedAt), asc(dropSalePrices.id))
    return rows
  }
}
