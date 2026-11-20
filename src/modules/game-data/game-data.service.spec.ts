import { createHash } from 'node:crypto'

import type { Db } from '../../database/database.module'
import type { AppImagesRepository } from '../app-images/app-images.repository'
import type { AssetsRepository } from '../assets/assets.repository'
import type { ImageCropsRepository } from '../assets/image-crops.repository'
import type { BossDropsRepository } from '../boss-drops/boss-drops.repository'
import type { BossesRepository, BossesSection } from '../bosses/bosses.repository'
import type { CashbookCategoriesRepository } from '../cashbook-categories/cashbook-categories.repository'
import type { ContentsRepository } from '../contents/contents.repository'
import type { CrystalPricesRepository } from '../crystal-prices/crystal-prices.repository'
import type { DropBoxesRepository } from '../drop-items/drop-boxes.repository'
import type { EnhancementCostsRepository } from '../enhancement-costs/enhancement-costs.repository'
import type { FaqsRepository } from '../faqs/faqs.repository'
import type { HuntingGroundsRepository } from '../hunting-grounds/hunting-grounds.repository'
import type { HexaMatrixRepository } from '../hexa-matrix/hexa-matrix.repository'
import type { HuntLootRepository } from '../hunt-loot/hunt-loot.repository'
import type { ItemsRepository } from '../items/items.repository'
import type { MvpGradesRepository } from '../mvp-grades/mvp-grades.repository'
import type { SpendCatalogRepository } from '../spend-catalog/spend-catalog.repository'
import type { SymbolCostsRepository } from '../symbol-costs/symbol-costs.repository'
import type { WorldsRepository } from '../worlds/worlds.repository'
import { GameDataService } from './game-data.service'

const empty = (body: object) => ({
  section: jest.fn().mockResolvedValue({ updatedAt: null, ...body }),
})

/** 칸 시각 쿼리만 흉내 내는 DB. `set` 으로 다음 쿼리가 낼 시각을 바꾼다. */
function stampDb(initial: string): { db: Db; set: (stamp: string) => void } {
  let stamp = initial
  const db = { execute: jest.fn(() => Promise.resolve({ rows: [{ stamp }] })) }
  return {
    db: db as unknown as Db,
    set: (next) => {
      stamp = next
    },
  }
}

function service(bosses: { section: jest.Mock }, db: Db = stampDb('a').db): GameDataService {
  return new GameDataService(
    bosses as unknown as BossesRepository,
    empty({ bossDifficultyRewards: [] }) as unknown as BossDropsRepository,
    empty({ dropBoxes: [], dropBoxContents: [] }) as unknown as DropBoxesRepository,
    empty({ bossCrystalPrices: [] }) as unknown as CrystalPricesRepository,
    empty({ worlds: [], worldOpenPeriods: [] }) as unknown as WorldsRepository,
    empty({
      rules: { tariffPercent: null, rewardCoinPriceMeso: null, mesoMarketFeePercent: null },
      spendRewardTypes: [],
      spendGroups: [],
      spendTiles: [],
      spendItems: [],
      spendItemOptions: [],
      spendItemRewardTypes: [],
    }) as unknown as SpendCatalogRepository,
    empty({
      symbolGroups: [],
      symbols: [],
      symbolLevelCosts: [],
    }) as unknown as SymbolCostsRepository,
    empty({ contentCategories: [], contents: [] }) as unknown as ContentsRepository,
    empty({
      rules: {
        cubeAppraisalFreeMaxLevel: null,
        cubeAppraisalCoefficient: null,
        starforceDestroyDefenceSurchargePercent: null,
      },
      potentialResetCosts: [],
      soulPotentialResetCosts: [],
      starforceSteps: [],
      superiorSeries: [],
      superiorItems: [],
    }) as unknown as EnhancementCostsRepository,
    empty({ grades: [] }) as unknown as MvpGradesRepository,
    empty({
      huntingRegions: [],
      huntingGrounds: [],
      huntingGroundLevels: [],
    }) as unknown as HuntingGroundsRepository,
    empty({ huntLootItems: [] }) as unknown as HuntLootRepository,
    empty({
      jobs: [],
      hexaCoreTypes: [],
      hexaCores: [],
      hexaCoreLevelCosts: [],
      hexaStats: [],
    }) as unknown as HexaMatrixRepository,
    empty({ sheets: [], items: [] }) as unknown as FaqsRepository,
    empty({
      cashbookCategories: [],
      cashbookItemTypes: [],
    }) as unknown as CashbookCategoriesRepository,
    empty({ files: [] }) as unknown as AssetsRepository,
    empty({ crops: [] }) as unknown as ImageCropsRepository,
    empty({ images: [] }) as unknown as AppImagesRepository,
    empty({
      items: [],
      itemGroups: [],
      ringLevelItems: [],
      sameItemLinks: [],
    }) as unknown as ItemsRepository,
    db,
  )
}

const catalog: BossesSection = {
  updatedAt: '2026-10-15T01:00:00.000Z',
  rules: { weeklyBossSelectionLimit: 12, weeklyCrystalSaleLimit: 90, defaultMaxPartySize: 6 },
  bosses: [],
  bossDifficulties: [],
}

describe('GameDataService', () => {
  it('표마다 칸 하나다. bosses 칸은 보스 리포지토리의 section 그대로이고 나머지 열여덟은 각 리포지토리의 section 이다', async () => {
    const bosses = { section: jest.fn().mockResolvedValue(catalog) }

    await expect(service(bosses).snapshot()).resolves.toEqual({
      bosses: catalog,
      bossDrops: { updatedAt: null, bossDifficultyRewards: [] },
      dropBoxes: { updatedAt: null, dropBoxes: [], dropBoxContents: [] },
      crystalPrices: { updatedAt: null, bossCrystalPrices: [] },
      worlds: { updatedAt: null, worlds: [], worldOpenPeriods: [] },
      spendCatalog: {
        updatedAt: null,
        rules: { tariffPercent: null, rewardCoinPriceMeso: null, mesoMarketFeePercent: null },
        spendRewardTypes: [],
        spendGroups: [],
        spendTiles: [],
        spendItems: [],
        spendItemOptions: [],
        spendItemRewardTypes: [],
      },
      cashbookCategories: { updatedAt: null, cashbookCategories: [], cashbookItemTypes: [] },
      symbolCosts: { updatedAt: null, symbolGroups: [], symbols: [], symbolLevelCosts: [] },
      contents: { updatedAt: null, contentCategories: [], contents: [] },
      enhancementCosts: {
        updatedAt: null,
        rules: {
          cubeAppraisalFreeMaxLevel: null,
          cubeAppraisalCoefficient: null,
          starforceDestroyDefenceSurchargePercent: null,
        },
        potentialResetCosts: [],
        soulPotentialResetCosts: [],
        starforceSteps: [],
        superiorSeries: [],
        superiorItems: [],
      },
      mvpGrades: { updatedAt: null, grades: [] },
      huntingGrounds: {
        updatedAt: null,
        huntingRegions: [],
        huntingGrounds: [],
        huntingGroundLevels: [],
      },
      huntLoot: { updatedAt: null, huntLootItems: [] },
      hexaMatrix: {
        updatedAt: null,
        jobs: [],
        hexaCoreTypes: [],
        hexaCores: [],
        hexaCoreLevelCosts: [],
        hexaStats: [],
      },
      faqs: { updatedAt: null, sheets: [], items: [] },
      assets: { updatedAt: null, files: [] },
      imageCrops: { updatedAt: null, crops: [] },
      appImages: { updatedAt: null, images: [] },
      items: { updatedAt: null, items: [], itemGroups: [], ringLevelItems: [], sameItemLinks: [] },
    })
  })

  // 아직 한 번도 안 넣은 표의 모양이다. 칸을 빼지 않고 updatedAt 이 null 인 채로 준다. 앱은 그 칸을 버린다.
  it('빈 표도 칸을 뺀 채 주지 않는다', async () => {
    const emptyCatalog: BossesSection = {
      updatedAt: null,
      rules: {
        weeklyBossSelectionLimit: null,
        weeklyCrystalSaleLimit: null,
        defaultMaxPartySize: null,
      },
      bosses: [],
      bossDifficulties: [],
    }
    const bosses = { section: jest.fn().mockResolvedValue(emptyCatalog) }

    await expect(service(bosses).snapshot()).resolves.toMatchObject({ bosses: emptyCatalog })
  })
})

// 요청마다 응답을 만들면 304 로 끝나도 칸을 다 읽고 1MB 를 직렬화해서, 푸시 직후 몰리는 때 서버가 막혔다.
describe('GameDataService.response', () => {
  afterEach(() => jest.restoreAllMocks())

  it('칸 시각이 같으면 칸을 다시 읽지 않고 담아 둔 응답을 낸다', async () => {
    const bosses = { section: jest.fn().mockResolvedValue(catalog) }
    const sut = service(bosses, stampDb('a').db)

    const first = await sut.response()
    const second = await sut.response()

    expect(second).toEqual(first)
    expect(bosses.section).toHaveBeenCalledTimes(1)
  })

  it('칸 시각이 바뀌면 다음 요청이 다시 읽은 응답이다', async () => {
    const changed: BossesSection = { ...catalog, updatedAt: '2026-11-20T01:00:00.000Z' }
    const bosses = {
      section: jest.fn().mockResolvedValueOnce(catalog).mockResolvedValueOnce(changed),
    }
    const stamps = stampDb('a')
    const sut = service(bosses, stamps.db)

    const first = await sut.response()
    stamps.set('b')
    const second = await sut.response()

    expect(bosses.section).toHaveBeenCalledTimes(2)
    expect(JSON.parse(second.body)).toMatchObject({ bosses: changed })
    expect(second.etag).not.toBe(first.etag)
  })

  // 칸 시각을 안 올리는 쓰기(빠진 경로 · SQL 직접 수정)도 이 간격 안에 앱에 닿아야 한다.
  it('담은 지 5분이 지나면 칸 시각이 같아도 다시 만든다', async () => {
    const now = jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-11-20T03:00:00.000Z'))
    const bosses = { section: jest.fn().mockResolvedValue(catalog) }
    const sut = service(bosses, stampDb('a').db)

    await sut.response()
    now.mockReturnValue(Date.parse('2026-11-20T03:04:59.999Z'))
    await sut.response()
    expect(bosses.section).toHaveBeenCalledTimes(1)

    now.mockReturnValue(Date.parse('2026-11-20T03:05:00.000Z'))
    await sut.response()
    expect(bosses.section).toHaveBeenCalledTimes(2)
  })

  it('동시에 온 요청은 응답을 한 번만 만들고 같은 응답을 받는다', async () => {
    let release: (value: BossesSection) => void = () => undefined
    const bosses = {
      section: jest.fn(
        () =>
          new Promise<BossesSection>((resolve) => {
            release = resolve
          }),
      ),
    }
    const sut = service(bosses, stampDb('a').db)

    const pending = [sut.response(), sut.response(), sut.response()]
    await new Promise((resolve) => setImmediate(resolve))
    release(catalog)
    const results = await Promise.all(pending)

    expect(bosses.section).toHaveBeenCalledTimes(1)
    expect(new Set(results.map((r) => r.etag)).size).toBe(1)
  })

  // 시각으로 ETag 를 만들면 기기들이 든 ETag 가 배포 직후 모두 어긋나 1MB 를 한꺼번에 다시 받는다.
  it('ETag 는 담아 둔 몸의 해시다', async () => {
    const sut = service({ section: jest.fn().mockResolvedValue(catalog) }, stampDb('a').db)

    const { body, etag } = await sut.response()

    expect(etag).toBe(`"${createHash('sha1').update(body).digest('hex')}"`)
  })
})
