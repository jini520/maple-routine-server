import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

import type { Env } from '../../config/env.schema'

/** 봉인 용도. AAD 로 묶여 서로의 칸으로 옮겨 심어지지 않는다. 셋은 수명과 권한이 다르다. */
export type SealPurpose = 'access' | 'refresh' | 'session'

export class SealError extends Error {}

const IV_BYTES = 12
const TAG_BYTES = 16
const HEADER_BYTES = 1 + IV_BYTES + TAG_BYTES

/**
 * AES-256-GCM 봉인. 블롭은 version(1) ‖ iv(12) ‖ tag(16) ‖ cipher 한 덩이다.
 *
 * version 이 키를 고른다. 키를 바꿀 때 TOKEN_ENC_KEY_V2 를 더하면 새 봉인은 V2, 읽기는 첫 바이트가
 * 말하는 키다. 이 바이트가 없으면 키를 바꾸는 유일한 길이 전원 재로그인이다.
 */
@Injectable()
export class SealService {
  private readonly keys: ReadonlyMap<number, Buffer>
  private readonly current = 1

  constructor(config: ConfigService<Env, true>) {
    const v1 = config.get('TOKEN_ENC_KEY_V1', { infer: true })
    this.keys = new Map([[1, Buffer.from(v1, 'hex')]])
  }

  seal(purpose: SealPurpose, plaintext: string): Buffer {
    const key = this.keys.get(this.current)
    if (key === undefined) throw new SealError(`key v${this.current} 가 없다`)
    const iv = randomBytes(IV_BYTES)
    const cipher = createCipheriv('aes-256-gcm', key, iv)
    cipher.setAAD(Buffer.from(purpose, 'utf8'))
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
    return Buffer.concat([Buffer.from([this.current]), iv, cipher.getAuthTag(), encrypted])
  }

  open(purpose: SealPurpose, blob: Buffer): string {
    if (blob.length < HEADER_BYTES) throw new SealError('블롭이 머리보다 짧다')
    const key = this.keys.get(blob[0] ?? -1)
    if (key === undefined) throw new SealError(`key v${blob[0]} 가 없다`)
    const iv = blob.subarray(1, 1 + IV_BYTES)
    const tag = blob.subarray(1 + IV_BYTES, HEADER_BYTES)
    const encrypted = blob.subarray(HEADER_BYTES)
    const decipher = createDecipheriv('aes-256-gcm', key, iv)
    decipher.setAAD(Buffer.from(purpose, 'utf8'))
    decipher.setAuthTag(tag)
    try {
      return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8')
    } catch {
      throw new SealError('봉인이 안 맞는다')
    }
  }
}
