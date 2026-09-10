/**
 * Postgres 한 자리. 스키마와 조회가 여기 산다.
 *
 * 기존 `jinni_prod` 와 **다른 DB** 를 쓴다. 같은 DB 에 있으면 백업·복구·권한이 서로 묶여
 * 한쪽 사고가 다른 쪽으로 번진다.
 */
import pg from 'pg'

import type { NoticeBlock } from './html.ts'
import { isNoticeKind, type Notice, type NoticeKind } from './notice.ts'

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })

/**
 * 스키마를 맞춘다. 부팅 때 한 번 부른다.
 *
 * 마이그레이션 도구를 안 두는 이유는 표가 하나뿐이고 아직 아무도 안 쓰기 때문이다. 두 번째
 * 표가 생기거나 컬럼을 바꿔야 하는 날 도구를 들인다. 그전까지는 이 함수가 진실이다.
 *
 * ⚠️ **`CREATE TABLE IF NOT EXISTS` 는 이미 있는 표에 컬럼을 안 더한다.** 표가 만들어진 뒤에
 * 컬럼을 늘리면 그 문장이 조용히 건너뛰고, 다음에 그 컬럼을 쓰는 쿼리가 42703 으로 죽는다.
 * 실제로 `push_title` 을 그렇게 잃었다. 그래서 컬럼을 더할 때는 아래 `ADD COLUMN IF NOT
 * EXISTS` 를 **함께** 적는다. 새 설치는 위에서, 기존 설치는 아래에서 맞는다.
 */
export async function migrate(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS notices (
      id           text        PRIMARY KEY,
      title        text        NOT NULL,
      body         text        NOT NULL,
      published_at timestamptz NOT NULL,
      link         text,
      -- 발송 시각. NULL 이면 아직 안 쐈다. 목록에는 나가되 알림은 안 간 상태가 있을 수 있다.
      -- 운영자가 알림 전송을 안 고르면 그 상태로 남는다.
      sent_at      timestamptz,
      -- 실제로 보낸 알림 문구. 공지 문구와 다를 수 있어서 따로 남긴다. 나중에 "그때 뭐라고
      -- 보냈더라" 를 답할 수 있는 유일한 기록이다.
      push_title   text,
      push_body    text,
      -- 어디서 온 공지인가. 기존 행은 전부 운영자가 쓴 것이라 기본값이 'app' 이다.
      kind         text        NOT NULL DEFAULT 'app',
      -- 상세 본문. 넥슨 HTML 을 블록 배열로 바꾼 것이고 목록 응답에는 안 실린다.
      blocks       jsonb,
      -- 넥슨의 notice_id. 분류마다 번호 체계가 달라 id 에는 분류가 앞에 붙는다.
      source_id    bigint,
      -- 이벤트·판매 기간. 넥슨이 그 둘에만 준다.
      starts_at    timestamptz,
      ends_at      timestamptz,
      ongoing      boolean
    );
    -- 목록이 최근순으로 읽는다. 건수가 적어도 인덱스가 없으면 매번 정렬한다.
    CREATE INDEX IF NOT EXISTS notices_published_at_desc
      ON notices (published_at DESC, id DESC);

    -- 위 CREATE TABLE 뒤에 늘어난 컬럼들. 이미 있는 표에도 붙는다.
    ALTER TABLE notices ADD COLUMN IF NOT EXISTS push_title text;
    ALTER TABLE notices ADD COLUMN IF NOT EXISTS push_body  text;
    ALTER TABLE notices ADD COLUMN IF NOT EXISTS kind       text NOT NULL DEFAULT 'app';
    ALTER TABLE notices ADD COLUMN IF NOT EXISTS blocks     jsonb;
    ALTER TABLE notices ADD COLUMN IF NOT EXISTS source_id  bigint;
    ALTER TABLE notices ADD COLUMN IF NOT EXISTS starts_at  timestamptz;
    ALTER TABLE notices ADD COLUMN IF NOT EXISTS ends_at    timestamptz;
    ALTER TABLE notices ADD COLUMN IF NOT EXISTS ongoing    boolean;

    -- 분류로 걸러 최근순으로 읽는다. 목록 화면이 토글마다 따로 물어 온다.
    CREATE INDEX IF NOT EXISTS notices_kind_published_at_desc
      ON notices (kind, published_at DESC, id DESC);
  `)
}

interface Row {
  id: string
  kind: string
  title: string
  body: string
  published_at: Date
  link: string | null
  blocks: NoticeBlock[] | null
}

/**
 * 행 하나를 계약 모양으로. **`blocks` 는 목록에서 안 읽으므로 없을 수 있다.**
 *
 * `kind` 를 모르는 값으로 만나면 `app` 으로 읽는다. 앞으로 분류가 늘 때 옛 서버가 새 행을
 * 만나도 화면이 서기는 해야 한다.
 */
function toNotice(row: Row): Notice {
  return {
    id: row.id,
    kind: isNoticeKind(row.kind) ? row.kind : 'app',
    title: row.title,
    body: row.body,
    publishedAt: row.published_at.toISOString(),
    ...(row.link === null ? {} : { link: row.link }),
    ...(row.blocks == null ? {} : { blocks: row.blocks }),
  }
}

/** 목록이 읽는 칸. **`blocks` 가 빠져 있는 것이 요점이다**(업데이트 한 건이 57KB다). */
const LIST_COLUMNS = 'id, kind, title, body, published_at, link'

/** 넥슨 공지에 딸린 값들. 계약에는 없고 우리 표에만 있다. */
export interface NexonMeta {
  sourceId: number
  startsAt: string | null
  endsAt: string | null
  ongoing: boolean | null
}

export async function insertNotice(notice: Notice, meta?: NexonMeta): Promise<void> {
  await pool.query(
    `INSERT INTO notices (id, kind, title, body, published_at, link, blocks,
                          source_id, starts_at, ends_at, ongoing)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     ON CONFLICT (id) DO UPDATE
       SET kind = EXCLUDED.kind, title = EXCLUDED.title, body = EXCLUDED.body,
           published_at = EXCLUDED.published_at, link = EXCLUDED.link,
           blocks = EXCLUDED.blocks, source_id = EXCLUDED.source_id,
           starts_at = EXCLUDED.starts_at, ends_at = EXCLUDED.ends_at,
           ongoing = EXCLUDED.ongoing`,
    [
      notice.id,
      notice.kind,
      notice.title,
      notice.body,
      notice.publishedAt,
      notice.link ?? null,
      notice.blocks === undefined ? null : JSON.stringify(notice.blocks),
      meta?.sourceId ?? null,
      meta?.startsAt ?? null,
      meta?.endsAt ?? null,
      meta?.ongoing ?? null,
    ],
  )
}

export async function markSent(id: string, pushTitle: string, pushBody: string): Promise<void> {
  await pool.query(
    `UPDATE notices SET sent_at = now(), push_title = $2, push_body = $3 WHERE id = $1`,
    [id, pushTitle, pushBody],
  )
}

/** 상세. 여기서만 `blocks` 를 준다. */
export async function getNotice(id: string): Promise<Notice | null> {
  const { rows } = await pool.query<Row>(
    `SELECT ${LIST_COLUMNS}, blocks FROM notices WHERE id = $1`,
    [id],
  )
  return rows[0] === undefined ? null : toNotice(rows[0])
}

/**
 * 이 분류에서 **이미 아는 id**. 폴러가 새 항목만 고르는 데 쓴다.
 *
 * 목록 20건의 id 를 통째로 물어 한 번에 답한다. 건마다 묻지 않는 이유는 회차마다 쿼리가
 * 80번 나가기 때문이다.
 */
export async function knownIds(ids: readonly string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set()

  const { rows } = await pool.query<{ id: string }>(
    `SELECT id FROM notices WHERE id = ANY($1::text[])`,
    [[...ids]],
  )
  return new Set(rows.map((row) => row.id))
}

/**
 * 이 분류로 저장된 것이 하나라도 있는가.
 *
 * **첫 회차를 가리는 데 쓴다.** 빈 표로 처음 돌면 목록 20건이 전부 새 항목이라 그대로 두면
 * 알림 79개가 나간다.
 */
export async function hasAny(kind: NoticeKind): Promise<boolean> {
  const { rows } = await pool.query(`SELECT 1 FROM notices WHERE kind = $1 LIMIT 1`, [kind])
  return rows.length > 0
}

/**
 * 최근순 한 쪽. `cursor` 는 **마지막으로 본 항목의 `published_at|id`** 다.
 *
 * OFFSET 을 안 쓰는 이유. 목록을 보는 사이에 공지가 하나 추가되면 OFFSET 은 한 칸씩 밀려
 * 같은 항목을 두 번 보여 주거나 하나를 건너뛴다. 커서는 값을 기준으로 하므로 그 일이 없다.
 *
 * @param kinds 비어 있으면 전 분류. 앱이 토글별로 걸러 물어 온다.
 */
export async function listNotices(
  limit: number,
  cursor: string | null,
  kinds: readonly NoticeKind[] = [],
): Promise<{ items: Notice[]; nextCursor: string | null }> {
  const [at, id] = cursor === null ? [null, null] : splitCursor(cursor)

  const where: string[] = []
  const args: unknown[] = [limit + 1]
  if (kinds.length > 0) {
    args.push([...kinds])
    where.push(`kind = ANY($${args.length}::text[])`)
  }
  if (at !== null) {
    args.push(at, id)
    where.push(`(published_at, id) < ($${args.length - 1}::timestamptz, $${args.length}::text)`)
  }

  const { rows } = await pool.query<Row>(
    `SELECT ${LIST_COLUMNS} FROM notices
     ${where.length === 0 ? '' : `WHERE ${where.join(' AND ')}`}
     ORDER BY published_at DESC, id DESC LIMIT $1`,
    args,
  )

  // 한 건 더 받아 다음 쪽이 있는지 본다. 있으면 그 한 건은 안 돌려준다.
  const hasMore = rows.length > limit
  const items = rows.slice(0, limit).map(toNotice)
  const last = items[items.length - 1]

  return {
    items,
    nextCursor: hasMore && last !== undefined ? `${last.publishedAt}|${last.id}` : null,
  }
}

function splitCursor(cursor: string): [string, string] {
  const at = cursor.indexOf('|')
  return at === -1 ? [cursor, ''] : [cursor.slice(0, at), cursor.slice(at + 1)]
}
