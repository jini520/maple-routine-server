/**
 * 사람 표. 인증 수단이 이 행을 가리키고, 사람에 매달리는 데이터는 모두 이 행을 본다.
 *
 * 열쇠를 **칸으로** 든다. 사람 하나에 열쇠가 각 종류 하나씩이라 행으로 가를 이유가 없다. 키를
 * 더하는 기능은 로그인 사용자에게만 열리므로, 서버가 보는 열쇠는 늘 하나다.
 *
 * `nexon_sessions.nexon_uid` 를 **여기로 옮긴다.** 그 칸은 세션에 매달려 있어서 세션이 지워지면
 * (갱신 토큰 14일 만료 · 넥슨의 갱신 거절 · 연결 해제) 서버가 그 사람을 알아보는 유일한 자리가
 * 함께 사라졌다. 셋 다 정상 동작이라, 사람을 세션에 매달면 **정상 동작이 데이터 소실이 된다.**
 */

export const up = (pgm) => {
  pgm.sql(`
    CREATE TABLE users (
      -- 서버가 만든다. 열쇠 값들은 아래 칸으로 들어가고 PK 가 되지 않는다.
      id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
      -- 넥슨 로그인으로 들어온 사람의 열쇠. 넥슨이 주는 식별자라 위조되지 않는다.
      nexon_uid    text        UNIQUE,
      -- 키만 쓰는 사람의 열쇠. **앱이 보낸 해시를 서버가 한 번 더 해시한 값이다**(32바이트).
      -- 받은 그대로 저장하면 DB 가 새어 나갈 때 그 값으로 남의 기록을 열 수 있다.
      api_key_hash bytea       UNIQUE,
      created_at   timestamptz NOT NULL DEFAULT now(),
      last_seen_at timestamptz NOT NULL DEFAULT now(),
      -- 둘 다 비면 다시 찾을 길이 없어 행이 쓰레기가 된다.
      CONSTRAINT users_has_key CHECK (nexon_uid IS NOT NULL OR api_key_hash IS NOT NULL)
    );

    -- 세션은 사람을 가리키는 임시 티켓이다. 사람이 사라지면 티켓도 함께 사라진다.
    --
    -- **NULL 을 허용한다.** userinfo 가 실패해 uid 를 못 받은 세션은 사람으로 승격하지 않는다.
    -- 그 세션으로 조회는 되고 새 기능만 안 열린다.
    ALTER TABLE nexon_sessions
      ADD COLUMN user_id uuid REFERENCES users (id) ON DELETE CASCADE;

    -- 이미 로그인해 둔 세션 중 uid 가 있는 것만 사람으로 올린다.
    INSERT INTO users (nexon_uid)
      SELECT DISTINCT nexon_uid FROM nexon_sessions WHERE nexon_uid IS NOT NULL;

    UPDATE nexon_sessions AS s
       SET user_id = u.id
      FROM users AS u
     WHERE u.nexon_uid = s.nexon_uid;

    -- 옛 칸과 그것을 찾던 인덱스를 걷는다. 두 자리에 같은 값을 두면 갈린다.
    DROP INDEX IF EXISTS nexon_sessions_uid;
    ALTER TABLE nexon_sessions DROP COLUMN nexon_uid;

    -- 사람을 지울 때 그 사람의 세션을 찾는 자리.
    CREATE INDEX nexon_sessions_user_id ON nexon_sessions (user_id);
  `)
}

/**
 * 되돌린다. **올린 사람 행은 사라지고 세션의 uid 는 되살아난다.**
 *
 * 되돌릴 자리를 두는 것은 임시 DB 로 마이그레이션을 검증할 때 쓰기 위해서다. 운영 DB 에서 부르면
 * `users` 에 매달린 데이터가 함께 사라진다.
 */
export const down = (pgm) => {
  pgm.sql(`
    ALTER TABLE nexon_sessions ADD COLUMN nexon_uid text;

    UPDATE nexon_sessions AS s
       SET nexon_uid = u.nexon_uid
      FROM users AS u
     WHERE u.id = s.user_id;

    CREATE INDEX IF NOT EXISTS nexon_sessions_uid ON nexon_sessions (nexon_uid);

    DROP INDEX IF EXISTS nexon_sessions_user_id;
    ALTER TABLE nexon_sessions DROP COLUMN user_id;

    DROP TABLE users;
  `)
}
