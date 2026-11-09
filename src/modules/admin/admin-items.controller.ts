import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Header,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Put,
} from '@nestjs/common'
import { z } from 'zod'

import { ZodValidationPipe } from '../../common/zod-validation.pipe'
import { AssetNotFound } from '../assets/asset-refs'
import { ITEM_CATEGORIES } from '../items/items'
import {
  InvalidItemCategory,
  type ItemInput,
  ItemExists,
  ItemNameTaken,
  ItemRoleRemoved,
  ItemsRepository,
} from '../items/items.repository'
import { snakeKey } from './admin.dto'
import { ITEMS_HTML } from './views/items'

const itemBody = z.object({
  name: z.string().trim().min(1).max(100),
  category: z.string().min(1).nullable(),
  iconAssetId: z.string().uuid().nullable(),
  valuable: z.boolean(),
  worldBound: z.boolean(),
  level: z.number().int().min(1).max(300).nullable(),
  isDrop: z.boolean(),
  isEquipment: z.boolean(),
})
const itemCreateBody = itemBody.extend({ key: snakeKey.max(80) })

const ROLE_NAMES: Record<string, string> = { isDrop: '드롭 아이템', isEquipment: '강화 장비' }

/** 아이템 화면. 분류 트리 · 그림 격자 · 편집 서랍으로 아이템 표 하나를 고친다(앱 저장소 ADR-187 결정 6). */
@Controller('admin')
export class AdminItemsController {
  constructor(private readonly items: ItemsRepository) {}

  @Get('items')
  @Header('content-type', 'text/html; charset=utf-8')
  @Header('cache-control', 'no-store')
  page(): string {
    return ITEMS_HTML
  }

  @Get('items/rows')
  @Header('cache-control', 'no-store')
  async rows() {
    return { categories: ITEM_CATEGORIES, items: await this.items.adminRows() }
  }

  @Post('items')
  @HttpCode(201)
  async create(
    @Body(new ZodValidationPipe(itemCreateBody)) body: z.infer<typeof itemCreateBody>,
  ): Promise<void> {
    const { key, ...input } = body
    try {
      await this.items.create(key, input satisfies ItemInput)
    } catch (error) {
      throw httpError(error)
    }
  }

  @Put('items/:key')
  @HttpCode(204)
  async update(
    @Param('key', new ZodValidationPipe(snakeKey)) key: string,
    @Body(new ZodValidationPipe(itemBody)) body: ItemInput,
  ): Promise<void> {
    let found: boolean
    try {
      found = await this.items.update(key, body)
    } catch (error) {
      throw httpError(error)
    }
    if (!found) throw new NotFoundException(`모르는 아이템이다: ${key}`)
  }
}

/** 아이템 쓰기의 거절을 HTTP 로 옮긴다. 겹침은 409, 모양은 맞는데 없는 값은 400 이다. */
function httpError(error: unknown): unknown {
  if (error instanceof ItemExists)
    return new ConflictException(`이미 있는 아이템이다: ${error.message}`)
  if (error instanceof ItemNameTaken)
    return new ConflictException(`이름이 같은 아이템이 다른 key 로 있다: ${error.message}`)
  if (error instanceof ItemRoleRemoved)
    return new ConflictException(
      `붙은 역할은 뺄 수 없다: ${ROLE_NAMES[error.message] ?? error.message}`,
    )
  if (error instanceof InvalidItemCategory)
    return new BadRequestException(`분류 트리에 없는 묶음이다: ${error.message}`)
  if (error instanceof AssetNotFound)
    return new BadRequestException(`그림 표에 없는 그림이다: ${error.message}`)
  return error
}
