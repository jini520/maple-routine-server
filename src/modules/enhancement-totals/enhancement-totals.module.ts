import { Module } from '@nestjs/common'

import { IdentityModule } from '../identity/identity.module'
import { EnhancementTotalsController } from './enhancement-totals.controller'
import { EnhancementTotalsRepository } from './enhancement-totals.repository'

/** 강화 지출 합계의 사본. 신원은 identity 의 가드가 가린다. */
@Module({
  imports: [IdentityModule],
  controllers: [EnhancementTotalsController],
  providers: [EnhancementTotalsRepository],
})
export class EnhancementTotalsModule {}
