import type { ConfigService } from '@nestjs/config'

import type { Env } from '../config/env.schema'
import { FcmClient, toFcmPayload } from './fcm.client'

describe('FcmClient', () => {
  it('FCM_KEY 가 없으면 enabled 가 거짓이고 send 가 던진다', async () => {
    const client = new FcmClient({ get: () => undefined } as unknown as ConfigService<Env, true>)

    expect(client.enabled).toBe(false)
    await expect(
      client.send({ topic: 'notice', notification: { title: 't', body: 'b' }, data: {} }),
    ).rejects.toThrow('FCM_KEY')
  })

  it('iOS 가 무음으로 띄우지 않게 APNs 소리를 싣는다', () => {
    const payload = toFcmPayload({ topic: 'notice', notification: { title: 't', body: 'b' }, data: {} })

    expect(payload.apns?.payload?.aps.sound).toBe('default')
  })
})
