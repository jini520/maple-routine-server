import { Module } from '@nestjs/common'

import { ClientsModule } from '../../clients/clients.module'
import { AuthModule } from '../auth/auth.module'
import { FriendsController } from './friends.controller'
import { FriendsService } from './friends.service'
import { RunSlots } from './run-slots'

/** 프렌즈 조회. 작업 목록을 받아 넥슨을 돌며 NDJSON 으로 흘린다. 표가 없고 세션과 토큰은 AuthModule 것을 쓴다. */
@Module({
  imports: [AuthModule, ClientsModule],
  controllers: [FriendsController],
  providers: [FriendsService, RunSlots],
})
export class FriendsModule {}
