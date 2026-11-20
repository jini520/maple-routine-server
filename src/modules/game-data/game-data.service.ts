import { createHash } from 'node:crypto'

import { Inject, Injectable } from '@nestjs/common'

import { DB, type Db } from '../../database/database.module'
import { AppImagesRepository, type AppImagesSection } from '../app-images/app-images.repository'
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
import { FaqsRepository, type FaqsSection } from '../faqs/faqs.repository'
import {
  HuntingGroundsRepository,
  type HuntingGroundsSection,
} from '../hunting-grounds/hunting-grounds.repository'
import { HexaMatrixRepository, type HexaMatrixSection } from '../hexa-matrix/hexa-matrix.repository'
import { HuntLootRepository, type HuntLootSection } from '../hunt-loot/hunt-loot.repository'
import { ItemsRepository, type ItemsSection } from '../items/items.repository'
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
import { gameDataStamp } from './sections'

/**
 * GET /v1/game-data 의 몸체. 칸 하나가 표 하나이고 칸마다 updatedAt 을 든다.
 *
 * 표가 비어도 칸을 빼지 않는다. 앱은 칸 하나라도 읽지 못하면 응답 전체를 버린다.
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
  faqs: FaqsSection
  assets: AssetsSection
  imageCrops: ImageCropsSection
  appImages: AppImagesSection
  items: ItemsSection
}

/** 칸 시각이 같아도 응답을 다시 만드는 간격. 칸 시각을 안 올리는 쓰기가 앱에 닿기까지 늦는 끝 */
const MAX_AGE_MS = 5 * 60_000

/** 담아 둔 응답. `stamp` 는 만들기 전에 읽은 칸 시각이라, 만드는 사이에 쓰기가 끼면 다음 요청이 다시 만든다 */
interface Built {
  stamp: string
  builtAt: number
  body: string
  etag: string
}

@Injectable()
export class GameDataService {
  private built: Built | null = null
  private building: Promise<Built> | null = null

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
    private readonly faqs: FaqsRepository,
    private readonly cashbookCategories: CashbookCategoriesRepository,
    private readonly assets: AssetsRepository,
    private readonly imageCrops: ImageCropsRepository,
    private readonly appImages: AppImagesRepository,
    private readonly items: ItemsRepository,
    @Inject(DB) private readonly db: Db,
  ) {}

  /**
   * 응답 몸 JSON 과 그 해시 ETag. 칸 시각이 같고 담은 지 5분 안이면 담아 둔 것을 낸다.
   *
   * 요청마다 몸을 만들면 304 로 끝나는 요청도 칸을 다 읽고 1MB 를 직렬화해서 몰리는 때 서버가 막힌다.
   */
  async response(): Promise<{ body: string; etag: string }> {
    const stamp = await gameDataStamp(this.db)
    const built = this.built
    if (built !== null && built.stamp === stamp && Date.now() - built.builtAt < MAX_AGE_MS) return built
    return this.build(stamp)
  }

  /** 응답을 다시 만드는 함수. 이미 만드는 중이면 그것을 함께 기다린다. 요청마다 따로 만들면 몰리는 때 같은 부하가 난다 */
  private build(stamp: string): Promise<Built> {
    if (this.building !== null) return this.building
    const builtAt = Date.now()
    this.building = this.snapshot()
      .then((snapshot) => {
        const body = JSON.stringify(snapshot)
        const next: Built = { stamp, builtAt, body, etag: `"${createHash('sha1').update(body).digest('hex')}"` }
        this.built = next
        return next
      })
      .finally(() => {
        this.building = null
      })
    return this.building
  }

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
      faqs,
      cashbookCategories,
      assets,
      imageCrops,
      appImages,
      items,
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
      this.faqs.section(),
      this.cashbookCategories.section(),
      this.assets.section(),
      this.imageCrops.section(),
      this.appImages.section(),
      this.items.section(),
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
      faqs,
      assets,
      imageCrops,
      appImages,
      items,
    }
  }
}
