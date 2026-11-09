import { Module } from '@nestjs/common'

import { AppImagesRepository } from './app-images.repository'

/** 붙일 게임 데이터 표가 없는 앱 그림. 앱이 key 로 찾는다. */
@Module({
  providers: [AppImagesRepository],
  exports: [AppImagesRepository],
})
export class AppImagesModule {}
