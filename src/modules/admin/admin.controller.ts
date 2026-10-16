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

import { ZodValidationPipe } from '../../common/zod-validation.pipe'
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
import { DropPricesRepository } from '../drop-prices/drop-prices.repository'
import { WorldExists, WorldsRepository } from '../worlds/worlds.repository'
import type { NoticeRow } from '../notices/notices.repository'
import { OperatorNoticesService, SchedulePassed } from '../notices/operator-notices.service'
import {
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
  type DropPriceQuery,
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
  type WorldCreateBody,
  worldCreateBody,
  type WorldUpdateBody,
  worldUpdateBody,
} from './admin.dto'
import { BOSS_DROPS_HTML } from './views/boss-drops'
import { BOSSES_HTML } from './views/bosses'
import { CRYSTAL_PRICES_HTML } from './views/crystal-prices'
import { DROP_BOXES_HTML } from './views/drop-boxes'
import { DROP_ITEMS_HTML } from './views/drop-items'
import { DROP_PRICES_HTML } from './views/drop-prices'
import { WORLDS_HTML } from './views/worlds'
import { INDEX_HTML } from './views/index'
import { MANUAL_COMPLETION_HTML } from './views/manual-completion'
import { NOTICES_HTML } from './views/notices'

/**
 * 운영자 화면. 인증은 앞단 nginx 의 auth_basic 이다. 게임 데이터 표 넷(드롭 아이템 · 상자 · 드롭 표 · 결정석 가격)도 여기다.
 *
 * 화면은 JSON 끝점을 fetch 로 부르는 작은 HTML 이다. 폼 본문 파서를 안 들이고 inject 로 그대로 검사한다.
 */
@Controller('admin')
export class AdminController {
  constructor(
    private readonly bosses: BossesRepository,
    private readonly manual: ManualCompletionRepository,
    private readonly notices: OperatorNoticesService,
    private readonly prices: DropPricesRepository,
    private readonly items: DropItemsRepository,
    private readonly boxes: DropBoxesRepository,
    private readonly drops: BossDropsRepository,
    private readonly crystals: CrystalPricesRepository,
    private readonly worlds: WorldsRepository,
  ) {}

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
    return this.worlds.section()
  }

  /** 월드를 맨 뒤에 더한다. 같은 key 는 409 다. */
  @Post('worlds')
  @HttpCode(201)
  async createWorld(@Body(new ZodValidationPipe(worldCreateBody)) body: WorldCreateBody) {
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

  /* ── 드롭 아이템 ── */

  @Get('drop-items')
  @Header('content-type', 'text/html; charset=utf-8')
  @Header('cache-control', 'no-store')
  dropItemsPage(): string {
    return DROP_ITEMS_HTML
  }

  /** 화면이 부른다. 앱이 받는 칸 그대로다. */
  @Get('drop-items/rows')
  @Header('cache-control', 'no-store')
  dropItemRows() {
    return this.items.section()
  }

  /** 아이템을 더한다. 같은 key 는 409 다. */
  @Post('drop-items')
  @HttpCode(201)
  async createDropItem(@Body(new ZodValidationPipe(dropItemCreateBody)) body: DropItemCreateBody) {
    try {
      return await this.items.create({ ...body, iconFile: body.iconFile ?? null })
    } catch (error) {
      if (error instanceof DropItemExists)
        throw new ConflictException(`이미 있는 아이템이다: ${body.key}`)
      throw error
    }
  }

  /** 이름 · 그림 · 고가를 갈아 끼운다. key 는 기록이 들어 못 바꾼다. 모르면 404 다. */
  @Put('drop-items/:key')
  @HttpCode(204)
  async updateDropItem(
    @Param('key', new ZodValidationPipe(snakeKey)) key: string,
    @Body(new ZodValidationPipe(dropItemUpdateBody)) body: DropItemUpdateBody,
  ): Promise<void> {
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
}

/** 화면이 읽는 모양. 시각은 ISO 문자열이다. */
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
