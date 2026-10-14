/**
 * 쓰기 경로가 공유하는 한 겹. 헤더를 보고 **부른 사람**을 가린다.
 *
 * 경로마다 베끼면 한 곳만 고쳐지는 날이 온다. 크레딧 · 상점 · 백업이 생길 때도 이 자리를 쓴다.
 *
 * | 헤더 | 값 | 사람을 찾는 길 |
 * |---|---|---|
 * | `x-nexon-session` | 세션 토큰 | `resolveSession` → `userForLogin` |
 * | `x-api-key-hash` | API 키의 SHA-256, 소문자 16진 64자 | `userForApiKey` |
 *
 * 조회 경로는 그대로 공개다. 기존 기능을 인증으로 안 가르기로 했으므로 여기 안 걸린다.
 */
import { SESSION_HEADER } from './auth-routes.ts'

/** 앱이 키 해시를 싣는 헤더. `x-nexon-session` 과 나란히 읽히게 맞췄다. */
export const KEY_HASH_HEADER = 'x-api-key-hash'

/** 이 파일이 밖에 맡기는 일 둘. 가리는 규칙은 `users.ts` 가 들고 여기는 결과만 받는다. */
export interface CallerDeps {
  /** 세션 값으로 사람 id 를 찾는다. 세션이 죽었거나 uid 가 없으면 `null`. */
  userIdForSession: (sessionValue: string) => Promise<string | null>
  /** 받은 해시로 사람을 찾거나 만든다. 모양이 틀리면 `null`. */
  userIdForApiKey: (received: string) => Promise<string | null>
}

/**
 * 가린 결과.
 *
 * 거절 사유를 둘로 가르는 것은 앱이 할 일이 달라서다. `signin_required` 는 재로그인을 띄우고,
 * `unauthorized` 는 그냥 실패다.
 */
export type Caller = { userId: string } | { error: 'signin_required' | 'unauthorized' }

/** 같은 헤더를 두 번 보내면 Fastify 가 배열로 준다. 첫 값만 본다. */
function headerValue(raw: string | string[] | undefined): string {
  const one = Array.isArray(raw) ? raw[0] : raw
  return typeof one === 'string' ? one.trim() : ''
}

/**
 * 헤더로 사람을 가린다.
 *
 * **세션이 왔으면 키 해시로 안 넘어간다.** 세션이 죽었을 때 키 쪽으로 넘어가면 같은 사람의
 * 기록이 두 열쇠로 갈라져, 사람을 한 표로 모은 것이 다시 쪼개진다. 재로그인을 요구하는 것이
 * 맞는 답이다.
 */
export async function callerFor(
  deps: CallerDeps,
  headers: Partial<Record<string, string | string[]>>,
): Promise<Caller> {
  const session = headerValue(headers[SESSION_HEADER])
  if (session !== '') {
    const userId = await deps.userIdForSession(session)
    return userId === null ? { error: 'signin_required' } : { userId }
  }

  const hash = headerValue(headers[KEY_HASH_HEADER])
  if (hash === '') return { error: 'unauthorized' }

  const userId = await deps.userIdForApiKey(hash)
  return userId === null ? { error: 'unauthorized' } : { userId }
}
