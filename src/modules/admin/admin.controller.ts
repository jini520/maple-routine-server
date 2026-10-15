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
  type RulesInput,
  rulesInput,
} from '../bosses/bosses.dto'
import { BossesRepository, BossExists, LastDifficulty } from '../bosses/bosses.repository'
import {
  AlreadyOpen,
  ManualCompletionRepository,
} from '../manual-completion/manual-completion.repository'
import { DropPricesRepository } from '../drop-prices/drop-prices.repository'
import type { NoticeRow } from '../notices/notices.repository'
import { OperatorNoticesService, SchedulePassed } from '../notices/operator-notices.service'
import {
  type DropPriceQuery,
  dropPriceQuery,
  type NoticeCreateBody,
  noticeCreateBody,
  type NoticeUpdateBody,
  noticeUpdateBody,
  type OpenBody,
  openBody,
  requiredLevelBody,
  rowId,
} from './admin.dto'
import { BOSSES_HTML } from './views/bosses'
import { DROP_PRICES_HTML } from './views/drop-prices'
import { INDEX_HTML } from './views/index'
import { MANUAL_COMPLETION_HTML } from './views/manual-completion'
import { NOTICES_HTML } from './views/notices'

/**
 * 운영자 화면. 인증은 앞단 nginx 의 auth_basic 이다.
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

  /** 난이도 줄을 더하거나 요구 레벨을 갈아 끼운다. 모르는 보스는 404 다. */
  @Put('bosses/:key/difficulties/:difficulty')
  @HttpCode(204)
  async upsertDifficulty(
    @Param('key', new ZodValidationPipe(bossKeyParam)) key: string,
    @Param('difficulty', new ZodValidationPipe(difficultyParam))
    difficulty: BossInput['difficulties'][number]['difficulty'],
    @Body(new ZodValidationPipe(requiredLevelBody)) body: { requiredLevel: number },
  ): Promise<void> {
    if (
      !(await this.bosses.upsertDifficulty(key, { difficulty, requiredLevel: body.requiredLevel }))
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
