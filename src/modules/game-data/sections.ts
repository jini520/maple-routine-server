import { eq, sql } from 'drizzle-orm'

import type { Db } from '../../database/database.module'
import { gameDataSectionUpdates } from '../../database/schema'

/** GET /v1/game-data 의 칸 이름. bosses 는 자기 표의 updated_at 으로 내서 여기 없다. */
export const SECTION_KEYS = [
  'bossDrops',
  'dropBoxes',
  'crystalPrices',
  'worlds',
  'spendCatalog',
  'cashbookCategories',
  'symbolCosts',
  'contents',
  'enhancementCosts',
  'mvpGrades',
  'huntingGrounds',
  'huntLoot',
  'hexaMatrix',
  'faqs',
  'assets',
  'imageCrops',
  'appImages',
  'items',
] as const
export type SectionKey = (typeof SECTION_KEYS)[number]

/** 트랜잭션 안에서도 쓸 수 있게 둘 다 받는다. */
export type DbOrTx = Db | Parameters<Parameters<Db['transaction']>[0]>[0]

/** 그 칸의 시각을 지금으로 민다. 쓰기마다 부른다. 줄을 지운 것도 앱이 알아야 해서다. */
export async function touchSection(db: DbOrTx, key: SectionKey): Promise<void> {
  await db
    .insert(gameDataSectionUpdates)
    .values({ key, updatedAt: new Date() })
    .onConflictDoUpdate({ target: gameDataSectionUpdates.key, set: { updatedAt: sql`now()` } })
}

/**
 * 게임 데이터 응답이 바뀌었는지 가리는 값. 칸 시각 전부와 `bosses` 칸의 시각을 내는 보스 줄 · 규칙 줄의 시각을 이은 글자.
 *
 * 요청마다 부르므로 쿼리 하나다.
 */
export async function gameDataStamp(db: Db): Promise<string> {
  const result = await db.execute<{ stamp: string }>(sql`
    select
      coalesce((select string_agg(key || '=' || updated_at::text, ',' order by key) from game_data_section_updates), '')
      || '|' || coalesce((select max(updated_at)::text from bosses), '')
      || '|' || coalesce((select max(updated_at)::text from game_rules), '') as stamp
  `)
  return result.rows[0]?.stamp ?? ''
}

/** 한 번도 안 넣었으면 null. */
export async function sectionUpdatedAt(db: DbOrTx, key: SectionKey): Promise<string | null> {
  const [row] = await db
    .select({ updatedAt: gameDataSectionUpdates.updatedAt })
    .from(gameDataSectionUpdates)
    .where(eq(gameDataSectionUpdates.key, key))
  return row?.updatedAt.toISOString() ?? null
}
