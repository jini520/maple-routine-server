/**
 * FCM 발송. 토픽으로 쏘고 토큰을 다루지 않는다.
 *
 * 기기는 토픽을 구독할 뿐이라 등록 토큰이 우리를 안 거친다. 토큰을 들면 사용자 식별자
 * 저장소가 생기고 만료 정리와 개인정보 분류가 통째로 따라오는데, 지금 보내는 알림 중
 * 사람을 가려 보낼 것이 없다.
 */
import { readFileSync } from 'node:fs'
import { initializeApp, cert, getApps } from 'firebase-admin/app'
import { getMessaging } from 'firebase-admin/messaging'

import { toPushData, type Notice } from './notice.ts'

/** 앱이 구독하는 토픽. 앱 쪽 `features/notice/store.ts` 와 같은 문자열이어야 한다. */
export const NOTICE_TOPIC = 'notice'

/**
 * FCM 메시지 전체 상한. 넘으면 **발송이 거부되는 것이 아니라 잘려 나갈 수 있다.**
 * 그래서 보내기 전에 우리가 잰다.
 */
const MAX_PAYLOAD_BYTES = 4096

function ensureApp(): void {
  if (getApps().length > 0) return

  const path = process.env.FCM_KEY
  if (path === undefined) throw new Error('FCM_KEY 가 없다')
  initializeApp({ credential: cert(JSON.parse(readFileSync(path, 'utf8'))) })
}

/** 4KB 를 넘는지. 키 이름도 함께 센다. */
export function payloadBytes(notice: Notice): number {
  return Buffer.byteLength(JSON.stringify(toPushData(notice)), 'utf8')
}

/**
 * 토픽으로 보낸다. `dryRun` 이면 FCM 이 검증만 하고 배달하지 않는다.
 *
 * `notification` 으로 보내는 이유. 앱이 죽어 있을 때 OS 가 직접 그린다. data-only 로 보내면
 * iOS 가 배달을 보장하지 않는 자리로 들어가고, 공지 알림에서 그것은 안 뜨는 것과 같다.
 */
export async function sendNotice(notice: Notice, dryRun = false): Promise<string> {
  const bytes = payloadBytes(notice)
  if (bytes > MAX_PAYLOAD_BYTES) {
    throw new Error(`페이로드가 ${bytes}바이트다. 상한 ${MAX_PAYLOAD_BYTES}을 넘는다`)
  }

  ensureApp()
  return getMessaging().send(
    {
      topic: NOTICE_TOPIC,
      notification: { title: notice.title, body: notice.body },
      data: toPushData(notice),
      android: { priority: 'high' },
      apns: { payload: { aps: { sound: 'default' } } },
    },
    dryRun,
  )
}
