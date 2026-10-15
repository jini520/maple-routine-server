import { z } from 'zod'

export const BOSS_DIFFICULTIES = ['easy', 'normal', 'hard', 'chaos', 'extreme'] as const
export const BOSS_CYCLES = ['weekly', 'event_weekly', 'monthly'] as const

/** game_rules 의 key 와 응답 필드 이름. 둘이 짝이다. */
export const RULE_KEYS = {
  weeklyBossSelectionLimit: 'weekly_boss_selection_limit',
  weeklyCrystalSaleLimit: 'weekly_crystal_sale_limit',
} as const
export type RuleField = keyof typeof RULE_KEYS

const difficultyRow = z.object({
  difficulty: z.enum(BOSS_DIFFICULTIES),
  requiredLevel: z.number().int().min(1),
})

const boss = z
  .object({
    /** 앱의 snake_case key. 기기 기록이 이 값을 들어 모양을 좁게 본다. */
    key: z.string().regex(/^[a-z][a-z0-9_]*$/),
    name: z.string().min(1).max(100),
    alias: z.string().min(1).max(100),
    cycle: z.enum(BOSS_CYCLES),
    portraitSlug: z.string().min(1).max(100),
    difficulties: z.array(difficultyRow).min(1),
  })
  .refine((b) => new Set(b.difficulties.map((d) => d.difficulty)).size === b.difficulties.length, {
    message: '같은 난이도가 두 번 있다',
    path: ['difficulties'],
  })

/**
 * 관리 화면이 붙여 넣는 JSON. GET /v1/bosses 응답에서 updatedAt 을 뺀 모양이다.
 * 앱의 번들 파일을 그대로 붙여 넣을 수 있게 응답과 같은 모양으로 둔다.
 */
export const bossesImport = z
  .object({
    rules: z.object({
      weeklyBossSelectionLimit: z.number().int().min(1),
      weeklyCrystalSaleLimit: z.number().int().min(1),
    }),
    bosses: z.array(boss).min(1),
  })
  .refine((v) => new Set(v.bosses.map((b) => b.key)).size === v.bosses.length, {
    message: '같은 key 가 두 번 있다',
    path: ['bosses'],
  })
export type BossesImport = z.infer<typeof bossesImport>
export type BossInput = BossesImport['bosses'][number]
