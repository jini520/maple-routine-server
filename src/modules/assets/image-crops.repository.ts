import { Inject, Injectable } from '@nestjs/common'
import { and, asc, eq, sql } from 'drizzle-orm'

import { DB, type Db } from '../../database/database.module'
import { assets, imageCropKindEnum, imageCrops } from '../../database/schema'
import { type DbOrTx, sectionUpdatedAt, touchSection } from '../game-data/sections'
import type { AssetRef } from './asset-paths'
import { AssetNotFound, refValueOf, resolveAssetId } from './asset-refs'

export const IMAGE_CROP_KINDS = imageCropKindEnum.enumValues
export type ImageCropKind = (typeof IMAGE_CROP_KINDS)[number]

export interface ImageCrop {
  size: string
  position: string
}

export interface ImageCropView extends ImageCrop {
  kind: ImageCropKind
  /** 옛 앱이 읽는 그림 이름 */
  slug: string
  assetId: string
}

/** GET /v1/game-data 의 imageCrops 칸. 줄이 없는 그림은 앱이 기본 크롭(cover · 가운데)으로 그린다. */
export interface ImageCropsSection {
  updatedAt: string | null
  crops: ImageCropView[]
}

/** 크롭 종류마다 자르는 그림. 보스 초상 셋은 보스 초상, 지역은 지역 지도다. */
function refOf(kind: ImageCropKind): AssetRef {
  return kind === 'daily_quest_region' ? 'mapBackground' : 'bossPortrait'
}

/** 그림 경로에서 확장자를 뗀 이름. 옛 slug 칸과 같은 값이라 정렬도 옛 칸과 같다. */
const SLUG_OF_PATH = sql`regexp_replace(regexp_replace(${assets.path}, '^.*/', ''), '\.[^.]*$', '')`

@Injectable()
export class ImageCropsRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  async section(): Promise<ImageCropsSection> {
    const rows = await this.db
      .select({
        kind: imageCrops.kind,
        path: assets.path,
        assetId: imageCrops.assetId,
        size: imageCrops.size,
        position: imageCrops.position,
      })
      .from(imageCrops)
      .innerJoin(assets, eq(assets.id, imageCrops.assetId))
      .orderBy(asc(imageCrops.kind), asc(SLUG_OF_PATH))
    return {
      updatedAt: await sectionUpdatedAt(this.db, 'imageCrops'),
      crops: rows.map((r) => ({
        kind: r.kind,
        slug: refValueOf(refOf(r.kind), r.path),
        assetId: r.assetId,
        size: r.size,
        position: r.position,
      })),
    }
  }

  /** 그 종류가 자르는 그림이 표에 없으면 AssetNotFound 다. */
  async put(kind: ImageCropKind, slug: string, crop: ImageCrop): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .insert(imageCrops)
        .values({ kind, assetId: await resolveAssetId(tx, refOf(kind), slug), ...crop })
        .onConflictDoUpdate({
          target: [imageCrops.kind, imageCrops.assetId],
          set: { ...crop, updatedAt: new Date() },
        })
      await touchSection(tx, 'imageCrops')
    })
  }

  /** 줄을 지우면 앱은 그 그림을 기본 크롭으로 그린다. 없으면 false 다. */
  async remove(kind: ImageCropKind, slug: string): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const assetId = await assetIdOrNull(tx, kind, slug)
      if (assetId === null) return false
      const rows = await tx
        .delete(imageCrops)
        .where(and(eq(imageCrops.kind, kind), eq(imageCrops.assetId, assetId)))
        .returning({ id: imageCrops.id })
      if (rows.length === 0) return false
      await touchSection(tx, 'imageCrops')
      return true
    })
  }
}

/** 지울 줄을 찾을 때는 그림이 없으면 줄도 없는 것이다. */
async function assetIdOrNull(
  db: DbOrTx,
  kind: ImageCropKind,
  slug: string,
): Promise<string | null> {
  try {
    return await resolveAssetId(db, refOf(kind), slug)
  } catch (error) {
    if (error instanceof AssetNotFound) return null
    throw error
  }
}
