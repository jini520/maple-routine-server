import { Module } from '@nestjs/common'

import { IdentityModule } from '../identity/identity.module'
import { SyncClearRepository } from './clear.repository'
import { DeletedRowsPurgeJob } from './deleted-rows.purge.job'
import { DeletedRowsRepository } from './deleted-rows.repository'
import { SyncPullRepository } from './pull.repository'
import { SyncPushRepository } from './push.repository'
import { SyncController } from './sync.controller'

/** 기기 간 기록 동기화의 받기 · 올리기 · 데이터 삭제와 오래된 삭제 표식 지우기. 신원은 identity 의 가드가 가린다. */
@Module({
  imports: [IdentityModule],
  controllers: [SyncController],
  providers: [
    SyncPullRepository,
    SyncPushRepository,
    SyncClearRepository,
    DeletedRowsRepository,
    DeletedRowsPurgeJob,
  ],
})
export class SyncModule {}
