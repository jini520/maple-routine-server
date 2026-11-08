import { Inject, Injectable } from '@nestjs/common'
import { asc } from 'drizzle-orm'

import { DB, type Db } from '../../database/database.module'
import { appImages } from '../../database/schema'
import { sectionUpdatedAt } from '../game-data/sections'

export interface AppImageView {
  /** 앱이 그림을 찾는 이름. 앱 코드가 든다 */
  key: string
  assetId: string
}

/** GET /v1/game-data 의 appImages 칸. 붙일 게임 데이터 표가 없는 앱 그림이다. */
export interface AppImagesSection {
  updatedAt: string | null
  images: AppImageView[]
}

/** 고치는 화면은 아직 없다. 줄은 0031 이관과 씨앗이 넣는다. */
@Injectable()
export class AppImagesRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  async section(): Promise<AppImagesSection> {
    const rows = await this.db
      .select({ key: appImages.key, assetId: appImages.assetId })
      .from(appImages)
      .orderBy(asc(appImages.key))
    return { updatedAt: await sectionUpdatedAt(this.db, 'appImages'), images: rows }
  }
}
