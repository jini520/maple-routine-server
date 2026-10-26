import { ASSET_DIRS, parseAssetPath } from '../modules/assets/asset-paths'
import type { ImageCrop, ImageCropKind } from '../modules/assets/image-crops.repository'

/** 앱 저장소의 크롭 파일과 서버 크롭 종류의 짝. */
export const CROP_FILES: Record<ImageCropKind, string> = {
  boss_portrait: 'boss-portrait-crops.json',
  boss_portrait_icon: 'boss-portrait-icon-crops.json',
  boss_portrait_modal: 'boss-portrait-modal-crops.json',
  daily_quest_region: 'daily-quest-region-crops.json',
}

export interface SeedPlan {
  files: string[]
  crops: { kind: ImageCropKind; slug: string; crop: ImageCrop }[]
}

/**
 * 서버에 아직 없는 그림 경로와 크롭 줄만 고른다. 있는 것은 건너뛴다. 운영자가 관리 화면에서 바꾼 그림과
 * 크롭을 시드가 되돌리면 안 되기 때문이다.
 *
 * @param local 앱 `src/assets/` 기준 상대 경로 전부. 규칙에 없는 디렉터리 · 확장자는 버린다
 */
export function planSeed(
  local: readonly string[],
  existingPaths: ReadonlySet<string>,
  localCrops: Partial<Record<ImageCropKind, Record<string, ImageCrop>>>,
  existingCrops: readonly { kind: ImageCropKind; slug: string }[],
): SeedPlan {
  const files = local
    .map((p) => p.normalize('NFC'))
    .filter((p) => parseAssetPath(p) !== null && !existingPaths.has(p))
    .sort()
  const has = new Set(existingCrops.map((c) => `${c.kind}/${c.slug}`))
  const crops = (Object.keys(CROP_FILES) as ImageCropKind[]).flatMap((kind) =>
    Object.entries(localCrops[kind] ?? {})
      .map(([slug, crop]) => ({ kind, slug: slug.normalize('NFC'), crop }))
      .filter((c) => !has.has(`${c.kind}/${c.slug}`)),
  )
  return { files, crops }
}

/** 시드가 훑는 디렉터리. 앱 쪽에서 하위 디렉터리를 훑지 않는 규칙과 같다. */
export const SEED_DIRS = Object.keys(ASSET_DIRS)
