import { Injectable } from '@nestjs/common'

import { BossDropsRepository, type BossDropsSection } from '../boss-drops/boss-drops.repository'
import { BossesRepository, type Catalog } from '../bosses/bosses.repository'
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
  symbolCosts: SymbolCostsSection
  contents: ContentsSection
  equipmentItems: EquipmentItemsSection
  enhancementCosts: EnhancementCostsSection
  mvpGrades: MvpGradesSection
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
    ])
    return {
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
    }
  }
}
