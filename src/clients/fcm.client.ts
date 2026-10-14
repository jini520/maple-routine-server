import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { type App, cert, getApps, initializeApp } from 'firebase-admin/app'
import { getMessaging } from 'firebase-admin/messaging'

import type { Env } from '../config/env.schema'

/** 토픽으로 보내는 메시지 하나. notification 은 OS 가 그리고 data 는 앱의 JS 가 읽는다. */
export interface FcmMessage {
  topic: string
  notification: { title: string; body: string }
  data: Record<string, string>
}

const APP_NAME = 'maple-routine'

/** FCM 발송. firebase-admin 을 감싼 유일한 자리. FCM_KEY 는 서비스 계정 키 파일의 경로다. */
@Injectable()
export class FcmClient {
  private readonly keyPath: string | undefined

  constructor(config: ConfigService<Env, true>) {
    this.keyPath = config.get('FCM_KEY', { infer: true })
  }

  get enabled(): boolean {
    return this.keyPath !== undefined
  }

  /** 보내고 FCM 메시지 id 를 돌려준다. dryRun 이면 FCM 이 검증만 하고 배달하지 않는다. */
  send(message: FcmMessage, dryRun = false): Promise<string> {
    if (this.keyPath === undefined) {
      return Promise.reject(new Error('FCM_KEY 가 없어 보낼 수 없다'))
    }
    return getMessaging(this.app(this.keyPath)).send(message, dryRun)
  }

  private app(keyPath: string): App {
    const existing = getApps().find((app) => app.name === APP_NAME)
    return existing ?? initializeApp({ credential: cert(keyPath) }, APP_NAME)
  }
}
