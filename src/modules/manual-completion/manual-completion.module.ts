import { Module } from '@nestjs/common'

import { ManualCompletionController } from './manual-completion.controller'
import { ManualCompletionRepository } from './manual-completion.repository'

/** 수동 완료 보스. 운영자가 열고 닫고 앱이 읽는다. */
@Module({
  controllers: [ManualCompletionController],
  providers: [ManualCompletionRepository],
  exports: [ManualCompletionRepository],
})
export class ManualCompletionModule {}
