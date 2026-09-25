/**
 * 세션 하나를 **넥슨을 부를 수 있는 상태**로 만드는 판정.
 *
 * 앱은 세션 하나만 들고 있고 토큰은 모른다. 그래서 갱신을 여기서 알아서 한다. 앱이 아는 것은
 * `세션이 아직 사나` 하나뿐이고, 죽었을 때만 재로그인을 띄운다.
 *
 * **액세스 만료와 세션 만료를 가른다.** 액세스는 30분이라 하루에도 여러 번 죽지만, 그때마다
 * 갱신하면 그만이다. 이 둘을 안 가르면 30분 지난 사용자가 전부 재로그인 화면을 본다.
 */

import type { Platform } from './nexon-oauth.ts'

/** DB 에서 꺼내 토큰을 푼 세션 하나. */
export interface StoredSession {
  sessionHash: Buffer
  /** 이 세션을 만든 쌍. **갱신도 같은 쌍으로 해야 넥슨이 받는다.** */
  platform: Platform
  /** 넥슨이 어디에 주는지 실측 전이라 아직 비어 있을 수 있다. */
  nexonUid: string | null
  accessToken: string
  accessExpiresAt: Date
  refreshToken: string
  refreshExpiresAt: Date
}

/**
 * 만료 직전을 미리 갱신하는 여유.
 *
 * 딱 만료 시각에 갱신하면 넥슨을 부르러 가는 사이에 죽어 401 이 온다. 그 401 은 앱에
 * 재로그인으로 보이는데 진짜 원인은 여기다.
 */
const REFRESH_MARGIN_MS = 60 * 1000

/** 지금 갱신해야 하나. 부르기 직전에 본다. */
export function needsRefresh(session: StoredSession, now: Date = new Date()): boolean {
  return session.accessExpiresAt.getTime() - REFRESH_MARGIN_MS <= now.getTime()
}

/**
 * 세션이 죽었나. **죽었으면 행을 지우고 앱에 재로그인을 알린다.**
 *
 * 갱신 토큰이 14일이라 2주 넘게 앱을 안 켠 사용자가 여기 걸린다.
 */
export function sessionExpired(session: StoredSession, now: Date = new Date()): boolean {
  return session.refreshExpiresAt.getTime() <= now.getTime()
}
