/**
 * 시세 표본을 **기록 하나에 한 줄**로 바꾼다. 고치면 그 줄을 덮어쓴다(사용자 지정 2026-10-10).
 *
 * 처음에는 가격이 바뀔 때마다 줄을 쌓고 `superseded_at` 이 NULL 인 하나만 유효하게 했다. 이력을
 * 남기는 쪽이었는데 사용자가 거뒀다 - **이력을 남길 이유가 없다.**
 *
 * 쌓기를 버리면 그 설계가 들고 있던 것 넷이 함께 사라진다.
 *
 * - 한 아이템의 판매 금액이 여러 개가 되는 상태(그래서 집계가 두 번 셀 수 있던 것)
 * - 그걸 막던 **부분 유일 인덱스**. 이제 `drop_record_id` 에 평범한 `UNIQUE` 하나다
 * - 두 단계 쓰기와 그 **순서 요건**(덮기가 넣기보다 먼저여야 했다)
 * - 멱등을 값 비교로 세우던 읽기. 이제 제약이 공짜로 준다(`ON CONFLICT DO UPDATE`)
 *
 * `superseded_at` 이라는 이름도 함께 사라진다. 그 칸은 `대체됐다` 를 말했는데 가격을 뺀 경우에는
 * 대체하는 것이 없어 한 겹 어긋나 있었다.
 *
 * **표를 다시 만든다.** 칸 넷이 바뀌고 인덱스 둘이 바뀌어 `ALTER` 를 늘어놓는 것보다 정의 한 벌이
 * 읽힌다. 안전한 근거는 **표본이 0건**이라는 것이고(앱이 아직 안 보낸다) 그 전제를 아래 `DO` 블록이
 * 직접 확인한다 - 행이 있으면 지우지 않고 그 자리에서 던진다.
 */

export const up = (pgm) => {
  pgm.sql(`
    DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM drop_prices) THEN
        RAISE EXCEPTION '드롭 가격 표본이 있다. 이 마이그레이션은 빈 표만 다시 만든다';
      END IF;
    END $$;

    DROP TABLE drop_prices;

    CREATE TABLE drop_prices (
      id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
      -- 사람이 사라지면 그 사람의 표본도 함께 사라진다(nexon_sessions 와 같은 모양).
      user_id        uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
      -- 기기가 만든 v4 uuid. **이 UNIQUE 가 멱등을 만든다** - 응답만 유실돼 다시 보내도 한 줄이다.
      -- user_id 를 엮지 않는다. uuid 는 혼자서 이미 유일하므로 엮어도 유일성이 안 늘고, 오히려
      -- 같은 값이 다른 사람으로 올 때 줄을 둘 허용한다. 남의 줄을 덮는 것은 문장이 막는다
      -- (ON CONFLICT DO UPDATE ... WHERE drop_prices.user_id = EXCLUDED.user_id).
      drop_record_id uuid        NOT NULL UNIQUE,
      -- 분포의 축. 기기가 아이템 이름이 아니라 key 로 든다.
      item_key       text        NOT NULL,
      -- **판매 총액이다.** 내 몫이 아니다. 메소는 조 단위까지 가므로 integer 로는 넘친다.
      price_meso     bigint      NOT NULL,
      -- 언제 먹었나. 주간은 리셋일 'YYYY-MM-DD', 월간은 'YYYY-MM'. 불변이라 추이의 축이 된다.
      period_key     text        NOT NULL,
      -- 월드마다 시세가 갈린다. 기기 캐시에 월드가 없으면 NULL 이고 그대로 받는다.
      world_key      text,
      -- 반지 레벨이 시세를 가른다(사용자 확인). 없으면 같은 item_key 에 레벨이 다른 반지 값이 섞인다.
      ring_level     integer,
      -- 장비 부위. 해당 갈래가 아니면 NULL.
      slot           text,
      -- 처음 받은 때와 마지막으로 고친 때. 기기 시계를 믿지 않는다.
      created_at     timestamptz NOT NULL DEFAULT now(),
      updated_at     timestamptz NOT NULL DEFAULT now(),
      -- 가격을 뺐다. NULL 이 가격이 있다는 뜻이다. 사용자 요청으로는 줄을 지우지 않으므로
      -- 이 칸이 그 자리를 대신한다. 다시 적으면 NULL 로 돌아간다.
      deleted_at     timestamptz
    );

    -- 관리 화면이 아이템별 분포를 그리는 자리. 가격이 있는 줄만 본다.
    CREATE INDEX drop_prices_item
      ON drop_prices (item_key, period_key) WHERE deleted_at IS NULL;
  `)
}

/**
 * 되돌린다. **표본이 전부 사라진다.**
 *
 * 쌓던 모양으로 돌아간다. 되돌릴 자리를 두는 것은 임시 DB 로 마이그레이션을 검증할 때 쓰기
 * 위해서다.
 */
export const down = (pgm) => {
  pgm.sql(`
    DROP TABLE drop_prices;

    CREATE TABLE drop_prices (
      id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id        uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
      drop_record_id uuid        NOT NULL,
      item_key       text        NOT NULL,
      price_meso     bigint      NOT NULL,
      period_key     text        NOT NULL,
      world_key      text,
      ring_level     integer,
      slot           text,
      received_at    timestamptz NOT NULL DEFAULT now(),
      superseded_at  timestamptz
    );

    CREATE UNIQUE INDEX drop_prices_current
      ON drop_prices (drop_record_id) WHERE superseded_at IS NULL;
    CREATE INDEX drop_prices_item
      ON drop_prices (item_key, period_key) WHERE superseded_at IS NULL;
  `)
}
