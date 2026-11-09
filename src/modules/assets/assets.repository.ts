import { Inject, Injectable } from '@nestjs/common'
import { asc, eq, inArray } from 'drizzle-orm'

import { DB, type Db } from '../../database/database.module'
import { assets, imageCrops } from '../../database/schema'
import { sectionUpdatedAt, touchSection } from '../game-data/sections'
import { type AssetRef, parseAssetPath, refCandidates, storedFileName } from './asset-paths'
import { type AssetUse, assetUses } from './asset-uses'

export interface AssetFileView {
  /** 그림 표의 id. 게임 데이터 표의 그림 칸이 이 값을 든다 */
  id: string
  /** 앱 `src/assets/` 기준 경로. 옛 앱이 이 경로로 그림을 찾는다 */
  path: string
  /** nginx `/assets/` 아래의 파일 이름 */
  file: string
  sha256: string
  size: number
  width: number
  height: number
}

/** GET /v1/game-data 의 assets 칸. 앱은 sha256 이 바뀐 그림만 다시 받는다. */
export interface AssetsSection {
  updatedAt: string | null
  files: AssetFileView[]
}

/** 그림 화면의 줄. 앱에는 내지 않는다. */
export interface AssetAdminRow extends AssetFileView {
  /** 관리 화면에서 적은 이름. 비어 있을 수 있다. */
  name: string | null
  /** 보이는 이름. 적은 이름, 없으면 첫 쓰는 곳의 이름, 그것도 없으면 확장자를 뗀 파일 이름이다. */
  label: string
  uses: AssetUse[]
  /** 아이템이 쓰는 그림이면 첫 아이템의 분류. 트리가 아이템 그림을 이 분류로 묶는다. */
  itemCategory: string | null
}

/** 쓰는 곳이 있는 그림을 지우려 했다. 지우면 그 칸의 그림이 앱에서 빠진다. */
export class AssetInUse extends Error {
  constructor(readonly uses: AssetUse[]) {
    super(`쓰는 곳 ${uses.length}곳`)
  }
}

@Injectable()
export class AssetsRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  async section(): Promise<AssetsSection> {
    const rows = await this.db.select().from(assets).orderBy(asc(assets.path))
    return {
      updatedAt: await sectionUpdatedAt(this.db, 'assets'),
      files: rows.map((r) => ({
        id: r.id,
        path: r.path,
        file: storedFileName(r.sha256, parseAssetPath(r.path)?.ext ?? 'png'),
        sha256: r.sha256,
        size: r.size,
        width: r.width,
        height: r.height,
      })),
    }
  }

  async adminRows(): Promise<AssetAdminRow[]> {
    const [{ files }, uses] = await Promise.all([this.section(), assetUses(this.db)])
    const names = new Map(
      (await this.db.select({ id: assets.id, name: assets.name }).from(assets)).map((r) => [
        r.id,
        r.name,
      ]),
    )
    return files.map((f) => {
      const list = uses.get(f.id) ?? []
      const name = names.get(f.id) ?? null
      const base = f.path.slice(f.path.lastIndexOf('/') + 1)
      return {
        ...f,
        name,
        label: name ?? list[0]?.name ?? base.slice(0, base.lastIndexOf('.')),
        uses: list,
        itemCategory: list.find((u) => u.itemCategory !== null)?.itemCategory ?? null,
      }
    })
  }

  /** 관리 화면 이름을 적거나(null 이면) 비운다. 앱에 내지 않는 칸이라 그림 칸의 시각은 그대로다. 모르는 id 는 false 다. */
  async rename(id: string, name: string | null): Promise<boolean> {
    const rows = await this.db
      .update(assets)
      .set({ name })
      .where(eq(assets.id, id))
      .returning({ id: assets.id })
    return rows.length > 0
  }

  /**
   * 쓰는 곳이 없는 그림을 지운다. 그 그림의 크롭도 함께 지운다(앱 저장소 ADR-187 결정 6). 디스크의 해시 파일은 옛 목록을
   * 받은 앱이 받는 중일 수 있어 남긴다. 쓰는 곳이 있으면 AssetInUse, 모르는 id 는 false 다.
   */
  async remove(id: string): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const [row] = await tx.select({ id: assets.id }).from(assets).where(eq(assets.id, id))
      if (row === undefined) return false
      const uses = (await assetUses(tx, id)).get(id) ?? []
      if (uses.length > 0) throw new AssetInUse(uses)
      const crops = await tx
        .delete(imageCrops)
        .where(eq(imageCrops.assetId, id))
        .returning({ id: imageCrops.id })
      await tx.delete(assets).where(eq(assets.id, id))
      await touchSection(tx, 'assets')
      if (crops.length > 0) await touchSection(tx, 'imageCrops')
      return true
    })
  }

  /** 경로 하나의 내용을 적는다. 같은 해시면 아무것도 안 바꾼다. 앱이 바뀌지 않은 그림을 다시 받지 않게 하기 위해서다. */
  async put(
    path: string,
    sha256: string,
    dims: { size: number; width: number; height: number },
  ): Promise<'created' | 'updated' | 'same'> {
    return this.db.transaction(async (tx) => {
      const [current] = await tx.select().from(assets).where(eq(assets.path, path))
      if (current?.sha256 === sha256) return 'same'
      if (current === undefined) await tx.insert(assets).values({ path, sha256, ...dims })
      else
        await tx
          .update(assets)
          .set({ sha256, ...dims, updatedAt: new Date() })
          .where(eq(assets.id, current.id))
      await touchSection(tx, 'assets')
      return current === undefined ? 'created' : 'updated'
    })
  }

  /** 그림 칸 값 가운데 가리키는 그림이 표에 없는 값. 겹치는 값은 한 번만 낸다. */
  async missing(refs: readonly { ref: AssetRef; value: string }[]): Promise<string[]> {
    if (refs.length === 0) return []
    const candidates = refs.map((r) => refCandidates(r.ref, r.value))
    const rows = await this.db
      .select({ path: assets.path })
      .from(assets)
      .where(inArray(assets.path, candidates.flat()))
    const present = new Set(rows.map((r) => r.path))
    const missing = refs.filter((_, i) => !candidates[i]?.some((c) => present.has(c)))
    return [...new Set(missing.map((r) => r.value))]
  }
}
