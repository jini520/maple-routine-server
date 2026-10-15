/**
 * 마이그레이션을 적용한다. `node dist/cli/migrate.js`
 *
 * 실행 이미지에는 drizzle-kit 이 없다(개발 의존성). drizzle-orm 의 migrator 가 같은 SQL 파일을 읽어
 * 같은 순서로 적용하므로 운영에서는 이것을 쓴다. 이미 적용된 것은 건너뛴다. 배포 때 컨테이너 안에서
 * `docker compose run --rm server node dist/cli/migrate.js` 로 돌린다.
 */
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { join } from 'node:path'
import { Pool } from 'pg'

/** 이미지에 그대로 실리는 SQL 폴더. Dockerfile 이 `src/database/migrations` 를 dist 옆에 복사한다. */
const MIGRATIONS_FOLDER = join(__dirname, '..', '..', 'src', 'database', 'migrations')

export async function migrateDatabase(databaseUrl: string): Promise<void> {
  const pool = new Pool({ connectionString: databaseUrl, connectionTimeoutMillis: 5_000 })
  try {
    await migrate(drizzle(pool), { migrationsFolder: MIGRATIONS_FOLDER })
  } finally {
    await pool.end()
  }
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL
  if (url === undefined || url === '') throw new Error('DATABASE_URL 이 없다')
  await migrateDatabase(url)
  console.log('마이그레이션을 적용했다')
}

if (process.argv[1]?.endsWith('migrate.js') || process.argv[1]?.endsWith('migrate.ts')) {
  main().catch((error: unknown) => {
    console.error(String(error))
    process.exitCode = 1
  })
}
