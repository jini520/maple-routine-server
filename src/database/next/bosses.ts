import { boolean, integer, pgEnum, pgTable, text, unique, uuid } from 'drizzle-orm/pg-core'

import { assets } from './assets'
import { timestamptz } from './columns'

/** 앱 BOSS_DIFFICULTIES 그대로. 넥슨 API 값이고 선언 순서가 정렬 순서다. */
export const bossDifficultyEnum = pgEnum('boss_difficulty', [
  'easy',
  'normal',
  'hard',
  'chaos',
  'extreme',
])

/** 난이도의 주기. 시즌 보스인지는 주기가 아니라 `bosses.is_season_boss` 가 말한다. */
export const bossCycleEnum = pgEnum('boss_cycle', ['weekly', 'monthly'])

export const bosses = pgTable('bosses', {
  id: uuid('id').primaryKey().defaultRandom(),
  /** 영어 이름표. 넥슨 응답의 보스 이름을 보스에 맞출 때 쓴다. 기록은 이 값이 아니라 줄 id 로 가리킨다. */
  key: text('key').notNull().unique(),
  name: text('name').notNull(),
  shortName: text('short_name').notNull(),
  /** 시즌 보스는 주간 선택 한도에서 빠진다. 난이도가 아니라 보스의 성질이다. */
  isSeasonBoss: boolean('is_season_boss').notNull(),
  /** 초상 그림. 쓰는 그림은 지울 수 없다. */
  portraitAssetId: uuid('portrait_asset_id')
    .notNull()
    .references(() => assets.id),
  sortOrder: integer('sort_order').notNull(),
  /** 유효 기간. KST 글자 그대로. 없으면 처음부터 · 끝없이. 끝난 보스는 지우지 않고 끝을 적는다. */
  validFrom: text('valid_from'),
  validUntil: text('valid_until'),
  updatedAt: timestamptz('updated_at').notNull().defaultNow(),
})

/** 보스 한 난이도가 줄 하나. 기록 표의 `boss_difficulty_id` 가 이 줄을 가리킨다. */
export const bossDifficulties = pgTable(
  'boss_difficulties',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    bossId: uuid('boss_id')
      .notNull()
      .references(() => bosses.id, { onDelete: 'cascade' }),
    difficulty: bossDifficultyEnum('difficulty').notNull(),
    /** 같은 보스라도 난이도마다 주기가 다를 수 있어 보스가 아니라 난이도에 둔다. */
    cycle: bossCycleEnum('cycle').notNull(),
    requiredLevel: integer('required_level').notNull(),
    /** 결정석을 나누는 파티 인원 상한. NULL 이면 게임 규칙의 기본값이다. */
    maxPartySize: integer('max_party_size'),
    /** 난이도의 유효 기간. 보스의 기간과 겹치는 범위만 유효하다. */
    validFrom: text('valid_from'),
    validUntil: text('valid_until'),
  },
  (t) => [unique('boss_difficulties_boss_difficulty_unique').on(t.bossId, t.difficulty)],
)
