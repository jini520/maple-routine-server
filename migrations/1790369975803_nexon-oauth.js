/**
 * 넥슨 Open ID 로그인이 쓰는 표 둘.
 *
 * 토큰은 평문으로 안 들어온다. `token-crypto.ts` 가 AES-256-GCM 으로 감싼 셋(본문 · iv · 태그)이
 * 그대로 칸이 된다. 열쇠는 env 에만 있다.
 */

export const up = (pgm) => {
  pgm.sql(`
    -- 로그인 시작과 code 교환 사이를 잇는 짝. 로그인 한 번이 끝날 만큼만 산다.
    --
    -- 프로세스 메모리(Map)가 아니라 표인 것은 인스턴스가 여럿일 수 있어서다. A 에서 시작한
    -- 로그인이 B 로 돌아오면 메모리에서는 짝을 못 찾는다.
    CREATE TABLE IF NOT EXISTS nexon_login_attempts (
      -- 넥슨에 넘기고 콜백으로 돌아오는 값. 앱이 같은 값인지 확인한다.
      state      text        PRIMARY KEY,
      -- 콜백 URL 에 안 실리고 앱과 서버 사이 https 로만 오간다. 안드로이드에서 콜백을 가로챈
      -- 앱은 code 와 state 만 갖고 이 값이 없어, 교환을 요청해도 서버가 거절한다.
      verifier   text        NOT NULL,
      -- 어느 플랫폼으로 시작한 로그인인가. 넥슨 애플리케이션이 iOS 와 Android 로 따로
      -- 등록돼 client_id 와 secret 이 쌍으로 갈린다. 교환은 시작 때와 **같은 쌍**을 써야
      -- 하고, 앱이 교환에서 보낸 값이 아니라 여기 적힌 것을 쓴다.
      platform   text        NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      -- 이 시각이 지나면 안 받는다. 쓰이지 않은 짝을 치우는 기준이기도 하다.
      expires_at timestamptz NOT NULL
    );
    -- 만료된 짝을 치울 때 훑는 자리.
    CREATE INDEX IF NOT EXISTS nexon_login_attempts_expires_at
      ON nexon_login_attempts (expires_at);

    -- 로그인한 사용자 하나. 앱이 받는 것은 session_hash 의 원본 하나뿐이다.
    CREATE TABLE IF NOT EXISTS nexon_sessions (
      -- 세션 원본이 아니라 그 해시를 둔다. DB 가 새도 그것으로 남의 세션을 쓸 수 없다.
      session_hash      bytea       PRIMARY KEY,
      -- 넥슨이 주는 사용자 식별자. 같은 사람이 다시 로그인하면 이 값으로 옛 행을 찾는다.
      --
      -- **아직 비어 있을 수 있다.** 넥슨이 이 값을 토큰 응답에 주는지 id_token 에 주는지
      -- 실측 전이다. 없어도 로그인은 돈다 - 세션을 찾는 열쇠는 session_hash 다. 다만 같은
      -- 사람이 다시 로그인하면 옛 행이 갱신 토큰 수명만큼 남는다.
      nexon_uid         text,
      access_cipher     bytea       NOT NULL,
      access_iv         bytea       NOT NULL,
      access_tag        bytea       NOT NULL,
      -- 액세스 토큰이 30분이다. 이 시각을 지나면 갱신하고 쓴다.
      access_expires_at timestamptz NOT NULL,
      refresh_cipher    bytea       NOT NULL,
      refresh_iv        bytea       NOT NULL,
      refresh_tag       bytea       NOT NULL,
      -- 갱신 토큰이 14일이다. 여기까지 지나면 행을 지우고 앱에 재로그인을 알린다.
      refresh_expires_at timestamptz NOT NULL,
      created_at        timestamptz NOT NULL DEFAULT now(),
      last_used_at      timestamptz NOT NULL DEFAULT now()
    );
    -- 같은 사람이 다시 로그인했을 때 옛 행을 찾는 자리.
    CREATE INDEX IF NOT EXISTS nexon_sessions_uid ON nexon_sessions (nexon_uid);
    -- 만료된 세션을 치울 때 훑는 자리.
    CREATE INDEX IF NOT EXISTS nexon_sessions_refresh_expires_at
      ON nexon_sessions (refresh_expires_at);
  `)
}

export const down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS nexon_sessions;
    DROP TABLE IF EXISTS nexon_login_attempts;
  `)
}
