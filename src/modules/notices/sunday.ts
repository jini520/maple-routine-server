/**
 * 공백을 지운 제목에 썬데이 가 들어 있는가.
 *
 * 웹 게시판에서 본 제목 셋(썬데이 메이플 · 스페셜 썬데이 메이플 · 스페셜 썬데이)으로 세운 판정이다.
 * 조회 때 돌리므로 여기를 고치면 이미 쌓인 기록도 같이 바로잡힌다.
 */
export function isSundayMaple(title: string): boolean {
  return title.replace(/\s+/g, '').includes('썬데이')
}
