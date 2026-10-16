import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import { Test } from '@nestjs/testing'

import { BossDropsRepository } from '../boss-drops/boss-drops.repository'
import { BossesRepository, BossExists, LastDifficulty } from '../bosses/bosses.repository'
import { CrystalPricesRepository, NotBoundary } from '../crystal-prices/crystal-prices.repository'
import { DropBoxesRepository } from '../drop-items/drop-boxes.repository'
import { DropItemExists, DropItemsRepository } from '../drop-items/drop-items.repository'
import { DropPricesRepository } from '../drop-prices/drop-prices.repository'
import {
  AlreadyOpen,
  ManualCompletionRepository,
} from '../manual-completion/manual-completion.repository'
import { OperatorNoticesService, SchedulePassed } from '../notices/operator-notices.service'
import { AdminController } from './admin.controller'

const ROW = '0f1e2d3c-4b5a-4978-8a9b-0c1d2e3f4a5b'
const newBoss = {
  key: 'kaling',
  name: '카링',
  alias: '카링',
  cycle: 'weekly',
  portraitSlug: 'kaling',
  difficulties: [{ difficulty: 'easy', requiredLevel: 275 }],
}

describe('AdminController', () => {
  let app: NestFastifyApplication
  const bosses = {
    setRules: jest.fn(),
    createBoss: jest.fn(),
    upsertDifficulty: jest.fn(),
    deleteDifficulty: jest.fn(),
    options: jest.fn(),
    findByKey: jest.fn(),
    catalog: jest.fn(),
    setMaxPartySize: jest.fn(),
    setPeriod: jest.fn(),
    setDifficultyPeriod: jest.fn(),
  }
  const items = { section: jest.fn(), create: jest.fn(), update: jest.fn() }
  const boxes = {
    section: jest.fn(),
    create: jest.fn(),
    setLevels: jest.fn(),
    addContent: jest.fn(),
    removeContent: jest.fn(),
    moveContent: jest.fn(),
  }
  const drops = {
    rows: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    move: jest.fn(),
  }
  const crystals = {
    section: jest.fn(),
    pairs: jest.fn(),
    addPrice: jest.fn(),
    removeLatest: jest.fn(),
  }
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
        { provide: DropItemsRepository, useValue: items },
        { provide: DropBoxesRepository, useValue: boxes },
        { provide: BossDropsRepository, useValue: drops },
        { provide: CrystalPricesRepository, useValue: crystals },
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
      ...Object.values(items),
      ...Object.values(boxes),
      ...Object.values(drops),
      ...Object.values(crystals),
    ]) {
      mock.mockReset()
    }
  })

  const PAGES = [
    '/admin',
    '/admin/bosses',
    '/admin/manual-completion',
    '/admin/notices',
    '/admin/drop-prices',
    '/admin/drop-items',
    '/admin/drop-boxes',
    '/admin/boss-drops',
    '/admin/crystal-prices',
  ]

  it('화면 셋은 HTML 이고 캐시하지 않는다', async () => {
    for (const url of PAGES) {
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

  it('보스 목록 화면은 표 하나와 새 보스 단추를 든다. 편집기는 줄 아래로 펼쳐진다', async () => {
    const res = await app.inject({ method: 'GET', url: '/admin/bosses' })
    expect(res.body.match(/<table/g)).toHaveLength(1)
    expect(res.body).toContain('id="b-new"')
    expect(res.body).not.toContain('boss_difficulties')
  })

  it('메뉴는 지금 보는 화면 하나에만 aria-current 를 단다', async () => {
    for (const url of PAGES) {
      const res = await app.inject({ method: 'GET', url })
      const current = res.body.match(/<a [^>]*aria-current="page"[^>]*>/g) ?? []
      expect(current).toHaveLength(1)
      expect(current[0]).toContain(`href="${url}"`)
    }
  })

  it('PUT /admin/bosses/rules 는 규칙 둘을 적고 204 다. 0 은 400 이다', async () => {
    bosses.setRules.mockResolvedValue(undefined)

    const ok = await app.inject({
      method: 'PUT',
      url: '/admin/bosses/rules',
      payload: { weeklyBossSelectionLimit: 12, weeklyCrystalSaleLimit: 90, defaultMaxPartySize: 6 },
    })
    expect(ok.statusCode).toBe(204)
    expect(bosses.setRules).toHaveBeenCalledWith({
      weeklyBossSelectionLimit: 12,
      weeklyCrystalSaleLimit: 90,
      defaultMaxPartySize: 6,
    })

    const bad = await app.inject({
      method: 'PUT',
      url: '/admin/bosses/rules',
      payload: { weeklyBossSelectionLimit: 0, weeklyCrystalSaleLimit: 90 },
    })
    expect(bad.statusCode).toBe(400)
  })

  it('POST /admin/bosses 는 새 보스를 더하고 201, 같은 key 는 409, 난이도 없으면 400 이다', async () => {
    bosses.createBoss.mockResolvedValueOnce({ id: 'b1' })
    const ok = await app.inject({ method: 'POST', url: '/admin/bosses', payload: newBoss })
    expect(ok.statusCode).toBe(201)
    expect(ok.json()).toEqual({ id: 'b1' })
    expect(bosses.createBoss).toHaveBeenCalledWith(newBoss)

    bosses.createBoss.mockRejectedValueOnce(new BossExists('kaling'))
    const dup = await app.inject({ method: 'POST', url: '/admin/bosses', payload: newBoss })
    expect(dup.statusCode).toBe(409)

    const bad = await app.inject({
      method: 'POST',
      url: '/admin/bosses',
      payload: { ...newBoss, difficulties: [] },
    })
    expect(bad.statusCode).toBe(400)
    expect(bosses.createBoss).toHaveBeenCalledTimes(2)
  })

  it('PUT /admin/bosses/:key/difficulties/:difficulty 는 줄을 적고 204, 모르는 보스는 404, 모르는 난이도는 400 이다', async () => {
    bosses.upsertDifficulty.mockResolvedValueOnce(true)
    const ok = await app.inject({
      method: 'PUT',
      url: '/admin/bosses/kaling/difficulties/hard',
      payload: { requiredLevel: 275 },
    })
    expect(ok.statusCode).toBe(204)
    expect(bosses.upsertDifficulty).toHaveBeenCalledWith('kaling', {
      difficulty: 'hard',
      requiredLevel: 275,
    })

    bosses.upsertDifficulty.mockResolvedValueOnce(false)
    const gone = await app.inject({
      method: 'PUT',
      url: '/admin/bosses/nobody/difficulties/hard',
      payload: { requiredLevel: 275 },
    })
    expect(gone.statusCode).toBe(404)

    const bad = await app.inject({
      method: 'PUT',
      url: '/admin/bosses/kaling/difficulties/hell',
      payload: { requiredLevel: 275 },
    })
    expect(bad.statusCode).toBe(400)
  })

  it('DELETE /admin/bosses/:key/difficulties/:difficulty 는 204, 없으면 404, 마지막 줄이면 409 다', async () => {
    bosses.deleteDifficulty.mockResolvedValueOnce(true)
    expect(
      (await app.inject({ method: 'DELETE', url: '/admin/bosses/kaling/difficulties/hard' }))
        .statusCode,
    ).toBe(204)
    expect(bosses.deleteDifficulty).toHaveBeenCalledWith('kaling', 'hard')

    bosses.deleteDifficulty.mockResolvedValueOnce(false)
    expect(
      (await app.inject({ method: 'DELETE', url: '/admin/bosses/kaling/difficulties/hard' }))
        .statusCode,
    ).toBe(404)

    bosses.deleteDifficulty.mockRejectedValueOnce(new LastDifficulty('kaling'))
    expect(
      (await app.inject({ method: 'DELETE', url: '/admin/bosses/kaling/difficulties/hard' }))
        .statusCode,
    ).toBe(409)
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

  describe('게임 데이터 표 넷', () => {
    it('GET rows 넷은 리포지토리의 칸을 그대로 내고, 상자는 이름을 붙인다', async () => {
      items.section.mockResolvedValue({
        updatedAt: null,
        items: [
          { key: 'restraint_ring', name: '리스트레인트 링', iconFile: null, valuable: false },
        ],
      })
      boxes.section.mockResolvedValue({
        updatedAt: null,
        boxes: [
          { item: 'green_boss_ring_box', levelMin: 1, levelMax: 3, contents: ['restraint_ring'] },
        ],
      })
      drops.rows.mockResolvedValue([])
      crystals.pairs.mockResolvedValue([])
      crystals.section.mockResolvedValue({ updatedAt: null, prices: [] })
      bosses.catalog.mockResolvedValue({
        updatedAt: null,
        rules: { defaultMaxPartySize: 6 },
        bosses: [],
      })

      expect(
        (await app.inject({ method: 'GET', url: '/admin/drop-items/rows' })).json<{
          items: unknown[]
        }>().items,
      ).toHaveLength(1)
      const box = (await app.inject({ method: 'GET', url: '/admin/drop-boxes/rows' })).json<{
        boxes: unknown[]
        items: unknown[]
      }>()
      expect(box.boxes[0]).toMatchObject({
        name: 'green_boss_ring_box',
        contents: [{ item: 'restraint_ring', name: '리스트레인트 링' }],
      })
      expect(box.items).toEqual([{ key: 'restraint_ring', name: '리스트레인트 링' }])
      const rows = await app.inject({
        method: 'GET',
        url: '/admin/boss-drops/rows?boss=lotus&difficulty=hard',
      })
      expect(rows.statusCode).toBe(200)
      expect(drops.rows).toHaveBeenCalledWith('lotus', 'hard')
      expect(
        (await app.inject({ method: 'GET', url: '/admin/boss-drops/rows?boss=lotus' })).statusCode,
      ).toBe(400)
      expect(
        (await app.inject({ method: 'GET', url: '/admin/crystal-prices/rows' })).json(),
      ).toEqual({ updatedAt: null, defaultMaxPartySize: 6, pairs: [] })
    })

    it('POST /admin/drop-items 는 201, 같은 key 는 409, key 모양이 틀리면 400 이다', async () => {
      items.create.mockResolvedValue({ id: ROW })
      const ok = await app.inject({
        method: 'POST',
        url: '/admin/drop-items',
        payload: { key: 'dreamy_belt', name: '몽환의 벨트' },
      })
      expect(ok.statusCode).toBe(201)
      expect(items.create).toHaveBeenCalledWith({
        key: 'dreamy_belt',
        name: '몽환의 벨트',
        iconFile: null,
        valuable: false,
      })

      items.create.mockRejectedValue(new DropItemExists('dreamy_belt'))
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/admin/drop-items',
            payload: { key: 'dreamy_belt', name: 'x' },
          })
        ).statusCode,
      ).toBe(409)
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/admin/drop-items',
            payload: { key: 'Dreamy Belt', name: 'x' },
          })
        ).statusCode,
      ).toBe(400)
    })

    it('PUT /admin/drop-items/:key 는 204, 모르면 404 다', async () => {
      items.update.mockResolvedValue(true)
      expect(
        (
          await app.inject({
            method: 'PUT',
            url: '/admin/drop-items/dreamy_belt',
            payload: { name: '몽환의 벨트', valuable: true },
          })
        ).statusCode,
      ).toBe(204)
      expect(items.update).toHaveBeenCalledWith('dreamy_belt', {
        name: '몽환의 벨트',
        iconFile: null,
        valuable: true,
      })
      items.update.mockResolvedValue(false)
      expect(
        (
          await app.inject({
            method: 'PUT',
            url: '/admin/drop-items/nobody',
            payload: { name: 'x' },
          })
        ).statusCode,
      ).toBe(404)
    })

    it('상자의 레벨 범위는 둘 다 있거나 둘 다 없어야 400 이 아니다', async () => {
      boxes.create.mockResolvedValue({ id: ROW })
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/admin/drop-boxes',
            payload: { item: 'green_boss_ring_box', levelMin: 1 },
          })
        ).statusCode,
      ).toBe(400)
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/admin/drop-boxes',
            payload: { item: 'green_boss_ring_box', levelMin: 3, levelMax: 1 },
          })
        ).statusCode,
      ).toBe(400)
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/admin/drop-boxes',
            payload: { item: 'chaos_pitch_black_accessory_box' },
          })
        ).statusCode,
      ).toBe(201)
      expect(boxes.create).toHaveBeenCalledWith({
        item: 'chaos_pitch_black_accessory_box',
        levelMin: null,
        levelMax: null,
      })
    })

    it('드롭 표 줄은 더하고 고치고 옮기고 지운다. 기간 글자가 틀리면 400 이다', async () => {
      drops.create.mockResolvedValue({ id: ROW })
      const body = {
        boss: 'lotus',
        difficulty: 'hard',
        category: 'consumable',
        item: 'red_boss_ring_box',
        from: '2026-09-17T10:00',
      }
      expect(
        (await app.inject({ method: 'POST', url: '/admin/boss-drops', payload: body })).statusCode,
      ).toBe(201)
      expect(drops.create).toHaveBeenCalledWith({ ...body, amount: null, until: null })
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/admin/boss-drops',
            payload: { ...body, from: '2026-9-17' },
          })
        ).statusCode,
      ).toBe(400)
      drops.update.mockResolvedValue(true)
      expect(
        (
          await app.inject({
            method: 'PUT',
            url: `/admin/boss-drops/${ROW}`,
            payload: { until: '2026-09-17' },
          })
        ).statusCode,
      ).toBe(204)
      expect(drops.update).toHaveBeenCalledWith(ROW, {
        amount: null,
        from: null,
        until: '2026-09-17',
      })
      drops.move.mockResolvedValue(true)
      expect(
        (
          await app.inject({
            method: 'POST',
            url: `/admin/boss-drops/${ROW}/move`,
            payload: { direction: 'up' },
          })
        ).statusCode,
      ).toBe(204)
      drops.remove.mockResolvedValue(false)
      expect(
        (await app.inject({ method: 'DELETE', url: `/admin/boss-drops/${ROW}` })).statusCode,
      ).toBe(404)
    })

    it('결정석 가격은 새 줄을 열고(경계가 아니면 400), 지금 줄을 거두고, 상한을 적는다', async () => {
      crystals.addPrice.mockResolvedValue({ id: ROW })
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/admin/crystal-prices/lotus/hard',
            payload: { priceMeso: 100, from: '2026-10-22' },
          })
        ).statusCode,
      ).toBe(201)
      expect(crystals.addPrice).toHaveBeenCalledWith('lotus', 'hard', {
        priceMeso: 100,
        from: '2026-10-22',
      })
      crystals.addPrice.mockRejectedValue(new NotBoundary('2026-10-23'))
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/admin/crystal-prices/lotus/hard',
            payload: { priceMeso: 100, from: '2026-10-23' },
          })
        ).statusCode,
      ).toBe(400)
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/admin/crystal-prices/lotus/ultra',
            payload: { priceMeso: 100 },
          })
        ).statusCode,
      ).toBe(400)
      crystals.removeLatest.mockResolvedValue(true)
      expect(
        (await app.inject({ method: 'DELETE', url: `/admin/crystal-prices/rows/${ROW}` }))
          .statusCode,
      ).toBe(204)
      bosses.setMaxPartySize.mockResolvedValue(true)
      expect(
        (
          await app.inject({
            method: 'PUT',
            url: '/admin/crystal-prices/lotus/hard/max-party-size',
            payload: { maxPartySize: null },
          })
        ).statusCode,
      ).toBe(204)
      expect(bosses.setMaxPartySize).toHaveBeenCalledWith('lotus', 'hard', null)
      expect(
        (
          await app.inject({
            method: 'PUT',
            url: '/admin/crystal-prices/lotus/hard/max-party-size',
            payload: { maxPartySize: 7 },
          })
        ).statusCode,
      ).toBe(400)
    })
  })

  it('PUT /admin/bosses/:key/period 는 기간 둘을 적고 204, 모르는 보스는 404, 끝이 앞이면 400 이다', async () => {
    bosses.setPeriod.mockResolvedValue(true)
    const ok = await app.inject({
      method: 'PUT',
      url: '/admin/bosses/meirin/period',
      payload: { until: '2026-11-05' },
    })
    expect(ok.statusCode).toBe(204)
    expect(bosses.setPeriod).toHaveBeenCalledWith('meirin', { until: '2026-11-05' })

    bosses.setPeriod.mockResolvedValue(false)
    expect(
      (await app.inject({ method: 'PUT', url: '/admin/bosses/nobody/period', payload: {} }))
        .statusCode,
    ).toBe(404)
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: '/admin/bosses/meirin/period',
          payload: { from: '2026-11-05', until: '2026-07-03' },
        })
      ).statusCode,
    ).toBe(400)
  })

  it('PUT /admin/bosses/:key/difficulties/:difficulty/period 는 204, 모르는 조합은 404 다', async () => {
    bosses.setDifficultyPeriod.mockResolvedValue(true)
    const ok = await app.inject({
      method: 'PUT',
      url: '/admin/bosses/lotus/difficulties/extreme/period',
      payload: { from: '2026-11-05T10:00' },
    })
    expect(ok.statusCode).toBe(204)
    expect(bosses.setDifficultyPeriod).toHaveBeenCalledWith('lotus', 'extreme', {
      from: '2026-11-05T10:00',
    })
    bosses.setDifficultyPeriod.mockResolvedValue(false)
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: '/admin/bosses/lotus/difficulties/easy/period',
          payload: {},
        })
      ).statusCode,
    ).toBe(404)
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: '/admin/bosses/lotus/difficulties/ultra/period',
          payload: {},
        })
      ).statusCode,
    ).toBe(400)
  })
})
