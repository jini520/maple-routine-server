import { Injectable, Logger } from '@nestjs/common'

import {
  referenceFromVotes,
  runDay,
  shiftDay,
  trustWeight,
  votesOf,
  type DayReference,
  type Judgement,
  type MarketRow,
} from './daily-reference'
import { buildBasket, directIndex, linkOf, relativeOf, type BasketItem } from './market-index'
import {
  MarketDailyRepository,
  marketKey,
  parseMarketKey,
  type DailyRow,
  type StoredBasket,
} from './market-daily.repository'
import { RANGE_DAYS, rangeOf, type MarketRange, type RangeDay } from './market-range'
import {
  fillSeries,
  gradeOf,
  isReliable,
  toResponse,
  type FilledPoint,
  type Grade,
} from './market-view'

/** MASPI 기준 기간. 이 7일을 10,000 으로 둔다. 목요일에 시작해 주간 초기화와 경계가 같다. */
export const MASPI_BASE_FROM = '2026-10-22'
export const MASPI_BASE_TO = '2026-10-28'
/** 바스켓에 드는 아이템의 기준 기간 판 사람 수 */
const BASKET_MIN_PERSONS = 5
/** 이 거래권과 그 월드의 시세는 MASPI 에 넣지 않는다. 같은 아이템도 일반 월드와 시세가 몇 배 다르다 */
const EXCLUDED_GROUP = 'helios_eos'
/** 출시 직후라 시세가 자리 잡지 않은 아이템. key 가 이 말로 시작하면 이 날부터 지수에 든다 */
const LATE_ENTRY: [string, string][] = [['soul_ether', '2026-11-01']]
/** 지수를 그리기 시작하는 날. 바스켓 무게의 이만큼이 기준가를 가진 첫날이다 */
const MASPI_MIN_COVERAGE = 0.95
/** 앱의 장비 목록에 넣는 거래권. 에오스 · 핼리오스는 기록이 적어 지금은 넣지 않는다 */
const LISTED_GROUP = 'general'
const SPARK_DAYS = 30
const SERIES_DAYS = 365

/** 앱에 주는 시세 한 줄. 판 사람 수와 기준가의 근거는 싣지 않는다. 반지는 레벨 아이템의 key 다 */
interface MarketEntry {
  itemKey: string
  price: number
  changePct: number | null
  /** 범위. 7일 표가 모자라면 `null` 이다 */
  low: number | null
  high: number | null
  grade: Grade
}

const EMPTY_MASPI = { date: null, close: null, change: null, series: [] }
/** 비어 있는 시세 · 등락비 묶음. 읽기만 하므로 하나를 함께 쓴다 */
const NONE: ReadonlyMap<string, number> = new Map<string, number>()

function round(value: number, digits: number): number {
  const f = 10 ** digits
  return Math.round(value * f) / f
}

function daysFrom(from: string, to: string): string[] {
  const out: string[] = []
  for (let d = from; d <= to; d = shiftDay(d, 1)) out.push(d)
  return out
}

/** 직전 30일 판정으로 정한 사람마다의 표 무게. */
function weightFrom(judgements: ReadonlyMap<string, Judgement>): (person: string) => number {
  return (person) => trustWeight(judgements.get(person) ?? { judged: 0, excluded: 0 })
}

/**
 * 그날 기준가를 낸 시세마다 범위. 새 기준가 날은 7일 줄로 내고, 유지한 날은 전날의 범위를 그대로 둔다.
 *
 * @param stored 시세마다 7일 안의 낸 기준가. 다시 계산할 때는 그날 것도 들어 있다
 * @param dummies `날짜|사람` 꼴의 더미 입력. 그날 것까지 든다
 */
function rangesOf(
  day: string,
  references: ReadonlyMap<string, DayReference | null>,
  rows: DailyRow[],
  stored: ReadonlyMap<string, DayReference[]>,
  dummies: ReadonlySet<string>,
  weightOf: (person: string) => number,
): Map<string, MarketRange | null> {
  const yesterday = shiftDay(day, -1)
  const rowsByMarket = new Map<string, DailyRow[]>()
  for (const r of rows) rowsByMarket.set(r.market, [...(rowsByMarket.get(r.market) ?? []), r])
  const out = new Map<string, MarketRange | null>()
  for (const [market, ref] of references) {
    if (ref === null) continue
    const history = (stored.get(market) ?? []).filter((r) => r.day < day)
    if (ref.source === 'kept') {
      const prev = history.find((r) => r.day === yesterday)
      out.set(market, prev?.q1 != null && prev.q3 != null ? { q1: prev.q1, q3: prev.q3 } : null)
      continue
    }
    const days = new Map<string, RangeDay>(
      [...history, ref].map((r) => [r.day, { ref: r.ref, low: r.low, high: r.high }]),
    )
    out.set(market, rangeOf({ day, rows: rowsByMarket.get(market) ?? [], days, dummies, weightOf }))
  }
  return out
}

function basketItemsOf(rows: StoredBasket[]): BasketItem[] {
  const byItem = new Map<string, BasketItem>()
  for (const r of rows) {
    const key = r.itemId
    const item = byItem.get(key) ?? { key, scopes: [], weight: r.weight, entersOn: r.entersOn }
    item.scopes.push({ scope: r.scope, basePrice: r.basePriceMeso, persons: r.persons })
    byItem.set(key, item)
  }
  return [...byItem.values()]
}

/**
 * 시세를 하루 한 번 계산해 남기고, 앱에 줄 응답을 만들어 저장한다. 계산은 여기 한 곳에서 끝나고, 응답을 부를 때는 다시 계산하지
 * 않는다. 같은 날이면 어느 앱이든 같은 응답을 받는다.
 */
@Injectable()
export class MarketPublishService {
  private readonly logger = new Logger(MarketPublishService.name)

  constructor(private readonly repo: MarketDailyRepository) {}

  /** 하루 작업. 끝내지 않은 날을 어제까지 차례로 낸다. 처음 채우기 전이면 아무것도 하지 않는다. */
  async catchUp(yesterday: string): Promise<void> {
    const ran = await this.repo.ranDays()
    if (ran.length === 0) {
      this.logger.warn('시세 처음 채우기 전이라 하루 작업을 건너뛴다')
      return
    }
    for (let day = shiftDay(ran[ran.length - 1], 1); day <= yesterday; day = shiftDay(day, 1)) {
      if (!(await this.computeDay(day))) continue
      await this.extendMaspi(day)
      await this.buildResponses(day)
      this.logger.log(`시세 ${day} 를 냈다`)
    }
  }

  /** 처음 한 번, 그때까지의 줄로 지난 날들을 채운다. 이미 낸 날이 있으면 하지 않는다. */
  async backfill(yesterday: string): Promise<void> {
    if ((await this.repo.ranDays()).length > 0)
      throw new Error('이미 낸 날이 있어 처음 채우기를 하지 않는다')
    const first = await this.repo.firstDay()
    if (first === null) return
    for (const day of daysFrom(first, yesterday)) await this.computeDay(day)
    const basket = await this.ensureBasket()
    await this.fillMaspi(basket, first, yesterday)
    await this.buildResponses(yesterday)
    this.logger.log(`시세를 ${first} ~ ${yesterday} 로 채웠다`)
  }

  /** 그날의 일일 기준가 · 범위와 판정을 남긴다. 기준가는 3일 줄로, 범위는 7일 줄로 낸다. 이미 낸 날이면 false */
  async computeDay(day: string): Promise<boolean> {
    const from = shiftDay(day, -(RANGE_DAYS - 1))
    const refFrom = shiftDay(day, -2)
    const yesterday = shiftDay(day, -1)
    const [rows, dummies, stored, judgements] = await Promise.all([
      this.repo.rowsBetween(from, day),
      this.repo.dummyDays(from, yesterday),
      this.repo.referencesBetween(from, yesterday),
      this.repo.judgementSums(shiftDay(day, -30), yesterday),
    ])
    const rowsByMarket = new Map<string, MarketRow[]>()
    for (const r of rows) {
      if (r.day < refFrom || dummies.has(`${r.day}|${r.person}`)) continue
      const list = rowsByMarket.get(r.market)
      if (list === undefined) rowsByMarket.set(r.market, [r])
      else list.push(r)
    }
    const prev = new Map<string, DayReference>()
    for (const [key, list] of stored) {
      const last = list[list.length - 1]
      if (last.day !== yesterday) continue
      prev.set(key, last)
      if (!rowsByMarket.has(key)) rowsByMarket.set(key, [])
    }
    const result = runDay({ day, rowsByMarket, previous: prev, judgements })
    for (const person of result.dummies) dummies.add(`${day}|${person}`)
    const ranges = rangesOf(day, result.references, rows, stored, dummies, weightFrom(judgements))
    const references = new Map<string, DayReference | null>()
    for (const [key, ref] of result.references) {
      const range = ranges.get(key) ?? null
      references.set(
        key,
        ref === null ? null : { ...ref, q1: range?.q1 ?? null, q3: range?.q3 ?? null },
      )
    }
    return this.repo.saveDay(day, references, result.judged, result.dummies)
  }

  /**
   * 낸 날의 범위만 지금 방식으로 다시 낸다. 기준가 · 울타리 · 판정 · MASPI 는 그대로 두고 마지막 날의 응답을 다시 만든다.
   * 날 차례로 내야 유지한 날이 다시 낸 전날의 범위를 받는다.
   *
   * @returns 다시 낸 날 수
   */
  async recomputeRanges(): Promise<number> {
    const ran = await this.repo.ranDays()
    for (const day of ran) {
      const from = shiftDay(day, -(RANGE_DAYS - 1))
      const [rows, dummies, stored, judgements] = await Promise.all([
        this.repo.rowsBetween(from, day),
        this.repo.dummyDays(from, day),
        this.repo.referencesBetween(from, day),
        this.repo.judgementSums(shiftDay(day, -30), shiftDay(day, -1)),
      ])
      const today = new Map<string, DayReference>()
      for (const [key, list] of stored) {
        const last = list[list.length - 1]
        if (last.day === day) today.set(key, last)
      }
      await this.repo.updateRanges(
        day,
        rangesOf(day, today, rows, stored, dummies, weightFrom(judgements)),
      )
    }
    if (ran.length > 0) await this.buildResponses(ran[ran.length - 1])
    return ran.length
  }

  /**
   * 마지막으로 낸 날의 앱 응답을 다시 만든다. 옛 DB 를 옮긴 뒤 한 번 돌린다. 옛 응답은 반지 레벨이 든 열쇠와 몸이라 옮기지 않는다.
   *
   * @returns 다시 만든 날. 낸 날이 없으면 `null`
   */
  async rebuildLatestResponses(): Promise<string | null> {
    const ran = await this.repo.ranDays()
    const last = ran[ran.length - 1]
    if (last === undefined) return null
    await this.buildResponses(last)
    return last
  }

  /** 기준 기간의 표로 바스켓을 정한다. 한 번 정하면 그대로 쓴다. */
  async ensureBasket(): Promise<BasketItem[]> {
    const stored = await this.repo.basket()
    if (stored.length > 0) return basketItemsOf(stored)
    const [rows, dummies, judgements, worlds] = await Promise.all([
      this.repo.rowsBetween(MASPI_BASE_FROM, MASPI_BASE_TO),
      this.repo.dummyDays(MASPI_BASE_FROM, MASPI_BASE_TO),
      this.repo.judgementSums(shiftDay(MASPI_BASE_TO, -29), MASPI_BASE_TO),
      this.repo.worlds(),
    ])
    const excluded = new Set([
      EXCLUDED_GROUP,
      ...worlds.filter((w) => w.tradeGroupKey === EXCLUDED_GROUP).map((w) => w.key),
    ])
    const weightOf = (p: string): number =>
      trustWeight(judgements.get(p) ?? { judged: 0, excluded: 0 })
    const byMarket = new Map<string, MarketRow[]>()
    for (const r of rows) {
      if (dummies.has(`${r.day}|${r.person}`) || excluded.has(parseMarketKey(r.market).scope))
        continue
      byMarket.set(r.market, [...(byMarket.get(r.market) ?? []), r])
    }
    const meta = await this.repo.itemsById([
      ...new Set([...byMarket.keys()].map((k) => parseMarketKey(k).itemId)),
    ])
    const candidates = new Map<string, Omit<BasketItem, 'weight'>>()
    for (const [market, list] of byMarket) {
      const votes = votesOf(list, weightOf)
      if (votes.size < BASKET_MIN_PERSONS) continue
      const m = parseMarketKey(market)
      const key = m.itemId
      const itemKey = meta.get(m.itemId)?.key ?? ''
      const entersOn = LATE_ENTRY.find(([prefix]) => itemKey.startsWith(prefix))?.[1] ?? null
      const item = candidates.get(key) ?? { key, scopes: [], entersOn }
      item.scopes.push({
        scope: m.scope,
        basePrice: referenceFromVotes(MASPI_BASE_TO, 'today', votes).ref,
        persons: votes.size,
      })
      candidates.set(key, item)
    }
    const basket = buildBasket([...candidates.values()])
    await this.repo.saveBasket(
      basket.flatMap((b) =>
        b.scopes.map((s) => {
          return {
            itemId: b.key,
            scope: s.scope,
            basePriceMeso: s.basePrice,
            persons: s.persons,
            weight: b.weight,
            entersOn: b.entersOn,
          }
        }),
      ),
    )
    return basket
  }

  private relativesFrom(
    basket: BasketItem[],
    refs: ReadonlyMap<string, number>,
    day: string,
  ): Map<string, number> {
    const out = new Map<string, number>()
    for (const b of basket) {
      const rel = relativeOf(b, (scope) => refs.get(marketKey(b.key, scope)) ?? null, day)
      if (rel !== null) out.set(b.key, rel)
    }
    return out
  }

  private async refsByDay(from: string, to: string): Promise<Map<string, Map<string, number>>> {
    const out = new Map<string, Map<string, number>>()
    for (const [key, list] of await this.repo.referencesBetween(from, to)) {
      for (const r of list) {
        const day = out.get(r.day) ?? new Map<string, number>()
        day.set(key, r.ref)
        out.set(r.day, day)
      }
    }
    return out
  }

  /** 처음 채울 때의 MASPI. 기준 기간 첫날에서 시작해 앞뒤로 이어 붙인다. */
  private async fillMaspi(basket: BasketItem[], first: string, until: string): Promise<void> {
    if (basket.length === 0 || until < MASPI_BASE_FROM) return
    const weights = new Map(basket.map((b) => [b.key, b.weight]))
    const refs = await this.refsByDay(first, until)
    const rels = new Map(
      daysFrom(first, until).map((d) => [d, this.relativesFrom(basket, refs.get(d) ?? NONE, d)]),
    )
    const coverage = (d: string): number => {
      const eligible = basket.filter((b) => b.entersOn === null || d >= b.entersOn)
      const total = eligible.reduce((s, b) => s + b.weight, 0)
      return total === 0
        ? 0
        : eligible.filter((b) => rels.get(d)?.has(b.key)).reduce((s, b) => s + b.weight, 0) / total
    }
    const start =
      daysFrom(first, MASPI_BASE_FROM).find((d) => coverage(d) >= MASPI_MIN_COVERAGE) ??
      MASPI_BASE_FROM
    const value = new Map<string, number>([
      [MASPI_BASE_FROM, directIndex(basket, rels.get(MASPI_BASE_FROM) ?? NONE)],
    ])
    for (const d of daysFrom(shiftDay(MASPI_BASE_FROM, 1), until)) {
      const prev = shiftDay(d, -1)
      value.set(
        d,
        (value.get(prev) as number) *
          (linkOf(weights, rels.get(prev) ?? NONE, rels.get(d) ?? NONE) ?? 1),
      )
    }
    for (let d = shiftDay(MASPI_BASE_FROM, -1); d >= start; d = shiftDay(d, -1)) {
      const next = shiftDay(d, 1)
      value.set(
        d,
        (value.get(next) as number) /
          (linkOf(weights, rels.get(d) ?? NONE, rels.get(next) ?? NONE) ?? 1),
      )
    }
    await this.repo.saveMaspi(
      daysFrom(start, until).map((d) => ({ day: d, close: round(value.get(d) as number, 2) })),
    )
  }

  /** 하루 작업의 MASPI. 전날 종가에 이틀 모두 기준가가 있는 아이템의 비율을 곱한다. */
  private async extendMaspi(day: string): Promise<void> {
    const basket = basketItemsOf(await this.repo.basket())
    const yesterday = shiftDay(day, -1)
    const [prev] = await this.repo.maspiBetween(yesterday, yesterday)
    if (basket.length === 0 || prev === undefined) return
    const refs = await this.refsByDay(yesterday, day)
    const link = linkOf(
      new Map(basket.map((b) => [b.key, b.weight])),
      this.relativesFrom(basket, refs.get(yesterday) ?? NONE, yesterday),
      this.relativesFrom(basket, refs.get(day) ?? NONE, day),
    )
    await this.repo.saveMaspi([{ day, close: round(prev.close * (link ?? 1), 2) }])
  }

  /** 그날 앱에 줄 응답을 모두 만들어 저장한다. 판 사람 수 · 기준가의 근거 · 빈 날 표시는 싣지 않는다. */
  async buildResponses(day: string): Promise<void> {
    const from = shiftDay(day, -(SERIES_DAYS - 1))
    const [refs, recent, worlds, maspi] = await Promise.all([
      this.repo.referencesBetween(from, day),
      this.repo.rowsBetween(shiftDay(day, -6), day),
      this.repo.worlds(),
      this.repo.maspiBetween(shiftDay(day, -(SPARK_DAYS - 1)), day),
    ])
    const persons = new Map<string, Set<string>>()
    for (const r of recent)
      persons.set(r.market, (persons.get(r.market) ?? new Set()).add(r.person))
    const meta = await this.repo.itemsById([
      ...new Set([...refs.keys()].map((k) => parseMarketKey(k).itemId)),
    ])
    const days = daysFrom(from, day)
    const freshFrom = shiftDay(day, -13)

    type Built = {
      market: string
      scope: string
      worldBound: boolean
      entry: Omit<MarketEntry, 'grade'>
      series: FilledPoint[]
      persons: number
    }
    const built: Built[] = []
    for (const [market, list] of refs) {
      const fresh = list.filter((r) => r.day >= freshFrom && r.source !== 'kept').length
      if (!isReliable(fresh)) continue
      const byDay = new Map(list.map((r) => [r.day, r]))
      const series = fillSeries(
        days.map((d) => {
          const r = byDay.get(d)
          return {
            day: d,
            ref: r?.ref ?? null,
            q1: r?.q1 ?? null,
            q3: r?.q3 ?? null,
            fresh: r !== undefined && r.source !== 'kept',
          }
        }),
      )
      if (series.length === 0) continue
      const m = parseMarketKey(market)
      const item = meta.get(m.itemId)
      if (item === undefined) continue
      const last = series[series.length - 1]
      const prev = series[series.length - 2]
      built.push({
        market,
        scope: m.scope,
        worldBound: item.worldBound,
        series,
        persons: persons.get(market)?.size ?? 0,
        entry: {
          itemKey: item.key,
          price: last.price,
          changePct: prev === undefined ? null : round((last.price / prev.price - 1) * 100, 1),
          low: last.low,
          high: last.high,
        },
      })
    }

    const listOf = (pick: (b: Built) => boolean): (Built & { grade: Grade })[] => {
      const picked = built
        .filter(pick)
        .sort((a, b) => b.persons - a.persons || a.entry.itemKey.localeCompare(b.entry.itemKey))
      const leader = picked[0]?.persons ?? 0
      return picked.map((b) => ({ ...b, grade: gradeOf(b.persons, leader) }))
    }
    const toEntry = (b: Built & { grade: Grade }) => ({
      ...b.entry,
      grade: b.grade,
      spark: b.series.slice(-SPARK_DAYS).map((p) => p.price),
    })

    const equipment = listOf((b) => !b.worldBound && b.scope === LISTED_GROUP)
    const responses: { key: string; body: string; etag: string }[] = []
    const last = maspi[maspi.length - 1]
    const before = maspi[maspi.length - 2]
    // 전일 대비는 저장된 두 종가의 차이다. 반올림 전 값으로 빼면 보이는 두 종가의 차이와 0.01 어긋난다.
    responses.push({
      key: 'maspi',
      ...toResponse(
        last === undefined
          ? EMPTY_MASPI
          : {
              date: last.day,
              close: last.close,
              change: before === undefined ? null : round(last.close - before.close, 2),
              series: maspi.map((m) => ({ date: m.day, value: m.close })),
            },
      ),
    })
    const details = [...equipment]
    for (const w of worlds) {
      const consumable = listOf((b) => b.worldBound && b.scope === w.key)
      details.push(...consumable)
      responses.push({
        key: `items:${w.key}`,
        ...toResponse({
          date: day,
          equipment: equipment.map(toEntry),
          consumable: { world: w.key, items: consumable.map(toEntry) },
        }),
      })
    }
    for (const b of details) {
      responses.push({
        key: `item:${b.entry.itemKey}:${b.scope}`,
        ...toResponse({ date: day, ...b.entry, grade: b.grade, series: b.series }),
      })
    }
    await this.repo.saveResponses(day, responses)
  }
}
