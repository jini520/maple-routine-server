import { Module } from '@nestjs/common'

import { CashbookCategoriesRepository } from './cashbook-categories.repository'

/** 가계부 갈래와 아이템 종류. 관리 화면이 고치고 앱이 받는다. */
@Module({
  providers: [CashbookCategoriesRepository],
  exports: [CashbookCategoriesRepository],
})
export class CashbookCategoriesModule {}
