import type { AttemptsRepository } from './attempts.repository'
import { CleanupJob } from './cleanup.job'
import type { SessionsRepository } from './sessions.repository'

describe('CleanupJob', () => {
  it('run 은 짝 청소와 만료 세션 청소를 둘 다 부른다', async () => {
    const attempts = { sweep: jest.fn().mockResolvedValue({ orphanSessions: 1 }) }
    const sessions = { deleteExpired: jest.fn().mockResolvedValue(2) }
    const job = new CleanupJob(
      attempts as unknown as AttemptsRepository,
      sessions as unknown as SessionsRepository,
    )

    await job.run()

    expect(attempts.sweep).toHaveBeenCalledTimes(1)
    expect(sessions.deleteExpired).toHaveBeenCalledTimes(1)
  })
})
