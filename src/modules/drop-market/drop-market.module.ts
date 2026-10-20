import { Module } from '@nestjs/common'

import { DropMarketRepository } from './drop-market.repository'
import { DropMarketService } from './drop-market.service'

/** 드롭 시세. drop_prices 를 월드 묶음마다 읽어 잘못 적은 값을 빼고 봉을 만든다. 읽기만 한다. */
@Module({
  providers: [DropMarketRepository, DropMarketService],
  exports: [DropMarketService],
})
export class DropMarketModule {}
