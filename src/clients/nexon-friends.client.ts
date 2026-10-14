import { Injectable } from '@nestjs/common'

import { NexonBucket } from './nexon-bucket'
import type { Platform } from './nexon-open-id.client'

/** 넥슨 Open API 의 주소. 프렌즈 6경로가 전부 이 아래다. */
const BASE_URL = 'https://open.api.nexon.com'

/** 넥슨이 답을 안 주면 이만큼 기다리고 끊는다. 매달린 쪽 하나가 회차 슬롯을 영구히 쥐지 않게. */
const TIMEOUT_MS = 10_000

const EMPTY = Buffer.alloc(0)

/** 쪽 하나의 응답. status 0 은 HTTP 가 아니라 못 닿은 것이다. */
export interface NexonPage {
  status: number
  body: Buffer
}

/** 사용자의 액세스 토큰으로 부르는 프렌즈 경로. 쪽은 통째로 Buffer 에 받는다. */
@Injectable()
export class NexonFriendsClient {
  constructor(private readonly bucket: NexonBucket) {}

  /** 쪽 하나. 429 면 그 플랫폼의 버킷을 비우고 한 번만 다시 한다. 다시 429 면 그대로 돌려준다. */
  async page(
    platform: Platform,
    accessToken: string,
    path: string,
    signal: AbortSignal,
  ): Promise<NexonPage> {
    const first = await this.once(platform, accessToken, path, signal)
    if (first.status !== 429) return first
    await this.bucket.drain(platform)
    return this.once(platform, accessToken, path, signal)
  }

  private once(
    platform: Platform,
    accessToken: string,
    path: string,
    signal: AbortSignal,
  ): Promise<NexonPage> {
    return this.bucket.run(platform, signal, async () => {
      try {
        const res = await fetch(`${BASE_URL}${path}`, {
          headers: { authorization: `Bearer ${accessToken}` },
          signal: AbortSignal.any([signal, AbortSignal.timeout(TIMEOUT_MS)]),
        })
        return { status: res.status, body: Buffer.from(await res.arrayBuffer()) }
      } catch (error) {
        if (signal.aborted) throw error
        return { status: 0, body: EMPTY }
      }
    })
  }
}
