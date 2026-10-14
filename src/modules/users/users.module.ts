import { Module } from '@nestjs/common'

import { UsersRepository } from './users.repository'

/** 사용자. 넥슨 uid 나 API 키 해시로 가린다. 탈퇴는 칸으로 든다. */
@Module({
  providers: [UsersRepository],
  exports: [UsersRepository],
})
export class UsersModule {}
