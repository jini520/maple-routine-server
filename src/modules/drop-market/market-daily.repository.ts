import { Inject, Injectable } from '@nestjs/common'
import { and, asc, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm'

import { DB, type Db } from '../../database/database.module'
import {
  itemGroups,
  items,
  marketJudgements,
  marketPublishedDays,
  marketReferencePrices,
  marketResponses,
  maspiBasketItems,
  maspiDailyCloses,
  tradeGroups,
  worlds,
} from '../../database/schema'
import { WORLD_BOUND_TYPE } from '../items/items'
import { SUB_OWNERS } from '../users/sub-owners'
import type { DayReference, Judgement, MarketRow } from './daily-reference'
import type { MarketRange } from './market-range'

/** 시세 하나를 가르는 열쇠. 아이템 · 범위 key 다. 반지는 레벨마다 아이템 줄이 따로 있어 레벨 조각이 없다. */
export function marketKey(itemId: string, scope: string): string {
  return `${itemId}|${scope}`
}

export function parseMarketKey(key: string): { itemId: string; scope: string } {
  const [itemId, scope] = key.split('|')
  return { itemId, scope }
}

/** 계산이 쓰는 사람 열쇠. 사람 줄이 없는 익명 줄은 줄마다 따로 센다(`r:`). 판정은 사람 줄이 있는 사람만 남긴다. */
export function personOfUser(userId: string): string {
  return `u:${userId}`
}

function userOfPerson(person: string): string | null {
  return person.startsWith('u:') ? person.slice(2) : null
}

/** 범위 key 는 거래권 key 나 월드 key 다. 둘은 겹치지 않는다. 저장할 때는 종류와 줄 id 로 적는다. */
type ScopeType = (typeof marketReferencePrices.$inferSelect)['scopeType']

/** 범위 key 를 저장할 줄 id 로 바꾸지 못했다. message 가 그 key 다. */
export class UnknownMarketScope extends Error {}

interface Scopes {
  rowOf(scope: string): { scopeType: ScopeType; scopeId: string }
  keyOf(scopeType: ScopeType, scopeId: string): string
}

/** 하루 작업이 읽는 줄. 시세 열쇠가 붙어 있다. */
export interface DailyRow extends MarketRow {
  market: string
}

export interface StoredBasket {
  itemId: string
  scope: string
  basePriceMeso: number
  persons: number
  weight: number
  entersOn: string | null
}

/** 일일 기준가 · MASPI · 앱 응답을 저장하고 읽는다. 계산은 daily-reference · market-index · market-view 가 한다. */
@Injectable()
export class MarketDailyRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  /**
   * from ~ to(KST 날짜, 둘 다 포함)에 거래된 completed 줄. 거래권이 없는 월드와 월드를 모르는 줄은 어느 시세에도 넣지 않는다.
   * 반지는 그 레벨의 아이템 줄로 센다. 사람은 사람 줄이고, 부계정의 사람은 그 계정을 등록한 로그인의 사람으로 센다.
   */
  async rowsBetween(from: string, to: string): Promise<DailyRow[]> {
    const result = await this.db.execute<{
      item_id: string
      scope: string
      person: string
      day: string
      price: number
    }>(sql`
      select coalesce(rl.item_id, dp.item_id) as item_id,
             case when g.type = ${WORLD_BOUND_TYPE} then w.key else tg.key end as scope,
             coalesce('u:' || coalesce(so.owner_user_id, dp.user_id)::text, 'r:' || dp.id::text) as person,
             to_char((dp.priced_at at time zone 'Asia/Seoul')::date, 'YYYY-MM-DD') as day,
             dp.price_meso::float8 as price
      from drop_prices dp
      join items i on i.id = dp.item_id
      left join item_groups g on g.id = i.group_id
      left join ring_level_items rl on rl.ring_item_id = dp.item_id and rl.ring_level = dp.ring_level
      join worlds w on w.id = dp.world_id
      join trade_groups tg on tg.id = w.trade_group_id
      left join ${SUB_OWNERS} on so.sub_user_id = dp.user_id
      where dp.record_status = 'completed'
        and dp.priced_at >= (${from}::date)::timestamp at time zone 'Asia/Seoul'
        and dp.priced_at < ((${to}::date + 1)::timestamp at time zone 'Asia/Seoul')
    `)
    return result.rows.map((r) => ({
      market: marketKey(r.item_id, r.scope),
      item: r.item_id,
      person: r.person,
      day: r.day,
      priceMeso: Number(r.price),
    }))
  }

  /** 줄이 처음 거래된 KST 날짜. 줄이 없으면 null */
  async firstDay(): Promise<string | null> {
    const result = await this.db.execute<{ day: string | null }>(sql`
      select to_char(min((priced_at at time zone 'Asia/Seoul')::date), 'YYYY-MM-DD') as day
      from drop_prices where record_status = 'completed'
    `)
    return result.rows[0]?.day ?? null
  }

  async dummyDays(from: string, to: string): Promise<Set<string>> {
    const rows = await this.db
      .select({ date: marketJudgements.date, userId: marketJudgements.userId })
      .from(marketJudgements)
      .where(
        and(
          eq(marketJudgements.isDummy, true),
          gte(marketJudgements.date, from),
          lte(marketJudgements.date, to),
        ),
      )
    return new Set(rows.map((r) => `${r.date}|${personOfUser(r.userId)}`))
  }

  async judgementSums(from: string, to: string): Promise<Map<string, Judgement>> {
    const rows = await this.db
      .select({
        userId: marketJudgements.userId,
        judged: sql<number>`sum(${marketJudgements.judgedCount})::int`,
        excluded: sql<number>`sum(${marketJudgements.excludedCount})::int`,
      })
      .from(marketJudgements)
      .where(and(gte(marketJudgements.date, from), lte(marketJudgements.date, to)))
      .groupBy(marketJudgements.userId)
    return new Map(
      rows.map((r) => [
        personOfUser(r.userId),
        { judged: Number(r.judged), excluded: Number(r.excluded) },
      ]),
    )
  }

  /**
   * from ~ to 의 일일 기준가. 시세 열쇠마다 날짜 차례다.
   *
   * @param scope 주면 그 범위(거래권 · 월드 key)의 시세만 읽는다
   */
  async referencesBetween(
    from: string,
    to: string,
    scope?: string,
  ): Promise<Map<string, DayReference[]>> {
    const scopes = await this.scopes()
    const only = scope === undefined ? undefined : scopes.rowOf(scope)
    const rows = await this.db
      .select()
      .from(marketReferencePrices)
      .where(
        and(
          gte(marketReferencePrices.date, from),
          lte(marketReferencePrices.date, to),
          only === undefined
            ? undefined
            : and(
                eq(marketReferencePrices.scopeType, only.scopeType),
                eq(marketReferencePrices.scopeId, only.scopeId),
              ),
        ),
      )
      .orderBy(asc(marketReferencePrices.date))
    const out = new Map<string, DayReference[]>()
    for (const r of rows) {
      const key = marketKey(r.itemId, scopes.keyOf(r.scopeType, r.scopeId))
      out.set(key, [
        ...(out.get(key) ?? []),
        {
          day: r.date,
          source: r.source,
          ref: r.referencePriceMeso,
          q1: r.rangeLowMeso,
          q3: r.rangeHighMeso,
          low: r.fenceLowMeso,
          high: r.fenceHighMeso,
          freshDay: r.freshDate,
        },
      ])
    }
    return out
  }

  async ranDays(): Promise<string[]> {
    const rows = await this.db
      .select({ date: marketPublishedDays.date })
      .from(marketPublishedDays)
      .orderBy(asc(marketPublishedDays.date))
    return rows.map((r) => r.date)
  }

  /**
   * 하루치를 한 번에 넣는다. 이미 끝낸 날이면 아무것도 바꾸지 않는다. 낸 날은 다시 쓰지 않는다. 판정은 사람 줄이 있는 사람만
   * 남긴다. 익명 줄은 다음 날 신뢰도를 물려받을 사람이 없다.
   */
  async saveDay(
    day: string,
    references: Map<string, DayReference | null>,
    judged: Map<string, Judgement>,
    dummies: Set<string>,
  ): Promise<boolean> {
    const scopes = await this.scopes()
    return this.db.transaction(async (tx) => {
      const run = await tx
        .insert(marketPublishedDays)
        .values({ date: day })
        .onConflictDoNothing()
        .returning({ id: marketPublishedDays.id })
      if (run.length === 0) return false
      const refRows = [...references]
        .filter((e): e is [string, DayReference] => e[1] !== null)
        .map(([key, r]) => {
          const m = parseMarketKey(key)
          return {
            date: day,
            itemId: m.itemId,
            ...scopes.rowOf(m.scope),
            source: r.source,
            referencePriceMeso: r.ref,
            rangeLowMeso: r.q1,
            rangeHighMeso: r.q3,
            fenceLowMeso: r.low,
            fenceHighMeso: r.high,
            freshDate: r.freshDay,
          }
        })
      for (let i = 0; i < refRows.length; i += 500)
        await tx.insert(marketReferencePrices).values(refRows.slice(i, i + 500))
      const judgeRows = [...judged].flatMap(([person, j]) => {
        const userId = userOfPerson(person)
        return userId === null
          ? []
          : [
              {
                date: day,
                userId,
                judgedCount: j.judged,
                excludedCount: j.excluded,
                isDummy: dummies.has(person),
              },
            ]
      })
      for (let i = 0; i < judgeRows.length; i += 500)
        await tx.insert(marketJudgements).values(judgeRows.slice(i, i + 500))
      return true
    })
  }

  /** 낸 날의 범위만 갈아 끼운다. 기준가 · 울타리 · 판정은 그대로 둔다. */
  async updateRanges(day: string, ranges: Map<string, MarketRange | null>): Promise<void> {
    const scopes = await this.scopes()
    await this.db.transaction(async (tx) => {
      for (const [key, range] of ranges) {
        const m = parseMarketKey(key)
        const scope = scopes.rowOf(m.scope)
        await tx
          .update(marketReferencePrices)
          .set({ rangeLowMeso: range?.q1 ?? null, rangeHighMeso: range?.q3 ?? null })
          .where(
            and(
              eq(marketReferencePrices.date, day),
              eq(marketReferencePrices.itemId, m.itemId),
              eq(marketReferencePrices.scopeType, scope.scopeType),
              eq(marketReferencePrices.scopeId, scope.scopeId),
            ),
          )
      }
    })
  }

  async basket(): Promise<StoredBasket[]> {
    const scopes = await this.scopes()
    const rows = await this.db.select().from(maspiBasketItems)
    return rows.map((r) => ({
      itemId: r.itemId,
      scope: scopes.keyOf(r.scopeType, r.scopeId),
      basePriceMeso: r.basePriceMeso,
      persons: r.voterCount,
      weight: r.indexWeight,
      entersOn: r.fromDate,
    }))
  }

  async saveBasket(rows: StoredBasket[]): Promise<void> {
    if (rows.length === 0) return
    const scopes = await this.scopes()
    await this.db
      .insert(maspiBasketItems)
      .values(
        rows.map((r) => ({
          itemId: r.itemId,
          ...scopes.rowOf(r.scope),
          basePriceMeso: Math.round(r.basePriceMeso),
          voterCount: r.persons,
          indexWeight: r.weight,
          fromDate: r.entersOn,
        })),
      )
      .onConflictDoNothing()
  }

  async maspiBetween(from: string, to: string): Promise<{ day: string; close: number }[]> {
    return this.db
      .select({ day: maspiDailyCloses.date, close: maspiDailyCloses.close })
      .from(maspiDailyCloses)
      .where(and(gte(maspiDailyCloses.date, from), lte(maspiDailyCloses.date, to)))
      .orderBy(asc(maspiDailyCloses.date))
  }

  async saveMaspi(rows: { day: string; close: number }[]): Promise<void> {
    for (let i = 0; i < rows.length; i += 500) {
      await this.db
        .insert(maspiDailyCloses)
        .values(rows.slice(i, i + 500).map((r) => ({ date: r.day, close: r.close })))
        .onConflictDoNothing()
    }
  }

  /** 그날 응답을 넣는다. 같은 날 같은 열쇠가 있으면 새 몸으로 바꾼다. 범위를 다시 계산하면 그날 응답도 다시 만든다. */
  async saveResponses(
    day: string,
    responses: { key: string; body: string; etag: string }[],
  ): Promise<void> {
    for (let i = 0; i < responses.length; i += 200) {
      await this.db
        .insert(marketResponses)
        .values(responses.slice(i, i + 200).map((r) => ({ date: day, ...r })))
        .onConflictDoUpdate({
          target: [marketResponses.date, marketResponses.key],
          set: { body: sql`excluded.body`, etag: sql`excluded.etag` },
        })
    }
  }

  /** 열쇠의 가장 최근 응답 */
  async latestResponse(key: string): Promise<{ body: string; etag: string } | null> {
    const [row] = await this.db
      .select({ body: marketResponses.body, etag: marketResponses.etag })
      .from(marketResponses)
      .where(eq(marketResponses.key, key))
      .orderBy(desc(marketResponses.date))
      .limit(1)
    return row ?? null
  }

  /** 아이템 id → key · 월드마다 재는지 · 이름. 월드마다 재는지는 아이템이 든 묶음의 종류로 안다. */
  async itemsById(
    ids: string[],
  ): Promise<Map<string, { key: string; worldBound: boolean; name: string }>> {
    if (ids.length === 0) return new Map()
    const rows = await this.db
      .select({ id: items.id, key: items.key, type: itemGroups.type, name: items.name })
      .from(items)
      .leftJoin(itemGroups, eq(itemGroups.id, items.groupId))
      .where(inArray(items.id, ids))
    return new Map(
      rows.map((r) => [
        r.id,
        { key: r.key, worldBound: r.type === WORLD_BOUND_TYPE, name: r.name },
      ]),
    )
  }

  async itemByKey(key: string): Promise<{ id: string; worldBound: boolean } | null> {
    const [row] = await this.db
      .select({ id: items.id, type: itemGroups.type })
      .from(items)
      .leftJoin(itemGroups, eq(itemGroups.id, items.groupId))
      .where(eq(items.key, key))
      .limit(1)
    return row === undefined ? null : { id: row.id, worldBound: row.type === WORLD_BOUND_TYPE }
  }

  /** 범위 key 와 저장할 종류 · 줄 id 를 오가는 표. 거래권과 월드는 줄이 적어 부를 때마다 읽는다. */
  private async scopes(): Promise<Scopes> {
    const [groups, worldRows] = await Promise.all([
      this.db.select({ id: tradeGroups.id, key: tradeGroups.key }).from(tradeGroups),
      this.db.select({ id: worlds.id, key: worlds.key }).from(worlds),
    ])
    const byKey = new Map<string, { scopeType: ScopeType; scopeId: string }>([
      ...groups.map((g) => [g.key, { scopeType: 'trade_group' as const, scopeId: g.id }] as const),
      ...worldRows.map((w) => [w.key, { scopeType: 'world' as const, scopeId: w.id }] as const),
    ])
    const byId = new Map<string, string>([
      ...groups.map((g) => [`trade_group|${g.id}`, g.key] as const),
      ...worldRows.map((w) => [`world|${w.id}`, w.key] as const),
    ])
    return {
      rowOf(scope) {
        const row = byKey.get(scope)
        if (row === undefined) throw new UnknownMarketScope(scope)
        return row
      },
      keyOf(scopeType, scopeId) {
        const key = byId.get(`${scopeType}|${scopeId}`)
        if (key === undefined) throw new UnknownMarketScope(`${scopeType}|${scopeId}`)
        return key
      },
    }
  }

  /** 시세 범위가 있는 월드. key 와 거래권 key 다. 거래권이 없는 월드는 시세에서 빠진다. */
  async worlds(): Promise<{ key: string; tradeGroupKey: string }[]> {
    return this.db
      .select({ key: worlds.key, tradeGroupKey: tradeGroups.key })
      .from(worlds)
      .innerJoin(tradeGroups, eq(tradeGroups.id, worlds.tradeGroupId))
      .orderBy(asc(worlds.sortOrder), asc(worlds.key))
  }
}
