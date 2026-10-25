import { Inject, Injectable } from '@nestjs/common'
import { and, asc, eq, inArray, ne, sql } from 'drizzle-orm'

import { isUniqueViolation } from '../../common/pg-errors'
import { DB, type Db } from '../../database/database.module'
import {
  cashbookCategories,
  gameRules,
  spendForms,
  spendGroups,
  spendItemForms,
  spendItemOptions,
  spendItems,
  spendTiles,
} from '../../database/schema'
import { type DbOrTx, sectionUpdatedAt, touchSection } from '../game-data/sections'

export const SPEND_CURRENCIES = ['point', 'meso'] as const
export type SpendCurrency = (typeof SPEND_CURRENCIES)[number]
/** 앱 코드가 이 값으로 갈린다. 이름은 spend_forms 표가 든다. */
export const SPEND_FORMS = ['exp', 'sol_erda'] as const
export type SpendForm = (typeof SPEND_FORMS)[number]

/** game_rules 의 key 와 응답 필드 이름. 둘이 짝이다. */
export const SPEND_RULE_KEYS = {
  tariffPercent: 'spend_tariff_percent',
  rewardCoinPriceMeso: 'reward_coin_price_meso',
} as const
export type SpendRuleField = keyof typeof SPEND_RULE_KEYS

/** category 는 지출 갈래의 key 다. 옛 앱(1.0.12)도 이 칸을 key 글자로 읽는다. */
export interface SpendGroupView {
  key: string
  name: string
  category: string
  cardTitle: string
  active: boolean
}

export interface SpendTileView {
  key: string
  name: string
  iconFile: string | null
  iconMap: string | null
}

export interface SpendItemView {
  key: string
  group: string
  tile: string
  name: string
  shortName: string | null
  tier: string | null
  currency: SpendCurrency
  unitPrice: number | null
  unit: string
  maxQuantity: number | null
  rewardCoins: number | null
  from: string | null
  until: string | null
}

export interface SpendItemOptionView {
  item: string
  axis: string
  value: string
}

export interface SpendItemFormView {
  item: string
  form: SpendForm
}

export interface SpendFormView {
  key: SpendForm
  name: string
}

/** GET /v1/game-data 의 spendCatalog 칸. 줄 표 그대로 납작하다. 묶는 것은 앱이다. */
export interface SpendCatalogSection {
  updatedAt: string | null
  rules: Record<SpendRuleField, number | null>
  groups: SpendGroupView[]
  tiles: SpendTileView[]
  items: SpendItemView[]
  itemOptions: SpendItemOptionView[]
  itemForms: SpendItemFormView[]
  forms: SpendFormView[]
}

export type SpendRulesInput = Record<SpendRuleField, number>
export type SpendGroupInput = SpendGroupView
export type SpendTileInput = SpendTileView
/** 항목 하나. 축 값과 형태를 함께 받아 통째로 갈아 끼운다. */
export interface SpendItemInput extends SpendItemView {
  options: { axis: string; value: string }[]
  forms: SpendForm[]
}

export class SpendGroupExists extends Error {}
export class SpendTileExists extends Error {}
export class SpendItemExists extends Error {}
export class NoSpendGroup extends Error {}
/** 모르는 갈래이거나 수입 갈래다. 묶음은 지출 갈래만 가리킨다. */
export class NoSpendCategory extends Error {}
export class NoSpendTile extends Error {}
/** 항목의 모양이 앱의 시트가 가를 수 없는 모양이다. message 가 이유다. */
export class SpendItemShape extends Error {}

interface ShapeCandidate {
  id: string | null
  groupId: string
  tileId: string
  tier: string | null
  rewardCoins: number | null
  options: { axis: string; value: string }[]
  forms: SpendForm[]
}

const axisSignature = (options: { axis: string }[]): string =>
  options
    .map((o) => o.axis)
    .sort()
    .join('|')
const valueCombo = (options: { axis: string; value: string }[]): string =>
  options
    .slice()
    .sort((a, b) => a.axis.localeCompare(b.axis))
    .map((o) => `${o.axis}=${o.value}`)
    .join('|')

/** 묶음 · 타일 · 항목은 더하고 고치고 옮기기만 있다. 기록이 key 를 들어 지우지 않는다. 항목은 until 로 닫는다. */
@Injectable()
export class SpendCatalogRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  async section(): Promise<SpendCatalogSection> {
    const [groups, tiles, items, options, itemForms, forms, rules, updatedAt] = await Promise.all([
      this.db
        .select({
          key: spendGroups.key,
          name: spendGroups.name,
          category: cashbookCategories.key,
          cardTitle: spendGroups.cardTitle,
          active: spendGroups.active,
        })
        .from(spendGroups)
        .innerJoin(cashbookCategories, eq(spendGroups.categoryId, cashbookCategories.id))
        .orderBy(asc(spendGroups.sortOrder), asc(spendGroups.key)),
      this.db.select().from(spendTiles).orderBy(asc(spendTiles.key)),
      this.itemRows(this.db),
      this.db
        .select({
          item: spendItems.key,
          axis: spendItemOptions.axis,
          value: spendItemOptions.value,
        })
        .from(spendItemOptions)
        .innerJoin(spendItems, eq(spendItemOptions.itemId, spendItems.id))
        .orderBy(asc(spendItems.key), asc(spendItemOptions.axis)),
      this.db
        .select({ item: spendItems.key, form: spendForms.key })
        .from(spendItemForms)
        .innerJoin(spendItems, eq(spendItemForms.itemId, spendItems.id))
        .innerJoin(spendForms, eq(spendItemForms.formId, spendForms.id))
        .orderBy(asc(spendItems.key), asc(spendForms.sortOrder)),
      this.db
        .select({ key: spendForms.key, name: spendForms.name })
        .from(spendForms)
        .orderBy(asc(spendForms.sortOrder)),
      this.db
        .select()
        .from(gameRules)
        .where(inArray(gameRules.key, Object.values(SPEND_RULE_KEYS))),
      sectionUpdatedAt(this.db, 'spendCatalog'),
    ])
    const ruleOf = (field: SpendRuleField): number | null =>
      rules.find((r) => r.key === SPEND_RULE_KEYS[field])?.value ?? null
    return {
      updatedAt,
      rules: {
        tariffPercent: ruleOf('tariffPercent'),
        rewardCoinPriceMeso: ruleOf('rewardCoinPriceMeso'),
      },
      groups,
      tiles: tiles.map((t) => ({
        key: t.key,
        name: t.name,
        iconFile: t.iconFile,
        iconMap: t.iconMap,
      })),
      items,
      itemOptions: options,
      itemForms,
      forms,
    }
  }

  /** 규칙 둘을 적는다. 둘 다 받아 둘 다 쓴다. 보스 표의 규칙과 같은 표이고 key 가 다르다. */
  async setRules(rules: SpendRulesInput): Promise<void> {
    await this.db.transaction(async (tx) => {
      const now = new Date()
      for (const field of Object.keys(SPEND_RULE_KEYS) as SpendRuleField[]) {
        await tx
          .insert(gameRules)
          .values({ key: SPEND_RULE_KEYS[field], value: rules[field], updatedAt: now })
          .onConflictDoUpdate({
            target: gameRules.key,
            set: { value: rules[field], updatedAt: now },
          })
      }
      await touchSection(tx, 'spendCatalog')
    })
  }

  /** 묶음을 맨 뒤에 더한다. 같은 key 는 SpendGroupExists, 지출 갈래가 아니면 NoSpendCategory 다. */
  async createGroup(input: SpendGroupInput): Promise<{ id: string }> {
    return this.db.transaction(async (tx) => {
      const categoryId = await this.categoryId(tx, input.category)
      if (categoryId === null) throw new NoSpendCategory(input.category)
      const [last] = await tx
        .select({ max: sql<number | null>`max(${spendGroups.sortOrder})` })
        .from(spendGroups)
      let row: { id: string } | undefined
      try {
        ;[row] = await tx
          .insert(spendGroups)
          .values({
            key: input.key,
            name: input.name,
            categoryId,
            cardTitle: input.cardTitle,
            active: input.active,
            sortOrder: (last?.max ?? -1) + 1,
          })
          .returning({ id: spendGroups.id })
      } catch (error) {
        if (isUniqueViolation(error)) throw new SpendGroupExists(input.key)
        throw error
      }
      if (row === undefined) throw new Error('insert 가 행을 안 돌려줬다')
      await touchSection(tx, 'spendCatalog')
      return row
    })
  }

  /** 이름 · 갈래 · 카드 제목 · 열림을 갈아 끼운다. key 는 기록이 들어 못 바꾼다. 모르면 false 다. */
  async updateGroup(key: string, input: Omit<SpendGroupInput, 'key'>): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const categoryId = await this.categoryId(tx, input.category)
      if (categoryId === null) throw new NoSpendCategory(input.category)
      const rows = await tx
        .update(spendGroups)
        .set({
          name: input.name,
          categoryId,
          cardTitle: input.cardTitle,
          active: input.active,
        })
        .where(eq(spendGroups.key, key))
        .returning({ id: spendGroups.id })
      if (rows.length === 0) return false
      await touchSection(tx, 'spendCatalog')
      return true
    })
  }

  /** 씨앗이 쓴다. 형태는 앱 코드가 key 로 갈려 관리 화면에는 더하기가 없다. */
  async createForm(input: SpendFormView): Promise<{ id: string }> {
    return this.db.transaction(async (tx) => {
      const [last] = await tx
        .select({ max: sql<number | null>`max(${spendForms.sortOrder})` })
        .from(spendForms)
      const [row] = await tx
        .insert(spendForms)
        .values({ ...input, sortOrder: (last?.max ?? -1) + 1 })
        .returning({ id: spendForms.id })
      if (row === undefined) throw new Error('insert 가 행을 안 돌려줬다')
      await touchSection(tx, 'spendCatalog')
      return row
    })
  }

  /** 형태의 이름을 바꾼다. 카드에도 이 이름이 선다. 모르면 false 다. */
  async updateForm(key: SpendForm, name: string): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const rows = await tx
        .update(spendForms)
        .set({ name })
        .where(eq(spendForms.key, key))
        .returning({ id: spendForms.id })
      if (rows.length === 0) return false
      await touchSection(tx, 'spendCatalog')
      return true
    })
  }

  /** 묶음의 차례를 한 칸 옮긴다. 끝이면 그대로 true 다. 모르면 false 다. */
  async moveGroup(key: string, direction: 'up' | 'down'): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const rows = await tx
        .select({ id: spendGroups.id, key: spendGroups.key, sortOrder: spendGroups.sortOrder })
        .from(spendGroups)
        .orderBy(asc(spendGroups.sortOrder), asc(spendGroups.key))
      return this.swap(tx, spendGroups, rows, key, direction)
    })
  }

  /** 타일을 더한다. 같은 key 는 SpendTileExists 다. */
  async createTile(input: SpendTileInput): Promise<{ id: string }> {
    return this.db.transaction(async (tx) => {
      let row: { id: string } | undefined
      try {
        ;[row] = await tx.insert(spendTiles).values(input).returning({ id: spendTiles.id })
      } catch (error) {
        if (isUniqueViolation(error)) throw new SpendTileExists(input.key)
        throw error
      }
      if (row === undefined) throw new Error('insert 가 행을 안 돌려줬다')
      await touchSection(tx, 'spendCatalog')
      return row
    })
  }

  /** 이름 · 그림을 갈아 끼운다. 모르면 false 다. */
  async updateTile(key: string, input: Omit<SpendTileInput, 'key'>): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const rows = await tx
        .update(spendTiles)
        .set({ name: input.name, iconFile: input.iconFile, iconMap: input.iconMap })
        .where(eq(spendTiles.key, key))
        .returning({ id: spendTiles.id })
      if (rows.length === 0) return false
      await touchSection(tx, 'spendCatalog')
      return true
    })
  }

  /**
   * 항목을 묶음 맨 뒤에 더한다. 모르는 묶음 · 타일은 NoSpendGroup · NoSpendTile, 같은 key 는 SpendItemExists,
   * 시트가 가를 수 없는 모양은 SpendItemShape 다.
   */
  async createItem(input: SpendItemInput): Promise<{ id: string }> {
    return this.db.transaction(async (tx) => {
      const groupId = await this.groupId(tx, input.group)
      if (groupId === null) throw new NoSpendGroup(input.group)
      const tileId = await this.tileId(tx, input.tile)
      if (tileId === null) throw new NoSpendTile(input.tile)
      await this.checkShape(tx, { ...input, id: null, groupId, tileId })
      const [last] = await tx
        .select({ max: sql<number | null>`max(${spendItems.sortOrder})` })
        .from(spendItems)
        .where(eq(spendItems.groupId, groupId))
      let row: { id: string } | undefined
      try {
        ;[row] = await tx
          .insert(spendItems)
          .values({
            key: input.key,
            groupId,
            tileId,
            name: input.name,
            shortName: input.shortName,
            tier: input.tier,
            currency: input.currency,
            unitPrice: input.unitPrice,
            unit: input.unit,
            maxQuantity: input.maxQuantity,
            rewardCoins: input.rewardCoins,
            from: input.from,
            until: input.until,
            sortOrder: (last?.max ?? -1) + 1,
          })
          .returning({ id: spendItems.id })
      } catch (error) {
        if (isUniqueViolation(error)) throw new SpendItemExists(input.key)
        throw error
      }
      if (row === undefined) throw new Error('insert 가 행을 안 돌려줬다')
      await this.writeAxes(tx, row.id, input.options, input.forms)
      await touchSection(tx, 'spendCatalog')
      return row
    })
  }

  /** 항목을 갈아 끼운다. key 와 묶음은 못 바꾼다. 축 값과 형태는 통째로 바뀐다. 모르면 false 다. */
  async updateItem(key: string, input: Omit<SpendItemInput, 'key' | 'group'>): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const [item] = await tx
        .select({ id: spendItems.id, groupId: spendItems.groupId })
        .from(spendItems)
        .where(eq(spendItems.key, key))
      if (item === undefined) return false
      const tileId = await this.tileId(tx, input.tile)
      if (tileId === null) throw new NoSpendTile(input.tile)
      await this.checkShape(tx, { ...input, id: item.id, groupId: item.groupId, tileId })
      await tx
        .update(spendItems)
        .set({
          tileId,
          name: input.name,
          shortName: input.shortName,
          tier: input.tier,
          currency: input.currency,
          unitPrice: input.unitPrice,
          unit: input.unit,
          maxQuantity: input.maxQuantity,
          rewardCoins: input.rewardCoins,
          from: input.from,
          until: input.until,
        })
        .where(eq(spendItems.id, item.id))
      await tx.delete(spendItemOptions).where(eq(spendItemOptions.itemId, item.id))
      await tx.delete(spendItemForms).where(eq(spendItemForms.itemId, item.id))
      await this.writeAxes(tx, item.id, input.options, input.forms)
      await touchSection(tx, 'spendCatalog')
      return true
    })
  }

  /** 항목의 차례를 묶음 안에서 한 칸 옮긴다. 끝이면 그대로 true 다. 모르면 false 다. */
  async moveItem(key: string, direction: 'up' | 'down'): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const [item] = await tx
        .select({ groupId: spendItems.groupId })
        .from(spendItems)
        .where(eq(spendItems.key, key))
      if (item === undefined) return false
      const rows = await tx
        .select({ id: spendItems.id, key: spendItems.key, sortOrder: spendItems.sortOrder })
        .from(spendItems)
        .where(eq(spendItems.groupId, item.groupId))
        .orderBy(asc(spendItems.sortOrder), asc(spendItems.key))
      return this.swap(tx, spendItems, rows, key, direction)
    })
  }

  private async itemRows(db: DbOrTx): Promise<SpendItemView[]> {
    const rows = await db
      .select({
        key: spendItems.key,
        group: spendGroups.key,
        tile: spendTiles.key,
        name: spendItems.name,
        shortName: spendItems.shortName,
        tier: spendItems.tier,
        currency: spendItems.currency,
        unitPrice: spendItems.unitPrice,
        unit: spendItems.unit,
        maxQuantity: spendItems.maxQuantity,
        rewardCoins: spendItems.rewardCoins,
        from: spendItems.from,
        until: spendItems.until,
      })
      .from(spendItems)
      .innerJoin(spendGroups, eq(spendItems.groupId, spendGroups.id))
      .innerJoin(spendTiles, eq(spendItems.tileId, spendTiles.id))
      .orderBy(
        asc(spendGroups.sortOrder),
        asc(spendGroups.key),
        asc(spendItems.sortOrder),
        asc(spendItems.key),
      )
    return rows
  }

  /** 지출 갈래만 찾는다. 수입 갈래의 key 는 null 이다. */
  private async categoryId(db: DbOrTx, key: string): Promise<string | null> {
    const [row] = await db
      .select({ id: cashbookCategories.id })
      .from(cashbookCategories)
      .where(and(eq(cashbookCategories.entryType, 'spend'), eq(cashbookCategories.key, key)))
    return row?.id ?? null
  }

  private async groupId(db: DbOrTx, key: string): Promise<string | null> {
    const [row] = await db
      .select({ id: spendGroups.id })
      .from(spendGroups)
      .where(eq(spendGroups.key, key))
    return row?.id ?? null
  }

  private async tileId(db: DbOrTx, key: string): Promise<string | null> {
    const [row] = await db
      .select({ id: spendTiles.id })
      .from(spendTiles)
      .where(eq(spendTiles.key, key))
    return row?.id ?? null
  }

  private async writeAxes(
    db: DbOrTx,
    itemId: string,
    options: { axis: string; value: string }[],
    forms: SpendForm[],
  ): Promise<void> {
    if (options.length > 0)
      await db.insert(spendItemOptions).values(options.map((o) => ({ itemId, ...o })))
    if (forms.length === 0) return
    const rows = await db
      .select({ id: spendForms.id, key: spendForms.key })
      .from(spendForms)
      .where(inArray(spendForms.key, forms))
    await db.insert(spendItemForms).values(
      forms.map((form) => {
        const formId = rows.find((r) => r.key === form)?.id
        if (formId === undefined) throw new SpendItemShape(`모르는 형태다: ${form}`)
        return { itemId, formId }
      }),
    )
  }

  /**
   * 앱의 시트가 가를 수 있는 모양인지 본다. 단계와 축 값은 하나만, 주화는 형태를 든 항목만, 같은 타일의 항목은 한
   * 묶음에 들고 전부 단계를 들거나 전부 축 값을 들며, 축 값은 축 이름이 같고 조합이 겹치지 않는다.
   */
  private async checkShape(db: DbOrTx, c: ShapeCandidate): Promise<void> {
    if (c.tier !== null && c.options.length > 0)
      throw new SpendItemShape('단계와 축 값을 함께 못 든다')
    if (c.rewardCoins !== null && c.forms.length === 0)
      throw new SpendItemShape('주화는 형태를 든 항목만 든다')
    if (new Set(c.options.map((o) => o.axis)).size !== c.options.length)
      throw new SpendItemShape('축 이름이 겹친다')

    const siblings = await db
      .select({ id: spendItems.id, groupId: spendItems.groupId, tier: spendItems.tier })
      .from(spendItems)
      .where(
        and(eq(spendItems.tileId, c.tileId), c.id === null ? undefined : ne(spendItems.id, c.id)),
      )
    if (siblings.length === 0) return
    if (siblings.some((s) => s.groupId !== c.groupId))
      throw new SpendItemShape('같은 타일의 항목은 한 묶음에 든다')

    const theirOptions = await db
      .select()
      .from(spendItemOptions)
      .where(
        inArray(
          spendItemOptions.itemId,
          siblings.map((s) => s.id),
        ),
      )
    const optionsOf = (id: string) => theirOptions.filter((o) => o.itemId === id)
    const kindOf = (tier: string | null, options: unknown[]) =>
      options.length > 0 ? 'options' : tier !== null ? 'tier' : 'none'
    const mine = kindOf(c.tier, c.options)
    for (const s of siblings) {
      if (mine === 'none' || kindOf(s.tier, optionsOf(s.id)) !== mine)
        throw new SpendItemShape('같은 타일의 항목은 전부 단계를 들거나 전부 축 값을 든다')
    }
    if (mine !== 'options') return
    for (const s of siblings) {
      const theirs = optionsOf(s.id)
      if (axisSignature(theirs) !== axisSignature(c.options))
        throw new SpendItemShape('같은 타일의 항목은 축 이름이 같아야 한다')
      if (valueCombo(theirs) === valueCombo(c.options))
        throw new SpendItemShape('같은 축 값 조합의 항목이 이미 있다')
    }
  }

  /** 이웃과 sort_order 를 맞바꾼다. 묶음 · 항목이 같은 방식이다. */
  private async swap(
    db: DbOrTx,
    table: typeof spendGroups | typeof spendItems,
    rows: { id: string; key: string; sortOrder: number }[],
    key: string,
    direction: 'up' | 'down',
  ): Promise<boolean> {
    const at = rows.findIndex((r) => r.key === key)
    if (at === -1) return false
    const mine = rows[at]
    const other = rows[direction === 'up' ? at - 1 : at + 1]
    if (mine === undefined || other === undefined) return true
    await db.update(table).set({ sortOrder: other.sortOrder }).where(eq(table.id, mine.id))
    await db.update(table).set({ sortOrder: mine.sortOrder }).where(eq(table.id, other.id))
    await touchSection(db, 'spendCatalog')
    return true
  }
}
