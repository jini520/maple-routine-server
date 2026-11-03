import { Module } from '@nestjs/common'

import { FaqsRepository } from './faqs.repository'

/** 앱 화면의 FAQ 문구. 관리 화면이 고치고 앱이 게임 데이터 칸 faqs 로 받는다. */
@Module({
  providers: [FaqsRepository],
  exports: [FaqsRepository],
})
export class FaqsModule {}
