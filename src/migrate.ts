/**
 * 부팅 때 `migrations/` 의 아직 안 적용된 파일을 순서대로 돌린다.
 *
 * 배포 단계가 아니라 부팅에 거는 이유는 **배포가 `docker compose up -d --build` 한 줄**이기
 * 때문이다. 마이그레이션을 따로 돌리는 단계를 두면 그 단계를 빠뜨린 배포가 컬럼 없는 DB 에
 * 새 코드를 얹는다.
 *
 * **인스턴스가 여럿이어도 한 번만 돈다.** `node-pg-migrate` 가 마이그레이션 동안 postgres
 * 어드바이저리 락(`PG_MIGRATE_LOCK_ID`)을 잡아서, 같이 뜬 인스턴스는 기다렸다가 이미 적용된
 * 것을 보고 그냥 지나간다.
 */
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

import { runner } from 'node-pg-migrate'

/** 적용 이력이 쌓이는 표. 이 이름을 바꾸면 이미 적용된 것을 다시 돌린다. */
const MIGRATIONS_TABLE = 'pgmigrations'

/**
 * 마이그레이션이 사는 자리. **이 파일 기준이 아니라 돌린 자리 기준이다.**
 *
 * 빌드가 `dist/src/main.js` 로 나가서 파일 기준으로 잡으면 개발(`src/`)과 배포(`dist/src/`)의
 * 깊이가 달라진다. 두 경우 모두 저장소 뿌리에서 돌리므로 그쪽을 기준으로 잡는다.
 */
const MIGRATIONS_DIR = resolve(process.cwd(), 'migrations')

export async function migrate(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL
  if (databaseUrl === undefined || databaseUrl === '') {
    throw new Error('DATABASE_URL 이 없어 스키마를 맞출 수 없다')
  }

  // 없는 자리를 주면 **적용할 것이 없다** 로 조용히 지나간다. 그러면 컬럼 없는 DB 에 새 코드가
  // 얹히고, 그 사실은 첫 쿼리가 42703 으로 죽을 때 드러난다. 여기서 시끄럽게 멈춘다.
  if (!existsSync(MIGRATIONS_DIR)) {
    throw new Error(`마이그레이션 자리가 없다: ${MIGRATIONS_DIR}`)
  }

  await runner({
    databaseUrl,
    dir: MIGRATIONS_DIR,
    direction: 'up',
    migrationsTable: MIGRATIONS_TABLE,
    // 여기서 찍는 줄이 `무엇을 적용했나`의 유일한 기록이다. 껐다가 사고 났을 때 볼 것이 없다.
    log: (message) => {
      console.log('[migrate]', message)
    },
  })
}
