/**
 * 사용자가 적은 드롭 아이템 판매가. 시세 추이를 보기 위한 표본이다(이슈 #610).
 *
 * **가격을 고칠 때마다 줄이 쌓이고 그중 하나만 유효하다.** 쌓기만 하면 10억으로 적고 3억으로
 * 고친 기록 하나가 분포에 두 번 센다. `superseded_at` 이 NULL 인 줄이 지금 유효한 값이고, 집계는
 * 그 조건 하나만 붙인다. 창 함수로 「기록마다 마지막 줄」을 뽑는 길은 쿼리마다 기억해야 하고 한 번
 * 빠뜨리면 조용히 두 번 센다.
 *
 * **`drop_record_id` 는 기기가 만든 값이고 FK 가 아니다.** 기기 행의 사본을 서버에 두지 않기로
 * 했으므로 참조할 표가 없다. 이 값이 하는 일은 같은 기록의 수정을 잇는 것이다.
 */

export const up = (pgm) => {
  pgm.sql(`
    CREATE TABLE drop_prices (
      id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
      -- 사람이 사라지면 그 사람의 표본도 함께 사라진다(nexon_sessions 와 같은 모양).
      user_id        uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
      -- 기기가 만든 v4 uuid. 같은 기록의 수정을 잇는 열쇠이고 참조할 표는 없다.
      drop_record_id uuid        NOT NULL,
      -- 분포의 축. 기기가 아이템 이름이 아니라 key 로 든다.
      item_key       text        NOT NULL,
      -- **판매 총액이다.** 내 몫이 아니다. 분배 인원·비율·수수료는 내 몫을 세는 재료라 안 받는다.
      -- 메소는 조 단위까지 가므로 integer 로는 넘친다.
      price_meso     bigint      NOT NULL,
      -- 언제 먹었나. 주간은 리셋일 'YYYY-MM-DD', 월간은 'YYYY-MM'. 불변이라 추이의 축이 된다.
      period_key     text        NOT NULL,
      -- 월드마다 시세가 갈린다. 기기 캐시에 월드가 없으면 NULL 이고 그대로 받는다.
      world_key      text,
      -- 반지 레벨이 시세를 가른다(사용자 확인). 없으면 같은 item_key 에 레벨이 다른 반지 값이 섞인다.
      ring_level     integer,
      -- 장비 부위. 해당 갈래가 아니면 NULL.
      slot           text,
      -- 서버가 받은 시각. 기기 시계를 믿지 않는다.
      received_at    timestamptz NOT NULL DEFAULT now(),
      -- 이 줄을 대신한 줄이 들어온 시각. NULL 이 지금 유효한 한 줄이다.
      -- 가격을 거둔 기록은 유효한 줄이 아예 없다.
      superseded_at  timestamptz
    );

    -- **유효한 줄은 기록마다 하나뿐이다.** 칸 하나에 거는 유일 인덱스이고 WHERE 는 어느 줄에
    -- 거는지를 고르는 조건이다(엮은 키가 아니다). 보낼 때 그 한 줄을 찾는 자리도 겸한다.
    CREATE UNIQUE INDEX drop_prices_current
      ON drop_prices (drop_record_id) WHERE superseded_at IS NULL;

    -- 관리 화면이 아이템별 분포를 그리는 자리. 유효한 줄만 보므로 같은 조건을 건다.
    CREATE INDEX drop_prices_item
      ON drop_prices (item_key, period_key) WHERE superseded_at IS NULL;
  `)
}

/**
 * 되돌린다. **표본이 전부 사라진다.**
 *
 * 되돌릴 자리를 두는 것은 임시 DB 로 마이그레이션을 검증할 때 쓰기 위해서다.
 */
export const down = (pgm) => {
  pgm.sql(`DROP TABLE drop_prices;`)
}
