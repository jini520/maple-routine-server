/**
 * 넥슨 공지를 새 글 가리기에 필요한 만큼으로 줄인다.
 *
 * 폴러가 공지마다 상세를 받아 파싱해 만든 것 둘 중 **쓰이는 것은 하나뿐이었다.** `blocks` 는
 * `/v1/sunday-maple` 만 읽고, `body` 미리보기는 아무도 안 읽는다 - 넥슨 공지의 푸시는 제목으로
 * 만들고(`pushTextFor` 의 비-`app` 분기), 앱은 넥슨 네 분류를 넥슨에서 직접 받는다.
 *
 * 운영 실측(2026-10-08): `blocks` 가 `update` 23행 1,036kB · `game` 50행 78kB · `event` 36행
 * 9.5kB · `cashshop` 33행 7.2kB 였다. `update` 하나가 90% 다.
 *
 * **되돌릴 수 없다.** 넥슨이 지난 글 상세를 400 으로 거절해 우리 DB 가 유일한 사본이었다. 비우면
 * 영구히 사라진다(사용자 지정 2026-10-08).
 */

export const up = (pgm) => {
  pgm.sql(`
    -- 운영자 공지 말고는 넣을 내용이 없다. 넥슨 공지는 NULL 이다.
    -- 계약의 Notice.body 는 그대로 string 이고, 응답을 만드는 toNotice 가 NULL 을 빈 문자열로 바꾼다.
    ALTER TABLE notices ALTER COLUMN body DROP NOT NULL;

    -- 캐시샵 상시 판매 여부. 읽는 SELECT 가 0건이고 폴러가 쓰기만 했다.
    ALTER TABLE notices DROP COLUMN ongoing;

    -- 운영자 공지와 썬데이 메이플만 본문을 남긴다.
    --
    -- 판정이 \`src/notice.ts\` 의 isSundayMaple 과 두 벌이 되는데, 이 문장은 **한 번만 돈다**.
    -- 그 뒤로는 폴러가 썬데이 아닌 글의 상세를 애초에 안 받는다.
    UPDATE notices SET blocks = NULL
     WHERE kind <> 'app'
       AND NOT (kind = 'event' AND regexp_replace(title, '\\s+', '', 'g') LIKE '%썬데이%');

    -- 본문을 비운 행의 미리보기도 함께 비운다. 남겨 두면 아무도 안 읽는 값이 남는다.
    UPDATE notices SET body = NULL WHERE kind <> 'app';
  `)
}

/**
 * 칸을 되살린다. **값은 안 돌아온다.**
 *
 * 비운 `blocks` 와 `body` 는 넥슨에서 다시 받을 길이 없다. 되돌릴 자리를 두는 것은 임시 DB 로
 * 마이그레이션을 검증할 때 쓰기 위해서다.
 */
export const down = (pgm) => {
  pgm.sql(`
    ALTER TABLE notices ADD COLUMN ongoing boolean;

    -- NOT NULL 로 되돌리려면 빈 칸을 채워야 한다. 원래 값이 아니라 빈 문자열이다.
    UPDATE notices SET body = '' WHERE body IS NULL;
    ALTER TABLE notices ALTER COLUMN body SET NOT NULL;
  `)
}
