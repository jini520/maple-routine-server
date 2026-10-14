/**
 * 지금 도는 스키마를 그대로 옮긴 것. 전에는 `db.ts` 의 `migrate()` 가 이 자리였다.
 *
 * **전부 `IF NOT EXISTS` 인 것이 요점이다.** 이미 돌고 있는 운영 DB 에서 이것을 돌려도
 * 아무것도 안 바뀌고 적용 이력만 남는다. 그래서 **이미 적용된 것으로 표시만 하는** 별도
 * 조치 없이 배포된다.
 *
 * 아래 `ALTER TABLE ADD COLUMN IF NOT EXISTS` 아홉 줄은 위 `CREATE TABLE` 과 겹친다. 옛
 * 방식이 새 설치와 기존 설치를 두 자리에 나눠 적어야 했던 흔적이고, 표가 언제 만들어졌든
 * 같은 모양이 되도록 함께 둔다. **다음 마이그레이션부터는 이렇게 안 적는다** - 각 파일이
 * 정확히 한 번만 도니까 한 자리면 된다.
 */

export const up = (pgm) => {
  pgm.sql(`
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
      ongoing      boolean,
      -- 알림을 보낼 시각. NULL 이면 예약이 없다. sent_at 이 비어 있고 이 칸에 값이 있으면
      -- 아직 안 보낸 예약이다. 보낸 뒤에도 남아 예약해서 보낸 것임을 말한다.
      scheduled_at timestamptz
    );
    -- 목록이 최근순으로 읽는다. 건수가 적어도 인덱스가 없으면 매번 정렬한다.
    CREATE INDEX IF NOT EXISTS notices_published_at_desc
      ON notices (published_at DESC, id DESC);

    ALTER TABLE notices ADD COLUMN IF NOT EXISTS push_title text;
    ALTER TABLE notices ADD COLUMN IF NOT EXISTS push_body  text;
    ALTER TABLE notices ADD COLUMN IF NOT EXISTS kind       text NOT NULL DEFAULT 'app';
    ALTER TABLE notices ADD COLUMN IF NOT EXISTS blocks     jsonb;
    ALTER TABLE notices ADD COLUMN IF NOT EXISTS source_id  bigint;
    ALTER TABLE notices ADD COLUMN IF NOT EXISTS starts_at  timestamptz;
    ALTER TABLE notices ADD COLUMN IF NOT EXISTS ends_at    timestamptz;
    ALTER TABLE notices ADD COLUMN IF NOT EXISTS ongoing    boolean;
    ALTER TABLE notices ADD COLUMN IF NOT EXISTS scheduled_at timestamptz;

    -- 분류로 걸러 최근순으로 읽는다. 목록 화면이 토글마다 따로 물어 온다.
    CREATE INDEX IF NOT EXISTS notices_kind_published_at_desc
      ON notices (kind, published_at DESC, id DESC);

    -- 예약 고리가 1분마다 훑는 자리. 표는 넥슨 공지로 계속 커지는데 아직 안 보낸 예약은
    -- 늘 몇 건이라, 부분 인덱스가 그 몇 건만 들고 있다.
    CREATE INDEX IF NOT EXISTS notices_pending_schedule
      ON notices (scheduled_at)
      WHERE scheduled_at IS NOT NULL AND sent_at IS NULL;

    -- 직접 완료를 열어 둔 보스. 행이 있고 closed_at 이 NULL 이면 열려 있다.
    CREATE TABLE IF NOT EXISTS manual_completion_bosses (
      boss      text PRIMARY KEY,
      -- 여는 날(KST YYYY-MM-DD). 이 날이 든 기간부터 앱이 단추를 세운다.
      from_date text        NOT NULL,
      opened_at timestamptz NOT NULL DEFAULT now(),
      -- 닫은 시각. NULL 이면 열려 있다. 행을 안 지우는 것은 언제 켜고 언제 껐는지가 기록이기 때문이다.
      closed_at timestamptz
    );
  `)
}

/**
 * 표를 통째로 지운다. **운영 DB 에서 부를 일이 아니다.**
 *
 * 이 파일을 되돌린다는 것은 공지와 직접 완료 설정을 버린다는 뜻이다. 되돌릴 자리가 있는 것은
 * 임시 DB 로 마이그레이션을 검증할 때 쓰기 위해서다.
 */
export const down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS manual_completion_bosses;
    DROP TABLE IF EXISTS notices;
  `)
}
