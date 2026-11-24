import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import { Test } from '@nestjs/testing'

import { AssetNotFound } from '../assets/asset-refs'
import { BossDropsRepository } from '../boss-drops/boss-drops.repository'
import { AmbiguousDropBox } from '../boss-drops/drop-box-rules'
import { BossesRepository, BossExists, LastDifficulty } from '../bosses/bosses.repository'
import { GameRulesRepository, NoGameRules } from '../game-rules/game-rules.repository'
import {
  CashbookCategoriesRepository,
  CashbookCategoryExists,
} from '../cashbook-categories/cashbook-categories.repository'
import { CrystalPricesRepository, NotBoundary } from '../crystal-prices/crystal-prices.repository'
import { DropBoxesRepository } from '../drop-items/drop-boxes.repository'
import { DropItemsRepository } from '../drop-items/drop-items.repository'
import {
  NoSpendCategory,
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
  NoSuperiorSeries,
  SuperiorItemNameTaken,
  SuperiorSeriesExists,
} from '../enhancement-costs/enhancement-costs.repository'
import {
  GroundKeyPrefix,
  GroundNameTaken,
  HuntingGroundsRepository,
  NoRegion,
  RegionExists,
} from '../hunting-grounds/hunting-grounds.repository'
import {
  CostLevelsMismatch,
  DefaultTypeTaken,
  HexaCoreExists,
  HexaMatrixRepository,
  JobExists,
  LevelsAboveMax as HexaLevelsAboveMax,
  NoHexaType,
  NoJob,
} from '../hexa-matrix/hexa-matrix.repository'
import { MvpGradesRepository } from '../mvp-grades/mvp-grades.repository'
import {
  HuntLootExists,
  HuntLootNameTaken,
  HuntLootPriceShape,
  HuntLootRepository,
} from '../hunt-loot/hunt-loot.repository'
import { FaqSheetExists, FaqsRepository, NoFaqSheet } from '../faqs/faqs.repository'
import {
  NoWorld,
  PeriodNotAfter,
  PeriodOverlap,
  WorldExists,
  WorldsRepository,
} from '../worlds/worlds.repository'
import { DropPricesRepository } from '../drop-prices/drop-prices.repository'
import {
  AlreadyOpen,
  ManualCompletionRepository,
} from '../manual-completion/manual-completion.repository'
import { MarkdownRejected, markdownToNotice } from '../notices/markdown-blocks'
import {
  AlreadyPublished,
  OperatorNoticesService,
  SchedulePassed,
} from '../notices/operator-notices.service'
import { DropMarketService } from '../drop-market/drop-market.service'
import { AdminController } from './admin.controller'
import { UsageDashboardService } from './usage-dashboard.service'

const ROW = '0f1e2d3c-4b5a-4978-8a9b-0c1d2e3f4a5b'
const newBoss = {
  key: 'kaling',
  name: '카링',
  shortName: '카링',
  isSeasonBoss: false,
  portraitAssetId: ROW,
  difficulties: [{ difficulty: 'easy', cycle: 'weekly', requiredLevel: 275 }],
}

describe('AdminController', () => {
  let app: NestFastifyApplication
  const bosses = {
    createBoss: jest.fn(),
    upsertDifficulty: jest.fn(),
    deleteDifficulty: jest.fn(),
    options: jest.fn(),
    findByKey: jest.fn(),
    catalog: jest.fn(),
    setMaxPartySize: jest.fn(),
    setPeriod: jest.fn(),
    setDifficultyPeriod: jest.fn(),
    setShortName: jest.fn(),
  }
  const items = {
    section: jest.fn(),
    adminSection: jest.fn(),
  }
  const boxes = {
    section: jest.fn(),
    adminRows: jest.fn(),
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
    publishNow: jest.fn(),
  }
  const prices = { items: jest.fn(), points: jest.fn(), periods: jest.fn(), recent: jest.fn() }
  const market = { scopes: jest.fn(), overview: jest.fn(), detail: jest.fn() }

  const worldsRepo = {
    adminSection: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    move: jest.fn(),
    addPeriod: jest.fn(),
    updatePeriod: jest.fn(),
    removePeriod: jest.fn(),
  }
  const spendRepo = {
    section: jest.fn(),
    adminRows: jest.fn(),
    createGroup: jest.fn(),
    updateGroup: jest.fn(),
    moveGroup: jest.fn(),
    createTile: jest.fn(),
    updateTile: jest.fn(),
    createItem: jest.fn(),
    updateItem: jest.fn(),
    moveItem: jest.fn(),
    updateRewardType: jest.fn(),
  }
  const cashbookRepo = {
    section: jest.fn(),
    createCategory: jest.fn(),
    updateCategory: jest.fn(),
    moveCategory: jest.fn(),
    updateItemType: jest.fn(),
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
    adminRows: jest.fn(),
    updateCategory: jest.fn(),
    moveCategory: jest.fn(),
    createContent: jest.fn(),
    updateContent: jest.fn(),
    moveContent: jest.fn(),
  }
  const enhancementRepo = {
    adminRows: jest.fn(),
    setPotentialResetCost: jest.fn(),
    addPotentialResetBand: jest.fn(),
    removePotentialResetBand: jest.fn(),
    setSoulPotentialResetCost: jest.fn(),
    setStarforceStep: jest.fn(),
    addStarforceStep: jest.fn(),
    removeLastStarforceStep: jest.fn(),
    addSuperiorSeries: jest.fn(),
    setSuperiorSeries: jest.fn(),
    addSuperiorItem: jest.fn(),
    removeSuperiorItem: jest.fn(),
    setSuperiorItemIcon: jest.fn(),
  }
  const rulesRepo = { section: jest.fn(), update: jest.fn() }
  const mvpRepo = { section: jest.fn(), update: jest.fn(), move: jest.fn() }
  const huntingRepo = {
    adminRows: jest.fn(),
    createRegion: jest.fn(),
    updateRegion: jest.fn(),
    moveRegion: jest.fn(),
    createGround: jest.fn(),
    updateGround: jest.fn(),
    moveGround: jest.fn(),
    setGroundPopular: jest.fn(),
  }

  const huntLootRepo = {
    section: jest.fn(),
    adminRows: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    move: jest.fn(),
  }

  const hexaRepo = {
    section: jest.fn(),
    createType: jest.fn(),
    updateType: jest.fn(),
    replaceCosts: jest.fn(),
    createJob: jest.fn(),
    updateJob: jest.fn(),
    createCore: jest.fn(),
    updateCore: jest.fn(),
    removeCore: jest.fn(),
    moveCore: jest.fn(),
    createStat: jest.fn(),
    updateStat: jest.fn(),
  }

  const faqRepo = {
    adminRows: jest.fn(),
    createSheet: jest.fn(),
    updateSheet: jest.fn(),
    removeSheet: jest.fn(),
    moveSheet: jest.fn(),
    createItem: jest.fn(),
    updateItem: jest.fn(),
    removeItem: jest.fn(),
    moveItem: jest.fn(),
  }

  const dashboard = { forUsers: jest.fn(), forUsage: jest.fn(), forScreen: jest.fn() }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AdminController],
      providers: [
        { provide: BossesRepository, useValue: bosses },
        { provide: GameRulesRepository, useValue: rulesRepo },
        { provide: ManualCompletionRepository, useValue: manual },
        { provide: OperatorNoticesService, useValue: notices },
        { provide: DropPricesRepository, useValue: prices },
        { provide: DropMarketService, useValue: market },
        { provide: DropItemsRepository, useValue: items },
        { provide: DropBoxesRepository, useValue: boxes },
        { provide: BossDropsRepository, useValue: drops },
        { provide: CrystalPricesRepository, useValue: crystals },
        { provide: WorldsRepository, useValue: worldsRepo },
        { provide: SpendCatalogRepository, useValue: spendRepo },
        { provide: SymbolCostsRepository, useValue: symbolRepo },
        { provide: ContentsRepository, useValue: contentsRepo },
        { provide: EnhancementCostsRepository, useValue: enhancementRepo },
        { provide: MvpGradesRepository, useValue: mvpRepo },
        { provide: HuntingGroundsRepository, useValue: huntingRepo },
        { provide: CashbookCategoriesRepository, useValue: cashbookRepo },
        { provide: HuntLootRepository, useValue: huntLootRepo },
        { provide: HexaMatrixRepository, useValue: hexaRepo },
        { provide: FaqsRepository, useValue: faqRepo },
        { provide: UsageDashboardService, useValue: dashboard },
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
      ...Object.values(rulesRepo),
      ...Object.values(manual),
      ...Object.values(notices),
      ...Object.values(prices),
      ...Object.values(dashboard),
      ...Object.values(items),
      ...Object.values(boxes),
      ...Object.values(drops),
      ...Object.values(crystals),
      ...Object.values(worldsRepo),
      ...Object.values(spendRepo),
      ...Object.values(symbolRepo),
      ...Object.values(contentsRepo),
      ...Object.values(enhancementRepo),
      ...Object.values(mvpRepo),
      ...Object.values(huntingRepo),
      ...Object.values(cashbookRepo),
      ...Object.values(huntLootRepo),
      ...Object.values(hexaRepo),
      ...Object.values(faqRepo),
    ]) {
      mock.mockReset()
    }
  })

  const PAGES = [
    '/admin',
    '/admin/bosses',
    '/admin/manual-completion',
    '/admin/notices',
    '/admin/faqs',
    '/admin/drop-prices',
    '/admin/drop-market',
    '/admin/users',
    '/admin/usage',
    '/admin/drop-boxes',
    '/admin/boss-drops',
    '/admin/crystal-prices',
    '/admin/worlds',
    '/admin/cashbook-categories',
    '/admin/cashbook-categories/item-types',
    '/admin/hunt-loot',
    '/admin/spend-catalog',
    '/admin/spend-catalog/tiles',
    '/admin/symbol-costs',
    '/admin/hexa-matrix',
    '/admin/hexa-matrix/types',
    '/admin/hexa-matrix/costs',
    '/admin/contents',
    '/admin/contents/categories',
    '/admin/enhancement-costs',
    '/admin/enhancement-costs/starforce',
    '/admin/enhancement-costs/superior',
    '/admin/mvp-grades',
    '/admin/hunting-grounds',
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

  it('보스 목록 화면은 왼쪽 보스 목록 · 오른쪽 편집 칸 · 새 보스 단추를 들고, 옛 표 이름을 읽지 않는다', async () => {
    const res = await app.inject({ method: 'GET', url: '/admin/bosses' })
    for (const id of ['id="list"', 'id="detail"', 'id="b-new"']) expect(res.body).toContain(id)
    expect(res.body).not.toContain('boss_difficulties')
  })

  const MENU_OF: Record<string, string> = {
    '/admin/enhancement-costs/starforce': '/admin/enhancement-costs',
    '/admin/enhancement-costs/superior': '/admin/enhancement-costs',
    '/admin/cashbook-categories/item-types': '/admin/cashbook-categories',
    '/admin/spend-catalog/tiles': '/admin/spend-catalog',
    '/admin/hexa-matrix/types': '/admin/hexa-matrix',
    '/admin/hexa-matrix/costs': '/admin/hexa-matrix',
    '/admin/contents/categories': '/admin/contents',
  }

  // 한 메뉴를 나눈 화면(강화 비용의 스타포스 등)은 그 메뉴 항목이 지금 화면이다. 화면 안의 전환 막대는 따로 센다.
  it('메뉴는 지금 보는 화면 하나에만 aria-current 를 단다', async () => {
    for (const url of PAGES) {
      const res = await app.inject({ method: 'GET', url })
      const nav = res.body.slice(res.body.indexOf('<nav'), res.body.indexOf('</nav>'))
      const current = nav.match(/<a [^>]*aria-current="page"[^>]*>/g) ?? []
      expect(current).toHaveLength(1)
      expect(current[0]).toContain(`href="${MENU_OF[url] ?? url}"`)
    }
  })

  it('메뉴는 지금 보는 화면이 든 묶음만 펼치고 나머지는 접는다', async () => {
    for (const url of PAGES) {
      const res = await app.inject({ method: 'GET', url })
      const nav = res.body.slice(res.body.indexOf('<nav'), res.body.indexOf('</nav>'))
      const stack: boolean[] = []
      let opened = 0
      let ancestors: boolean[] | null = null
      for (const [tag] of nav.matchAll(
        /<details[^>]*>|<\/details>|<a [^>]*aria-current="page"[^>]*>/g,
      )) {
        if (tag.startsWith('<details')) {
          const open = /\sopen[\s>]/.test(tag)
          stack.push(open)
          if (open) opened++
        } else if (tag === '</details>') stack.pop()
        else ancestors = [...stack]
      }
      expect(ancestors).not.toBeNull()
      if (!['/admin', '/admin/notices', '/admin/faqs'].includes(url))
        expect(ancestors!.length).toBeGreaterThan(0)
      expect(ancestors!.every(Boolean)).toBe(true)
      expect(opened).toBe(ancestors!.length)
    }
  })

  // 화면마다 자기 규칙만 보낸다. 다른 화면의 규칙을 그 화면이 읽은 옛 값으로 덮지 않으려는 것이다.
  it('게임 규칙은 GET 이 칸 그대로이고, PUT 은 받은 규칙만 넘겨 204 다. 비거나 모르는 칸 · 범위 밖은 400, 줄이 없으면 409 다', async () => {
    const section = { updatedAt: null, gameRules: null }
    rulesRepo.section.mockResolvedValue(section)
    expect((await app.inject({ method: 'GET', url: '/admin/game-rules' })).json()).toEqual(section)

    const put = (payload: object) =>
      app.inject({ method: 'PUT', url: '/admin/game-rules', payload })
    rulesRepo.update.mockResolvedValue(undefined)
    expect((await put({ cubeAppraisalFreeMaxLevel: 121 })).statusCode).toBe(204)
    expect(rulesRepo.update).toHaveBeenCalledWith({ cubeAppraisalFreeMaxLevel: 121 })
    // 수수료율이 100 이면 앱의 환산이 0 으로 나눈다.
    for (const payload of [
      {},
      { tariffPercent: 10 },
      { mesoMarketFeePercent: 100 },
      { weeklyBossSelectionLimit: 0 },
    ]) {
      expect((await put(payload)).statusCode).toBe(400)
    }
    expect(rulesRepo.update).toHaveBeenCalledTimes(1)
    rulesRepo.update.mockRejectedValue(new NoGameRules())
    expect((await put({ spendTariffPercent: 9 })).statusCode).toBe(409)
  })

  it('GET /admin/bosses/rows 는 게임 데이터의 bosses 칸 그대로다', async () => {
    const catalog = { updatedAt: null, bosses: [] }
    bosses.catalog.mockResolvedValueOnce(catalog)
    const res = await app.inject({ method: 'GET', url: '/admin/bosses/rows' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual(catalog)
  })

  it('POST /admin/bosses 는 새 보스를 더하고 201, 같은 key 는 409, 난이도가 없거나 그림 표에 없는 초상이면 400 이다', async () => {
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

    bosses.createBoss.mockRejectedValueOnce(new AssetNotFound(ROW))
    const noPortrait = await app.inject({ method: 'POST', url: '/admin/bosses', payload: newBoss })
    expect(noPortrait.statusCode).toBe(400)
  })

  it('PUT /admin/bosses/:key/difficulties/:difficulty 는 줄을 적고 204, 모르는 보스는 404, 모르는 난이도는 400 이다', async () => {
    bosses.upsertDifficulty.mockResolvedValueOnce(true)
    const ok = await app.inject({
      method: 'PUT',
      url: '/admin/bosses/kaling/difficulties/hard',
      payload: { cycle: 'weekly', requiredLevel: 275 },
    })
    expect(ok.statusCode).toBe(204)
    expect(bosses.upsertDifficulty).toHaveBeenCalledWith('kaling', {
      difficulty: 'hard',
      cycle: 'weekly',
      requiredLevel: 275,
      validFrom: null,
      validUntil: null,
    })

    bosses.upsertDifficulty.mockResolvedValueOnce(false)
    const gone = await app.inject({
      method: 'PUT',
      url: '/admin/bosses/nobody/difficulties/hard',
      payload: { cycle: 'weekly', requiredLevel: 275 },
    })
    expect(gone.statusCode).toBe(404)

    const bad = await app.inject({
      method: 'PUT',
      url: '/admin/bosses/kaling/difficulties/hell',
      payload: { cycle: 'weekly', requiredLevel: 275 },
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
      payload: { boss: 'kaling', fromDate: '2026-09-17' },
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
      payload: { boss: 'nobody', fromDate: '2026-09-17' },
    })
    expect(unknown.statusCode).toBe(404)

    bosses.findByKey.mockResolvedValueOnce({ id: 'b1' })
    manual.openBoss.mockRejectedValueOnce(new AlreadyOpen())
    const dup = await app.inject({
      method: 'POST',
      url: '/admin/manual-completion',
      payload: { boss: 'kaling', fromDate: '2026-09-17' },
    })
    expect(dup.statusCode).toBe(409)

    const bad = await app.inject({
      method: 'POST',
      url: '/admin/manual-completion',
      payload: { boss: 'kaling', fromDate: '20260917' },
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
    const body = { title: '점검', markdown: '밤 10시', link: null, push: null }

    it('GET /admin/notices/rows 는 운영자 공지를 ISO 시각으로 내고 고칠 마크다운을 싣는다', async () => {
      notices.list.mockResolvedValue([
        {
          id: ROW,
          noticeKey: 'notice-20261015-000000',
          kind: 'app',
          title: '점검',
          body: '밤 10시',
          markdown: '밤 **10시**',
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
            body: '밤 10시',
            markdown: '밤 **10시**',
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

    it('POST /admin/notices 는 올릴 시각과 알림 문구를 서비스에 넘기고 201 이다', async () => {
      notices.create.mockResolvedValue({ id: ROW, noticeKey: 'k', messageId: 'm' })

      const res = await app.inject({
        method: 'POST',
        url: '/admin/notices',
        payload: { ...body, publishAt: '2026-12-01T10:00:00+09:00', push: { title: '제목' } },
      })

      expect(res.statusCode).toBe(201)
      expect(res.json()).toEqual({ id: ROW, noticeKey: 'k', messageId: 'm' })
      expect(notices.create).toHaveBeenCalledWith({
        title: '점검',
        markdown: '밤 10시',
        link: null,
        publishAt: new Date('2026-12-01T01:00:00Z'),
        push: { title: '제목', body: null },
      })
    })

    it('지난 예약 · https 가 아닌 본문 주소는 400 이고 그 주소를 알린다', async () => {
      notices.create.mockRejectedValueOnce(
        new MarkdownRejected('https 가 아닌 주소다: http://x.test'),
      )
      const insecure = await app.inject({ method: 'POST', url: '/admin/notices', payload: body })
      expect(insecure.statusCode).toBe(400)
      expect(insecure.body).toContain('http://x.test')

      notices.update.mockRejectedValueOnce(
        new MarkdownRejected('https 가 아닌 주소다: http://y.test'),
      )
      const insecureEdit = await app.inject({
        method: 'PATCH',
        url: `/admin/notices/${ROW}`,
        payload: body,
      })
      expect(insecureEdit.statusCode).toBe(400)
      expect(insecureEdit.body).toContain('http://y.test')
    })

    it('지난 예약은 400, 제목 · 본문이 없거나 본문이 10,000자를 넘거나 링크가 주소가 아니면 400 이다', async () => {
      notices.create.mockRejectedValueOnce(new SchedulePassed())
      const passed = await app.inject({
        method: 'POST',
        url: '/admin/notices',
        payload: { ...body, publishAt: '2020-01-01T00:00:00Z' },
      })
      expect(passed.statusCode).toBe(400)
      notices.update.mockRejectedValueOnce(new AlreadyPublished())
      const published = await app.inject({
        method: 'PATCH',
        url: `/admin/notices/${ROW}`,
        payload: { ...body, publishAt: '2030-01-01T00:00:00Z' },
      })
      expect(published.statusCode).toBe(409)

      const noTitle = await app.inject({
        method: 'POST',
        url: '/admin/notices',
        payload: { ...body, title: '' },
      })
      expect(noTitle.statusCode).toBe(400)
      for (const markdown of ['', 'a'.repeat(10_001)]) {
        const res = await app.inject({
          method: 'POST',
          url: '/admin/notices',
          payload: { ...body, markdown },
        })
        expect(res.statusCode).toBe(400)
      }
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
        markdown: '밤 10시',
        link: null,
        publishAt: null,
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

    it('POST /admin/notices/preview 는 저장과 같은 변환의 블록 · 평문을 내고, https 가 아닌 주소는 400 이다', async () => {
      const markdown =
        '## 새 기능\n\n![](https://mapleroutine.store/assets/a.webp)\n\n메모를 붙여요'
      const ok = await app.inject({
        method: 'POST',
        url: '/admin/notices/preview',
        payload: { markdown },
      })
      expect(ok.statusCode).toBe(200)
      expect(ok.json()).toEqual(markdownToNotice(markdown))

      const insecure = await app.inject({
        method: 'POST',
        url: '/admin/notices/preview',
        payload: { markdown: '[글](http://x.test/a)' },
      })
      expect(insecure.statusCode).toBe(400)
      expect(insecure.body).toContain('http://x.test/a')
      expect(notices.create).not.toHaveBeenCalled()
    })

    it('지우기와 지금 올리기는 204 이고 없으면 404, 이미 올라간 공지를 지금 올리면 409 다', async () => {
      notices.remove.mockResolvedValueOnce(true).mockResolvedValueOnce(false)
      expect(
        (await app.inject({ method: 'DELETE', url: `/admin/notices/${ROW}` })).statusCode,
      ).toBe(204)
      expect(
        (await app.inject({ method: 'DELETE', url: `/admin/notices/${ROW}` })).statusCode,
      ).toBe(404)

      const publish = async () =>
        (await app.inject({ method: 'POST', url: `/admin/notices/${ROW}/publish` })).statusCode
      notices.publishNow.mockResolvedValueOnce(true).mockResolvedValueOnce(false)
      expect(await publish()).toBe(204)
      expect(await publish()).toBe(404)
      expect(notices.publishNow).toHaveBeenCalledWith(ROW)
      notices.publishNow.mockRejectedValueOnce(new AlreadyPublished())
      expect(await publish()).toBe(409)
    })
  })

  describe('사용자 · 사용 로그 대시보드', () => {
    it('GET /admin/users/stats 는 기간과 플랫폼을 넘기고, 기간이 없으면 7일이다', async () => {
      dashboard.forUsers.mockResolvedValue({ tiles: {} })

      const res = await app.inject({ method: 'GET', url: '/admin/users/stats?platform=ios' })

      expect(res.statusCode).toBe(200)
      expect(res.headers['cache-control']).toBe('no-store')
      expect(res.json()).toEqual({ tiles: {} })
      expect(dashboard.forUsers).toHaveBeenCalledWith(7, 'ios')
    })

    it('모르는 플랫폼이나 보관 기간을 넘는 기간은 400 이다', async () => {
      const platform = await app.inject({ method: 'GET', url: '/admin/users/stats?platform=web' })
      const usage = await app.inject({ method: 'GET', url: '/admin/usage/stats?days=181' })

      expect(platform.statusCode).toBe(400)
      expect(usage.statusCode).toBe(400)
      expect(dashboard.forUsers).not.toHaveBeenCalled()
      expect(dashboard.forUsage).not.toHaveBeenCalled()
    })

    it('사용 로그 경로 둘은 기간이 없으면 7일이다', async () => {
      dashboard.forUsage.mockResolvedValue({ tiles: {} })
      dashboard.forScreen.mockResolvedValue({ daily: [] })

      const stats = await app.inject({ method: 'GET', url: '/admin/usage/stats' })
      const screen = await app.inject({ method: 'GET', url: '/admin/usage/screen?name=Boss' })

      expect(stats.statusCode).toBe(200)
      expect(screen.statusCode).toBe(200)
      expect(dashboard.forUsage).toHaveBeenCalledWith(7)
      expect(dashboard.forScreen).toHaveBeenCalledWith('Boss', 7)
    })

    it('GET /admin/usage/screen 은 화면 이름과 기간을 넘긴다', async () => {
      dashboard.forScreen.mockResolvedValue({ daily: [] })

      const res = await app.inject({ method: 'GET', url: '/admin/usage/screen?name=Boss&days=7' })

      expect(res.statusCode).toBe(200)
      expect(dashboard.forScreen).toHaveBeenCalledWith('Boss', 7)
    })
  })

  describe('드롭 가격', () => {
    const FILTER = { itemKey: 'ring', periodCode: 'W202641', source: 'ring_box' }
    const QUERY = 'itemKey=ring&periodCode=W202641&source=ring_box'

    // 한 줄 더 읽어 다음 쪽이 있는지 안다. 줄 수를 따로 세지 않는다.
    it('GET /admin/drop-prices/rows 는 필터와 쪽을 넘기고, 한 줄 더 읽어 더 있는지 알린다', async () => {
      prices.recent.mockResolvedValue([1, 2, 3].map((n) => ({ id: `r${n}` })))

      const res = await app.inject({
        method: 'GET',
        url: `/admin/drop-prices/rows?${QUERY}&limit=2&offset=4`,
      })

      expect(res.statusCode).toBe(200)
      expect(res.json()).toEqual({ rows: [{ id: 'r1' }, { id: 'r2' }], hasMore: true })
      expect(prices.recent).toHaveBeenCalledWith(FILTER, 3, 4)
    })

    it('필터가 없으면 null 둘 · 모든 획득처 · 50줄이고, 기간 모양 · 줄 수 · 획득처가 틀리면 400 이다', async () => {
      prices.recent.mockResolvedValue([])

      const res = await app.inject({ method: 'GET', url: '/admin/drop-prices/rows' })
      expect(res.statusCode).toBe(200)
      expect(res.json()).toEqual({ rows: [], hasMore: false })
      expect(prices.recent).toHaveBeenCalledWith(
        { itemKey: null, periodCode: null, source: 'all' },
        51,
        0,
      )

      for (const bad of ['periodCode=2026-10-08', 'limit=5000', 'source=Ring-Box']) {
        const r = await app.inject({ method: 'GET', url: `/admin/drop-prices/rows?${bad}` })
        expect(r.statusCode).toBe(400)
      }
    })

    it('아이템 목록과 점그림은 같은 필터로 읽고, 기간 목록을 따로 낸다', async () => {
      prices.items.mockResolvedValue([{ itemKey: 'ring' }])
      prices.points.mockResolvedValue([{ priceMeso: 1 }])
      prices.periods.mockResolvedValue(['W202641'])

      const items = await app.inject({ method: 'GET', url: `/admin/drop-prices/items?${QUERY}` })
      const points = await app.inject({ method: 'GET', url: `/admin/drop-prices/points?${QUERY}` })
      const periods = await app.inject({ method: 'GET', url: '/admin/drop-prices/periods' })

      expect([items.json(), points.json(), periods.json()]).toEqual([
        [{ itemKey: 'ring' }],
        [{ priceMeso: 1 }],
        ['W202641'],
      ])
      expect(prices.items).toHaveBeenCalledWith(FILTER)
      expect(prices.points).toHaveBeenCalledWith(FILTER)
    })
  })

  describe('드롭 시세', () => {
    it('범위를 안 주면 장비 general 이고, ring 이 없으면 반지가 아닌 시세로 읽는다', async () => {
      market.overview.mockResolvedValue([])
      market.detail.mockResolvedValue({ itemName: null, candles: [], rows: [] })

      expect((await app.inject({ method: 'GET', url: '/admin/drop-market/rows' })).statusCode).toBe(
        200,
      )
      expect(market.overview).toHaveBeenCalledWith(
        { kind: 'equipment', key: 'general' },
        expect.any(Date),
      )

      await app.inject({
        method: 'GET',
        url: '/admin/drop-market/item/rows?kind=consumable&key=scania&item=life_whetstone',
      })
      expect(market.detail).toHaveBeenLastCalledWith(
        { kind: 'consumable', key: 'scania' },
        { itemKey: 'life_whetstone', ringLevel: null },
        expect.any(Date),
      )
      await app.inject({ method: 'GET', url: '/admin/drop-market/item/rows?item=ring&ring=4' })
      expect(market.detail).toHaveBeenLastCalledWith(
        { kind: 'equipment', key: 'general' },
        { itemKey: 'ring', ringLevel: 4 },
        expect.any(Date),
      )

      const noItem = await app.inject({ method: 'GET', url: '/admin/drop-market/item/rows' })
      expect(noItem.statusCode).toBe(400)
      const badKind = await app.inject({ method: 'GET', url: '/admin/drop-market/rows?kind=etc' })
      expect(badKind.statusCode).toBe(400)
    })

    // 아이템 화면은 메뉴에 없다. 목록의 하위 화면이라 메뉴는 드롭 시세에 머문다.
    it('아이템 화면은 HTML 이고 메뉴는 드롭 시세를 가리킨다', async () => {
      const res = await app.inject({ method: 'GET', url: '/admin/drop-market/item?item=ring' })

      expect(res.headers['content-type']).toContain('text/html')
      expect(res.body.match(/<a [^>]*aria-current="page"[^>]*>/g)).toEqual([
        '<a href="/admin/drop-market" aria-current="page">',
      ])
    })

    it('차트 라이브러리를 서버가 직접 내보낸다', async () => {
      const res = await app.inject({ method: 'GET', url: '/admin/assets/lightweight-charts.js' })

      expect(res.statusCode).toBe(200)
      expect(res.headers['content-type']).toContain('javascript')
      expect(res.body).toContain('LightweightCharts')
    })
  })

  describe('게임 데이터 표 넷', () => {
    it('GET rows 넷은 리포지토리의 칸을 그대로 내고, 상자는 이름을 붙인다', async () => {
      const itemSection = {
        updatedAt: null,
        items: [
          { key: 'restraint_ring', name: '리스트레인트 링', iconAssetId: null, isValuable: false },
        ],
      }
      items.section.mockResolvedValue(itemSection)
      items.adminSection.mockResolvedValue(itemSection)
      boxes.adminRows.mockResolvedValue({
        updatedAt: null,
        boxes: [
          {
            item: 'green_boss_ring_box',
            ringLevelMin: 1,
            ringLevelMax: 3,
            contents: ['restraint_ring'],
          },
        ],
      })
      drops.rows.mockResolvedValue([])
      crystals.pairs.mockResolvedValue([])
      crystals.section.mockResolvedValue({ updatedAt: null, bossCrystalPrices: [] })
      bosses.catalog.mockResolvedValue({ updatedAt: null, bosses: [] })
      rulesRepo.section.mockResolvedValue({
        updatedAt: null,
        gameRules: { defaultMaxPartySize: 6 },
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

    it('그림 칸이 그림 표에 없는 그림을 가리키면 400 이다', async () => {
      huntLootRepo.create.mockRejectedValue(new AssetNotFound(ROW))
      const res = await app.inject({
        method: 'POST',
        url: '/admin/hunt-loot',
        payload: {
          key: 'reindeer_milk',
          type: 'consumable',
          name: '순록의 우유',
          iconAssetId: ROW,
          npcPriceMeso: 2750,
        },
      })
      expect(res.statusCode).toBe(400)
      expect(res.json<{ message: string }>().message).toContain(ROW)
    })

    it('상자의 레벨 범위는 둘 다 있거나 둘 다 없어야 400 이 아니다', async () => {
      boxes.create.mockResolvedValue({ id: ROW })
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/admin/drop-boxes',
            payload: { item: 'green_boss_ring_box', ringLevelMin: 1 },
          })
        ).statusCode,
      ).toBe(400)
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/admin/drop-boxes',
            payload: { item: 'green_boss_ring_box', ringLevelMin: 3, ringLevelMax: 1 },
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
        ringLevelMin: null,
        ringLevelMax: null,
      })
    })

    // 드롭 기록은 상자를 적지 않아, 한 난이도에서 상자가 하나로 정해지지 않는 저장은 관리 화면에 이유를 보여 주고 막는다.
    it('상자가 하나로 정해지지 않는 드롭 표 줄 · 상자 내용물은 409 이고 이유를 싣는다', async () => {
      const ambiguous = new AmbiguousDropBox(
        '한 난이도의 두 상자에 같은 아이템을 넣을 수 없다: lotus/hard restraint_ring',
      )
      drops.create.mockRejectedValueOnce(ambiguous)
      boxes.addContent.mockRejectedValueOnce(ambiguous)

      const created = await app.inject({
        method: 'POST',
        url: '/admin/boss-drops',
        payload: { boss: 'lotus', difficulty: 'hard', category: 'consumable', item: 'black_box' },
      })
      const added = await app.inject({
        method: 'POST',
        url: '/admin/drop-boxes/black_box/contents',
        payload: { item: 'restraint_ring' },
      })

      for (const response of [created, added]) {
        expect([response.statusCode, response.json<{ message: string }>().message]).toEqual([
          409,
          ambiguous.message,
        ])
      }
    })

    // 드롭 기록은 그 보스에서 얻을 수 있는 아이템만 받아, 줄을 지우면 그 아이템의 지난 드롭이 동기화에서 거절된다. 보스가 주는
    // 것이 바뀌면 줄을 지우지 않고 기간으로 끝낸다.
    it('드롭 표 줄은 더하고 고치고 옮기며 지우는 경로는 없다. 기간 글자가 틀리면 400 이다', async () => {
      drops.create.mockResolvedValue({ id: ROW })
      const body = {
        boss: 'lotus',
        difficulty: 'hard',
        category: 'consumable',
        item: 'red_boss_ring_box',
        validFrom: '2026-09-17T10:00',
      }
      expect(
        (await app.inject({ method: 'POST', url: '/admin/boss-drops', payload: body })).statusCode,
      ).toBe(201)
      expect(drops.create).toHaveBeenCalledWith({ ...body, quantity: null, validUntil: null })
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/admin/boss-drops',
            payload: { ...body, validFrom: '2026-9-17' },
          })
        ).statusCode,
      ).toBe(400)
      drops.update.mockResolvedValue(true)
      expect(
        (
          await app.inject({
            method: 'PUT',
            url: `/admin/boss-drops/${ROW}`,
            payload: { validUntil: '2026-09-17' },
          })
        ).statusCode,
      ).toBe(204)
      expect(drops.update).toHaveBeenCalledWith(ROW, {
        quantity: null,
        validFrom: null,
        validUntil: '2026-09-17',
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
            payload: { priceMeso: 100, validFrom: '2026-10-22' },
          })
        ).statusCode,
      ).toBe(201)
      expect(crystals.addPrice).toHaveBeenCalledWith('lotus', 'hard', {
        priceMeso: 100,
        validFrom: '2026-10-22',
      })
      crystals.addPrice.mockRejectedValue(new NotBoundary('2026-10-23'))
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/admin/crystal-prices/lotus/hard',
            payload: { priceMeso: 100, validFrom: '2026-10-23' },
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
      payload: { validUntil: '2026-11-05' },
    })
    expect(ok.statusCode).toBe(204)
    expect(bosses.setPeriod).toHaveBeenCalledWith('meirin', { validUntil: '2026-11-05' })

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
          payload: { validFrom: '2026-11-05', validUntil: '2026-07-03' },
        })
      ).statusCode,
    ).toBe(400)
  })

  it('PUT /admin/bosses/:key/short-name 은 앞뒤 공백을 걷어 적고 204, 모르는 보스는 404, 빈 이름은 400 이다', async () => {
    bosses.setShortName.mockResolvedValue(true)
    const ok = await app.inject({
      method: 'PUT',
      url: '/admin/bosses/meirin/short-name',
      payload: { shortName: ' 메이린 ' },
    })
    expect(ok.statusCode).toBe(204)
    expect(bosses.setShortName).toHaveBeenCalledWith('meirin', '메이린')

    bosses.setShortName.mockResolvedValue(false)
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: '/admin/bosses/nobody/short-name',
          payload: { shortName: '누구' },
        })
      ).statusCode,
    ).toBe(404)
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: '/admin/bosses/meirin/short-name',
          payload: { shortName: '  ' },
        })
      ).statusCode,
    ).toBe(400)
  })

  it('PUT /admin/bosses/:key/difficulties/:difficulty/period 는 204, 모르는 조합은 404 다', async () => {
    bosses.setDifficultyPeriod.mockResolvedValue(true)
    const ok = await app.inject({
      method: 'PUT',
      url: '/admin/bosses/lotus/difficulties/extreme/period',
      payload: { validFrom: '2026-11-05T10:00' },
    })
    expect(ok.statusCode).toBe(204)
    expect(bosses.setDifficultyPeriod).toHaveBeenCalledWith('lotus', 'extreme', {
      validFrom: '2026-11-05T10:00',
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

  it('PUT /admin/bosses/:key/difficulties/:difficulty 는 새 줄의 주기 · 유효 기간도 함께 넘기고, 주기가 없으면 400 이다', async () => {
    bosses.upsertDifficulty.mockResolvedValue(true)
    const res = await app.inject({
      method: 'PUT',
      url: '/admin/bosses/bardrix/difficulties/extreme',
      payload: { cycle: 'monthly', requiredLevel: 290, validFrom: '2026-10-22T10:00' },
    })
    expect(res.statusCode).toBe(204)
    expect(bosses.upsertDifficulty).toHaveBeenCalledWith('bardrix', {
      difficulty: 'extreme',
      cycle: 'monthly',
      requiredLevel: 290,
      validFrom: '2026-10-22T10:00',
      validUntil: null,
    })
    const noCycle = await app.inject({
      method: 'PUT',
      url: '/admin/bosses/bardrix/difficulties/extreme',
      payload: { requiredLevel: 290 },
    })
    expect(noCycle.statusCode).toBe(400)
  })

  describe('지출 카탈로그', () => {
    it('rows 는 관리 줄 그대로이고, 묶음은 201 · 같은 key 409 · 모르면 404 다', async () => {
      const section = {
        updatedAt: null,
        rewardTypes: [],
        groups: [],
        tiles: [],
        items: [],
        itemOptions: [],
        itemRewardTypes: [],
      }
      spendRepo.adminRows.mockResolvedValue(section)
      expect(
        (await app.inject({ method: 'GET', url: '/admin/spend-catalog/rows' })).json(),
      ).toEqual(section)

      spendRepo.createGroup.mockResolvedValue({ id: ROW })
      const created = await app.inject({
        method: 'POST',
        url: '/admin/spend-catalog/groups',
        payload: { key: 'event', name: '이벤트', category: 'event_bm', cardTitle: '이벤트' },
      })
      expect(created.statusCode).toBe(201)
      expect(spendRepo.createGroup).toHaveBeenCalledWith({
        key: 'event',
        name: '이벤트',
        category: 'event_bm',
        cardTitle: '이벤트',
        isActive: true,
      })
      spendRepo.createGroup.mockRejectedValue(new SpendGroupExists('event'))
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/admin/spend-catalog/groups',
            payload: { key: 'event', name: '이벤트', category: 'event_bm', cardTitle: '이벤트' },
          })
        ).statusCode,
      ).toBe(409)
      spendRepo.createGroup.mockRejectedValue(new NoSpendCategory('hunting'))
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/admin/spend-catalog/groups',
            payload: { key: 'hunt', name: '사냥', category: 'hunting', cardTitle: '사냥' },
          })
        ).statusCode,
      ).toBe(404)
      spendRepo.updateGroup.mockResolvedValue(false)
      expect(
        (
          await app.inject({
            method: 'PUT',
            url: '/admin/spend-catalog/groups/nobody',
            payload: { name: 'x', category: 'buff', cardTitle: 'x', isActive: false },
          })
        ).statusCode,
      ).toBe(404)
    })

    it('항목은 nullish 칸을 null 로 넘기고 축 값 · 추가 리워드 종류가 비면 빈 배열이다. 모양 오류는 400, 모르는 타일은 404 다', async () => {
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
        rewardCoinQuantity: null,
        validFrom: null,
        validUntil: null,
        options: [],
        rewardTypes: [],
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
              validFrom: '2026-10-22',
              validUntil: '2026-10-01',
            },
          })
        ).statusCode,
      ).toBe(400)
    })
  })

  describe('가계부 분류', () => {
    const hexa = {
      entryType: 'spend',
      key: 'hexa_skill',
      name: '헥사 스킬 강화',
      cardTitle: '헥사강화',
      iconAssetId: ROW,
    }

    it('분류를 더하면 빈 설명 · 단위를 채워 넘기고, 같은 쪽의 같은 key 는 409, 그림 표에 없는 그림은 400 이다', async () => {
      cashbookRepo.createCategory.mockResolvedValue({ id: ROW })
      const created = await app.inject({
        method: 'POST',
        url: '/admin/cashbook-categories',
        payload: hexa,
      })
      expect(created.statusCode).toBe(201)
      expect(cashbookRepo.createCategory).toHaveBeenCalledWith({
        ...hexa,
        description: '',
        unit: null,
      })
      cashbookRepo.createCategory.mockRejectedValue(new CashbookCategoryExists('spend.hexa_skill'))
      expect(
        (await app.inject({ method: 'POST', url: '/admin/cashbook-categories', payload: hexa }))
          .statusCode,
      ).toBe(409)
      cashbookRepo.createCategory.mockRejectedValue(new AssetNotFound(ROW))
      expect(
        (await app.inject({ method: 'POST', url: '/admin/cashbook-categories', payload: hexa }))
          .statusCode,
      ).toBe(400)
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/admin/cashbook-categories',
            payload: { ...hexa, entryType: 'transfer' },
          })
        ).statusCode,
      ).toBe(400)
    })

    it('분류 고치기 · 옮기기는 수입 · 지출과 key 로 찾고, 모르면 404 다', async () => {
      cashbookRepo.updateCategory.mockResolvedValue(true)
      const body = {
        name: '사냥',
        cardTitle: '사냥',
        iconAssetId: ROW,
        description: '',
        unit: '소재',
      }
      expect(
        (
          await app.inject({
            method: 'PUT',
            url: '/admin/cashbook-categories/income/hunting',
            payload: body,
          })
        ).statusCode,
      ).toBe(204)
      expect(cashbookRepo.updateCategory).toHaveBeenCalledWith('income', 'hunting', body)
      cashbookRepo.moveCategory.mockResolvedValue(false)
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/admin/cashbook-categories/spend/nobody/move',
            payload: { direction: 'up' },
          })
        ).statusCode,
      ).toBe(404)
    })

    it('아이템 종류는 단위를 비우면 수량 없음으로 넘기고, 추가 리워드 종류는 이름만 바꾼다', async () => {
      cashbookRepo.updateItemType.mockResolvedValue(true)
      expect(
        (
          await app.inject({
            method: 'PUT',
            url: '/admin/cashbook-item-types/equipment',
            payload: { name: '장비', hasTariff: true },
          })
        ).statusCode,
      ).toBe(204)
      expect(cashbookRepo.updateItemType).toHaveBeenCalledWith('equipment', {
        name: '장비',
        unit: null,
        hasTariff: true,
      })
      spendRepo.updateRewardType.mockResolvedValue(true)
      expect(
        (
          await app.inject({
            method: 'PUT',
            url: '/admin/spend-catalog/reward-types/exp',
            payload: { name: '경험치' },
          })
        ).statusCode,
      ).toBe(204)
      expect(spendRepo.updateRewardType).toHaveBeenCalledWith('exp', '경험치')
      expect(
        (
          await app.inject({
            method: 'PUT',
            url: '/admin/spend-catalog/reward-types/meso',
            payload: { name: '메소' },
          })
        ).statusCode,
      ).toBe(400)
    })
  })

  describe('사냥 전리품', () => {
    const milk = {
      key: 'reindeer_milk',
      type: 'consumable',
      name: '순록의 우유',
      iconAssetId: ROW,
      npcPriceMeso: 2750,
    }
    const magnifier = {
      key: 'suspicious_magnifier',
      type: 'event',
      name: '수상한 돋보기',
      iconAssetId: ROW,
      validFrom: '2026-10-22',
      validUntil: '2026-11-19',
    }
    const post = (payload: object) =>
      app.inject({ method: 'POST', url: '/admin/hunt-loot', payload })

    it('더하면 빈 가격 · 기간을 null 로 채워 넘기고, 같은 key 는 409 다', async () => {
      huntLootRepo.create.mockResolvedValue({ id: ROW })
      expect((await post(milk)).statusCode).toBe(201)
      expect(huntLootRepo.create).toHaveBeenCalledWith({
        ...milk,
        validFrom: null,
        validUntil: null,
      })
      expect((await post(magnifier)).statusCode).toBe(201)
      expect(huntLootRepo.create).toHaveBeenLastCalledWith({ ...magnifier, npcPriceMeso: null })
      huntLootRepo.create.mockRejectedValue(new HuntLootExists('reindeer_milk'))
      expect((await post(milk)).statusCode).toBe(409)
      huntLootRepo.create.mockRejectedValue(new HuntLootNameTaken('milk'))
      expect((await post(milk)).statusCode).toBe(409)
    })

    it('NPC 가격이 종류와 안 맞거나 기간이 거꾸로이거나 그림이 줄 id 가 아니면 400 이고 리포지토리를 안 부른다', async () => {
      expect((await post({ ...milk, npcPriceMeso: null })).statusCode).toBe(400)
      expect((await post({ ...magnifier, npcPriceMeso: 100 })).statusCode).toBe(400)
      expect(
        (await post({ ...magnifier, validFrom: '2026-11-19', validUntil: '2026-10-22' }))
          .statusCode,
      ).toBe(400)
      expect((await post({ ...milk, iconAssetId: 'reindeer_milk.png' })).statusCode).toBe(400)
      expect(huntLootRepo.create).not.toHaveBeenCalled()
    })

    it('고치기 · 옮기기는 key 로 찾고 모르면 404, 가격이 종류와 안 맞으면 400 이다', async () => {
      const body = { name: '순록의 우유', iconAssetId: ROW, npcPriceMeso: 3000 }
      const put = () =>
        app.inject({ method: 'PUT', url: '/admin/hunt-loot/reindeer_milk', payload: body })
      huntLootRepo.update.mockResolvedValue(true)
      expect((await put()).statusCode).toBe(204)
      expect(huntLootRepo.update).toHaveBeenCalledWith('reindeer_milk', {
        ...body,
        validFrom: null,
        validUntil: null,
      })
      huntLootRepo.update.mockResolvedValue(false)
      expect((await put()).statusCode).toBe(404)
      huntLootRepo.update.mockRejectedValue(new HuntLootPriceShape('reindeer_milk'))
      expect((await put()).statusCode).toBe(400)
      huntLootRepo.move.mockResolvedValue(false)
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/admin/hunt-loot/nobody/move',
            payload: { direction: 'up' },
          })
        ).statusCode,
      ).toBe(404)
    })
  })

  describe('FAQ', () => {
    const createSheet = (payload: object) =>
      app.inject({ method: 'POST', url: '/admin/faqs/sheets', payload })
    const createItem = (payload: object) =>
      app.inject({ method: 'POST', url: '/admin/faqs/sheets/boss-manage/items', payload })

    it('묶음 화면은 HTML 이고 메뉴는 FAQ 에 표시를 단다', async () => {
      const res = await app.inject({ method: 'GET', url: '/admin/faqs/sheets/boss-manage' })
      expect(res.statusCode).toBe(200)
      expect(res.headers['content-type']).toContain('text/html')
      expect(res.headers['cache-control']).toBe('no-store')
      expect(res.body.match(/<a [^>]*aria-current="page"[^>]*>/g)).toEqual([
        '<a href="/admin/faqs" aria-current="page">',
      ])
    })

    it('묶음 key 는 소문자 · 숫자 · 붙임표만 받는다. 모양이 틀리면 400 이고 리포지토리를 안 부르며, 같은 key 는 409 다', async () => {
      faqRepo.createSheet.mockResolvedValue({ id: ROW })
      expect((await createSheet({ key: 'boss-manage', title: ' 보스 관리 ' })).statusCode).toBe(201)
      expect(faqRepo.createSheet).toHaveBeenCalledWith({ key: 'boss-manage', title: '보스 관리' })
      expect((await createSheet({ key: 'settings-2fa', title: '보안' })).statusCode).toBe(201)

      for (const key of [
        'BossManage',
        'boss_manage',
        '-boss',
        'boss-',
        'boss--manage',
        '보스',
        '',
      ]) {
        expect((await createSheet({ key, title: '보스 관리' })).statusCode).toBe(400)
      }
      expect((await createSheet({ key: 'boss-manage', title: '  ' })).statusCode).toBe(400)
      expect(faqRepo.createSheet).toHaveBeenCalledTimes(2)

      faqRepo.createSheet.mockRejectedValue(new FaqSheetExists('boss-manage'))
      expect((await createSheet({ key: 'boss-manage', title: '보스 관리' })).statusCode).toBe(409)
    })

    // 앱은 빈 줄에서 문단을 나눠 그린다. 빈 줄이 여럿이거나 공백만 든 줄이 섞이면 빈 문단이 그려진다.
    it('답은 빈 줄로 나눈 문단마다 앞뒤 공백을 걷고 빈 문단을 버려 빈 줄 하나로 이은 글이 된다', async () => {
      const answer =
        '  추가 버튼을 누릅니다.\n이름을 고릅니다.  \n\n \n\n  다시 켜면 보입니다. \n\n'
      const blocks = '추가 버튼을 누릅니다.\n이름을 고릅니다.\n\n다시 켜면 보입니다.'
      faqRepo.createItem.mockResolvedValue({ id: ROW })
      expect((await createItem({ question: ' 보스는 어떻게 더하나요? ', answer })).statusCode).toBe(
        201,
      )
      expect(faqRepo.createItem).toHaveBeenCalledWith('boss-manage', {
        question: '보스는 어떻게 더하나요?',
        answer: blocks,
      })

      faqRepo.updateItem.mockResolvedValue(true)
      const put = await app.inject({
        method: 'PUT',
        url: '/admin/faqs/items/' + ROW,
        payload: { question: '보스 추가', answer },
      })
      expect(put.statusCode).toBe(204)
      expect(faqRepo.updateItem).toHaveBeenCalledWith(ROW, {
        question: '보스 추가',
        answer: blocks,
      })
    })

    it('질문이 비거나 답에 문단이 없으면 400 이고 리포지토리를 안 부른다', async () => {
      expect((await createItem({ question: '  ', answer: '추가 버튼' })).statusCode).toBe(400)
      expect((await createItem({ question: '보스 추가', answer: ' \n\n  \n' })).statusCode).toBe(
        400,
      )
      expect(faqRepo.createItem).not.toHaveBeenCalled()
    })

    it('모르는 묶음과 문항은 404 다', async () => {
      faqRepo.createItem.mockRejectedValue(new NoFaqSheet('boss-manage'))
      expect((await createItem({ question: '보스 추가', answer: '추가 버튼' })).statusCode).toBe(
        404,
      )

      faqRepo.updateSheet.mockResolvedValue(false)
      faqRepo.removeSheet.mockResolvedValue(false)
      faqRepo.moveSheet.mockResolvedValue(false)
      faqRepo.updateItem.mockResolvedValue(false)
      faqRepo.removeItem.mockResolvedValue(false)
      faqRepo.moveItem.mockResolvedValue(false)
      const move = { direction: 'up' }
      for (const [method, url, payload] of [
        ['PUT', '/admin/faqs/sheets/nobody', { title: '누구' }],
        ['DELETE', '/admin/faqs/sheets/nobody', undefined],
        ['POST', '/admin/faqs/sheets/nobody/move', move],
        ['PUT', '/admin/faqs/items/' + ROW, { question: '누구', answer: '누구' }],
        ['DELETE', '/admin/faqs/items/' + ROW, undefined],
        ['POST', '/admin/faqs/items/' + ROW + '/move', move],
      ] as const) {
        expect((await app.inject({ method, url, payload })).statusCode).toBe(404)
      }
    })
  })

  describe('심볼 비용', () => {
    it('rows 는 관리 줄이고, 묶음 수정은 비용 줄 위로 내리면 409, 심볼은 모르는 묶음이면 404 · 그림 표에 없는 그림이면 400 이다', async () => {
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
            payload: {
              key: 'arcane',
              name: '아케인',
              maxLevel: 20,
              defaultFromLevel: 7,
              defaultToLevel: 12,
            },
          })
        ).statusCode,
      ).toBe(201)
      expect(symbolRepo.createGroup).toHaveBeenCalledWith({
        key: 'arcane',
        name: '아케인',
        maxLevel: 20,
        defaultFromLevel: 7,
        defaultToLevel: 12,
      })
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/admin/symbol-costs/groups',
            payload: {
              key: 'arcane',
              name: '아케인',
              maxLevel: 20,
              defaultFromLevel: 12,
              defaultToLevel: 7,
            },
          })
        ).statusCode,
      ).toBe(400)
      symbolRepo.updateGroup.mockRejectedValue(new LevelsAboveMax('19'))
      expect(
        (
          await app.inject({
            method: 'PUT',
            url: '/admin/symbol-costs/groups/arcane',
            payload: { name: '아케인', maxLevel: 10, defaultFromLevel: 1, defaultToLevel: 2 },
          })
        ).statusCode,
      ).toBe(409)
      const tallahart = {
        key: 'tallahart',
        group: 'nobody',
        name: '탈라하트',
        requiredLevel: 290,
        iconAssetId: ROW,
      }
      const postSymbol = (payload: object) =>
        app.inject({ method: 'POST', url: '/admin/symbol-costs/symbols', payload })
      symbolRepo.createSymbol.mockRejectedValue(new NoSymbolGroup('nobody'))
      expect((await postSymbol(tallahart)).statusCode).toBe(404)
      expect(symbolRepo.createSymbol).toHaveBeenCalledWith(tallahart)
      symbolRepo.createSymbol.mockRejectedValue(new AssetNotFound(ROW))
      const missing = await postSymbol(tallahart)
      expect(missing.statusCode).toBe(400)
      expect(missing.json<{ message: string }>().message).toContain(ROW)
      expect((await postSymbol({ ...tallahart, iconAssetId: 't.webp' })).statusCode).toBe(400)
      symbolRepo.updateSymbol.mockRejectedValue(new AssetNotFound(ROW))
      expect(
        (
          await app.inject({
            method: 'PUT',
            url: '/admin/symbol-costs/symbols/tallahart',
            payload: { name: '탈라하트', requiredLevel: 290, iconAssetId: ROW },
          })
        ).statusCode,
      ).toBe(400)
    })

    it('비용은 시작 없이도 넘기고 빠진 레벨은 400, 거두기는 유일한 줄이면 409 · 없으면 404 다', async () => {
      symbolRepo.addCosts.mockResolvedValue({ inserted: 2 })
      const added = await app.inject({
        method: 'POST',
        url: '/admin/symbol-costs/symbols/tallahart/costs',
        payload: {
          costs: [
            { fromLevel: 1, costMeso: 100 },
            { fromLevel: 2, costMeso: 200 },
          ],
        },
      })
      expect(added.statusCode).toBe(201)
      expect(symbolRepo.addCosts).toHaveBeenCalledWith('tallahart', {
        validFrom: null,
        costs: [
          { fromLevel: 1, costMeso: 100 },
          { fromLevel: 2, costMeso: 200 },
        ],
      })
      symbolRepo.addCosts.mockRejectedValue(new LevelsIncomplete('3'))
      const incomplete = await app.inject({
        method: 'POST',
        url: '/admin/symbol-costs/symbols/tallahart/costs',
        payload: { validFrom: '2026-10-22', costs: [{ fromLevel: 1, costMeso: 100 }] },
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

  describe('헥사 매트릭스', () => {
    const type = {
      key: 'skill_3rd',
      name: '3rd 스킬 코어',
      apiType: '스킬 코어',
      iconAssetId: ROW,
    }
    const core = { jobId: ROW, name: '인페르날 웨이브', typeKey: 'skill', iconAssetId: ROW }
    const send = (method: 'POST' | 'PUT' | 'DELETE', url: string, payload?: object) =>
      app.inject({ method, url: `/admin/hexa-matrix${url}`, payload })

    it('종류는 기본값을 채워 넘기고, 같은 넥슨 타입의 기본 종류가 겹치면 409 · 그림 표에 없는 그림은 400 이다', async () => {
      hexaRepo.createType.mockResolvedValue({ id: ROW })
      expect((await send('POST', '/types', type)).statusCode).toBe(201)
      expect(hexaRepo.createType).toHaveBeenCalledWith({ ...type, isDefault: false, maxLevel: 30 })
      hexaRepo.createType.mockRejectedValue(new DefaultTypeTaken('skill'))
      expect((await send('POST', '/types', { ...type, isDefault: true })).statusCode).toBe(409)
      hexaRepo.createType.mockRejectedValue(new AssetNotFound(ROW))
      expect((await send('POST', '/types', type)).statusCode).toBe(400)
      expect((await send('POST', '/types', { ...type, iconAssetId: 'x.webp' })).statusCode).toBe(
        400,
      )
    })

    it('종류 고치기는 모르면 404, 기본 종류가 겹치거나 만렙이 비용 줄 아래면 409 다', async () => {
      const body = { name: type.name, apiType: type.apiType, isDefault: false, maxLevel: 30 }
      hexaRepo.updateType.mockResolvedValue(true)
      expect(
        (await send('PUT', '/types/skill_3rd', { ...body, iconAssetId: ROW })).statusCode,
      ).toBe(204)
      expect(hexaRepo.updateType).toHaveBeenCalledWith('skill_3rd', { ...body, iconAssetId: ROW })
      hexaRepo.updateType.mockResolvedValue(false)
      expect(
        (await send('PUT', '/types/skill_3rd', { ...body, iconAssetId: ROW })).statusCode,
      ).toBe(404)
      hexaRepo.updateType.mockRejectedValue(new DefaultTypeTaken('skill'))
      expect(
        (await send('PUT', '/types/skill_3rd', { ...body, iconAssetId: ROW })).statusCode,
      ).toBe(409)
      hexaRepo.updateType.mockRejectedValue(new HexaLevelsAboveMax('29'))
      expect(
        (await send('PUT', '/types/skill_3rd', { ...body, iconAssetId: ROW })).statusCode,
      ).toBe(409)
    })

    it('비용 갈아 끼우기는 레벨이 어긋나면 400 이고 그 이유를 싣는다. 모르는 종류는 404 다', async () => {
      const costs = [{ fromLevel: 0, fragmentQuantity: 140, solErdaQuantity: 7 }]
      hexaRepo.replaceCosts.mockResolvedValue(undefined)
      expect((await send('PUT', '/types/skill_3rd/costs', { costs })).statusCode).toBe(204)
      expect(hexaRepo.replaceCosts).toHaveBeenCalledWith('skill_3rd', costs)
      expect(
        (
          await send('PUT', '/types/skill_3rd/costs', {
            costs: [{ ...costs[0], fragmentQuantity: -1 }],
          })
        ).statusCode,
      ).toBe(400)
      hexaRepo.replaceCosts.mockRejectedValue(new CostLevelsMismatch('레벨 1 의 비용이 없다'))
      const mismatch = await send('PUT', '/types/skill_3rd/costs', { costs })
      expect(mismatch.statusCode).toBe(400)
      expect(mismatch.json<{ message: string }>().message).toContain('레벨 1 의 비용이 없다')
      hexaRepo.replaceCosts.mockRejectedValue(new NoHexaType('nobody'))
      expect((await send('PUT', '/types/nobody/costs', { costs })).statusCode).toBe(404)
    })

    it('직업은 이름을 걷어 넘기고, 같은 이름은 409 · 모르는 직업 고치기는 404 다', async () => {
      hexaRepo.createJob.mockResolvedValue({ id: ROW })
      expect((await send('POST', '/jobs', { name: ' 렌 ' })).statusCode).toBe(201)
      expect(hexaRepo.createJob).toHaveBeenCalledWith({ name: '렌' })
      hexaRepo.createJob.mockRejectedValue(new JobExists('렌'))
      expect((await send('POST', '/jobs', { name: '렌' })).statusCode).toBe(409)
      hexaRepo.updateJob.mockResolvedValue(false)
      expect((await send('PUT', `/jobs/${ROW}`, { name: '렌' })).statusCode).toBe(404)
      hexaRepo.updateJob.mockRejectedValue(new JobExists('렌'))
      expect((await send('PUT', `/jobs/${ROW}`, { name: '렌' })).statusCode).toBe(409)
    })

    it('코어는 직업 줄 id · 종류 key · 그림 줄 id 를 넘기고, 모르는 직업 · 종류 · 그림은 400 · 같은 이름은 409 · 모르는 줄은 404 다', async () => {
      hexaRepo.createCore.mockResolvedValue({ id: ROW })
      expect((await send('POST', '/cores', core)).statusCode).toBe(201)
      expect(hexaRepo.createCore).toHaveBeenCalledWith(core)
      for (const rejection of [new NoJob(ROW), new NoHexaType('x'), new AssetNotFound(ROW)]) {
        hexaRepo.createCore.mockRejectedValue(rejection)
        expect((await send('POST', '/cores', core)).statusCode).toBe(400)
      }
      hexaRepo.createCore.mockRejectedValue(new HexaCoreExists('x'))
      expect((await send('POST', '/cores', core)).statusCode).toBe(409)

      const update = { name: core.name, typeKey: core.typeKey, iconAssetId: ROW }
      hexaRepo.updateCore.mockResolvedValue(false)
      expect((await send('PUT', `/cores/${ROW}`, update)).statusCode).toBe(404)
      hexaRepo.updateCore.mockRejectedValue(new HexaCoreExists('x'))
      expect((await send('PUT', `/cores/${ROW}`, update)).statusCode).toBe(409)
      hexaRepo.removeCore.mockResolvedValue(false)
      expect((await send('DELETE', `/cores/${ROW}`)).statusCode).toBe(404)
      hexaRepo.moveCore.mockResolvedValue(true)
      expect((await send('POST', `/cores/${ROW}/move`, { direction: 'down' })).statusCode).toBe(204)
      expect(hexaRepo.moveCore).toHaveBeenCalledWith(ROW, 'down')
      expect((await send('DELETE', '/cores/not-a-uuid')).statusCode).toBe(400)
    })

    it('스탯은 활성화 조각을 비우면 null 로 넘기고, 모르는 key 고치기는 404 다', async () => {
      hexaRepo.createStat.mockResolvedValue({ id: ROW })
      expect(
        (await send('POST', '/stats', { key: 'hexa_stat_4', name: '헥사 스탯 Ⅳ' })).statusCode,
      ).toBe(201)
      expect(hexaRepo.createStat).toHaveBeenCalledWith({
        key: 'hexa_stat_4',
        name: '헥사 스탯 Ⅳ',
        activationFragmentQuantity: null,
      })
      hexaRepo.updateStat.mockResolvedValue(false)
      expect(
        (await send('PUT', '/stats/nobody', { name: 'x', activationFragmentQuantity: 1 }))
          .statusCode,
      ).toBe(404)
    })
  })

  describe('월드', () => {
    it('rows 는 칸 그대로이고, POST 는 201 · 같은 key 409, PUT 은 204 · 모르면 404, move 는 204 다', async () => {
      worldsRepo.adminSection.mockResolvedValue({ updatedAt: null, worlds: [] })
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
          emblemAssetId: ROW,
          isChallengers: true,
        },
      })
      expect(created.statusCode).toBe(201)
      expect(worldsRepo.create).toHaveBeenCalledWith({
        key: 'challengers_5',
        name: '챌린저스5',
        emblemAssetId: ROW,
        isChallengers: true,
        isEvent: false,
        tradeGroupKey: 'general',
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
            payload: { name: '스페셜', isEvent: true },
          })
        ).statusCode,
      ).toBe(204)
      expect(worldsRepo.update).toHaveBeenCalledWith('special', {
        name: '스페셜',
        emblemAssetId: null,
        isChallengers: false,
        isEvent: true,
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

    it('기간은 POST 201 · 모르는 월드 404 · 겹침과 순서 400 · 틀린 날짜 400, PUT 과 DELETE 는 204 · 모르면 404 다', async () => {
      const period = { validFrom: '2025-11-20', validUntil: '2025-12-19' }
      const send = (method: 'POST' | 'PUT' | 'DELETE', url: string, payload?: object) =>
        app.inject({ method, url, ...(payload === undefined ? {} : { payload }) })

      worldsRepo.addPeriod.mockResolvedValue({ id: ROW })
      const added = await send('POST', '/admin/worlds/special/periods', period)
      expect(added.statusCode).toBe(201)
      expect(added.json()).toEqual({ id: ROW })
      expect(worldsRepo.addPeriod).toHaveBeenCalledWith('special', period)
      worldsRepo.addPeriod.mockRejectedValueOnce(new NoWorld('nobody'))
      expect((await send('POST', '/admin/worlds/nobody/periods', period)).statusCode).toBe(404)
      worldsRepo.addPeriod.mockRejectedValueOnce(new PeriodOverlap('special'))
      expect((await send('POST', '/admin/worlds/special/periods', period)).statusCode).toBe(400)
      worldsRepo.addPeriod.mockRejectedValueOnce(new PeriodNotAfter('2025-11-20'))
      expect((await send('POST', '/admin/worlds/special/periods', period)).statusCode).toBe(400)

      worldsRepo.addPeriod.mockClear()
      for (const bad of [
        { validFrom: '2025-11-20T10:00', validUntil: '2025-12-19' },
        { validFrom: '2025-13-01', validUntil: '2025-12-19' },
        { validFrom: '2025-12-19', validUntil: '2025-11-20' },
        { validFrom: '2025-11-20' },
      ]) {
        expect((await send('POST', '/admin/worlds/special/periods', bad)).statusCode).toBe(400)
      }
      expect(worldsRepo.addPeriod).not.toHaveBeenCalled()

      worldsRepo.updatePeriod.mockResolvedValue(true)
      expect((await send('PUT', `/admin/worlds/periods/${ROW}`, period)).statusCode).toBe(204)
      expect(worldsRepo.updatePeriod).toHaveBeenCalledWith(ROW, period)
      worldsRepo.updatePeriod.mockResolvedValueOnce(false)
      expect((await send('PUT', `/admin/worlds/periods/${ROW}`, period)).statusCode).toBe(404)
      worldsRepo.updatePeriod.mockRejectedValueOnce(new PeriodOverlap('special'))
      expect((await send('PUT', `/admin/worlds/periods/${ROW}`, period)).statusCode).toBe(400)

      worldsRepo.removePeriod.mockResolvedValue(true)
      expect((await send('DELETE', `/admin/worlds/periods/${ROW}`)).statusCode).toBe(204)
      expect(worldsRepo.removePeriod).toHaveBeenCalledWith(ROW)
      worldsRepo.removePeriod.mockResolvedValueOnce(false)
      expect((await send('DELETE', `/admin/worlds/periods/${ROW}`)).statusCode).toBe(404)
    })
  })

  describe('컨텐츠', () => {
    const highMountain = {
      apiName: '에픽 던전 : 하이마운틴',
      category: 'epic_dungeon',
      name: '하이마운틴',
      shortName: '하이마운틴',
      backgroundPortraitAssetId: ROW,
      type: 'contents',
      checkType: 'count_only',
      maxCount: 5,
      requiredLevel: 260,
      shareScope: 'account',
    }
    const highMountainFields = {
      apiName: '에픽 던전 : 하이마운틴',
      category: 'epic_dungeon',
      name: '하이마운틴',
      shortName: '하이마운틴',
      countTag: null,
      type: 'contents',
      checkType: 'count_only',
      maxCount: 5,
      requiredLevel: 260,
      validFrom: null,
      validUntil: null,
      shareScope: 'account',
      backgroundMapAssetId: null,
      backgroundPortraitAssetId: ROW,
      regionIconAssetId: null,
    }

    it('rows 는 관리 줄 그대로이고, 분류는 PUT 204 · 모르면 404, move 는 204 다', async () => {
      contentsRepo.adminRows.mockResolvedValue({ updatedAt: null, categories: [], contents: [] })
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
            payload: {
              name: '에픽 던전',
              countTag: 'ID당 1회',
              weeklyMaxCount: 3,
              sharedSortOrder: 2,
            },
          })
        ).statusCode,
      ).toBe(204)
      expect(contentsRepo.updateCategory).toHaveBeenCalledWith('epic_dungeon', {
        name: '에픽 던전',
        countTag: 'ID당 1회',
        hidesCountTag: false,
        weeklyMaxCount: 3,
        sharedSortOrder: 2,
      })
      // 글자와 숨김을 함께 못 든다. 분류 key 는 ENUM 밖이면 경로에서 400 이다.
      expect(
        (
          await app.inject({
            method: 'PUT',
            url: '/admin/contents/categories/epic_dungeon',
            payload: { name: '에픽 던전', countTag: 'ID당 1회', hidesCountTag: true },
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

    it('컨텐츠 POST 는 201 · 모르는 분류 404 · 같은 key 와 겹치는 API 이름 409 · 없는 그림과 모양이 틀리면 400 이다', async () => {
      contentsRepo.createContent.mockResolvedValue({ id: ROW })
      const created = await app.inject({
        method: 'POST',
        url: '/admin/contents',
        payload: { key: 'epic_dungeon_high_mountain', cycle: 'weekly', ...highMountain },
      })
      expect(created.statusCode).toBe(201)
      expect(contentsRepo.createContent).toHaveBeenCalledWith({
        key: 'epic_dungeon_high_mountain',
        cycle: 'weekly',
        ...highMountainFields,
      })

      contentsRepo.createContent.mockRejectedValue(new NoContentCategory('epic_dungeon'))
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/admin/contents',
            payload: { key: 'epic_dungeon_high_mountain', cycle: 'weekly', ...highMountain },
          })
        ).statusCode,
      ).toBe(404)
      contentsRepo.createContent.mockRejectedValue(new ApiNameTaken('epic_dungeon_high_mountain'))
      const taken = await app.inject({
        method: 'POST',
        url: '/admin/contents',
        payload: { key: 'epic_dungeon_high_mountain_2', cycle: 'weekly', ...highMountain },
      })
      expect(taken.statusCode).toBe(409)
      expect(taken.json<{ message: string }>().message).toContain('epic_dungeon_high_mountain')
      contentsRepo.createContent.mockRejectedValue(new AssetNotFound(ROW))
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/admin/contents',
            payload: { key: 'epic_dungeon_high_mountain', cycle: 'weekly', ...highMountain },
          })
        ).statusCode,
      ).toBe(400)

      // 최대 횟수가 완료 조건과 어긋나거나, 그림 둘을 다 들거나, 기간이 거꾸로면 400 이다.
      for (const bad of [
        { ...highMountain, maxCount: null },
        { ...highMountain, checkType: 'state_only' },
        { ...highMountain, backgroundMapAssetId: ROW },
        { ...highMountain, validFrom: '2026-09-17', validUntil: '2026-09-10' },
      ]) {
        contentsRepo.createContent.mockClear()
        expect(
          (
            await app.inject({
              method: 'POST',
              url: '/admin/contents',
              payload: { key: 'epic_dungeon_high_mountain', cycle: 'weekly', ...bad },
            })
          ).statusCode,
        ).toBe(400)
        expect(contentsRepo.createContent).not.toHaveBeenCalled()
      }
    })

    it('컨텐츠 PUT 은 204 · 모르면 404 이고 key 와 주기는 안 받는다. move 는 204 다', async () => {
      contentsRepo.updateContent.mockResolvedValue(true)
      expect(
        (
          await app.inject({
            method: 'PUT',
            url: '/admin/contents/epic_dungeon_high_mountain',
            payload: { ...highMountain, validUntil: '2027-01-01' },
          })
        ).statusCode,
      ).toBe(204)
      expect(contentsRepo.updateContent).toHaveBeenCalledWith('epic_dungeon_high_mountain', {
        ...highMountainFields,
        validUntil: '2027-01-01',
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

  describe('강화 비용', () => {
    it('rows 는 관리 줄이고, 칸 PUT 204 · 모르면 404, 구간 POST 201 · 같은 구간 409, 구간 DELETE 204 · 1 구간 409 다', async () => {
      const rows = { updatedAt: null, superiorSeries: [], superiorItems: [] }
      enhancementRepo.adminRows.mockResolvedValue(rows)
      expect(
        (await app.inject({ method: 'GET', url: '/admin/enhancement-costs/rows' })).json(),
      ).toEqual(rows)
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
        minRequiredLevel: 275,
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

    it('슈페리얼 계열 POST 201 · 같은 key 409 · 금액 0 은 400, PUT 204 · 모르면 404, 장비 POST 201 · 없는 계열 404 · 같은 이름 409, DELETE 204 · 모르면 404 다', async () => {
      const inject = async (method: 'POST' | 'PUT' | 'DELETE', url: string, payload?: object) =>
        (await app.inject({ method, url, payload })).statusCode
      const series = { key: 'tyrant', name: '타일런트', starforceCostMeso: 55_382_200 }

      enhancementRepo.addSuperiorSeries.mockResolvedValue(undefined)
      expect(await inject('POST', '/admin/enhancement-costs/superior-series', series)).toBe(201)
      expect(enhancementRepo.addSuperiorSeries).toHaveBeenCalledWith(series)
      enhancementRepo.addSuperiorSeries.mockRejectedValue(new SuperiorSeriesExists('tyrant'))
      expect(await inject('POST', '/admin/enhancement-costs/superior-series', series)).toBe(409)
      expect(
        await inject('POST', '/admin/enhancement-costs/superior-series', {
          ...series,
          starforceCostMeso: 0,
        }),
      ).toBe(400)

      enhancementRepo.setSuperiorSeries.mockResolvedValue(true)
      expect(
        await inject('PUT', '/admin/enhancement-costs/superior-series/tyrant', {
          name: '타일런트',
          starforceCostMeso: 55_000_000,
        }),
      ).toBe(204)
      expect(enhancementRepo.setSuperiorSeries).toHaveBeenCalledWith('tyrant', {
        name: '타일런트',
        starforceCostMeso: 55_000_000,
      })
      enhancementRepo.setSuperiorSeries.mockResolvedValue(false)
      expect(
        await inject('PUT', '/admin/enhancement-costs/superior-series/nova', {
          name: '노바',
          starforceCostMeso: 1,
        }),
      ).toBe(404)

      const item = { name: '타일런트 리카온 벨트', seriesKey: 'tyrant' }
      enhancementRepo.addSuperiorItem.mockResolvedValue(undefined)
      expect(await inject('POST', '/admin/enhancement-costs/superior-items', item)).toBe(201)
      expect(enhancementRepo.addSuperiorItem).toHaveBeenCalledWith('타일런트 리카온 벨트', 'tyrant')
      enhancementRepo.addSuperiorItem.mockRejectedValue(new NoSuperiorSeries('nova'))
      expect(await inject('POST', '/admin/enhancement-costs/superior-items', item)).toBe(404)
      enhancementRepo.addSuperiorItem.mockRejectedValue(
        new SuperiorItemNameTaken('타일런트 리카온 벨트'),
      )
      expect(await inject('POST', '/admin/enhancement-costs/superior-items', item)).toBe(409)
      expect(
        await inject('POST', '/admin/enhancement-costs/superior-items', { ...item, name: ' ' }),
      ).toBe(400)

      const encoded = encodeURIComponent('타일런트 리카온 벨트')
      enhancementRepo.removeSuperiorItem.mockResolvedValue(true)
      expect(await inject('DELETE', `/admin/enhancement-costs/superior-items/${encoded}`)).toBe(204)
      expect(enhancementRepo.removeSuperiorItem).toHaveBeenCalledWith('타일런트 리카온 벨트')
      enhancementRepo.removeSuperiorItem.mockResolvedValue(false)
      expect(await inject('DELETE', `/admin/enhancement-costs/superior-items/${encoded}`)).toBe(404)
    })

    it('슈페리얼 장비 그림 PUT 204 · 모르는 장비 404 · 그림 표에 없는 그림 400 · uuid 가 아니면 400 이다', async () => {
      const url = `/admin/enhancement-costs/superior-items/${encodeURIComponent('타일런트 리카온 벨트')}/icon`
      const iconAssetId = '49d165ed-66b2-40f0-9013-753e2d94d3bb'
      const put = async (payload: object) =>
        (await app.inject({ method: 'PUT', url, payload })).statusCode

      enhancementRepo.setSuperiorItemIcon.mockResolvedValue(true)
      expect(await put({ iconAssetId })).toBe(204)
      expect(enhancementRepo.setSuperiorItemIcon).toHaveBeenCalledWith(
        '타일런트 리카온 벨트',
        iconAssetId,
      )
      enhancementRepo.setSuperiorItemIcon.mockResolvedValue(false)
      expect(await put({ iconAssetId })).toBe(404)
      enhancementRepo.setSuperiorItemIcon.mockRejectedValue(new AssetNotFound(iconAssetId))
      expect(await put({ iconAssetId })).toBe(400)
      expect(await put({ iconAssetId: 'tyrant_lycaon_belt' })).toBe(400)
    })
  })

  describe('MVP 등급', () => {
    it('rows 는 칸 그대로이고, PUT 은 204 · 모르면 404 · ENUM 밖 key 는 400, move 는 204 다', async () => {
      mvpRepo.section.mockResolvedValue({ updatedAt: null, mvpGrades: [] })
      expect((await app.inject({ method: 'GET', url: '/admin/mvp-grades/rows' })).json()).toEqual({
        updatedAt: null,
        mvpGrades: [],
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

  describe('사냥터', () => {
    const joy = {
      key: 'road_of_vanishing_weathered_land_of_joy',
      region: 'road_of_vanishing',
      name: '풍화된 기쁨의 땅',
      requiredForce: 30,
      mobQuantity: 22,
      mobLevels: [200],
    }

    it('지역 아이콘은 그림 줄 id 로 받아 넘기고, 그림 표에 없으면 400 · 줄 id 가 아니면 저장소를 안 부르고 400 이다', async () => {
      huntingRepo.updateRegion.mockResolvedValue(true)
      expect(
        (
          await app.inject({
            method: 'PUT',
            url: '/admin/hunting-grounds/regions/cernium',
            payload: { name: '세르니움', forceType: 'authentic', iconAssetId: ROW },
          })
        ).statusCode,
      ).toBe(204)
      expect(huntingRepo.updateRegion).toHaveBeenCalledWith('cernium', {
        name: '세르니움',
        forceType: 'authentic',
        iconAssetId: ROW,
      })
      huntingRepo.updateRegion.mockRejectedValue(new AssetNotFound(ROW))
      const missing = await app.inject({
        method: 'PUT',
        url: '/admin/hunting-grounds/regions/cernium',
        payload: { name: '세르니움', forceType: 'authentic', iconAssetId: ROW },
      })
      expect(missing.statusCode).toBe(400)
      expect(missing.json<{ message: string }>().message).toContain(ROW)

      huntingRepo.createRegion.mockRejectedValue(new AssetNotFound(ROW))
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/admin/hunting-grounds/regions',
            payload: { key: 'limen', name: '리멘', forceType: 'arcane', iconAssetId: ROW },
          })
        ).statusCode,
      ).toBe(400)
      huntingRepo.createRegion.mockClear()
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/admin/hunting-grounds/regions',
            payload: { key: 'limen', name: '리멘', forceType: 'arcane', iconAssetId: 'limen' },
          })
        ).statusCode,
      ).toBe(400)
      expect(huntingRepo.createRegion).not.toHaveBeenCalled()
    })

    it('지역 POST 201 · 같은 key 409, PUT 204 · 모르면 404, move 204 다', async () => {
      huntingRepo.adminRows.mockResolvedValue({
        updatedAt: null,
        regions: [],
        grounds: [],
        groundLevels: [],
      })
      expect(
        (await app.inject({ method: 'GET', url: '/admin/hunting-grounds/rows' })).json(),
      ).toEqual({ updatedAt: null, regions: [], grounds: [], groundLevels: [] })

      huntingRepo.createRegion.mockResolvedValue({ id: ROW })
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/admin/hunting-grounds/regions',
            payload: { key: 'road_of_vanishing', name: '소멸의 여로', forceType: 'arcane' },
          })
        ).statusCode,
      ).toBe(201)
      expect(huntingRepo.createRegion).toHaveBeenCalledWith({
        key: 'road_of_vanishing',
        name: '소멸의 여로',
        forceType: 'arcane',
        iconAssetId: null,
      })
      huntingRepo.createRegion.mockRejectedValue(new RegionExists('road_of_vanishing'))
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/admin/hunting-grounds/regions',
            payload: { key: 'road_of_vanishing', name: '소멸의 여로', forceType: 'arcane' },
          })
        ).statusCode,
      ).toBe(409)
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/admin/hunting-grounds/regions',
            payload: { key: 'limen', name: '리멘', forceType: 'sacred' },
          })
        ).statusCode,
      ).toBe(400)

      huntingRepo.updateRegion.mockResolvedValue(true)
      expect(
        (
          await app.inject({
            method: 'PUT',
            url: '/admin/hunting-grounds/regions/cernium',
            payload: { name: '세르니움', forceType: 'authentic' },
          })
        ).statusCode,
      ).toBe(204)
      huntingRepo.updateRegion.mockResolvedValue(false)
      expect(
        (
          await app.inject({
            method: 'PUT',
            url: '/admin/hunting-grounds/regions/nobody',
            payload: { name: 'x', forceType: 'arcane' },
          })
        ).statusCode,
      ).toBe(404)

      huntingRepo.moveRegion.mockResolvedValue(true)
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/admin/hunting-grounds/regions/cernium/move',
            payload: { direction: 'up' },
          })
        ).statusCode,
      ).toBe(204)
    })

    it('사냥터 POST 201 · 모르는 지역 404 · 접두 어긋남 400 · 같은 이름 409 · 겹친 레벨 400, PUT 204 · 모르면 404, move 204 다', async () => {
      huntingRepo.createGround.mockResolvedValue({ id: ROW })
      expect(
        (await app.inject({ method: 'POST', url: '/admin/hunting-grounds/grounds', payload: joy }))
          .statusCode,
      ).toBe(201)
      expect(huntingRepo.createGround).toHaveBeenCalledWith(joy)
      huntingRepo.createGround.mockRejectedValue(new NoRegion('limen'))
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/admin/hunting-grounds/grounds',
            payload: { ...joy, region: 'limen' },
          })
        ).statusCode,
      ).toBe(404)
      huntingRepo.createGround.mockRejectedValue(new GroundKeyPrefix('road_of_vanishing_'))
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/admin/hunting-grounds/grounds',
            payload: { ...joy, key: 'weathered_land' },
          })
        ).statusCode,
      ).toBe(400)
      huntingRepo.createGround.mockRejectedValue(new GroundNameTaken(joy.key))
      const taken = await app.inject({
        method: 'POST',
        url: '/admin/hunting-grounds/grounds',
        payload: { ...joy, key: 'road_of_vanishing_other' },
      })
      expect(taken.statusCode).toBe(409)
      expect(taken.json<{ message: string }>().message).toContain(joy.key)
      huntingRepo.createGround.mockClear()
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/admin/hunting-grounds/grounds',
            payload: { ...joy, mobLevels: [200, 200] },
          })
        ).statusCode,
      ).toBe(400)
      expect(huntingRepo.createGround).not.toHaveBeenCalled()

      huntingRepo.updateGround.mockResolvedValue(true)
      expect(
        (
          await app.inject({
            method: 'PUT',
            url: '/admin/hunting-grounds/grounds/' + joy.key,
            payload: {
              name: '풍화된 기쁨의 땅',
              requiredForce: 30,
              mobQuantity: 30,
              mobLevels: [200, 201],
            },
          })
        ).statusCode,
      ).toBe(204)
      expect(huntingRepo.updateGround).toHaveBeenCalledWith(joy.key, {
        name: '풍화된 기쁨의 땅',
        requiredForce: 30,
        mobQuantity: 30,
        mobLevels: [200, 201],
      })
      huntingRepo.updateGround.mockResolvedValue(false)
      expect(
        (
          await app.inject({
            method: 'PUT',
            url: '/admin/hunting-grounds/grounds/nobody',
            payload: { name: 'x', requiredForce: 0, mobQuantity: 1, mobLevels: [1] },
          })
        ).statusCode,
      ).toBe(404)

      huntingRepo.moveGround.mockResolvedValue(true)
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/admin/hunting-grounds/grounds/' + joy.key + '/move',
            payload: { direction: 'down' },
          })
        ).statusCode,
      ).toBe(204)
    })

    it('인기 PUT 은 참 · 거짓만 받아 204, 모르는 사냥터는 404 다', async () => {
      huntingRepo.setGroundPopular.mockResolvedValue(true)
      expect(
        (
          await app.inject({
            method: 'PUT',
            url: '/admin/hunting-grounds/grounds/' + joy.key + '/popular',
            payload: { isPopular: true },
          })
        ).statusCode,
      ).toBe(204)
      expect(huntingRepo.setGroundPopular).toHaveBeenCalledWith(joy.key, true)
      expect(
        (
          await app.inject({
            method: 'PUT',
            url: '/admin/hunting-grounds/grounds/' + joy.key + '/popular',
            payload: { isPopular: 'true' },
          })
        ).statusCode,
      ).toBe(400)
      expect(huntingRepo.setGroundPopular).toHaveBeenCalledTimes(1)

      huntingRepo.setGroundPopular.mockResolvedValue(false)
      expect(
        (
          await app.inject({
            method: 'PUT',
            url: '/admin/hunting-grounds/grounds/nobody/popular',
            payload: { isPopular: false },
          })
        ).statusCode,
      ).toBe(404)
    })
  })
})
