import { z } from 'zod'

export const BOSS_DIFFICULTIES = ['easy', 'normal', 'hard', 'chaos', 'extreme'] as const
export const BOSS_CYCLES = ['weekly', 'event_weekly', 'monthly'] as const

/** game_rules 의 key 와 응답 필드 이름. 둘이 짝이다. */
export const RULE_KEYS = {
  weeklyBossSelectionLimit: 'weekly_boss_selection_limit',
  weeklyCrystalSaleLimit: 'weekly_crystal_sale_limit',
} as const
export type RuleField = keyof typeof RULE_KEYS

/** 규칙 둘. 보스가 아니라 규칙이라 따로 받는다. */
export const rulesInput = z.object({
  weeklyBossSelectionLimit: z.number().int().min(1),
  weeklyCrystalSaleLimit: z.number().int().min(1),
})
export type RulesInput = z.infer<typeof rulesInput>

/** 난이도 줄 하나. 요구 레벨만 든다. */
export const difficultyInput = z.object({
  difficulty: z.enum(BOSS_DIFFICULTIES),
  requiredLevel: z.number().int().min(1),
})
export type DifficultyInput = z.infer<typeof difficultyInput>

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
  })
  .refine((b) => new Set(b.difficulties.map((d) => d.difficulty)).size === b.difficulties.length, {
    message: '같은 난이도가 두 번 있다',
    path: ['difficulties'],
  })
export type BossInput = z.infer<typeof bossInput>
