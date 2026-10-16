import { Module } from '@nestjs/common'

import { BossesModule } from '../bosses/bosses.module'
import { IdentityModule } from '../identity/identity.module'
import { DropPricesController } from './drop-prices.controller'
import { DropPricesRepository } from './drop-prices.repository'

/** 드롭 판매가 표본. 신원은 identity 의 가드가 가리고, 보스 · 난이도는 bosses 의 표로 바꿔 적는다. */
@Module({
  imports: [IdentityModule, BossesModule],
  controllers: [DropPricesController],
  providers: [DropPricesRepository],
  exports: [DropPricesRepository],
})
export class DropPricesModule {}
