import type { AssetUse } from './asset-uses'

/** 이름을 정할 그림 한 장. dir 은 경로의 폴더, slug 는 확장자를 뗀 파일 이름이다. */
export interface LabelSource {
  dir: string
  slug: string
  uses: readonly AssetUse[]
}

/** 지도 배경과 지도 아이콘의 폴더. 한 장을 퀘스트 여러 개가 함께 써서 쓰는 곳의 이름이 그림 이름이 되지 못한다. */
const MAP_DIRS = ['maps', 'maps/icons']

/** 지역 이름을 가져오는 쓰는 곳의 종류. 앞의 것이 먼저다. `asset-uses.ts` 의 kind 와 글자가 같아야 한다. */
export const REGION_KINDS = ['사냥 지역 아이콘', '지출 타일 지도']

/**
 * 이름 칸이 비었을 때 관리 화면에 보이는 그림 이름 목록. 차례는 받은 차례와 같다.
 * 지도 그림은 같은 slug 의 지도 아이콘을 쓰는 지역의 이름, 없으면 파일 이름이다. 다른 그림은 첫 쓰는 곳의 이름, 없으면 파일 이름이다.
 */
export function autoLabels(rows: readonly LabelSource[]): string[] {
  const regions = new Map<string, string>()
  for (const r of rows) {
    if (r.dir !== 'maps/icons') continue
    const name = REGION_KINDS.map((k) => r.uses.find((u) => u.kind === k)?.name).find(Boolean)
    if (name !== undefined && !regions.has(r.slug)) regions.set(r.slug, name)
  }
  return rows.map((r) =>
    MAP_DIRS.includes(r.dir) ? (regions.get(r.slug) ?? r.slug) : (r.uses[0]?.name ?? r.slug),
  )
}
