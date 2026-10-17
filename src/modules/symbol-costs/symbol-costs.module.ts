import { Module } from '@nestjs/common'

import { SymbolCostsRepository } from './symbol-costs.repository'

/** 심볼 강화 비용. 묶음 · 심볼 · 레벨마다 기간 줄. 관리 화면이 채우고 앱이 받는다. */
@Module({
  providers: [SymbolCostsRepository],
  exports: [SymbolCostsRepository],
})
export class SymbolCostsModule {}
