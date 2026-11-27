import { z } from 'zod'

/**
 * 환경변수의 모양. 시작할 때 한 번 검사해 빠지거나 틀린 값이 있으면 뜨지 않는다.
 *
 * `.env.example` 이 같은 목록을 사람 눈으로 보여 준다. 둘을 함께 고친다.
 */
export const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  PORT: z.coerce.number().int().positive().default(4000),
  /** 서버가 듣는 주소. 컨테이너는 포트를 밖에서 열어 `0.0.0.0` 이고, 박스에서 바로 돌릴 때는 nginx 만 붙게 `127.0.0.1` 이다. */
  HOST: z.string().min(1).default('0.0.0.0'),
  /**
   * DB 연결 풀의 상한. DB 박스의 `max_connections` 가 20 이라 운영 서버와 다른 서버가 함께 붙으면 합이 그 아래여야 한다. 넘치면
   * 운영 서버가 연결을 못 얻는다.
   */
  DATABASE_POOL_MAX: z.coerce.number().int().positive().max(15).default(10),
  /** 넥슨에 등록한 redirect_uri 의 호스트. 관리 화면에서 올린 공지 그림의 주소도 이 값으로 만든다. 로컬에서는 바꿔 쓴다. */
  PUBLIC_BASE_URL: z.string().url().default('https://api.mapleroutine.store'),
  /** 그림 파일을 두는 디렉터리. 같은 박스의 nginx 가 `/assets/` 로 낸다. 컨테이너에서는 볼륨을 건 경로다. */
  ASSETS_DIR: z.string().min(1).default('/data/assets'),
  /** OTA 매니페스트 · 번들 · 에셋을 두는 디렉터리. 발행 스크립트가 올리고 서버는 매니페스트만 읽는다. nginx 가 `files/` 를 `/ota/files/` 로 낸다. */
  OTA_DIR: z.string().min(1).default('/data/ota'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  FCM_KEY: z.string().optional(),

  NEXON_KEY: z.string().optional(),
  POLL_INTERVAL_MS: z.coerce.number().int().positive().default(60_000),
  SETTLEMENT_OCID: z.string().optional(),

  NEXON_IOS_CLIENT_ID: z.string().optional(),
  NEXON_IOS_CLIENT_SECRET: z.string().optional(),
  NEXON_ANDROID_CLIENT_ID: z.string().optional(),
  NEXON_ANDROID_CLIENT_SECRET: z.string().optional(),
  NEXON_WEB_CLIENT_ID: z.string().optional(),
  NEXON_WEB_CLIENT_SECRET: z.string().optional(),
  /** 웹에서 시작한 넥슨 로그인이 끝나고 돌아갈 웹 주소. receipt 나 error_name 을 쿼리로 붙인다. 없으면 웹 로그인을 시작하지 않는다. */
  WEB_RETURN_URL: z.string().url().optional(),
  /**
   * 넥슨 웹 애플리케이션에 등록한 redirect_uri. 없으면 앱과 같은 `PUBLIC_BASE_URL` 의 콜백이다. 웹 애플리케이션은 api 주소의
   * 콜백만 등록되어 있어, 루트를 쓰는 운영 서버는 이 값으로 api 콜백을 싣고 nginx 가 `web.` state 를 이 서버로 넘긴다.
   */
  WEB_REDIRECT_URI: z.string().url().optional(),
  /** 로그인 때 넥슨에 청하는 scope. 쉼표로 잇는다. 넥슨이 승인한 프렌즈 경로의 것이다. */
  NEXON_OPENID_SCOPES: z.string().optional(),

  /** hex 64글자 = 32바이트. 봉인 블롭 첫 바이트가 버전이라 키를 바꿀 때 V2 를 더한다. */
  TOKEN_ENC_KEY_V1: z.string().regex(/^[0-9a-f]{64}$/i),

  FRIENDS_MAX_RUNS: z.coerce.number().int().positive().default(40),
  FRIENDS_FANOUT: z.coerce.number().int().positive().default(4),
  FRIENDS_RUN_DEADLINE_MS: z.coerce.number().int().positive().default(120_000),
  FRIENDS_RUN_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(16 * 1024 * 1024),
  FRIENDS_NEXON_RPS: z.coerce.number().int().positive().max(1000).default(900),
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
