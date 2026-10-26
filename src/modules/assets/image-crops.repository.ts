import { Inject, Injectable } from '@nestjs/common'
import { and, asc, eq } from 'drizzle-orm'

import { DB, type Db } from '../../database/database.module'
import { imageCropKindEnum, imageCrops } from '../../database/schema'
import { sectionUpdatedAt, touchSection } from '../game-data/sections'

export const IMAGE_CROP_KINDS = imageCropKindEnum.enumValues
export type ImageCropKind = (typeof IMAGE_CROP_KINDS)[number]

export interface ImageCrop {
  size: string
  position: string
}

export interface ImageCropView extends ImageCrop {
  kind: ImageCropKind
  slug: string
}

/** GET /v1/game-data 의 imageCrops 칸. 줄이 없는 그림은 앱이 기본 크롭(cover · 가운데)으로 그린다. */
export interface ImageCropsSection {
  updatedAt: string | null
  crops: ImageCropView[]
}

@Injectable()
export class ImageCropsRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  async section(): Promise<ImageCropsSection> {
    const rows = await this.db
      .select()
      .from(imageCrops)
      .orderBy(asc(imageCrops.kind), asc(imageCrops.slug))
    return {
      updatedAt: await sectionUpdatedAt(this.db, 'imageCrops'),
      crops: rows.map((r) => ({ kind: r.kind, slug: r.slug, size: r.size, position: r.position })),
    }
  }

  async put(kind: ImageCropKind, slug: string, crop: ImageCrop): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .insert(imageCrops)
        .values({ kind, slug, ...crop })
        .onConflictDoUpdate({
          target: [imageCrops.kind, imageCrops.slug],
          set: { ...crop, updatedAt: new Date() },
        })
      await touchSection(tx, 'imageCrops')
    })
  }

  /** 줄을 지우면 앱은 그 그림을 기본 크롭으로 그린다. 없으면 false 다. */
  async remove(kind: ImageCropKind, slug: string): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const rows = await tx
        .delete(imageCrops)
        .where(and(eq(imageCrops.kind, kind), eq(imageCrops.slug, slug)))
        .returning({ id: imageCrops.id })
      if (rows.length === 0) return false
      await touchSection(tx, 'imageCrops')
      return true
    })
  }
}
