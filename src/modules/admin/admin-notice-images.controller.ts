import { createHash } from 'node:crypto'

import { BadRequestException, Body, Controller, Put } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

import type { Env } from '../../config/env.schema'
import { sniffImage, storedFileName } from '../assets/asset-paths'
import { AssetStore } from '../assets/asset-store'

/**
 * 공지 본문에 넣을 그림 올리기. 파일은 게임 데이터 그림과 같은 디스크에 내용 해시 이름으로 쓰고, 그림 표에는 적지 않는다.
 *
 * 그림 표에 넣으면 공지 본문이 가리키는 그림이 쓰는 곳으로 잡히지 않아 그림 화면에서 지울 수 있게 된다.
 */
@Controller('admin')
export class AdminNoticeImagesController {
  constructor(
    private readonly store: AssetStore,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /** 본문은 파일 그대로다. 관리 화면이 올리기 전에 줄이므로 상한은 그림 경로의 1MB 그대로다. */
  @Put('notices/images')
  async put(@Body() body: unknown): Promise<{ url: string }> {
    if (!Buffer.isBuffer(body)) throw new BadRequestException('그림 파일을 본문으로 보낸다')
    const ext = sniffImage(body)
    if (ext === null) throw new BadRequestException('그림이 아니다')
    const fileName = storedFileName(createHash('sha256').update(body).digest('hex'), ext)
    await this.store.write(fileName, body)
    return { url: `${this.config.get('PUBLIC_BASE_URL', { infer: true })}/assets/${fileName}` }
  }
}
