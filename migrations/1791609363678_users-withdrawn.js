/**
 * 탈퇴를 칸으로 든다. **사용자 요청으로는 행을 지우지 않는다**(사용자 지정 2026-10-10).
 *
 * 종전에 `DELETE /v1/me` 가 `users` 행을 지우고 `drop_prices` · `nexon_sessions` 가 `CASCADE` 로
 * 따라 사라졌다. 이제 이 칸만 적고 **표본은 안 건드린다** - 시세 추이가 사람이 들어왔다 나갔다고
 * 흔들리지 않아야 한다.
 *
 * `NULL` 이 활동 중이다. 여부와 시점을 한 칸이 답하므로 boolean 을 따로 안 둔다
 * (`drop_prices.superseded_at` · `manual_completion_bosses.closed_at` 과 같은 어법).
 *
 * **세션은 예외로 지운다.** 그 행은 기록이 아니라 살아 있는 자격 증명이고(넥슨 토큰을 AES-GCM
 * 으로 들고 있다) 남기면 그 토큰이 계속 먹는다. 그 삭제는 이 마이그레이션 밖의 일이다.
 *
 * 인덱스를 안 건다. `users` 는 열쇠 둘의 `UNIQUE` 로만 찾고, 이 칸으로 거르는 조회가 없다.
 */

export const up = (pgm) => {
  pgm.sql(`
    ALTER TABLE users ADD COLUMN withdrawn_at timestamptz;
  `)
}

/**
 * 되돌린다. **탈퇴 표시가 사라져 전원이 활동 중으로 보인다.**
 *
 * 되돌릴 자리를 두는 것은 임시 DB 로 마이그레이션을 검증할 때 쓰기 위해서다.
 */
export const down = (pgm) => {
  pgm.sql(`
    ALTER TABLE users DROP COLUMN withdrawn_at;
  `)
}
