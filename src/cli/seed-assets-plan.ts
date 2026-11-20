import {
  type AssetKey,
  assetKeyText,
  FOLDER_CATEGORIES,
  parseAssetPath,
} from '../modules/assets/asset-paths'

/** 올릴 파일 하나. 경로는 올리는 폴더 기준이고 key 는 그 경로를 분류 · 파일 이름 · 확장자로 읽은 값이다. */
export interface SeedFile {
  path: string
  key: AssetKey
}

/**
 * 서버에 아직 없는 그림만 고른다. 있는 것은 건너뛴다. 운영자가 관리 화면에서 바꾼 그림을 다시 덮으면 안 되기 때문이다.
 *
 * @param local 올리는 폴더 기준 상대 경로 전부. 규칙에 없는 폴더 · 확장자는 버린다
 * @param existing 서버에 있는 그림. assetKeyText 의 글자다
 */
export function planSeed(local: readonly string[], existing: ReadonlySet<string>): SeedFile[] {
  return local
    .map((p) => p.normalize('NFC'))
    .flatMap((path) => {
      const key = parseAssetPath(path)
      return key === null || existing.has(assetKeyText(key)) ? [] : [{ path, key }]
    })
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
}

/** 올리는 폴더에서 훑는 하위 폴더. 그 아래의 폴더는 훑지 않는다. */
export const SEED_DIRS = Object.keys(FOLDER_CATEGORIES)
