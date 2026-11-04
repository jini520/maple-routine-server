import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'

import { UsageEventsRepository } from './usage-events.repository'

/** 사용 로그를 남기는 날 수. 처리방침에 적은 값이라 바꾸면 처리방침도 고친다. */
export const USAGE_RETENTION_DAYS = 180

/** 매일 새벽 사용 로그에서 보관 기간이 지난 줄을 지운다. */
@Injectable()
export class UsageEventsPurgeJob {
  private readonly logger = new Logger(UsageEventsPurgeJob.name)

  constructor(private readonly events: UsageEventsRepository) {}

  @Cron('0 30 4 * * *', { name: 'usage-events-purge', timeZone: 'Asia/Seoul' })
  async run(): Promise<void> {
    const cutoff = new Date(Date.now() - USAGE_RETENTION_DAYS * 86_400_000)
    const deleted = await this.events.deleteBefore(cutoff)
    if (deleted > 0) this.logger.log(`사용 로그 ${deleted}줄을 지웠다`)
  }
}
