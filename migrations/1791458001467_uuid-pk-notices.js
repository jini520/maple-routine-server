/**
 * `notices` 의 기본키를 uuid 로 옮긴다. 열쇠로 쓰던 `id` 는 `notice_key` 가 된다.
 *
 * 다른 두 표(`manual_completion_bosses` · `nexon_sessions`)와 달리 **이름을 옮긴다.** 그 표들은
 * 열쇠 칸 이름이 `boss` · `session_hash` 라 새 `id uuid` 와 안 부딪혔는데, 여기는 열쇠가 이미
 * `id` 였다.
 *
 * `notice_key` 라고 부르는 이유는 **같은 표에 `source_id` 가 이미 있어서**다. `notice_id` 로 두면
 * 둘 다 「공지 번호」로 읽힌다. 이 저장소가 식별자를 `boss_key` · `item_key` · `world_key` 로
 * 부르는 어법과도 맞는다.
 *
 * **담기는 값은 안 바뀐다.** `game-150276` · `event-1397` · `notice-20261007-155439` 그대로다.
 * 앱이 그 값으로 공지를 가리키고(`Notice.id` · 푸시 `data.noticeId`), 접두어를 보고 상세를 넥슨에서
 * 받을지 우리 서버에서 받을지 가른다(`features/notice/notice-feed.ts` 의 `fetchNoticeDetail`).
 * 그래서 **계약과 기기에 깔린 앱이 안 깨진다** - 칸 이름만 서버 안에서 바뀐다.
 *
 * 커서도 그대로다. `publishedAt|id` 문자열을 앱이 들고 있는데, 그 뒷부분이 `notice_key` 와 같은
 * 값이고 비교도 `(published_at, notice_key)` 로 한다.
 */

export const up = (pgm) => {
  pgm.sql(`
    ALTER TABLE notices RENAME COLUMN id TO notice_key;

    -- 옛 기본키를 내리면 그 유니크 인덱스도 함께 사라진다. 같은 트랜잭션에서 UNIQUE 를 다시
    -- 세우므로 ON CONFLICT (notice_key) 가 기댈 인덱스가 비는 순간이 없다.
    ALTER TABLE notices DROP CONSTRAINT notices_pkey;
    ALTER TABLE notices ADD COLUMN id uuid NOT NULL DEFAULT gen_random_uuid();
    ALTER TABLE notices ADD PRIMARY KEY (id);
    ALTER TABLE notices ADD CONSTRAINT notices_notice_key_key UNIQUE (notice_key);

    -- 목록이 최근순으로 읽는 자리. 옛 인덱스가 칸 이름과 함께 따라오지만 이름이 낡아서 다시 만든다.
    DROP INDEX IF EXISTS notices_published_at_desc;
    DROP INDEX IF EXISTS notices_kind_published_at_desc;
    CREATE INDEX notices_published_at_desc
      ON notices (published_at DESC, notice_key DESC);
    CREATE INDEX notices_kind_published_at_desc
      ON notices (kind, published_at DESC, notice_key DESC);
  `)
}

/** 되돌린다. `notice_key` 가 다시 `id` 이고 기본키가 된다. */
export const down = (pgm) => {
  pgm.sql(`
    DROP INDEX IF EXISTS notices_kind_published_at_desc;
    DROP INDEX IF EXISTS notices_published_at_desc;

    ALTER TABLE notices DROP CONSTRAINT notices_notice_key_key;
    ALTER TABLE notices DROP CONSTRAINT notices_pkey;
    ALTER TABLE notices DROP COLUMN id;
    ALTER TABLE notices RENAME COLUMN notice_key TO id;
    ALTER TABLE notices ADD PRIMARY KEY (id);

    CREATE INDEX notices_published_at_desc ON notices (published_at DESC, id DESC);
    CREATE INDEX notices_kind_published_at_desc ON notices (kind, published_at DESC, id DESC);
  `)
}
