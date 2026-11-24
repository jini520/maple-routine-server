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
import { imageSize, parseAssetKey, sniffImage, storedFileName } from '../assets/asset-paths'
import { AssetNotFound } from '../assets/asset-refs'
import { AssetStore } from '../assets/asset-store'
import { AssetInUse, AssetsRepository } from '../assets/assets.repository'
import {
  IMAGE_CROP_TYPES,
  type ImageCrop,
  type ImageCropType,
  ImageCropsRepository,
} from '../assets/image-crops.repository'
import { ItemGroupsRepository } from '../items/item-groups.repository'
import { ASSET_CROPS_HTML, ASSETS_HTML } from './views/assets'

/** 폭과 위치. 놓이는 자리에 대한 % 다. 위치는 그림을 밀어 보이는 곳을 고르므로 음수도 된다. */
const cropBody = z.object({
  widthPercent: z.number().positive().max(1000),
  positionXPercent: z.number().min(-1000).max(1000),
  positionYPercent: z.number().min(-1000).max(1000),
})
const cropTypeParam = z.enum(IMAGE_CROP_TYPES)
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
@Controller()
export class AdminAssetsController {
  constructor(
    private readonly assets: AssetsRepository,
    private readonly crops: ImageCropsRepository,
    private readonly store: AssetStore,
    private readonly groups: ItemGroupsRepository,
  ) {}

  @Get('images')
  @Header('content-type', 'text/html; charset=utf-8')
  @Header('cache-control', 'no-store')
  page(): string {
    return ASSETS_HTML
  }

  @Get('images/crops')
  @Header('content-type', 'text/html; charset=utf-8')
  @Header('cache-control', 'no-store')
  cropsPage(): string {
    return ASSET_CROPS_HTML
  }

  /** 그림 화면 목록. 그림마다 보이는 이름 · 쓰는 곳을 들고, 트리를 그릴 아이템 분류와 크롭을 함께 낸다. */
  @Get('images/list')
  @Header('cache-control', 'no-store')
  async list() {
    const [section, rows, crops, categories] = await Promise.all([
      this.assets.section(),
      this.assets.adminRows(),
      this.crops.section(),
      this.groups.tree(),
    ])
    return { updatedAt: section.updatedAt, categories, rows, crops: crops.imageCrops }
  }

  @Put('images/:id/name')
  @HttpCode(204)
  async rename(
    @Param('id', new ZodValidationPipe(assetIdParam)) id: string,
    @Body(new ZodValidationPipe(nameBody)) body: z.infer<typeof nameBody>,
  ): Promise<void> {
    if (!(await this.assets.rename(id, body.name)))
      throw new NotFoundException(`모르는 그림이다: ${id}`)
  }

  /** 쓰는 곳이 없는 그림만 지운다. 크롭도 함께 지운다. 쓰는 곳이 있으면 409 로 그 목록을 알린다. */
  @Delete('images/:id')
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
   * 분류 · 파일 이름 · 확장자 하나에 그림을 올린다. 본문은 파일 그대로다. 파일을 먼저 쓰고 그다음 표에 적는다.
   * 순서가 반대면 앱이 표의 해시를 받고 아직 없는 파일을 부를 수 있다.
   */
  @Put('images/file')
  async putFile(
    @Query('category') category: string | undefined,
    @Query('fileName') fileName: string | undefined,
    @Query('extension') extension: string | undefined,
    @Body() body: unknown,
  ) {
    const key =
      category === undefined || fileName === undefined || extension === undefined
        ? null
        : parseAssetKey({ category, fileName, extension })
    if (key === null)
      throw new BadRequestException(`그림 규칙에 맞지 않는다: ${category}/${fileName}.${extension}`)
    if (!Buffer.isBuffer(body)) throw new BadRequestException('그림 파일을 본문으로 보낸다')
    const sniffed = sniffImage(body)
    if (sniffed !== key.extension)
      throw new BadRequestException(
        `내용이 ${sniffed ?? '그림이 아니다'}인데 확장자는 .${key.extension} 다`,
      )
    const dims = imageSize(body)
    if (dims === null) throw new BadRequestException('그림 머리에서 가로 · 세로를 읽지 못했다')
    const sha256 = createHash('sha256').update(body).digest('hex')
    await this.store.write(storedFileName(sha256, key.extension), body)
    const result = await this.assets.put(key, sha256, { sizeBytes: body.length, ...dims })
    return { ...key, sha256, result }
  }

  @Put('image-crops/:type/:assetId')
  @HttpCode(204)
  async putCrop(
    @Param('type', new ZodValidationPipe(cropTypeParam)) type: ImageCropType,
    @Param('assetId', new ZodValidationPipe(assetIdParam)) assetId: string,
    @Body(new ZodValidationPipe(cropBody)) body: ImageCrop,
  ): Promise<void> {
    try {
      await this.crops.put(type, assetId, body)
    } catch (error) {
      if (error instanceof AssetNotFound)
        throw new BadRequestException(`그림 표에 없는 그림이다: ${error.message}`)
      throw error
    }
  }

  /** 줄을 지우면 앱은 그 그림을 기본 크롭(cover · 가운데)으로 그린다. 없으면 404 다. */
  @Delete('image-crops/:type/:assetId')
  @HttpCode(204)
  async removeCrop(
    @Param('type', new ZodValidationPipe(cropTypeParam)) type: ImageCropType,
    @Param('assetId', new ZodValidationPipe(assetIdParam)) assetId: string,
  ): Promise<void> {
    if (!(await this.crops.remove(type, assetId)))
      throw new NotFoundException(`크롭이 없다: ${type}/${assetId}`)
  }
}
