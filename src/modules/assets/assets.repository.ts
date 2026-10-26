import { Inject, Injectable } from '@nestjs/common'
import { asc, eq, inArray } from 'drizzle-orm'

import { DB, type Db } from '../../database/database.module'
import { assets } from '../../database/schema'
import { sectionUpdatedAt, touchSection } from '../game-data/sections'
import { type AssetRef, parseAssetPath, refCandidates, storedFileName } from './asset-paths'

export interface AssetFileView {
  /** 앱 `src/assets/` 기준 경로. 앱은 이 경로로 그림을 찾는다 */
  path: string
  /** nginx `/assets/` 아래의 파일 이름 */
  file: string
  sha256: string
  size: number
}

/** GET /v1/game-data 의 assets 칸. 앱은 sha256 이 바뀐 그림만 다시 받는다. */
export interface AssetsSection {
  updatedAt: string | null
  files: AssetFileView[]
}

@Injectable()
export class AssetsRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  async section(): Promise<AssetsSection> {
    const rows = await this.db.select().from(assets).orderBy(asc(assets.path))
    return {
      updatedAt: await sectionUpdatedAt(this.db, 'assets'),
      files: rows.map((r) => ({
        path: r.path,
        file: storedFileName(r.sha256, parseAssetPath(r.path)?.ext ?? 'png'),
        sha256: r.sha256,
        size: r.size,
      })),
    }
  }

  /** 경로 하나의 내용을 적는다. 같은 해시면 아무것도 안 바꾼다. 앱이 바뀌지 않은 그림을 다시 받지 않게 하기 위해서다. */
  async put(path: string, sha256: string, size: number): Promise<'created' | 'updated' | 'same'> {
    return this.db.transaction(async (tx) => {
      const [current] = await tx.select().from(assets).where(eq(assets.path, path))
      if (current?.sha256 === sha256) return 'same'
      if (current === undefined) await tx.insert(assets).values({ path, sha256, size })
      else
        await tx
          .update(assets)
          .set({ sha256, size, updatedAt: new Date() })
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
