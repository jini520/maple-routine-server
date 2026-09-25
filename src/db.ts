/**
 * Postgres 한 자리. 조회가 여기 산다. 스키마는 `migrations/` 가 든다.
 *
 * 기존 `jinni_prod` 와 **다른 DB** 를 쓴다. 같은 DB 에 있으면 백업·복구·권한이 서로 묶여
 * 한쪽 사고가 다른 쪽으로 번진다.
 */
import pg from 'pg'

import type { NoticeBlock } from './html.ts'
import { isNoticeKind, type Notice, type NoticeKind, type SundayRecord } from './notice.ts'
import type { ManualCompletionBoss } from './manual-completion.ts'
import type { DuePush } from './schedule.ts'
import type { RunExclusively } from './single-runner.ts'

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })

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

/**
 * 운영자 공지 한 건. **계약에 없는 발송 기록이 함께 온다.**
 *
 * 공개 API 의 `Notice` 와 가르는 이유는 `sent_at`·`push_*` 가 운영자만 볼 것이기 때문이다.
 * 같은 조회를 나눠 쓰면 이 칸들이 앱 응답에도 실린다.
 */
export interface AdminNotice {
  id: string
  title: string
  body: string
  publishedAt: string
  /** 알림을 보낸 시각. `null` 이면 목록에만 있고 알림은 안 갔다. */
  sentAt: string | null
  /** 실제로 보낸 알림 문구. 공지 문구와 다를 수 있다. 예약 중이면 보낼 문구다. */
  pushTitle: string | null
  pushBody: string | null
  /** 알림을 보낼 시각. `sentAt` 이 `null` 인데 값이 있으면 아직 안 보낸 예약이다. */
  scheduledAt: string | null
}

/**
 * 운영자 창구의 목록. **운영자 공지만 준다.**
 *
 * 넥슨 공지를 빼는 이유는 이 목록이 수정·삭제 버튼을 달고 있어서다. 지울 수 없는 것을
 * 목록에 세우면 누를 수 있는 것처럼 보인다.
 */
export async function listAppNotices(limit: number): Promise<AdminNotice[]> {
  const { rows } = await pool.query<{
    id: string
    title: string
    body: string
    published_at: Date
    sent_at: Date | null
    push_title: string | null
    push_body: string | null
    scheduled_at: Date | null
  }>(
    `SELECT id, title, body, published_at, sent_at, push_title, push_body, scheduled_at
     FROM notices WHERE kind = 'app'
     ORDER BY published_at DESC, id DESC LIMIT $1`,
    [limit],
  )

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    body: row.body,
    publishedAt: row.published_at.toISOString(),
    sentAt: row.sent_at === null ? null : row.sent_at.toISOString(),
    pushTitle: row.push_title,
    pushBody: row.push_body,
    scheduledAt: row.scheduled_at === null ? null : row.scheduled_at.toISOString(),
  }))
}

/**
 * 알림을 보낼 시각과 보낼 문구를 적는다. 공지는 이미 저장돼 있다.
 *
 * 문구를 `push_title`·`push_body` 에 넣는 것은 그 칸이 **그때 뭐라고 보냈나**를 답하는 자리라서다.
 * 예약 동안에는 «보낼 문구» 였다가 발송이 끝나면 «보낸 문구» 가 된다. 값이 같으므로 칸을 안 늘린다.
 */
export async function scheduleNotice(
  id: string,
  at: string,
  pushTitle: string,
  pushBody: string,
): Promise<void> {
  await pool.query(
    // 다른 창구와 같이 `kind` 를 건다. 넥슨 공지에 예약이 걸리면 폴러가 그 글을 다시 넣을 때
    // 알림이 두 번 나간다.
    `UPDATE notices SET scheduled_at = $2, push_title = $3, push_body = $4
     WHERE id = $1 AND kind = 'app'`,
    [id, at, pushTitle, pushBody],
  )
}

/**
 * 예약을 내린다. 예약이 없거나 이미 보냈거나 운영자 공지가 아니면 `false`.
 *
 * **공지는 남는다.** 내리는 것은 알림뿐이다. 이미 보낸 것에는 안 닿는다 - 나간 알림은 못 거둔다.
 */
export async function cancelSchedule(id: string): Promise<boolean> {
  const { rowCount } = await pool.query(
    `UPDATE notices SET scheduled_at = NULL
     WHERE id = $1 AND kind = 'app' AND scheduled_at IS NOT NULL AND sent_at IS NULL`,
    [id],
  )
  return rowCount !== null && rowCount > 0
}

/**
 * 보낼 시각이 된 예약. **지나친 것도 함께 온다**(사용자 지정 2026-09-19).
 *
 * `sent_at IS NULL` 이 재시도의 경계다. 발송이 실패하면 그 칸이 안 찍혀 다음 회차가 같은 건을
 * 다시 잡고, 성공하면 찍혀 빠진다. 시각은 DB 시계로 잰다 - 앱 프로세스가 UTC 로 돌든 말든
 * 예약을 적은 자리와 읽는 자리가 같은 시계를 본다.
 */
export async function listDueScheduled(): Promise<DuePush[]> {
  const { rows } = await pool.query<Row & { push_title: string | null; push_body: string | null }>(
    `SELECT ${LIST_COLUMNS}, push_title, push_body FROM notices
     WHERE scheduled_at IS NOT NULL AND sent_at IS NULL AND scheduled_at <= now()
     ORDER BY scheduled_at`,
  )

  return rows.map((row) => ({
    notice: toNotice(row),
    // 예약할 때 두 칸을 함께 적는다. 빈 문구로는 예약이 안 걸리므로 여기서 비는 일이 없다.
    push: { title: row.push_title ?? row.title, body: row.push_body ?? row.body },
  }))
}

/**
 * 제목과 내용을 간다. 없거나 운영자 공지가 아니면 `null`.
 *
 * **`published_at` 을 안 건드린다.** 목록의 정렬 축이라 고칠 때마다 그 글이 맨 위로 올라온다.
 *
 * 갱신된 행을 돌려주는 것은 그 다음이 알림 발송이기 때문이다. 다시 읽으면 그 사이에 바뀐
 * 것을 보내게 된다.
 */
export async function updateNotice(id: string, title: string, body: string): Promise<Notice | null> {
  const { rows } = await pool.query<Row>(
    `UPDATE notices SET title = $2, body = $3
     WHERE id = $1 AND kind = 'app'
     RETURNING ${LIST_COLUMNS}`,
    [id, title, body],
  )
  return rows[0] === undefined ? null : toNotice(rows[0])
}

/**
 * 지운다. 없거나 운영자 공지가 아니면 `false`.
 *
 * **넥슨 공지는 여기로 안 지워진다.** 지난 글은 넥슨이 상세를 400 으로 거절해 우리 DB 가
 * 유일한 사본이고, 아직 목록에 떠 있는 글이면 폴러가 1분 뒤 다시 넣으면서 알림까지 다시 쏜다.
 */
export async function deleteNotice(id: string): Promise<boolean> {
  const { rowCount } = await pool.query(`DELETE FROM notices WHERE id = $1 AND kind = 'app'`, [id])
  return rowCount !== null && rowCount > 0
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
 * 썬데이 기록의 재료. **이벤트 행을 최근 것부터 훑어 준다.**
 *
 * 썬데이만 골라 내는 일은 SQL 이 아니라 `sundayRecordsFrom` 이 한다. 판정을 두 언어로 두면
 * 한쪽만 고쳐져서 갈라지고, 지금 그 판정은 **실물을 못 본 채 세운 것**이라 곧 고칠 것이 거의
 * 확실하다. 한 자리에 두면 고치는 것도 한 번이다.
 *
 * 전부 훑지 않는 이유는 이벤트가 계속 쌓이기 때문이다. 썬데이는 주 1~2회라 이 창이면 몇 년
 * 치가 들어온다.
 */
export async function listEventRows(scan = 500): Promise<SundayRecord[]> {
  const { rows } = await pool.query<{
    id: string
    title: string
    published_at: Date
    starts_at: Date | null
    ends_at: Date | null
    link: string | null
    blocks: NoticeBlock[] | null
  }>(
    `SELECT id, title, published_at, starts_at, ends_at, link, blocks
     FROM notices WHERE kind = 'event'
     ORDER BY published_at DESC, id DESC LIMIT $1`,
    [scan],
  )

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    publishedAt: row.published_at.toISOString(),
    startsAt: row.starts_at === null ? null : row.starts_at.toISOString(),
    endsAt: row.ends_at === null ? null : row.ends_at.toISOString(),
    ...(row.link === null ? {} : { link: row.link }),
    ...(row.blocks == null ? {} : { blocks: row.blocks }),
  }))
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

/**
 * 지금 열려 있는 보스. 앱의 `GET /v1/manual-completion` 이 그대로 내보낸다.
 *
 * **닫힌 행은 안 준다.** 닫는 순간 앱의 단추도 사라져야 하고, 그러면 닫는 날을 계약에 둘 이유가 없다.
 */
export async function listOpenManualCompletionBosses(): Promise<ManualCompletionBoss[]> {
  const { rows } = await pool.query<{ boss: string; from_date: string }>(
    `SELECT boss, from_date FROM manual_completion_bosses
     WHERE closed_at IS NULL ORDER BY boss`,
  )
  return rows.map((row) => ({ boss: row.boss, from: row.from_date }))
}

/** 운영자 화면이 읽는 한 줄. 닫힌 것까지 들어 언제 켜고 끈는지가 남는다. */
export interface AdminManualCompletionRow {
  boss: string
  from: string
  openedAt: string
  closedAt: string | null
}

export async function listManualCompletionRows(): Promise<AdminManualCompletionRow[]> {
  const { rows } = await pool.query<{
    boss: string
    from_date: string
    opened_at: Date
    closed_at: Date | null
  }>(
    `SELECT boss, from_date, opened_at, closed_at FROM manual_completion_bosses
     ORDER BY closed_at NULLS FIRST, boss`,
  )
  return rows.map((row) => ({
    boss: row.boss,
    from: row.from_date,
    openedAt: row.opened_at.toISOString(),
    closedAt: row.closed_at === null ? null : row.closed_at.toISOString(),
  }))
}

/**
 * 보스를 여는다. 이미 닫힌 행이 있었으면 다시 열면서 `closed_at` 을 비운다.
 *
 * 여는 것과 닫는 것이 따로 도는 동작이라(사용자 지정) 여기서 닫지 않는다.
 */
export async function openManualCompletionBoss(boss: string, fromDate: string): Promise<void> {
  await pool.query(
    `INSERT INTO manual_completion_bosses (boss, from_date)
     VALUES ($1, $2)
     ON CONFLICT (boss) DO UPDATE
       SET from_date = EXCLUDED.from_date, opened_at = now(), closed_at = NULL`,
    [boss, fromDate],
  )
}

/** 닫는다. 없거나 이미 닫혔으면 `false`. */
export async function closeManualCompletionBoss(boss: string): Promise<boolean> {
  const { rowCount } = await pool.query(
    `UPDATE manual_completion_bosses SET closed_at = now()
     WHERE boss = $1 AND closed_at IS NULL`,
    [boss],
  )
  return rowCount !== null && rowCount > 0
}

/**
 * 그 고리를 **인스턴스 하나에서만** 돌린다. 자물쇠를 못 잡으면 회차를 건너뛴다.
 *
 * 왜 이것이 필요한지는 `single-runner.ts` 가 적는다. 여기는 postgres 로 그것을 어떻게
 * 만드는지만 안다.
 *
 * **풀에서 연결 하나를 빼 들고 있는다.** 어드바이저리 락은 세션에 매달려서, 잡은 연결과 푸는
 * 연결이 같아야 한다. 회차가 도는 동안 그 연결은 놀지만 회차의 쿼리들은 풀의 다른 연결로
 * 나가므로 서로 막지 않는다.
 *
 * **인스턴스가 죽어도 잠기지 않는다.** 연결이 끊기면 postgres 가 그 세션의 락을 푼다. 그래서
 * 만료 시각을 따로 안 둔다.
 *
 * @param lockId `single-runner.ts` 의 `LOCK_IDS`
 * @example exclusively(LOCK_IDS.poll)
 */
export function exclusively(lockId: number): RunExclusively {
  return async (run) => {
    const client = await pool.connect()
    try {
      const { rows } = await client.query<{ got: boolean }>(
        'SELECT pg_try_advisory_lock($1) AS got',
        [lockId],
      )
      // 다른 인스턴스가 들고 있다. 기다리지 않는다.
      if (rows[0]?.got !== true) return

      try {
        await run()
      } finally {
        // 회차가 던져도 푼다. 안 풀면 이 프로세스가 살아 있는 동안 그 고리가 영영 멈춘다.
        await client.query('SELECT pg_advisory_unlock($1)', [lockId])
      }
    } finally {
      client.release()
    }
  }
}
