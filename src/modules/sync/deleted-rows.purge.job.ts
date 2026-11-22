import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'

import { DeletedRowsRepository } from './deleted-rows.repository'

/** 삭제 표식이 선 줄을 남기는 날 수. 이보다 오래 받지 않은 기기는 그 주인의 기록을 비우고 0 부터 다시 받는다. */
export const DELETED_ROW_RETENTION_DAYS = 180

/** 매일 새벽 표식이 선 지 보관 기간이 지난 기록 줄을 지운다. */
@Injectable()
export class DeletedRowsPurgeJob {
  private readonly logger = new Logger(DeletedRowsPurgeJob.name)

  constructor(private readonly rows: DeletedRowsRepository) {}

  @Cron('0 50 4 * * *', { name: 'deleted-rows-purge', timeZone: 'Asia/Seoul' })
  async run(): Promise<void> {
    const cutoff = new Date(Date.now() - DELETED_ROW_RETENTION_DAYS * 86_400_000)
    const deleted = await this.rows.purgeBefore(cutoff)
    if (deleted > 0) this.logger.log(`삭제 표식이 선 기록 ${deleted}줄을 지웠다`)
  }
}
