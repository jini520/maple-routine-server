import type { AssetUse } from './asset-uses'

/** 이름을 정할 그림 한 장. category 는 그림 분류, fileName 은 확장자를 뗀 파일 이름이다. */
export interface LabelSource {
  category: string
  fileName: string
  uses: readonly AssetUse[]
}

/** 지도 배경과 지도 아이콘의 분류. 한 장을 퀘스트 여러 개가 함께 써서 쓰는 곳의 이름이 그림 이름이 되지 못한다. */
const MAP_CATEGORIES = ['map', 'map_icon']

/** 지역 이름을 가져오는 쓰는 곳의 종류. 앞의 것이 먼저다. `asset-uses.ts` 의 kind 와 글자가 같아야 한다. */
export const REGION_KINDS = ['사냥 지역 아이콘', '지출 타일']

/**
 * 이름 칸이 비었을 때 관리 화면에 보이는 그림 이름 목록. 차례는 받은 차례와 같다.
 * 지도 그림은 같은 파일 이름의 지도 아이콘을 쓰는 지역의 이름, 없으면 파일 이름이다. 다른 그림은 첫 쓰는 곳의 이름, 없으면 파일 이름이다.
 */
export function autoLabels(rows: readonly LabelSource[]): string[] {
  const regions = new Map<string, string>()
  for (const r of rows) {
    if (r.category !== 'map_icon') continue
    const name = REGION_KINDS.map((k) => r.uses.find((u) => u.kind === k)?.name).find(Boolean)
    if (name !== undefined && !regions.has(r.fileName)) regions.set(r.fileName, name)
  }
  return rows.map((r) =>
    MAP_CATEGORIES.includes(r.category)
      ? (regions.get(r.fileName) ?? r.fileName)
      : (r.uses[0]?.name ?? r.fileName),
  )
}
