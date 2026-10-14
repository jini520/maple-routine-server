import { type ExecutionContext, UnauthorizedException } from '@nestjs/common'

import { sha256 } from '../../common/hash'
import { SessionGuard, type SessionRequest } from './session.guard'
import type { SessionsRepository } from './sessions.repository'

function contextOf(request: Partial<SessionRequest>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext
}

describe('SessionGuard', () => {
  const sessions = { findByHash: jest.fn() }
  const guard = new SessionGuard(sessions as unknown as SessionsRepository)

  beforeEach(() => sessions.findByHash.mockReset())

  it('Bearer 세션이 있으면 통과시키고 request.session 에 싣는다', async () => {
    sessions.findByHash.mockResolvedValue({ id: 'sid', userId: 'uid', platform: 'ios' })
    const request: Partial<SessionRequest> = { headers: { authorization: 'Bearer VALUE' } }

    expect(await guard.canActivate(contextOf(request))).toBe(true)
    expect(sessions.findByHash).toHaveBeenCalledWith(sha256('VALUE'))
    expect(request.session).toEqual({ id: 'sid', userId: 'uid', platform: 'ios' })
  })

  it('헤더가 없으면 401 이다', async () => {
    await expect(guard.canActivate(contextOf({ headers: {} }))).rejects.toBeInstanceOf(
      UnauthorizedException,
    )
    expect(sessions.findByHash).not.toHaveBeenCalled()
  })

  it('모르는 값이면 401 이다', async () => {
    sessions.findByHash.mockResolvedValue(null)

    await expect(
      guard.canActivate(contextOf({ headers: { authorization: 'Bearer nope' } })),
    ).rejects.toBeInstanceOf(UnauthorizedException)
  })
})
