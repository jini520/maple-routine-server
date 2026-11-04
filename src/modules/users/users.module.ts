import { Module } from '@nestjs/common'

import { AccountDeletionJob } from './account-deletion.job'
import { UsersRepository } from './users.repository'

/** 사용자. 넥슨 uid 나 API 키 해시로 가린다. 계정 삭제는 예약 칸으로 들고, 유예가 끝나면 밤 일이 지운다. */
@Module({
  providers: [UsersRepository, AccountDeletionJob],
  exports: [UsersRepository],
})
export class UsersModule {}
