import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import { Test } from '@nestjs/testing'

import { BossesRepository } from '../bosses/bosses.repository'
import { DropPricesRepository } from '../drop-prices/drop-prices.repository'
import {
  AlreadyOpen,
  ManualCompletionRepository,
} from '../manual-completion/manual-completion.repository'
import { OperatorNoticesService, SchedulePassed } from '../notices/operator-notices.service'
import { AdminController } from './admin.controller'

const ROW = '0f1e2d3c-4b5a-4978-8a9b-0c1d2e3f4a5b'
const importBody = {
  rules: { weeklyBossSelectionLimit: 12, weeklyCrystalSaleLimit: 90 },
  bosses: [
    {
      key: 'kaling',
      name: '카링',
      alias: '카링',
      cycle: 'weekly',
      portraitSlug: 'kaling',
      difficulties: [{ difficulty: 'easy', requiredLevel: 275 }],
    },
  ],
}

describe('AdminController', () => {
  let app: NestFastifyApplication
  const bosses = { import: jest.fn(), options: jest.fn(), findByKey: jest.fn() }
  const manual = { rows: jest.fn(), openBoss: jest.fn(), close: jest.fn() }
  const notices = {
    list: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    cancelSchedule: jest.fn(),
  }
  const prices = { summary: jest.fn(), recent: jest.fn() }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AdminController],
      providers: [
        { provide: BossesRepository, useValue: bosses },
        { provide: ManualCompletionRepository, useValue: manual },
        { provide: OperatorNoticesService, useValue: notices },
        { provide: DropPricesRepository, useValue: prices },
      ],
    }).compile()
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter())
    await app.init()
    await app.getHttpAdapter().getInstance().ready()
  })
  afterAll(() => app.close())
  beforeEach(() => {
    for (const mock of [
      ...Object.values(bosses),
      ...Object.values(manual),
      ...Object.values(notices),
      ...Object.values(prices),
    ]) {
      mock.mockReset()
    }
  })

  it('화면 셋은 HTML 이고 캐시하지 않는다', async () => {
    for (const url of [
      '/admin',
      '/admin/bosses',
      '/admin/manual-completion',
      '/admin/notices',
      '/admin/drop-prices',
    ]) {
      const res = await app.inject({ method: 'GET', url })
      expect(res.statusCode).toBe(200)
      expect(res.headers['content-type']).toContain('text/html')
      expect(res.headers['cache-control']).toBe('no-store')
      expect(res.body).toContain('<!doctype html>')
      // 페이지가 스크립트 끝에서 바로 load() 를 부른다. 도우미가 뒤에 있으면 그 순간 call 이 없어 목록이 빈다.
      const helper = res.body.indexOf('async function call(')
      const firstUse = res.body.indexOf("call('")
      if (firstUse >= 0) expect(helper).toBeLessThan(firstUse)
    }
  })

  it('POST /admin/bosses/import 는 검사한 JSON 을 넣고 결과를 낸다', async () => {
    bosses.import.mockResolvedValue({ bosses: 1, difficulties: 1, leftover: ['zakum'] })

    const res = await app.inject({
      method: 'POST',
      url: '/admin/bosses/import',
      payload: importBody,
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ bosses: 1, difficulties: 1, leftover: ['zakum'] })
    expect(bosses.import).toHaveBeenCalledWith(importBody)
  })

  it('JSON 이 틀리면 400 이고 넣지 않는다', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/admin/bosses/import',
      payload: { ...importBody, bosses: [] },
    })

    expect(res.statusCode).toBe(400)
    expect(bosses.import).not.toHaveBeenCalled()
  })

  it('GET /admin/manual-completion/rows 는 줄과 고를 보스를 함께 낸다', async () => {
    manual.rows.mockResolvedValue([
      { id: ROW, boss: 'kaling', name: '카링', from: '2026-09-17', openedAt: 't', closedAt: null },
    ])
    bosses.options.mockResolvedValue([{ id: 'b1', key: 'kaling', name: '카링' }])

    const res = await app.inject({ method: 'GET', url: '/admin/manual-completion/rows' })

    expect(res.json()).toEqual({
      rows: [
        {
          id: ROW,
          boss: 'kaling',
          name: '카링',
          from: '2026-09-17',
          openedAt: 't',
          closedAt: null,
        },
      ],
      bosses: [{ key: 'kaling', name: '카링' }],
    })
  })

  it('POST /admin/manual-completion 은 key 로 보스를 찾아 열고 201 이다', async () => {
    bosses.findByKey.mockResolvedValue({ id: 'b1' })
    manual.openBoss.mockResolvedValue({ id: ROW })

    const res = await app.inject({
      method: 'POST',
      url: '/admin/manual-completion',
      payload: { boss: 'kaling', from: '2026-09-17' },
    })

    expect(res.statusCode).toBe(201)
    expect(res.json()).toEqual({ id: ROW })
    expect(manual.openBoss).toHaveBeenCalledWith('b1', '2026-09-17')
  })

  it('모르는 보스는 404, 이미 열린 보스는 409, 날짜 모양이 틀리면 400 이다', async () => {
    bosses.findByKey.mockResolvedValueOnce(null)
    const unknown = await app.inject({
      method: 'POST',
      url: '/admin/manual-completion',
      payload: { boss: 'nobody', from: '2026-09-17' },
    })
    expect(unknown.statusCode).toBe(404)

    bosses.findByKey.mockResolvedValueOnce({ id: 'b1' })
    manual.openBoss.mockRejectedValueOnce(new AlreadyOpen())
    const dup = await app.inject({
      method: 'POST',
      url: '/admin/manual-completion',
      payload: { boss: 'kaling', from: '2026-09-17' },
    })
    expect(dup.statusCode).toBe(409)

    const bad = await app.inject({
      method: 'POST',
      url: '/admin/manual-completion',
      payload: { boss: 'kaling', from: '20260917' },
    })
    expect(bad.statusCode).toBe(400)
    expect(bosses.findByKey).toHaveBeenCalledTimes(2)
  })

  it('DELETE /admin/manual-completion/:id 는 닫으면 204, 없으면 404 다', async () => {
    manual.close.mockResolvedValueOnce(true)
    const ok = await app.inject({ method: 'DELETE', url: `/admin/manual-completion/${ROW}` })
    expect(ok.statusCode).toBe(204)
    expect(manual.close).toHaveBeenCalledWith(ROW)

    manual.close.mockResolvedValueOnce(false)
    const gone = await app.inject({ method: 'DELETE', url: `/admin/manual-completion/${ROW}` })
    expect(gone.statusCode).toBe(404)

    const bad = await app.inject({ method: 'DELETE', url: '/admin/manual-completion/not-an-id' })
    expect(bad.statusCode).toBe(400)
  })

  describe('공지', () => {
    const body = { title: '점검', body: '밤 10시', link: null, push: null }

    it('GET /admin/notices/rows 는 운영자 공지를 ISO 시각으로 낸다', async () => {
      notices.list.mockResolvedValue([
        {
          id: ROW,
          noticeKey: 'notice-20261015-000000',
          kind: 'app',
          title: '점검',
          body: null,
          link: null,
          publishedAt: new Date('2026-10-15T00:00:00Z'),
          scheduledAt: new Date('2026-10-15T12:00:00Z'),
          sentAt: null,
          pushTitle: null,
          pushBody: '문구',
        },
      ])

      const res = await app.inject({ method: 'GET', url: '/admin/notices/rows' })

      expect(res.json()).toEqual({
        rows: [
          {
            id: ROW,
            noticeKey: 'notice-20261015-000000',
            title: '점검',
            body: '',
            link: null,
            publishedAt: '2026-10-15T00:00:00.000Z',
            scheduledAt: '2026-10-15T12:00:00.000Z',
            sentAt: null,
            pushTitle: null,
            pushBody: '문구',
          },
        ],
      })
    })

    it('POST /admin/notices 는 검사한 본문을 서비스에 넘기고 201 이다', async () => {
      notices.create.mockResolvedValue({ id: ROW, noticeKey: 'k', messageId: 'm' })

      const res = await app.inject({
        method: 'POST',
        url: '/admin/notices',
        payload: { ...body, push: { title: '제목', scheduledAt: '2026-12-01T10:00:00+09:00' } },
      })

      expect(res.statusCode).toBe(201)
      expect(res.json()).toEqual({ id: ROW, noticeKey: 'k', messageId: 'm' })
      expect(notices.create).toHaveBeenCalledWith({
        title: '점검',
        body: '밤 10시',
        link: null,
        push: { title: '제목', body: null, scheduledAt: new Date('2026-12-01T01:00:00Z') },
      })
    })

    it('지난 예약은 400, 제목이 없거나 링크가 주소가 아니면 400 이다', async () => {
      notices.create.mockRejectedValueOnce(new SchedulePassed())
      const passed = await app.inject({
        method: 'POST',
        url: '/admin/notices',
        payload: { ...body, push: { scheduledAt: '2020-01-01T00:00:00Z' } },
      })
      expect(passed.statusCode).toBe(400)

      const noTitle = await app.inject({
        method: 'POST',
        url: '/admin/notices',
        payload: { ...body, title: '' },
      })
      expect(noTitle.statusCode).toBe(400)
      const badLink = await app.inject({
        method: 'POST',
        url: '/admin/notices',
        payload: { ...body, link: 'x' },
      })
      expect(badLink.statusCode).toBe(400)
      expect(notices.create).toHaveBeenCalledTimes(1)
    })

    it('PATCH /admin/notices/:id 는 고치고 없으면 404 다', async () => {
      notices.update.mockResolvedValueOnce({ messageId: null })
      const ok = await app.inject({ method: 'PATCH', url: `/admin/notices/${ROW}`, payload: body })
      expect(ok.statusCode).toBe(200)
      expect(ok.json()).toEqual({ messageId: null })
      expect(notices.update).toHaveBeenCalledWith(ROW, {
        title: '점검',
        body: '밤 10시',
        link: null,
        push: null,
      })

      notices.update.mockResolvedValueOnce(null)
      const gone = await app.inject({
        method: 'PATCH',
        url: `/admin/notices/${ROW}`,
        payload: body,
      })
      expect(gone.statusCode).toBe(404)
    })

    it('DELETE 둘은 204 이고 없으면 404 다', async () => {
      notices.remove.mockResolvedValueOnce(true).mockResolvedValueOnce(false)
      expect(
        (await app.inject({ method: 'DELETE', url: `/admin/notices/${ROW}` })).statusCode,
      ).toBe(204)
      expect(
        (await app.inject({ method: 'DELETE', url: `/admin/notices/${ROW}` })).statusCode,
      ).toBe(404)

      notices.cancelSchedule.mockResolvedValueOnce(true).mockResolvedValueOnce(false)
      expect(
        (await app.inject({ method: 'DELETE', url: `/admin/notices/${ROW}/schedule` })).statusCode,
      ).toBe(204)
      expect(
        (await app.inject({ method: 'DELETE', url: `/admin/notices/${ROW}/schedule` })).statusCode,
      ).toBe(404)
      expect(notices.cancelSchedule).toHaveBeenCalledWith(ROW)
    })
  })

  describe('드롭 가격', () => {
    it('GET /admin/drop-prices/rows 는 필터를 둘에 다 넘기고 분포와 줄을 함께 낸다', async () => {
      prices.summary.mockResolvedValue([
        { itemKey: 'ring', periodKey: '2026-10-08', count: 1, min: 1, median: 1, max: 1 },
      ])
      prices.recent.mockResolvedValue([{ id: ROW, itemKey: 'ring' }])

      const res = await app.inject({
        method: 'GET',
        url: '/admin/drop-prices/rows?itemKey=ring&periodKey=2026-10-08&limit=5',
      })

      expect(res.statusCode).toBe(200)
      expect(res.json()).toEqual({
        summary: [
          { itemKey: 'ring', periodKey: '2026-10-08', count: 1, min: 1, median: 1, max: 1 },
        ],
        rows: [{ id: ROW, itemKey: 'ring' }],
      })
      expect(prices.summary).toHaveBeenCalledWith({ itemKey: 'ring', periodKey: '2026-10-08' })
      expect(prices.recent).toHaveBeenCalledWith({ itemKey: 'ring', periodKey: '2026-10-08' }, 5)
    })

    it('필터가 없으면 null 둘과 기본 200 이고, 기간 모양이 틀리거나 줄 수가 넘치면 400 이다', async () => {
      prices.summary.mockResolvedValue([])
      prices.recent.mockResolvedValue([])

      const res = await app.inject({ method: 'GET', url: '/admin/drop-prices/rows' })
      expect(res.statusCode).toBe(200)
      expect(prices.recent).toHaveBeenCalledWith({ itemKey: null, periodKey: null }, 200)

      const bad = await app.inject({ method: 'GET', url: '/admin/drop-prices/rows?periodKey=oct' })
      expect(bad.statusCode).toBe(400)
      const tooMany = await app.inject({ method: 'GET', url: '/admin/drop-prices/rows?limit=5000' })
      expect(tooMany.statusCode).toBe(400)
    })
  })
})
