import { Injectable } from '@nestjs/common'

import { type Candle, dailyCandles, type MarketSummary, summarize, weeklyCandles } from './candles'
import {
  DropMarketRepository,
  type MarketKey,
  type MarketRow,
  type MarketScope,
} from './drop-market.repository'
import { type Judged, judgeStored, kstDay, kstDayNumber } from './fence'
import { MarketDailyRepository, marketKey } from './market-daily.repository'

/** 한눈에 보는 화면의 한 줄. 시세 하나다. */
export interface MarketOverviewRow extends MarketKey, MarketSummary {
  itemName: string
}

/** 아이템 화면. 봉과 줄은 최근 90일이다. 주봉의 첫 봉은 90일 경계에서 잘린 주일 수 있다. */
export interface MarketDetail {
  itemName: string | null
  candles: Candle[]
  weeklyCandles: Candle[]
  rows: Judged<Pick<MarketRow, 'id' | 'priceMeso' | 'pricedAt' | 'worldKey' | 'worldName'>>[]
}

const DAY_MS = 86_400_000
/** 한눈에 보는 화면의 제외 수가 세는 기간. */
const OVERVIEW_DAYS = 30
const DETAIL_DAYS = 90

function daysBefore(now: Date, days: number): Date {
  return new Date(now.getTime() - (days + 1) * DAY_MS)
}

/**
 * 시세 범위(장비는 거래권, 소비는 월드) 단위로 판정하고 봉 · 요약을 만든다.
 * 판정은 하루 작업이 남긴 그날 울타리 · 더미 입력과 줄을 읽을 때마다 비교한다. 줄은 지우지 않는다.
 */
@Injectable()
export class DropMarketService {
  constructor(
    private readonly repo: DropMarketRepository,
    private readonly daily: MarketDailyRepository,
  ) {}

  scopes() {
    return this.repo.scopes()
  }

  /** 최근 거래가 늦은 시세부터. */
  async overview(scope: MarketScope, now: Date): Promise<MarketOverviewRow[]> {
    const since = daysBefore(now, OVERVIEW_DAYS)
    const [rows, judge] = await Promise.all([
      this.repo.rows(scope, since),
      this.judgeOf(scope, since, now),
    ])
    const markets = new Map<string, MarketRow[]>()
    for (const r of rows) {
      const key = marketKey(r.marketItemId, scope.key)
      markets.set(key, [...(markets.get(key) ?? []), r])
    }
    return [...markets.entries()]
      .map(([key, market]) => ({
        itemKey: market[0].itemKey,
        itemName: market[0].itemName,
        ringLevel: market[0].ringLevel,
        ...summarize(judge(key, market), now),
      }))
      .sort((a, b) => (b.lastPricedAt?.getTime() ?? 0) - (a.lastPricedAt?.getTime() ?? 0))
  }

  async detail(scope: MarketScope, market: MarketKey, now: Date): Promise<MarketDetail> {
    const since = daysBefore(now, DETAIL_DAYS)
    const [rows, judge] = await Promise.all([
      this.repo.rows(scope, since, market),
      this.judgeOf(scope, since, now),
    ])
    const firstDay = kstDayNumber(now) - DETAIL_DAYS + 1
    const judged = (
      rows.length === 0 ? [] : judge(marketKey(rows[0].marketItemId, scope.key), rows)
    )
      .map(({ id, priceMeso, pricedAt, worldKey, worldName, verdict, fence, basis }) => ({
        id,
        priceMeso,
        pricedAt,
        worldKey,
        worldName,
        verdict,
        fence,
        basis,
      }))
      .filter((j) => kstDayNumber(j.pricedAt) >= firstDay)
    return {
      itemName: rows[0]?.itemName ?? null,
      candles: dailyCandles(judged),
      weeklyCandles: weeklyCandles(judged),
      rows: judged,
    }
  }

  /** 범위 안 시세들의 그날 울타리와 더미 입력을 한 번에 읽고, 시세 하나의 줄을 판정하는 함수를 돌려준다. */
  private async judgeOf(scope: MarketScope, since: Date, now: Date) {
    const from = kstDay(since)
    const to = kstDay(now)
    const [references, dummies] = await Promise.all([
      this.daily.referencesBetween(from, to, scope.key),
      this.daily.dummyDays(from, to),
    ])
    return (key: string, rows: MarketRow[]) =>
      judgeStored(rows, new Map((references.get(key) ?? []).map((r) => [r.day, r])), dummies)
  }
}
