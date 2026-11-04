/**
 * 죽은 토큰과 틀린 인가 코드의 에러 이름. 같은 400 이라도 OPENAPI00004 는 파라미터나 자격 쌍이 틀린 것이라 토큰 탓이 아니다.
 * 동의를 철회한 사용자의 토큰도 데이터 조회에서 이것으로 거절된다.
 */
export const TOKEN_REJECTED = 'OPENAPI00012'

/** 넥슨 에러 본문은 { error: { name, message } } 다. JSON 이 아니면 이름이 없다. */
export function errorNameOf(text: string): string | null {
  try {
    const body = JSON.parse(text) as { error?: { name?: unknown } }
    return typeof body.error?.name === 'string' ? body.error.name : null
  } catch {
    return null
  }
}
