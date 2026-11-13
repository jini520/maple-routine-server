/**
 * Model. 표 쉰아홉과 ENUM 스물여섯. 마이그레이션은 이 선언에서 `drizzle-kit generate` 가 뽑는다.
 *
 * PK 는 항상 uuid 한 칸이고 자연키는 UNIQUE 제약이다. 봉한 값은 version‖iv‖tag‖cipher 한 칸이다.
 */
import { sql } from 'drizzle-orm'
import {
  bigint,
  boolean,
  check,
  customType,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
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
/** 쓰기 경로가 사람을 어느 헤더로 찾았나. key 는 증명이 없어 집계 때 가중을 가른다. */
export const identitySourceEnum = pgEnum('identity_source', ['login', 'key'])
/** 앱 BOSS_DIFFICULTIES 그대로. 넥슨 API 값이고 선언 순서가 정렬 순서다. */
export const bossDifficultyEnum = pgEnum('boss_difficulty', [
  'easy',
  'normal',
  'hard',
  'chaos',
  'extreme',
])
/** 앱 JSON 의 묶음 셋. event_weekly 는 주간 12 한도에서 빠진다. */
export const bossCycleEnum = pgEnum('boss_cycle', ['weekly', 'event_weekly', 'monthly'])
/** 드롭 표의 갈래. 앱 DROP_CATEGORIES 그대로이고 선언 순서가 화면 순서다. */
export const dropCategoryEnum = pgEnum('drop_category', ['fixed', 'equipment', 'consumable'])

/** 사람. 넥슨 계정 줄을 들고, 한 사람이 넥슨 계정을 여럿 가질 수 있다. 세션은 사람을 가리킨다. */
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  createdAt: timestamptz('created_at').notNull().defaultNow(),
  /** 계정 삭제를 요청한 때. 30일 뒤 밤 일이 행을 지운다. NULL 이면 예약이 없다. */
  deletionRequestedAt: timestamptz('deletion_requested_at'),
})

/**
 * 넥슨 ID 하나. 같은 넥슨 ID 의 넥슨 로그인과 API 키는 한 줄이다. 키는 nexon_account_keys, 메이플 ID 는
 * nexon_account_maple_ids 가 든다. 메이플 ID 가 다른 줄과 겹치면 같은 넥슨 ID 라 한 줄로 합친다.
 */
export const nexonAccounts = pgTable(
  'nexon_accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** 넥슨 uid. 플랫폼을 가로질러 같다. 넥슨 로그인으로 확인한 계정만 값이 있다. */
    nexonUid: text('nexon_uid').unique(),
    /** 다른 사람에게 알려 줄 추천인 코드. 로그인 계정에만 있다. */
    referralCode: text('referral_code').unique(),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
    updatedAt: timestamptz('updated_at').notNull().defaultNow(),
  },
  (t) => [
    index('nexon_accounts_user_id_idx').on(t.userId),
    check(
      'nexon_accounts_referral_code_login_only',
      sql`(${t.nexonUid} IS NOT NULL) = (${t.referralCode} IS NOT NULL)`,
    ),
  ],
)

/** 넥슨 계정의 API 키 하나. 키를 다시 받으면 같은 넥슨 계정에 줄이 하나 더 달린다. */
export const nexonAccountKeys = pgTable(
  'nexon_account_keys',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    nexonAccountId: uuid('nexon_account_id')
      .notNull()
      .references(() => nexonAccounts.id, { onDelete: 'cascade' }),
    /** 앱이 보낸 해시를 서버가 한 번 더 해시한 것. */
    apiKeyHash: bytea('api_key_hash').notNull().unique(),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
  },
  (t) => [index('nexon_account_keys_account_idx').on(t.nexonAccountId)],
)

/**
 * 넥슨 계정의 메이플 ID 하나. 메이플 ID 는 넥슨 계정 하나에만 속해 서버 전체에서 한 줄이다. 앱이 알려 주는 값이라
 * 증명은 아니다. 목록에서 빠져도 지우지 않는다. 다른 넥슨 ID 로 옮겨 가지 않아 남겨도 부딪치지 않는다.
 */
export const nexonAccountMapleIds = pgTable(
  'nexon_account_maple_ids',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    nexonAccountId: uuid('nexon_account_id')
      .notNull()
      .references(() => nexonAccounts.id, { onDelete: 'cascade' }),
    mapleId: text('maple_id').notNull().unique(),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
  },
  (t) => [index('nexon_account_maple_ids_account_idx').on(t.nexonAccountId)],
)

/** 넥슨 로그인이 등록한 부계정 하나. 부계정은 로그인 하나에만 붙는다. 어느 쪽 계정 줄이 지워져도 함께 지워진다. */
export const subAccounts = pgTable(
  'sub_accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    loginAccountId: uuid('login_account_id')
      .notNull()
      .references(() => nexonAccounts.id, { onDelete: 'cascade' }),
    subAccountId: uuid('sub_account_id')
      .notNull()
      .unique()
      .references(() => nexonAccounts.id, { onDelete: 'cascade' }),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
  },
  (t) => [
    index('sub_accounts_login_idx').on(t.loginAccountId),
    check('sub_accounts_not_self', sql`${t.loginAccountId} <> ${t.subAccountId}`),
  ],
)

/** 추천 하나. 추천받은 계정이 추천인을 한 번만 넣으므로 그 칸이 UNIQUE 다. */
export const referrals = pgTable(
  'referrals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    referredAccountId: uuid('referred_account_id')
      .notNull()
      .unique()
      .references(() => nexonAccounts.id, { onDelete: 'cascade' }),
    /** 추천한 계정이 지워지면 비운다. 줄이 남아야 추천받은 계정이 다른 코드를 다시 넣지 못한다. */
    referrerAccountId: uuid('referrer_account_id').references(() => nexonAccounts.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
  },
  (t) => [check('referrals_not_self', sql`${t.referredAccountId} <> ${t.referrerAccountId}`)],
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
    /** 넥슨 공지를 마지막으로 받은 시각. 30일이 지나면 지운다. 운영자 공지는 NULL. */
    fetchedAt: timestamptz('fetched_at'),
    /** 썬데이 메이플 상세를 마지막으로 받은 시각. 목록에 있는 동안 다시 받는다. */
    detailFetchedAt: timestamptz('detail_fetched_at'),
  },
  (t) => [
    index('notices_published_at_idx').on(t.publishedAt.desc(), t.id.desc()),
    index('notices_kind_published_at_idx').on(t.kind, t.publishedAt.desc(), t.id.desc()),
    index('notices_scheduled_at_idx')
      .on(t.scheduledAt)
      .where(sql`${t.scheduledAt} IS NOT NULL AND ${t.sentAt} IS NULL`),
  ],
)

export const bosses = pgTable('bosses', {
  id: uuid('id').primaryKey().defaultRandom(),
  /** 앱의 boss key. 기기 기록이 이 값을 든다. */
  key: text('key').notNull().unique(),
  name: text('name').notNull(),
  alias: text('alias').notNull(),
  cycle: bossCycleEnum('cycle').notNull(),
  /** 초상 그림. 앱에는 그림 경로의 이름(확장자를 뗀 것)을 portraitSlug 로 낸다. 쓰는 그림은 지울 수 없다. */
  portraitAssetId: uuid('portrait_asset_id')
    .notNull()
    .references(() => assets.id),
  /** 배열 순서가 곧 화면 순서다. */
  sortOrder: integer('sort_order').notNull(),
  /** 유효 기간. KST 글자 그대로. 없으면 처음부터 · 끝없이. 시즌 보스가 끝을 든다. 앱이 기간 첫날로 판정한다. */
  from: text('from'),
  until: text('until'),
  updatedAt: timestamptz('updated_at').notNull().defaultNow(),
})

/** 보스 한 난이도가 줄 하나. 같은 보스의 다른 난이도는 다른 줄이고 boss_id 가 같다. */
export const bossDifficulties = pgTable(
  'boss_difficulties',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    bossId: uuid('boss_id')
      .notNull()
      .references(() => bosses.id, { onDelete: 'cascade' }),
    difficulty: bossDifficultyEnum('difficulty').notNull(),
    requiredLevel: integer('required_level').notNull(),
    /** 결정석을 나누는 파티 인원 상한. NULL 이면 game_rules 의 default_max_party_size 다. */
    maxPartySize: integer('max_party_size'),
    /** 난이도의 유효 기간. 보스의 기간과 겹치는 범위만 유효하다. 새로 생긴 난이도가 시작을 든다. */
    from: text('from'),
    until: text('until'),
  },
  (t) => [unique('boss_difficulties_boss_difficulty_unique').on(t.bossId, t.difficulty)],
)

/** 보스가 아니라 규칙인 값. 선택 한도 12 · 결정석 판매 한도 90 · 파티 인원 상한 기본값 6. */
export const gameRules = pgTable('game_rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  key: text('key').notNull().unique(),
  value: integer('value').notNull(),
  updatedAt: timestamptz('updated_at').notNull().defaultNow(),
})

export const manualCompletionBosses = pgTable(
  'manual_completion_bosses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    bossId: uuid('boss_id')
      .notNull()
      .references(() => bosses.id),
    /** 여는 날 KST YYYY-MM-DD. */
    fromDate: text('from_date').notNull(),
    openedAt: timestamptz('opened_at').notNull().defaultNow(),
    /** NULL 이면 열려 있다. */
    closedAt: timestamptz('closed_at'),
  },
  (t) => [
    // 열린 줄만 보스당 하나다. 닫은 줄은 남아 이력이 된다.
    uniqueIndex('manual_completion_bosses_open_unique')
      .on(t.bossId)
      .where(sql`${t.closedAt} IS NULL`),
  ],
)

/**
 * 가격 줄의 상태. 미입력(pending) · 기록 안함(skipped)도 줄이 선다. deleted 는 기기에서 기록이 사라진 것이고 DELETE 가
 * 적는다. 가격은 completed 만 갖는다(CHECK).
 */
export const dropRecordStatusEnum = pgEnum('drop_record_status', [
  'pending',
  'completed',
  'skipped',
  'deleted',
])

export const dropPrices = pgTable(
  'drop_prices',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /**
     * 1.0.13 앱의 줄을 찾는 사람. 계정을 삭제하면 비우고 줄은 남긴다. 1.0.13 을 잠근 뒤 ocid 가 없는 줄과 함께 걷는다.
     */
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    /** 기기가 만든 v4. 메이플 ID 안에서(옛 줄은 사람 안에서) 유일하다. 남의 기록 id 로 남의 줄을 못 덮는다. */
    dropRecordId: uuid('drop_record_id').notNull(),
    /** 드롭한 캐릭터의 메이플 ID. 계정을 삭제하면 비운다. 1.0.13 앱의 줄은 NULL 이다. */
    mapleId: text('maple_id').references(() => nexonAccountMapleIds.mapleId, {
      onDelete: 'set null',
      onUpdate: 'cascade',
    }),
    /** 드롭한 캐릭터의 ocid 해시. 원문이 아니라 계정을 삭제해도 남겨, 돌아와 다시 보낸 같은 드롭을 막는다. */
    ocid: text('ocid'),
    /** 같은 드롭을 가리는 보스. 난이도를 넣으면 난이도만 고친 같은 드롭이 두 줄이 된다. 표에 없는 보스면 NULL. */
    bossId: uuid('boss_id').references(() => bosses.id, { onDelete: 'set null' }),
    /**
     * 획득처. 상자에서 나온 드롭이면 그 상자 아이템이고, 보스가 직접 떨군 드롭은 NULL 이다. 한 캐릭터는 한 기간에 한 보스에게서
     * 같은 아이템을 둘 얻지 못해, 같은 아이템은 획득처로만 갈린다.
     */
    boxOriginItemId: uuid('box_origin_item_id').references(() => items.id),
    identifiedBy: identitySourceEnum('identified_by').notNull(),
    /** 어느 아이템의 시세인가. 서버가 전송값의 key 로 찾아 적고, 모르는 key 는 받지 않는다. */
    itemId: uuid('item_id')
      .notNull()
      .references(() => items.id),
    /** 판매 총액. 내 몫이 아니다. completed 만 값이 있고 나머지 상태는 NULL 이다. 0 으로 적으면 미입력과 구분이 사라진다. */
    priceMeso: bigint('price_meso', { mode: 'number' }),
    recordStatus: dropRecordStatusEnum('record_status').notNull(),
    /** 주간 YYYY-MM-DD · 월간 YYYY-MM. */
    periodKey: text('period_key').notNull(),
    /** 어느 월드에서 팔았나. 앱이 월드를 모르면 NULL 이고, 모르는 key 는 받지 않는다. */
    worldId: uuid('world_id').references(() => worlds.id),
    ringLevel: integer('ring_level'),
    /** 어느 보스 · 난이도에서 얻었나. 표에 없는 쌍이거나 이 칸이 생기기 전 줄은 NULL. */
    bossDifficultyId: uuid('boss_difficulty_id').references(() => bossDifficulties.id, {
      onDelete: 'set null',
    }),
    /** 어느 처치 기간의 드롭인가. 기기의 기간 행 id 이고 사람 안에서만 뜻이 있다. 이 칸이 생기기 전 줄은 NULL. */
    periodRecordId: uuid('period_record_id'),
    /**
     * 가격이 처음 적히거나 바뀐 시각. 시세의 거래 시각이다. completed 만 값이 있다.
     * 기기가 그룹을 저장할 때마다 같은 값을 다시 보내 updated_at 이 움직이므로 거래 시각으로 못 쓴다.
     */
    pricedAt: timestamptz('priced_at'),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
    updatedAt: timestamptz('updated_at').notNull().defaultNow(),
  },
  (t) => [
    unique('drop_prices_user_record_unique').on(t.userId, t.dropRecordId),
    unique('drop_prices_maple_record_unique').on(t.mapleId, t.dropRecordId),
    // 같은 드롭은 누가 보냈든 한 줄이다. 기기에서 지운 줄이 자리를 쥐면 같은 자리에 다시 적은 드롭을 못 받는다.
    // 직접 떨군 드롭끼리도 같은 획득처라 NULL 을 한 값으로 묶는다. 그대로 두면 NULL 끼리 달라 두 줄이 된다.
    uniqueIndex('drop_prices_same_drop_unique')
      .on(
        t.ocid,
        t.bossId,
        t.periodKey,
        t.itemId,
        sql`coalesce(${t.boxOriginItemId}, '00000000-0000-0000-0000-000000000000'::uuid)`,
      )
      .where(sql`${t.recordStatus} <> 'deleted'`),
    index('drop_prices_item_period_idx')
      .on(t.itemId, t.periodKey)
      .where(sql`${t.recordStatus} = 'completed'`),
    check(
      'drop_prices_price_matches_status',
      sql`(${t.recordStatus} = 'completed') = (${t.priceMeso} IS NOT NULL)`,
    ),
    check(
      'drop_prices_priced_at_matches_status',
      sql`(${t.recordStatus} = 'completed') = (${t.pricedAt} IS NOT NULL)`,
    ),
    index('drop_prices_priced_at_idx')
      .on(t.pricedAt)
      .where(sql`${t.recordStatus} = 'completed'`),
  ],
)

/**
 * 표마다 마지막으로 바뀐 시각. GET /v1/game-data 의 칸이 든 updatedAt 이다.
 *
 * 줄의 updated_at 최댓값으로 내면 줄을 지운 것이 안 보인다. 그래서 쓰기마다 이 표의 줄을 민다.
 */
export const gameDataSections = pgTable('game_data_sections', {
  id: uuid('id').primaryKey().defaultRandom(),
  key: text('key').notNull().unique(),
  updatedAt: timestamptz('updated_at').notNull().defaultNow(),
})

/**
 * 앱이 받는 그림 한 장. path 는 앱 `src/assets/` 기준 경로이고 게임 데이터 표의 그림 칸이 이 경로를 가리킨다.
 * 파일은 디스크에 내용 해시 이름(`<sha256>.<ext>`)으로 있다. 그림을 바꾸면 이 줄의 해시만 바뀐다.
 */
export const assets = pgTable('assets', {
  id: uuid('id').primaryKey().defaultRandom(),
  path: text('path').notNull().unique(),
  /** 소문자 hex 64글자. */
  sha256: text('sha256').notNull(),
  size: integer('size').notNull(),
  /** 픽셀. 앱이 크롭 · 연출 배치를 원래 크기로 계산한다. 내려받은 파일은 그 자리에서 크기를 모른다. */
  width: integer('width').notNull(),
  height: integer('height').notNull(),
  /** 관리 화면에서 보이는 이름. 비면 그 그림을 쓰는 곳의 이름을 보인다. 앱에는 내지 않는다. */
  name: text('name'),
  updatedAt: timestamptz('updated_at').notNull().defaultNow(),
})

/** 앱의 크롭 표 넷과 일대일. 값이 같은 그림이라도 놓이는 곳마다 잘 보이는 자리가 달라 표가 갈린다. */
export const imageCropKindEnum = pgEnum('image_crop_kind', [
  'boss_portrait',
  'boss_portrait_icon',
  'boss_portrait_modal',
  'daily_quest_region',
])

/** 그림을 자르는 크기와 위치. 값은 CSS background-size · background-position 문법이고 운영자가 눈으로 맞춘다. */
export const imageCrops = pgTable(
  'image_crops',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    kind: imageCropKindEnum('kind').notNull(),
    /** 자를 그림. 앱에는 그림 이름(확장자를 뗀 것)을 slug 로 낸다. 보스 초상이나 지역 지도다. */
    assetId: uuid('asset_id')
      .notNull()
      .references(() => assets.id),
    /** `<퍼센트>% auto` */
    size: text('size').notNull(),
    /** `<퍼센트>% <퍼센트>%` */
    position: text('position').notNull(),
    updatedAt: timestamptz('updated_at').notNull().defaultNow(),
  },
  (t) => [unique('image_crops_kind_asset_unique').on(t.kind, t.assetId)],
)

/**
 * 붙일 게임 데이터 표가 없는 앱 그림. key 는 앱이 그림을 찾는 이름이고 앱 코드가 든다. 드롭 연출 프레임은
 * `drop_effect_<단계>_<번호>` 라 key 가 단계와 차례를 든다.
 */
export const appImages = pgTable('app_images', {
  id: uuid('id').primaryKey().defaultRandom(),
  key: text('key').notNull().unique(),
  assetId: uuid('asset_id')
    .notNull()
    .references(() => assets.id),
})

/**
 * 아이템 묶음. 분류의 둘째 단이고 관리 화면의 아이템 화면에서 더하고 고친다. 첫 단인 종류(`kind`)는 서버 코드의
 * ITEM_KINDS 에 있는 key 다. key 는 앱이 고르기 목록을 거르는 데 써서 못 바꾼다.
 */
export const itemGroups = pgTable(
  'item_groups',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    key: text('key').notNull().unique(),
    kind: text('kind').notNull(),
    /** 소비 · 기타에 `보스 전리품` 이 하나씩 있어 이름은 종류 안에서만 유일하다. */
    name: text('name').notNull(),
    /** 같은 종류 안의 차례. */
    sortOrder: integer('sort_order').notNull(),
  },
  (t) => [unique('item_groups_kind_name_unique').on(t.kind, t.name)],
)

/**
 * 아이템 표 하나. 드롭 아이템 · 강화 장비 · 사냥 전리품이 모두 여기 한 줄이다(앱 저장소 ADR-187 결정 1). 기기 기록과
 * 강화 합계가 key 를 들어 key 는 못 바꾸고 줄을 지우지 않는다. 드롭 표 · 상자 · 드롭 가격은 id 를 FK 로 든다.
 */
export const items = pgTable(
  'items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    key: text('key').notNull().unique(),
    /** 띄어 쓴 게임 표기. NFC · 공백 제거 뒤에도 표 전체에서 유일하다(쓰기 검사). 앱이 넥슨 이름과 그 모양으로 맞춘다. */
    name: text('name').notNull(),
    /** 묶음 key. 아직 안 정했으면 NULL 이다. */
    category: text('category').references(() => itemGroups.key),
    /** 그림. 앱에는 파일 이름을 iconFile 로 낸다. 없으면 앱이 자리 그림을 그린다. */
    iconAssetId: uuid('icon_asset_id').references(() => assets.id),
    /** 고가 아이템. 드롭 연출과 최고가 위젯이 본다. */
    valuable: boolean('valuable').notNull().default(false),
    /** 월드끼리 거래할 수 없는 소비 아이템. 시세를 거래권이 아니라 월드 하나로 센다. 앱의 게임 데이터에는 안 싣는다. */
    worldBound: boolean('world_bound').notNull().default(false),
    /** 착용 레벨. 강화 장비만 든다. NULL 은 모른다는 뜻이고 0 이 아니다. 그 장비의 스타포스는 안 매기고 건수만 센다. */
    level: integer('level'),
    /** 앱의 dropItems 칸에 서는 아이템. 드롭 기록 시트 · 드롭 가격이 쓴다. */
    isDrop: boolean('is_drop').notNull().default(false),
    /** 앱의 equipmentItems 칸에 서는 장비. 앱이 강화 기록의 장비 이름에서 key 를 찾는다. */
    isEquipment: boolean('is_equipment').notNull().default(false),
    updatedAt: timestamptz('updated_at').notNull().defaultNow(),
  },
  (t) => [check('items_level_positive', sql`${t.level} IS NULL OR ${t.level} >= 1`)],
)

/** 드롭 표. 보스 한 난이도의 보상 한 줄. sort_order 가 드롭 시트의 타일 차례다. */
export const bossDropRewards = pgTable(
  'boss_drop_rewards',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    bossDifficultyId: uuid('boss_difficulty_id')
      .notNull()
      .references(() => bossDifficulties.id, { onDelete: 'cascade' }),
    category: dropCategoryEnum('category').notNull(),
    itemId: uuid('item_id')
      .notNull()
      .references(() => items.id),
    /** 고정 보상의 수량 글자. '160개'. */
    amount: text('amount'),
    /** KST 글자 그대로. YYYY-MM-DD 또는 YYYY-MM-DDTHH:mm. 앱의 기간 판정이 문자열 비교다. */
    from: text('from'),
    until: text('until'),
    sortOrder: integer('sort_order').notNull(),
  },
  (t) => [
    unique('boss_drop_rewards_row_unique')
      .on(t.bossDifficultyId, t.category, t.itemId, t.from)
      .nullsNotDistinct(),
  ],
)

/** 랜덤 상자. 반지 상자는 레벨 범위를 들고 장신구 상자는 둘 다 NULL 이다. */
export const dropBoxes = pgTable(
  'drop_boxes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    itemId: uuid('item_id')
      .notNull()
      .unique()
      .references(() => items.id),
    levelMin: integer('level_min'),
    levelMax: integer('level_max'),
  },
  (t) => [
    check('drop_boxes_level_pair', sql`(${t.levelMin} IS NULL) = (${t.levelMax} IS NULL)`),
    check('drop_boxes_level_order', sql`${t.levelMin} IS NULL OR ${t.levelMin} <= ${t.levelMax}`),
  ],
)

/** 상자 내용물. sort_order 가 상자를 열면 서는 후보 차례다. */
export const dropBoxContents = pgTable(
  'drop_box_contents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    boxId: uuid('box_id')
      .notNull()
      .references(() => dropBoxes.id, { onDelete: 'cascade' }),
    itemId: uuid('item_id')
      .notNull()
      .references(() => items.id),
    sortOrder: integer('sort_order').notNull(),
  },
  (t) => [unique('drop_box_contents_box_item_unique').on(t.boxId, t.itemId)],
)

/** 결정석 가격. 한 조합에 기간 줄이 여럿이고 until 이 없는 줄이 지금 가격이다. */
export const bossCrystalPrices = pgTable(
  'boss_crystal_prices',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    bossDifficultyId: uuid('boss_difficulty_id')
      .notNull()
      .references(() => bossDifficulties.id, { onDelete: 'cascade' }),
    /** 1인 기준 정가. 모르는 조합은 줄을 안 넣는다. */
    priceMeso: bigint('price_meso', { mode: 'number' }).notNull(),
    from: text('from'),
    until: text('until'),
  },
  (t) => [
    unique('boss_crystal_prices_pair_from_unique')
      .on(t.bossDifficultyId, t.from)
      .nullsNotDistinct(),
  ],
)

/** 월드 마스터 표. 기록 · 원장 · drop_prices.world_key 가 key 를 든다. 챌린저스 넷은 월드마다 key 이고 엠블럼만 같이 쓴다. */
export const worlds = pgTable('worlds', {
  id: uuid('id').primaryKey().defaultRandom(),
  key: text('key').notNull().unique(),
  /** API world_name 표기. 보이는 이름이다. */
  name: text('name').notNull(),
  /** 엠블럼 그림. 앱에는 그림 이름(확장자를 뗀 것)을 emblem 으로 낸다. 스페셜은 없다. */
  emblemAssetId: uuid('emblem_asset_id').references(() => assets.id),
  /** 시즌 보스를 보이고 월드 리프를 묻는 월드. */
  challengers: boolean('challengers').notNull().default(false),
  /** 재화에 가치가 없어 강화 지출에서 빼는 월드. */
  event: boolean('event').notNull().default(false),
  /**
   * 장비를 관세 내고 서로 거래할 수 있는 월드끼리 같은 값인 거래권. 장비 시세를 이 단위로 센다.
   * 챌린저스는 시즌마다 붙는 거래권이 달라 운영자가 고친다. NULL 이면 시세에서 빠진다. 앱의 게임 데이터에는 안 싣는다.
   */
  priceGroup: text('price_group').default('general'),
  /** 배열 순서가 곧 화면 순서다. */
  sortOrder: integer('sort_order').notNull(),
  updatedAt: timestamptz('updated_at').notNull().defaultNow(),
})

/**
 * 월드가 열린 기간. 이벤트 · 챌린저스 월드는 시즌마다 같은 이름으로 다시 열려 한 월드에 여러 줄이다.
 * from 은 연 날, until 은 닫힌 다음 날인 KST 글자(YYYY-MM-DD)이고 보스 기간과 경계의 뜻이 같다. 같은 월드의 기간은 안 겹친다.
 */
export const worldPeriods = pgTable(
  'world_periods',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    worldId: uuid('world_id')
      .notNull()
      .references(() => worlds.id, { onDelete: 'cascade' }),
    from: text('from').notNull(),
    until: text('until').notNull(),
    updatedAt: timestamptz('updated_at').notNull().defaultNow(),
  },
  (t) => [unique('world_periods_world_from_unique').on(t.worldId, t.from)],
)

/** 가계부 기록이 수입인지 지출인지. */
export const cashbookEntryTypeEnum = pgEnum('cashbook_entry_type', ['income', 'spend'])

/**
 * 가계부의 갈래. 기록이 (entry_type, key) 로 가리켜 지우지 않는다. key 는 관리 화면에서 더하므로 ENUM 이 아니다.
 * 앱이 입력 폼을 모르는 key 는 갈래 목록에 이름만 서고 못 고른다.
 */
export const cashbookCategories = pgTable(
  'cashbook_categories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entryType: cashbookEntryTypeEnum('entry_type').notNull(),
    key: text('key').notNull(),
    name: text('name').notNull(),
    /** 묶음이 없는 갈래의 하루 목록 카드 첫 줄. 묶음이 있는 갈래는 묶음의 card_title 을 쓴다. */
    cardTitle: text('card_title').notNull(),
    /** 그림. 앱에는 파일 이름을 iconFile 로 낸다. */
    iconAssetId: uuid('icon_asset_id')
      .notNull()
      .references(() => assets.id),
    /** 갈래 카드에만 서는 한 줄. */
    description: text('description').notNull(),
    /** 묶음이 없는 갈래의 수량 단위(사냥의 소재 등). NULL 은 수량이 없거나 항목 · 종류가 단위를 든다. */
    unit: text('unit'),
    sortOrder: integer('sort_order').notNull(),
  },
  (t) => [unique('cashbook_categories_entry_type_key_unique').on(t.entryType, t.key)],
)

/** 아이템 구매 · 판매의 종류. 게임 인벤토리 탭 이름이다. 수량과 관세가 이 값으로 갈린다. */
export const cashbookItemKinds = pgTable('cashbook_item_kinds', {
  id: uuid('id').primaryKey().defaultRandom(),
  key: text('key').notNull().unique(),
  name: text('name').notNull(),
  /** 수량 단위. NULL 이면 수량이 없다(장비). */
  unit: text('unit'),
  /** 월드 간 거래가 되는 종류만 구매 관세가 붙는다. */
  hasTariff: boolean('has_tariff').notNull(),
  sortOrder: integer('sort_order').notNull(),
})

/** 사냥 전리품의 분류. 앱 코드가 이 값으로 판매 폼을 갈라 ENUM 이다. */
export const huntLootKindEnum = pgEnum('hunt_loot_kind', ['fragment', 'consumable', 'event'])

/** 가계부 사냥 전리품 판매의 아이템. 기록이 key 를 들어 지우지 않고, 이벤트가 끝나면 until 로 닫는다. */
export const huntLootItems = pgTable(
  'hunt_loot_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** 아이템. key · 이름 · 그림은 아이템 표에 있다. */
    itemId: uuid('item_id')
      .notNull()
      .unique()
      .references(() => items.id),
    kind: huntLootKindEnum('kind').notNull(),
    /** NPC 에 파는 소비 아이템의 개당 가격. 앱이 단가를 채우고 수수료를 안 뗀다. */
    npcPriceMeso: integer('npc_price_meso'),
    /** KST 글자 그대로. 앱이 적는 날짜로 판정한다. */
    from: text('from'),
    until: text('until'),
    sortOrder: integer('sort_order').notNull(),
  },
  (t) => [
    check(
      'hunt_loot_items_npc_price',
      sql`(${t.kind} = 'consumable') = (${t.npcPriceMeso} IS NOT NULL) AND (${t.npcPriceMeso} IS NULL OR ${t.npcPriceMeso} > 0)`,
    ),
  ],
)

export const spendCurrencyEnum = pgEnum('spend_currency', ['point', 'meso'])
/** 에픽던전 추가 리워드가 값을 받는 형태. 앱 코드가 이 값으로 갈려 ENUM 이다. 이름은 spend_forms 가 든다. */
export const spendFormEnum = pgEnum('spend_form', ['exp', 'sol_erda'])

/** 형태의 이름. 카드에도 이 이름이 선다. */
export const spendForms = pgTable('spend_forms', {
  id: uuid('id').primaryKey().defaultRandom(),
  key: spendFormEnum('key').notNull().unique(),
  name: text('name').notNull(),
  sortOrder: integer('sort_order').notNull(),
})

/** 지출 목록의 제목 한 줄. active 가 열기 · 닫기 스위치다. 날짜로 판정하지 않는다. */
export const spendGroups = pgTable('spend_groups', {
  id: uuid('id').primaryKey().defaultRandom(),
  key: text('key').notNull().unique(),
  name: text('name').notNull(),
  /** 지출 갈래만 가리킨다. 리포지토리가 entry_type 을 본다. */
  categoryId: uuid('category_id')
    .notNull()
    .references(() => cashbookCategories.id),
  /** 하루 목록 카드 첫 줄. */
  cardTitle: text('card_title').notNull(),
  /** 닫힌 묶음은 앱에서 흐리게 서고 못 고른다. 과거 기록은 그대로다. */
  active: boolean('active').notNull().default(true),
  sortOrder: integer('sort_order').notNull(),
})

/** 지출 목록의 한 칸. 같은 타일의 항목이 한 칸으로 접힌다. 그림은 아이템 파일과 지역 아이콘 중 하나다. */
export const spendTiles = pgTable(
  'spend_tiles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    key: text('key').notNull().unique(),
    name: text('name').notNull(),
    /** 아이템 그림. 앱에는 파일 이름을 iconFile 로 낸다. */
    iconAssetId: uuid('icon_asset_id').references(() => assets.id),
    /** 지역 아이콘 그림. 앱에는 그림 이름(확장자를 뗀 것)을 iconMap 으로 낸다. 에픽던전 넷. */
    iconMapAssetId: uuid('icon_map_asset_id').references(() => assets.id),
  },
  (t) => [
    check('spend_tiles_icon_one', sql`${t.iconAssetId} IS NULL OR ${t.iconMapAssetId} IS NULL`),
  ],
)

/** 지출 항목. 기록이 key 를 든다. 가격 하나와 그 단위다. 지우지 않고 until 로 닫는다. */
export const spendItems = pgTable(
  'spend_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    key: text('key').notNull().unique(),
    groupId: uuid('group_id')
      .notNull()
      .references(() => spendGroups.id),
    tileId: uuid('tile_id')
      .notNull()
      .references(() => spendTiles.id),
    /** 원본 이름. 하루 목록 카드에도 이 이름이 선다. */
    name: text('name').notNull(),
    /** 좁은 자리용으로 줄인 이름. NULL 이면 name 을 쓴다. */
    shortName: text('short_name'),
    /** 타일 안의 단계. 축 값(spend_item_options)을 든 항목은 NULL 이다. */
    tier: text('tier'),
    currency: spendCurrencyEnum('currency').notNull(),
    /** NULL 은 경매장 값이라 앱이 적을 때 친다. */
    unitPrice: bigint('unit_price', { mode: 'number' }),
    /** 회 · 개 · 포인트 · 시간. 수량 칸의 라벨이다. */
    unit: text('unit').notNull(),
    /** 기록 한 건의 수량 상한. */
    maxQuantity: integer('max_quantity'),
    /** 한 형태에서 받는 세라자르 주화 개수. 형태를 든 항목만 든다. */
    rewardCoins: integer('reward_coins'),
    /** KST 글자 그대로. 앱이 적는 날짜가 든 주간 기간의 첫날로 판정한다. */
    from: text('from'),
    until: text('until'),
    /** 묶음 안의 차례. 타일 차례는 첫 항목의 차례다. */
    sortOrder: integer('sort_order').notNull(),
  },
  (t) => [
    check('spend_items_unit_price_nonnegative', sql`${t.unitPrice} IS NULL OR ${t.unitPrice} >= 0`),
  ],
)

/** 축이 둘인 타일의 항목이 드는 축 값. 앱은 고른 값과 꼭 맞는 항목 하나를 찾는다. */
export const spendItemOptions = pgTable(
  'spend_item_options',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    itemId: uuid('item_id')
      .notNull()
      .references(() => spendItems.id, { onDelete: 'cascade' }),
    axis: text('axis').notNull(),
    value: text('value').notNull(),
  },
  (t) => [unique('spend_item_options_item_axis_unique').on(t.itemId, t.axis)],
)

/** 항목이 값을 받는 형태. 가격을 안 바꾸고 형태마다 단계를 따로 고른다. */
export const spendItemForms = pgTable(
  'spend_item_forms',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    itemId: uuid('item_id')
      .notNull()
      .references(() => spendItems.id, { onDelete: 'cascade' }),
    formId: uuid('form_id')
      .notNull()
      .references(() => spendForms.id),
  },
  (t) => [unique('spend_item_forms_item_form_unique').on(t.itemId, t.formId)],
)

/** 심볼 묶음. 아케인 · 어센틱 · 그랜드 어센틱. 만렙과 고르면 서는 기본 범위를 든다. */
export const symbolGroups = pgTable(
  'symbol_groups',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    key: text('key').notNull().unique(),
    name: text('name').notNull(),
    maxLevel: integer('max_level').notNull(),
    defaultFrom: integer('default_from').notNull(),
    defaultTo: integer('default_to').notNull(),
    sortOrder: integer('sort_order').notNull(),
  },
  (t) => [
    check(
      'symbol_groups_default_range',
      sql`${t.defaultFrom} < ${t.defaultTo} AND ${t.defaultTo} <= ${t.maxLevel}`,
    ),
  ],
)

/** 심볼. key 는 기록의 item_key 이고 사냥터 표의 지역 key 와 같다. */
export const symbols = pgTable('symbols', {
  id: uuid('id').primaryKey().defaultRandom(),
  key: text('key').notNull().unique(),
  groupId: uuid('group_id')
    .notNull()
    .references(() => symbolGroups.id),
  /** 넥슨 응답의 심볼 이름이 이것으로 끝나야 레벨이 맞춰진다. */
  name: text('name').notNull(),
  /** 착용 레벨. 캐릭터 레벨 이하인 것만 드롭다운에 선다. */
  requiredLevel: integer('required_level').notNull(),
  /** 그림. 앱에는 파일 이름을 iconFile 로 낸다. */
  iconAssetId: uuid('icon_asset_id')
    .notNull()
    .references(() => assets.id),
  sortOrder: integer('sort_order').notNull(),
})

/** 심볼 한 레벨의 강화 비용. 결정석 가격처럼 한 조합(심볼 · 레벨)에 기간 줄이 여럿이고 until 이 없는 줄이 지금 값이다. */
export const symbolLevelCosts = pgTable(
  'symbol_level_costs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    symbolId: uuid('symbol_id')
      .notNull()
      .references(() => symbols.id, { onDelete: 'cascade' }),
    /** 강화 전 레벨. Lv.level → level+1 의 값이다. 1 부터 max_level - 1 까지. */
    level: integer('level').notNull(),
    costMeso: bigint('cost_meso', { mode: 'number' }).notNull(),
    from: text('from'),
    until: text('until'),
  },
  (t) => [
    unique('symbol_level_costs_row_unique').on(t.symbolId, t.level, t.from).nullsNotDistinct(),
    check('symbol_level_costs_level_positive', sql`${t.level} >= 1`),
  ],
)

/** 헥사 코어 종류. 레벨별 비용을 들고, 이름 표에 없는 코어는 API 타입의 기본 종류로 본다. */
export const hexaCoreKinds = pgTable(
  'hexa_core_kinds',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    key: text('key').notNull().unique(),
    name: text('name').notNull(),
    /** 넥슨 hexamatrix 응답의 hexa_core_type 글자. '스킬 코어'. */
    apiType: text('api_type').notNull(),
    isDefault: boolean('is_default').notNull().default(false),
    maxLevel: integer('max_level').notNull().default(30),
    /** 그림. 앱에는 파일 이름을 iconFile 로 낸다. */
    iconAssetId: uuid('icon_asset_id')
      .notNull()
      .references(() => assets.id),
    sortOrder: integer('sort_order').notNull(),
  },
  (t) => [
    // 기본 종류가 둘이면 이름 표에 없는 코어의 종류가 하나로 안 정해진다.
    uniqueIndex('hexa_core_kinds_default_unique')
      .on(t.apiType)
      .where(sql`${t.isDefault}`),
    check('hexa_core_kinds_max_level_positive', sql`${t.maxLevel} >= 1`),
  ],
)

/** 헥사 코어 한 레벨의 강화 비용. 기간 줄 없이 종류 · 레벨마다 한 줄이다. */
export const hexaCoreLevelCosts = pgTable(
  'hexa_core_level_costs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    kindId: uuid('kind_id')
      .notNull()
      .references(() => hexaCoreKinds.id, { onDelete: 'cascade' }),
    /** 강화 전 레벨. Lv.level → level+1 의 값이다. 0 부터 max_level - 1 까지. */
    level: integer('level').notNull(),
    fragments: integer('fragments').notNull(),
    solErda: integer('sol_erda').notNull(),
  },
  (t) => [
    unique('hexa_core_level_costs_kind_level_unique').on(t.kindId, t.level),
    check('hexa_core_level_costs_level_nonnegative', sql`${t.level} >= 0`),
    check(
      'hexa_core_level_costs_amounts_nonnegative',
      sql`${t.fragments} >= 0 AND ${t.solErda} >= 0`,
    ),
  ],
)

/** 기본 종류가 아닌 코어의 이름 → 종류. 이름은 앞뒤 공백을 걷어 둔다. 넥슨 응답이 공백을 붙여 올 때가 있다. */
export const hexaCoreNameKinds = pgTable('hexa_core_name_kinds', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull().unique(),
  kindId: uuid('kind_id')
    .notNull()
    .references(() => hexaCoreKinds.id),
})

/** 직업마다 가진 헥사 코어 전부. 활성화 전 코어는 넥슨 응답에 없어 이 표로 고르는 목록을 세운다. */
export const hexaJobCores = pgTable(
  'hexa_job_cores',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** 넥슨 character_class 글자. '아크메이지(불,독)'. */
    job: text('job').notNull(),
    name: text('name').notNull(),
    apiType: text('api_type').notNull(),
    /** 스킬 그림. 앱에는 파일 이름을 iconFile 로 낸다. */
    iconAssetId: uuid('icon_asset_id')
      .notNull()
      .references(() => assets.id),
    /** 직업 안의 차례. hexamatrix 응답의 차례다. */
    sortOrder: integer('sort_order').notNull(),
  },
  (t) => [unique('hexa_job_cores_job_name_unique').on(t.job, t.name)],
)

/** 헥사 스탯. 활성화 비용을 모르는 스탯은 NULL 이고 앱이 활성화 체크를 막는다. */
export const hexaStats = pgTable(
  'hexa_stats',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    key: text('key').notNull().unique(),
    name: text('name').notNull(),
    activationFragments: integer('activation_fragments'),
    sortOrder: integer('sort_order').notNull(),
  },
  (t) => [
    check(
      'hexa_stats_activation_nonnegative',
      sql`${t.activationFragments} IS NULL OR ${t.activationFragments} >= 0`,
    ),
  ],
)

/** 앱 화면의 FAQ 시트 하나. 묶음 목록이 ENUM 이 아니라 이 표의 줄이라 페이지가 늘면 줄만 더한다. */
export const faqSheets = pgTable(
  'faq_sheets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** 앱이 화면에 단 값. 소문자 · 숫자 · 붙임표다. */
    key: text('key').notNull().unique(),
    title: text('title').notNull(),
    sortOrder: integer('sort_order').notNull(),
  },
  (t) => [check('faq_sheets_key_format', sql`${t.key} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`)],
)

/** FAQ 문항 하나. sort_order 는 묶음 안의 차례다. */
export const faqItems = pgTable(
  'faq_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sheetId: uuid('sheet_id')
      .notNull()
      .references(() => faqSheets.id, { onDelete: 'cascade' }),
    sortOrder: integer('sort_order').notNull(),
    question: text('question').notNull(),
    /** 블록 배열. 앱은 모르는 kind 의 블록만 버린다. */
    answer: jsonb('answer').$type<{ kind: 'paragraph'; text: string }[]>().notNull(),
  },
  (t) => [check('faq_items_answer_array', sql`jsonb_typeof(${t.answer}) = 'array'`)],
)

/** 컨텐츠 갈래. 앱 CONTENT_CATEGORIES 의 key 집합 그대로다. 카드 모양 · 길드 판정 · 계열 한도가 이 값으로 갈린다. */
export const contentCategoryEnum = pgEnum('content_category', [
  'monster_park',
  'daily_quest',
  'epic_dungeon',
  'maple_union',
  'arcane_river_quest',
  'weekly_quest',
  'mu_lung_dojo',
  'guild',
])
/** 넥슨 응답의 daily_contents · weekly_contents 중 어디서 오는가. */
export const contentSectionEnum = pgEnum('content_section', ['daily', 'weekly'])
/** 카운트형(contents)과 퀘스트형(quest). 수동 모드 기본값과 완료 판정이 갈린다. */
export const contentTypeEnum = pgEnum('content_type', ['contents', 'quest'])
/** 진행이 누구와 공유되는가. 캐릭터 · 월드 · 계정. */
export const shareScopeEnum = pgEnum('share_scope', ['character', 'world', 'account'])

/** 갈래의 글자 · 태그 · 한도 · 차례. ENUM 여덟과 일대일이라 줄을 더하고 지우는 것은 마이그레이션이다. */
export const contentCategories = pgTable(
  'content_categories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    key: contentCategoryEnum('key').notNull().unique(),
    /** 카드 라벨 · today 공유 위젯의 머리글. */
    name: text('name').notNull(),
    /** 갈래의 참고 태그. 글자와 숨김 중 하나다. */
    countTag: text('count_tag'),
    hideCountTag: boolean('hide_count_tag').notNull().default(false),
    /** 갈래의 주간 진행 한도. 등록 여부와 무관하게 완료한 항목 수를 센다. */
    weeklyLimit: integer('weekly_limit'),
    /** today 공유 위젯의 계열 차례. NULL 은 뒤에 선다. */
    sharedOrder: integer('shared_order'),
    /** 관리 화면 주간 목록의 갈래 차례. */
    sortOrder: integer('sort_order').notNull(),
  },
  (t) => [
    check('content_categories_tag_one', sql`${t.countTag} IS NULL OR NOT ${t.hideCountTag}`),
    check(
      'content_categories_weekly_limit_positive',
      sql`${t.weeklyLimit} IS NULL OR ${t.weeklyLimit} >= 1`,
    ),
  ],
)

/** 컨텐츠 한 줄. 공유 카탈로그의 줄은 이 표의 칸이다. 캐시 · 추적 목록 · 공유 원장이 key 를 들어 지우지 않는다. */
export const contents = pgTable(
  'contents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    key: text('key').notNull().unique(),
    section: contentSectionEnum('section').notNull(),
    /** 넥슨 응답의 content_name. 앱이 NFC · 공백 제거 뒤 완전 일치로 key 를 얻는다. */
    apiName: text('api_name').notNull().unique(),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => contentCategories.id),
    displayName: text('display_name').notNull(),
    shortName: text('short_name').notNull(),
    /**
     * 카드 그림. 지도 배경과 보스 초상 중 하나다. 앱에는 그림 id 와 옛 앱이 읽는 그림 이름(확장자를 뗀 것)을 함께 낸다.
     */
    backgroundMapAssetId: uuid('background_map_asset_id').references(() => assets.id),
    backgroundPortraitAssetId: uuid('background_portrait_asset_id').references(() => assets.id),
    /** 카드의 지역 아이콘. 지도 배경이 있는 카드가 그 옆에 세운다. */
    regionIconAssetId: uuid('region_icon_asset_id').references(() => assets.id),
    /** 컨텐츠가 참고 태그를 덮는 글자. */
    countTag: text('count_tag'),
    type: contentTypeEnum('type').notNull(),
    /** 수동 모드의 기본 상한. */
    maxCount: integer('max_count').notNull(),
    /** 표시용 요구 레벨. 잠금이 아니다. */
    requiredLevel: integer('required_level'),
    /** KST 글자 그대로. 판정은 주간 기간의 첫날이다. */
    from: text('from'),
    until: text('until'),
    shareScope: shareScopeEnum('share_scope').notNull().default('character'),
    /** today 공유 위젯의 글자. 공유 줄만 든다. */
    sharedShortName: text('shared_short_name'),
    /** 추적 중인 캐릭터 누구의 스케줄러에도 없으면 위젯이 안 그린다. */
    onlyWhenScheduled: boolean('only_when_scheduled').notNull().default(false),
    /** 병합이 이번 응답의 registration_flag 로 등록을 정한다. */
    trustRegistrationFlag: boolean('trust_registration_flag').notNull().default(false),
    /** 리셋 없이 누적되는 개인 점수. 후보 자격 판정에서 뺀다. */
    cumulativeScore: boolean('cumulative_score').notNull().default(false),
    /** API 의 알려진 오류를 덮는 값. 게임 규칙은 여기 적지 않는다. */
    maxCountOverride: integer('max_count_override'),
    /** 섹션 안의 차례. 관리 화면 목록의 차례다. */
    sortOrder: integer('sort_order').notNull(),
  },
  (t) => [
    check(
      'contents_background_one',
      sql`${t.backgroundMapAssetId} IS NULL OR ${t.backgroundPortraitAssetId} IS NULL`,
    ),
    check(
      'contents_shared_name_pairs_scope',
      sql`(${t.shareScope} = 'character') = (${t.sharedShortName} IS NULL)`,
    ),
    check(
      'contents_character_flags_off',
      sql`${t.shareScope} <> 'character' OR (NOT ${t.onlyWhenScheduled} AND NOT ${t.trustRegistrationFlag})`,
    ),
    check('contents_max_count_nonnegative', sql`${t.maxCount} >= 0`),
    check(
      'contents_required_level_positive',
      sql`${t.requiredLevel} IS NULL OR ${t.requiredLevel} >= 1`,
    ),
    check(
      'contents_max_count_override_positive',
      sql`${t.maxCountOverride} IS NULL OR ${t.maxCountOverride} >= 1`,
    ),
  ],
)

/** 잠재 재설정의 종류. API 의 '잠재능력 재설정' · '에디셔널 잠재능력 재설정' 을 앱 상수가 맞춘다. */
export const potentialResetTypeEnum = pgEnum('potential_reset_type', ['potential', 'additional'])
/** 잠재 등급. 노멀은 재설정할 수 없어 없다. API 의 한글 글자는 앱 상수가 맞춘다. */
export const potentialGradeEnum = pgEnum('potential_grade', ['rare', 'epic', 'unique', 'legendary'])
/** MVP 등급. 앱 MvpGradeKey 그대로다. 낮은 등급부터. */
export const mvpGradeEnum = pgEnum('mvp_grade', [
  'normal',
  'bronze',
  'silver',
  'gold',
  'diamond',
  'red',
  'black',
])

/** 잠재 재설정 1회 비용. 종류 · 레벨 구간 · 등급마다 한 줄이고 기간 줄이 없다. 비용은 누르기 전 등급으로 매긴다. */
export const potentialResetCosts = pgTable(
  'potential_reset_costs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    type: potentialResetTypeEnum('type').notNull(),
    /** 구간의 시작. 장비 레벨 이하인 줄 중 가장 큰 것이 그 레벨의 줄이다. 종류마다 1 이 있어야 한다. */
    minLevel: integer('min_level').notNull(),
    grade: potentialGradeEnum('grade').notNull(),
    costMeso: bigint('cost_meso', { mode: 'number' }).notNull(),
  },
  (t) => [
    unique('potential_reset_costs_cell_unique').on(t.type, t.minLevel, t.grade),
    check('potential_reset_costs_min_level_positive', sql`${t.minLevel} >= 1`),
    check('potential_reset_costs_cost_nonnegative', sql`${t.costMeso} >= 0`),
  ],
)

/** 소울 잠재 재설정 1회 비용. 등급 하나로 정해지고 장비 레벨을 안 본다. */
export const soulPotentialResetCosts = pgTable(
  'soul_potential_reset_costs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    grade: potentialGradeEnum('grade').notNull().unique(),
    costMeso: bigint('cost_meso', { mode: 'number' }).notNull(),
  },
  (t) => [check('soul_potential_reset_costs_cost_nonnegative', sql`${t.costMeso} >= 0`)],
)

/** 스타포스 한 단계의 식 재료. 식 자체는 앱 코드가 든다. 0 부터 빠짐없이 있어야 한다. */
export const starforceSteps = pgTable(
  'starforce_steps',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** 시도 전 성수. */
    fromStar: integer('from_star').notNull().unique(),
    exponent: doublePrecision('exponent').notNull(),
    divisor: integer('divisor').notNull(),
  },
  (t) => [
    check('starforce_steps_from_star_nonnegative', sql`${t.fromStar} >= 0`),
    check('starforce_steps_divisor_positive', sql`${t.divisor} >= 1`),
  ],
)

/** MVP 등급의 혜택. ENUM 일곱과 일대일이라 줄을 더하고 지우는 것은 마이그레이션이다. 차례가 높낮이다. */
export const mvpGrades = pgTable(
  'mvp_grades',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    key: mvpGradeEnum('key').notNull().unique(),
    name: text('name').notNull(),
    auctionFeePercent: integer('auction_fee_percent').notNull(),
    starforceDiscountPercent: integer('starforce_discount_percent').notNull(),
    /** 명패 그림. 일반 등급은 명패가 없어 NULL 이다. */
    plateAssetId: uuid('plate_asset_id').references(() => assets.id),
    /** 낮은 등급이 앞. 소속을 모르는 스타포스 줄이 그 날 가장 높은 등급을 찾을 때 쓴다. */
    sortOrder: integer('sort_order').notNull(),
  },
  (t) => [
    check('mvp_grades_auction_fee_range', sql`${t.auctionFeePercent} BETWEEN 0 AND 100`),
    check(
      'mvp_grades_starforce_discount_range',
      sql`${t.starforceDiscountPercent} BETWEEN 0 AND 100`,
    ),
  ],
)

/** 지역이 요구하는 힘의 종류. 이름 · 아이콘은 앱 상수가 든다. */
export const forceTypeEnum = pgEnum('force_type', ['arcane', 'authentic'])

/** 사냥터의 지역. 사냥터가 지역을 가리켜 지우지 않는다. 심볼과는 key 글자가 같을 뿐 FK 가 없다. */
export const huntingRegions = pgTable('hunting_regions', {
  id: uuid('id').primaryKey().defaultRandom(),
  key: text('key').notNull().unique(),
  name: text('name').notNull(),
  forceType: forceTypeEnum('force_type').notNull(),
  /** 지역 아이콘 그림. 앱에는 그림 이름(확장자를 뗀 것)을 iconMap 으로 낸다. 가계부 사냥 시트의 지역 드롭다운에 선다. 비면 이름만 선다. */
  iconMapAssetId: uuid('icon_map_asset_id').references(() => assets.id),
  /** 파일의 차례. 앱은 역순으로 세운다. */
  sortOrder: integer('sort_order').notNull(),
})

/** 사냥터 한 줄. 기록(income_records 의 사냥터 key)이 key 를 들어 지우지 않는다. */
export const huntingGrounds = pgTable(
  'hunting_grounds',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** 지역 key_번역. 그 지역의 key 로 시작한다. */
    key: text('key').notNull().unique(),
    regionId: uuid('region_id')
      .notNull()
      .references(() => huntingRegions.id),
    /** 전역 유일. 이름만 든 옛 기록을 key 로 옮기는 이관이 이름으로 찾는다. */
    name: text('name').notNull().unique(),
    /** 아케인 · 어센틱 포스 요구치. 어느 쪽인지는 지역이 안다. */
    force: integer('force').notNull(),
    /** 맵에 한 번에 뜨는 마릿수. 효율 조각이 이 수로 퍼센트를 만든다. */
    mobs: integer('mobs').notNull(),
    /** 지역 안의 차례. 레벨 차이 · 마릿수가 동률일 때의 차례다. */
    sortOrder: integer('sort_order').notNull(),
    /** 인기 사냥터 여부. 사용자가 고르는 값이라 모두 false 로 시작하고 관리 화면 목록 줄에서 고른다. */
    popular: boolean('popular').notNull().default(false),
  },
  (t) => [
    check('hunting_grounds_force_nonnegative', sql`${t.force} >= 0`),
    check('hunting_grounds_mobs_positive', sql`${t.mobs} >= 1`),
  ],
)

/** 사냥터의 몬스터 레벨 한 줄. 레벨이 둘이면 레벨마다 재서 평균내므로 범위가 아니라 목록이다. */
export const huntingGroundLevels = pgTable(
  'hunting_ground_levels',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    groundId: uuid('ground_id')
      .notNull()
      .references(() => huntingGrounds.id, { onDelete: 'cascade' }),
    level: integer('level').notNull(),
  },
  (t) => [
    unique('hunting_ground_levels_ground_level_unique').on(t.groundId, t.level),
    check('hunting_ground_levels_level_positive', sql`${t.level} >= 1`),
  ],
)

/** 분배 방식. 비율 1:3 과 균등 3인은 두 수가 같아 이 칸 없이는 못 가른다. */
export const splitModeEnum = pgEnum('split_mode', ['even', 'ratio'])
/** 처치를 누가 적었나. auto 는 동기화, manual 은 사용자가 직접 적은 완료다. */
export const clearSourceEnum = pgEnum('clear_source', ['auto', 'manual'])

/**
 * 보스 처치 기간 하나의 최종값. 기기의 boss_party_periods 중 처치한 행이고, 기기가 기준이라 서버는 사본이다.
 *
 * 처치를 취소하거나 기록이 사라지면 줄을 남기고 deleted_at 을 적는다.
 */
export const bossClears = pgTable(
  'boss_clears',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    identifiedBy: identitySourceEnum('identified_by').notNull(),
    /** 기기의 기간 행 id. 메이플 ID 안에서만 유일하다. 리프로 ocid 가 바뀌어도 이것으로 같은 줄을 찾는다. */
    periodRecordId: uuid('period_record_id').notNull(),
    /** 잡은 캐릭터의 메이플 ID. 계정을 삭제하면 줄도 지워진다. */
    mapleId: text('maple_id')
      .notNull()
      .references(() => nexonAccountMapleIds.mapleId, { onDelete: 'cascade', onUpdate: 'cascade' }),
    ocid: text('ocid').notNull(),
    /** 같은 처치를 가리는 보스. 표에 없는 보스면 NULL. */
    bossId: uuid('boss_id').references(() => bosses.id, { onDelete: 'set null' }),
    /** 표에 없는 보스 · 난이도면 NULL. */
    bossDifficultyId: uuid('boss_difficulty_id').references(() => bossDifficulties.id, {
      onDelete: 'set null',
    }),
    cycle: bossCycleEnum('cycle').notNull(),
    /** 주간 YYYY-MM-DD · 월간 YYYY-MM. */
    periodKey: text('period_key').notNull(),
    /** 앱이 월드를 모르면 NULL 이고, 모르는 key 는 받지 않는다. */
    worldId: uuid('world_id').references(() => worlds.id),
    priceMeso: bigint('price_meso', { mode: 'number' }).notNull(),
    /** 받은 몫. 분배와 수수료를 뗀 값이다. */
    payoutMeso: bigint('payout_meso', { mode: 'number' }).notNull(),
    splitMode: splitModeEnum('split_mode').notNull(),
    partySize: integer('party_size').notNull(),
    myShare: integer('my_share'),
    sharesTotal: integer('shares_total'),
    splitFeePercent: integer('split_fee_percent'),
    /** 처치 날짜(KST YYYY-MM-DD). 모르면 NULL. */
    defeatedDate: text('defeated_date'),
    source: clearSourceEnum('source').notNull(),
    deletedAt: timestamptz('deleted_at'),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
    updatedAt: timestamptz('updated_at').notNull().defaultNow(),
  },
  (t) => [
    unique('boss_clears_maple_record_unique').on(t.mapleId, t.periodRecordId),
    // 한 캐릭터는 한 기간에 한 보스를 한 번 잡는다. 난이도를 넣으면 난이도만 고친 같은 처치가 두 줄이 된다.
    uniqueIndex('boss_clears_same_clear_unique')
      .on(t.ocid, t.bossId, t.periodKey)
      .where(sql`${t.deletedAt} IS NULL`),
    index('boss_clears_difficulty_period_idx').on(t.bossDifficultyId, t.periodKey),
    check(
      'boss_clears_ratio_shares',
      sql`(${t.splitMode} = 'ratio') = (${t.myShare} IS NOT NULL AND ${t.sharesTotal} IS NOT NULL)`,
    ),
  ],
)

/**
 * 가계부 기록 한 건의 최종값. 기기의 cashbook_entries 사본이다. 금액은 품목 줄에 있다.
 *
 * key 는 글자 그대로다. 갈래마다 다른 표를 가리켜 외래키로 바꾸면 표에 없는 key 의 기록을 거절하게 된다.
 */
export const serverCashbookEntries = pgTable(
  'cashbook_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    identifiedBy: identitySourceEnum('identified_by').notNull(),
    /**
     * 기기의 기록 id. 메이플 ID 안에서만 유일하다. 사용자가 직접 적는 기록이라 내용으로 가리지 않는다. 같은 날 같은 물건을 두 번
     * 산 기록은 내용이 같아도 둘 다 맞는 기록이다.
     */
    entryRecordId: uuid('entry_record_id').notNull(),
    /** 기록의 메이플 ID. 캐릭터 기록은 그 캐릭터의 메이플 ID 다. 계정을 삭제하면 줄도 지워진다. */
    mapleId: text('maple_id')
      .notNull()
      .references(() => nexonAccountMapleIds.mapleId, { onDelete: 'cascade', onUpdate: 'cascade' }),
    /** NULL 은 메이플 ID 기록이다. */
    ocid: text('ocid'),
    entryType: cashbookEntryTypeEnum('entry_type').notNull(),
    categoryKey: text('category_key').notNull(),
    /** 돈이 오간 날(KST YYYY-MM-DD). */
    entryDate: text('entry_date').notNull(),
    deletedAt: timestamptz('deleted_at'),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
    updatedAt: timestamptz('updated_at').notNull().defaultNow(),
  },
  (t) => [
    unique('cashbook_entries_maple_record_unique').on(t.mapleId, t.entryRecordId),
    index('cashbook_entries_category_date_idx').on(t.entryType, t.categoryKey, t.entryDate),
  ],
)

/** 가계부 기록의 품목. 기록을 다시 받으면 통째로 갈아 끼운다. */
export const serverCashbookEntryItems = pgTable(
  'cashbook_entry_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entryId: uuid('entry_id')
      .notNull()
      .references(() => serverCashbookEntries.id, { onDelete: 'cascade' }),
    sortOrder: integer('sort_order').notNull(),
    itemKey: text('item_key'),
    /** 사용자가 직접 친 품목 이름. key 가 있으면 NULL 이다. */
    itemName: text('item_name'),
    formKey: text('form_key'),
    itemKindKey: text('item_kind_key'),
    quantity: integer('quantity'),
    fromLevel: integer('from_level'),
    toLevel: integer('to_level'),
    amountMeso: bigint('amount_meso', { mode: 'number' }),
    tariffMeso: bigint('tariff_meso', { mode: 'number' }),
    saleFeePercent: integer('sale_fee_percent'),
    saleFeeMeso: bigint('sale_fee_meso', { mode: 'number' }),
    amountPoint: bigint('amount_point', { mode: 'number' }),
    pointPer100mMeso: integer('point_per_100m_meso'),
    amountCash: bigint('amount_cash', { mode: 'number' }),
    /** 헥사 강화에 든 솔 에르다 조각. 금액은 (이 값 - 교환 불가) × 개당 가격이다. */
    fragmentCount: integer('fragment_count'),
    untradableFragmentCount: integer('untradable_fragment_count'),
    fragmentPriceMeso: bigint('fragment_price_meso', { mode: 'number' }),
    /** 헥사 스탯 기록이 활성화 비용을 포함하는가. 다시 열 때 활성화 체크를 세운다. */
    hexaActivation: boolean('hexa_activation'),
  },
  (t) => [unique('cashbook_entry_items_entry_order_unique').on(t.entryId, t.sortOrder)],
)

/** 강화 분류. 앱 화면이 가르는 다섯이고, 잠재를 본 잠재와 에디셔널로 나눈다. */
export const enhancementCategoryEnum = pgEnum('enhancement_category', [
  'cube_reset',
  'starforce',
  'potential',
  'additional_potential',
  'soul_potential',
])

/**
 * 강화 지출 합계 한 줄. 기기의 enhancement_totals 중 이벤트 월드가 아닌 줄의 사본이다.
 *
 * 비용은 MVP 할인 전이다. 할인은 사람마다 등급이 달라 통계에 섞이면 안 된다. 넥슨 응답은 캐릭터를 이름으로만 줘서, 기기가
 * 그날 그 이름이었던 캐릭터의 ocid 를 붙여 보낸다.
 */
export const enhancementTotals = pgTable(
  'enhancement_totals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    identifiedBy: identitySourceEnum('identified_by').notNull(),
    /** 기기의 합계 id. 지우기 경로가 찾는 값이다. 다시 설치한 기기는 같은 합계에 새 id 를 붙여 유일 기준이 아니다. */
    totalRecordId: uuid('total_record_id').notNull(),
    /** 강화한 캐릭터의 메이플 ID. 계정을 삭제하면 줄도 지워진다. */
    mapleId: text('maple_id')
      .notNull()
      .references(() => nexonAccountMapleIds.mapleId, { onDelete: 'cascade', onUpdate: 'cascade' }),
    /** 그날 그 이름이었던 캐릭터. 이름을 바꿔도 그대로라 이것으로 가린다. */
    ocid: text('ocid').notNull(),
    /** 강화한 날(KST YYYY-MM-DD). */
    historyDate: text('history_date').notNull(),
    enhancementCategory: enhancementCategoryEnum('enhancement_category').notNull(),
    /** 앱 장비 표의 key. 표에 없는 장비면 NULL 이고 이름만 있다. */
    itemKey: text('item_key'),
    itemName: text('item_name').notNull(),
    /** 장비 key 면 'key:…', 없으면 공백을 지운 이름 'name:…'. 기기 표와 같다. */
    itemGroup: text('item_group').notNull(),
    attempts: integer('attempts').notNull(),
    /** MVP 할인을 받는 시도 비용 합계. */
    attemptCostMeso: bigint('attempt_cost_meso', { mode: 'number' }).notNull(),
    /** 할인을 받지 않는 파괴 방지 추가 비용 합계. */
    destroyDefenceCostMeso: bigint('destroy_defence_cost_meso', { mode: 'number' }).notNull(),
    deletedAt: timestamptz('deleted_at'),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
    updatedAt: timestamptz('updated_at').notNull().defaultNow(),
  },
  (t) => [
    unique('enhancement_totals_same_total_unique').on(
      t.ocid,
      t.historyDate,
      t.enhancementCategory,
      t.itemGroup,
    ),
    index('enhancement_totals_category_date_idx').on(t.enhancementCategory, t.historyDate),
  ],
)

/** 강화 내역의 API 종류. 앱이 받은 엔드포인트 넷이다. */
export const enhancementTypeEnum = pgEnum('enhancement_type', [
  'cube',
  'starforce',
  'potential',
  'soul_potential',
])

/** 강화 합계에서 빠지거나 판정하지 못한 이유. */
export const enhancementAnomalyTypeEnum = pgEnum('enhancement_anomaly_type', [
  'event_world_unknown',
  'no_level',
  'no_grade',
  'no_star',
  'no_type',
  'no_cost',
])

/**
 * 앱이 강화 합계에서 빼거나 이벤트 월드를 판정하지 못한 줄의 수. 운영자가 예상하지 못한 상황의 양과 모양을 보는 표이고 통계에
 * 쓰지 않는다. 앱은 응답 원본을 저장하지 않아 이 값이 원인을 볼 유일한 단서다. 캐릭터 이름은 받지 않는다.
 */
/** 사용 로그 사건의 종류. 모르는 종류를 받으면 운영자가 뜻을 모르는 줄이 쌓인다. */
export const usageEventTypeEnum = pgEnum('usage_event_type', ['visit', 'screen', 'action'])

/**
 * 앱 사용 로그. 사건 하나에 줄 하나다. 일 방문자 · 방문 횟수 · 화면별 방문자가 모두 사건을 세는 질문이라 사람 표의 칸으로는
 * 답할 수 없다. 180일이 지난 줄은 매일 밤 지운다.
 */
export const usageEvents = pgTable(
  'usage_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    identifiedBy: identitySourceEnum('identified_by').notNull(),
    type: usageEventTypeEnum('type').notNull(),
    /** 화면은 라우트 이름, 동작은 동작 이름이다. 방문은 빈 글자다. */
    name: text('name').notNull(),
    /** 화면에 머문 시간. 화면 사건만 있다. */
    durationMs: integer('duration_ms'),
    platform: platformEnum('platform').notNull(),
    appVersion: text('app_version').notNull(),
    /** 기기 시각. 묶어 보내므로 받은 시각으로 적으면 어제 쓴 것이 오늘로 잡힌다. */
    occurredAt: timestamptz('occurred_at').notNull(),
    receivedAt: timestamptz('received_at').notNull().defaultNow(),
  },
  (t) => [
    index('usage_events_occurred_at_idx').on(t.occurredAt),
    index('usage_events_user_id_idx').on(t.userId),
  ],
)

export const enhancementAnomalies = pgTable(
  'enhancement_anomalies',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    /** 강화 내역을 받은 넥슨 계정. 강화 내역은 넥슨 계정마다 받는다. 계정 삭제로 지워지면 NULL. */
    nexonAccountId: uuid('nexon_account_id').references(() => nexonAccounts.id, {
      onDelete: 'set null',
    }),
    identifiedBy: identitySourceEnum('identified_by').notNull(),
    /** 강화한 날(KST YYYY-MM-DD). */
    historyDate: text('history_date').notNull(),
    enhancementType: enhancementTypeEnum('enhancement_type').notNull(),
    anomalyType: enhancementAnomalyTypeEnum('anomaly_type').notNull(),
    itemKey: text('item_key'),
    /** 응답의 장비 이름. 판정하지 못한 줄은 장비와 무관해 빈 글자다. */
    itemName: text('item_name').notNull(),
    rowCount: integer('row_count').notNull(),
    /** 캐릭터 목록 요청의 실패 이유. 판정하지 못한 줄만 있다. */
    detail: text('detail'),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
    updatedAt: timestamptz('updated_at').notNull().defaultNow(),
  },
  (t) => [
    unique('enhancement_anomalies_account_key_unique').on(
      t.nexonAccountId,
      t.historyDate,
      t.enhancementType,
      t.anomalyType,
      t.itemName,
    ),
  ],
)
