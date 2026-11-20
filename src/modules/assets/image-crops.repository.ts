import { Inject, Injectable } from '@nestjs/common'
import { and, asc, eq } from 'drizzle-orm'

import { DB, type Db } from '../../database/database.module'
import { assets, imageCropTypeEnum, imageCrops } from '../../database/schema'
import { sectionUpdatedAt, touchSection } from '../game-data/sections'
import { AssetNotFound } from './asset-refs'

export const IMAGE_CROP_TYPES = imageCropTypeEnum.enumValues
export type ImageCropType = (typeof IMAGE_CROP_TYPES)[number]

/** 폭과 가로 · 세로 위치. 놓이는 자리에 대한 % 다. */
export interface ImageCrop {
  widthPercent: number
  positionXPercent: number
  positionYPercent: number
}

export interface ImageCropView extends ImageCrop {
  type: ImageCropType
  assetId: string
}

/** GET /v1/game-data 의 imageCrops 칸. 줄이 없는 그림은 앱이 기본 크롭(cover · 가운데)으로 그린다. */
export interface ImageCropsSection {
  updatedAt: string | null
  imageCrops: ImageCropView[]
}

@Injectable()
export class ImageCropsRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  async section(): Promise<ImageCropsSection> {
    const rows = await this.db
      .select({
        type: imageCrops.type,
        assetId: imageCrops.assetId,
        widthPercent: imageCrops.widthPercent,
        positionXPercent: imageCrops.positionXPercent,
        positionYPercent: imageCrops.positionYPercent,
      })
      .from(imageCrops)
      .innerJoin(assets, eq(assets.id, imageCrops.assetId))
      .orderBy(asc(imageCrops.type), asc(assets.fileName))
    return { updatedAt: await sectionUpdatedAt(this.db, 'imageCrops'), imageCrops: rows }
  }

  /** 그림이 그림 표에 없으면 AssetNotFound 다. */
  async put(type: ImageCropType, assetId: string, crop: ImageCrop): Promise<void> {
    await this.db.transaction(async (tx) => {
      const [asset] = await tx.select({ id: assets.id }).from(assets).where(eq(assets.id, assetId))
      if (asset === undefined) throw new AssetNotFound(assetId)
      await tx
        .insert(imageCrops)
        .values({ type, assetId, ...crop })
        .onConflictDoUpdate({
          target: [imageCrops.type, imageCrops.assetId],
          set: { ...crop, updatedAt: new Date() },
        })
      await touchSection(tx, 'imageCrops')
    })
  }

  /** 줄을 지우면 앱은 그 그림을 기본 크롭으로 그린다. 없으면 false 다. */
  async remove(type: ImageCropType, assetId: string): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const rows = await tx
        .delete(imageCrops)
        .where(and(eq(imageCrops.type, type), eq(imageCrops.assetId, assetId)))
        .returning({ id: imageCrops.id })
      if (rows.length === 0) return false
      await touchSection(tx, 'imageCrops')
      return true
    })
  }
}
