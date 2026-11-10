import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import { Test } from '@nestjs/testing'

import { SessionsRepository } from '../auth/sessions.repository'
import { IdentityGuard } from '../identity/identity.guard'
import { UsersRepository } from '../users/users.repository'
import { UsageEventsController } from './usage-events.controller'
import { UsageEventsRepository } from './usage-events.repository'

const screen = { type: 'screen', name: 'Boss', durationMs: 4200, at: '2026-11-03T10:00:00.000Z' }
const batch = { platform: 'ios', appVersion: '1.0.13', events: [screen] }

describe('UsageEventsController', () => {
  let app: NestFastifyApplication
  const sessions = { findByHash: jest.fn() }
  const users = {
    upsertByApiKeyHash: jest.fn(),
    findLoginAccount: jest.fn().mockResolvedValue({ nexonAccountId: 'a1' }),
    deletionRequestedAt: jest.fn().mockResolvedValue(null),
  }
  const events = { insert: jest.fn() }
  const bearer = { authorization: 'Bearer S' }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [UsageEventsController],
      providers: [
        IdentityGuard,
        { provide: SessionsRepository, useValue: sessions },
        { provide: UsersRepository, useValue: users },
        { provide: UsageEventsRepository, useValue: events },
      ],
    }).compile()
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter())
    await app.init()
    await app.getHttpAdapter().getInstance().ready()
  })
  afterAll(() => app.close())
  beforeEach(() => {
    sessions.findByHash.mockReset().mockResolvedValue({ id: 'sid', userId: 'u1', platform: 'ios' })
    events.insert.mockReset().mockResolvedValue(undefined)
  })

  const post = (payload: unknown, headers: Record<string, string> = bearer) =>
    app.inject({ method: 'POST', url: '/v1/usage-events', headers, payload: payload as object })

  it('신원이 없으면 401 이고 적지 않는다', async () => {
    const res = await post(batch, {})

    expect(res.statusCode).toBe(401)
    expect(events.insert).not.toHaveBeenCalled()
  })

  it('묶음의 플랫폼 · 버전과 신원을 더해 적는다', async () => {
    const res = await post(batch)

    expect(res.statusCode).toBe(200)
    expect(events.insert).toHaveBeenCalledWith(
      { userId: 'u1', identifiedBy: 'login', platform: 'ios', appVersion: '1.0.13' },
      [{ type: 'screen', name: 'Boss', durationMs: 4200, at: new Date(screen.at) }],
    )
  })

  // 모르는 종류를 받으면 운영자가 뜻을 모르는 줄이 쌓인다. 앱은 실패를 버리므로 이 묶음만 사라진다.
  it('모르는 종류는 400 이다', async () => {
    const res = await post({ ...batch, events: [{ ...screen, type: 'tap' }] })

    expect(res.statusCode).toBe(400)
    expect(events.insert).not.toHaveBeenCalled()
  })

  // 앱이 화면을 더하거나 이름을 바꿀 때마다 서버를 먼저 배포하지 않아도 되게 이름은 목록으로 거르지 않는다.
  it('처음 보는 화면 이름도 받는다', async () => {
    const res = await post({ ...batch, events: [{ ...screen, name: 'BrandNewScreen' }] })

    expect(res.statusCode).toBe(200)
  })
})
