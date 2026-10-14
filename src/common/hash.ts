import { createHash, randomBytes } from 'node:crypto'

/** 앱이 드는 값의 저장 형태. 원본은 저장하지 않고 이것으로만 찾는다. */
export function sha256(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest()
}

/** URL 에 실어도 되는 무작위 값. 32바이트면 추측이 불가능하다. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url')
}
