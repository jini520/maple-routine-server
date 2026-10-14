import { Injectable } from '@nestjs/common'

import { FcmClient } from '../../clients/fcm.client'
import { messageFor, type PushableNotice } from './push-text'

/** 공지 하나를 그 분류의 토픽으로 보낸다. 문구는 push-text 의 규칙이 만든다. */
@Injectable()
export class PushService {
  constructor(private readonly fcm: FcmClient) {}

  /** 돌려주는 것은 FCM 메시지 id 다. dryRun 이면 검증만 하고 배달하지 않는다. */
  sendNotice(notice: PushableNotice, dryRun = false): Promise<string> {
    return this.fcm.send(messageFor(notice), dryRun)
  }
}
