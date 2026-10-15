import { Module } from '@nestjs/common'

import { IdentityModule } from '../identity/identity.module'
import { DropPricesController } from './drop-prices.controller'
import { DropPricesRepository } from './drop-prices.repository'

/** 드롭 판매가 표본. 신원은 identity 의 가드가 가린다. */
@Module({
  imports: [IdentityModule],
  controllers: [DropPricesController],
  providers: [DropPricesRepository],
  exports: [DropPricesRepository],
})
export class DropPricesModule {}
