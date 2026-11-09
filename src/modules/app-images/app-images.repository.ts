import { Inject, Injectable } from '@nestjs/common'
import { asc, eq } from 'drizzle-orm'

import { DB, type Db } from '../../database/database.module'
import { appImages, assets } from '../../database/schema'
import { AssetNotFound } from '../assets/asset-refs'
import { sectionUpdatedAt, touchSection } from '../game-data/sections'

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

/** 줄은 0031 이관과 씨앗이 넣고, 관리 화면은 그림만 바꾼다. key 는 앱 코드가 들어 더하거나 지우지 않는다. */
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

  /** key 의 그림을 바꾼다. 같은 그림이면 칸의 시각을 밀지 않는다. 모르는 key 는 false, 없는 그림은 AssetNotFound 다. */
  async set(key: string, assetId: string): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const [current] = await tx
        .select({ id: appImages.id, assetId: appImages.assetId })
        .from(appImages)
        .where(eq(appImages.key, key))
      if (current === undefined) return false
      if (current.assetId === assetId) return true
      const [asset] = await tx.select({ id: assets.id }).from(assets).where(eq(assets.id, assetId))
      if (asset === undefined) throw new AssetNotFound(assetId)
      await tx.update(appImages).set({ assetId }).where(eq(appImages.id, current.id))
      await touchSection(tx, 'appImages')
      return true
    })
  }
}
