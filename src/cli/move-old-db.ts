/**
 * 옛 DB(1.0.14 까지의 운영 DB)의 줄을 새 DB(1.0.15)로 옮긴다.
 *
 * 새 DB 는 마이그레이션을 처음부터 적용한 빈 DB 다. 옛 DB 는 읽기만 한다. 표 묶음 PR 마다 그 묶음의 표를 더한다.
 * 줄 id 는 그대로 옮긴다. 기기가 받아 둔 그림과 기기의 기록이 이 id 로 줄을 가리킨다.
 *
 * @example
 * OLD_DATABASE_URL=postgres://…/maple_routine DATABASE_URL=postgres://…/maple_routine_next node dist/cli/move-old-db.js
 */
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'

import * as oldSchema from '../database/old-schema'
import * as schema from '../database/schema'
import { parseAssetPath } from '../modules/assets/asset-paths'

export type OldDb = NodePgDatabase<typeof oldSchema>
export type NewDb = NodePgDatabase<typeof schema>

/** 옮긴 표마다 줄 수 */
export interface MoveResult {
  assets: number
  bosses: number
  bossDifficulties: number
}

/** 새 DB 의 옮길 표에 줄이 있다. 운영 덤프로 연습할 때 같은 줄을 두 번 넣지 않게 멈춘다. */
export class NotEmpty extends Error {
  constructor(readonly table: string) {
    super(`새 DB 의 ${table} 에 줄이 있다`)
  }
}

/** 옛 그림 경로의 폴더 · 확장자를 분류로 읽지 못했다. message 가 그 경로다. */
export class UnknownAssetPath extends Error {}

/** 한 번에 넣는 줄 수. Postgres 의 자리 표시자 상한(65535)을 넘지 않게 나눈다. */
const CHUNK = 1000

/** 한 트랜잭션으로 옮긴다. 도중에 실패하면 새 DB 에 아무것도 남지 않는다. */
export async function moveOldDb(oldDb: OldDb, newDb: NewDb): Promise<MoveResult> {
  const [oldAssets, oldBosses, oldDifficulties] = await Promise.all([
    oldDb.select().from(oldSchema.assets),
    oldDb.select().from(oldSchema.bosses),
    oldDb.select().from(oldSchema.bossDifficulties),
  ])

  const assets = oldAssets.map((r) => {
    const key = parseAssetPath(r.path)
    if (key === null) throw new UnknownAssetPath(r.path)
    return {
      id: r.id,
      ...key,
      sha256: r.sha256,
      sizeBytes: r.size,
      width: r.width,
      height: r.height,
      name: r.name,
      updatedAt: r.updatedAt,
    }
  })
  // 옛 표는 시즌 보스를 주기의 값(event_weekly)으로 적었다. 시즌 보스의 주기는 주간이다.
  const cycleOf = new Map(oldBosses.map((b) => [b.id, b.cycle]))
  const bosses = oldBosses.map((r) => ({
    id: r.id,
    key: r.key,
    name: r.name,
    shortName: r.alias,
    isSeasonBoss: r.cycle === 'event_weekly',
    portraitAssetId: r.portraitAssetId,
    sortOrder: r.sortOrder,
    validFrom: r.from,
    validUntil: r.until,
    updatedAt: r.updatedAt,
  }))
  const bossDifficulties = oldDifficulties.map((r) => ({
    id: r.id,
    bossId: r.bossId,
    difficulty: r.difficulty,
    cycle: cycleOf.get(r.bossId) === 'monthly' ? ('monthly' as const) : ('weekly' as const),
    requiredLevel: r.requiredLevel,
    maxPartySize: r.maxPartySize,
    validFrom: r.from,
    validUntil: r.until,
  }))

  await newDb.transaction(async (tx) => {
    for (const [name, table] of [
      ['assets', schema.assets],
      ['bosses', schema.bosses],
      ['boss_difficulties', schema.bossDifficulties],
    ] as const) {
      const [row] = await tx.select({ id: table.id }).from(table).limit(1)
      if (row !== undefined) throw new NotEmpty(name)
    }
    for (const rows of chunks(assets)) await tx.insert(schema.assets).values(rows)
    for (const rows of chunks(bosses)) await tx.insert(schema.bosses).values(rows)
    for (const rows of chunks(bossDifficulties))
      await tx.insert(schema.bossDifficulties).values(rows)
  })
  return { assets: assets.length, bosses: bosses.length, bossDifficulties: bossDifficulties.length }
}

function chunks<T>(rows: readonly T[]): T[][] {
  const out: T[][] = []
  for (let i = 0; i < rows.length; i += CHUNK) out.push(rows.slice(i, i + CHUNK))
  return out
}

async function main(): Promise<void> {
  const oldUrl = process.env.OLD_DATABASE_URL
  const newUrl = process.env.DATABASE_URL
  if (oldUrl === undefined || oldUrl === '' || newUrl === undefined || newUrl === '')
    throw new Error('OLD_DATABASE_URL 과 DATABASE_URL 이 둘 다 있어야 한다')
  if (oldUrl === newUrl) throw new Error('옛 DB 와 새 DB 가 같다')
  const oldPool = new Pool({ connectionString: oldUrl })
  const newPool = new Pool({ connectionString: newUrl })
  try {
    const result = await moveOldDb(
      drizzle(oldPool, { schema: oldSchema }),
      drizzle(newPool, { schema }),
    )
    console.log(`옮겼다: ${JSON.stringify(result)}`)
  } finally {
    await Promise.all([oldPool.end(), newPool.end()])
  }
}

if (process.argv[1]?.endsWith('move-old-db.js') || process.argv[1]?.endsWith('move-old-db.ts')) {
  main().catch((error: unknown) => {
    console.error(String(error))
    process.exitCode = 1
  })
}
