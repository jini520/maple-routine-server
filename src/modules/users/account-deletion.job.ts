import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'

import { UsersRepository } from './users.repository'

/** 계정 삭제 유예 날 수. 처리방침 · 문의 페이지 · 심사 메모에 적은 값이라 바꾸면 그 셋도 고친다. */
export const ACCOUNT_DELETION_GRACE_DAYS = 30

/** 매일 새벽 유예가 끝난 계정을 지운다. */
@Injectable()
export class AccountDeletionJob {
  private readonly logger = new Logger(AccountDeletionJob.name)

  constructor(private readonly users: UsersRepository) {}

  @Cron('0 40 4 * * *', { name: 'account-deletion', timeZone: 'Asia/Seoul' })
  async run(): Promise<void> {
    const cutoff = new Date(Date.now() - ACCOUNT_DELETION_GRACE_DAYS * 86_400_000)
    const deleted = await this.users.purgeDeletionsBefore(cutoff)
    if (deleted > 0) this.logger.log(`계정 ${deleted}개를 지웠다`)
  }
}
