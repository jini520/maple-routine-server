import { Module } from '@nestjs/common'

import { DropPricesRepository } from './drop-prices.repository'

/**
 * 드롭 판매가의 관리 화면 조회. 판매가 줄은 1.0.15 앱이 올린 드롭을 서버가 받을 때 적고, 1.0.14 까지의 앱이 판매가 표에 바로
 * 올리던 경로는 없앴다.
 */
@Module({
  providers: [DropPricesRepository],
  exports: [DropPricesRepository],
})
export class DropPricesModule {}
