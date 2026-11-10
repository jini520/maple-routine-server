import { Module } from '@nestjs/common'

import { AccountDeletionJob } from './account-deletion.job'
import { NexonAccountsRepository } from './nexon-accounts.repository'
import { UsersRepository } from './users.repository'

/**
 * 사용자와 넥슨 계정. 넥슨 계정은 넥슨 uid 나 API 키 해시로 찾고, 같은 넥슨 ID 인지는 메이플 ID 로 가린다. 계정 삭제는 예약
 * 칸으로 들고, 유예가 끝나면 밤 일이 지운다.
 */
@Module({
  providers: [UsersRepository, NexonAccountsRepository, AccountDeletionJob],
  exports: [UsersRepository, NexonAccountsRepository],
})
export class UsersModule {}
