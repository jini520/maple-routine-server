import { z } from 'zod'

import { PERIOD_TEXT } from '../crystal-prices/period-boundary'

export const BOSS_DIFFICULTIES = ['easy', 'normal', 'hard', 'chaos', 'extreme'] as const
export const BOSS_CYCLES = ['weekly', 'event_weekly', 'monthly'] as const

/** game_rules 의 key 와 응답 필드 이름. 둘이 짝이다. */
export const RULE_KEYS = {
  weeklyBossSelectionLimit: 'weekly_boss_selection_limit',
  weeklyCrystalSaleLimit: 'weekly_crystal_sale_limit',
  defaultMaxPartySize: 'default_max_party_size',
} as const
export type RuleField = keyof typeof RULE_KEYS

/** 규칙 셋. 보스가 아니라 규칙이라 따로 받는다. */
export const rulesInput = z.object({
  weeklyBossSelectionLimit: z.number().int().min(1),
  weeklyCrystalSaleLimit: z.number().int().min(1),
  defaultMaxPartySize: z.number().int().min(1).max(6),
})
export type RulesInput = z.infer<typeof rulesInput>

/** 난이도 줄 하나. 요구 레벨과 파티 인원 상한(없으면 기본값), 유효 기간(없으면 보스의 기간 그대로). */
export const difficultyInput = z
  .object({
    difficulty: z.enum(BOSS_DIFFICULTIES),
    requiredLevel: z.number().int().min(1),
    maxPartySize: z.number().int().min(1).max(6).nullish(),
    from: z.string().regex(PERIOD_TEXT).nullish(),
    until: z.string().regex(PERIOD_TEXT).nullish(),
  })
  .refine((d) => d.from == null || d.until == null || d.from < d.until, {
    message: '끝이 시작보다 뒤여야 한다',
    path: ['until'],
  })
export type DifficultyInput = z.infer<typeof difficultyInput>

/** 유효 기간 둘. 끝은 시작보다 뒤여야 한다. 기간 경계일 필요는 없다. 시즌이 끝나는 날을 그대로 적는다. */
export const periodInput = z
  .object({
    from: z.string().regex(PERIOD_TEXT).nullish(),
    until: z.string().regex(PERIOD_TEXT).nullish(),
  })
  .refine((p) => p.from == null || p.until == null || p.from < p.until, {
    message: '끝이 시작보다 뒤여야 한다',
    path: ['until'],
  })
export type PeriodInput = z.infer<typeof periodInput>

/** 경로 조각. 앱의 snake_case key 라 모양을 좁게 본다. */
export const bossKeyParam = z.string().regex(/^[a-z][a-z0-9_]*$/)
export const difficultyParam = z.enum(BOSS_DIFFICULTIES)

/** 새 보스 하나. 난이도 줄이 하나는 있어야 한다. 없는 보스는 앱이 표 전체를 거절한다. */
export const bossInput = z
  .object({
    key: bossKeyParam,
    name: z.string().min(1).max(100),
    alias: z.string().min(1).max(100),
    cycle: z.enum(BOSS_CYCLES),
    portraitSlug: z.string().min(1).max(100),
    difficulties: z.array(difficultyInput).min(1),
    from: z.string().regex(PERIOD_TEXT).nullish(),
    until: z.string().regex(PERIOD_TEXT).nullish(),
  })
  .refine((b) => b.from == null || b.until == null || b.from < b.until, {
    message: '끝이 시작보다 뒤여야 한다',
    path: ['until'],
  })
  .refine((b) => new Set(b.difficulties.map((d) => d.difficulty)).size === b.difficulties.length, {
    message: '같은 난이도가 두 번 있다',
    path: ['difficulties'],
  })
export type BossInput = z.infer<typeof bossInput>
