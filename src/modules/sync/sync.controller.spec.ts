import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import { Test } from '@nestjs/testing'

import { sha256Hex } from '../../common/hash'
import { SessionsRepository } from '../auth/sessions.repository'
import { IdentityGuard } from '../identity/identity.guard'
import { UsersRepository } from '../users/users.repository'
import { SyncClearRepository } from './clear.repository'
import { SyncPullRepository } from './pull.repository'
import { SyncPushRepository } from './push.repository'
import { PUSH_RECORD_LIMIT } from './sync.dto'
import { SyncController } from './sync.controller'

const IDENTITY = { userId: 'u1', source: 'login', nexonAccountId: 'a1' }

describe('SyncController', () => {
  let app: NestFastifyApplication
  const sessions = { findByHash: jest.fn(), touch: jest.fn() }
  const users = {
    upsertByMapleId: jest.fn(),
    findLoginAccount: jest.fn().mockResolvedValue({ nexonAccountId: 'a1' }),
    deletionRequestedAt: jest.fn(),
  }
  const pulls = { pull: jest.fn() }
  const pushes = { push: jest.fn() }
  const clears = { clear: jest.fn() }
  const bearer = { authorization: 'Bearer S' }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [SyncController],
      providers: [
        IdentityGuard,
        { provide: SessionsRepository, useValue: sessions },
        { provide: UsersRepository, useValue: users },
        { provide: SyncPullRepository, useValue: pulls },
        { provide: SyncPushRepository, useValue: pushes },
        { provide: SyncClearRepository, useValue: clears },
      ],
    }).compile()
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter())
    await app.init()
    await app.getHttpAdapter().getInstance().ready()
  })
  afterAll(() => app.close())
  beforeEach(() => {
    sessions.findByHash.mockReset().mockResolvedValue({ id: 'sid', userId: 'u1', platform: 'ios' })
    users.deletionRequestedAt.mockReset().mockResolvedValue(null)
    pulls.pull.mockReset().mockResolvedValue({ records: {} })
    pushes.push.mockReset().mockResolvedValue([])
    clears.clear.mockReset().mockResolvedValue(undefined)
  })

  it('신원이 없으면 세 경로 모두 401 이고 읽거나 적지 않는다', async () => {
    const codes = await Promise.all(
      ['pull', 'push', 'clear'].map(
        async (path) =>
          (await app.inject({ method: 'POST', url: `/v1/sync/${path}`, payload: {} })).statusCode,
      ),
    )

    expect(codes).toEqual([401, 401, 401])
    expect([pulls.pull, pushes.push, clears.clear].some((fn) => fn.mock.calls.length > 0)).toBe(
      false,
    )
  })

  // 지울 사람에게 새 기록이 붙으면 30일 뒤 지울 때 다른 기기에 받은 기록이 남는다.
  it('계정 삭제를 예약한 사람은 account_deletion_pending 으로 403 이다', async () => {
    users.deletionRequestedAt.mockResolvedValue(new Date())

    const res = await app.inject({
      method: 'POST',
      url: '/v1/sync/push',
      headers: bearer,
      payload: { records: [{}] },
    })

    expect([res.statusCode, res.json<{ code: string }>().code]).toEqual([
      403,
      'account_deletion_pending',
    ])
  })

  // 기록마다 따로 검사해 틀린 한 건이 나머지를 막지 않는다. 요청 전체를 거절하는 것은 배열의 길이뿐이다.
  it('올리기는 기록 배열을 그대로 넘기고, 배열이 비었거나 상한을 넘으면 400 이다', async () => {
    const records = [{ table: 'bossDrops', action: 'upsert', row: { id: 'not-a-uuid' } }]
    pushes.push.mockResolvedValue([{ recordId: null, ok: false, code: null, reason: '틀렸다' }])

    const ok = await app.inject({
      method: 'POST',
      url: '/v1/sync/push',
      headers: bearer,
      payload: { records },
    })
    const empty = await app.inject({
      method: 'POST',
      url: '/v1/sync/push',
      headers: bearer,
      payload: { records: [] },
    })
    const tooMany = await app.inject({
      method: 'POST',
      url: '/v1/sync/push',
      headers: bearer,
      payload: { records: Array.from({ length: PUSH_RECORD_LIMIT + 1 }, () => ({})) },
    })

    expect([ok.statusCode, empty.statusCode, tooMany.statusCode]).toEqual([200, 400, 400])
    expect(pushes.push).toHaveBeenCalledWith(IDENTITY, records)
    expect(ok.json<{ results: unknown[] }>().results).toHaveLength(1)
  })

  // 번호는 메이플 ID 해시마다다. 원문이 실려 오면 서버에 넥슨 식별자 원문이 닿는다.
  it('받기는 번호를 메이플 ID 해시마다 받고, 해시가 아닌 열쇠는 400 이다', async () => {
    const hash = sha256Hex('m1')

    const ok = await app.inject({
      method: 'POST',
      url: '/v1/sync/pull',
      headers: bearer,
      payload: { cursors: { mapleIds: { [hash]: 3 } } },
    })
    const raw = await app.inject({
      method: 'POST',
      url: '/v1/sync/pull',
      headers: bearer,
      payload: { cursors: { mapleIds: { m1: 3 } } },
    })

    expect([ok.statusCode, raw.statusCode]).toEqual([200, 400])
    expect(pulls.pull).toHaveBeenCalledWith(IDENTITY, { cursors: { mapleIds: { [hash]: 3 } } })
  })

  it('데이터 삭제는 서버에 올리는 묶음 넷만 받고 204 다', async () => {
    const ok = await app.inject({
      method: 'POST',
      url: '/v1/sync/clear',
      headers: bearer,
      payload: { groups: ['boss', 'manual'] },
    })
    const cache = await app.inject({
      method: 'POST',
      url: '/v1/sync/clear',
      headers: bearer,
      payload: { groups: ['cache'] },
    })

    expect([ok.statusCode, cache.statusCode]).toEqual([204, 400])
    expect(clears.clear).toHaveBeenCalledWith(IDENTITY, ['boss', 'manual'])
  })
})
