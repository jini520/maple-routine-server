import { Module } from '@nestjs/common'

import { IdentityModule } from '../identity/identity.module'
import { EnhancementAnomaliesController } from './enhancement-anomalies.controller'
import { EnhancementAnomaliesRepository } from './enhancement-anomalies.repository'

/** 강화 합계에서 빠진 줄의 수. 신원은 identity 의 가드가 가린다. */
@Module({
  imports: [IdentityModule],
  controllers: [EnhancementAnomaliesController],
  providers: [EnhancementAnomaliesRepository],
})
export class EnhancementAnomaliesModule {}
