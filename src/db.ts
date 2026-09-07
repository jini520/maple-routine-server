/**
 * Postgres 한 자리. 스키마와 조회가 여기 산다.
 *
 * 기존 `jinni_prod` 와 **다른 DB** 를 쓴다. 같은 DB 에 있으면 백업·복구·권한이 서로 묶여
 * 한쪽 사고가 다른 쪽으로 번진다.
 */
import pg from 'pg'

import type { Notice } from './notice.ts'

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })

/**
 * 스키마를 맞춘다. 부팅 때 한 번 부른다.
 *
 * 마이그레이션 도구를 안 두는 이유는 표가 하나뿐이고 아직 아무도 안 쓰기 때문이다. 두 번째
 * 표가 생기거나 컬럼을 바꿔야 하는 날 도구를 들인다. 그전까지는 이 함수가 진실이다.
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
      sent_at      timestamptz
    );
    -- 목록이 최근순으로 읽는다. 건수가 적어도 인덱스가 없으면 매번 정렬한다.
    CREATE INDEX IF NOT EXISTS notices_published_at_desc
      ON notices (published_at DESC, id DESC);
  `)
}

function toNotice(row: {
  id: string
  title: string
  body: string
  published_at: Date
  link: string | null
}): Notice {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    publishedAt: row.published_at.toISOString(),
    ...(row.link === null ? {} : { link: row.link }),
  }
}

export async function insertNotice(notice: Notice): Promise<void> {
  await pool.query(
    `INSERT INTO notices (id, title, body, published_at, link)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (id) DO UPDATE
       SET title = EXCLUDED.title, body = EXCLUDED.body,
           published_at = EXCLUDED.published_at, link = EXCLUDED.link`,
    [notice.id, notice.title, notice.body, notice.publishedAt, notice.link ?? null],
  )
}

export async function markSent(id: string): Promise<void> {
  await pool.query(`UPDATE notices SET sent_at = now() WHERE id = $1`, [id])
}

export async function getNotice(id: string): Promise<Notice | null> {
  const { rows } = await pool.query(`SELECT * FROM notices WHERE id = $1`, [id])
  return rows[0] === undefined ? null : toNotice(rows[0])
}

/**
 * 최근순 한 쪽. `cursor` 는 **마지막으로 본 항목의 `published_at|id`** 다.
 *
 * OFFSET 을 안 쓰는 이유. 목록을 보는 사이에 공지가 하나 추가되면 OFFSET 은 한 칸씩 밀려
 * 같은 항목을 두 번 보여 주거나 하나를 건너뛴다. 커서는 값을 기준으로 하므로 그 일이 없다.
 */
export async function listNotices(
  limit: number,
  cursor: string | null,
): Promise<{ items: Notice[]; nextCursor: string | null }> {
  const [at, id] = cursor === null ? [null, null] : splitCursor(cursor)

  const { rows } = await pool.query(
    at === null
      ? `SELECT * FROM notices ORDER BY published_at DESC, id DESC LIMIT $1`
      : `SELECT * FROM notices
         WHERE (published_at, id) < ($2::timestamptz, $3::text)
         ORDER BY published_at DESC, id DESC LIMIT $1`,
    at === null ? [limit + 1] : [limit + 1, at, id],
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
