import { randomInt } from 'node:crypto'

/** 추천인 코드에 쓰는 글자. 손으로 옮겨 적다 헷갈리는 0 · O · 1 · I 는 뺐다. */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const LENGTH = 8

/** 무작위 추천인 코드 하나. 다른 계정과 겹치는지는 부르는 쪽이 본다. */
export function newReferralCode(): string {
  let code = ''
  for (let i = 0; i < LENGTH; i += 1) code += ALPHABET[randomInt(ALPHABET.length)]
  return code
}
