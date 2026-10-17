import { Module } from '@nestjs/common'

import { ContentsRepository } from './contents.repository'

/** 컨텐츠 마스터 표와 갈래 표. 공유 카탈로그는 컨텐츠 줄의 칸이다. 관리 화면이 채우고 앱이 받는다. */
@Module({
  providers: [ContentsRepository],
  exports: [ContentsRepository],
})
export class ContentsModule {}
