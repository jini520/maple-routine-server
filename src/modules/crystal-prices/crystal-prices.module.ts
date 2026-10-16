import { Module } from '@nestjs/common'

import { CrystalPricesRepository } from './crystal-prices.repository'

/** 결정석 가격. 한 조합에 기간 줄이 여럿이다. 관리 화면이 채우고 앱이 받는다. */
@Module({
  providers: [CrystalPricesRepository],
  exports: [CrystalPricesRepository],
})
export class CrystalPricesModule {}
