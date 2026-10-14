/**
 * Model. 표 여섯과 ENUM 둘. 마이그레이션은 이 선언에서 `drizzle-kit generate` 가 뽑는다.
 *
 * PK 는 항상 uuid 한 칸이고 자연키는 UNIQUE 제약이다. 봉한 값은 version‖iv‖tag‖cipher 한 칸이다.
 */
import { sql } from 'drizzle-orm'
import {
  bigint,
  check,
  customType,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return 'bytea'
  },
})

const timestamptz = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' })

/** ENUM 인 것은 text 면 틀려도 에러가 아니라 14일 뒤 갱신 실패로 나기 때문이다. */
export const platformEnum = pgEnum('platform', ['ios', 'android'])
export const noticeKindEnum = pgEnum('notice_kind', ['app', 'game', 'event', 'update', 'cashshop'])

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** 넥슨 uid. 플랫폼을 가로질러 같다. */
    nexonUid: text('nexon_uid').unique(),
    /** 앱이 보낸 해시를 서버가 한 번 더 해시한 것. */
    apiKeyHash: bytea('api_key_hash').unique(),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
    /** 탈퇴. 사용자 요청으로 줄을 지우지 않는다. */
    deletedAt: timestamptz('deleted_at'),
  },
  (t) => [check('users_identity', sql`${t.nexonUid} IS NOT NULL OR ${t.apiKeyHash} IS NOT NULL`)],
)

export const nexonSessions = pgTable(
  'nexon_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** 앱이 든 값의 sha256. 원본은 저장하지 않는다. */
    sessionHash: bytea('session_hash').notNull().unique(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** 갱신도 같은 자격 쌍으로 해야 넥슨이 받는다. */
    platform: platformEnum('platform').notNull(),
    accessSealed: bytea('access_sealed').notNull(),
    accessExpiresAt: timestamptz('access_expires_at').notNull(),
    refreshSealed: bytea('refresh_sealed').notNull(),
    refreshExpiresAt: timestamptz('refresh_expires_at').notNull(),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
    lastUsedAt: timestamptz('last_used_at').notNull().defaultNow(),
  },
  (t) => [
    index('nexon_sessions_user_id_idx').on(t.userId),
    index('nexon_sessions_refresh_expires_at_idx').on(t.refreshExpiresAt),
  ],
)

export const nexonLoginAttempts = pgTable(
  'nexon_login_attempts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** 넥슨에 넘기고 콜백으로 돌아오는 값. 로그에 적히므로 비밀이 아니다. */
    state: text('state').notNull().unique(),
    /** sha256(redeem_key). 원본은 앱만 든다. */
    redeemHash: bytea('redeem_hash').notNull().unique(),
    /** sha256(receipt). 콜백이 만들고 원본은 돌아오는 길로만 간다. */
    receiptHash: bytea('receipt_hash').unique(),
    platform: platformEnum('platform').notNull(),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
    /** 시작부터 10분. */
    expiresAt: timestamptz('expires_at').notNull(),
    /** 콜백이 집은 시각. 한 번 집힌 state 는 다시 못 쓴다. */
    claimedAt: timestamptz('claimed_at'),
    /** 콜백이 봉한 시각. 되묻는 60초 창과 상태 판정이 여기 걸린다. */
    sealedAt: timestamptz('sealed_at'),
    sessionSealed: bytea('session_sealed'),
    sessionId: uuid('session_id').references(() => nexonSessions.id, { onDelete: 'set null' }),
  },
  (t) => [index('nexon_login_attempts_expires_at_idx').on(t.expiresAt)],
)

export const notices = pgTable(
  'notices',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** 앱 계약의 Notice.id. */
    noticeKey: text('notice_key').notNull().unique(),
    kind: noticeKindEnum('kind').notNull(),
    title: text('title').notNull(),
    /** 넥슨 공지는 NULL. */
    body: text('body'),
    /** 운영자 공지와 썬데이 메이플만. */
    blocks: jsonb('blocks'),
    link: text('link'),
    /** 넥슨의 notice_id. */
    sourceId: bigint('source_id', { mode: 'number' }),
    publishedAt: timestamptz('published_at').notNull(),
    startsAt: timestamptz('starts_at'),
    endsAt: timestamptz('ends_at'),
    /** 예약 발송. */
    scheduledAt: timestamptz('scheduled_at'),
    /** NULL 이면 알림을 안 쐈다. */
    sentAt: timestamptz('sent_at'),
    pushTitle: text('push_title'),
    pushBody: text('push_body'),
  },
  (t) => [
    index('notices_published_at_idx').on(t.publishedAt.desc(), t.id.desc()),
    index('notices_kind_published_at_idx').on(t.kind, t.publishedAt.desc(), t.id.desc()),
    index('notices_scheduled_at_idx')
      .on(t.scheduledAt)
      .where(sql`${t.scheduledAt} IS NOT NULL AND ${t.sentAt} IS NULL`),
  ],
)

export const manualCompletionBosses = pgTable('manual_completion_bosses', {
  id: uuid('id').primaryKey().defaultRandom(),
  /** 앱 계약의 ManualCompletionBoss.boss. */
  boss: text('boss').notNull().unique(),
  /** 여는 날 KST YYYY-MM-DD. */
  fromDate: text('from_date').notNull(),
  openedAt: timestamptz('opened_at').notNull().defaultNow(),
  /** NULL 이면 열려 있다. */
  closedAt: timestamptz('closed_at'),
})

export const dropPrices = pgTable(
  'drop_prices',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** 기기가 만든 v4. 이 UNIQUE 가 멱등을 만든다. */
    dropRecordId: uuid('drop_record_id').notNull().unique(),
    itemKey: text('item_key').notNull(),
    /** 판매 총액. 내 몫이 아니다. */
    priceMeso: bigint('price_meso', { mode: 'number' }).notNull(),
    /** 주간 YYYY-MM-DD · 월간 YYYY-MM. */
    periodKey: text('period_key').notNull(),
    worldKey: text('world_key'),
    ringLevel: integer('ring_level'),
    slot: text('slot'),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
    updatedAt: timestamptz('updated_at').notNull().defaultNow(),
    /** 가격을 뺐다. NULL 이 있다는 뜻. */
    deletedAt: timestamptz('deleted_at'),
  },
  (t) => [
    index('drop_prices_item_period_idx')
      .on(t.itemKey, t.periodKey)
      .where(sql`${t.deletedAt} IS NULL`),
  ],
)
