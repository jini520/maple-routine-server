/**
 * 사람 하나를 가리는 자리. 인증 수단이 `users` 행을 가리키고, 사람에 매달리는 데이터는 그 행을 본다.
 *
 * **DB 를 인자로 받는다**(`UserDeps`). 직접 import 하면 이 파일을 부르는 테스트가 전부 DB 를
 * 요구한다. `api.ts` · `auth-routes.ts` 가 이미 쓰는 모양과 같다.
 */
import { createHash } from 'node:crypto'

/** 사람 하나. 열쇠는 둘 중 하나 이상이 차 있다. */
export interface User {
  id: string
  /** 넥슨 로그인으로 들어온 사람의 열쇠. 키만 쓰는 사람은 `null` 이다. */
  nexonUid: string | null
  createdAt: Date
  lastSeenAt: Date
}

/** 이 파일이 DB 에서 하는 일 전부. 진짜 구현은 `db.ts` 에 있고 테스트는 가짜를 넣는다. */
export interface UserDeps {
  findUserByNexonUid: (uid: string) => Promise<User | null>
  /** 인자는 **다시 해시한 값**이다. 앱이 보낸 값 그대로가 아니다. */
  findUserByApiKeyHash: (sealed: Buffer) => Promise<User | null>
  insertUser: (keys: { nexonUid?: string; apiKeyHash?: Buffer }) => Promise<User>
}

/** 앱이 보내는 값의 모양. SHA-256 을 소문자 hex 로 적은 64자다. */
const API_KEY_HASH = /^[0-9a-f]{64}$/

/**
 * 앱이 보낸 해시를 **한 번 더 해시한다.** 칸에 들어가는 것은 이 값이다.
 *
 * 앱이 보낸 해시는 서버 기록을 여는 값이기도 해서, 받은 그대로 저장하면 DB 가 새어 나갈 때 남의
 * 기록을 열 수 있다. `nexon_sessions` 가 세션 원본이 아니라 그 해시를 열쇠로 쓰는 것과 같은 모양이다.
 *
 * @param received 앱이 보낸 값. `API_KEY_HASH` 를 통과한 것만 넣는다
 */
export function sealApiKeyHash(received: string): Buffer {
  return createHash('sha256').update(received, 'utf8').digest()
}

/**
 * 로그인으로 들어온 사람. uid 로 찾고 없으면 만든다.
 *
 * **uid 가 없으면 사람을 만들지 않는다.** userinfo 가 실패해도 로그인은 진행하므로 uid 가 빈
 * 세션이 생길 수 있다. 그 세션으로 조회는 되고 새 기능만 안 열린다. 사람을 만들어 두면 열쇠가 없는
 * 행이 되어 다시 찾을 길이 없다.
 */
export async function userForLogin(deps: UserDeps, nexonUid: string | null): Promise<User | null> {
  if (nexonUid === null || nexonUid === '') return null

  const found = await deps.findUserByNexonUid(nexonUid)
  if (found !== null) return found

  return deps.insertUser({ nexonUid })
}

/**
 * 키로 들어온 사람. 받은 해시를 다시 해시해 찾고 없으면 만든다.
 *
 * **모양을 먼저 본다.** 안 보면 아무 문자열이나 사람 행이 되어 쓰레기가 쌓인다. 앱과 서버가 같은
 * 알고리즘과 표기(SHA-256 · 소문자 hex)를 써야 하고, 갈리면 같은 사용자가 매번 새 사람이 된다.
 */
export async function userForApiKey(deps: UserDeps, received: string): Promise<User | null> {
  if (!API_KEY_HASH.test(received)) return null

  const sealed = sealApiKeyHash(received)
  const found = await deps.findUserByApiKeyHash(sealed)
  if (found !== null) return found

  return deps.insertUser({ apiKeyHash: sealed })
}
