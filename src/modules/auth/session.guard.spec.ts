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
  const sessions = { findByHash: jest.fn(), touch: jest.fn() }
  const guard = new SessionGuard(sessions as unknown as SessionsRepository)

  beforeEach(() => {
    sessions.findByHash.mockReset()
    sessions.touch.mockReset()
  })

  // 세션 가드만 거치는 경로(프렌즈 스트림 · 로그아웃)도 세션을 쓴 것이다. 안 고치면 그 경로만 쓰는 세션이 쓰지 않는 세션으로 보인다.
  it('Bearer 세션이 있으면 통과시키고 request.session 에 실으며, 그 세션을 마지막으로 쓴 시각을 고친다', async () => {
    sessions.findByHash.mockResolvedValue({ id: 'sid', userId: 'uid', platform: 'ios' })
    const request: Partial<SessionRequest> = { headers: { authorization: 'Bearer VALUE' } }

    expect(await guard.canActivate(contextOf(request))).toBe(true)
    expect(sessions.findByHash).toHaveBeenCalledWith(sha256('VALUE'))
    expect(sessions.touch).toHaveBeenCalledWith('sid')
    expect(request.session).toEqual({ id: 'sid', userId: 'uid', platform: 'ios' })
  })

  it('헤더가 없으면 401 이다', async () => {
    await expect(guard.canActivate(contextOf({ headers: {} }))).rejects.toBeInstanceOf(
      UnauthorizedException,
    )
    expect(sessions.findByHash).not.toHaveBeenCalled()
  })

  it('모르는 값이면 401 이고 아무 세션의 시각도 고치지 않는다', async () => {
    sessions.findByHash.mockResolvedValue(null)

    await expect(
      guard.canActivate(contextOf({ headers: { authorization: 'Bearer nope' } })),
    ).rejects.toBeInstanceOf(UnauthorizedException)
    expect(sessions.touch).not.toHaveBeenCalled()
  })
})
