import { Module } from '@nestjs/common'

import { FcmClient } from './fcm.client'
import { NexonBucket } from './nexon-bucket'
import { NexonFriendsClient } from './nexon-friends.client'
import { NexonOpenApiClient } from './nexon-open-api.client'
import { NexonOpenIdClient } from './nexon-open-id.client'

/** 바깥 세상으로 나가는 문 다섯. 서비스는 이 모듈의 클라이언트로만 넥슨과 FCM 을 부른다. */
@Module({
  providers: [NexonOpenApiClient, NexonOpenIdClient, NexonFriendsClient, NexonBucket, FcmClient],
  exports: [NexonOpenApiClient, NexonOpenIdClient, NexonFriendsClient, NexonBucket, FcmClient],
})
export class ClientsModule {}
