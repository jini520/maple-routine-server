import { and, asc, eq, getTableColumns, isNull, ne, sql } from 'drizzle-orm'

import {
  bossDifficulties,
  characters,
  characterWorldLeaps,
  contents,
  enhancementTotals,
  hexaCores,
  manualTrackedItems,
  mapleIdNames,
  mvpGradeHistory,
  representativeCharacterMotions,
  rememberedLevels,
  sharedContentProgress,
  symbols,
} from '../../../database/schema'
import { MapleIdNotOwned } from '../../users/maple-id-ownership'
import {
  characterIdFor,
  mapleIdRowFor,
  ownedCharacterIds,
  ownedMapleIdRows,
} from '../../users/characters'
import type { Tx } from '../../users/nexon-account-store'
import {
  characterRowOwners,
  characterWire,
  existingCharacterId,
  mapleIdRowOwners,
  mapleIdWire,
  omit,
} from '../row-owners'
import {
  type CharacterWorldLeapRow,
  characterWorldLeapRow,
  type DeleteByCharacter,
  deleteByCharacter,
  type DeleteById,
  deleteById,
  type DeleteMapleIdName,
  deleteMapleIdName,
  type DeleteSharedContentProgress,
  deleteSharedContentProgress,
  type EnhancementTotalRow,
  enhancementTotalRow,
  type ManualTrackedItemRow,
  manualTrackedItemRow,
  type MapleIdNameRow,
  mapleIdNameRow,
  type MvpGradeHistoryRow,
  mvpGradeHistoryRow,
  type RememberedLevelRow,
  rememberedLevelRow,
  type RepresentativeCharacterMotionRow,
  representativeCharacterMotionRow,
  type SharedContentProgressRow,
  sharedContentProgressRow,
} from '../sync.dto'
import { changedAfter, defineTable, type MapleIdReader, mapleIdOwner } from '../sync-table'
import { assertTarget, RecordRejected, sameContent, writeDeviceRow } from '../sync-write'

/** 강화 합계가 같은 기록인지 견주는 칸. 금액은 올린 기기가 그때의 비용표로 매긴 값이다. */
const ENHANCEMENT_CONTENT = [
  'attemptCount',
  'attemptCostMeso',
  'destroyDefenceCostMeso',
  'worldId',
  'superiorCostMeso',
  'fromStar',
  'toStar',
  'isEventWorld',
] as const

const deleted = { deletedAt: sql`now()`, updatedAt: sql`now()` }
const revived = { deletedAt: null, updatedAt: sql`now()` }

/**
 * 강화 합계. 같은 합계(캐릭터 · 날짜 · 분류 · 장비 이름)는 한 줄이고 표의 UNIQUE 가 지운 줄도 쥔다. 그래서 같은 합계의 지운 줄이
 * 있으면 그 줄을 되살리고 그 줄의 id 를 돌려준다. 데이터 삭제 뒤 넥슨에서 다시 받은 합계가 그렇다.
 */
export const enhancementTotalsTable = defineTable<EnhancementTotalRow, DeleteById>({
  upsertRow: enhancementTotalRow,
  deleteRow: deleteById,
  upsertOwners: async (_ctx, row) => [mapleIdOwner(row.mapleId)],
  async upsert(ctx, row) {
    const { tx, identity } = ctx
    const { id, mapleId, ocid, ...values } = row
    const characterId = await characterIdFor(tx, identity.nexonAccountId, mapleId, ocid)
    const incoming = { ...values, characterId }
    const [existing] = await tx
      .select({
        row: getTableColumns(enhancementTotals),
        owned: sql<boolean>`${enhancementTotals.characterId} IN ${ownedCharacterIds(identity.nexonAccountId)}`,
      })
      .from(enhancementTotals)
      .where(eq(enhancementTotals.id, id))
    const [sameKey] = await tx
      .select()
      .from(enhancementTotals)
      .where(
        and(
          ne(enhancementTotals.id, id),
          eq(enhancementTotals.characterId, characterId),
          eq(enhancementTotals.historyDate, values.historyDate),
          eq(enhancementTotals.category, values.category),
          eq(enhancementTotals.itemName, values.itemName),
        ),
      )
    return writeDeviceRow({
      id,
      existing,
      sameKey,
      isSameContent: (other) => sameContent(other, incoming, ENHANCEMENT_CONTENT),
      insert: async () => {
        await tx.insert(enhancementTotals).values({ id, ...incoming })
      },
      update: async () => {
        await tx
          .update(enhancementTotals)
          .set({ ...incoming, updatedAt: sql`now()` })
          .where(eq(enhancementTotals.id, id))
      },
      revive: async (kept) => {
        await tx
          .update(enhancementTotals)
          .set({ ...incoming, ...revived })
          .where(eq(enhancementTotals.id, kept))
      },
      discard: async (gone) => {
        await tx.update(enhancementTotals).set(deleted).where(eq(enhancementTotals.id, gone))
      },
    })
  },
  deleteOwners: (ctx, row) => characterRowOwners(ctx.tx, enhancementTotals, row.id),
  async remove(ctx, row) {
    const [gone] = await ctx.tx
      .update(enhancementTotals)
      .set(deleted)
      .where(
        and(
          eq(enhancementTotals.id, row.id),
          isNull(enhancementTotals.deletedAt),
          sql`${enhancementTotals.characterId} IN ${ownedCharacterIds(ctx.identity.nexonAccountId)}`,
        ),
      )
      .returning({ id: enhancementTotals.id })
    return gone?.id ?? null
  },
})

/** 심볼 · 헥사 폼이 강화 전 레벨 칸을 채우는 값. 캐릭터 · 종류 · 대상마다 한 줄이고 표의 UNIQUE 가 지운 줄도 쥔다. */
export const rememberedLevelsTable = defineTable<RememberedLevelRow, DeleteById>({
  upsertRow: rememberedLevelRow,
  deleteRow: deleteById,
  upsertOwners: async (_ctx, row) => [mapleIdOwner(row.mapleId)],
  async upsert(ctx, row) {
    const { tx, identity } = ctx
    const { id, mapleId, ocid, ...values } = row
    await assertTarget(tx, values.type === 'symbol' ? symbols : hexaCores, values.targetId)
    const characterId = await characterIdFor(tx, identity.nexonAccountId, mapleId, ocid)
    const incoming = { ...values, characterId }
    const [existing] = await tx
      .select({
        row: getTableColumns(rememberedLevels),
        owned: sql<boolean>`${rememberedLevels.characterId} IN ${ownedCharacterIds(identity.nexonAccountId)}`,
      })
      .from(rememberedLevels)
      .where(eq(rememberedLevels.id, id))
    const [sameKey] = await tx
      .select()
      .from(rememberedLevels)
      .where(
        and(
          ne(rememberedLevels.id, id),
          eq(rememberedLevels.characterId, characterId),
          eq(rememberedLevels.type, values.type),
          eq(rememberedLevels.targetId, values.targetId),
        ),
      )
    return writeDeviceRow({
      id,
      existing,
      sameKey,
      isSameContent: (other) => sameContent(other, incoming, ['level']),
      insert: async () => {
        await tx.insert(rememberedLevels).values({ id, ...incoming })
      },
      update: async () => {
        await tx
          .update(rememberedLevels)
          .set({ ...incoming, updatedAt: sql`now()` })
          .where(eq(rememberedLevels.id, id))
      },
      revive: async (kept) => {
        await tx
          .update(rememberedLevels)
          .set({ ...incoming, ...revived })
          .where(eq(rememberedLevels.id, kept))
      },
      discard: async (gone) => {
        await tx.update(rememberedLevels).set(deleted).where(eq(rememberedLevels.id, gone))
      },
    })
  },
  deleteOwners: (ctx, row) => characterRowOwners(ctx.tx, rememberedLevels, row.id),
  async remove(ctx, row) {
    const [gone] = await ctx.tx
      .update(rememberedLevels)
      .set(deleted)
      .where(
        and(
          eq(rememberedLevels.id, row.id),
          isNull(rememberedLevels.deletedAt),
          sql`${rememberedLevels.characterId} IN ${ownedCharacterIds(ctx.identity.nexonAccountId)}`,
        ),
      )
      .returning({ id: rememberedLevels.id })
    return gone?.id ?? null
  },
})

/** 사용자가 적은 MVP 등급. 메이플 ID · 시작 날짜마다 한 줄이고 표의 UNIQUE 가 지운 줄도 쥔다. */
export const mvpGradeHistoryTable = defineTable<MvpGradeHistoryRow, DeleteById>({
  upsertRow: mvpGradeHistoryRow,
  deleteRow: deleteById,
  upsertOwners: async (_ctx, row) => [mapleIdOwner(row.mapleId)],
  async upsert(ctx, row) {
    const { tx, identity } = ctx
    const { id, mapleId: mapleIdHash, ...values } = row
    const mapleId = await mapleIdRowFor(tx, identity.nexonAccountId, mapleIdHash)
    const incoming = { ...values, mapleId }
    const [existing] = await tx
      .select({
        row: getTableColumns(mvpGradeHistory),
        owned: sql<boolean>`${mvpGradeHistory.mapleId} IN ${ownedMapleIdRows(identity.nexonAccountId)}`,
      })
      .from(mvpGradeHistory)
      .where(eq(mvpGradeHistory.id, id))
    const [sameKey] = await tx
      .select()
      .from(mvpGradeHistory)
      .where(
        and(
          ne(mvpGradeHistory.id, id),
          eq(mvpGradeHistory.mapleId, mapleId),
          eq(mvpGradeHistory.fromDate, values.fromDate),
        ),
      )
    return writeDeviceRow({
      id,
      existing,
      sameKey,
      isSameContent: (other) => sameContent(other, incoming, ['gradeId']),
      insert: async () => {
        await tx.insert(mvpGradeHistory).values({ id, ...incoming })
      },
      update: async () => {
        await tx
          .update(mvpGradeHistory)
          .set({ ...incoming, updatedAt: sql`now()` })
          .where(eq(mvpGradeHistory.id, id))
      },
      revive: async (kept) => {
        await tx
          .update(mvpGradeHistory)
          .set({ ...incoming, ...revived })
          .where(eq(mvpGradeHistory.id, kept))
      },
      discard: async (gone) => {
        await tx.update(mvpGradeHistory).set(deleted).where(eq(mvpGradeHistory.id, gone))
      },
    })
  },
  deleteOwners: (ctx, row) => mapleIdRowOwners(ctx.tx, mvpGradeHistory, row.id),
  async remove(ctx, row) {
    const [gone] = await ctx.tx
      .update(mvpGradeHistory)
      .set(deleted)
      .where(
        and(
          eq(mvpGradeHistory.id, row.id),
          isNull(mvpGradeHistory.deletedAt),
          sql`${mvpGradeHistory.mapleId} IN ${ownedMapleIdRows(ctx.identity.nexonAccountId)}`,
        ),
      )
      .returning({ id: mvpGradeHistory.id })
    return gone?.id ?? null
  },
})

/** 그 ocid 의 캐릭터 줄. 메이플 ID 가 다르면 남의 캐릭터라 MapleIdNotOwned 다. */
async function characterByOcid(tx: Tx, mapleId: string, mapleIdHash: string, ocid: string) {
  const [row] = await tx
    .select({ id: characters.id, mapleId: characters.mapleId })
    .from(characters)
    .where(eq(characters.ocid, ocid))
  if (row !== undefined && row.mapleId !== mapleId) throw new MapleIdNotOwned(mapleIdHash)
  return row
}

/**
 * 월드 리프 한 번. 캐릭터 줄의 ocid 를 새 값으로 고치고 옛 값을 이 표에 적는다. 서버의 기록은 캐릭터 줄을 가리키므로 고칠 것이
 * 없다. 같은 옛 ocid 는 한 번만 옮겨 가서 표의 UNIQUE 가 지운 줄도 쥔다.
 *
 * 새 ocid 의 캐릭터 줄이 따로 이미 있으면 옛 줄은 두고 이 줄이 새 줄을 가리키게만 한다. 기기에서는 리프를 잇기 전에 새 ocid 의
 * 기록이 먼저 생기는 일이 흔하다. 옛 ocid 의 기록은 기기가 리프를 이은 뒤 새 ocid 로 옮겨 다시 올리고, 올리기가 받은 ocid 로
 * 캐릭터 줄을 다시 정하므로 그때 새 줄로 옮겨 간다. 겹친 기록은 기기가 옛 쪽을 지워 지우기로 온다.
 */
export const characterWorldLeapsTable = defineTable<CharacterWorldLeapRow, DeleteById>({
  upsertRow: characterWorldLeapRow,
  deleteRow: deleteById,
  upsertOwners: async (_ctx, row) => [mapleIdOwner(row.mapleId)],
  async upsert(ctx, row) {
    const { tx, identity } = ctx
    const { id, mapleId: mapleIdHash, previousOcid, ocid } = row
    if (previousOcid === ocid) throw new RecordRejected('옛 ocid 와 새 ocid 가 같다')
    const mapleId = await mapleIdRowFor(tx, identity.nexonAccountId, mapleIdHash)
    const [existing] = await tx
      .select({
        row: getTableColumns(characterWorldLeaps),
        owned: sql<boolean>`${characterWorldLeaps.characterId} IN ${ownedCharacterIds(identity.nexonAccountId)}`,
      })
      .from(characterWorldLeaps)
      .where(eq(characterWorldLeaps.id, id))
    const [sameKey] = await tx
      .select({ row: getTableColumns(characterWorldLeaps), ocid: characters.ocid })
      .from(characterWorldLeaps)
      .innerJoin(characters, eq(characters.id, characterWorldLeaps.characterId))
      .where(
        and(ne(characterWorldLeaps.id, id), eq(characterWorldLeaps.previousOcid, previousOcid)),
      )
    /**
     * 리프한 캐릭터 줄. 새 ocid 의 줄이 있으면 그 줄이고, 옛 ocid 의 줄만 있으면 그 줄의 ocid 를 고친다. 둘 다 없으면 새 ocid 의
     * 줄을 만든다.
     */
    const leapedCharacter = async (): Promise<string> => {
      const previous = await characterByOcid(tx, mapleId, mapleIdHash, previousOcid)
      const next = await characterByOcid(tx, mapleId, mapleIdHash, ocid)
      if (next !== undefined) return next.id
      if (previous === undefined) {
        return characterIdFor(tx, identity.nexonAccountId, mapleIdHash, ocid)
      }
      await tx
        .update(characters)
        .set({ ocid, updatedAt: sql`now()` })
        .where(eq(characters.id, previous.id))
      return previous.id
    }
    return writeDeviceRow({
      id,
      existing,
      sameKey: sameKey?.row,
      isSameContent: () => sameKey?.ocid === ocid,
      insert: async () => {
        await tx
          .insert(characterWorldLeaps)
          .values({ id, previousOcid, characterId: await leapedCharacter() })
      },
      update: async () => {
        await tx
          .update(characterWorldLeaps)
          .set({ previousOcid, characterId: await leapedCharacter(), updatedAt: sql`now()` })
          .where(eq(characterWorldLeaps.id, id))
      },
      revive: async (kept) => {
        await tx
          .update(characterWorldLeaps)
          .set({ characterId: await leapedCharacter(), ...revived })
          .where(eq(characterWorldLeaps.id, kept))
      },
      discard: async (gone) => {
        await tx.update(characterWorldLeaps).set(deleted).where(eq(characterWorldLeaps.id, gone))
      },
    })
  },
  deleteOwners: (ctx, row) => characterRowOwners(ctx.tx, characterWorldLeaps, row.id),
  async remove(ctx, row) {
    const [gone] = await ctx.tx
      .update(characterWorldLeaps)
      .set(deleted)
      .where(
        and(
          eq(characterWorldLeaps.id, row.id),
          isNull(characterWorldLeaps.deletedAt),
          sql`${characterWorldLeaps.characterId} IN ${ownedCharacterIds(ctx.identity.nexonAccountId)}`,
        ),
      )
      .returning({ id: characterWorldLeaps.id })
    return gone?.id ?? null
  },
})

/**
 * 수동 모드의 추적 항목. 기기에 id 가 없어 서버가 id 를 만들고, 캐릭터 · 종류 · 대상으로 같은 줄을 가리킨다. 다시 더하면 지운
 * 줄을 되살린다.
 */
export const manualTrackedItemsTable = defineTable<ManualTrackedItemRow, ManualTrackedItemRow>({
  upsertRow: manualTrackedItemRow,
  deleteRow: manualTrackedItemRow,
  upsertOwners: async (_ctx, row) => [mapleIdOwner(row.mapleId)],
  async upsert(ctx, row) {
    const { tx, identity } = ctx
    await assertTarget(tx, row.type === 'boss' ? bossDifficulties : contents, row.targetId)
    const characterId = await characterIdFor(tx, identity.nexonAccountId, row.mapleId, row.ocid)
    const [written] = await tx
      .insert(manualTrackedItems)
      .values({ characterId, type: row.type, targetId: row.targetId })
      .onConflictDoUpdate({
        target: [
          manualTrackedItems.characterId,
          manualTrackedItems.type,
          manualTrackedItems.targetId,
        ],
        set: revived,
      })
      .returning({ id: manualTrackedItems.id })
    return written.id
  },
  deleteOwners: async (_ctx, row) => [mapleIdOwner(row.mapleId)],
  async remove(ctx, row) {
    const characterId = await existingCharacterId(
      ctx.tx,
      ctx.identity.nexonAccountId,
      row.mapleId,
      row.ocid,
    )
    if (characterId === null) return null
    const [gone] = await ctx.tx
      .update(manualTrackedItems)
      .set(deleted)
      .where(
        and(
          eq(manualTrackedItems.characterId, characterId),
          eq(manualTrackedItems.type, row.type),
          eq(manualTrackedItems.targetId, row.targetId),
          isNull(manualTrackedItems.deletedAt),
        ),
      )
      .returning({ id: manualTrackedItems.id })
    return gone?.id ?? null
  },
})

/** 공유 컨텐츠 진행. 기기에 id 가 없어 메이플 ID · 월드 · 컨텐츠로 같은 줄을 가리키고 받은 값으로 덮는다. */
export const sharedContentProgressTable = defineTable<
  SharedContentProgressRow,
  DeleteSharedContentProgress
>({
  upsertRow: sharedContentProgressRow,
  deleteRow: deleteSharedContentProgress,
  upsertOwners: async (_ctx, row) => [mapleIdOwner(row.mapleId)],
  async upsert(ctx, row) {
    const { mapleId: mapleIdHash, ...values } = row
    const mapleId = await mapleIdRowFor(ctx.tx, ctx.identity.nexonAccountId, mapleIdHash)
    const content = omit(values, ['worldId', 'contentId'])
    const [written] = await ctx.tx
      .insert(sharedContentProgress)
      .values({ ...values, mapleId })
      .onConflictDoUpdate({
        target: [
          sharedContentProgress.mapleId,
          sharedContentProgress.worldId,
          sharedContentProgress.contentId,
        ],
        set: { ...content, ...revived },
      })
      .returning({ id: sharedContentProgress.id })
    return written.id
  },
  deleteOwners: async (_ctx, row) => [mapleIdOwner(row.mapleId)],
  async remove(ctx, row) {
    const mapleId = await mapleIdRowFor(ctx.tx, ctx.identity.nexonAccountId, row.mapleId)
    const [gone] = await ctx.tx
      .update(sharedContentProgress)
      .set(deleted)
      .where(
        and(
          eq(sharedContentProgress.mapleId, mapleId),
          sql`${sharedContentProgress.worldId} IS NOT DISTINCT FROM ${row.worldId}`,
          eq(sharedContentProgress.contentId, row.contentId),
          isNull(sharedContentProgress.deletedAt),
        ),
      )
      .returning({ id: sharedContentProgress.id })
    return gone?.id ?? null
  },
})

/** 메이플 ID 의 이름. 메이플 ID 마다 한 줄이라 그 메이플 ID 로 같은 줄을 가리킨다. 지우기는 기본 이름으로 되돌린 것이다. */
export const mapleIdNamesTable = defineTable<MapleIdNameRow, DeleteMapleIdName>({
  upsertRow: mapleIdNameRow,
  deleteRow: deleteMapleIdName,
  upsertOwners: async (_ctx, row) => [mapleIdOwner(row.mapleId)],
  async upsert(ctx, row) {
    const mapleId = await mapleIdRowFor(ctx.tx, ctx.identity.nexonAccountId, row.mapleId)
    const [written] = await ctx.tx
      .insert(mapleIdNames)
      .values({ mapleId, name: row.name })
      .onConflictDoUpdate({ target: mapleIdNames.mapleId, set: { name: row.name, ...revived } })
      .returning({ id: mapleIdNames.id })
    return written.id
  },
  deleteOwners: async (_ctx, row) => [mapleIdOwner(row.mapleId)],
  async remove(ctx, row) {
    const mapleId = await mapleIdRowFor(ctx.tx, ctx.identity.nexonAccountId, row.mapleId)
    const [gone] = await ctx.tx
      .update(mapleIdNames)
      .set(deleted)
      .where(and(eq(mapleIdNames.mapleId, mapleId), isNull(mapleIdNames.deletedAt)))
      .returning({ id: mapleIdNames.id })
    return gone?.id ?? null
  },
})

/** 대표 캐릭터의 행동과 표정. 캐릭터마다 한 줄이라 캐릭터로 같은 줄을 가리킨다. */
export const representativeCharacterMotionsTable = defineTable<
  RepresentativeCharacterMotionRow,
  DeleteByCharacter
>({
  upsertRow: representativeCharacterMotionRow,
  deleteRow: deleteByCharacter,
  upsertOwners: async (_ctx, row) => [mapleIdOwner(row.mapleId)],
  async upsert(ctx, row) {
    const { mapleId, ocid, ...values } = row
    const characterId = await characterIdFor(ctx.tx, ctx.identity.nexonAccountId, mapleId, ocid)
    const [written] = await ctx.tx
      .insert(representativeCharacterMotions)
      .values({ ...values, characterId })
      .onConflictDoUpdate({
        target: representativeCharacterMotions.characterId,
        set: { ...values, ...revived },
      })
      .returning({ id: representativeCharacterMotions.id })
    return written.id
  },
  deleteOwners: async (_ctx, row) => [mapleIdOwner(row.mapleId)],
  async remove(ctx, row) {
    const characterId = await existingCharacterId(
      ctx.tx,
      ctx.identity.nexonAccountId,
      row.mapleId,
      row.ocid,
    )
    if (characterId === null) return null
    const [gone] = await ctx.tx
      .update(representativeCharacterMotions)
      .set(deleted)
      .where(
        and(
          eq(representativeCharacterMotions.characterId, characterId),
          isNull(representativeCharacterMotions.deletedAt),
        ),
      )
      .returning({ id: representativeCharacterMotions.id })
    return gone?.id ?? null
  },
})

export const readEnhancementTotals: MapleIdReader = async (tx, owner, after, limit) => {
  const rows = await tx
    .select({ row: getTableColumns(enhancementTotals), ocid: characters.ocid })
    .from(enhancementTotals)
    .innerJoin(characters, eq(characters.id, enhancementTotals.characterId))
    .where(
      and(
        eq(characters.mapleId, owner.id),
        changedAfter(enhancementTotals.changeSeq, enhancementTotals.deletedAt, after),
      ),
    )
    .orderBy(asc(enhancementTotals.changeSeq))
    .limit(limit)
  return rows.map(({ row, ocid }) => ({
    table: 'enhancementTotals' as const,
    changeSeq: row.changeSeq,
    row: characterWire(row, owner.hash, ocid),
  }))
}

export const readRememberedLevels: MapleIdReader = async (tx, owner, after, limit) => {
  const rows = await tx
    .select({ row: getTableColumns(rememberedLevels), ocid: characters.ocid })
    .from(rememberedLevels)
    .innerJoin(characters, eq(characters.id, rememberedLevels.characterId))
    .where(
      and(
        eq(characters.mapleId, owner.id),
        changedAfter(rememberedLevels.changeSeq, rememberedLevels.deletedAt, after),
      ),
    )
    .orderBy(asc(rememberedLevels.changeSeq))
    .limit(limit)
  return rows.map(({ row, ocid }) => ({
    table: 'rememberedLevels' as const,
    changeSeq: row.changeSeq,
    row: characterWire(row, owner.hash, ocid),
  }))
}

export const readMvpGradeHistory: MapleIdReader = async (tx, owner, after, limit) => {
  const rows = await tx
    .select()
    .from(mvpGradeHistory)
    .where(
      and(
        eq(mvpGradeHistory.mapleId, owner.id),
        changedAfter(mvpGradeHistory.changeSeq, mvpGradeHistory.deletedAt, after),
      ),
    )
    .orderBy(asc(mvpGradeHistory.changeSeq))
    .limit(limit)
  return rows.map((row) => ({
    table: 'mvpGradeHistory' as const,
    changeSeq: row.changeSeq,
    row: mapleIdWire(row, owner.hash),
  }))
}

/** 리프는 옛 ocid 와 캐릭터 줄의 지금 ocid 를 싣는다. 이어진 리프는 모두 마지막 ocid 를 가리킨다. */
export const readCharacterWorldLeaps: MapleIdReader = async (tx, owner, after, limit) => {
  const rows = await tx
    .select({ row: getTableColumns(characterWorldLeaps), ocid: characters.ocid })
    .from(characterWorldLeaps)
    .innerJoin(characters, eq(characters.id, characterWorldLeaps.characterId))
    .where(
      and(
        eq(characters.mapleId, owner.id),
        changedAfter(characterWorldLeaps.changeSeq, characterWorldLeaps.deletedAt, after),
      ),
    )
    .orderBy(asc(characterWorldLeaps.changeSeq))
    .limit(limit)
  return rows.map(({ row, ocid }) => ({
    table: 'characterWorldLeaps' as const,
    changeSeq: row.changeSeq,
    row: characterWire(row, owner.hash, ocid),
  }))
}

export const readManualTrackedItems: MapleIdReader = async (tx, owner, after, limit) => {
  const rows = await tx
    .select({ row: getTableColumns(manualTrackedItems), ocid: characters.ocid })
    .from(manualTrackedItems)
    .innerJoin(characters, eq(characters.id, manualTrackedItems.characterId))
    .where(
      and(
        eq(characters.mapleId, owner.id),
        changedAfter(manualTrackedItems.changeSeq, manualTrackedItems.deletedAt, after),
      ),
    )
    .orderBy(asc(manualTrackedItems.changeSeq))
    .limit(limit)
  return rows.map(({ row, ocid }) => ({
    table: 'manualTrackedItems' as const,
    changeSeq: row.changeSeq,
    row: characterWire(row, owner.hash, ocid),
  }))
}

export const readSharedContentProgress: MapleIdReader = async (tx, owner, after, limit) => {
  const rows = await tx
    .select()
    .from(sharedContentProgress)
    .where(
      and(
        eq(sharedContentProgress.mapleId, owner.id),
        changedAfter(sharedContentProgress.changeSeq, sharedContentProgress.deletedAt, after),
      ),
    )
    .orderBy(asc(sharedContentProgress.changeSeq))
    .limit(limit)
  return rows.map((row) => ({
    table: 'sharedContentProgress' as const,
    changeSeq: row.changeSeq,
    row: mapleIdWire(row, owner.hash),
  }))
}

export const readMapleIdNames: MapleIdReader = async (tx, owner, after, limit) => {
  const rows = await tx
    .select()
    .from(mapleIdNames)
    .where(
      and(
        eq(mapleIdNames.mapleId, owner.id),
        changedAfter(mapleIdNames.changeSeq, mapleIdNames.deletedAt, after),
      ),
    )
    .orderBy(asc(mapleIdNames.changeSeq))
    .limit(limit)
  return rows.map((row) => ({
    table: 'mapleIdNames' as const,
    changeSeq: row.changeSeq,
    row: mapleIdWire(row, owner.hash),
  }))
}

export const readRepresentativeCharacterMotions: MapleIdReader = async (
  tx,
  owner,
  after,
  limit,
) => {
  const rows = await tx
    .select({ row: getTableColumns(representativeCharacterMotions), ocid: characters.ocid })
    .from(representativeCharacterMotions)
    .innerJoin(characters, eq(characters.id, representativeCharacterMotions.characterId))
    .where(
      and(
        eq(characters.mapleId, owner.id),
        changedAfter(
          representativeCharacterMotions.changeSeq,
          representativeCharacterMotions.deletedAt,
          after,
        ),
      ),
    )
    .orderBy(asc(representativeCharacterMotions.changeSeq))
    .limit(limit)
  return rows.map(({ row, ocid }) => ({
    table: 'representativeCharacterMotions' as const,
    changeSeq: row.changeSeq,
    row: characterWire(row, owner.hash, ocid),
  }))
}
