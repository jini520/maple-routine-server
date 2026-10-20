import { Injectable } from '@nestjs/common'

import { type Candle, dailyCandles, type MarketSummary, summarize } from './candles'
import {
  DropMarketRepository,
  type MarketKey,
  type MarketRow,
  type MarketScope,
} from './drop-market.repository'
import { type Judged, judge, kstDayNumber } from './fence'

/** 한눈에 보는 화면의 한 줄. 시세 하나다. */
export interface MarketOverviewRow extends MarketKey, MarketSummary {
  itemName: string
}

/** 아이템 화면. 봉과 줄은 최근 90일이다. */
export interface MarketDetail {
  itemName: string | null
  candles: Candle[]
  rows: (Judged & Pick<MarketRow, 'worldKey' | 'worldName'>)[]
}

const DAY_MS = 86_400_000
/** 판정의 표본은 그 줄의 거래일까지 최대 30일이다. 보이는 기간 앞으로 이만큼 더 읽어야 첫날의 판정이 선다. */
const SAMPLE_LOOKBACK_DAYS = 29
/** 한눈에 보는 화면의 제외 수가 세는 기간. */
const OVERVIEW_DAYS = 30
const DETAIL_DAYS = 90

function daysBefore(now: Date, days: number): Date {
  return new Date(now.getTime() - (days + 1) * DAY_MS)
}

/** 시세 범위(장비는 거래권, 소비는 월드) 단위로 판정하고 봉 · 요약을 만든다. 판정은 줄을 지우지 않고 읽을 때마다 다시 센다. */
@Injectable()
export class DropMarketService {
  constructor(private readonly repo: DropMarketRepository) {}

  scopes() {
    return this.repo.scopes()
  }

  /** 최근 거래가 늦은 시세부터. */
  async overview(scope: MarketScope, now: Date): Promise<MarketOverviewRow[]> {
    const rows = await this.repo.rows(scope, daysBefore(now, OVERVIEW_DAYS + SAMPLE_LOOKBACK_DAYS))
    const markets = new Map<string, MarketRow[]>()
    for (const r of rows) {
      const key = `${r.itemKey}\u0000${r.ringLevel ?? ''}`
      markets.set(key, [...(markets.get(key) ?? []), r])
    }
    return [...markets.values()]
      .map((market) => ({
        itemKey: market[0].itemKey,
        itemName: market[0].itemName,
        ringLevel: market[0].ringLevel,
        ...summarize(judge(market), now),
      }))
      .sort((a, b) => (b.lastPricedAt?.getTime() ?? 0) - (a.lastPricedAt?.getTime() ?? 0))
  }

  async detail(scope: MarketScope, market: MarketKey, now: Date): Promise<MarketDetail> {
    const rows = await this.repo.rows(scope, daysBefore(now, DETAIL_DAYS + SAMPLE_LOOKBACK_DAYS), market)
    const firstDay = kstDayNumber(now) - DETAIL_DAYS + 1
    const judged = judge(rows)
      .map((j, i) => ({ ...j, worldKey: rows[i].worldKey, worldName: rows[i].worldName }))
      .filter((j) => kstDayNumber(j.pricedAt) >= firstDay)
    return { itemName: rows[0]?.itemName ?? null, candles: dailyCandles(judged), rows: judged }
  }
}
