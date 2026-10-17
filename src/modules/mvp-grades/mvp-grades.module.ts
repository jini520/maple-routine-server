import { Module } from '@nestjs/common'

import { MvpGradesRepository } from './mvp-grades.repository'

/** MVP 등급의 경매장 수수료와 스타포스 할인. 관리 화면이 고치고 앱이 받는다. */
@Module({
  providers: [MvpGradesRepository],
  exports: [MvpGradesRepository],
})
export class MvpGradesModule {}
