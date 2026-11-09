import { createHash } from 'node:crypto'

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
  Put,
  Query,
} from '@nestjs/common'
import { z } from 'zod'

import { ZodValidationPipe } from '../../common/zod-validation.pipe'
import { imageSize, parseAssetPath, sniffImage, storedFileName } from '../assets/asset-paths'
import { AssetNotFound } from '../assets/asset-refs'
import { AssetStore } from '../assets/asset-store'
import { AssetInUse, AssetsRepository } from '../assets/assets.repository'
import {
  IMAGE_CROP_KINDS,
  type ImageCrop,
  type ImageCropKind,
  ImageCropsRepository,
} from '../assets/image-crops.repository'
import { ITEM_CATEGORIES } from '../items/items'
import { ASSETS_HTML } from './views/assets'

/** 앱의 크롭 계산(`lib/image-crop.ts`)이 읽는 두 문법. 다른 값은 앱이 기본 크롭으로 떨어뜨리므로 쓰기 때 막는다. */
const cropBody = z.object({
  size: z.string().regex(/^\d+(\.\d+)?% auto$/),
  position: z.string().regex(/^-?\d+(\.\d+)?% -?\d+(\.\d+)?%$/),
})
const cropKindParam = z.enum(IMAGE_CROP_KINDS)
const cropSlugParam = z.string().min(1).max(100)
const assetIdParam = z.string().uuid()
/** 빈 이름은 비우기다. 비면 화면이 쓰는 곳의 이름을 보인다. */
const nameBody = z.object({
  name: z
    .string()
    .trim()
    .max(100)
    .nullable()
    .transform((v) => (v === '' ? null : v)),
})

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

  /** 그림 화면 목록. 그림마다 보이는 이름 · 쓰는 곳을 들고, 트리를 그릴 아이템 분류와 크롭을 함께 낸다. */
  @Get('assets/list')
  @Header('cache-control', 'no-store')
  async list() {
    const [section, rows, crops] = await Promise.all([
      this.assets.section(),
      this.assets.adminRows(),
      this.crops.section(),
    ])
    return { updatedAt: section.updatedAt, categories: ITEM_CATEGORIES, rows, crops: crops.crops }
  }

  @Put('assets/:id/name')
  @HttpCode(204)
  async rename(
    @Param('id', new ZodValidationPipe(assetIdParam)) id: string,
    @Body(new ZodValidationPipe(nameBody)) body: z.infer<typeof nameBody>,
  ): Promise<void> {
    if (!(await this.assets.rename(id, body.name)))
      throw new NotFoundException(`모르는 그림이다: ${id}`)
  }

  /** 쓰는 곳이 없는 그림만 지운다. 크롭도 함께 지운다. 쓰는 곳이 있으면 409 로 그 목록을 알린다. */
  @Delete('assets/:id')
  @HttpCode(204)
  async remove(@Param('id', new ZodValidationPipe(assetIdParam)) id: string): Promise<void> {
    let found: boolean
    try {
      found = await this.assets.remove(id)
    } catch (error) {
      if (error instanceof AssetInUse)
        throw new ConflictException(
          `쓰는 곳이 있어 못 지운다: ${error.uses.map((u) => `${u.kind} ${u.name}`).join(', ')}`,
        )
      throw error
    }
    if (!found) throw new NotFoundException(`모르는 그림이다: ${id}`)
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
    try {
      await this.crops.put(kind, slug.normalize('NFC'), body)
    } catch (error) {
      if (error instanceof AssetNotFound)
        throw new BadRequestException(`그림 표에 없는 그림이다: ${error.message}`)
      throw error
    }
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
