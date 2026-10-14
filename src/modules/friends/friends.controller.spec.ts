import { ConfigService } from '@nestjs/config'
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import { Test } from '@nestjs/testing'
import { gunzipSync } from 'node:zlib'

import { NexonFriendsClient } from '../../clients/nexon-friends.client'
import type { Env } from '../../config/env.schema'
import { SessionGuard } from '../auth/session.guard'
import { SessionsRepository } from '../auth/sessions.repository'
import { ReloginRequired, TokenService } from '../auth/token.service'
import { FriendsController } from './friends.controller'
import { FriendsService } from './friends.service'
import { RunSlots } from './run-slots'

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const ENV: Partial<Env> = {
  FRIENDS_MAX_RUNS: 1,
  FRIENDS_FANOUT: 4,
  FRIENDS_RUN_DEADLINE_MS: 120_000,
  FRIENDS_RUN_BYTES: 16 * 1024 * 1024,
}

function lines(payload: Buffer): Record<string, unknown>[] {
  return gunzipSync(payload)
    .toString()
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as Record<string, unknown>)
}

describe('FriendsController', () => {
  let app: NestFastifyApplication
  let slots: RunSlots
  const sessions = { findByHash: jest.fn() }
  const tokens = { tokenFor: jest.fn() }
  const nexon = { page: jest.fn() }
  const bearer = { authorization: 'Bearer SESSION' }
  const body = { tasks: [{ kind: 'cube', date: '2026-10-01' }] }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [FriendsController],
      providers: [
        FriendsService,
        RunSlots,
        SessionGuard,
        { provide: ConfigService, useValue: { get: (key: keyof Env) => ENV[key] } },
        { provide: SessionsRepository, useValue: sessions },
        { provide: TokenService, useValue: tokens },
        { provide: NexonFriendsClient, useValue: nexon },
      ],
    }).compile()
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter())
    await app.init()
    await app.getHttpAdapter().getInstance().ready()
    slots = app.get(RunSlots)
  })
  afterAll(() => app.close())
  beforeEach(() => {
    sessions.findByHash.mockReset()
    sessions.findByHash.mockResolvedValue({ id: 'sid', userId: 'uid', platform: 'ios' })
    tokens.tokenFor.mockReset()
    tokens.tokenFor.mockResolvedValue('AT')
    nexon.page.mockReset()
  })

  it('Bearer 가 없으면 401 이다', async () => {
    const res = await app.inject({ method: 'POST', url: '/v1/friends/stream', payload: body })

    expect(res.statusCode).toBe(401)
    expect(nexon.page).not.toHaveBeenCalled()
  })

  it('tasks 가 틀리면 400 이다', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/friends/stream',
      headers: bearer,
      payload: { tasks: [{ kind: 'cube' }] },
    })

    expect(res.statusCode).toBe(400)
  })

  it('슬롯이 다 차면 503 과 Retry-After 30 이고 본문이 없다', async () => {
    const release = slots.tryAcquire()

    const res = await app.inject({
      method: 'POST',
      url: '/v1/friends/stream',
      headers: bearer,
      payload: body,
    })

    release?.()
    expect(res.statusCode).toBe(503)
    expect(res.headers['retry-after']).toBe('30')
    expect(res.body).toBe('')
    expect(tokens.tokenFor).not.toHaveBeenCalled()
  })

  it('토큰 갱신이 거절되면 401 이고 슬롯을 돌려준다', async () => {
    tokens.tokenFor.mockRejectedValue(new ReloginRequired('죽었다'))

    const res = await app.inject({
      method: 'POST',
      url: '/v1/friends/stream',
      headers: bearer,
      payload: body,
    })

    expect(res.statusCode).toBe(401)
    expect(nexon.page).not.toHaveBeenCalled()
    expect(slots.active).toBe(0)
  })

  it('200 은 NDJSON · gzip · X-Accel-Buffering: no 이고 page · done · end 줄이 온다', async () => {
    nexon.page.mockResolvedValue({
      status: 200,
      body: Buffer.from('{"count":1,"next_cursor":"","cube_history":[]}'),
    })

    const res = await app.inject({
      method: 'POST',
      url: '/v1/friends/stream',
      headers: bearer,
      payload: body,
    })

    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toBe('application/x-ndjson')
    expect(res.headers['content-encoding']).toBe('gzip')
    expect(res.headers['x-accel-buffering']).toBe('no')
    expect(res.headers['cache-control']).toBe('no-store')
    expect(lines(res.rawPayload)).toEqual([
      {
        t: 'page',
        kind: 'cube',
        date: '2026-10-01',
        n: 1,
        body: { count: 1, next_cursor: '', cube_history: [] },
      },
      { t: 'done', kind: 'cube', date: '2026-10-01', pages: 1 },
      { t: 'end', reason: 'done' },
    ])
    expect(nexon.page).toHaveBeenCalledWith(
      'ios',
      'AT',
      '/maplestory/v1/history/cube?count=1000&date=2026-10-01',
      expect.any(AbortSignal),
    )
    // 응답이 끝난 직후 슬롯을 돌려주므로 한 틱 뒤에 본다.
    await sleep(20)
    expect(slots.active).toBe(0)
  })

  it('앱이 끊으면 다음 쪽을 안 당기고 슬롯을 돌려준다', async () => {
    // inject 는 소켓이 없어 끊김을 못 낸다. 실제 포트로 열고 fetch 를 중간에 끊는다.
    await app.listen(0)
    const url = `${await app.getUrl()}/v1/friends/stream`
    nexon.page.mockImplementation(async () => {
      await sleep(30)
      return { status: 200, body: Buffer.from('{"next_cursor":"again"}') }
    })

    const ctrl = new AbortController()
    const res = await fetch(url, {
      method: 'POST',
      headers: { ...bearer, 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    })
    expect(res.status).toBe(200)
    const reader = res.body?.getReader()
    await reader?.read()
    ctrl.abort()

    await sleep(100)
    const calls = nexon.page.mock.calls.length
    await sleep(200)
    expect(nexon.page.mock.calls.length).toBe(calls)
    expect(calls).toBeLessThan(10)
    expect(slots.active).toBe(0)
  })
})
