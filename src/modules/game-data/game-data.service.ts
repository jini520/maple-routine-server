import { Injectable } from '@nestjs/common'

import { AssetsRepository, type AssetsSection } from '../assets/assets.repository'
import { ImageCropsRepository, type ImageCropsSection } from '../assets/image-crops.repository'
import { BossDropsRepository, type BossDropsSection } from '../boss-drops/boss-drops.repository'
import { BossesRepository, type Catalog } from '../bosses/bosses.repository'
import {
  CashbookCategoriesRepository,
  type CashbookCategoriesSection,
} from '../cashbook-categories/cashbook-categories.repository'
import { ContentsRepository, type ContentsSection } from '../contents/contents.repository'
import {
  CrystalPricesRepository,
  type CrystalPricesSection,
} from '../crystal-prices/crystal-prices.repository'
import { DropBoxesRepository, type DropBoxesSection } from '../drop-items/drop-boxes.repository'
import { DropItemsRepository, type DropItemsSection } from '../drop-items/drop-items.repository'
import {
  EnhancementCostsRepository,
  type EnhancementCostsSection,
} from '../enhancement-costs/enhancement-costs.repository'
import {
  EquipmentItemsRepository,
  type EquipmentItemsSection,
} from '../equipment-items/equipment-items.repository'
import {
  HuntingGroundsRepository,
  type HuntingGroundsSection,
} from '../hunting-grounds/hunting-grounds.repository'
import { HexaMatrixRepository, type HexaMatrixSection } from '../hexa-matrix/hexa-matrix.repository'
import { HuntLootRepository, type HuntLootSection } from '../hunt-loot/hunt-loot.repository'
import { MvpGradesRepository, type MvpGradesSection } from '../mvp-grades/mvp-grades.repository'
import {
  SpendCatalogRepository,
  type SpendCatalogSection,
} from '../spend-catalog/spend-catalog.repository'
import {
  SymbolCostsRepository,
  type SymbolCostsSection,
} from '../symbol-costs/symbol-costs.repository'
import { WorldsRepository, type WorldsSection } from '../worlds/worlds.repository'

/**
 * GET /v1/game-data 의 몸체. 칸 하나가 표 하나이고 칸마다 updatedAt 을 든다.
 *
 * 표가 비어도 칸을 빼지 않는다. 앱이 칸마다 사본과 비교해 바뀐 표만 덮으므로 칸의 자리가 늘 같아야 한다.
 */
export interface GameDataSnapshot {
  bosses: Catalog
  dropItems: DropItemsSection
  bossDrops: BossDropsSection
  dropBoxes: DropBoxesSection
  crystalPrices: CrystalPricesSection
  worlds: WorldsSection
  spendCatalog: SpendCatalogSection
  cashbookCategories: CashbookCategoriesSection
  symbolCosts: SymbolCostsSection
  contents: ContentsSection
  equipmentItems: EquipmentItemsSection
  enhancementCosts: EnhancementCostsSection
  mvpGrades: MvpGradesSection
  huntingGrounds: HuntingGroundsSection
  huntLoot: HuntLootSection
  hexaMatrix: HexaMatrixSection
  assets: AssetsSection
  imageCrops: ImageCropsSection
}

@Injectable()
export class GameDataService {
  constructor(
    private readonly bosses: BossesRepository,
    private readonly dropItems: DropItemsRepository,
    private readonly bossDrops: BossDropsRepository,
    private readonly dropBoxes: DropBoxesRepository,
    private readonly crystalPrices: CrystalPricesRepository,
    private readonly worlds: WorldsRepository,
    private readonly spendCatalog: SpendCatalogRepository,
    private readonly symbolCosts: SymbolCostsRepository,
    private readonly contents: ContentsRepository,
    private readonly equipmentItems: EquipmentItemsRepository,
    private readonly enhancementCosts: EnhancementCostsRepository,
    private readonly mvpGrades: MvpGradesRepository,
    private readonly huntingGrounds: HuntingGroundsRepository,
    private readonly huntLoot: HuntLootRepository,
    private readonly hexaMatrix: HexaMatrixRepository,
    private readonly cashbookCategories: CashbookCategoriesRepository,
    private readonly assets: AssetsRepository,
    private readonly imageCrops: ImageCropsRepository,
  ) {}

  async snapshot(): Promise<GameDataSnapshot> {
    const [
      bosses,
      dropItems,
      bossDrops,
      dropBoxes,
      crystalPrices,
      worlds,
      spendCatalog,
      symbolCosts,
      contents,
      equipmentItems,
      enhancementCosts,
      mvpGrades,
      huntingGrounds,
      huntLoot,
      hexaMatrix,
      cashbookCategories,
      assets,
      imageCrops,
    ] = await Promise.all([
      this.bosses.catalog(),
      this.dropItems.section(),
      this.bossDrops.section(),
      this.dropBoxes.section(),
      this.crystalPrices.section(),
      this.worlds.section(),
      this.spendCatalog.section(),
      this.symbolCosts.section(),
      this.contents.section(),
      this.equipmentItems.section(),
      this.enhancementCosts.section(),
      this.mvpGrades.section(),
      this.huntingGrounds.section(),
      this.huntLoot.section(),
      this.hexaMatrix.section(),
      this.cashbookCategories.section(),
      this.assets.section(),
      this.imageCrops.section(),
    ])
    return {
      bosses,
      dropItems,
      bossDrops,
      dropBoxes,
      crystalPrices,
      worlds,
      spendCatalog,
      cashbookCategories,
      symbolCosts,
      contents,
      equipmentItems,
      enhancementCosts,
      mvpGrades,
      huntingGrounds,
      huntLoot,
      hexaMatrix,
      assets,
      imageCrops,
    }
  }
}
