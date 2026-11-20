import { and, type AnyColumn, eq, inArray } from 'drizzle-orm'

import { assets } from '../../database/schema'
import type { DbOrTx } from '../game-data/sections'
import { ASSET_REFS, type AssetRef, refCandidates } from './asset-paths'

/**
 * 옛 그림 이름을 다시 만드는 두 칸. select 에 묶어 넣으면 left join 에서 그림이 없을 때 묶음이 null 이 된다.
 *
 * @example
 * this.db.select({ icon: assetNameColumns(assets) }).from(items).leftJoin(assets, eq(assets.id, items.iconAssetId))
 */
export function assetNameColumns<T extends { fileName: AnyColumn; extension: AnyColumn }>(
  table: T,
): { fileName: T['fileName']; extension: T['extension'] } {
  return { fileName: table.fileName, extension: table.extension }
}

/** 그림 줄을 옛 앱이 읽던 글자로 되돌린다. 파일 이름 칸은 확장자까지, slug 칸은 확장자를 뗀 이름이다. */
export function refValueOf(ref: AssetRef, asset: { fileName: string; extension: string }): string {
  return ASSET_REFS[ref].key === 'fileName'
    ? `${asset.fileName}.${asset.extension}`
    : asset.fileName
}

/** refValueOf 의 그림이 없을 수 있는 칸. */
export function optionalRefValueOf(
  ref: AssetRef,
  asset: { fileName: string; extension: string } | null,
): string | null {
  return asset === null ? null : refValueOf(ref, asset)
}

/** 그림 칸 값이 가리킬 그림이 표에 없다. message 가 그 값이다. */
export class AssetNotFound extends Error {}

/**
 * 그림 칸 값 하나를 그림 id 로 푼다. 후보가 여럿이면 refCandidates 의 차례에서 앞선 것이다. 표에 없으면 AssetNotFound 다.
 */
export async function resolveAssetId(db: DbOrTx, ref: AssetRef, value: string): Promise<string> {
  const candidates = refCandidates(ref, value)
  const first = candidates[0]
  if (first === undefined) throw new AssetNotFound(value)
  const rows = await db
    .select({ id: assets.id, category: assets.category, extension: assets.extension })
    .from(assets)
    .where(
      and(
        inArray(
          assets.category,
          candidates.map((c) => c.category),
        ),
        eq(assets.fileName, first.fileName),
      ),
    )
  const hit = candidates
    .map((c) => rows.find((r) => r.category === c.category && r.extension === c.extension))
    .find((r) => r !== undefined)
  if (hit === undefined) throw new AssetNotFound(value)
  return hit.id
}

/** 비운 칸(null · undefined)은 null 이다. */
export async function resolveOptionalAssetId(
  db: DbOrTx,
  ref: AssetRef,
  value: string | null | undefined,
): Promise<string | null> {
  return value == null ? null : resolveAssetId(db, ref, value)
}
