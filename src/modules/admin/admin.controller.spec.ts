import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import { Test } from '@nestjs/testing'

import { BossDropsRepository } from '../boss-drops/boss-drops.repository'
import { BossesRepository, BossExists, LastDifficulty } from '../bosses/bosses.repository'
import { CrystalPricesRepository, NotBoundary } from '../crystal-prices/crystal-prices.repository'
import { DropBoxesRepository } from '../drop-items/drop-boxes.repository'
import { DropItemExists, DropItemsRepository } from '../drop-items/drop-items.repository'
import {
  NoSpendTile,
  SpendCatalogRepository,
  SpendGroupExists,
  SpendItemShape,
} from '../spend-catalog/spend-catalog.repository'
import {
  LevelsAboveMax,
  LevelsIncomplete,
  NoSymbolGroup,
  OnlyRow,
  SymbolCostsRepository,
} from '../symbol-costs/symbol-costs.repository'
import {
  ApiNameTaken,
  ContentsRepository,
  NoContentCategory,
} from '../contents/contents.repository'
import {
  BandExists,
  BaseBand,
  EnhancementCostsRepository,
} from '../enhancement-costs/enhancement-costs.repository'
import {
  DropItemKeyMismatch,
  EquipmentItemsRepository,
  EquipmentNameTaken,
} from '../equipment-items/equipment-items.repository'
import { MvpGradesRepository } from '../mvp-grades/mvp-grades.repository'
import { WorldExists, WorldsRepository } from '../worlds/worlds.repository'
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

  const worldsRepo = { section: jest.fn(), create: jest.fn(), update: jest.fn(), move: jest.fn() }
  const spendRepo = {
    section: jest.fn(),
    setRules: jest.fn(),
    createGroup: jest.fn(),
    updateGroup: jest.fn(),
    moveGroup: jest.fn(),
    createTile: jest.fn(),
    updateTile: jest.fn(),
    createItem: jest.fn(),
    updateItem: jest.fn(),
    moveItem: jest.fn(),
  }
  const symbolRepo = {
    adminRows: jest.fn(),
    createGroup: jest.fn(),
    updateGroup: jest.fn(),
    createSymbol: jest.fn(),
    updateSymbol: jest.fn(),
    moveSymbol: jest.fn(),
    addCosts: jest.fn(),
    removeLatest: jest.fn(),
  }
  const contentsRepo = {
    section: jest.fn(),
    updateCategory: jest.fn(),
    moveCategory: jest.fn(),
    createContent: jest.fn(),
    updateContent: jest.fn(),
    moveContent: jest.fn(),
  }
  const equipmentRepo = { section: jest.fn(), create: jest.fn(), update: jest.fn() }
  const enhancementRepo = {
    section: jest.fn(),
    setRules: jest.fn(),
    setPotentialResetCost: jest.fn(),
    addPotentialResetBand: jest.fn(),
    removePotentialResetBand: jest.fn(),
    setSoulPotentialResetCost: jest.fn(),
    setStarforceStep: jest.fn(),
    addStarforceStep: jest.fn(),
    removeLastStarforceStep: jest.fn(),
  }
  const mvpRepo = { section: jest.fn(), update: jest.fn(), move: jest.fn() }

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
        { provide: WorldsRepository, useValue: worldsRepo },
        { provide: SpendCatalogRepository, useValue: spendRepo },
        { provide: SymbolCostsRepository, useValue: symbolRepo },
        { provide: ContentsRepository, useValue: contentsRepo },
        { provide: EquipmentItemsRepository, useValue: equipmentRepo },
        { provide: EnhancementCostsRepository, useValue: enhancementRepo },
        { provide: MvpGradesRepository, useValue: mvpRepo },
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
      ...Object.values(worldsRepo),
      ...Object.values(spendRepo),
      ...Object.values(symbolRepo),
      ...Object.values(contentsRepo),
      ...Object.values(equipmentRepo),
      ...Object.values(enhancementRepo),
      ...Object.values(mvpRepo),
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
    '/admin/worlds',
    '/admin/spend-catalog',
    '/admin/symbol-costs',
    '/admin/contents',
    '/admin/equipment-items',
    '/admin/enhancement-costs',
    '/admin/mvp-grades',
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
      from: null,
      until: null,
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

  it('PUT /admin/bosses/:key/difficulties/:difficulty 는 새 줄의 유효 기간도 함께 넘긴다', async () => {
    bosses.upsertDifficulty.mockResolvedValue(true)
    const res = await app.inject({
      method: 'PUT',
      url: '/admin/bosses/bardrix/difficulties/extreme',
      payload: { requiredLevel: 290, from: '2026-10-22T10:00' },
    })
    expect(res.statusCode).toBe(204)
    expect(bosses.upsertDifficulty).toHaveBeenCalledWith('bardrix', {
      difficulty: 'extreme',
      requiredLevel: 290,
      from: '2026-10-22T10:00',
      until: null,
    })
  })

  describe('지출 카탈로그', () => {
    it('rows 는 칸 그대로이고, 규칙은 204 · 범위 밖은 400, 묶음은 201 · 같은 key 409 · 모르면 404 다', async () => {
      const section = {
        updatedAt: null,
        rules: { tariffPercent: 10, rewardCoinPriceMeso: 40_000_000 },
        groups: [],
        tiles: [],
        items: [],
        itemOptions: [],
        itemForms: [],
      }
      spendRepo.section.mockResolvedValue(section)
      expect(
        (await app.inject({ method: 'GET', url: '/admin/spend-catalog/rows' })).json(),
      ).toEqual(section)

      expect(
        (
          await app.inject({
            method: 'PUT',
            url: '/admin/spend-catalog/rules',
            payload: { tariffPercent: 10, rewardCoinPriceMeso: 40_000_000 },
          })
        ).statusCode,
      ).toBe(204)
      expect(spendRepo.setRules).toHaveBeenCalledWith({
        tariffPercent: 10,
        rewardCoinPriceMeso: 40_000_000,
      })
      expect(
        (
          await app.inject({
            method: 'PUT',
            url: '/admin/spend-catalog/rules',
            payload: { tariffPercent: 101, rewardCoinPriceMeso: 1 },
          })
        ).statusCode,
      ).toBe(400)

      spendRepo.createGroup.mockResolvedValue({ id: ROW })
      const created = await app.inject({
        method: 'POST',
        url: '/admin/spend-catalog/groups',
        payload: { key: 'event', name: '이벤트', category: 'event_bm' },
      })
      expect(created.statusCode).toBe(201)
      expect(spendRepo.createGroup).toHaveBeenCalledWith({
        key: 'event',
        name: '이벤트',
        category: 'event_bm',
        active: true,
      })
      spendRepo.createGroup.mockRejectedValue(new SpendGroupExists('event'))
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/admin/spend-catalog/groups',
            payload: { key: 'event', name: '이벤트', category: 'event_bm' },
          })
        ).statusCode,
      ).toBe(409)
      spendRepo.updateGroup.mockResolvedValue(false)
      expect(
        (
          await app.inject({
            method: 'PUT',
            url: '/admin/spend-catalog/groups/nobody',
            payload: { name: 'x', category: 'buff', active: false },
          })
        ).statusCode,
      ).toBe(404)
    })

    it('항목은 nullish 칸을 null 로 넘기고 축 값 · 형태가 비면 빈 배열이다. 모양 오류는 400, 모르는 타일은 404 다', async () => {
      spendRepo.createItem.mockResolvedValue({ id: ROW })
      const created = await app.inject({
        method: 'POST',
        url: '/admin/spend-catalog/items',
        payload: {
          key: 'boss_killer_potion',
          group: 'boss_buff',
          tile: 'boss_killer_potion',
          name: '보스 킬러 비약',
          currency: 'meso',
          unitPrice: null,
          unit: '개',
        },
      })
      expect(created.statusCode).toBe(201)
      expect(spendRepo.createItem).toHaveBeenCalledWith({
        key: 'boss_killer_potion',
        group: 'boss_buff',
        tile: 'boss_killer_potion',
        name: '보스 킬러 비약',
        tier: null,
        currency: 'meso',
        unitPrice: null,
        unit: '개',
        maxQuantity: null,
        rewardCoins: null,
        from: null,
        until: null,
        options: [],
        forms: [],
      })
      spendRepo.createItem.mockRejectedValue(new SpendItemShape('단계와 축 값을 함께 못 든다'))
      const shape = await app.inject({
        method: 'POST',
        url: '/admin/spend-catalog/items',
        payload: {
          key: 'x',
          group: 'scroll',
          tile: 'magical_scroll',
          name: 'x',
          tier: '1단계',
          currency: 'meso',
          unit: '개',
          options: [{ axis: '무기', value: '한손무기' }],
        },
      })
      expect(shape.statusCode).toBe(400)
      expect(shape.json<{ message: string }>().message).toContain('함께 못 든다')
      spendRepo.updateItem.mockRejectedValue(new NoSpendTile('nobody'))
      expect(
        (
          await app.inject({
            method: 'PUT',
            url: '/admin/spend-catalog/items/x',
            payload: { tile: 'nobody', name: 'x', currency: 'meso', unit: '개' },
          })
        ).statusCode,
      ).toBe(404)
      expect(
        (
          await app.inject({
            method: 'PUT',
            url: '/admin/spend-catalog/items/x',
            payload: {
              tile: 't',
              name: 'x',
              currency: 'meso',
              unit: '개',
              from: '2026-10-22',
              until: '2026-10-01',
            },
          })
        ).statusCode,
      ).toBe(400)
    })
  })

  describe('심볼 비용', () => {
    it('rows 는 관리 줄이고, 묶음 수정은 비용 줄 위로 내리면 409, 심볼은 모르는 묶음이면 404 다', async () => {
      symbolRepo.adminRows.mockResolvedValue({ updatedAt: null, groups: [] })
      expect((await app.inject({ method: 'GET', url: '/admin/symbol-costs/rows' })).json()).toEqual(
        { updatedAt: null, groups: [] },
      )
      symbolRepo.createGroup.mockResolvedValue({ id: ROW })
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/admin/symbol-costs/groups',
            payload: { key: 'arcane', name: '아케인', maxLevel: 20, defaultFrom: 7, defaultTo: 12 },
          })
        ).statusCode,
      ).toBe(201)
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/admin/symbol-costs/groups',
            payload: { key: 'arcane', name: '아케인', maxLevel: 20, defaultFrom: 12, defaultTo: 7 },
          })
        ).statusCode,
      ).toBe(400)
      symbolRepo.updateGroup.mockRejectedValue(new LevelsAboveMax('19'))
      expect(
        (
          await app.inject({
            method: 'PUT',
            url: '/admin/symbol-costs/groups/arcane',
            payload: { name: '아케인', maxLevel: 10, defaultFrom: 1, defaultTo: 2 },
          })
        ).statusCode,
      ).toBe(409)
      symbolRepo.createSymbol.mockRejectedValue(new NoSymbolGroup('nobody'))
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/admin/symbol-costs/symbols',
            payload: {
              key: 'tallahart',
              group: 'nobody',
              name: '탈라하트',
              requiredLevel: 290,
              iconFile: 't.webp',
            },
          })
        ).statusCode,
      ).toBe(404)
    })

    it('비용은 시작 없이도 넘기고 빠진 레벨은 400, 거두기는 유일한 줄이면 409 · 없으면 404 다', async () => {
      symbolRepo.addCosts.mockResolvedValue({ inserted: 2 })
      const added = await app.inject({
        method: 'POST',
        url: '/admin/symbol-costs/symbols/tallahart/costs',
        payload: {
          costs: [
            { level: 1, costMeso: 100 },
            { level: 2, costMeso: 200 },
          ],
        },
      })
      expect(added.statusCode).toBe(201)
      expect(symbolRepo.addCosts).toHaveBeenCalledWith('tallahart', {
        from: null,
        costs: [
          { level: 1, costMeso: 100 },
          { level: 2, costMeso: 200 },
        ],
      })
      symbolRepo.addCosts.mockRejectedValue(new LevelsIncomplete('3'))
      const incomplete = await app.inject({
        method: 'POST',
        url: '/admin/symbol-costs/symbols/tallahart/costs',
        payload: { from: '2026-10-22', costs: [{ level: 1, costMeso: 100 }] },
      })
      expect(incomplete.statusCode).toBe(400)
      expect(incomplete.json<{ message: string }>().message).toContain('레벨 3')

      symbolRepo.removeLatest.mockRejectedValue(new OnlyRow(ROW))
      expect(
        (await app.inject({ method: 'DELETE', url: `/admin/symbol-costs/rows/${ROW}` })).statusCode,
      ).toBe(409)
      symbolRepo.removeLatest.mockResolvedValue(false)
      expect(
        (await app.inject({ method: 'DELETE', url: `/admin/symbol-costs/rows/${ROW}` })).statusCode,
      ).toBe(404)
    })
  })

  describe('월드', () => {
    it('rows 는 칸 그대로이고, POST 는 201 · 같은 key 409, PUT 은 204 · 모르면 404, move 는 204 다', async () => {
      worldsRepo.section.mockResolvedValue({ updatedAt: null, worlds: [] })
      expect((await app.inject({ method: 'GET', url: '/admin/worlds/rows' })).json()).toEqual({
        updatedAt: null,
        worlds: [],
      })

      worldsRepo.create.mockResolvedValue({ id: ROW })
      const created = await app.inject({
        method: 'POST',
        url: '/admin/worlds',
        payload: {
          key: 'challengers_5',
          name: '챌린저스5',
          emblem: 'challengers',
          challengers: true,
        },
      })
      expect(created.statusCode).toBe(201)
      expect(worldsRepo.create).toHaveBeenCalledWith({
        key: 'challengers_5',
        name: '챌린저스5',
        emblem: 'challengers',
        challengers: true,
        event: false,
      })
      worldsRepo.create.mockRejectedValue(new WorldExists('challengers_5'))
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/admin/worlds',
            payload: { key: 'challengers_5', name: 'x' },
          })
        ).statusCode,
      ).toBe(409)

      worldsRepo.update.mockResolvedValue(true)
      expect(
        (
          await app.inject({
            method: 'PUT',
            url: '/admin/worlds/special',
            payload: { name: '스페셜', event: true },
          })
        ).statusCode,
      ).toBe(204)
      expect(worldsRepo.update).toHaveBeenCalledWith('special', {
        name: '스페셜',
        emblem: null,
        challengers: false,
        event: true,
      })
      worldsRepo.update.mockResolvedValue(false)
      expect(
        (await app.inject({ method: 'PUT', url: '/admin/worlds/nobody', payload: { name: 'x' } }))
          .statusCode,
      ).toBe(404)

      worldsRepo.move.mockResolvedValue(true)
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/admin/worlds/special/move',
            payload: { direction: 'down' },
          })
        ).statusCode,
      ).toBe(204)
    })
  })

  describe('컨텐츠', () => {
    const highMountain = {
      apiName: '에픽 던전 : 하이마운틴',
      category: 'epic_dungeon',
      displayName: '하이마운틴',
      shortName: '에픽 던전 : 하이마운틴',
      backgroundPortrait: 'ancientGodMitra',
      type: 'contents',
      maxCount: 5,
      requiredLevel: 260,
      shareScope: 'account',
      sharedShortName: '하이마운틴',
    }
    const highMountainFields = {
      apiName: '에픽 던전 : 하이마운틴',
      category: 'epic_dungeon',
      displayName: '하이마운틴',
      shortName: '에픽 던전 : 하이마운틴',
      backgroundMap: null,
      backgroundPortrait: 'ancientGodMitra',
      countTag: null,
      type: 'contents',
      maxCount: 5,
      requiredLevel: 260,
      from: null,
      until: null,
      shareScope: 'account',
      sharedShortName: '하이마운틴',
      onlyWhenScheduled: false,
      trustRegistrationFlag: false,
      cumulativeScore: false,
      maxCountOverride: null,
    }

    it('rows 는 칸 그대로이고, 갈래는 PUT 204 · 모르면 404, move 는 204 다', async () => {
      contentsRepo.section.mockResolvedValue({ updatedAt: null, categories: [], contents: [] })
      expect((await app.inject({ method: 'GET', url: '/admin/contents/rows' })).json()).toEqual({
        updatedAt: null,
        categories: [],
        contents: [],
      })

      contentsRepo.updateCategory.mockResolvedValue(true)
      expect(
        (
          await app.inject({
            method: 'PUT',
            url: '/admin/contents/categories/epic_dungeon',
            payload: { name: '에픽 던전', countTag: 'ID당 1회', weeklyLimit: 3, sharedOrder: 2 },
          })
        ).statusCode,
      ).toBe(204)
      expect(contentsRepo.updateCategory).toHaveBeenCalledWith('epic_dungeon', {
        name: '에픽 던전',
        countTag: 'ID당 1회',
        hideCountTag: false,
        weeklyLimit: 3,
        sharedOrder: 2,
      })
      // 글자와 숨김을 함께 못 든다. 갈래 key 는 ENUM 밖이면 경로에서 400 이다.
      expect(
        (
          await app.inject({
            method: 'PUT',
            url: '/admin/contents/categories/epic_dungeon',
            payload: { name: '에픽 던전', countTag: 'ID당 1회', hideCountTag: true },
          })
        ).statusCode,
      ).toBe(400)
      expect(
        (
          await app.inject({
            method: 'PUT',
            url: '/admin/contents/categories/misc',
            payload: { name: 'x' },
          })
        ).statusCode,
      ).toBe(400)
      contentsRepo.updateCategory.mockResolvedValue(false)
      expect(
        (
          await app.inject({
            method: 'PUT',
            url: '/admin/contents/categories/guild',
            payload: { name: '길드' },
          })
        ).statusCode,
      ).toBe(404)

      contentsRepo.moveCategory.mockResolvedValue(true)
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/admin/contents/categories/guild/move',
            payload: { direction: 'up' },
          })
        ).statusCode,
      ).toBe(204)
      expect(contentsRepo.moveCategory).toHaveBeenCalledWith('guild', 'up')
    })

    it('컨텐츠 POST 는 201 · 모르는 갈래 404 · 같은 key 와 겹치는 API 이름 409 · 모양이 틀리면 400 이다', async () => {
      contentsRepo.createContent.mockResolvedValue({ id: ROW })
      const created = await app.inject({
        method: 'POST',
        url: '/admin/contents',
        payload: { key: 'epic_dungeon_high_mountain', section: 'weekly', ...highMountain },
      })
      expect(created.statusCode).toBe(201)
      expect(contentsRepo.createContent).toHaveBeenCalledWith({
        key: 'epic_dungeon_high_mountain',
        section: 'weekly',
        ...highMountainFields,
      })

      contentsRepo.createContent.mockRejectedValue(new NoContentCategory('epic_dungeon'))
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/admin/contents',
            payload: { key: 'epic_dungeon_high_mountain', section: 'weekly', ...highMountain },
          })
        ).statusCode,
      ).toBe(404)
      contentsRepo.createContent.mockRejectedValue(new ApiNameTaken('epic_dungeon_high_mountain'))
      const taken = await app.inject({
        method: 'POST',
        url: '/admin/contents',
        payload: { key: 'epic_dungeon_high_mountain_2', section: 'weekly', ...highMountain },
      })
      expect(taken.statusCode).toBe(409)
      expect(taken.json<{ message: string }>().message).toContain('epic_dungeon_high_mountain')

      // 캐릭터 줄이 위젯 글자를 들거나, 공유 줄이 안 들거나, 그림 둘을 다 들면 400 이다.
      for (const bad of [
        { ...highMountain, shareScope: 'character' },
        { ...highMountain, sharedShortName: null },
        { ...highMountain, backgroundMap: 'highMountain' },
        {
          ...highMountain,
          shareScope: 'character',
          sharedShortName: null,
          onlyWhenScheduled: true,
        },
        { ...highMountain, from: '2026-09-17', until: '2026-09-10' },
      ]) {
        contentsRepo.createContent.mockClear()
        expect(
          (
            await app.inject({
              method: 'POST',
              url: '/admin/contents',
              payload: { key: 'epic_dungeon_high_mountain', section: 'weekly', ...bad },
            })
          ).statusCode,
        ).toBe(400)
        expect(contentsRepo.createContent).not.toHaveBeenCalled()
      }
    })

    it('컨텐츠 PUT 은 204 · 모르면 404 이고 key 와 섹션은 안 받는다. move 는 204 다', async () => {
      contentsRepo.updateContent.mockResolvedValue(true)
      expect(
        (
          await app.inject({
            method: 'PUT',
            url: '/admin/contents/epic_dungeon_high_mountain',
            payload: { ...highMountain, until: '2027-01-01' },
          })
        ).statusCode,
      ).toBe(204)
      expect(contentsRepo.updateContent).toHaveBeenCalledWith('epic_dungeon_high_mountain', {
        ...highMountainFields,
        until: '2027-01-01',
      })
      contentsRepo.updateContent.mockResolvedValue(false)
      expect(
        (
          await app.inject({
            method: 'PUT',
            url: '/admin/contents/nobody',
            payload: highMountain,
          })
        ).statusCode,
      ).toBe(404)

      contentsRepo.moveContent.mockResolvedValue(true)
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/admin/contents/epic_dungeon_high_mountain/move',
            payload: { direction: 'down' },
          })
        ).statusCode,
      ).toBe(204)
    })
  })

  describe('장비', () => {
    it('POST 는 201 · 겹치는 이름과 드롭 표 불일치는 409, PUT 은 204 · 모르면 404 이고 빈 레벨은 null 이다', async () => {
      equipmentRepo.section.mockResolvedValue({ updatedAt: null, items: [] })
      expect(
        (await app.inject({ method: 'GET', url: '/admin/equipment-items/rows' })).json(),
      ).toEqual({
        updatedAt: null,
        items: [],
      })

      equipmentRepo.create.mockResolvedValue({ id: ROW })
      const created = await app.inject({
        method: 'POST',
        url: '/admin/equipment-items',
        payload: { key: 'ascendant_pulse_ring', name: '어센던트펄스링' },
      })
      expect(created.statusCode).toBe(201)
      expect(equipmentRepo.create).toHaveBeenCalledWith({
        key: 'ascendant_pulse_ring',
        name: '어센던트펄스링',
        level: null,
      })
      equipmentRepo.create.mockRejectedValue(new EquipmentNameTaken('ascendant_pulse_ring'))
      const taken = await app.inject({
        method: 'POST',
        url: '/admin/equipment-items',
        payload: { key: 'pulse_ring', name: '어센던트 펄스링', level: 130 },
      })
      expect(taken.statusCode).toBe(409)
      expect(taken.json<{ message: string }>().message).toContain('ascendant_pulse_ring')
      equipmentRepo.create.mockRejectedValue(new DropItemKeyMismatch('berserked'))
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/admin/equipment-items',
            payload: { key: 'great_terror', name: '거대한공포', level: 200 },
          })
        ).statusCode,
      ).toBe(409)
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/admin/equipment-items',
            payload: { key: 'zero', name: 'x', level: 0 },
          })
        ).statusCode,
      ).toBe(400)

      equipmentRepo.update.mockResolvedValue(true)
      expect(
        (
          await app.inject({
            method: 'PUT',
            url: '/admin/equipment-items/ascendant_pulse_ring',
            payload: { name: '어센던트펄스링', level: 130 },
          })
        ).statusCode,
      ).toBe(204)
      expect(equipmentRepo.update).toHaveBeenCalledWith('ascendant_pulse_ring', {
        name: '어센던트펄스링',
        level: 130,
      })
      equipmentRepo.update.mockResolvedValue(false)
      expect(
        (
          await app.inject({
            method: 'PUT',
            url: '/admin/equipment-items/nobody',
            payload: { name: 'x' },
          })
        ).statusCode,
      ).toBe(404)
    })
  })

  describe('강화 비용', () => {
    it('규칙 PUT 204, 칸 PUT 204 · 모르면 404, 구간 POST 201 · 같은 구간 409, 구간 DELETE 204 · 1 구간 409 다', async () => {
      enhancementRepo.setRules.mockResolvedValue(undefined)
      expect(
        (
          await app.inject({
            method: 'PUT',
            url: '/admin/enhancement-costs/rules',
            payload: {
              cubeAppraisalFreeMaxLevel: 120,
              cubeAppraisalCoefficient: 20,
              starforceDestroyDefenceSurchargePercent: 200,
            },
          })
        ).statusCode,
      ).toBe(204)
      expect(enhancementRepo.setRules).toHaveBeenCalledWith({
        cubeAppraisalFreeMaxLevel: 120,
        cubeAppraisalCoefficient: 20,
        starforceDestroyDefenceSurchargePercent: 200,
      })

      enhancementRepo.setPotentialResetCost.mockResolvedValue(true)
      expect(
        (
          await app.inject({
            method: 'PUT',
            url: '/admin/enhancement-costs/potential/additional/250/epic',
            payload: { costMeso: 34_300_000 },
          })
        ).statusCode,
      ).toBe(204)
      expect(enhancementRepo.setPotentialResetCost).toHaveBeenCalledWith(
        'additional',
        250,
        'epic',
        34_300_000,
      )
      enhancementRepo.setPotentialResetCost.mockResolvedValue(false)
      expect(
        (
          await app.inject({
            method: 'PUT',
            url: '/admin/enhancement-costs/potential/potential/275/epic',
            payload: { costMeso: 1 },
          })
        ).statusCode,
      ).toBe(404)
      // 종류 · 등급은 ENUM 밖이면 경로에서 400 이다.
      expect(
        (
          await app.inject({
            method: 'PUT',
            url: '/admin/enhancement-costs/potential/potential/250/normal',
            payload: { costMeso: 1 },
          })
        ).statusCode,
      ).toBe(400)

      enhancementRepo.addPotentialResetBand.mockResolvedValue(undefined)
      const bandBody = {
        type: 'potential',
        minLevel: 275,
        costs: { rare: 1, epic: 2, unique: 3, legendary: 4 },
      }
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/admin/enhancement-costs/potential',
            payload: bandBody,
          })
        ).statusCode,
      ).toBe(201)
      expect(enhancementRepo.addPotentialResetBand).toHaveBeenCalledWith('potential', 275, {
        rare: 1,
        epic: 2,
        unique: 3,
        legendary: 4,
      })
      enhancementRepo.addPotentialResetBand.mockRejectedValue(new BandExists('potential/275'))
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/admin/enhancement-costs/potential',
            payload: bandBody,
          })
        ).statusCode,
      ).toBe(409)

      enhancementRepo.removePotentialResetBand.mockResolvedValue(true)
      expect(
        (
          await app.inject({
            method: 'DELETE',
            url: '/admin/enhancement-costs/potential/potential/275',
          })
        ).statusCode,
      ).toBe(204)
      enhancementRepo.removePotentialResetBand.mockRejectedValue(new BaseBand('potential'))
      expect(
        (
          await app.inject({
            method: 'DELETE',
            url: '/admin/enhancement-costs/potential/potential/1',
          })
        ).statusCode,
      ).toBe(409)
    })

    it('소울 PUT 204, 스타포스 PUT 204 · 모르면 404, POST 201 이 성수를 돌려주고 DELETE last 는 204 · 비면 404 다', async () => {
      enhancementRepo.setSoulPotentialResetCost.mockResolvedValue(undefined)
      expect(
        (
          await app.inject({
            method: 'PUT',
            url: '/admin/enhancement-costs/soul/unique',
            payload: { costMeso: 65_000_000 },
          })
        ).statusCode,
      ).toBe(204)
      expect(enhancementRepo.setSoulPotentialResetCost).toHaveBeenCalledWith('unique', 65_000_000)

      enhancementRepo.setStarforceStep.mockResolvedValue(true)
      expect(
        (
          await app.inject({
            method: 'PUT',
            url: '/admin/enhancement-costs/starforce/15',
            payload: { exponent: 2.7, divisor: 200 },
          })
        ).statusCode,
      ).toBe(204)
      expect(enhancementRepo.setStarforceStep).toHaveBeenCalledWith(15, {
        exponent: 2.7,
        divisor: 200,
      })
      enhancementRepo.setStarforceStep.mockResolvedValue(false)
      expect(
        (
          await app.inject({
            method: 'PUT',
            url: '/admin/enhancement-costs/starforce/40',
            payload: { exponent: 2.7, divisor: 200 },
          })
        ).statusCode,
      ).toBe(404)

      enhancementRepo.addStarforceStep.mockResolvedValue({ fromStar: 30 })
      const added = await app.inject({
        method: 'POST',
        url: '/admin/enhancement-costs/starforce',
        payload: { exponent: 2.7, divisor: 200 },
      })
      expect(added.statusCode).toBe(201)
      expect(added.json()).toEqual({ fromStar: 30 })

      enhancementRepo.removeLastStarforceStep.mockResolvedValue(true)
      expect(
        (await app.inject({ method: 'DELETE', url: '/admin/enhancement-costs/starforce/last' }))
          .statusCode,
      ).toBe(204)
      enhancementRepo.removeLastStarforceStep.mockResolvedValue(false)
      expect(
        (await app.inject({ method: 'DELETE', url: '/admin/enhancement-costs/starforce/last' }))
          .statusCode,
      ).toBe(404)
    })
  })

  describe('MVP 등급', () => {
    it('rows 는 칸 그대로이고, PUT 은 204 · 모르면 404 · ENUM 밖 key 는 400, move 는 204 다', async () => {
      mvpRepo.section.mockResolvedValue({ updatedAt: null, grades: [] })
      expect((await app.inject({ method: 'GET', url: '/admin/mvp-grades/rows' })).json()).toEqual({
        updatedAt: null,
        grades: [],
      })

      mvpRepo.update.mockResolvedValue(true)
      expect(
        (
          await app.inject({
            method: 'PUT',
            url: '/admin/mvp-grades/gold',
            payload: { name: '골드', auctionFeePercent: 3, starforceDiscountPercent: 5 },
          })
        ).statusCode,
      ).toBe(204)
      expect(mvpRepo.update).toHaveBeenCalledWith('gold', {
        name: '골드',
        auctionFeePercent: 3,
        starforceDiscountPercent: 5,
      })
      mvpRepo.update.mockResolvedValue(false)
      expect(
        (
          await app.inject({
            method: 'PUT',
            url: '/admin/mvp-grades/black',
            payload: { name: '블랙', auctionFeePercent: 3, starforceDiscountPercent: 10 },
          })
        ).statusCode,
      ).toBe(404)
      expect(
        (
          await app.inject({
            method: 'PUT',
            url: '/admin/mvp-grades/platinum',
            payload: { name: 'x', auctionFeePercent: 3, starforceDiscountPercent: 10 },
          })
        ).statusCode,
      ).toBe(400)

      mvpRepo.move.mockResolvedValue(true)
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/admin/mvp-grades/gold/move',
            payload: { direction: 'down' },
          })
        ).statusCode,
      ).toBe(204)
      expect(mvpRepo.move).toHaveBeenCalledWith('gold', 'down')
    })
  })
})
