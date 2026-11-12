import { Inject, Injectable } from '@nestjs/common'
import { and, desc, eq, isNull, ne, or, type SQL, sql } from 'drizzle-orm'

import { DB, type Db } from '../../database/database.module'
import {
  bossDifficulties,
  bosses,
  dropBoxes,
  items,
  dropPrices,
  type dropRecordStatusEnum,
  worlds,
} from '../../database/schema'
import { isUniqueViolation } from '../../common/pg-errors'
import type { IdentityContext, IdentitySource } from '../identity/identity.guard'
import { assertOwnsMapleId, ownedMapleIds } from '../users/maple-id-ownership'
import type { Tx } from '../users/nexon-account-store'

/** 가격 줄의 상태 넷. 표의 enum 과 같다. */
export type DropRecordStatus = (typeof dropRecordStatusEnum.enumValues)[number]

/**
 * 전송값 그대로 key 를 든다. 서버가 적을 때 표에서 id 를 찾고, 모르는 key 는 NoDropItem · NoWorld 다.
 * deleted 는 본문으로 안 오고 markDeleted 가 적는다.
 */
export interface DropPriceInput {
  userId: string
  /** 보낸 신원의 넥슨 계정. 메이플 ID 가 이 계정의 것이어야 적는다. */
  nexonAccountId: string
  identifiedBy: IdentitySource
  dropRecordId: string
  itemKey: string
  /** completed 만 값이 있다. 어긋나면 표의 CHECK 가 거절한다. */
  priceMeso: number | null
  periodKey: string
  worldKey: string | null
  ringLevel: number | null
  /** 보스 난이도 줄. 표에 없는 쌍이면 null. */
  bossDifficultyId: string | null
  /** 같은 드롭을 가리는 보스 줄. 표에 없는 보스면 null. */
  bossId: string | null
  /** 어느 처치 기간의 드롭인가. 기기의 기간 행 id 이고 옛 OTA 는 안 보내 null. */
  periodRecordId: string | null
  recordStatus: Exclude<DropRecordStatus, 'deleted'>
  /** 기기가 보낸 거래 시각. 이 칸을 안 보내는 옛 앱은 null 이고 그때는 받은 시각으로 적는다. */
  pricedAt: Date | null
  /** 넥슨이 준 값 둘. 1.0.13 앱은 안 보내 null 이고, 그때는 사람 · 기록 id 로 가린다. */
  owner: { mapleId: string; ocid: string } | null
  /** 상자에서 나온 드롭이면 그 상자의 아이템 key. 보스가 직접 떨군 드롭은 null. */
  boxOriginKey: string | null
}

/** 관리 화면이 보는 줄. completed 가 아닌 줄도 상태를 달고 그대로 보인다. 노이즈를 보는 자리라 숨기지 않는다. */
export interface DropPriceAdminRow {
  id: string
  /** 계정을 삭제한 사람의 줄은 NULL 이다. */
  userId: string | null
  identifiedBy: IdentitySource
  dropRecordId: string
  itemKey: string
  /** 아이템 표의 한글 이름. 화면이 key 대신 이것을 보인다. */
  itemName: string
  /** completed 만 값이 있다. */
  priceMeso: number | null
  periodKey: string
  worldKey: string | null
  /** 월드 표의 한글 이름. 월드가 없는 줄은 null. */
  worldName: string | null
  ringLevel: number | null
  /** 보스 key 와 난이도. 줄이 안 가리키면 둘 다 null. */
  boss: string | null
  /** 보스 표의 한글 이름. 화면이 key 대신 이것을 보인다. */
  bossName: string | null
  difficulty: string | null
  recordStatus: DropRecordStatus
  createdAt: string
  updatedAt: string
}

/** 아이템 × 기간의 분포. completed 만 센다. */
export interface DropPriceSummary {
  itemKey: string
  itemName: string
  periodKey: string
  count: number
  min: number
  median: number
  max: number
}

/** itemKey 는 아이템 표의 key 또는 한글 이름 중 하나와 같으면 걸린다. 화면이 이름을 보이므로 이름으로도 거른다. */
export interface DropPriceFilter {
  itemKey: string | null
  periodKey: string | null
}

function itemMatches(value: string | null) {
  return value === null ? undefined : or(eq(items.key, value), eq(items.name, value))
}

/** 전송값의 key 를 표에서 찾은 id. 상자는 직접 떨군 드롭이면 null. */
interface Resolved {
  itemId: string
  worldId: string | null
  boxOriginItemId: string | null
}

/** 아이템 표에 없는 key 다. message 가 그 key 다. */
export class NoDropItem extends Error {}
/** 월드 표에 없는 key 다. message 가 그 key 다. */
export class NoWorld extends Error {}
/** 상자 표에 없는 key 다. 상자가 아닌 아이템 key 도 여기다. message 가 그 key 다. */
export class NoDropBox extends Error {}

/**
 * 시세 표본. 같은 드롭(ocid · 보스 · 기간 · 아이템 · 획득처)은 누가 보냈든 한 줄이고, 다시 보낸 기록은 메이플 ID · 기록 id 로
 * 찾는다. 1.0.13 앱의 줄은 사람 · 기록 id 로 찾는다. 기기에서 사라진 기록은 deleted 로 남는다.
 */
@Injectable()
export class DropPricesRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** 최근 것부터. 필터는 아이템 key 와 기간 key 둘이고 비우면 전부다. */
  async recent(filter: DropPriceFilter, limit: number): Promise<DropPriceAdminRow[]> {
    const rows = await this.db
      .select({
        price: dropPrices,
        itemKey: items.key,
        itemName: items.name,
        worldKey: worlds.key,
        worldName: worlds.name,
        boss: bosses.key,
        bossName: bosses.name,
        difficulty: bossDifficulties.difficulty,
      })
      .from(dropPrices)
      .innerJoin(items, eq(dropPrices.itemId, items.id))
      .leftJoin(worlds, eq(dropPrices.worldId, worlds.id))
      .leftJoin(bossDifficulties, eq(dropPrices.bossDifficultyId, bossDifficulties.id))
      .leftJoin(bosses, eq(bossDifficulties.bossId, bosses.id))
      .where(
        and(
          itemMatches(filter.itemKey),
          filter.periodKey === null ? undefined : eq(dropPrices.periodKey, filter.periodKey),
        ),
      )
      .orderBy(desc(dropPrices.updatedAt), desc(dropPrices.id))
      .limit(limit)
    return rows.map(
      ({ price: r, itemKey, itemName, worldKey, worldName, boss, bossName, difficulty }) => ({
        id: r.id,
        userId: r.userId,
        identifiedBy: r.identifiedBy,
        dropRecordId: r.dropRecordId,
        itemKey,
        itemName,
        priceMeso: r.priceMeso,
        periodKey: r.periodKey,
        worldKey,
        worldName,
        ringLevel: r.ringLevel,
        boss,
        bossName,
        difficulty,
        recordStatus: r.recordStatus,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      }),
    )
  }

  /** 아이템 × 기간마다 개수 · 최소 · 중앙값 · 최대. 최근 기간부터, 같은 기간은 개수 많은 것부터. */
  async summary(filter: DropPriceFilter): Promise<DropPriceSummary[]> {
    // bigint 집계는 문자열로 오므로 float8 로 받는다. 시세는 안전한 정수 안이다.
    const rows = await this.db
      .select({
        itemKey: items.key,
        itemName: items.name,
        periodKey: dropPrices.periodKey,
        count: sql<number>`count(*)::int`,
        min: sql<number>`min(${dropPrices.priceMeso})::float8`,
        median: sql<number>`percentile_cont(0.5) within group (order by ${dropPrices.priceMeso})::float8`,
        max: sql<number>`max(${dropPrices.priceMeso})::float8`,
      })
      .from(dropPrices)
      .innerJoin(items, eq(dropPrices.itemId, items.id))
      .where(
        and(
          eq(dropPrices.recordStatus, 'completed'),
          itemMatches(filter.itemKey),
          filter.periodKey === null ? undefined : eq(dropPrices.periodKey, filter.periodKey),
        ),
      )
      .groupBy(items.key, items.name, dropPrices.periodKey)
      .orderBy(desc(dropPrices.periodKey), desc(sql`count(*)`), items.key)
    return rows
  }

  /**
   * 한 건을 적는다. 아이템 · 월드는 key 로 표에서 id 를 찾아 적고, 모르는 key 는 NoDropItem · NoWorld 로 거절한다. 월드가 없는(null)
   * 줄은 그대로 받는다. 다시 적으면 값과 상태를 덮으므로 deleted 였던 줄도 되살아난다.
   *
   * priced_at 은 기기가 보낸 거래 시각이고, 미래면 지금으로 자른다. 거래 시각이 없는 옛 앱의 줄은 completed 가 되거나 가격이 바뀔
   * 때만 지금으로 움직인다. 옛 앱은 저장하는 그 자리에서 보내 받은 시각이 곧 거래 시각이다.
   */
  async upsert(input: DropPriceInput): Promise<void> {
    const resolved = await this.resolve(input)
    if (input.owner === null) {
      await this.upsertLegacy(input, resolved)
      return
    }
    const owner = input.owner
    try {
      await this.db.transaction(async (tx) => {
        await assertOwnsMapleId(tx, input.nexonAccountId, owner.mapleId)
        const [found] = await tx
          .select({
            id: dropPrices.id,
            mapleId: dropPrices.mapleId,
            createdAt: dropPrices.createdAt,
          })
          .from(dropPrices)
          .where(
            or(
              and(
                eq(dropPrices.mapleId, owner.mapleId),
                eq(dropPrices.dropRecordId, input.dropRecordId),
              ),
              and(
                eq(dropPrices.userId, input.userId),
                eq(dropPrices.dropRecordId, input.dropRecordId),
                isNull(dropPrices.mapleId),
              ),
            ),
          )
          .orderBy(sql`${dropPrices.mapleId} IS NULL`)
          .limit(1)
          .for('update')
        const same = await this.sameDrop(tx, input, resolved, found?.id ?? null)
        if (same !== undefined) {
          // 옛 줄에 처음 채우다 같은 드롭이 되면 먼저 들어온 줄을 남긴다. 그 밖에는 같은 드롭이 이미 있어 적지 않는다.
          const filling = found !== undefined && found.mapleId === null
          if (!filling) return
          if (same.createdAt <= found.createdAt) {
            await tx.delete(dropPrices).where(eq(dropPrices.id, found.id))
            return
          }
          await tx.delete(dropPrices).where(eq(dropPrices.id, same.id))
        }
        const values = {
          ...this.valuesOf(input, resolved),
          mapleId: owner.mapleId,
          ocid: owner.ocid,
        }
        if (found !== undefined) {
          await tx
            .update(dropPrices)
            .set({ ...values, pricedAt: this.pricedAtOnUpdate(input), updatedAt: sql`now()` })
            .where(eq(dropPrices.id, found.id))
          return
        }
        await tx
          .insert(dropPrices)
          .values({
            userId: input.userId,
            dropRecordId: input.dropRecordId,
            ...values,
            pricedAt: this.pricedAtOnInsert(input),
          })
          .onConflictDoNothing({ target: [dropPrices.userId, dropPrices.dropRecordId] })
      })
    } catch (error) {
      // 같은 드롭이 동시에 들어와 진 쪽이다. 같은 드롭은 적지 않는다.
      if (isUniqueViolation(error, 'drop_prices_same_drop_unique')) return
      throw error
    }
  }

  /** 1.0.13 앱의 줄. 사람과 기록 id 로 덮어 적는다. 넥슨이 준 값이 없어 같은 드롭을 가리지 못한다. */
  private async upsertLegacy(input: DropPriceInput, resolved: Resolved): Promise<void> {
    const values = this.valuesOf(input, resolved)
    await this.db
      .insert(dropPrices)
      .values({
        userId: input.userId,
        dropRecordId: input.dropRecordId,
        ...values,
        pricedAt: this.pricedAtOnInsert(input),
      })
      .onConflictDoUpdate({
        target: [dropPrices.userId, dropPrices.dropRecordId],
        set: { ...values, pricedAt: this.pricedAtOnUpdate(input), updatedAt: sql`now()` },
      })
  }

  private async resolve(input: DropPriceInput): Promise<Resolved> {
    const [item] = await this.db
      .select({ id: items.id })
      .from(items)
      .where(and(eq(items.key, input.itemKey), eq(items.isDrop, true)))
    if (item === undefined) throw new NoDropItem(input.itemKey)
    let worldId: string | null = null
    if (input.worldKey !== null) {
      const [world] = await this.db
        .select({ id: worlds.id })
        .from(worlds)
        .where(eq(worlds.key, input.worldKey))
      if (world === undefined) throw new NoWorld(input.worldKey)
      worldId = world.id
    }
    let boxOriginItemId: string | null = null
    if (input.boxOriginKey !== null) {
      const [box] = await this.db
        .select({ itemId: dropBoxes.itemId })
        .from(dropBoxes)
        .innerJoin(items, eq(dropBoxes.itemId, items.id))
        .where(eq(items.key, input.boxOriginKey))
      if (box === undefined) throw new NoDropBox(input.boxOriginKey)
      boxOriginItemId = box.itemId
    }
    return { itemId: item.id, worldId, boxOriginItemId }
  }

  private valuesOf(input: DropPriceInput, { itemId, worldId, boxOriginItemId }: Resolved) {
    return {
      identifiedBy: input.identifiedBy,
      itemId,
      worldId,
      boxOriginItemId,
      priceMeso: input.priceMeso,
      periodKey: input.periodKey,
      ringLevel: input.ringLevel,
      bossDifficultyId: input.bossDifficultyId,
      bossId: input.bossId,
      periodRecordId: input.periodRecordId,
      recordStatus: input.recordStatus,
    }
  }

  private sentPricedAt(input: DropPriceInput): SQL | null {
    return input.pricedAt === null
      ? null
      : sql`LEAST(${input.pricedAt.toISOString()}::timestamptz, now())`
  }

  private pricedAtOnInsert(input: DropPriceInput): SQL | null {
    if (input.recordStatus !== 'completed') return null
    return this.sentPricedAt(input) ?? sql`now()`
  }

  /** 거래 시각이 없는 옛 앱이 같은 값을 다시 보내도 그대로다. 움직이면 시세 차트의 날이 틀어진다. */
  private pricedAtOnUpdate(input: DropPriceInput): SQL | null {
    if (input.recordStatus !== 'completed') return null
    return (
      this.sentPricedAt(input) ??
      sql`CASE WHEN ${dropPrices.recordStatus} = 'completed' AND ${dropPrices.priceMeso} = ${input.priceMeso} THEN ${dropPrices.pricedAt} ELSE now() END`
    )
  }

  /** 같은 드롭인 다른 줄. 지운 줄은 빼고, 보스를 모르면 가릴 수 없어 없는 것으로 본다. */
  private async sameDrop(
    tx: Tx,
    input: DropPriceInput,
    { itemId, boxOriginItemId }: Resolved,
    self: string | null,
  ): Promise<{ id: string; createdAt: Date } | undefined> {
    if (input.owner === null || input.bossId === null) return undefined
    const [row] = await tx
      .select({ id: dropPrices.id, createdAt: dropPrices.createdAt })
      .from(dropPrices)
      .where(
        and(
          eq(dropPrices.ocid, input.owner.ocid),
          eq(dropPrices.bossId, input.bossId),
          eq(dropPrices.periodKey, input.periodKey),
          eq(dropPrices.itemId, itemId),
          // 직접 떨군 드롭끼리도 같은 획득처다. = 로 견주면 NULL 끼리 달라 같은 드롭을 놓친다.
          sql`${dropPrices.boxOriginItemId} IS NOT DISTINCT FROM ${boxOriginItemId}::uuid`,
          ne(dropPrices.recordStatus, 'deleted'),
          self === null ? undefined : ne(dropPrices.id, self),
        ),
      )
      .for('update')
    return row
  }

  /**
   * 내 줄을 deleted 로 표시하고 가격을 비운다. 내 줄은 내 계정의 메이플 ID 줄과, 메이플 ID 가 없는 옛 줄 가운데 내 사람의 줄이다.
   * 없는 줄이면 아무 일도 없다. 지운 것도 고친 것이라 updated_at 이 움직인다.
   */
  async markDeleted(
    identity: Pick<IdentityContext, 'userId' | 'nexonAccountId'>,
    dropRecordId: string,
  ): Promise<void> {
    await this.db
      .update(dropPrices)
      .set({ recordStatus: 'deleted', priceMeso: null, pricedAt: null, updatedAt: sql`now()` })
      .where(
        and(
          eq(dropPrices.dropRecordId, dropRecordId),
          or(
            sql`${dropPrices.mapleId} IN ${ownedMapleIds(identity.nexonAccountId)}`,
            and(isNull(dropPrices.mapleId), eq(dropPrices.userId, identity.userId)),
          ),
        ),
      )
  }
}
