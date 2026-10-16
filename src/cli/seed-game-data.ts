/**
 * 게임 데이터 표의 첫 채움. `node dist/cli/seed-game-data.js`
 *
 * `src/database/seed/<표>.json` 을 읽어 **비어 있는 표만** 채운다. 줄이 하나라도 있는 표는 건너뛴다.
 * 운영자가 관리 화면 폼으로 고친 값을 배포 때 씨앗이 되돌리면 안 되기 때문이다. 씨앗 파일은 앱 번들
 * JSON 과 같은 모양이고 `updatedAt` 은 있어도 버린다. 서버가 넣는 시각이 기준이다.
 *
 * 마이그레이션처럼 컨테이너 안에서 돌린다. `docker compose run --rm server node dist/cli/seed-game-data.js`
 */
import { drizzle } from 'drizzle-orm/node-postgres'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Pool } from 'pg'
import { z } from 'zod'

import type { Db } from '../database/database.module'
import * as schema from '../database/schema'
import { bossInput, rulesInput } from '../modules/bosses/bosses.dto'
import { BossesRepository } from '../modules/bosses/bosses.repository'

/** 이미지에 그대로 실리는 씨앗 폴더. Dockerfile 이 `src/database/seed` 를 dist 옆에 복사한다. */
const SEED_FOLDER = join(__dirname, '..', '..', 'src', 'database', 'seed')

const bossesSeed = z.object({ rules: rulesInput, bosses: z.array(bossInput).min(1) })
export type BossesSeed = z.infer<typeof bossesSeed>

/** 보스 씨앗. 모양이 어긋나면 던진다. 모르는 칸은 버린다. */
export function parseBossesSeed(value: unknown): BossesSeed {
  return bossesSeed.parse(value)
}

export interface GameDataSeeds {
  bosses?: BossesSeed
}

export type SeedOutcome = 'seeded' | 'skipped'

/** 씨앗이 있는 표마다 채웠는지 건너뛰었는지를 돌려준다. */
export async function seedGameData(
  db: Db,
  seeds: GameDataSeeds,
): Promise<Partial<Record<keyof GameDataSeeds, SeedOutcome>>> {
  const result: Partial<Record<keyof GameDataSeeds, SeedOutcome>> = {}
  if (seeds.bosses !== undefined) result.bosses = await seedBosses(db, seeds.bosses)
  return result
}

async function seedBosses(db: Db, seed: BossesSeed): Promise<SeedOutcome> {
  const repo = new BossesRepository(db)
  if ((await repo.options()).length > 0) return 'skipped'
  await repo.setRules(seed.rules)
  for (const boss of seed.bosses) await repo.createBoss(boss)
  return 'seeded'
}

function readSeed(name: string): unknown {
  return JSON.parse(readFileSync(join(SEED_FOLDER, `${name}.json`), 'utf8'))
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL
  if (url === undefined || url === '') throw new Error('DATABASE_URL 이 없다')
  const pool = new Pool({ connectionString: url, connectionTimeoutMillis: 5_000 })
  try {
    const db = drizzle(pool, { schema })
    const result = await seedGameData(db, { bosses: parseBossesSeed(readSeed('bosses')) })
    for (const [table, outcome] of Object.entries(result)) {
      console.log(`${table}: ${outcome === 'seeded' ? '채웠다' : '줄이 있어 건너뛰었다'}`)
    }
  } finally {
    await pool.end()
  }
}

if (
  process.argv[1]?.endsWith('seed-game-data.js') ||
  process.argv[1]?.endsWith('seed-game-data.ts')
) {
  main().catch((error: unknown) => {
    console.error(String(error))
    process.exitCode = 1
  })
}
