import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  NotFoundException,
  Param,
  Put,
} from '@nestjs/common'
import { z } from 'zod'

import { ZodValidationPipe } from '../../common/zod-validation.pipe'
import { AppImagesRepository } from '../app-images/app-images.repository'
import { AssetNotFound } from '../assets/asset-refs'
import { snakeKey } from './admin.dto'
import { APP_IMAGES_HTML } from './views/app-images'

const assetBody = z.object({ assetId: z.string().uuid() })

/** 앱 그림 화면. 앱이 key 로 찾는 그림을 바꾼다. key 는 앱 코드가 들어 더하거나 지우지 않는다(앱 저장소 ADR-187 결정 6). */
@Controller('admin')
export class AdminAppImagesController {
  constructor(private readonly images: AppImagesRepository) {}

  @Get('app-images')
  @Header('content-type', 'text/html; charset=utf-8')
  @Header('cache-control', 'no-store')
  page(): string {
    return APP_IMAGES_HTML
  }

  @Get('app-images/rows')
  @Header('cache-control', 'no-store')
  rows() {
    return this.images.section()
  }

  @Put('app-images/:key')
  @HttpCode(204)
  async set(
    @Param('key', new ZodValidationPipe(snakeKey)) key: string,
    @Body(new ZodValidationPipe(assetBody)) body: z.infer<typeof assetBody>,
  ): Promise<void> {
    let found: boolean
    try {
      found = await this.images.set(key, body.assetId)
    } catch (error) {
      if (error instanceof AssetNotFound)
        throw new BadRequestException(`그림 표에 없는 그림이다: ${error.message}`)
      throw error
    }
    if (!found) throw new NotFoundException(`모르는 앱 그림 key 다: ${key}`)
  }
}
