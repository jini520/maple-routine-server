import { eq, sql } from 'drizzle-orm'

import type { Db } from '../../database/database.module'
import { gameDataSections } from '../../database/schema'

/** GET /v1/game-data 의 칸 이름. bosses 는 자기 표의 updated_at 으로 내서 여기 없다. */
export const SECTION_KEYS = [
  'dropItems',
  'bossDrops',
  'dropBoxes',
  'crystalPrices',
  'worlds',
  'spendCatalog',
  'cashbookCategories',
  'symbolCosts',
  'contents',
  'equipmentItems',
  'enhancementCosts',
  'mvpGrades',
  'huntingGrounds',
  'huntLoot',
  'hexaMatrix',
  'assets',
  'imageCrops',
] as const
export type SectionKey = (typeof SECTION_KEYS)[number]

/** 트랜잭션 안에서도 쓸 수 있게 둘 다 받는다. */
export type DbOrTx = Db | Parameters<Parameters<Db['transaction']>[0]>[0]

/** 그 칸의 시각을 지금으로 민다. 쓰기마다 부른다. 줄을 지운 것도 앱이 알아야 해서다. */
export async function touchSection(db: DbOrTx, key: SectionKey): Promise<void> {
  await db
    .insert(gameDataSections)
    .values({ key, updatedAt: new Date() })
    .onConflictDoUpdate({ target: gameDataSections.key, set: { updatedAt: sql`now()` } })
}

/** 한 번도 안 넣었으면 null. */
export async function sectionUpdatedAt(db: DbOrTx, key: SectionKey): Promise<string | null> {
  const [row] = await db
    .select({ updatedAt: gameDataSections.updatedAt })
    .from(gameDataSections)
    .where(eq(gameDataSections.key, key))
  return row?.updatedAt.toISOString() ?? null
}
