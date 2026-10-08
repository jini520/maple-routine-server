/**
 * 기본키를 uuid 한 칸으로 옮긴다. 열쇠로 쓰던 값은 `UNIQUE` 로 남는다.
 *
 * 의미 있는 값을 기본키로 쓰면 그 값이 바뀔 때 행을 가리킬 방법이 사라진다. 기기 쪽이 그 대가를
 * 이미 치르고 있다 - `boss_drop_records` 의 기본키에 난이도가 들어 있어서 처치 난이도가 나중에
 * 확정되면 행을 옮기는 이관이 필요하다. 서버에서 같은 일이 생기면 마이그레이션이 든다.
 *
 * **계약은 안 바뀐다.** 앱이 보는 `ManualCompletionBoss.boss` 와 세션 값은 그대로다. 열쇠로 쓰던
 * 칸이 `UNIQUE` 로 남으므로 `ON CONFLICT (boss)` · `WHERE session_hash = $1` 같은 조회도 그대로
 * 돈다 - `ON CONFLICT` 는 기본키가 아니라 **유니크 인덱스**를 요구한다. 그래서 이 마이그레이션에
 * 딸린 코드 변경이 없다.
 *
 * **`notices` 는 여기 없다.** 그 표의 열쇠 칸 이름이 `id` 여서 새 uuid 와 부딪히고, 이름을 정하는
 * 일이 앱 계약(`Notice.id`)과 맞물린다. 따로 간다.
 *
 * 대가를 적어 둔다. **`nexon_sessions.id` 는 아무도 가리키지 않는다.** 세션은 해시로 찾고 사람은
 * `user_id` 로 가리키므로 이 칸은 규칙을 지키는 값으로만 있다.
 */

/** 기본키를 uuid 로 바꾸고 옛 열쇠를 `UNIQUE` 로 남긴다. 한 트랜잭션 안에서 돈다. */
const toUuidPk = (pgm, table, oldKey) => {
  pgm.sql(`
    -- 옛 기본키를 내리면 그 유니크 인덱스도 함께 사라진다. 같은 트랜잭션에서 UNIQUE 를 다시
    -- 세우므로 ON CONFLICT 가 기댈 인덱스가 비는 순간이 없다.
    ALTER TABLE ${table} DROP CONSTRAINT ${table}_pkey;
    ALTER TABLE ${table} ADD COLUMN id uuid NOT NULL DEFAULT gen_random_uuid();
    ALTER TABLE ${table} ADD PRIMARY KEY (id);
    ALTER TABLE ${table} ADD CONSTRAINT ${table}_${oldKey}_key UNIQUE (${oldKey});
  `)
}

export const up = (pgm) => {
  toUuidPk(pgm, 'manual_completion_bosses', 'boss')
  toUuidPk(pgm, 'nexon_sessions', 'session_hash')
}

/** 되돌린다. 옛 열쇠가 다시 기본키가 되고 uuid 칸은 사라진다. */
const fromUuidPk = (pgm, table, oldKey) => {
  pgm.sql(`
    ALTER TABLE ${table} DROP CONSTRAINT ${table}_${oldKey}_key;
    ALTER TABLE ${table} DROP CONSTRAINT ${table}_pkey;
    ALTER TABLE ${table} DROP COLUMN id;
    ALTER TABLE ${table} ADD PRIMARY KEY (${oldKey});
  `)
}

export const down = (pgm) => {
  fromUuidPk(pgm, 'nexon_sessions', 'session_hash')
  fromUuidPk(pgm, 'manual_completion_bosses', 'boss')
}
