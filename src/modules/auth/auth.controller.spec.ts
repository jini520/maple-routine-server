import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import { Test } from '@nestjs/testing'

import { AuthController } from './auth.controller'
import { AuthService } from './auth.service'
import { SessionsRepository } from './sessions.repository'

describe('AuthController', () => {
  let app: NestFastifyApplication
  const auth = {
    start: jest.fn(),
    callback: jest.fn(),
    redeem: jest.fn(),
    logout: jest.fn().mockResolvedValue(undefined),
  }
  const sessions = { findByHash: jest.fn() }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: auth },
        { provide: SessionsRepository, useValue: sessions },
      ],
    }).compile()
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter())
    await app.init()
    await app.getHttpAdapter().getInstance().ready()
  })
  afterAll(() => app.close())
  beforeEach(() => {
    auth.start.mockReset()
    auth.callback.mockReset()
    auth.redeem.mockReset()
    sessions.findByHash.mockReset()
  })

  it('POST /v1/auth/nexon/login 은 platform 을 검사하고 authorizeUrl 과 redeemKey 를 돌려준다', async () => {
    auth.start.mockResolvedValue({ authorizeUrl: 'https://n/x', redeemKey: 'RK' })

    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/nexon/login',
      payload: { platform: 'ios' },
    })

    expect(res.statusCode).toBe(201)
    expect(res.json()).toEqual({ authorizeUrl: 'https://n/x', redeemKey: 'RK' })
    expect(res.headers['cache-control']).toBe('no-store')
    expect(auth.start).toHaveBeenCalledWith('ios')
  })

  it('platform 이 이상하면 400 이다', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/nexon/login',
      payload: { platform: 'web' },
    })

    expect(res.statusCode).toBe(400)
    expect(auth.start).not.toHaveBeenCalled()
  })

  it('GET /v1/auth/nexon/callback 은 서비스가 준 주소로 302 한다', async () => {
    auth.callback.mockResolvedValue('com.mapleroutine.app://oauth/callback?receipt=R')

    const res = await app.inject({ method: 'GET', url: '/v1/auth/nexon/callback?code=C&state=S' })

    expect(res.statusCode).toBe(302)
    expect(res.headers.location).toBe('com.mapleroutine.app://oauth/callback?receipt=R')
    expect(res.headers['cache-control']).toBe('no-store')
    expect(auth.callback).toHaveBeenCalledWith({ code: 'C', state: 'S' })
  })

  it('서비스가 던져도 302 다', async () => {
    auth.callback.mockRejectedValue(new Error('db down'))

    const res = await app.inject({ method: 'GET', url: '/v1/auth/nexon/callback?code=C&state=S' })

    expect(res.statusCode).toBe(302)
    expect(res.headers.location).toBe('com.mapleroutine.app://oauth/callback')
  })

  it('GET /app/oauth/return 은 HTML 을 내고 receipt 를 본문에 적지 않는다', async () => {
    const res = await app.inject({ method: 'GET', url: '/app/oauth/return?receipt=SECRET' })

    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toContain('text/html')
    expect(res.body).toContain('intent://oauth/callback')
    expect(res.body).not.toContain('SECRET')
  })

  it('POST /v1/auth/nexon/session 은 결과의 status 를 그대로 내고 gone 은 404 다', async () => {
    auth.redeem.mockResolvedValueOnce({ status: 'ok', session: 'S' })
    const ok = await app.inject({
      method: 'POST',
      url: '/v1/auth/nexon/session',
      payload: { redeemKey: 'a', receipt: 'b' },
    })
    expect(ok.statusCode).toBe(201)
    expect(ok.json()).toEqual({ status: 'ok', session: 'S' })

    auth.redeem.mockResolvedValueOnce({ status: 'pending' })
    const pending = await app.inject({
      method: 'POST',
      url: '/v1/auth/nexon/session',
      payload: { redeemKey: 'a', receipt: 'b' },
    })
    expect(pending.json()).toEqual({ status: 'pending' })

    auth.redeem.mockResolvedValueOnce({ status: 'gone' })
    const gone = await app.inject({
      method: 'POST',
      url: '/v1/auth/nexon/session',
      payload: { redeemKey: 'a', receipt: 'b' },
    })
    expect(gone.statusCode).toBe(404)
  })

  it('DELETE /v1/auth/nexon/session 은 Bearer 가 있어야 하고 204 를 낸다', async () => {
    const noAuth = await app.inject({ method: 'DELETE', url: '/v1/auth/nexon/session' })
    expect(noAuth.statusCode).toBe(401)

    sessions.findByHash.mockResolvedValue({ id: 'sid', userId: 'uid', platform: 'ios' })
    const res = await app.inject({
      method: 'DELETE',
      url: '/v1/auth/nexon/session',
      headers: { authorization: 'Bearer VALUE' },
    })
    expect(res.statusCode).toBe(204)
    expect(auth.logout).toHaveBeenCalledWith('VALUE')
  })
})
