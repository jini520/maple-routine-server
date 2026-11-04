import { Module } from '@nestjs/common'

import { IdentityModule } from '../identity/identity.module'
import { UsageEventsController } from './usage-events.controller'
import { UsageEventsPurgeJob } from './usage-events.purge.job'
import { UsageEventsRepository } from './usage-events.repository'

/** 앱 사용 로그. 신원은 identity 의 가드가 가린다. 관리 화면이 집계를 읽는다. */
@Module({
  imports: [IdentityModule],
  controllers: [UsageEventsController],
  providers: [UsageEventsRepository, UsageEventsPurgeJob],
  exports: [UsageEventsRepository],
})
export class UsageEventsModule {}
