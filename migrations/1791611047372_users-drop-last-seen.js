/**
 * `users.last_seen_at` 을 걷는다. **이름이 담지 못하는 뜻을 약속하고 있었다.**
 *
 * `DEFAULT now()` 로 한 번 박히고 그 뒤로 아무도 안 고쳤다. 읽는 코드도 0개였다. 그래서 값은
 * `created_at` 의 복사본이고, 운영 실측도 두 시각이 같은 마이크로초였다. 다음 세션이 이름만 보고
 * 집계를 짜면 전원이 가입일에 마지막으로 접속한 것으로 나온다.
 *
 * **돌게 만들지 않고 걷는 이유.** 서버는 앱 내 활동을 모른다. 조회 경로에는 신원이 안 실려서
 * (공개 정보라 인증이 없다) 앱을 켜도 공지를 봐도 이 칸은 움직일 수 없다. 움직일 수 있는 것은
 * 쓰기 경로 셋뿐이라, 정직한 이름은 `마지막으로 가격을 적은 때` 가 된다. 그것은 이 이름이 아니다.
 *
 * 앱 활동을 담으려면 활동을 보내야 하는데, 그것은 처리방침이 안 보낸다고 적은 것이다(이용 행태).
 * 그 수집은 이슈 #619 가 소유하고, 그 이슈가 요구하는 것은 일 방문자 · 방문 횟수 · 페이지별
 * 방문자다. **칸 하나로는 횟수도 DAU 도 못 낸다** - 사건을 행으로 쌓아야 하고, 그러면 마지막으로
 * 나타난 때는 `MAX()` 로 나오므로 이 칸이 같은 사실을 두 군데 둔 상태가 된다.
 *
 * 그래서 다시 세울 자리는 이 칸이 아니라 #619 가 정하는 사건 표다.
 */

export const up = (pgm) => {
  pgm.sql(`
    ALTER TABLE users DROP COLUMN last_seen_at;
  `)
}

/**
 * 되돌린다. **칸은 돌아오지만 값은 못 돌아온다.**
 *
 * 걷기 전의 값은 전부 `created_at` 과 같았으므로 그것으로 채운다. `DEFAULT now()` 로 두면 되돌린
 * 시각이 들어가 **없던 사실을 지어내는** 셈이 된다.
 */
export const down = (pgm) => {
  pgm.sql(`
    ALTER TABLE users ADD COLUMN last_seen_at timestamptz;
    UPDATE users SET last_seen_at = created_at;
    ALTER TABLE users ALTER COLUMN last_seen_at SET NOT NULL;
    ALTER TABLE users ALTER COLUMN last_seen_at SET DEFAULT now();
  `)
}
