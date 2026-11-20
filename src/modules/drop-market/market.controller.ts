import { Controller, Get, NotFoundException, Param, Query, Req, Res } from '@nestjs/common'
import type { FastifyReply, FastifyRequest } from 'fastify'

import { MarketDailyRepository } from './market-daily.repository'

/** 낸 MASPI 가 아직 없을 때의 몸. 앱은 0.00 과 평평한 선을 그린다. */
const EMPTY_MASPI = '{"change":null,"close":null,"date":null,"series":[]}'
const EMPTY_MASPI_ETAG = '"empty-maspi"'

/**
 * 드롭 시세의 공개 조회. 하루 작업이 만들어 저장한 응답을 그대로 준다. 계산하지 않으므로 같은 날이면 모든 앱이 같은 바이트를 받는다.
 * 몸의 해시를 ETag 로 달아, 앱이 가진 것과 같으면 몸 없이 304 로 끝낸다. 사용자 신원은 받지 않는다.
 */
@Controller()
export class MarketController {
  constructor(private readonly repo: MarketDailyRepository) {}

  @Get('v1/market/maspi')
  async maspi(@Req() req: FastifyRequest, @Res() reply: FastifyReply): Promise<void> {
    const stored = await this.repo.latestResponse('maspi')
    await send(req, reply, stored ?? { body: EMPTY_MASPI, etag: EMPTY_MASPI_ETAG })
  }

  @Get('v1/market/items')
  async items(
    @Query('world') world: string | undefined,
    @Req() req: FastifyRequest,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    const stored = world === undefined ? null : await this.repo.latestResponse(`items:${world}`)
    if (stored === null) throw new NotFoundException('시세가 없는 월드다')
    await send(req, reply, stored)
  }

  @Get('v1/market/items/:itemKey')
  async item(
    @Param('itemKey') itemKey: string,
    @Query('ring') ring: string | undefined,
    @Query('world') world: string | undefined,
    @Req() req: FastifyRequest,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    const item = await this.repo.itemByKey(itemKey)
    // 장비는 일반 거래권 하나라 월드를 보지 않는다. 소비 아이템은 월드마다 값이 다르다.
    const scope = item === null ? null : item.worldBound ? (world ?? null) : 'general'
    const stored =
      scope === null
        ? null
        : await this.repo.latestResponse(`item:${itemKey}:${ring ?? ''}:${scope}`)
    if (stored === null) throw new NotFoundException('신뢰할 수 있는 시세가 아니다')
    await send(req, reply, stored)
  }
}

async function send(
  req: FastifyRequest,
  reply: FastifyReply,
  stored: { body: string; etag: string },
): Promise<void> {
  void reply.header('etag', stored.etag).header('cache-control', 'no-cache')
  if (matches(req.headers['if-none-match'], stored.etag)) {
    await reply.code(304).send()
    return
  }
  await reply.type('application/json; charset=utf-8').send(stored.body)
}

/** nginx 가 gzip 으로 줄이면 ETag 앞에 `W/` 를 붙인다. 앱은 그 값을 되돌려 보내므로 약한 비교로 본다. */
function matches(header: string | undefined, etag: string): boolean {
  if (header === undefined) return false
  return header.split(',').some((t) => t.trim().replace(/^W\//, '') === etag)
}
