import { Module } from '@nestjs/common'

import { DropMarketRepository } from './drop-market.repository'
import { DropMarketService } from './drop-market.service'
import { MarketDailyRepository } from './market-daily.repository'
import { MarketPublishJob } from './market-publish.job'
import { MarketPublishService } from './market-publish.service'
import { MarketController } from './market.controller'

/**
 * 드롭 시세. 관리 화면의 판정과 봉, 그리고 하루 한 번 내는 일일 기준가 · MASPI 와 앱이 받는 공개 조회다.
 */
@Module({
  controllers: [MarketController],
  providers: [
    DropMarketRepository,
    DropMarketService,
    MarketDailyRepository,
    MarketPublishService,
    MarketPublishJob,
  ],
  exports: [DropMarketService],
})
export class DropMarketModule {}
