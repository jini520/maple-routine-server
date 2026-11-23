import { and, asc, eq, getTableColumns, inArray, isNull, ne, or, type SQL, sql } from 'drizzle-orm'

import {
  bossDifficulties,
  bossDrops,
  bossProfitEntries,
  bossSplitSettings,
  characters,
  dropSalePrices,
  mapleIds,
} from '../../../database/schema'
import { MapleIdNotOwned } from '../../users/maple-id-ownership'
import { characterIdFor, ownedCharacterIds } from '../../users/characters'
import type { Tx } from '../../users/nexon-account-store'
import type { RecordOwner } from '../../users/owner-locks'
import { characterRowOwners, characterWire, omit } from '../row-owners'
import {
  type BossDropRow,
  type BossProfitEntryRow,
  type BossSplitSettingRow,
  bossDropRow,
  bossProfitEntryRow,
  bossSplitSettingRow,
  type DeleteById,
  deleteById,
} from '../sync.dto'
import {
  changedAfter,
  defineTable,
  type MapleIdReader,
  mapleIdOwner,
  type PulledRow,
} from '../sync-table'
import {
  RecordDeleted,
  RecordRejected,
  sameContent,
  type WriteContext,
  writeDeviceRow,
} from '../sync-write'

/** 분배 칸 다섯 */
const SPLIT_CONTENT = [
  'splitType',
  'partySize',
  'splitShareMillipercent',
  'splitFeePercent',
  'splitFeeFollowsMvpGrade',
] as const

/** 수익 건이 같은 기록인지 견주는 칸. 유일 기준 둘 가운데 보스로 가리는 기준은 난이도가 달라 늘 다르다. */
const ENTRY_CONTENT = [
  'bossDifficultyId',
  'worldId',
  'crystalPriceMeso',
  'crystalReceivedMeso',
  'clearedDate',
  'clearRecordedBy',
  ...SPLIT_CONTENT,
] as const

/** 드롭이 같은 기록인지 견주는 칸. 가격을 적은 시각은 같은 판매가도 기기마다 달라 견주지 않는다. */
const DROP_CONTENT = [
  'category',
  'priceStatus',
  'salePriceMeso',
  'saleReceivedMeso',
  'saleFeePercent',
  'saleFeeFollowsMvpGrade',
  ...SPLIT_CONTENT,
] as const

/** 그 넥슨 계정이 쓸 수 있는 캐릭터의 수익 건 id 들 */
const ownedEntryIds = (nexonAccountId: string) =>
  sql`(SELECT ${bossProfitEntries.id} FROM ${bossProfitEntries}
        WHERE ${bossProfitEntries.characterId} IN ${ownedCharacterIds(nexonAccountId)})`

/** 수익 건의 캐릭터와 그 메이플 ID. 드롭은 주인을 수익 건에서 찾는다. */
async function entryOf(ctx: WriteContext, entryId: string) {
  const [entry] = await ctx.tx
    .select({
      characterId: bossProfitEntries.characterId,
      worldId: bossProfitEntries.worldId,
      deletedAt: bossProfitEntries.deletedAt,
      mapleIdHash: mapleIds.hash,
      owned: sql<boolean>`${bossProfitEntries.characterId} IN ${ownedCharacterIds(ctx.identity.nexonAccountId)}`,
    })
    .from(bossProfitEntries)
    .innerJoin(characters, eq(characters.id, bossProfitEntries.characterId))
    .innerJoin(mapleIds, eq(mapleIds.id, characters.mapleId))
    .where(eq(bossProfitEntries.id, entryId))
  return entry
}

/** 드롭 줄의 주인 메이플 ID 해시. 줄이 없으면 잠글 것이 없다. */
async function dropOwners(ctx: WriteContext, dropId: string): Promise<RecordOwner[]> {
  const [row] = await ctx.tx
    .select({ hash: mapleIds.hash })
    .from(bossDrops)
    .innerJoin(bossProfitEntries, eq(bossProfitEntries.id, bossDrops.profitEntryId))
    .innerJoin(characters, eq(characters.id, bossProfitEntries.characterId))
    .innerJoin(mapleIds, eq(mapleIds.id, characters.mapleId))
    .where(eq(bossDrops.id, dropId))
  return row === undefined ? [] : [mapleIdOwner(row.hash)]
}

/**
 * 드롭의 판매가 줄을 드롭에 맞춘다. 가격을 적은 드롭이면 드롭 id 로 한 줄을 적고, 아니면 지운다. 같은 id 의 줄이 다른 사람의
 * 것이면 건드리지 않는다. 사람이 빈 줄은 계정을 삭제해 비운 줄이라 요청한 사람을 채운다. 거래 시각이 미래면 지금으로 자른다.
 * 기기 시계가 앞서면 판매가가 아직 오지 않은 날의 시세에 잡힌다.
 */
async function syncSalePrice(
  tx: Tx,
  userId: string,
  dropId: string,
  drop: Pick<BossDropRow, 'priceStatus' | 'itemId' | 'salePriceMeso' | 'pricedAt'> | null,
  worldId: string | null,
): Promise<void> {
  if (
    drop !== null &&
    drop.priceStatus === 'entered' &&
    drop.salePriceMeso !== null &&
    drop.pricedAt !== null
  ) {
    const values = {
      userId,
      itemId: drop.itemId,
      worldId,
      salePriceMeso: drop.salePriceMeso,
      pricedAt: sql`LEAST(${drop.pricedAt.toISOString()}::timestamptz, now())`,
    }
    await tx
      .insert(dropSalePrices)
      .values({ id: dropId, ...values })
      .onConflictDoUpdate({
        target: dropSalePrices.id,
        set: { ...values, updatedAt: sql`now()` },
        setWhere: sql`${dropSalePrices.userId} IS NULL OR ${dropSalePrices.userId} = ${userId}`,
      })
    return
  }
  await tx
    .delete(dropSalePrices)
    .where(
      and(
        eq(dropSalePrices.id, dropId),
        or(isNull(dropSalePrices.userId), eq(dropSalePrices.userId, userId)),
      ),
    )
}

/** 드롭들에 삭제 표식을 적고 그 판매가 줄을 지운다. */
async function markDropsDeleted(tx: Tx, userId: string, where: SQL): Promise<void> {
  const gone = await tx
    .update(bossDrops)
    .set({ deletedAt: sql`now()`, updatedAt: sql`now()` })
    .where(and(where, isNull(bossDrops.deletedAt)))
    .returning({ id: bossDrops.id })
  if (gone.length === 0) return
  await tx.delete(dropSalePrices).where(
    and(
      inArray(
        dropSalePrices.id,
        gone.map((row) => row.id),
      ),
      or(isNull(dropSalePrices.userId), eq(dropSalePrices.userId, userId)),
    ),
  )
}

/**
 * 수익 건에 삭제 표식을 적는다. 기기에서는 수익 건을 지우면 드롭이 함께 지워지므로 서버도 그 드롭에 표식을 적고 판매가 줄을
 * 지운다. 남기면 지운 처치의 판매가가 시세에 남는다.
 */
async function markEntryDeleted(ctx: WriteContext, id: string): Promise<string | null> {
  const [gone] = await ctx.tx
    .update(bossProfitEntries)
    .set({ deletedAt: sql`now()`, updatedAt: sql`now()` })
    .where(
      and(
        eq(bossProfitEntries.id, id),
        isNull(bossProfitEntries.deletedAt),
        sql`${bossProfitEntries.characterId} IN ${ownedCharacterIds(ctx.identity.nexonAccountId)}`,
      ),
    )
    .returning({ id: bossProfitEntries.id })
  if (gone === undefined) return null
  await markDropsDeleted(ctx.tx, ctx.identity.userId, eq(bossDrops.profitEntryId, id))
  return id
}

/**
 * 다른 수익 건으로 합쳐진 수익 건의 드롭을 남는 수익 건으로 옮긴다. 남는 수익 건에 같은 아이템의 드롭이 이미 있으면 그 드롭은
 * 지운다. 수익 건과 함께 지우면 기기가 남는 수익 건으로 옮겨 올린 같은 드롭이 지운 기록의 수정으로 거절된다.
 */
async function moveDrops(ctx: WriteContext, from: string, into: string): Promise<void> {
  await markDropsDeleted(
    ctx.tx,
    ctx.identity.userId,
    and(
      eq(bossDrops.profitEntryId, from),
      sql`EXISTS (SELECT 1 FROM ${bossDrops} kept
                   WHERE kept.profit_entry_id = ${into} AND kept.item_id = ${bossDrops.itemId}
                     AND kept.deleted_at IS NULL)`,
    ) as SQL,
  )
  await ctx.tx
    .update(bossDrops)
    .set({ profitEntryId: into, updatedAt: sql`now()` })
    .where(and(eq(bossDrops.profitEntryId, from), isNull(bossDrops.deletedAt)))
}

/** 보스 수익 건. 보스 줄은 난이도 줄에서 채우고, 기간 값의 첫 글자가 난이도의 주기와 다르면 받지 않는다. */
export const bossProfitEntriesTable = defineTable<BossProfitEntryRow, DeleteById>({
  upsertRow: bossProfitEntryRow,
  deleteRow: deleteById,
  upsertOwners: async (_ctx, row) => [mapleIdOwner(row.mapleId)],
  async upsert(ctx, row) {
    const { tx, identity } = ctx
    const { id, mapleId, ocid, ...values } = row
    const characterId = await characterIdFor(tx, identity.nexonAccountId, mapleId, ocid)
    const [difficulty] = await tx
      .select({ bossId: bossDifficulties.bossId, cycle: bossDifficulties.cycle })
      .from(bossDifficulties)
      .where(eq(bossDifficulties.id, values.bossDifficultyId))
    if (difficulty === undefined) {
      throw new RecordRejected(`난이도 표에 없는 줄이다: ${values.bossDifficultyId}`)
    }
    if (values.periodCode[0] !== (difficulty.cycle === 'weekly' ? 'W' : 'M')) {
      throw new RecordRejected(`기간 값이 난이도의 주기와 다르다: ${values.periodCode}`)
    }
    const incoming = { ...values, characterId, bossId: difficulty.bossId }
    const [existing] = await tx
      .select({
        row: getTableColumns(bossProfitEntries),
        owned: sql<boolean>`${bossProfitEntries.characterId} IN ${ownedCharacterIds(identity.nexonAccountId)}`,
      })
      .from(bossProfitEntries)
      .where(eq(bossProfitEntries.id, id))
    const sameDifficulty = eq(bossProfitEntries.bossDifficultyId, values.bossDifficultyId)
    const [sameKey] = await tx
      .select()
      .from(bossProfitEntries)
      .where(
        and(
          ne(bossProfitEntries.id, id),
          isNull(bossProfitEntries.deletedAt),
          eq(bossProfitEntries.characterId, characterId),
          eq(bossProfitEntries.periodCode, values.periodCode),
          values.clearRecordedBy === null
            ? sameDifficulty
            : or(
                sameDifficulty,
                and(
                  eq(bossProfitEntries.bossId, difficulty.bossId),
                  sql`${bossProfitEntries.clearRecordedBy} IS NOT NULL`,
                ),
              ),
        ),
      )
      .orderBy(sql`${sameDifficulty} DESC`)
      .limit(1)
    return writeDeviceRow({
      id,
      existing,
      sameKey,
      isSameContent: (other) => sameContent(other, incoming, ENTRY_CONTENT),
      insert: async () => {
        await tx.insert(bossProfitEntries).values({ id, ...incoming })
      },
      update: async () => {
        await tx
          .update(bossProfitEntries)
          .set({ ...incoming, updatedAt: sql`now()` })
          .where(eq(bossProfitEntries.id, id))
      },
      revive: async (kept) => {
        await tx
          .update(bossProfitEntries)
          .set({ ...incoming, deletedAt: null, updatedAt: sql`now()` })
          .where(eq(bossProfitEntries.id, kept))
      },
      discard: async (gone) => {
        if (sameKey !== undefined) await moveDrops(ctx, gone, sameKey.id)
        await markEntryDeleted(ctx, gone)
      },
    })
  },
  deleteOwners: (ctx, row) => characterRowOwners(ctx.tx, bossProfitEntries, row.id),
  remove: (ctx, row) => markEntryDeleted(ctx, row.id),
})

/**
 * 수익 건에서 나온 드롭. 주인은 수익 건을 따른다. 수익 건이 아직 없으면 나중에 맞을 수 있어 코드 없이 거절하고, 지운 수익 건이면
 * 지운 기록의 수정으로 본다. 가격을 적은 드롭은 같은 트랜잭션에서 판매가 줄을 적는다.
 */
export const bossDropsTable = defineTable<BossDropRow, DeleteById>({
  upsertRow: bossDropRow,
  deleteRow: deleteById,
  async upsertOwners(ctx, row) {
    const entry = await entryOf(ctx, row.profitEntryId)
    return entry === undefined ? [] : [mapleIdOwner(entry.mapleIdHash)]
  },
  async upsert(ctx, row) {
    const { tx, identity } = ctx
    const entry = await entryOf(ctx, row.profitEntryId)
    if (entry === undefined) throw new RecordRejected(`수익 건이 없다: ${row.profitEntryId}`)
    if (!entry.owned) throw new MapleIdNotOwned(entry.mapleIdHash)
    if (entry.deletedAt !== null) throw new RecordDeleted()
    const { id, ...incoming } = row
    const [existing] = await tx
      .select({
        row: getTableColumns(bossDrops),
        owned: sql<boolean>`${bossDrops.profitEntryId} IN ${ownedEntryIds(identity.nexonAccountId)}`,
      })
      .from(bossDrops)
      .where(eq(bossDrops.id, id))
    const [sameKey] = await tx
      .select()
      .from(bossDrops)
      .where(
        and(
          ne(bossDrops.id, id),
          isNull(bossDrops.deletedAt),
          eq(bossDrops.profitEntryId, row.profitEntryId),
          eq(bossDrops.itemId, row.itemId),
        ),
      )
      .limit(1)
    const discard = async (gone: string) => {
      await markDropsDeleted(tx, identity.userId, eq(bossDrops.id, gone))
    }
    const kept = await writeDeviceRow({
      id,
      existing,
      sameKey,
      isSameContent: (other) => sameContent(other, incoming, DROP_CONTENT),
      insert: async () => {
        await tx.insert(bossDrops).values({ id, ...incoming })
      },
      update: async () => {
        await tx
          .update(bossDrops)
          .set({ ...incoming, updatedAt: sql`now()` })
          .where(eq(bossDrops.id, id))
      },
      revive: async (other) => {
        await tx
          .update(bossDrops)
          .set({ ...incoming, deletedAt: null, updatedAt: sql`now()` })
          .where(eq(bossDrops.id, other))
      },
      discard,
    })
    // 합쳐져 버려진 드롭 id 의 판매가 줄은 지운다. 남기면 같은 드롭이 시세에 두 번 세인다.
    await syncSalePrice(tx, identity.userId, id, kept === id ? incoming : null, entry.worldId)
    return kept
  },
  deleteOwners: (ctx, row) => dropOwners(ctx, row.id),
  async remove(ctx, row) {
    const [owned] = await ctx.tx
      .select({ id: bossDrops.id })
      .from(bossDrops)
      .where(
        and(
          eq(bossDrops.id, row.id),
          isNull(bossDrops.deletedAt),
          sql`${bossDrops.profitEntryId} IN ${ownedEntryIds(ctx.identity.nexonAccountId)}`,
        ),
      )
    if (owned === undefined) return null
    await markDropsDeleted(ctx.tx, ctx.identity.userId, eq(bossDrops.id, row.id))
    return row.id
  },
})

/** 캐릭터가 한 보스 · 난이도를 잡을 때 쓰는 기본 분배 */
export const bossSplitSettingsTable = defineTable<BossSplitSettingRow, DeleteById>({
  upsertRow: bossSplitSettingRow,
  deleteRow: deleteById,
  upsertOwners: async (_ctx, row) => [mapleIdOwner(row.mapleId)],
  async upsert(ctx, row) {
    const { tx, identity } = ctx
    const { id, mapleId, ocid, ...values } = row
    const characterId = await characterIdFor(tx, identity.nexonAccountId, mapleId, ocid)
    const incoming = { ...values, characterId }
    const [existing] = await tx
      .select({
        row: getTableColumns(bossSplitSettings),
        owned: sql<boolean>`${bossSplitSettings.characterId} IN ${ownedCharacterIds(identity.nexonAccountId)}`,
      })
      .from(bossSplitSettings)
      .where(eq(bossSplitSettings.id, id))
    const [sameKey] = await tx
      .select()
      .from(bossSplitSettings)
      .where(
        and(
          ne(bossSplitSettings.id, id),
          isNull(bossSplitSettings.deletedAt),
          eq(bossSplitSettings.characterId, characterId),
          eq(bossSplitSettings.bossDifficultyId, values.bossDifficultyId),
        ),
      )
      .limit(1)
    return writeDeviceRow({
      id,
      existing,
      sameKey,
      isSameContent: (other) => sameContent(other, incoming, SPLIT_CONTENT),
      insert: async () => {
        await tx.insert(bossSplitSettings).values({ id, ...incoming })
      },
      update: async () => {
        await tx
          .update(bossSplitSettings)
          .set({ ...incoming, updatedAt: sql`now()` })
          .where(eq(bossSplitSettings.id, id))
      },
      revive: async (kept) => {
        await tx
          .update(bossSplitSettings)
          .set({ ...incoming, deletedAt: null, updatedAt: sql`now()` })
          .where(eq(bossSplitSettings.id, kept))
      },
      discard: async (gone) => {
        await tx
          .update(bossSplitSettings)
          .set({ deletedAt: sql`now()`, updatedAt: sql`now()` })
          .where(eq(bossSplitSettings.id, gone))
      },
    })
  },
  deleteOwners: (ctx, row) => characterRowOwners(ctx.tx, bossSplitSettings, row.id),
  async remove(ctx, row) {
    const [gone] = await ctx.tx
      .update(bossSplitSettings)
      .set({ deletedAt: sql`now()`, updatedAt: sql`now()` })
      .where(
        and(
          eq(bossSplitSettings.id, row.id),
          isNull(bossSplitSettings.deletedAt),
          sql`${bossSplitSettings.characterId} IN ${ownedCharacterIds(ctx.identity.nexonAccountId)}`,
        ),
      )
      .returning({ id: bossSplitSettings.id })
    return gone?.id ?? null
  },
})

/** 수익 건 · 분배 설정을 그 메이플 ID 의 캐릭터에서 읽는다. 수익 건의 보스 줄 id 는 기기에 없어 싣지 않는다. */
export const readBossProfitEntries: MapleIdReader = async (tx, owner, after, limit) => {
  const rows = await tx
    .select({ row: getTableColumns(bossProfitEntries), ocid: characters.ocid })
    .from(bossProfitEntries)
    .innerJoin(characters, eq(characters.id, bossProfitEntries.characterId))
    .where(
      and(
        eq(characters.mapleId, owner.id),
        changedAfter(bossProfitEntries.changeSeq, bossProfitEntries.deletedAt, after),
      ),
    )
    .orderBy(asc(bossProfitEntries.changeSeq))
    .limit(limit)
  return rows.map(({ row, ocid }): PulledRow => ({
    table: 'bossProfitEntries',
    changeSeq: row.changeSeq,
    row: characterWire(omit(row, ['bossId']), owner.hash, ocid),
  }))
}

export const readBossSplitSettings: MapleIdReader = async (tx, owner, after, limit) => {
  const rows = await tx
    .select({ row: getTableColumns(bossSplitSettings), ocid: characters.ocid })
    .from(bossSplitSettings)
    .innerJoin(characters, eq(characters.id, bossSplitSettings.characterId))
    .where(
      and(
        eq(characters.mapleId, owner.id),
        changedAfter(bossSplitSettings.changeSeq, bossSplitSettings.deletedAt, after),
      ),
    )
    .orderBy(asc(bossSplitSettings.changeSeq))
    .limit(limit)
  return rows.map(({ row, ocid }): PulledRow => ({
    table: 'bossSplitSettings',
    changeSeq: row.changeSeq,
    row: characterWire(row, owner.hash, ocid),
  }))
}

/** 드롭을 그 메이플 ID 의 캐릭터의 수익 건에서 읽는다. 주인은 수익 건이 말해 싣지 않는다. */
export const readBossDrops: MapleIdReader = async (tx, owner, after, limit) => {
  const rows = await tx
    .select({ row: getTableColumns(bossDrops) })
    .from(bossDrops)
    .innerJoin(bossProfitEntries, eq(bossProfitEntries.id, bossDrops.profitEntryId))
    .innerJoin(characters, eq(characters.id, bossProfitEntries.characterId))
    .where(
      and(
        eq(characters.mapleId, owner.id),
        changedAfter(bossDrops.changeSeq, bossDrops.deletedAt, after),
      ),
    )
    .orderBy(asc(bossDrops.changeSeq))
    .limit(limit)
  return rows.map(({ row }): PulledRow => ({ table: 'bossDrops', changeSeq: row.changeSeq, row }))
}
