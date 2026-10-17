import { Module } from '@nestjs/common'

import { SpendCatalogRepository } from './spend-catalog.repository'

/** 지출 카탈로그. 묶음 · 타일 · 항목과 규칙 둘. 관리 화면이 채우고 앱이 받는다. */
@Module({
  providers: [SpendCatalogRepository],
  exports: [SpendCatalogRepository],
})
export class SpendCatalogModule {}
