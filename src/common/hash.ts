import { createHash, randomBytes } from 'node:crypto'

/** 앱이 드는 값의 저장 형태. 원본은 저장하지 않고 이것으로만 찾는다. */
export function sha256(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest()
}

/**
 * 넥슨 식별자(uid · 메이플 ID · ocid)의 저장 형태. 소문자 16진 64자로, 앱이 보내는 해시와 같은 표기다. 소금을 섞지 않는다.
 * 기기마다 같은 값이 나와야 원문을 모르는 서버에서도 같은 캐릭터 · 계정을 가리킨다.
 */
export function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

/** URL 에 실어도 되는 무작위 값. 32바이트면 추측이 불가능하다. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url')
}
