import { sql } from 'drizzle-orm'

import type { DbOrTx } from '../game-data/sections'

/** 그림을 쓰는 곳 하나. 아이템이면 그 아이템의 분류 key 를 든다. 그림 화면 트리가 아이템 그림을 이 분류로 묶는다. */
export interface AssetUse {
  kind: string
  name: string
  itemCategory: string | null
}

/**
 * 그림 표를 FK 로 가리키는 칸 전부와 그 줄을 부를 이름. 크롭은 그림에 딸린 값이라 넣지 않는다(앱 저장소 ADR-187 결정 6).
 * 칸을 더하면 여기에도 더한다. 빠지면 그 칸이 쓰는 그림을 안 쓰는 그림으로 보고 지울 수 있게 된다.
 */
export const ASSET_USES = [
  { table: 'items', column: 'icon_asset_id', kind: '아이템', name: 'name', category: 'category' },
  { table: 'bosses', column: 'portrait_asset_id', kind: '보스 초상', name: 'name' },
  { table: 'worlds', column: 'emblem_asset_id', kind: '월드 엠블럼', name: 'name' },
  { table: 'mvp_grades', column: 'plate_asset_id', kind: 'MVP 명패', name: 'name' },
  { table: 'symbols', column: 'icon_asset_id', kind: '심볼', name: 'name' },
  { table: 'hexa_core_kinds', column: 'icon_asset_id', kind: '헥사 코어 종류', name: 'name' },
  {
    table: 'hexa_job_cores',
    column: 'icon_asset_id',
    kind: '헥사 직업 코어',
    name: "job || ' · ' || name",
  },
  { table: 'spend_tiles', column: 'icon_asset_id', kind: '지출 타일', name: 'name' },
  { table: 'spend_tiles', column: 'icon_map_asset_id', kind: '지출 타일 지도', name: 'name' },
  { table: 'cashbook_categories', column: 'icon_asset_id', kind: '가계부 분류', name: 'name' },
  {
    table: 'contents',
    column: 'background_map_asset_id',
    kind: '컨텐츠 배경 지도',
    name: 'display_name',
  },
  {
    table: 'contents',
    column: 'background_portrait_asset_id',
    kind: '컨텐츠 배경 초상',
    name: 'display_name',
  },
  {
    table: 'contents',
    column: 'region_icon_asset_id',
    kind: '컨텐츠 지역 아이콘',
    name: 'display_name',
  },
  { table: 'hunting_regions', column: 'icon_map_asset_id', kind: '사냥 지역 아이콘', name: 'name' },
  { table: 'app_images', column: 'asset_id', kind: '앱 그림', name: 'key' },
] as const satisfies readonly {
  table: string
  column: string
  kind: string
  name: string
  category?: string
}[]

/**
 * 그림 id 마다 쓰는 곳 목록. 쓰는 곳이 없는 그림은 키가 없다. 목록 안은 종류 · 이름 차례다.
 *
 * @param assetId 주면 그 그림 하나만 본다. 지우기 전에 쓰는 곳이 있는지 볼 때 쓴다
 */
export async function assetUses(db: DbOrTx, assetId?: string): Promise<Map<string, AssetUse[]>> {
  // 표 · 칸 이름은 위 상수에서만 오므로 그대로 잇는다.
  const parts = ASSET_USES.map(
    (u, i) =>
      `SELECT ${u.column} AS asset_id, ${i} AS ord, '${u.kind}' AS kind, (${u.name})::text AS name, ` +
      `${'category' in u ? u.category : 'NULL'}::text AS item_category FROM ${u.table} WHERE ${u.column} IS NOT NULL`,
  )
  const where = assetId === undefined ? sql`` : sql` WHERE asset_id = ${assetId}`
  const { rows } = await db.execute<{
    asset_id: string
    kind: string
    name: string
    item_category: string | null
  }>(sql`SELECT * FROM (${sql.raw(parts.join(' UNION ALL '))}) uses${where} ORDER BY ord, name`)
  const out = new Map<string, AssetUse[]>()
  for (const r of rows) {
    const list = out.get(r.asset_id) ?? []
    list.push({ kind: r.kind, name: r.name, itemCategory: r.item_category })
    out.set(r.asset_id, list)
  }
  return out
}
