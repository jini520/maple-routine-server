import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { ZodValidationPipe } from '../../common/zod-validation.pipe'
import type { AssetRef } from '../assets/asset-paths'
import { AssetsRepository } from '../assets/assets.repository'
import {
  type BossInput,
  bossInput,
  bossKeyParam,
  difficultyParam,
  type PeriodInput,
  periodInput,
  type RulesInput,
  rulesInput,
} from '../bosses/bosses.dto'
import { BossesRepository, BossExists, LastDifficulty } from '../bosses/bosses.repository'
import {
  CashbookCategoriesRepository,
  CashbookCategoryExists,
  type CashbookEntryType,
} from '../cashbook-categories/cashbook-categories.repository'
import {
  AlreadyOpen,
  ManualCompletionRepository,
} from '../manual-completion/manual-completion.repository'
import {
  BossDropsRepository,
  NoBossDifficulty as NoBossDifficultyForDrop,
  NoDropItem as NoDropItemForDrop,
  RewardExists,
} from '../boss-drops/boss-drops.repository'
import {
  CrystalPricesRepository,
  NoBossDifficulty as NoBossDifficultyForPrice,
  NotAfterCurrent,
  NotBoundary,
  NotLatest,
} from '../crystal-prices/crystal-prices.repository'
import {
  ContentExists,
  DropBoxesRepository,
  DropBoxExists,
  NoDropItem as NoDropItemForBox,
} from '../drop-items/drop-boxes.repository'
import { DropItemExists, DropItemsRepository } from '../drop-items/drop-items.repository'
import { DropMarketService } from '../drop-market/drop-market.service'
import { DropPricesRepository } from '../drop-prices/drop-prices.repository'
import {
  NoSpendCategory,
  NoSpendGroup,
  NoSpendTile,
  SpendCatalogRepository,
  type SpendForm,
  SpendGroupExists,
  SpendItemExists,
  SpendItemShape,
  SpendTileExists,
} from '../spend-catalog/spend-catalog.repository'
import {
  LevelOutOfRange,
  LevelsAboveMax,
  LevelsIncomplete,
  NoSymbol,
  NoSymbolGroup,
  NotAfterCurrent as NotAfterCurrentCost,
  NotLatest as NotLatestCost,
  OnlyRow,
  SymbolCostsRepository,
  SymbolExists,
  SymbolGroupExists,
} from '../symbol-costs/symbol-costs.repository'
import {
  ApiNameTaken,
  type ContentCategory,
  ContentExists as ContentKeyExists,
  ContentsRepository,
  NoContentCategory,
} from '../contents/contents.repository'
import {
  BandExists,
  BaseBand,
  EnhancementCostsRepository,
  type PotentialGrade,
  type PotentialResetType,
} from '../enhancement-costs/enhancement-costs.repository'
import {
  DropItemKeyMismatch,
  EquipmentItemExists,
  EquipmentItemsRepository,
  EquipmentNameTaken,
} from '../equipment-items/equipment-items.repository'
import {
  GroundExists,
  GroundKeyPrefix,
  GroundNameTaken,
  HuntingGroundsRepository,
  NoRegion,
  RegionExists,
} from '../hunting-grounds/hunting-grounds.repository'
import { type MvpGrade, MvpGradesRepository } from '../mvp-grades/mvp-grades.repository'
import {
  HuntLootExists,
  HuntLootPriceShape,
  HuntLootRepository,
} from '../hunt-loot/hunt-loot.repository'
import { WorldExists, WorldsRepository } from '../worlds/worlds.repository'
import type { NoticeRow } from '../notices/notices.repository'
import { OperatorNoticesService, SchedulePassed } from '../notices/operator-notices.service'
import {
  type AliasBody,
  aliasBody,
  type BossDropCreateBody,
  bossDropCreateBody,
  type BossDropQuery,
  bossDropQuery,
  type BossDropUpdateBody,
  bossDropUpdateBody,
  boxContentBody,
  type CrystalPriceBody,
  crystalPriceBody,
  type DropBoxCreateBody,
  dropBoxCreateBody,
  type DropBoxLevelsBody,
  dropBoxLevelsBody,
  type DropItemCreateBody,
  dropItemCreateBody,
  type DropItemUpdateBody,
  dropItemUpdateBody,
  type DropMarketItemQuery,
  type DropMarketQuery,
  type DropPriceQuery,
  dropMarketItemQuery,
  dropMarketQuery,
  dropPriceQuery,
  type MaxPartySizeBody,
  maxPartySizeBody,
  type MoveBody,
  moveBody,
  type NoticeCreateBody,
  noticeCreateBody,
  type NoticeUpdateBody,
  noticeUpdateBody,
  type OpenBody,
  openBody,
  type RequiredLevelBody,
  requiredLevelBody,
  rowId,
  snakeKey,
  type CashbookCategoryCreateBody,
  cashbookCategoryCreateBody,
  type CashbookCategoryUpdateBody,
  cashbookCategoryUpdateBody,
  cashbookEntryType,
  type CashbookItemKindUpdateBody,
  cashbookItemKindUpdateBody,
  type HuntLootCreateBody,
  huntLootCreateBody,
  type HuntLootUpdateBody,
  huntLootUpdateBody,
  spendFormKey,
  type SpendFormUpdateBody,
  spendFormUpdateBody,
  type SpendGroupCreateBody,
  spendGroupCreateBody,
  type SpendGroupUpdateBody,
  spendGroupUpdateBody,
  type SpendItemCreateBody,
  spendItemCreateBody,
  type SpendItemUpdateBody,
  spendItemUpdateBody,
  type SpendRulesBody,
  spendRulesBody,
  type SpendTileCreateBody,
  spendTileCreateBody,
  type SpendTileUpdateBody,
  spendTileUpdateBody,
  type SymbolCostsBody,
  symbolCostsBody,
  type ContentCategoryUpdateBody,
  contentCategoryParam,
  contentCategoryUpdateBody,
  type ContentCreateBody,
  contentCreateBody,
  type ContentUpdateBody,
  contentUpdateBody,
  type CostBody,
  costBody,
  type EnhancementRulesBody,
  enhancementRulesBody,
  type EquipmentItemCreateBody,
  equipmentItemCreateBody,
  type EquipmentItemUpdateBody,
  equipmentItemUpdateBody,
  fromStarParam,
  minLevelParam,
  mvpGradeParam,
  type MvpGradeUpdateBody,
  mvpGradeUpdateBody,
  type PotentialBandBody,
  potentialBandBody,
  potentialGradeParam,
  potentialTypeParam,
  type StarforceStepBody,
  starforceStepBody,
  type HuntingGroundCreateBody,
  huntingGroundCreateBody,
  type HuntingGroundUpdateBody,
  huntingGroundUpdateBody,
  type HuntingRegionCreateBody,
  huntingRegionCreateBody,
  type HuntingRegionUpdateBody,
  huntingRegionUpdateBody,
  type SymbolCreateBody,
  symbolCreateBody,
  type SymbolGroupCreateBody,
  symbolGroupCreateBody,
  type SymbolGroupUpdateBody,
  symbolGroupUpdateBody,
  type SymbolUpdateBody,
  symbolUpdateBody,
  type WorldCreateBody,
  worldCreateBody,
  type WorldUpdateBody,
  worldUpdateBody,
} from './admin.dto'
import { BOSS_DROPS_HTML } from './views/boss-drops'
import { BOSSES_HTML } from './views/bosses'
import { CASHBOOK_CATEGORIES_HTML } from './views/cashbook-categories'
import { CRYSTAL_PRICES_HTML } from './views/crystal-prices'
import { DROP_BOXES_HTML } from './views/drop-boxes'
import { DROP_ITEMS_HTML } from './views/drop-items'
import { DROP_MARKET_HTML } from './views/drop-market'
import { DROP_MARKET_ITEM_HTML } from './views/drop-market-item'
import { DROP_PRICES_HTML } from './views/drop-prices'
import { SPEND_CATALOG_HTML } from './views/spend-catalog'
import { SYMBOL_COSTS_HTML } from './views/symbol-costs'
import { CONTENTS_HTML } from './views/contents'
import { ENHANCEMENT_COSTS_HTML } from './views/enhancement-costs'
import { EQUIPMENT_ITEMS_HTML } from './views/equipment-items'
import { HUNTING_GROUNDS_HTML } from './views/hunting-grounds'
import { HUNT_LOOT_HTML } from './views/hunt-loot'
import { MVP_GRADES_HTML } from './views/mvp-grades'
import { WORLDS_HTML } from './views/worlds'
import { INDEX_HTML } from './views/index'
import { MANUAL_COMPLETION_HTML } from './views/manual-completion'
import { NOTICES_HTML } from './views/notices'

/**
 * 운영자 화면. 인증은 앞단 nginx 의 auth_basic 이다. 게임 데이터 표(드롭 묶음 넷 · 월드 · 가계부 갈래 · 사냥 전리품 · 지출 카탈로그 · 심볼 비용 · 컨텐츠 · 장비 ·
 * 강화 비용 · MVP 등급 · 사냥터)도 여기다.
 *
 * 화면은 JSON 끝점을 fetch 로 부르는 작은 HTML 이다. 폼 본문 파서를 안 들이고 inject 로 그대로 검사한다.
 */
/** 첫 요청에 읽어 둔다. 바뀌는 것은 배포뿐이다. */
let chartScript: string | undefined

@Controller('admin')
export class AdminController {
  constructor(
    private readonly bosses: BossesRepository,
    private readonly manual: ManualCompletionRepository,
    private readonly notices: OperatorNoticesService,
    private readonly prices: DropPricesRepository,
    private readonly market: DropMarketService,
    private readonly items: DropItemsRepository,
    private readonly boxes: DropBoxesRepository,
    private readonly drops: BossDropsRepository,
    private readonly crystals: CrystalPricesRepository,
    private readonly worlds: WorldsRepository,
    private readonly spend: SpendCatalogRepository,
    private readonly symbolCosts: SymbolCostsRepository,
    private readonly contents: ContentsRepository,
    private readonly equipment: EquipmentItemsRepository,
    private readonly enhancement: EnhancementCostsRepository,
    private readonly mvp: MvpGradesRepository,
    private readonly hunting: HuntingGroundsRepository,
    private readonly cashbook: CashbookCategoriesRepository,
    private readonly huntLoot: HuntLootRepository,
    private readonly assets: AssetsRepository,
  ) {}

  /**
   * 그림 칸이 가리키는 그림이 그림 표에 있어야 쓴다. 앱은 번들 없이 서버 그림만 그리므로, 없는 그림을 가리키면
   * 앱이 에러 없이 그림만 빈 채로 그린다. 그래서 쓰기 전에 막는다. 빈 칸은 보지 않는다.
   */
  private async requireAssets(
    refs: readonly [AssetRef, string | null | undefined][],
  ): Promise<void> {
    const present = refs.flatMap(([ref, value]) => (value == null ? [] : [{ ref, value }]))
    const missing = await this.assets.missing(present)
    if (missing.length > 0)
      throw new BadRequestException(`그림 표에 없는 그림이다: ${missing.join(', ')}`)
  }

  private requireContentAssets(body: ContentUpdateBody): Promise<void> {
    return this.requireAssets([
      ['mapBackground', body.backgroundMap],
      ['bossPortrait', body.backgroundPortrait],
    ])
  }

  @Get()
  @Header('content-type', 'text/html; charset=utf-8')
  @Header('cache-control', 'no-store')
  index(): string {
    return INDEX_HTML
  }

  @Get('bosses')
  @Header('content-type', 'text/html; charset=utf-8')
  @Header('cache-control', 'no-store')
  bossesPage(): string {
    return BOSSES_HTML
  }

  /** 규칙 둘을 적는다. */
  @Put('bosses/rules')
  @HttpCode(204)
  async setRules(@Body(new ZodValidationPipe(rulesInput)) body: RulesInput): Promise<void> {
    await this.bosses.setRules(body)
  }

  /** 새 보스를 맨 뒤에 더한다. 같은 key 가 있으면 409 다. */
  @Post('bosses')
  @HttpCode(201)
  async createBoss(@Body(new ZodValidationPipe(bossInput)) body: BossInput) {
    await this.requireAssets([['bossPortrait', body.portraitSlug]])
    try {
      return await this.bosses.createBoss(body)
    } catch (error) {
      if (error instanceof BossExists) throw new ConflictException(`이미 있는 보스다: ${body.key}`)
      throw error
    }
  }

  /** 유효 기간 둘을 적는다. 시즌이 끝나는 날을 until 에 적으면 그 날을 품은 주까지 서고 다음 주부터 안 선다. 모르는 보스는 404 다. */
  @Put('bosses/:key/period')
  @HttpCode(204)
  async setBossPeriod(
    @Param('key', new ZodValidationPipe(bossKeyParam)) key: string,
    @Body(new ZodValidationPipe(periodInput)) body: PeriodInput,
  ): Promise<void> {
    if (!(await this.bosses.setPeriod(key, body)))
      throw new NotFoundException(`모르는 보스다: ${key}`)
  }

  /** 별칭을 갈아 끼운다. 이미 있는 보스에서 고칠 수 있는 칸은 이것뿐이다. 모르는 보스는 404 다. */
  @Put('bosses/:key/alias')
  @HttpCode(204)
  async setBossAlias(
    @Param('key', new ZodValidationPipe(bossKeyParam)) key: string,
    @Body(new ZodValidationPipe(aliasBody)) body: AliasBody,
  ): Promise<void> {
    if (!(await this.bosses.setAlias(key, body.alias)))
      throw new NotFoundException(`모르는 보스다: ${key}`)
  }

  /** 난이도 줄의 유효 기간 둘을 적는다. 새로 생긴 난이도의 시작이 그것이다. 모르는 조합은 404 다. */
  @Put('bosses/:key/difficulties/:difficulty/period')
  @HttpCode(204)
  async setDifficultyPeriod(
    @Param('key', new ZodValidationPipe(bossKeyParam)) key: string,
    @Param('difficulty', new ZodValidationPipe(difficultyParam))
    difficulty: BossInput['difficulties'][number]['difficulty'],
    @Body(new ZodValidationPipe(periodInput)) body: PeriodInput,
  ): Promise<void> {
    if (!(await this.bosses.setDifficultyPeriod(key, difficulty, body)))
      throw new NotFoundException(`모르는 보스 난이도다: ${key}/${difficulty}`)
  }

  /** 난이도 줄을 더하거나 요구 레벨을 갈아 끼운다. 모르는 보스는 404 다. */
  @Put('bosses/:key/difficulties/:difficulty')
  @HttpCode(204)
  async upsertDifficulty(
    @Param('key', new ZodValidationPipe(bossKeyParam)) key: string,
    @Param('difficulty', new ZodValidationPipe(difficultyParam))
    difficulty: BossInput['difficulties'][number]['difficulty'],
    @Body(new ZodValidationPipe(requiredLevelBody)) body: RequiredLevelBody,
  ): Promise<void> {
    if (
      !(await this.bosses.upsertDifficulty(key, {
        difficulty,
        requiredLevel: body.requiredLevel,
        from: body.from ?? null,
        until: body.until ?? null,
      }))
    ) {
      throw new NotFoundException(`모르는 보스다: ${key}`)
    }
  }

  /** 난이도 줄을 지운다. 없으면 404, 마지막 줄이면 409 다. */
  @Delete('bosses/:key/difficulties/:difficulty')
  @HttpCode(204)
  async deleteDifficulty(
    @Param('key', new ZodValidationPipe(bossKeyParam)) key: string,
    @Param('difficulty', new ZodValidationPipe(difficultyParam))
    difficulty: BossInput['difficulties'][number]['difficulty'],
  ): Promise<void> {
    try {
      if (!(await this.bosses.deleteDifficulty(key, difficulty))) throw new NotFoundException()
    } catch (error) {
      if (error instanceof LastDifficulty)
        throw new ConflictException(
          '마지막 난이도는 못 지운다. 난이도 없는 보스는 앱이 표 전체를 거절한다',
        )
      throw error
    }
  }

  @Get('manual-completion')
  @Header('content-type', 'text/html; charset=utf-8')
  @Header('cache-control', 'no-store')
  manualPage(): string {
    return MANUAL_COMPLETION_HTML
  }

  /** 화면이 부른다. 열린 것과 닫은 것 전부와 고를 수 있는 보스. */
  @Get('manual-completion/rows')
  @Header('cache-control', 'no-store')
  async manualRows() {
    const [rows, bosses] = await Promise.all([this.manual.rows(), this.bosses.options()])
    return { rows, bosses: bosses.map((b) => ({ key: b.key, name: b.name })) }
  }

  /** 연다. 모르는 보스는 404, 이미 열린 보스는 409 다. */
  @Post('manual-completion')
  @HttpCode(201)
  async openBoss(@Body(new ZodValidationPipe(openBody)) body: OpenBody) {
    const boss = await this.bosses.findByKey(body.boss)
    if (boss === null) throw new NotFoundException(`모르는 보스다: ${body.boss}`)
    try {
      return await this.manual.openBoss(boss.id, body.from)
    } catch (error) {
      if (error instanceof AlreadyOpen) throw new ConflictException(`이미 열려 있다: ${body.boss}`)
      throw error
    }
  }

  /** 닫는다. 줄은 남는다. 없거나 이미 닫혔으면 404 다. */
  @Delete('manual-completion/:id')
  @HttpCode(204)
  async closeBoss(@Param('id', new ZodValidationPipe(rowId)) id: string): Promise<void> {
    if (!(await this.manual.close(id))) throw new NotFoundException()
  }

  @Get('notices')
  @Header('content-type', 'text/html; charset=utf-8')
  @Header('cache-control', 'no-store')
  noticesPage(): string {
    return NOTICES_HTML
  }

  /** 화면이 부른다. 운영자 공지만, 최근 것부터. */
  @Get('notices/rows')
  @Header('cache-control', 'no-store')
  async noticeRows() {
    const rows = await this.notices.list()
    return { rows: rows.map(toAdminNotice) }
  }

  /** 쓴다. 저장은 그 자리에서 되고 알림은 push 가 정한다. 지난 시각의 예약은 400 이다. */
  @Post('notices')
  @HttpCode(201)
  async createNotice(@Body(new ZodValidationPipe(noticeCreateBody)) body: NoticeCreateBody) {
    try {
      return await this.notices.create({
        title: body.title,
        body: body.body,
        link: body.link ?? null,
        push:
          body.push === null || body.push === undefined
            ? null
            : {
                title: body.push.title ?? null,
                body: body.push.body ?? null,
                scheduledAt: body.push.scheduledAt ? new Date(body.push.scheduledAt) : null,
              },
      })
    } catch (error) {
      if (error instanceof SchedulePassed) throw new BadRequestException('예약 시각이 이미 지났다')
      throw error
    }
  }

  /** 고친다. 넥슨 공지나 없는 id 는 404 다. */
  @Patch('notices/:id')
  async updateNotice(
    @Param('id', new ZodValidationPipe(rowId)) id: string,
    @Body(new ZodValidationPipe(noticeUpdateBody)) body: NoticeUpdateBody,
  ) {
    const result = await this.notices.update(id, {
      title: body.title,
      body: body.body,
      link: body.link ?? null,
      push:
        body.push === null || body.push === undefined
          ? null
          : { title: body.push.title ?? null, body: body.push.body ?? null },
    })
    if (result === null) throw new NotFoundException()
    return result
  }

  @Delete('notices/:id')
  @HttpCode(204)
  async deleteNotice(@Param('id', new ZodValidationPipe(rowId)) id: string): Promise<void> {
    if (!(await this.notices.remove(id))) throw new NotFoundException()
  }

  /** 아직 안 나간 예약을 내린다. 공지는 남는다. */
  @Delete('notices/:id/schedule')
  @HttpCode(204)
  async cancelSchedule(@Param('id', new ZodValidationPipe(rowId)) id: string): Promise<void> {
    if (!(await this.notices.cancelSchedule(id))) throw new NotFoundException()
  }

  @Get('drop-prices')
  @Header('content-type', 'text/html; charset=utf-8')
  @Header('cache-control', 'no-store')
  dropPricesPage(): string {
    return DROP_PRICES_HTML
  }

  /** 화면이 부른다. 아이템 × 기간의 분포와 최근 줄. 노이즈를 보는 자리라 뺀 가격도 줄에는 보인다. */
  @Get('drop-prices/rows')
  @Header('cache-control', 'no-store')
  async dropPriceRows(@Query(new ZodValidationPipe(dropPriceQuery)) query: DropPriceQuery) {
    const filter = { itemKey: query.itemKey ?? null, periodKey: query.periodKey ?? null }
    const [summary, rows] = await Promise.all([
      this.prices.summary(filter),
      this.prices.recent(filter, query.limit),
    ])
    return { summary, rows }
  }

  @Get('drop-market')
  @Header('content-type', 'text/html; charset=utf-8')
  @Header('cache-control', 'no-store')
  dropMarketPage(): string {
    return DROP_MARKET_HTML
  }

  /** 화면이 부른다. 장비 탭의 거래권과 소비 탭의 월드. */
  @Get('drop-market/scopes')
  @Header('cache-control', 'no-store')
  dropMarketScopes() {
    return this.market.scopes()
  }

  /** 화면이 부른다. 그 범위의 시세마다 한 줄. */
  @Get('drop-market/rows')
  @Header('cache-control', 'no-store')
  dropMarketRows(@Query(new ZodValidationPipe(dropMarketQuery)) query: DropMarketQuery) {
    return this.market.overview({ kind: query.kind, key: query.key }, new Date())
  }

  @Get('drop-market/item')
  @Header('content-type', 'text/html; charset=utf-8')
  @Header('cache-control', 'no-store')
  dropMarketItemPage(): string {
    return DROP_MARKET_ITEM_HTML
  }

  /** 화면이 부른다. 시세 하나의 일봉과 판정 달린 줄. */
  @Get('drop-market/item/rows')
  @Header('cache-control', 'no-store')
  dropMarketItemRows(
    @Query(new ZodValidationPipe(dropMarketItemQuery)) query: DropMarketItemQuery,
  ) {
    const market = { itemKey: query.item, ringLevel: query.ring ?? null }
    return this.market.detail({ kind: query.kind, key: query.key }, market, new Date())
  }

  /** 시세 차트 라이브러리. CDN 에 기대지 않으려고 의존성으로 들여 직접 내보낸다. 패키지 exports 가 dist 를 막아 package.json 옆에서 찾는다. */
  @Get('assets/lightweight-charts.js')
  @Header('content-type', 'text/javascript; charset=utf-8')
  @Header('cache-control', 'public, max-age=86400')
  lightweightCharts(): string {
    chartScript ??= readFileSync(
      join(
        dirname(require.resolve('lightweight-charts/package.json')),
        'dist',
        'lightweight-charts.standalone.production.js',
      ),
      'utf8',
    )
    return chartScript
  }
  /* ── 월드 ── */

  @Get('worlds')
  @Header('content-type', 'text/html; charset=utf-8')
  @Header('cache-control', 'no-store')
  worldsPage(): string {
    return WORLDS_HTML
  }

  /** 화면이 부른다. 앱이 받는 칸 그대로다. */
  @Get('worlds/rows')
  @Header('cache-control', 'no-store')
  worldRows() {
    return this.worlds.adminSection()
  }

  /** 월드를 맨 뒤에 더한다. 같은 key 는 409 다. */
  @Post('worlds')
  @HttpCode(201)
  async createWorld(@Body(new ZodValidationPipe(worldCreateBody)) body: WorldCreateBody) {
    await this.requireAssets([['worldEmblem', body.emblem]])
    try {
      return await this.worlds.create({ ...body, emblem: body.emblem ?? null })
    } catch (error) {
      if (error instanceof WorldExists) throw new ConflictException(`이미 있는 월드다: ${body.key}`)
      throw error
    }
  }

  /** 이름 · 엠블럼 · 챌린저스 · 이벤트를 갈아 끼운다. key 는 기록이 들어 못 바꾼다. 모르면 404 다. */
  @Put('worlds/:key')
  @HttpCode(204)
  async updateWorld(
    @Param('key', new ZodValidationPipe(snakeKey)) key: string,
    @Body(new ZodValidationPipe(worldUpdateBody)) body: WorldUpdateBody,
  ): Promise<void> {
    await this.requireAssets([['worldEmblem', body.emblem]])
    if (!(await this.worlds.update(key, { ...body, emblem: body.emblem ?? null })))
      throw new NotFoundException(`모르는 월드다: ${key}`)
  }

  @Post('worlds/:key/move')
  @HttpCode(204)
  async moveWorld(
    @Param('key', new ZodValidationPipe(snakeKey)) key: string,
    @Body(new ZodValidationPipe(moveBody)) body: MoveBody,
  ): Promise<void> {
    if (!(await this.worlds.move(key, body.direction)))
      throw new NotFoundException(`모르는 월드다: ${key}`)
  }

  /* ── 지출 카탈로그 ── */

  @Get('spend-catalog')
  @Header('content-type', 'text/html; charset=utf-8')
  @Header('cache-control', 'no-store')
  spendCatalogPage(): string {
    return SPEND_CATALOG_HTML
  }

  /** 화면이 부른다. 앱이 받는 칸 그대로다. */
  @Get('spend-catalog/rows')
  @Header('cache-control', 'no-store')
  spendCatalogRows() {
    return this.spend.section()
  }

  /** 관세율과 주화 판매가를 적는다. */
  @Put('spend-catalog/rules')
  @HttpCode(204)
  async setSpendRules(
    @Body(new ZodValidationPipe(spendRulesBody)) body: SpendRulesBody,
  ): Promise<void> {
    await this.spend.setRules(body)
  }

  /** 묶음을 맨 뒤에 더한다. 같은 key 는 409, 지출 갈래가 아니면 404 다. */
  @Post('spend-catalog/groups')
  @HttpCode(201)
  async createSpendGroup(
    @Body(new ZodValidationPipe(spendGroupCreateBody)) body: SpendGroupCreateBody,
  ) {
    try {
      return await this.spend.createGroup(body)
    } catch (error) {
      if (error instanceof SpendGroupExists)
        throw new ConflictException(`이미 있는 묶음이다: ${body.key}`)
      if (error instanceof NoSpendCategory)
        throw new NotFoundException(`모르는 지출 갈래다: ${body.category}`)
      throw error
    }
  }

  /** 이름 · 갈래 · 카드 제목 · 열림을 갈아 끼운다. 닫기가 곧 active 끄기다. 모르는 묶음 · 갈래는 404 다. */
  @Put('spend-catalog/groups/:key')
  @HttpCode(204)
  async updateSpendGroup(
    @Param('key', new ZodValidationPipe(snakeKey)) key: string,
    @Body(new ZodValidationPipe(spendGroupUpdateBody)) body: SpendGroupUpdateBody,
  ): Promise<void> {
    try {
      if (!(await this.spend.updateGroup(key, body)))
        throw new NotFoundException(`모르는 묶음이다: ${key}`)
    } catch (error) {
      if (error instanceof NoSpendCategory)
        throw new NotFoundException(`모르는 지출 갈래다: ${body.category}`)
      throw error
    }
  }

  /** 에픽던전 형태의 이름을 바꾼다. 형태는 앱 코드가 key 로 갈려 더하기가 없다. */
  @Put('spend-catalog/forms/:key')
  @HttpCode(204)
  async updateSpendForm(
    @Param('key', new ZodValidationPipe(spendFormKey)) key: SpendForm,
    @Body(new ZodValidationPipe(spendFormUpdateBody)) body: SpendFormUpdateBody,
  ): Promise<void> {
    if (!(await this.spend.updateForm(key, body.name)))
      throw new NotFoundException(`모르는 형태다: ${key}`)
  }

  @Post('spend-catalog/groups/:key/move')
  @HttpCode(204)
  async moveSpendGroup(
    @Param('key', new ZodValidationPipe(snakeKey)) key: string,
    @Body(new ZodValidationPipe(moveBody)) body: MoveBody,
  ): Promise<void> {
    if (!(await this.spend.moveGroup(key, body.direction)))
      throw new NotFoundException(`모르는 묶음이다: ${key}`)
  }

  /** 타일을 더한다. 같은 key 는 409 다. */
  @Post('spend-catalog/tiles')
  @HttpCode(201)
  async createSpendTile(
    @Body(new ZodValidationPipe(spendTileCreateBody)) body: SpendTileCreateBody,
  ) {
    await this.requireAssets([
      ['itemIcon', body.iconFile],
      ['mapIcon', body.iconMap],
    ])
    try {
      return await this.spend.createTile({
        key: body.key,
        name: body.name,
        iconFile: body.iconFile ?? null,
        iconMap: body.iconMap ?? null,
      })
    } catch (error) {
      if (error instanceof SpendTileExists)
        throw new ConflictException(`이미 있는 타일이다: ${body.key}`)
      throw error
    }
  }

  @Put('spend-catalog/tiles/:key')
  @HttpCode(204)
  async updateSpendTile(
    @Param('key', new ZodValidationPipe(snakeKey)) key: string,
    @Body(new ZodValidationPipe(spendTileUpdateBody)) body: SpendTileUpdateBody,
  ): Promise<void> {
    await this.requireAssets([
      ['itemIcon', body.iconFile],
      ['mapIcon', body.iconMap],
    ])
    if (
      !(await this.spend.updateTile(key, {
        name: body.name,
        iconFile: body.iconFile ?? null,
        iconMap: body.iconMap ?? null,
      }))
    )
      throw new NotFoundException(`모르는 타일이다: ${key}`)
  }

  /** 항목을 묶음 맨 뒤에 더한다. 모르는 묶음 · 타일은 404, 같은 key 는 409, 시트가 못 가르는 모양은 400 이다. */
  @Post('spend-catalog/items')
  @HttpCode(201)
  async createSpendItem(
    @Body(new ZodValidationPipe(spendItemCreateBody)) body: SpendItemCreateBody,
  ) {
    try {
      return await this.spend.createItem({
        key: body.key,
        group: body.group,
        ...spendItemFields(body),
      })
    } catch (error) {
      throw spendItemError(error, body.key)
    }
  }

  /** 항목을 갈아 끼운다. key 와 묶음은 못 바꾼다. 모르면 404 다. */
  @Put('spend-catalog/items/:key')
  @HttpCode(204)
  async updateSpendItem(
    @Param('key', new ZodValidationPipe(snakeKey)) key: string,
    @Body(new ZodValidationPipe(spendItemUpdateBody)) body: SpendItemUpdateBody,
  ): Promise<void> {
    try {
      if (!(await this.spend.updateItem(key, spendItemFields(body))))
        throw new NotFoundException(`모르는 항목이다: ${key}`)
    } catch (error) {
      throw spendItemError(error, key)
    }
  }

  @Post('spend-catalog/items/:key/move')
  @HttpCode(204)
  async moveSpendItem(
    @Param('key', new ZodValidationPipe(snakeKey)) key: string,
    @Body(new ZodValidationPipe(moveBody)) body: MoveBody,
  ): Promise<void> {
    if (!(await this.spend.moveItem(key, body.direction)))
      throw new NotFoundException(`모르는 항목이다: ${key}`)
  }

  /* ── 가계부 갈래 ── */

  @Get('cashbook-categories')
  @Header('content-type', 'text/html; charset=utf-8')
  @Header('cache-control', 'no-store')
  cashbookCategoriesPage(): string {
    return CASHBOOK_CATEGORIES_HTML
  }

  /** 화면이 부른다. 앱이 받는 칸 그대로다. */
  @Get('cashbook-categories/rows')
  @Header('cache-control', 'no-store')
  cashbookCategoryRows() {
    return this.cashbook.section()
  }

  /** 갈래를 그 쪽 맨 뒤에 더한다. 같은 (entryType, key) 는 409 다. 앱은 폼을 모르는 갈래를 못 고르게 막는다. */
  @Post('cashbook-categories')
  @HttpCode(201)
  async createCashbookCategory(
    @Body(new ZodValidationPipe(cashbookCategoryCreateBody)) body: CashbookCategoryCreateBody,
  ) {
    await this.requireAssets([['itemIcon', body.iconFile]])
    try {
      return await this.cashbook.createCategory({ ...body, unit: body.unit ?? null })
    } catch (error) {
      if (error instanceof CashbookCategoryExists)
        throw new ConflictException(`이미 있는 갈래다: ${body.entryType}.${body.key}`)
      throw error
    }
  }

  @Put('cashbook-categories/:entryType/:key')
  @HttpCode(204)
  async updateCashbookCategory(
    @Param('entryType', new ZodValidationPipe(cashbookEntryType)) entryType: CashbookEntryType,
    @Param('key', new ZodValidationPipe(snakeKey)) key: string,
    @Body(new ZodValidationPipe(cashbookCategoryUpdateBody)) body: CashbookCategoryUpdateBody,
  ): Promise<void> {
    await this.requireAssets([['itemIcon', body.iconFile]])
    if (!(await this.cashbook.updateCategory(entryType, key, { ...body, unit: body.unit ?? null })))
      throw new NotFoundException(`모르는 갈래다: ${entryType}.${key}`)
  }

  @Post('cashbook-categories/:entryType/:key/move')
  @HttpCode(204)
  async moveCashbookCategory(
    @Param('entryType', new ZodValidationPipe(cashbookEntryType)) entryType: CashbookEntryType,
    @Param('key', new ZodValidationPipe(snakeKey)) key: string,
    @Body(new ZodValidationPipe(moveBody)) body: MoveBody,
  ): Promise<void> {
    if (!(await this.cashbook.moveCategory(entryType, key, body.direction)))
      throw new NotFoundException(`모르는 갈래다: ${entryType}.${key}`)
  }

  /** 아이템 종류의 이름 · 단위 · 관세 여부를 바꾼다. 종류는 앱 코드가 key 로 갈려 더하기가 없다. */
  @Put('cashbook-item-kinds/:key')
  @HttpCode(204)
  async updateCashbookItemKind(
    @Param('key', new ZodValidationPipe(snakeKey)) key: string,
    @Body(new ZodValidationPipe(cashbookItemKindUpdateBody)) body: CashbookItemKindUpdateBody,
  ): Promise<void> {
    if (
      !(await this.cashbook.updateItemKind(key, {
        name: body.name,
        unit: body.unit ?? null,
        hasTariff: body.hasTariff,
      }))
    )
      throw new NotFoundException(`모르는 아이템 종류다: ${key}`)
  }

  /* ── 사냥 전리품 ── */

  @Get('hunt-loot')
  @Header('content-type', 'text/html; charset=utf-8')
  @Header('cache-control', 'no-store')
  huntLootPage(): string {
    return HUNT_LOOT_HTML
  }

  /** 화면이 부른다. 앱이 받는 칸 그대로다. */
  @Get('hunt-loot/rows')
  @Header('cache-control', 'no-store')
  huntLootRows() {
    return this.huntLoot.section()
  }

  /** 맨 뒤에 더한다. 같은 key 는 409 다. */
  @Post('hunt-loot')
  @HttpCode(201)
  async createHuntLoot(@Body(new ZodValidationPipe(huntLootCreateBody)) body: HuntLootCreateBody) {
    await this.requireAssets([['itemIcon', body.iconFile]])
    try {
      return await this.huntLoot.create({
        ...body,
        npcPriceMeso: body.npcPriceMeso ?? null,
        from: body.from ?? null,
        until: body.until ?? null,
      })
    } catch (error) {
      if (error instanceof HuntLootExists)
        throw new ConflictException(`이미 있는 전리품이다: ${body.key}`)
      throw error
    }
  }

  @Put('hunt-loot/:key')
  @HttpCode(204)
  async updateHuntLoot(
    @Param('key', new ZodValidationPipe(snakeKey)) key: string,
    @Body(new ZodValidationPipe(huntLootUpdateBody)) body: HuntLootUpdateBody,
  ): Promise<void> {
    await this.requireAssets([['itemIcon', body.iconFile]])
    let found: boolean
    try {
      found = await this.huntLoot.update(key, {
        ...body,
        npcPriceMeso: body.npcPriceMeso ?? null,
        from: body.from ?? null,
        until: body.until ?? null,
      })
    } catch (error) {
      if (error instanceof HuntLootPriceShape)
        throw new BadRequestException('NPC 가격은 소비에만 있고 소비에는 반드시 있다')
      throw error
    }
    if (!found) throw new NotFoundException(`모르는 전리품이다: ${key}`)
  }

  @Post('hunt-loot/:key/move')
  @HttpCode(204)
  async moveHuntLoot(
    @Param('key', new ZodValidationPipe(snakeKey)) key: string,
    @Body(new ZodValidationPipe(moveBody)) body: MoveBody,
  ): Promise<void> {
    if (!(await this.huntLoot.move(key, body.direction)))
      throw new NotFoundException(`모르는 전리품이다: ${key}`)
  }

  /* ── 심볼 비용 ── */

  @Get('symbol-costs')
  @Header('content-type', 'text/html; charset=utf-8')
  @Header('cache-control', 'no-store')
  symbolCostsPage(): string {
    return SYMBOL_COSTS_HTML
  }

  /** 화면이 부른다. 묶음 → 심볼 → 레벨 → 가격 줄 전부다. */
  @Get('symbol-costs/rows')
  @Header('cache-control', 'no-store')
  symbolCostRows() {
    return this.symbolCosts.adminRows()
  }

  @Post('symbol-costs/groups')
  @HttpCode(201)
  async createSymbolGroup(
    @Body(new ZodValidationPipe(symbolGroupCreateBody)) body: SymbolGroupCreateBody,
  ) {
    try {
      return await this.symbolCosts.createGroup(body)
    } catch (error) {
      if (error instanceof SymbolGroupExists)
        throw new ConflictException(`이미 있는 묶음이다: ${body.key}`)
      throw error
    }
  }

  /** 이름 · 만렙 · 기본 범위를 갈아 끼운다. 만렙 위에 비용 줄이 있으면 409 다. 모르면 404 다. */
  @Put('symbol-costs/groups/:key')
  @HttpCode(204)
  async updateSymbolGroup(
    @Param('key', new ZodValidationPipe(snakeKey)) key: string,
    @Body(new ZodValidationPipe(symbolGroupUpdateBody)) body: SymbolGroupUpdateBody,
  ): Promise<void> {
    try {
      if (!(await this.symbolCosts.updateGroup(key, body)))
        throw new NotFoundException(`모르는 묶음이다: ${key}`)
    } catch (error) {
      if (error instanceof LevelsAboveMax)
        throw new ConflictException(`만렙 위에 비용 줄이 있다. 레벨 ${error.message} 까지 있다`)
      throw error
    }
  }

  /** 심볼을 묶음 맨 뒤에 더한다. 비용은 따로 한 번에 넣는다. 모르는 묶음은 404, 같은 key 는 409 다. */
  @Post('symbol-costs/symbols')
  @HttpCode(201)
  async createSymbol(@Body(new ZodValidationPipe(symbolCreateBody)) body: SymbolCreateBody) {
    await this.requireAssets([['itemIcon', body.iconFile]])
    try {
      return await this.symbolCosts.createSymbol(body)
    } catch (error) {
      if (error instanceof NoSymbolGroup)
        throw new NotFoundException(`모르는 묶음이다: ${body.group}`)
      if (error instanceof SymbolExists)
        throw new ConflictException(`이미 있는 심볼이다: ${body.key}`)
      throw error
    }
  }

  @Put('symbol-costs/symbols/:key')
  @HttpCode(204)
  async updateSymbol(
    @Param('key', new ZodValidationPipe(snakeKey)) key: string,
    @Body(new ZodValidationPipe(symbolUpdateBody)) body: SymbolUpdateBody,
  ): Promise<void> {
    await this.requireAssets([['itemIcon', body.iconFile]])
    if (!(await this.symbolCosts.updateSymbol(key, body)))
      throw new NotFoundException(`모르는 심볼이다: ${key}`)
  }

  @Post('symbol-costs/symbols/:key/move')
  @HttpCode(204)
  async moveSymbol(
    @Param('key', new ZodValidationPipe(snakeKey)) key: string,
    @Body(new ZodValidationPipe(moveBody)) body: MoveBody,
  ): Promise<void> {
    if (!(await this.symbolCosts.moveSymbol(key, body.direction)))
      throw new NotFoundException(`모르는 심볼이다: ${key}`)
  }

  /** 레벨 여럿의 새 비용을 한 번에 연다. 지금 줄은 닫힌다. 모르는 심볼은 404, 시작 · 레벨 · 빠진 레벨은 400 이다. */
  @Post('symbol-costs/symbols/:key/costs')
  @HttpCode(201)
  async addSymbolCosts(
    @Param('key', new ZodValidationPipe(snakeKey)) key: string,
    @Body(new ZodValidationPipe(symbolCostsBody)) body: SymbolCostsBody,
  ) {
    try {
      return await this.symbolCosts.addCosts(key, { from: body.from ?? null, costs: body.costs })
    } catch (error) {
      if (error instanceof NoSymbol) throw new NotFoundException(`모르는 심볼이다: ${key}`)
      if (error instanceof LevelOutOfRange)
        throw new BadRequestException(`레벨이 범위 밖이다: ${error.message}`)
      if (error instanceof LevelsIncomplete)
        throw new BadRequestException(
          `레벨 ${error.message} 의 비용이 없다. 1 부터 만렙 - 1 까지 전부 있어야 한다`,
        )
      if (error instanceof NotAfterCurrentCost)
        throw new BadRequestException(`시작이 지금 줄보다 뒤여야 한다: ${error.message}`)
      throw error
    }
  }

  /** 지금 비용 줄을 거둔다. 바로 앞 줄이 다시 열린다. 없으면 404, 지난 줄이거나 유일한 줄이면 409 다. */
  @Delete('symbol-costs/rows/:id')
  @HttpCode(204)
  async removeSymbolCost(@Param('id', new ZodValidationPipe(rowId)) id: string): Promise<void> {
    try {
      if (!(await this.symbolCosts.removeLatest(id))) throw new NotFoundException()
    } catch (error) {
      if (error instanceof NotLatestCost)
        throw new ConflictException('지난 줄은 못 거둔다. 과거 기록이 그 값을 읽었다')
      if (error instanceof OnlyRow)
        throw new ConflictException('그 레벨의 유일한 줄이다. 거두면 빈 레벨이 생긴다')
      throw error
    }
  }

  /* ── 드롭 아이템 ── */

  @Get('drop-items')
  @Header('content-type', 'text/html; charset=utf-8')
  @Header('cache-control', 'no-store')
  dropItemsPage(): string {
    return DROP_ITEMS_HTML
  }

  /** 화면이 부른다. 앱이 받는 칸에 월드 간 거래 불가를 더했다. */
  @Get('drop-items/rows')
  @Header('cache-control', 'no-store')
  dropItemRows() {
    return this.items.adminSection()
  }

  /** 아이템을 더한다. 같은 key 는 409 다. */
  @Post('drop-items')
  @HttpCode(201)
  async createDropItem(@Body(new ZodValidationPipe(dropItemCreateBody)) body: DropItemCreateBody) {
    await this.requireAssets([['itemIcon', body.iconFile]])
    try {
      return await this.items.create({ ...body, iconFile: body.iconFile ?? null })
    } catch (error) {
      if (error instanceof DropItemExists)
        throw new ConflictException(`이미 있는 아이템이다: ${body.key}`)
      throw error
    }
  }

  /** 이름 · 그림 · 고가 · 월드 간 거래 불가를 갈아 끼운다. key 는 기록이 들어 못 바꾼다. 모르면 404 다. */
  @Put('drop-items/:key')
  @HttpCode(204)
  async updateDropItem(
    @Param('key', new ZodValidationPipe(snakeKey)) key: string,
    @Body(new ZodValidationPipe(dropItemUpdateBody)) body: DropItemUpdateBody,
  ): Promise<void> {
    await this.requireAssets([['itemIcon', body.iconFile]])
    if (!(await this.items.update(key, { ...body, iconFile: body.iconFile ?? null })))
      throw new NotFoundException(`모르는 아이템이다: ${key}`)
  }

  /* ── 상자 ── */

  @Get('drop-boxes')
  @Header('content-type', 'text/html; charset=utf-8')
  @Header('cache-control', 'no-store')
  dropBoxesPage(): string {
    return DROP_BOXES_HTML
  }

  /** 화면이 부른다. 상자와 내용물에 아이템 이름을 붙이고, 고를 아이템 목록을 함께 낸다. */
  @Get('drop-boxes/rows')
  @Header('cache-control', 'no-store')
  async dropBoxRows() {
    const [section, items] = await Promise.all([this.boxes.section(), this.items.section()])
    const nameOf = new Map(items.items.map((i) => [i.key, i.name]))
    return {
      updatedAt: section.updatedAt,
      boxes: section.boxes.map((b) => ({
        ...b,
        name: nameOf.get(b.item) ?? b.item,
        contents: b.contents.map((item) => ({ item, name: nameOf.get(item) ?? item })),
      })),
      items: items.items.map((i) => ({ key: i.key, name: i.name })),
    }
  }

  /** 상자를 더한다. 모르는 아이템은 404, 이미 상자면 409 다. */
  @Post('drop-boxes')
  @HttpCode(201)
  async createDropBox(@Body(new ZodValidationPipe(dropBoxCreateBody)) body: DropBoxCreateBody) {
    try {
      return await this.boxes.create({
        item: body.item,
        levelMin: body.levelMin ?? null,
        levelMax: body.levelMax ?? null,
      })
    } catch (error) {
      if (error instanceof NoDropItemForBox)
        throw new NotFoundException(`모르는 아이템이다: ${body.item}`)
      if (error instanceof DropBoxExists) throw new ConflictException(`이미 상자다: ${body.item}`)
      throw error
    }
  }

  @Put('drop-boxes/:item')
  @HttpCode(204)
  async setDropBoxLevels(
    @Param('item', new ZodValidationPipe(snakeKey)) item: string,
    @Body(new ZodValidationPipe(dropBoxLevelsBody)) body: DropBoxLevelsBody,
  ): Promise<void> {
    if (
      !(await this.boxes.setLevels(item, {
        levelMin: body.levelMin ?? null,
        levelMax: body.levelMax ?? null,
      }))
    )
      throw new NotFoundException(`모르는 상자다: ${item}`)
  }

  /** 내용물을 맨 뒤에 더한다. 모르는 상자 · 아이템은 404, 이미 있으면 409 다. */
  @Post('drop-boxes/:item/contents')
  @HttpCode(204)
  async addBoxContent(
    @Param('item', new ZodValidationPipe(snakeKey)) item: string,
    @Body(new ZodValidationPipe(boxContentBody)) body: { item: string },
  ): Promise<void> {
    try {
      if (!(await this.boxes.addContent(item, body.item)))
        throw new NotFoundException(`모르는 상자다: ${item}`)
    } catch (error) {
      if (error instanceof NoDropItemForBox)
        throw new NotFoundException(`모르는 아이템이다: ${body.item}`)
      if (error instanceof ContentExists)
        throw new ConflictException(`이미 든 아이템이다: ${body.item}`)
      throw error
    }
  }

  @Delete('drop-boxes/:item/contents/:content')
  @HttpCode(204)
  async removeBoxContent(
    @Param('item', new ZodValidationPipe(snakeKey)) item: string,
    @Param('content', new ZodValidationPipe(snakeKey)) content: string,
  ): Promise<void> {
    if (!(await this.boxes.removeContent(item, content))) throw new NotFoundException()
  }

  @Post('drop-boxes/:item/contents/:content/move')
  @HttpCode(204)
  async moveBoxContent(
    @Param('item', new ZodValidationPipe(snakeKey)) item: string,
    @Param('content', new ZodValidationPipe(snakeKey)) content: string,
    @Body(new ZodValidationPipe(moveBody)) body: MoveBody,
  ): Promise<void> {
    if (!(await this.boxes.moveContent(item, content, body.direction)))
      throw new NotFoundException()
  }

  /* ── 드롭 표 ── */

  @Get('boss-drops')
  @Header('content-type', 'text/html; charset=utf-8')
  @Header('cache-control', 'no-store')
  bossDropsPage(): string {
    return BOSS_DROPS_HTML
  }

  /** 화면이 부른다. 한 조합의 줄. */
  @Get('boss-drops/rows')
  @Header('cache-control', 'no-store')
  async bossDropRows(@Query(new ZodValidationPipe(bossDropQuery)) query: BossDropQuery) {
    return { rows: await this.drops.rows(query.boss, query.difficulty) }
  }

  /** 줄을 그 조합 · 갈래의 맨 뒤에 더한다. 모르는 조합 · 아이템은 404, 같은 줄은 409 다. */
  @Post('boss-drops')
  @HttpCode(201)
  async createBossDrop(@Body(new ZodValidationPipe(bossDropCreateBody)) body: BossDropCreateBody) {
    try {
      return await this.drops.create({
        boss: body.boss,
        difficulty: body.difficulty,
        category: body.category,
        item: body.item,
        amount: body.amount ?? null,
        from: body.from ?? null,
        until: body.until ?? null,
      })
    } catch (error) {
      if (error instanceof NoBossDifficultyForDrop)
        throw new NotFoundException(`모르는 보스 난이도다: ${body.boss}/${body.difficulty}`)
      if (error instanceof NoDropItemForDrop)
        throw new NotFoundException(`모르는 아이템이다: ${body.item}`)
      if (error instanceof RewardExists)
        throw new ConflictException('같은 조합 · 갈래 · 아이템 · 시작의 줄이 이미 있다')
      throw error
    }
  }

  @Put('boss-drops/:id')
  @HttpCode(204)
  async updateBossDrop(
    @Param('id', new ZodValidationPipe(rowId)) id: string,
    @Body(new ZodValidationPipe(bossDropUpdateBody)) body: BossDropUpdateBody,
  ): Promise<void> {
    try {
      if (
        !(await this.drops.update(id, {
          amount: body.amount ?? null,
          from: body.from ?? null,
          until: body.until ?? null,
        }))
      )
        throw new NotFoundException()
    } catch (error) {
      if (error instanceof RewardExists)
        throw new ConflictException('같은 조합 · 갈래 · 아이템 · 시작의 줄이 이미 있다')
      throw error
    }
  }

  @Delete('boss-drops/:id')
  @HttpCode(204)
  async deleteBossDrop(@Param('id', new ZodValidationPipe(rowId)) id: string): Promise<void> {
    if (!(await this.drops.remove(id))) throw new NotFoundException()
  }

  @Post('boss-drops/:id/move')
  @HttpCode(204)
  async moveBossDrop(
    @Param('id', new ZodValidationPipe(rowId)) id: string,
    @Body(new ZodValidationPipe(moveBody)) body: MoveBody,
  ): Promise<void> {
    if (!(await this.drops.move(id, body.direction))) throw new NotFoundException()
  }

  /* ── 결정석 가격 ── */

  @Get('crystal-prices')
  @Header('content-type', 'text/html; charset=utf-8')
  @Header('cache-control', 'no-store')
  crystalPricesPage(): string {
    return CRYSTAL_PRICES_HTML
  }

  /** 화면이 부른다. 보스 표의 난이도 줄 전부와 그 가격 줄, 기본 파티 인원 상한. */
  @Get('crystal-prices/rows')
  @Header('cache-control', 'no-store')
  async crystalPriceRows() {
    const [pairs, catalog, section] = await Promise.all([
      this.crystals.pairs(),
      this.bosses.catalog(),
      this.crystals.section(),
    ])
    return {
      updatedAt: section.updatedAt,
      defaultMaxPartySize: catalog.rules.defaultMaxPartySize,
      pairs,
    }
  }

  /** 새 가격을 적는다. 지금 줄은 닫힌다. 모르는 조합은 404, 경계 · 겹침은 400 이다. */
  @Post('crystal-prices/:boss/:difficulty')
  @HttpCode(201)
  async addCrystalPrice(
    @Param('boss', new ZodValidationPipe(bossKeyParam)) boss: string,
    @Param('difficulty', new ZodValidationPipe(difficultyParam))
    difficulty: BossInput['difficulties'][number]['difficulty'],
    @Body(new ZodValidationPipe(crystalPriceBody)) body: CrystalPriceBody,
  ) {
    try {
      return await this.crystals.addPrice(boss, difficulty, {
        priceMeso: body.priceMeso,
        from: body.from ?? null,
      })
    } catch (error) {
      if (error instanceof NoBossDifficultyForPrice)
        throw new NotFoundException(`모르는 보스 난이도다: ${boss}/${difficulty}`)
      if (error instanceof NotBoundary)
        throw new BadRequestException(
          '시작이 그 보스의 기간 경계가 아니다. 주간은 목요일, 월간은 1일이다',
        )
      if (error instanceof NotAfterCurrent)
        throw new BadRequestException('시작이 지금 가격의 시작보다 뒤여야 한다')
      throw error
    }
  }

  /** 지금 가격 줄을 거둔다. 바로 앞 줄이 다시 열린다. 지난 줄은 409 다. */
  @Delete('crystal-prices/rows/:id')
  @HttpCode(204)
  async removeCrystalPrice(@Param('id', new ZodValidationPipe(rowId)) id: string): Promise<void> {
    try {
      if (!(await this.crystals.removeLatest(id))) throw new NotFoundException()
    } catch (error) {
      if (error instanceof NotLatest)
        throw new ConflictException('지난 줄은 과거 기간이 읽어 못 거둔다')
      throw error
    }
  }

  /** 파티 인원 상한을 적는다. null 이면 기본값으로 돌아간다. 모르는 조합은 404 다. */
  @Put('crystal-prices/:boss/:difficulty/max-party-size')
  @HttpCode(204)
  async setMaxPartySize(
    @Param('boss', new ZodValidationPipe(bossKeyParam)) boss: string,
    @Param('difficulty', new ZodValidationPipe(difficultyParam))
    difficulty: BossInput['difficulties'][number]['difficulty'],
    @Body(new ZodValidationPipe(maxPartySizeBody)) body: MaxPartySizeBody,
  ): Promise<void> {
    if (!(await this.bosses.setMaxPartySize(boss, difficulty, body.maxPartySize)))
      throw new NotFoundException(`모르는 보스 난이도다: ${boss}/${difficulty}`)
  }

  /* ── 컨텐츠 ── */

  @Get('contents')
  @Header('content-type', 'text/html; charset=utf-8')
  @Header('cache-control', 'no-store')
  contentsPage(): string {
    return CONTENTS_HTML
  }

  /** 화면이 부른다. 앱이 받는 칸 그대로다. */
  @Get('contents/rows')
  @Header('cache-control', 'no-store')
  contentRows() {
    return this.contents.section()
  }

  /** 갈래의 글자 · 태그 · 한도 · 공유 차례를 갈아 끼운다. 갈래는 ENUM 이라 더하고 지우는 끝점이 없다. 모르면 404 다. */
  @Put('contents/categories/:key')
  @HttpCode(204)
  async updateContentCategory(
    @Param('key', new ZodValidationPipe(contentCategoryParam)) key: ContentCategory,
    @Body(new ZodValidationPipe(contentCategoryUpdateBody)) body: ContentCategoryUpdateBody,
  ): Promise<void> {
    if (
      !(await this.contents.updateCategory(key, {
        name: body.name,
        countTag: body.countTag ?? null,
        hideCountTag: body.hideCountTag,
        weeklyLimit: body.weeklyLimit ?? null,
        sharedOrder: body.sharedOrder ?? null,
      }))
    )
      throw new NotFoundException(`모르는 갈래다: ${key}`)
  }

  @Post('contents/categories/:key/move')
  @HttpCode(204)
  async moveContentCategory(
    @Param('key', new ZodValidationPipe(contentCategoryParam)) key: ContentCategory,
    @Body(new ZodValidationPipe(moveBody)) body: MoveBody,
  ): Promise<void> {
    if (!(await this.contents.moveCategory(key, body.direction)))
      throw new NotFoundException(`모르는 갈래다: ${key}`)
  }

  /** 컨텐츠를 섹션 맨 뒤에 더한다. 모르는 갈래는 404, 같은 key 나 공백만 다른 API 이름은 409 다. */
  @Post('contents')
  @HttpCode(201)
  async createContent(@Body(new ZodValidationPipe(contentCreateBody)) body: ContentCreateBody) {
    await this.requireContentAssets(body)
    try {
      return await this.contents.createContent({
        ...contentFields(body),
        key: body.key,
        section: body.section,
      })
    } catch (error) {
      throw contentError(error, body.key)
    }
  }

  /** 컨텐츠를 갈아 끼운다. key 와 섹션은 못 바꾼다. 모르면 404 다. */
  @Put('contents/:key')
  @HttpCode(204)
  async updateContent(
    @Param('key', new ZodValidationPipe(snakeKey)) key: string,
    @Body(new ZodValidationPipe(contentUpdateBody)) body: ContentUpdateBody,
  ): Promise<void> {
    await this.requireContentAssets(body)
    try {
      if (!(await this.contents.updateContent(key, contentFields(body))))
        throw new NotFoundException(`모르는 컨텐츠다: ${key}`)
    } catch (error) {
      throw contentError(error, key)
    }
  }

  @Post('contents/:key/move')
  @HttpCode(204)
  async moveContent(
    @Param('key', new ZodValidationPipe(snakeKey)) key: string,
    @Body(new ZodValidationPipe(moveBody)) body: MoveBody,
  ): Promise<void> {
    if (!(await this.contents.moveContent(key, body.direction)))
      throw new NotFoundException(`모르는 컨텐츠다: ${key}`)
  }

  /* ── 장비 ── */

  @Get('equipment-items')
  @Header('content-type', 'text/html; charset=utf-8')
  @Header('cache-control', 'no-store')
  equipmentItemsPage(): string {
    return EQUIPMENT_ITEMS_HTML
  }

  @Get('equipment-items/rows')
  @Header('cache-control', 'no-store')
  equipmentItemRows() {
    return this.equipment.section()
  }

  /** 장비를 더한다. 같은 key · 공백만 다른 이름 · 드롭 표와 어긋난 key 는 409 다. */
  @Post('equipment-items')
  @HttpCode(201)
  async createEquipmentItem(
    @Body(new ZodValidationPipe(equipmentItemCreateBody)) body: EquipmentItemCreateBody,
  ) {
    try {
      return await this.equipment.create({
        key: body.key,
        name: body.name,
        level: body.level ?? null,
      })
    } catch (error) {
      throw equipmentError(error, body.key)
    }
  }

  /** 이름 · 레벨을 갈아 끼운다. key 는 기록이 들어 못 바꾼다. 모르면 404 다. */
  @Put('equipment-items/:key')
  @HttpCode(204)
  async updateEquipmentItem(
    @Param('key', new ZodValidationPipe(snakeKey)) key: string,
    @Body(new ZodValidationPipe(equipmentItemUpdateBody)) body: EquipmentItemUpdateBody,
  ): Promise<void> {
    try {
      if (!(await this.equipment.update(key, { name: body.name, level: body.level ?? null })))
        throw new NotFoundException(`모르는 장비다: ${key}`)
    } catch (error) {
      throw equipmentError(error, key)
    }
  }

  /* ── 강화 비용 ── */

  @Get('enhancement-costs')
  @Header('content-type', 'text/html; charset=utf-8')
  @Header('cache-control', 'no-store')
  enhancementCostsPage(): string {
    return ENHANCEMENT_COSTS_HTML
  }

  @Get('enhancement-costs/rows')
  @Header('cache-control', 'no-store')
  enhancementCostRows() {
    return this.enhancement.section()
  }

  /** 규칙 셋을 적는다. 셋 다 받는다. */
  @Put('enhancement-costs/rules')
  @HttpCode(204)
  async setEnhancementRules(
    @Body(new ZodValidationPipe(enhancementRulesBody)) body: EnhancementRulesBody,
  ): Promise<void> {
    await this.enhancement.setRules(body)
  }

  /** 잠재 재설정의 칸 하나를 고친다. 없는 칸은 404 다. */
  @Put('enhancement-costs/potential/:type/:minLevel/:grade')
  @HttpCode(204)
  async setPotentialResetCost(
    @Param('type', new ZodValidationPipe(potentialTypeParam)) type: PotentialResetType,
    @Param('minLevel', new ZodValidationPipe(minLevelParam)) minLevel: number,
    @Param('grade', new ZodValidationPipe(potentialGradeParam)) grade: PotentialGrade,
    @Body(new ZodValidationPipe(costBody)) body: CostBody,
  ): Promise<void> {
    if (!(await this.enhancement.setPotentialResetCost(type, minLevel, grade, body.costMeso)))
      throw new NotFoundException(`모르는 구간이다: ${type}/${minLevel}/${grade}`)
  }

  /** 구간을 등급 넷과 함께 더한다. 같은 구간은 409 다. */
  @Post('enhancement-costs/potential')
  @HttpCode(201)
  async addPotentialResetBand(
    @Body(new ZodValidationPipe(potentialBandBody)) body: PotentialBandBody,
  ): Promise<void> {
    try {
      await this.enhancement.addPotentialResetBand(body.type, body.minLevel, body.costs)
    } catch (error) {
      if (error instanceof BandExists)
        throw new ConflictException(`이미 있는 구간이다: ${error.message}`)
      throw error
    }
  }

  /** 구간을 등급 넷과 함께 지운다. min_level 1 은 409, 없으면 404 다. */
  @Delete('enhancement-costs/potential/:type/:minLevel')
  @HttpCode(204)
  async removePotentialResetBand(
    @Param('type', new ZodValidationPipe(potentialTypeParam)) type: PotentialResetType,
    @Param('minLevel', new ZodValidationPipe(minLevelParam)) minLevel: number,
  ): Promise<void> {
    try {
      if (!(await this.enhancement.removePotentialResetBand(type, minLevel)))
        throw new NotFoundException(`모르는 구간이다: ${type}/${minLevel}`)
    } catch (error) {
      if (error instanceof BaseBand)
        throw new ConflictException(
          'min_level 1 구간은 못 지운다. 어느 레벨이든 한 줄에 걸려야 한다',
        )
      throw error
    }
  }

  /** 소울 재설정의 등급 비용을 적는다. 등급은 ENUM 이라 없으면 만든다. */
  @Put('enhancement-costs/soul/:grade')
  @HttpCode(204)
  async setSoulPotentialResetCost(
    @Param('grade', new ZodValidationPipe(potentialGradeParam)) grade: PotentialGrade,
    @Body(new ZodValidationPipe(costBody)) body: CostBody,
  ): Promise<void> {
    await this.enhancement.setSoulPotentialResetCost(grade, body.costMeso)
  }

  /** 단계의 지수 · 제수를 고친다. 없는 성수는 404 다. */
  @Put('enhancement-costs/starforce/:fromStar')
  @HttpCode(204)
  async setStarforceStep(
    @Param('fromStar', new ZodValidationPipe(fromStarParam)) fromStar: number,
    @Body(new ZodValidationPipe(starforceStepBody)) body: StarforceStepBody,
  ): Promise<void> {
    if (!(await this.enhancement.setStarforceStep(fromStar, body)))
      throw new NotFoundException(`모르는 성수다: ${fromStar}`)
  }

  /** 끝 성수 다음 단계를 더한다. 더한 성수를 돌려준다. */
  @Post('enhancement-costs/starforce')
  @HttpCode(201)
  addStarforceStep(@Body(new ZodValidationPipe(starforceStepBody)) body: StarforceStepBody) {
    return this.enhancement.addStarforceStep(body)
  }

  /** 끝 성수의 단계를 지운다. 비어 있으면 404 다. */
  @Delete('enhancement-costs/starforce/last')
  @HttpCode(204)
  async removeLastStarforceStep(): Promise<void> {
    if (!(await this.enhancement.removeLastStarforceStep()))
      throw new NotFoundException('단계가 없다')
  }

  /* ── MVP 등급 ── */

  @Get('mvp-grades')
  @Header('content-type', 'text/html; charset=utf-8')
  @Header('cache-control', 'no-store')
  mvpGradesPage(): string {
    return MVP_GRADES_HTML
  }

  @Get('mvp-grades/rows')
  @Header('cache-control', 'no-store')
  mvpGradeRows() {
    return this.mvp.section()
  }

  /** 이름 · 퍼센트 둘을 갈아 끼운다. 등급은 ENUM 이라 더하고 지우는 끝점이 없다. 모르면 404 다. */
  @Put('mvp-grades/:key')
  @HttpCode(204)
  async updateMvpGrade(
    @Param('key', new ZodValidationPipe(mvpGradeParam)) key: MvpGrade,
    @Body(new ZodValidationPipe(mvpGradeUpdateBody)) body: MvpGradeUpdateBody,
  ): Promise<void> {
    if (!(await this.mvp.update(key, body))) throw new NotFoundException(`모르는 등급이다: ${key}`)
  }

  @Post('mvp-grades/:key/move')
  @HttpCode(204)
  async moveMvpGrade(
    @Param('key', new ZodValidationPipe(mvpGradeParam)) key: MvpGrade,
    @Body(new ZodValidationPipe(moveBody)) body: MoveBody,
  ): Promise<void> {
    if (!(await this.mvp.move(key, body.direction)))
      throw new NotFoundException(`모르는 등급이다: ${key}`)
  }

  /* ── 사냥터 ── */

  @Get('hunting-grounds')
  @Header('content-type', 'text/html; charset=utf-8')
  @Header('cache-control', 'no-store')
  huntingGroundsPage(): string {
    return HUNTING_GROUNDS_HTML
  }

  @Get('hunting-grounds/rows')
  @Header('cache-control', 'no-store')
  huntingGroundRows() {
    return this.hunting.section()
  }

  /** 지역을 맨 뒤에 더한다. 같은 key 는 409 다. */
  @Post('hunting-grounds/regions')
  @HttpCode(201)
  async createHuntingRegion(
    @Body(new ZodValidationPipe(huntingRegionCreateBody)) body: HuntingRegionCreateBody,
  ) {
    try {
      return await this.hunting.createRegion(body)
    } catch (error) {
      if (error instanceof RegionExists)
        throw new ConflictException(`이미 있는 지역이다: ${body.key}`)
      throw error
    }
  }

  /** 이름 · 힘 종류를 갈아 끼운다. key 는 사냥터가 들어 못 바꾼다. 모르면 404 다. */
  @Put('hunting-grounds/regions/:key')
  @HttpCode(204)
  async updateHuntingRegion(
    @Param('key', new ZodValidationPipe(snakeKey)) key: string,
    @Body(new ZodValidationPipe(huntingRegionUpdateBody)) body: HuntingRegionUpdateBody,
  ): Promise<void> {
    if (!(await this.hunting.updateRegion(key, body)))
      throw new NotFoundException(`모르는 지역이다: ${key}`)
  }

  @Post('hunting-grounds/regions/:key/move')
  @HttpCode(204)
  async moveHuntingRegion(
    @Param('key', new ZodValidationPipe(snakeKey)) key: string,
    @Body(new ZodValidationPipe(moveBody)) body: MoveBody,
  ): Promise<void> {
    if (!(await this.hunting.moveRegion(key, body.direction)))
      throw new NotFoundException(`모르는 지역이다: ${key}`)
  }

  /** 사냥터를 지역 맨 뒤에 더한다. 모르는 지역 404, 접두가 어긋난 key 400, 같은 key · 이름 409 다. */
  @Post('hunting-grounds/grounds')
  @HttpCode(201)
  async createHuntingGround(
    @Body(new ZodValidationPipe(huntingGroundCreateBody)) body: HuntingGroundCreateBody,
  ) {
    try {
      return await this.hunting.createGround(body)
    } catch (error) {
      throw huntingGroundError(error, body.key)
    }
  }

  /** 사냥터를 갈아 끼운다. key 와 지역은 못 바꾼다. 레벨은 통째로 바뀐다. 모르면 404 다. */
  @Put('hunting-grounds/grounds/:key')
  @HttpCode(204)
  async updateHuntingGround(
    @Param('key', new ZodValidationPipe(snakeKey)) key: string,
    @Body(new ZodValidationPipe(huntingGroundUpdateBody)) body: HuntingGroundUpdateBody,
  ): Promise<void> {
    try {
      if (!(await this.hunting.updateGround(key, body)))
        throw new NotFoundException(`모르는 사냥터다: ${key}`)
    } catch (error) {
      throw huntingGroundError(error, key)
    }
  }

  @Post('hunting-grounds/grounds/:key/move')
  @HttpCode(204)
  async moveHuntingGround(
    @Param('key', new ZodValidationPipe(snakeKey)) key: string,
    @Body(new ZodValidationPipe(moveBody)) body: MoveBody,
  ): Promise<void> {
    if (!(await this.hunting.moveGround(key, body.direction)))
      throw new NotFoundException(`모르는 사냥터다: ${key}`)
  }
}

/** 사냥터 쓰기의 실패를 HTTP 로 옮긴다. 모르는 지역 404, 접두가 어긋난 key 400, 같은 key · 이름 409 다. */
function huntingGroundError(error: unknown, key: string): unknown {
  if (error instanceof NoRegion) return new NotFoundException(`모르는 지역이다: ${error.message}`)
  if (error instanceof GroundKeyPrefix)
    return new BadRequestException(`사냥터 key 는 지역 key 로 시작해야 한다: ${error.message}`)
  if (error instanceof GroundExists) return new ConflictException(`이미 있는 사냥터다: ${key}`)
  if (error instanceof GroundNameTaken)
    return new ConflictException(`같은 이름의 사냥터가 이미 있다: ${error.message}`)
  return error
}

/** 장비 쓰기의 실패를 HTTP 로 옮긴다. 같은 key · 겹치는 이름 · 드롭 표와 어긋난 key 는 409 다. */
function equipmentError(error: unknown, key: string): unknown {
  if (error instanceof EquipmentItemExists) return new ConflictException(`이미 있는 장비다: ${key}`)
  if (error instanceof EquipmentNameTaken)
    return new ConflictException(`공백만 다른 이름이 이미 있다: ${error.message}`)
  if (error instanceof DropItemKeyMismatch)
    return new ConflictException(`드롭 아이템 표에 같은 이름이 다른 key 로 있다: ${error.message}`)
  return error
}

/** 컨텐츠 본문의 빈 칸을 null 로 맞춘다. key 와 섹션은 부르는 쪽이 든다. */
function contentFields(body: ContentUpdateBody) {
  return {
    apiName: body.apiName,
    category: body.category,
    displayName: body.displayName,
    shortName: body.shortName,
    backgroundMap: body.backgroundMap ?? null,
    backgroundPortrait: body.backgroundPortrait ?? null,
    countTag: body.countTag ?? null,
    type: body.type,
    maxCount: body.maxCount,
    requiredLevel: body.requiredLevel ?? null,
    from: body.from ?? null,
    until: body.until ?? null,
    shareScope: body.shareScope,
    sharedShortName: body.sharedShortName ?? null,
    onlyWhenScheduled: body.onlyWhenScheduled,
    trustRegistrationFlag: body.trustRegistrationFlag,
    cumulativeScore: body.cumulativeScore,
    maxCountOverride: body.maxCountOverride ?? null,
  }
}

/** 컨텐츠 쓰기의 실패를 HTTP 로 옮긴다. 모르는 갈래는 404, 같은 key 와 겹치는 API 이름은 409 다. */
function contentError(error: unknown, key: string): unknown {
  if (error instanceof NoContentCategory)
    return new NotFoundException(`모르는 갈래다: ${error.message}`)
  if (error instanceof ContentKeyExists) return new ConflictException(`이미 있는 컨텐츠다: ${key}`)
  if (error instanceof ApiNameTaken)
    return new ConflictException(`공백만 다른 API 이름이 이미 있다: ${error.message}`)
  return error
}

/** 화면이 읽는 모양. 시각은 ISO 문자열이다. */
/** 항목 본문의 nullish 칸을 null 로 맞춘다. 만드는 쪽과 고치는 쪽이 같은 칸을 든다. */
function spendItemFields(body: SpendItemUpdateBody) {
  return {
    tile: body.tile,
    name: body.name,
    shortName: body.shortName ?? null,
    tier: body.tier ?? null,
    currency: body.currency,
    unitPrice: body.unitPrice ?? null,
    unit: body.unit,
    maxQuantity: body.maxQuantity ?? null,
    rewardCoins: body.rewardCoins ?? null,
    from: body.from ?? null,
    until: body.until ?? null,
    options: body.options,
    forms: body.forms,
  }
}

/** 항목 쓰기의 실패를 HTTP 로 옮긴다. 모르는 참조는 404, 같은 key 는 409, 시트가 못 가르는 모양은 400 이다. */
function spendItemError(error: unknown, key: string): unknown {
  if (error instanceof NoSpendGroup)
    return new NotFoundException(`모르는 묶음이다: ${error.message}`)
  if (error instanceof NoSpendTile)
    return new NotFoundException(`모르는 타일이다: ${error.message}`)
  if (error instanceof SpendItemExists) return new ConflictException(`이미 있는 항목이다: ${key}`)
  if (error instanceof SpendItemShape) return new BadRequestException(error.message)
  return error
}

function toAdminNotice(row: NoticeRow) {
  return {
    id: row.id,
    noticeKey: row.noticeKey,
    title: row.title,
    body: row.body ?? '',
    link: row.link,
    publishedAt: row.publishedAt.toISOString(),
    scheduledAt: row.scheduledAt?.toISOString() ?? null,
    sentAt: row.sentAt?.toISOString() ?? null,
    pushTitle: row.pushTitle,
    pushBody: row.pushBody,
  }
}
