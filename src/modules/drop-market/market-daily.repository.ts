import { Inject, Injectable } from '@nestjs/common'
import { and, asc, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm'

import { DB, type Db } from '../../database/database.module'
import {
  itemGroups,
  items,
  marketDays,
  marketJudgements,
  marketResponses,
  marketRuns,
  maspiBasket,
  maspiDays,
  tradeGroups,
  worlds,
} from '../../database/schema'
import { WORLD_BOUND_TYPE } from '../items/items'
import type { DayReference, Judgement, MarketRow } from './daily-reference'
import type { MarketRange } from './market-range'

/** 시세 하나를 가르는 열쇠. 아이템 · 반지 레벨 · 범위다. */
export function marketKey(itemId: string, ringLevel: number | null, scope: string): string {
  return `${itemId}|${ringLevel ?? ''}|${scope}`
}

export function parseMarketKey(key: string): {
  itemId: string
  ringLevel: number | null
  scope: string
} {
  const [itemId, ring, scope] = key.split('|')
  return { itemId, ringLevel: ring === '' ? null : Number(ring), scope }
}

/** 하루 작업이 읽는 줄. 시세 열쇠가 붙어 있다. */
export interface DailyRow extends MarketRow {
  market: string
}

export interface StoredBasket {
  itemId: string
  ringLevel: number | null
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
   * 사람은 넥슨 계정 · 메이플 ID · 사용자 id 중 있는 것의 앞쪽이다. 만들기 어려운 신원일수록 한 사람이 여러 사람으로 보이기 어렵다.
   * 부계정은 그 계정을 등록한 로그인의 넥슨 계정으로 센다.
   */
  async rowsBetween(from: string, to: string): Promise<DailyRow[]> {
    const result = await this.db.execute<{
      item_id: string
      item_key: string
      ring_level: number | null
      scope: string
      person: string
      day: string
      price: number
    }>(sql`
      select dp.item_id, i.key as item_key, dp.ring_level,
             case when g.type = ${WORLD_BOUND_TYPE} then w.key else tg.key end as scope,
             coalesce('a:' || coalesce(sr.login_nexon_account_id, mi.nexon_account_id)::text, 'm:' || dp.maple_id, 'u:' || dp.user_id::text, 'r:' || dp.id::text) as person,
             to_char((dp.priced_at at time zone 'Asia/Seoul')::date, 'YYYY-MM-DD') as day,
             dp.price_meso::float8 as price
      from drop_prices dp
      join items i on i.id = dp.item_id
      left join item_groups g on g.id = i.group_id
      join worlds w on w.id = dp.world_id
      join trade_groups tg on tg.id = w.trade_group_id
      left join maple_ids mi on mi.hash = dp.maple_id
      left join sub_account_registrations sr on sr.sub_nexon_account_id = mi.nexon_account_id
      where dp.record_status = 'completed'
        and dp.priced_at >= (${from}::date)::timestamp at time zone 'Asia/Seoul'
        and dp.priced_at < ((${to}::date + 1)::timestamp at time zone 'Asia/Seoul')
    `)
    return result.rows.map((r) => ({
      market: marketKey(r.item_id, r.ring_level, r.scope),
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
      .select({ day: marketJudgements.day, person: marketJudgements.person })
      .from(marketJudgements)
      .where(
        and(
          eq(marketJudgements.dummy, true),
          gte(marketJudgements.day, from),
          lte(marketJudgements.day, to),
        ),
      )
    return new Set(rows.map((r) => `${r.day}|${r.person}`))
  }

  async judgementSums(from: string, to: string): Promise<Map<string, Judgement>> {
    const rows = await this.db
      .select({
        person: marketJudgements.person,
        judged: sql<number>`sum(${marketJudgements.judged})::int`,
        excluded: sql<number>`sum(${marketJudgements.excluded})::int`,
      })
      .from(marketJudgements)
      .where(and(gte(marketJudgements.day, from), lte(marketJudgements.day, to)))
      .groupBy(marketJudgements.person)
    return new Map(
      rows.map((r) => [r.person, { judged: Number(r.judged), excluded: Number(r.excluded) }]),
    )
  }

  /**
   * from ~ to 의 일일 기준가. 시세 열쇠마다 날짜 차례다.
   *
   * @param scope 주면 그 범위(거래권 · 월드)의 시세만 읽는다
   */
  async referencesBetween(
    from: string,
    to: string,
    scope?: string,
  ): Promise<Map<string, DayReference[]>> {
    const rows = await this.db
      .select()
      .from(marketDays)
      .where(
        and(
          gte(marketDays.day, from),
          lte(marketDays.day, to),
          scope === undefined ? undefined : eq(marketDays.scope, scope),
        ),
      )
      .orderBy(asc(marketDays.day))
    const out = new Map<string, DayReference[]>()
    for (const r of rows) {
      const key = marketKey(r.itemId, r.ringLevel, r.scope)
      out.set(key, [
        ...(out.get(key) ?? []),
        {
          day: r.day,
          source: r.source,
          ref: r.refMeso,
          q1: r.q1Meso,
          q3: r.q3Meso,
          low: r.fenceLow,
          high: r.fenceHigh,
          voters: r.voters,
          freshDay: r.freshDay,
        },
      ])
    }
    return out
  }

  async ranDays(): Promise<string[]> {
    const rows = await this.db
      .select({ day: marketRuns.day })
      .from(marketRuns)
      .orderBy(asc(marketRuns.day))
    return rows.map((r) => r.day)
  }

  /** 하루치를 한 번에 넣는다. 이미 끝낸 날이면 아무것도 바꾸지 않는다. 낸 날은 다시 쓰지 않는다. */
  async saveDay(
    day: string,
    references: Map<string, DayReference | null>,
    judged: Map<string, Judgement>,
    dummies: Set<string>,
  ): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const run = await tx
        .insert(marketRuns)
        .values({ day })
        .onConflictDoNothing()
        .returning({ id: marketRuns.id })
      if (run.length === 0) return false
      const refRows = [...references]
        .filter((e): e is [string, DayReference] => e[1] !== null)
        .map(([key, r]) => {
          const m = parseMarketKey(key)
          return {
            day,
            itemId: m.itemId,
            ringLevel: m.ringLevel,
            scope: m.scope,
            source: r.source,
            refMeso: r.ref,
            q1Meso: r.q1,
            q3Meso: r.q3,
            fenceLow: r.low,
            fenceHigh: r.high,
            voters: r.voters,
            freshDay: r.freshDay,
          }
        })
      for (let i = 0; i < refRows.length; i += 500)
        await tx.insert(marketDays).values(refRows.slice(i, i + 500))
      const judgeRows = [...judged].map(([person, j]) => ({
        day,
        person,
        ...j,
        dummy: dummies.has(person),
      }))
      for (let i = 0; i < judgeRows.length; i += 500)
        await tx.insert(marketJudgements).values(judgeRows.slice(i, i + 500))
      return true
    })
  }

  /** 낸 날의 범위만 갈아 끼운다. 기준가 · 울타리 · 판정은 그대로 둔다. */
  async updateRanges(day: string, ranges: Map<string, MarketRange | null>): Promise<void> {
    await this.db.transaction(async (tx) => {
      for (const [key, range] of ranges) {
        const m = parseMarketKey(key)
        await tx
          .update(marketDays)
          .set({ q1Meso: range?.q1 ?? null, q3Meso: range?.q3 ?? null })
          .where(
            and(
              eq(marketDays.day, day),
              eq(marketDays.itemId, m.itemId),
              sql`coalesce(${marketDays.ringLevel}, 0) = ${m.ringLevel ?? 0}`,
              eq(marketDays.scope, m.scope),
            ),
          )
      }
    })
  }

  async basket(): Promise<StoredBasket[]> {
    return this.db
      .select({
        itemId: maspiBasket.itemId,
        ringLevel: maspiBasket.ringLevel,
        scope: maspiBasket.scope,
        basePriceMeso: maspiBasket.basePriceMeso,
        persons: maspiBasket.persons,
        weight: maspiBasket.weight,
        entersOn: maspiBasket.entersOn,
      })
      .from(maspiBasket)
  }

  async saveBasket(rows: StoredBasket[]): Promise<void> {
    if (rows.length > 0) await this.db.insert(maspiBasket).values(rows).onConflictDoNothing()
  }

  async maspiBetween(
    from: string,
    to: string,
  ): Promise<{ day: string; value: number; change: number | null }[]> {
    return this.db
      .select({ day: maspiDays.day, value: maspiDays.value, change: maspiDays.change })
      .from(maspiDays)
      .where(and(gte(maspiDays.day, from), lte(maspiDays.day, to)))
      .orderBy(asc(maspiDays.day))
  }

  async saveMaspi(rows: { day: string; value: number; change: number | null }[]): Promise<void> {
    for (let i = 0; i < rows.length; i += 500) {
      await this.db
        .insert(maspiDays)
        .values(rows.slice(i, i + 500))
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
        .values(responses.slice(i, i + 200).map((r) => ({ day, ...r })))
        .onConflictDoUpdate({
          target: [marketResponses.day, marketResponses.key],
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
      .orderBy(desc(marketResponses.day))
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

  /** 시세 범위가 있는 월드. key 와 거래권 key 다. 거래권이 없는 월드는 시세에서 빠진다. */
  async worlds(): Promise<{ key: string; tradeGroupKey: string }[]> {
    return this.db
      .select({ key: worlds.key, tradeGroupKey: tradeGroups.key })
      .from(worlds)
      .innerJoin(tradeGroups, eq(tradeGroups.id, worlds.tradeGroupId))
      .orderBy(asc(worlds.sortOrder), asc(worlds.key))
  }
}
