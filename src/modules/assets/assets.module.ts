import { Module } from '@nestjs/common'

import { AssetStore } from './asset-store'
import { AssetsRepository } from './assets.repository'
import { ImageCropsRepository } from './image-crops.repository'

/** 앱이 받는 그림 · 크롭 표와 그림 파일 디렉터리. 관리 화면이 올리고 게임 데이터 응답이 목록을 싣는다. */
@Module({
  providers: [AssetsRepository, ImageCropsRepository, AssetStore],
  exports: [AssetsRepository, ImageCropsRepository, AssetStore],
})
export class AssetsModule {}
