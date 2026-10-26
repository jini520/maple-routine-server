import { createHash } from 'node:crypto'

import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  NotFoundException,
  Param,
  Put,
  Query,
} from '@nestjs/common'
import { z } from 'zod'

import { ZodValidationPipe } from '../../common/zod-validation.pipe'
import { imageSize, parseAssetPath, sniffImage, storedFileName } from '../assets/asset-paths'
import { AssetStore } from '../assets/asset-store'
import { AssetsRepository } from '../assets/assets.repository'
import {
  IMAGE_CROP_KINDS,
  type ImageCrop,
  type ImageCropKind,
  ImageCropsRepository,
} from '../assets/image-crops.repository'
import { ASSETS_HTML } from './views/assets'

/** 앱의 크롭 계산(`lib/image-crop.ts`)이 읽는 두 문법. 다른 값은 앱이 기본 크롭으로 떨어뜨리므로 쓰기 때 막는다. */
const cropBody = z.object({
  size: z.string().regex(/^\d+(\.\d+)?% auto$/),
  position: z.string().regex(/^-?\d+(\.\d+)?% -?\d+(\.\d+)?%$/),
})
const cropKindParam = z.enum(IMAGE_CROP_KINDS)
const cropSlugParam = z.string().min(1).max(100)

/** 그림 · 크롭 화면. 앱이 받는 그림을 올리고 바꾸며, 보스 초상과 지역 지도의 크롭을 숫자로 고친다. */
@Controller('admin')
export class AdminAssetsController {
  constructor(
    private readonly assets: AssetsRepository,
    private readonly crops: ImageCropsRepository,
    private readonly store: AssetStore,
  ) {}

  @Get('assets')
  @Header('content-type', 'text/html; charset=utf-8')
  @Header('cache-control', 'no-store')
  page(): string {
    return ASSETS_HTML
  }

  @Get('assets/rows')
  @Header('cache-control', 'no-store')
  async rows() {
    const [assets, crops] = await Promise.all([this.assets.section(), this.crops.section()])
    return { assets, crops }
  }

  /**
   * 경로 하나에 그림을 올린다. 본문은 파일 그대로다. 파일을 먼저 쓰고 그다음 표에 적는다.
   * 순서가 반대면 앱이 표의 해시를 받고 아직 없는 파일을 부를 수 있다.
   */
  @Put('assets/file')
  async putFile(@Query('path') rawPath: string | undefined, @Body() body: unknown) {
    const parsed = rawPath === undefined ? null : parseAssetPath(rawPath)
    if (parsed === null) throw new BadRequestException(`그림 경로 규칙에 맞지 않는다: ${rawPath}`)
    if (!Buffer.isBuffer(body)) throw new BadRequestException('그림 파일을 본문으로 보낸다')
    const sniffed = sniffImage(body)
    if (sniffed !== parsed.ext)
      throw new BadRequestException(
        `내용이 ${sniffed ?? '그림이 아니다'}인데 경로는 .${parsed.ext} 다`,
      )
    const dims = imageSize(body)
    if (dims === null) throw new BadRequestException('그림 머리에서 가로 · 세로를 읽지 못했다')
    const path = `${parsed.dir}/${parsed.name}.${parsed.ext}`
    const sha256 = createHash('sha256').update(body).digest('hex')
    await this.store.write(storedFileName(sha256, parsed.ext), body)
    const result = await this.assets.put(path, sha256, { size: body.length, ...dims })
    return { path, sha256, result }
  }

  @Put('image-crops/:kind/:slug')
  @HttpCode(204)
  async putCrop(
    @Param('kind', new ZodValidationPipe(cropKindParam)) kind: ImageCropKind,
    @Param('slug', new ZodValidationPipe(cropSlugParam)) slug: string,
    @Body(new ZodValidationPipe(cropBody)) body: ImageCrop,
  ): Promise<void> {
    await this.crops.put(kind, slug.normalize('NFC'), body)
  }

  /** 줄을 지우면 앱은 그 그림을 기본 크롭(cover · 가운데)으로 그린다. 없으면 404 다. */
  @Delete('image-crops/:kind/:slug')
  @HttpCode(204)
  async removeCrop(
    @Param('kind', new ZodValidationPipe(cropKindParam)) kind: ImageCropKind,
    @Param('slug', new ZodValidationPipe(cropSlugParam)) slug: string,
  ): Promise<void> {
    if (!(await this.crops.remove(kind, slug.normalize('NFC'))))
      throw new NotFoundException(`크롭이 없다: ${kind}/${slug}`)
  }
}
