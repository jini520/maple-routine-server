import type { ExecutionContext } from '@nestjs/common'

import { sha256 } from '../../common/hash'
import type { SessionsRepository } from '../auth/sessions.repository'
import type { UsersRepository } from '../users/users.repository'
import { IdentityGuard, type IdentityRequest } from './identity.guard'

const HEX = 'ab'.repeat(32)

function build() {
  const sessions = { findByHash: jest.fn() }
  const users = { upsertByApiKeyHash: jest.fn() }
  const guard = new IdentityGuard(
    sessions as unknown as SessionsRepository,
    users as unknown as UsersRepository,
  )
  return { guard, sessions, users }
}

function contextOf(headers: Record<string, string>): {
  context: ExecutionContext
  request: IdentityRequest
} {
  const request = { headers } as unknown as IdentityRequest
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext
  return { context, request }
}

describe('IdentityGuard', () => {
  it('Bearer 세션이 살아 있으면 login 신원이다', async () => {
    const { guard, sessions, users } = build()
    sessions.findByHash.mockResolvedValue({ id: 'sid', userId: 'u1', platform: 'ios' })
    const { context, request } = contextOf({ authorization: 'Bearer S' })

    await expect(guard.canActivate(context)).resolves.toBe(true)

    expect(sessions.findByHash).toHaveBeenCalledWith(sha256('S'))
    expect(request.identity).toEqual({ userId: 'u1', source: 'login' })
    expect(users.upsertByApiKeyHash).not.toHaveBeenCalled()
  })

  it('세션이 죽었으면 키 해시가 함께 와도 401 이다', async () => {
    const { guard, sessions, users } = build()
    sessions.findByHash.mockResolvedValue(null)
    const { context } = contextOf({ authorization: 'Bearer DEAD', 'x-api-key-hash': HEX })

    await expect(guard.canActivate(context)).rejects.toMatchObject({ status: 401 })
    expect(users.upsertByApiKeyHash).not.toHaveBeenCalled()
  })

  it('둘이 다 오면 세션이 이기고 키는 안 읽는다', async () => {
    const { guard, sessions, users } = build()
    sessions.findByHash.mockResolvedValue({ id: 'sid', userId: 'u1', platform: 'ios' })
    const { context, request } = contextOf({ authorization: 'Bearer S', 'x-api-key-hash': HEX })

    await guard.canActivate(context)

    expect(request.identity?.source).toBe('login')
    expect(users.upsertByApiKeyHash).not.toHaveBeenCalled()
  })

  it('키 해시만 오면 한 번 더 해시해 사람을 찾거나 만들고 key 신원이다', async () => {
    const { guard, sessions, users } = build()
    users.upsertByApiKeyHash.mockResolvedValue({ id: 'u2' })
    const { context, request } = contextOf({ 'x-api-key-hash': HEX })

    await expect(guard.canActivate(context)).resolves.toBe(true)

    expect(users.upsertByApiKeyHash).toHaveBeenCalledWith(sha256(HEX))
    expect(request.identity).toEqual({ userId: 'u2', source: 'key' })
    expect(sessions.findByHash).not.toHaveBeenCalled()
  })

  it('둘 다 없거나 해시 모양이 틀리면 401 이다', async () => {
    const { guard, users } = build()
    const cases: Record<string, string>[] = [
      {},
      { 'x-api-key-hash': HEX.toUpperCase() },
      { 'x-api-key-hash': HEX.slice(1) },
      { 'x-api-key-hash': 'live_' + 'x'.repeat(59) },
      { authorization: 'Basic abc' },
    ]
    for (const headers of cases) {
      await expect(guard.canActivate(contextOf(headers).context)).rejects.toMatchObject({
        status: 401,
      })
    }
    expect(users.upsertByApiKeyHash).not.toHaveBeenCalled()
  })
})
