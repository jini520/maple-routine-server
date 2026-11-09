import { inArray } from 'drizzle-orm'

import { assets } from '../../database/schema'
import type { DbOrTx } from '../game-data/sections'
import { ASSET_REFS, type AssetRef, refCandidates } from './asset-paths'

/**
 * 그림 경로를 그 칸이 앱에 내던 글자로 되돌린다. 표는 그림 id 를 들고, 앱 계약은 글자라서 칸을 낼 때마다 부른다.
 * 파일 이름 칸은 확장자까지, slug 칸은 확장자를 뗀 이름이다.
 */
export function refValueOf(ref: AssetRef, path: string): string {
  const base = path.slice(path.lastIndexOf('/') + 1)
  return ASSET_REFS[ref].key === 'fileName' ? base : base.slice(0, base.lastIndexOf('.'))
}

/** refValueOf 의 그림이 없을 수 있는 칸. */
export function optionalRefValueOf(ref: AssetRef, path: string | null): string | null {
  return path === null ? null : refValueOf(ref, path)
}

/** 그림 칸 값이 가리킬 그림이 표에 없다. message 가 그 값이다. */
export class AssetNotFound extends Error {}

/**
 * 그림 칸 값 하나를 그림 id 로 푼다. 후보가 여럿이면 앱이 찾는 차례(폴더 · 확장자)에서 앞선 것이다. 0029 이관의 차례와 같다.
 * 표에 없으면 AssetNotFound 다.
 */
export async function resolveAssetId(db: DbOrTx, ref: AssetRef, value: string): Promise<string> {
  const candidates = refCandidates(ref, value)
  const rows = await db
    .select({ id: assets.id, path: assets.path })
    .from(assets)
    .where(inArray(assets.path, candidates))
  const hit = candidates.map((c) => rows.find((r) => r.path === c)).find((r) => r !== undefined)
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

/** 그림 표를 한 번 읽어 두고 칸 값을 푸는 함수 둘. resolveAssetId 와 같은 차례로 고른다. */
export interface AssetResolver {
  /** 표에 없으면 AssetNotFound 다. */
  id(ref: AssetRef, value: string): string
  /** 비운 칸(null · undefined)은 null 이다. */
  optional(ref: AssetRef, value: string | null | undefined): string | null
  /** 경로 그대로 찾는다. 표에 없으면 AssetNotFound 다. */
  path(path: string): string
}

/** 줄이 많은 시드가 줄마다 그림 표를 묻지 않게 그림 표를 한 번 읽는다. */
export async function assetResolver(db: DbOrTx): Promise<AssetResolver> {
  const rows = await db.select({ id: assets.id, path: assets.path }).from(assets)
  const byPath = new Map(rows.map((r) => [r.path, r.id]))
  const id = (ref: AssetRef, value: string): string => {
    const hit = refCandidates(ref, value)
      .map((c) => byPath.get(c))
      .find((v) => v !== undefined)
    if (hit === undefined) throw new AssetNotFound(value)
    return hit
  }
  const path = (value: string): string => {
    const hit = byPath.get(value.normalize('NFC'))
    if (hit === undefined) throw new AssetNotFound(value)
    return hit
  }
  return { id, optional: (ref, value) => (value == null ? null : id(ref, value)), path }
}
