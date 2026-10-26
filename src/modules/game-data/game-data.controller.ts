import { createHash } from 'node:crypto'

import { Controller, Get, Req, Res } from '@nestjs/common'
import type { FastifyReply, FastifyRequest } from 'fastify'

import { GameDataService } from './game-data.service'

/**
 * 게임 데이터 표 전부. 공개 조회다. 앱은 켤 때와 백그라운드에서 돌아올 때 받아 칸마다 updatedAt 이 다르면 그 표만 덮는다.
 *
 * 몸의 해시를 ETag 로 단다. 앱이 돌아올 때마다 묻기 때문에, 바뀐 것이 없으면 몸 없이 304 로 끝낸다.
 */
@Controller()
export class GameDataController {
  constructor(private readonly gameData: GameDataService) {}

  @Get('v1/game-data')
  async snapshot(@Req() req: FastifyRequest, @Res() reply: FastifyReply): Promise<void> {
    const body = JSON.stringify(await this.gameData.snapshot())
    const etag = `"${createHash('sha1').update(body).digest('hex')}"`
    // 캐시해도 되지만 쓰기 전에 매번 묻는다. 관리 화면에서 고친 값이 바로 닿아야 한다.
    void reply.header('etag', etag).header('cache-control', 'no-cache')
    if (matches(req.headers['if-none-match'], etag)) {
      await reply.code(304).send()
      return
    }
    await reply.type('application/json; charset=utf-8').send(body)
  }
}

/** nginx 가 gzip 으로 줄이면 ETag 앞에 `W/` 를 붙인다. 앱은 그 값을 되돌려 보내므로 약한 비교로 본다. */
function matches(header: string | undefined, etag: string): boolean {
  if (header === undefined) return false
  return header.split(',').some((t) => t.trim().replace(/^W\//, '') === etag)
}
