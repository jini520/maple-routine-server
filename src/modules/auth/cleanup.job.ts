import { Injectable, Logger } from '@nestjs/common'
import { Interval } from '@nestjs/schedule'

import { AttemptsRepository } from './attempts.repository'
import { SessionsRepository } from './sessions.repository'

/** 봉한 원본이 DB 에 남는 시간은 이 간격까지다. 1분이면 최악 3분, 1시간이면 최악 70분이다. */
export const CLEANUP_INTERVAL_MS = 60_000

/**
 * 1분마다 죽은 짝과 고아 세션, 만료된 세션을 걷는다.
 *
 * 벽시계가 아니라 간격인 이유는 표가 작아 새벽을 맞출 복잡도를 살 이유가 없어서다. 앱 박스가
 * 하나이고 두 문장은 겹쳐 돌아도 무해하다.
 */
@Injectable()
export class CleanupJob {
  private readonly logger = new Logger(CleanupJob.name)

  constructor(
    private readonly attempts: AttemptsRepository,
    private readonly sessions: SessionsRepository,
  ) {}

  @Interval(CLEANUP_INTERVAL_MS)
  async run(): Promise<void> {
    const { orphanSessions } = await this.attempts.sweep()
    const expiredSessions = await this.sessions.deleteExpired()
    if (orphanSessions > 0 || expiredSessions > 0) {
      this.logger.log(`청소: 고아 세션 ${orphanSessions} · 만료 세션 ${expiredSessions}`)
    }
  }
}
