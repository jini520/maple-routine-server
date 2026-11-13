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
  Post,
  Put,
} from '@nestjs/common'
import { z } from 'zod'

import { ZodValidationPipe } from '../../common/zod-validation.pipe'
import { AssetNotFound } from '../assets/asset-refs'
import {
  ItemGroupExists,
  ItemGroupInUse,
  ItemGroupNameTaken,
  ItemGroupsRepository,
} from '../items/item-groups.repository'
import { ITEM_KIND_KEYS } from '../items/items'
import {
  InvalidItemCategory,
  type ItemInput,
  ItemExists,
  ItemNameTaken,
  ItemRoleRemoved,
  ItemsRepository,
} from '../items/items.repository'
import { moveBody, snakeKey } from './admin.dto'
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

const groupBody = z.object({ kind: z.enum(ITEM_KIND_KEYS), name: z.string().trim().min(1).max(50) })
const groupCreateBody = groupBody.extend({ key: snakeKey.max(80) })

const ROLE_NAMES: Record<string, string> = { isDrop: '드롭 아이템', isEquipment: '강화 장비' }

/** 아이템 화면. 분류 트리 · 그림 격자 · 편집 서랍으로 아이템 표 하나를 고치고, 트리에서 묶음을 고친다(앱 저장소 ADR-187 결정 2 · 6). */
@Controller('admin')
export class AdminItemsController {
  constructor(
    private readonly items: ItemsRepository,
    private readonly groups: ItemGroupsRepository,
  ) {}

  @Get('items')
  @Header('content-type', 'text/html; charset=utf-8')
  @Header('cache-control', 'no-store')
  page(): string {
    return ITEMS_HTML
  }

  @Get('items/rows')
  @Header('cache-control', 'no-store')
  async rows() {
    const [categories, rows] = await Promise.all([this.groups.tree(), this.items.adminRows()])
    return { categories, items: rows }
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

  @Post('item-groups')
  @HttpCode(201)
  async createGroup(
    @Body(new ZodValidationPipe(groupCreateBody)) body: z.infer<typeof groupCreateBody>,
  ): Promise<void> {
    try {
      await this.groups.create(body)
    } catch (error) {
      throw httpError(error)
    }
  }

  @Put('item-groups/:key')
  @HttpCode(204)
  async updateGroup(
    @Param('key', new ZodValidationPipe(snakeKey)) key: string,
    @Body(new ZodValidationPipe(groupBody)) body: z.infer<typeof groupBody>,
  ): Promise<void> {
    let found: boolean
    try {
      found = await this.groups.update(key, body)
    } catch (error) {
      throw httpError(error)
    }
    if (!found) throw new NotFoundException(`모르는 묶음이다: ${key}`)
  }

  @Post('item-groups/:key/move')
  @HttpCode(204)
  async moveGroup(
    @Param('key', new ZodValidationPipe(snakeKey)) key: string,
    @Body(new ZodValidationPipe(moveBody)) body: z.infer<typeof moveBody>,
  ): Promise<void> {
    if (!(await this.groups.move(key, body.direction)))
      throw new NotFoundException(`모르는 묶음이다: ${key}`)
  }

  @Delete('item-groups/:key')
  @HttpCode(204)
  async removeGroup(@Param('key', new ZodValidationPipe(snakeKey)) key: string): Promise<void> {
    let found: boolean
    try {
      found = await this.groups.remove(key)
    } catch (error) {
      throw httpError(error)
    }
    if (!found) throw new NotFoundException(`모르는 묶음이다: ${key}`)
  }
}

/** 아이템 · 묶음 쓰기의 거절을 HTTP 로 옮긴다. 겹침 · 쓰는 중은 409, 모양은 맞는데 없는 값은 400 이다. */
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
  if (error instanceof ItemGroupExists)
    return new ConflictException(`이미 있는 묶음이다: ${error.message}`)
  if (error instanceof ItemGroupNameTaken)
    return new ConflictException(`같은 종류에 이름이 같은 묶음이 있다: ${error.message}`)
  if (error instanceof ItemGroupInUse)
    return new ConflictException(`아이템이 든 묶음은 못 지운다: ${error.message}`)
  if (error instanceof AssetNotFound)
    return new BadRequestException(`그림 표에 없는 그림이다: ${error.message}`)
  return error
}
