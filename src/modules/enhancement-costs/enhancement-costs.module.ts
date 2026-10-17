import { Module } from '@nestjs/common'

import { EnhancementCostsRepository } from './enhancement-costs.repository'

/** 강화 1회의 메소를 매기는 재료. 잠재 · 소울 · 스타포스 표와 규칙 셋. 관리 화면이 고치고 앱이 받는다. */
@Module({
  providers: [EnhancementCostsRepository],
  exports: [EnhancementCostsRepository],
})
export class EnhancementCostsModule {}
