import { ForbiddenException, type ExecutionContext } from '@nestjs/common'
import { Reflector } from '@nestjs/core'

import { sha256 } from '../../common/hash'
import type { SessionsRepository } from '../auth/sessions.repository'
import type { UsersRepository } from '../users/users.repository'
import { ALLOW_DELETION_PENDING, IdentityGuard, type IdentityRequest } from './identity.guard'

const HEX = 'ab'.repeat(32)

function build() {
  const sessions = { findByHash: jest.fn(), touch: jest.fn() }
  const users = {
    upsertByMapleId: jest.fn(),
    findLoginAccount: jest.fn().mockResolvedValue({ nexonAccountId: 'a1' }),
    deletionRequestedAt: jest.fn().mockResolvedValue(null),
  }
  const guard = new IdentityGuard(
    sessions as unknown as SessionsRepository,
    users as unknown as UsersRepository,
    new Reflector(),
  )
  return { guard, sessions, users }
}

function contextOf(
  headers: Record<string, string>,
  allowDeletionPending = false,
): {
  context: ExecutionContext
  request: IdentityRequest
} {
  const request = { headers } as unknown as IdentityRequest
  const handler = () => undefined
  if (allowDeletionPending) Reflect.defineMetadata(ALLOW_DELETION_PENDING, true, handler)
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => handler,
    getClass: () => class {},
  } as unknown as ExecutionContext
  return { context, request }
}

describe('IdentityGuard', () => {
  // 마지막으로 쓴 시각이 남아야 오래 쓰지 않은 세션을 운영에서 가려낼 수 있다.
  it('Bearer 세션이 살아 있으면 login 신원이고, 그 세션을 쓴 시각을 고친다', async () => {
    const { guard, sessions, users } = build()
    sessions.findByHash.mockResolvedValue({ id: 'sid', userId: 'u1', platform: 'ios' })
    const { context, request } = contextOf({ authorization: 'Bearer S' })

    await expect(guard.canActivate(context)).resolves.toBe(true)

    expect(sessions.findByHash).toHaveBeenCalledWith(sha256('S'))
    expect(request.identity).toEqual({ userId: 'u1', source: 'login', nexonAccountId: 'a1' })
    expect(users.findLoginAccount).toHaveBeenCalledWith('u1')
    expect(sessions.touch).toHaveBeenCalledWith('sid')
    expect(users.upsertByMapleId).not.toHaveBeenCalled()
  })

  // 세션은 로그인 콜백이 로그인 계정 줄을 만든 뒤에만 생긴다. 줄이 없으면 그 세션으로 적을 넥슨 계정이 없다.
  it('세션의 사람에게 로그인 계정 줄이 없으면 401 이다', async () => {
    const { guard, sessions, users } = build()
    sessions.findByHash.mockResolvedValue({ id: 'sid', userId: 'u1', platform: 'ios' })
    users.findLoginAccount.mockResolvedValue(null)
    const { context } = contextOf({ authorization: 'Bearer S' })

    await expect(guard.canActivate(context)).rejects.toThrow('Unauthorized')
  })

  it('세션이 죽었으면 메이플 ID 해시가 함께 와도 401 이다', async () => {
    const { guard, sessions, users } = build()
    sessions.findByHash.mockResolvedValue(null)
    const { context } = contextOf({ authorization: 'Bearer DEAD', 'x-maple-id-hash': HEX })

    await expect(guard.canActivate(context)).rejects.toMatchObject({ status: 401 })
    expect(users.upsertByMapleId).not.toHaveBeenCalled()
  })

  it('둘이 다 오면 세션이 이기고 메이플 ID 해시는 안 읽는다', async () => {
    const { guard, sessions, users } = build()
    sessions.findByHash.mockResolvedValue({ id: 'sid', userId: 'u1', platform: 'ios' })
    const { context, request } = contextOf({ authorization: 'Bearer S', 'x-maple-id-hash': HEX })

    await guard.canActivate(context)

    expect(request.identity?.source).toBe('login')
    expect(users.upsertByMapleId).not.toHaveBeenCalled()
  })

  // 키는 다시 받으면 바뀌지만 메이플 ID 는 바뀌지 않는다.
  it('메이플 ID 해시만 오면 그 메이플 ID 의 계정을 찾거나 만들고 key 신원이다', async () => {
    const { guard, sessions, users } = build()
    users.upsertByMapleId.mockResolvedValue({ id: 'u2', nexonAccountId: 'a2' })
    const { context, request } = contextOf({ 'x-maple-id-hash': HEX })

    await expect(guard.canActivate(context)).resolves.toBe(true)

    expect(users.upsertByMapleId).toHaveBeenCalledWith(HEX)
    expect(request.identity).toEqual({ userId: 'u2', source: 'key', nexonAccountId: 'a2' })
    expect(sessions.findByHash).not.toHaveBeenCalled()
  })

  // 키 해시는 1.0.14 까지의 앱만 보낸다. 1.0.15 서버가 그 앱을 받지 않는다.
  it('둘 다 없거나, 해시 모양이 틀리거나, 키 해시만 오면 401 이다', async () => {
    const { guard, users } = build()
    const cases: Record<string, string>[] = [
      {},
      { 'x-maple-id-hash': HEX.toUpperCase() },
      { 'x-maple-id-hash': HEX.slice(1) },
      { 'x-maple-id-hash': 'live_' + 'x'.repeat(59) },
      { 'x-api-key-hash': HEX },
      { authorization: 'Basic abc' },
    ]
    for (const headers of cases) {
      await expect(guard.canActivate(contextOf(headers).context)).rejects.toMatchObject({
        status: 401,
      })
    }
    expect(users.upsertByMapleId).not.toHaveBeenCalled()
  })

  // 앱이 메인 계정의 기기 id 를 쓰기마다 싣는다. 따로 등록하는 호출이 없어 앱이 등록했는지 기억할 필요가 없다.
  describe('삭제 예약', () => {
    // 지울 사람에게 새 기록이 붙으면 30일 뒤 익명 표본에 섞여 남는다.
    it('예약된 사람의 쓰기는 403 account_deletion_pending 이다', async () => {
      const { guard, sessions, users } = build()
      sessions.findByHash.mockResolvedValue({ id: 'sid', userId: 'u1', platform: 'ios' })
      users.deletionRequestedAt.mockResolvedValue(new Date('2026-11-04T00:00:00Z'))
      const { context } = contextOf({ authorization: 'Bearer S' })

      const thrown = await guard.canActivate(context).catch((error: unknown) => error)

      expect(thrown).toBeInstanceOf(ForbiddenException)
      expect((thrown as ForbiddenException).getResponse()).toEqual(
        expect.objectContaining({ code: 'account_deletion_pending' }),
      )
    })

    it('예약을 묻고 취소하는 경로는 지난다', async () => {
      const { guard, sessions, users } = build()
      sessions.findByHash.mockResolvedValue({ id: 'sid', userId: 'u1', platform: 'ios' })
      users.deletionRequestedAt.mockResolvedValue(new Date('2026-11-04T00:00:00Z'))
      const { context, request } = contextOf({ authorization: 'Bearer S' }, true)

      await expect(guard.canActivate(context)).resolves.toBe(true)
      expect(request.identity?.userId).toBe('u1')
    })
  })
})
