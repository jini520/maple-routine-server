import { z } from 'zod'

/**
 * 환경변수의 모양. 시작할 때 한 번 검사해 빠지거나 틀린 값이 있으면 뜨지 않는다.
 *
 * `.env.example` 이 같은 목록을 사람 눈으로 보여 준다. 둘을 함께 고친다.
 */
export const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  PORT: z.coerce.number().int().positive().default(4000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  FCM_KEY: z.string().optional(),

  NEXON_KEY: z.string().optional(),
  POLL_INTERVAL_MS: z.coerce.number().int().positive().default(60_000),
  SETTLEMENT_OCID: z.string().optional(),

  NEXON_IOS_CLIENT_ID: z.string().optional(),
  NEXON_IOS_CLIENT_SECRET: z.string().optional(),
  NEXON_ANDROID_CLIENT_ID: z.string().optional(),
  NEXON_ANDROID_CLIENT_SECRET: z.string().optional(),

  /** hex 64글자 = 32바이트. 봉인 블롭 첫 바이트가 버전이라 키를 바꿀 때 V2 를 더한다. */
  TOKEN_ENC_KEY_V1: z
    .string()
    .regex(/^[0-9a-f]{64}$/i)
    .optional(),

  FRIENDS_MAX_RUNS: z.coerce.number().int().positive().default(40),
  FRIENDS_FANOUT: z.coerce.number().int().positive().default(4),
  FRIENDS_RUN_DEADLINE_MS: z.coerce.number().int().positive().default(120_000),
  FRIENDS_RUN_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(16 * 1024 * 1024),
  FRIENDS_NEXON_RPS: z.coerce.number().int().positive().default(400),
})

export type Env = z.infer<typeof envSchema>

/** `ConfigModule.forRoot({ validate })` 에 꽂는 함수. 틀리면 어떤 키가 왜 틀렸는지가 메시지다. */
export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw)
  if (!result.success) {
    const lines = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`)
    throw new Error(`환경변수가 틀렸다\n${lines.join('\n')}`)
  }
  return result.data
}
