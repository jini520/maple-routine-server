import type { BossDropsRepository } from '../boss-drops/boss-drops.repository'
import type { BossesRepository, Catalog } from '../bosses/bosses.repository'
import type { CashbookCategoriesRepository } from '../cashbook-categories/cashbook-categories.repository'
import type { ContentsRepository } from '../contents/contents.repository'
import type { CrystalPricesRepository } from '../crystal-prices/crystal-prices.repository'
import type { DropBoxesRepository } from '../drop-items/drop-boxes.repository'
import type { DropItemsRepository } from '../drop-items/drop-items.repository'
import type { EnhancementCostsRepository } from '../enhancement-costs/enhancement-costs.repository'
import type { EquipmentItemsRepository } from '../equipment-items/equipment-items.repository'
import type { HuntingGroundsRepository } from '../hunting-grounds/hunting-grounds.repository'
import type { MvpGradesRepository } from '../mvp-grades/mvp-grades.repository'
import type { SpendCatalogRepository } from '../spend-catalog/spend-catalog.repository'
import type { SymbolCostsRepository } from '../symbol-costs/symbol-costs.repository'
import type { WorldsRepository } from '../worlds/worlds.repository'
import { GameDataService } from './game-data.service'

const empty = (body: object) => ({
  section: jest.fn().mockResolvedValue({ updatedAt: null, ...body }),
})
function service(bosses: { catalog: jest.Mock }): GameDataService {
  return new GameDataService(
    bosses as unknown as BossesRepository,
    empty({ items: [] }) as unknown as DropItemsRepository,
    empty({ rewards: [] }) as unknown as BossDropsRepository,
    empty({ boxes: [] }) as unknown as DropBoxesRepository,
    empty({ prices: [] }) as unknown as CrystalPricesRepository,
    empty({ worlds: [] }) as unknown as WorldsRepository,
    empty({
      rules: { tariffPercent: null, rewardCoinPriceMeso: null },
      groups: [],
      tiles: [],
      items: [],
      itemOptions: [],
      itemForms: [],
      forms: [],
    }) as unknown as SpendCatalogRepository,
    empty({ groups: [], symbols: [], levelCosts: [] }) as unknown as SymbolCostsRepository,
    empty({ categories: [], contents: [] }) as unknown as ContentsRepository,
    empty({ items: [] }) as unknown as EquipmentItemsRepository,
    empty({
      rules: {
        cubeAppraisalFreeMaxLevel: null,
        cubeAppraisalCoefficient: null,
        starforceDestroyDefenceSurchargePercent: null,
      },
      potentialResetCosts: [],
      soulPotentialResetCosts: [],
      starforceSteps: [],
    }) as unknown as EnhancementCostsRepository,
    empty({ grades: [] }) as unknown as MvpGradesRepository,
    empty({ regions: [], grounds: [], groundLevels: [] }) as unknown as HuntingGroundsRepository,
    empty({ categories: [], itemKinds: [] }) as unknown as CashbookCategoriesRepository,
  )
}

const catalog: Catalog = {
  updatedAt: '2026-10-15T01:00:00.000Z',
  rules: { weeklyBossSelectionLimit: 12, weeklyCrystalSaleLimit: 90, defaultMaxPartySize: 6 },
  bosses: [],
}

describe('GameDataService', () => {
  it('표마다 칸 하나다. bosses 칸은 보스 리포지토리의 catalog 그대로이고 나머지 열셋은 각 리포지토리의 section 이다', async () => {
    const bosses = { catalog: jest.fn().mockResolvedValue(catalog) }

    await expect(service(bosses).snapshot()).resolves.toEqual({
      bosses: catalog,
      dropItems: { updatedAt: null, items: [] },
      bossDrops: { updatedAt: null, rewards: [] },
      dropBoxes: { updatedAt: null, boxes: [] },
      crystalPrices: { updatedAt: null, prices: [] },
      worlds: { updatedAt: null, worlds: [] },
      spendCatalog: {
        updatedAt: null,
        rules: { tariffPercent: null, rewardCoinPriceMeso: null },
        groups: [],
        tiles: [],
        items: [],
        itemOptions: [],
        itemForms: [],
        forms: [],
      },
      cashbookCategories: { updatedAt: null, categories: [], itemKinds: [] },
      symbolCosts: { updatedAt: null, groups: [], symbols: [], levelCosts: [] },
      contents: { updatedAt: null, categories: [], contents: [] },
      equipmentItems: { updatedAt: null, items: [] },
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
      },
      mvpGrades: { updatedAt: null, grades: [] },
      huntingGrounds: { updatedAt: null, regions: [], grounds: [], groundLevels: [] },
    })
  })

  // 아직 한 번도 안 넣은 표의 모양이다. 칸을 빼지 않고 updatedAt 이 null 인 채로 준다. 앱은 그 칸을 버린다.
  it('빈 표도 칸을 뺀 채 주지 않는다', async () => {
    const emptyCatalog: Catalog = {
      updatedAt: null,
      rules: {
        weeklyBossSelectionLimit: null,
        weeklyCrystalSaleLimit: null,
        defaultMaxPartySize: null,
      },
      bosses: [],
    }
    const bosses = { catalog: jest.fn().mockResolvedValue(emptyCatalog) }

    await expect(service(bosses).snapshot()).resolves.toMatchObject({ bosses: emptyCatalog })
  })
})
