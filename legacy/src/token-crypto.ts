/**
 * 넥슨 토큰을 DB 에 넣기 전에 감싸고, 꺼낼 때 푼다.
 *
 * **왜 평문으로 안 두나.** 토큰 하나면 그 사용자의 캐릭터 목록 · 확률 기록 · 스케줄러를 읽는다.
 * DB 는 집 미니 PC 에 있고 백업이 나간다. 백업이 새는 날 토큰까지 함께 새면 되돌릴 방법이 없다.
 *
 * **열쇠는 env 에만 있다**(`TOKEN_ENC_KEY`). DB 안에 두면 감싸는 의미가 없다. 열쇠를 잃으면
 * 저장된 토큰을 못 풀고, 그때 대가는 **전원 재로그인**이다. 토큰이 아니라 사용자 데이터가
 * 사라지는 것은 아니다.
 *
 * AES-256-GCM 이다. 암호와 위조 검사를 한 번에 한다. CBC 처럼 검사가 따로면 DB 를 고칠 수 있는
 * 사람이 본문을 바꿔치기해도 모른다.
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

/** AES-256 의 열쇠 길이. hex 로는 64글자다. */
const KEY_BYTES = 32

/**
 * GCM 의 권장 iv 길이. **매번 새로 뽑는다.**
 *
 * 같은 열쇠에 같은 iv 를 두 번 쓰면 평문까지 복구된다. GCM 에서 이것이 가장 흔한 사고다.
 */
const IV_BYTES = 12

/** 감싼 토큰 한 덩이. 셋이 함께 있어야 풀 수 있고, DB 에는 `bytea` 세 칸으로 간다. */
export interface SealedToken {
  cipher: Buffer
  iv: Buffer
  tag: Buffer
}

/**
 * 무엇을 감싼 것인가. 푸는 쪽이 같은 값을 줘야 열린다.
 *
 * 액세스 토큰 자리에 갱신 토큰을 옮겨 심는 것을 막는다. 둘은 수명과 권한이 달라서, 바꿔치기가
 * 되면 30분짜리 자리에 14일짜리가 들어앉는다.
 */
export type TokenPurpose = 'access' | 'refresh'

function keyOf(): Buffer {
  const raw = process.env.TOKEN_ENC_KEY
  if (raw === undefined || raw === '') {
    throw new Error('TOKEN_ENC_KEY 가 없어 토큰을 감쌀 수 없다')
  }

  const key = Buffer.from(raw, 'hex')
  // Buffer.from 은 hex 가 아닌 글자를 만나면 거기서 조용히 끊는다. 길이로 그것까지 잡힌다.
  if (key.length !== KEY_BYTES) {
    throw new Error(`TOKEN_ENC_KEY 는 hex 64글자(32바이트)여야 한다`)
  }
  return key
}

/**
 * 감싼다.
 *
 * @param purpose 푸는 쪽이 같은 값을 줘야 열린다
 * @example sealToken(accessToken, 'access')
 */
export function sealToken(plain: string, purpose: TokenPurpose = 'access'): SealedToken {
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv('aes-256-gcm', keyOf(), iv)
  cipher.setAAD(Buffer.from(purpose, 'utf8'))

  const sealed = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  return { cipher: sealed, iv, tag: cipher.getAuthTag() }
}

/**
 * 푼다. 열쇠가 다르거나 본문·태그가 건드려졌으면 **던진다.**
 *
 * 조용히 빈 값을 돌려주지 않는다. 빈 토큰으로 넥슨을 부르면 401 이 오고, 그 401 은 사용자에게
 * 재로그인으로 보인다. 진짜 원인은 여기인데 그 사실이 묻힌다.
 */
export function openToken(sealed: SealedToken, purpose: TokenPurpose = 'access'): string {
  const decipher = createDecipheriv('aes-256-gcm', keyOf(), sealed.iv)
  decipher.setAAD(Buffer.from(purpose, 'utf8'))
  decipher.setAuthTag(sealed.tag)

  return Buffer.concat([decipher.update(sealed.cipher), decipher.final()]).toString('utf8')
}
