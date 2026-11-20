import { Inject, Injectable } from '@nestjs/common'
import { type SQL, sql } from 'drizzle-orm'

import { DB, type Db } from '../../database/database.module'

/** 신원 종류. 판매가 줄에는 없고 사람에게 로그인한 넥슨 계정 줄이 있는지로 가른다. 계정을 삭제한 사람의 줄은 null 이다. */
export type DropPriceIdentity = 'login' | 'key'

/**
 * 획득처. 드롭 기록이 있으면 수익 건의 난이도가 주는 상자 가운데 그 아이템이 든 상자, 없으면 보스가 직접 떨군 드롭이다. 드롭
 * 기록이 없는 줄은 1.0.14 까지의 앱이 판매가 표에 바로 올린 옛 줄이라 모른다.
 */
export type DropSource = 'box' | 'direct' | 'unknown'

/** 관리 화면이 보는 줄. 판매가를 적은 드롭만 있다. 보스 · 난이도 · 기간은 드롭 기록에서 읽어 옛 줄은 비어 있다. */
export interface DropPriceAdminRow {
  id: string
  /** 계정을 삭제한 사람의 줄은 null 이다. */
  userId: string | null
  identity: DropPriceIdentity | null
  itemKey: string
  /** 아이템 표의 한글 이름. 화면이 key 대신 이것을 보인다. */
  itemName: string
  priceMeso: number
  /** 주간 `W202647` · 월간 `M202611` */
  periodCode: string | null
  /** 월드를 모르는 옛 줄은 null 이다. */
  worldKey: string | null
  worldName: string | null
  boss: string | null
  bossName: string | null
  difficulty: string | null
  source: DropSource
  /** 상자에서 나온 줄의 상자 아이템 key 와 한글 이름. 아니면 둘 다 null. */
  boxKey: string | null
  boxName: string | null
  pricedAt: string
  updatedAt: string
}

/** 관리 화면의 아이템 목록 한 줄 */
export interface DropPriceItemSummary {
  itemKey: string
  itemName: string
  count: number
  min: number
  median: number
  max: number
}

/** 가격 분포 점그림의 점 하나 */
export interface DropPricePoint {
  priceMeso: number
  source: DropSource
  boxName: string | null
}

/**
 * itemKey 는 아이템 표의 key 또는 한글 이름 중 하나와 같으면 걸린다. 화면이 이름을 보이므로 이름으로도 거른다.
 * source 는 all · box · direct · unknown, 또는 상자 하나의 아이템 key 다.
 */
export interface DropPriceFilter {
  itemKey: string | null
  periodCode: string | null
  source: string
}

/**
 * 판매가 줄에 아이템 · 월드 · 드롭 기록 · 수익 건 · 보스 · 상자를 붙인 줄. 반지는 레벨 줄이라 상자의 내용물(원래 반지)과 견줄 때
 * 레벨 줄의 원래 반지로 바꾼다. 같은 난이도의 같은 보스는 종류가 다른 반지 상자를 둘 주지 않아 상자는 하나다.
 */
const ROWS = sql`
  select sp.id, sp.user_id, sp.sale_price_meso::float8 as price, sp.priced_at, sp.updated_at,
         i.key as item_key, i.name as item_name, w.key as world_key, w.name as world_name,
         pe.period_code, b.key as boss, b.name as boss_name, d.difficulty,
         box.key as box_key, box.name as box_name,
         case when bd.id is null then 'unknown' when box.key is not null then 'box' else 'direct' end as source
    from drop_sale_prices sp
    join items i on i.id = sp.item_id
    left join worlds w on w.id = sp.world_id
    left join boss_drops bd on bd.id = sp.id
    left join boss_profit_entries pe on pe.id = bd.profit_entry_id
    left join boss_difficulties d on d.id = pe.boss_difficulty_id
    left join bosses b on b.id = d.boss_id
    left join lateral (
      select bi.key, bi.name
        from boss_difficulty_rewards r
        join drop_boxes db on db.item_id = r.item_id
        join drop_box_contents c on c.box_id = db.id
        join items bi on bi.id = db.item_id
        left join ring_level_items rl on rl.item_id = bd.item_id
       where r.boss_difficulty_id = pe.boss_difficulty_id
         and c.item_id = coalesce(rl.ring_item_id, bd.item_id)
       limit 1) box on true`

function where(filter: DropPriceFilter): SQL {
  const parts: SQL[] = [sql`true`]
  if (filter.itemKey !== null)
    parts.push(sql`(x.item_key = ${filter.itemKey} or x.item_name = ${filter.itemKey})`)
  if (filter.periodCode !== null) parts.push(sql`x.period_code = ${filter.periodCode}`)
  if (filter.source === 'box' || filter.source === 'direct' || filter.source === 'unknown')
    parts.push(sql`x.source = ${filter.source}`)
  else if (filter.source !== 'all') parts.push(sql`x.box_key = ${filter.source}`)
  return sql.join(parts, sql` and `)
}

type Row = {
  id: string
  user_id: string | null
  price: number
  priced_at: Date
  updated_at: Date
  item_key: string
  item_name: string
  world_key: string | null
  world_name: string | null
  period_code: string | null
  boss: string | null
  boss_name: string | null
  difficulty: string | null
  box_key: string | null
  box_name: string | null
  source: DropSource
  identity: DropPriceIdentity | null
}

/** 관리 화면의 드롭 판매가 조회. 줄은 서버가 드롭 기록을 받을 때 적는다. */
@Injectable()
export class DropPricesRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** 최근에 고친 것부터. offset 만큼 건너뛰어 화면의 더 보기를 잇는다. */
  async recent(filter: DropPriceFilter, limit: number, offset = 0): Promise<DropPriceAdminRow[]> {
    const result = await this.db.execute<Row>(sql`
      select x.*,
             case when x.user_id is null then null
                  when exists (select 1 from nexon_accounts a where a.user_id = x.user_id and a.uid_hash is not null)
                  then 'login' else 'key' end as identity
        from (${ROWS}) x
       where ${where(filter)}
       order by x.updated_at desc, x.id desc
       limit ${limit} offset ${offset}`)
    return result.rows.map((r) => ({
      id: r.id,
      userId: r.user_id,
      identity: r.identity,
      itemKey: r.item_key,
      itemName: r.item_name,
      priceMeso: Number(r.price),
      periodCode: r.period_code,
      worldKey: r.world_key,
      worldName: r.world_name,
      boss: r.boss,
      bossName: r.boss_name,
      difficulty: r.difficulty,
      source: r.source,
      boxKey: r.box_key,
      boxName: r.box_name,
      pricedAt: new Date(r.priced_at).toISOString(),
      updatedAt: new Date(r.updated_at).toISOString(),
    }))
  }

  /** 아이템마다 한 줄. 기록이 많은 것부터다. */
  async items(filter: DropPriceFilter): Promise<DropPriceItemSummary[]> {
    const result = await this.db.execute<{
      item_key: string
      item_name: string
      count: number
      min: number
      median: number
      max: number
    }>(sql`
      select x.item_key, x.item_name, count(*)::int as count, min(x.price) as min,
             percentile_cont(0.5) within group (order by x.price) as median, max(x.price) as max
        from (${ROWS}) x
       where ${where(filter)}
       group by x.item_key, x.item_name
       order by count(*) desc, x.item_key`)
    return result.rows.map((r) => ({
      itemKey: r.item_key,
      itemName: r.item_name,
      count: r.count,
      min: Number(r.min),
      median: Number(r.median),
      max: Number(r.max),
    }))
  }

  /** 필터에 걸린 줄마다 가격과 획득처. 줄이 많아도 점그림이 다 그리도록 줄 목록과 달리 끊지 않는다. */
  async points(filter: DropPriceFilter): Promise<DropPricePoint[]> {
    const result = await this.db.execute<{
      price: number
      source: DropSource
      box_name: string | null
    }>(sql`select x.price, x.source, x.box_name from (${ROWS}) x where ${where(filter)}`)
    return result.rows.map((r) => ({
      priceMeso: Number(r.price),
      source: r.source,
      boxName: r.box_name,
    }))
  }

  /** 판매가가 있는 수익 건의 기간. 문자열 역순이라 같은 주기 안에서 최근 것부터다. */
  async periods(): Promise<string[]> {
    const result = await this.db.execute<{ period_code: string }>(sql`
      select distinct pe.period_code
        from drop_sale_prices sp
        join boss_drops bd on bd.id = sp.id
        join boss_profit_entries pe on pe.id = bd.profit_entry_id
       order by pe.period_code desc`)
    return result.rows.map((r) => r.period_code)
  }
}
