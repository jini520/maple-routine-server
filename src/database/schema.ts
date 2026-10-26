/**
 * Model. 표 마흔하나와 ENUM 스물. 마이그레이션은 이 선언에서 `drizzle-kit generate` 가 뽑는다.
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

/** 사람. 자격(넥슨 로그인 · API 키)은 nexon_accounts 가 들고, 한 사람이 넥슨 계정을 여럿 가질 수 있다. */
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  createdAt: timestamptz('created_at').notNull().defaultNow(),
  /** 탈퇴. 사용자 요청으로 줄을 지우지 않는다. */
  deletedAt: timestamptz('deleted_at'),
})

/**
 * 넥슨 계정 하나. 넥슨 로그인이면 uid, API 키면 키 해시를 든다. 다계정이면 한 사람 밑에 여러 줄이다.
 *
 * account_record_id 는 기기가 만든 계정 id 다. 사람 안에서만 유일하고, 앱이 x-nexon-account-id 헤더로 알려 준다.
 */
export const nexonAccounts = pgTable(
  'nexon_accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    identitySource: identitySourceEnum('identity_source').notNull(),
    /** 넥슨 uid. 플랫폼을 가로질러 같다. */
    nexonUid: text('nexon_uid').unique(),
    /** 앱이 보낸 해시를 서버가 한 번 더 해시한 것. */
    apiKeyHash: bytea('api_key_hash').unique(),
    accountRecordId: uuid('account_record_id'),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
    updatedAt: timestamptz('updated_at').notNull().defaultNow(),
  },
  (t) => [
    index('nexon_accounts_user_id_idx').on(t.userId),
    unique('nexon_accounts_user_record_unique').on(t.userId, t.accountRecordId),
    check(
      'nexon_accounts_credential_matches_source',
      sql`(${t.identitySource} = 'login' AND ${t.nexonUid} IS NOT NULL AND ${t.apiKeyHash} IS NULL)
        OR (${t.identitySource} = 'key' AND ${t.apiKeyHash} IS NOT NULL AND ${t.nexonUid} IS NULL)`,
    ),
  ],
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

export const bosses = pgTable('bosses', {
  id: uuid('id').primaryKey().defaultRandom(),
  /** 앱의 boss key. 기기 기록이 이 값을 든다. */
  key: text('key').notNull().unique(),
  name: text('name').notNull(),
  alias: text('alias').notNull(),
  cycle: bossCycleEnum('cycle').notNull(),
  /** 앱 자산 파일명. 앱에 그 파일이 있어야 그려진다. */
  portraitSlug: text('portrait_slug').notNull(),
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
    /** 행은 하드 삭제되지 않아 CASCADE 가 실제로 돌 일이 없다. 탈퇴는 users.deleted_at 이다. */
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** 기기가 만든 v4. 사람 안에서만 유일하다. 남의 기록 id 로 남의 줄을 못 덮는다. */
    dropRecordId: uuid('drop_record_id').notNull(),
    identifiedBy: identitySourceEnum('identified_by').notNull(),
    /** 어느 아이템의 시세인가. 서버가 전송값의 key 로 찾아 적고, 모르는 key 는 받지 않는다. */
    itemId: uuid('item_id')
      .notNull()
      .references(() => dropItems.id),
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

/** 드롭 아이템 마스터 표. 기록과 drop_prices.item_key 가 key 를 든다. */
export const dropItems = pgTable('drop_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  key: text('key').notNull().unique(),
  name: text('name').notNull(),
  /** 앱 자산 파일명. 없으면 앱이 자리 그림을 그린다. */
  iconFile: text('icon_file'),
  /** 고가 아이템. 드롭 연출과 최고가 위젯이 본다. */
  valuable: boolean('valuable').notNull().default(false),
  /** 월드끼리 거래할 수 없는 소비 아이템. 시세를 거래권이 아니라 월드 하나로 센다. 앱의 게임 데이터에는 안 싣는다. */
  worldBound: boolean('world_bound').notNull().default(false),
  updatedAt: timestamptz('updated_at').notNull().defaultNow(),
})

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
      .references(() => dropItems.id),
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
      .references(() => dropItems.id),
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
      .references(() => dropItems.id),
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
  /** 앱 자산 파일 basename. 스페셜은 없다. */
  emblem: text('emblem'),
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
    /** 앱 자산 src/assets/items/ 의 파일명. */
    iconFile: text('icon_file').notNull(),
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
    /** 앱 자산 src/assets/items/ 의 파일명. */
    iconFile: text('icon_file'),
    /** 앱 자산 src/assets/maps/icons/ 의 slug. 에픽던전 넷. */
    iconMap: text('icon_map'),
  },
  (t) => [check('spend_tiles_icon_one', sql`${t.iconFile} IS NULL OR ${t.iconMap} IS NULL`)],
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
  iconFile: text('icon_file').notNull(),
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
    /** 카드 그림. 지도 배경 slug 와 보스 초상 slug 중 하나다. 둘 다 없으면 카드가 고정 그림을 쓴다. */
    backgroundMap: text('background_map'),
    backgroundPortrait: text('background_portrait'),
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
      sql`${t.backgroundMap} IS NULL OR ${t.backgroundPortrait} IS NULL`,
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

/** 강화 비용을 매길 장비. 기록(enhancement_history.item_key)이 key 를 들어 지우지 않는다. 강화할 수 없는 장비는 안 담는다. */
export const equipmentItems = pgTable(
  'equipment_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    key: text('key').notNull().unique(),
    /** 붙여 쓴 이름. 앱이 API target_item 을 NFC · 공백 제거 뒤 완전 일치로 key 를 얻는다. */
    name: text('name').notNull().unique(),
    /** 착용 레벨. NULL 은 모른다는 뜻이고 0 이 아니다. 그 장비의 스타포스는 안 매기고 건수만 센다. */
    level: integer('level'),
  },
  (t) => [check('equipment_items_level_positive', sql`${t.level} IS NULL OR ${t.level} >= 1`)],
)

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
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    identifiedBy: identitySourceEnum('identified_by').notNull(),
    /** 기기의 기간 행 id. 사람 안에서만 유일하다. */
    periodRecordId: uuid('period_record_id').notNull(),
    ocid: text('ocid').notNull(),
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
    unique('boss_clears_user_record_unique').on(t.userId, t.periodRecordId),
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
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    identifiedBy: identitySourceEnum('identified_by').notNull(),
    /** 기기의 기록 id. 사람 안에서만 유일하다. */
    entryRecordId: uuid('entry_record_id').notNull(),
    /** NULL 은 계정 단위 기록이다. */
    ocid: text('ocid'),
    /** 캐릭터 없는 기록이 속한 넥슨 계정. 캐릭터가 있는 기록은 ocid 로 찾아 NULL 이다. */
    nexonAccountId: uuid('nexon_account_id').references(() => nexonAccounts.id, {
      onDelete: 'set null',
    }),
    entryType: cashbookEntryTypeEnum('entry_type').notNull(),
    categoryKey: text('category_key').notNull(),
    /** 돈이 오간 날(KST YYYY-MM-DD). */
    entryDate: text('entry_date').notNull(),
    deletedAt: timestamptz('deleted_at'),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
    updatedAt: timestamptz('updated_at').notNull().defaultNow(),
  },
  (t) => [
    unique('cashbook_entries_user_record_unique').on(t.userId, t.entryRecordId),
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
  },
  (t) => [unique('cashbook_entry_items_entry_order_unique').on(t.entryId, t.sortOrder)],
)
