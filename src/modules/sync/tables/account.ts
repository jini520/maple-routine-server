import { and, asc, eq, getTableColumns, inArray, isNull, sql } from 'drizzle-orm'

import {
  accountSettings,
  bossProfitCalculatorRecordBosses,
  bossProfitCalculatorRecordCharacters,
  bossProfitCalculatorRecords,
  bottomBarSubPageOrders,
  characters,
  enhancementSettledDays,
  mapleIds,
  partyAppointmentBosses,
  partyAppointmentExceptions,
  partyAppointments,
  trackedCharacters,
} from '../../../database/schema'
import { characterIdFor, mapleIdRowFor } from '../../users/characters'
import type { Tx } from '../../users/nexon-account-store'
import { existingCharacterId, omit } from '../row-owners'
import {
  type AccountSettingsRow,
  accountSettingsRow,
  type BossProfitCalculatorRecordRow,
  bossProfitCalculatorRecordRow,
  type BottomBarSubPageOrderRow,
  bottomBarSubPageOrderRow,
  type DeleteByCharacter,
  deleteByCharacter,
  type DeleteById,
  deleteById,
  type EnhancementSettledDayRow,
  enhancementSettledDayRow,
  type PartyAppointmentRow,
  partyAppointmentRow,
  type TrackedCharacterRow,
  trackedCharacterRow,
} from '../sync.dto'
import {
  changedAfter,
  defineTable,
  type MapleIdReader,
  mapleIdOwner,
  type NexonAccountReader,
  nexonAccountOwner,
} from '../sync-table'
import { type WriteContext, writeDeviceRow } from '../sync-write'

const deleted = { deletedAt: sql`now()`, updatedAt: sql`now()` }
const revived = { deletedAt: null, updatedAt: sql`now()` }

/** 사람마다 하나인 설정. 실은 칸만 고친다. 두 기기가 다른 설정을 고쳐도 서로를 덮지 않게 하려는 것이다. 지우기가 없다. */
export const accountSettingsTable = defineTable<AccountSettingsRow, never>({
  upsertRow: accountSettingsRow,
  deleteRow: null,
  upsertOwners: async (ctx) => [nexonAccountOwner(ctx)],
  async upsert(ctx, row) {
    const given = Object.fromEntries(
      Object.entries(row).filter(([, value]) => value !== undefined),
    ) as AccountSettingsRow
    const [written] = await ctx.tx
      .insert(accountSettings)
      .values({ ...given, nexonAccountId: ctx.identity.nexonAccountId })
      .onConflictDoUpdate({
        target: accountSettings.nexonAccountId,
        set: { ...given, updatedAt: sql`now()` },
      })
      .returning({ id: accountSettings.id })
    return written.id
  },
})

/** 하단바 그룹 하나의 하위 페이지 차례. 넥슨 계정 · 그룹으로 같은 줄을 가리키고 덮는다. 지우기가 없다. */
export const bottomBarSubPageOrdersTable = defineTable<BottomBarSubPageOrderRow, never>({
  upsertRow: bottomBarSubPageOrderRow,
  deleteRow: null,
  upsertOwners: async (ctx) => [nexonAccountOwner(ctx)],
  async upsert(ctx, row) {
    const [written] = await ctx.tx
      .insert(bottomBarSubPageOrders)
      .values({ ...row, nexonAccountId: ctx.identity.nexonAccountId })
      .onConflictDoUpdate({
        target: [bottomBarSubPageOrders.nexonAccountId, bottomBarSubPageOrders.groupKey],
        set: { subPageKeys: row.subPageKeys, updatedAt: sql`now()` },
      })
      .returning({ id: bottomBarSubPageOrders.id })
    return written.id
  },
})

/** 추적하는 캐릭터. 넥슨 계정 · 캐릭터로 같은 줄을 가리키고 덮는다. 다시 더하면 지운 줄을 되살린다. */
export const trackedCharactersTable = defineTable<TrackedCharacterRow, DeleteByCharacter>({
  upsertRow: trackedCharacterRow,
  deleteRow: deleteByCharacter,
  upsertOwners: async (ctx) => [nexonAccountOwner(ctx)],
  async upsert(ctx, row) {
    const { mapleId, ocid, ...values } = row
    const characterId = await characterIdFor(ctx.tx, ctx.identity.nexonAccountId, mapleId, ocid)
    const [written] = await ctx.tx
      .insert(trackedCharacters)
      .values({ ...values, characterId, nexonAccountId: ctx.identity.nexonAccountId })
      .onConflictDoUpdate({
        target: [trackedCharacters.nexonAccountId, trackedCharacters.characterId],
        set: { ...values, ...revived },
      })
      .returning({ id: trackedCharacters.id })
    return written.id
  },
  deleteOwners: async (ctx) => [nexonAccountOwner(ctx)],
  async remove(ctx, row) {
    const characterId = await existingCharacterId(
      ctx.tx,
      ctx.identity.nexonAccountId,
      row.mapleId,
      row.ocid,
    )
    if (characterId === null) return null
    const [gone] = await ctx.tx
      .update(trackedCharacters)
      .set(deleted)
      .where(
        and(
          eq(trackedCharacters.nexonAccountId, ctx.identity.nexonAccountId),
          eq(trackedCharacters.characterId, characterId),
          isNull(trackedCharacters.deletedAt),
        ),
      )
      .returning({ id: trackedCharacters.id })
    return gone?.id ?? null
  },
})

/** 넥슨 계정이 주인인 기록 한 줄에 삭제 표식을 적는다. 딸린 줄은 주인 줄과 함께 남는다. */
async function markAccountRowDeleted(
  ctx: WriteContext,
  table: typeof partyAppointments | typeof bossProfitCalculatorRecords,
  id: string,
): Promise<string | null> {
  const [gone] = await ctx.tx
    .update(table)
    .set(deleted)
    .where(
      and(
        eq(table.id, id),
        isNull(table.deletedAt),
        eq(table.nexonAccountId, ctx.identity.nexonAccountId),
      ),
    )
    .returning({ id: table.id })
  return gone?.id ?? null
}

/** 약속이나 그 주의 예외에서 도는 보스들을 적는다. 캐릭터는 메이플 ID · ocid 해시로 찾고 없으면 만든다. */
async function insertAppointmentBosses(
  ctx: WriteContext,
  appointmentId: string,
  exceptionId: string | null,
  bosses: PartyAppointmentRow['bosses'],
): Promise<void> {
  for (const { mapleId, ocid, ...boss } of bosses) {
    const characterId = await characterIdFor(ctx.tx, ctx.identity.nexonAccountId, mapleId, ocid)
    await ctx.tx
      .insert(partyAppointmentBosses)
      .values({ ...boss, characterId, appointmentId, exceptionId })
  }
}

/** 파티 약속. 손으로 적는 기록이라 기록 id 로만 가리고, 보스와 주별 예외는 받을 때마다 갈아 끼운다. */
export const partyAppointmentsTable = defineTable<PartyAppointmentRow, DeleteById>({
  upsertRow: partyAppointmentRow,
  deleteRow: deleteById,
  upsertOwners: async (ctx) => [nexonAccountOwner(ctx)],
  async upsert(ctx, row) {
    const { tx, identity } = ctx
    const { id, bosses, exceptions, ...values } = row
    const incoming = { ...values, nexonAccountId: identity.nexonAccountId }
    const [existing] = await tx
      .select({
        row: getTableColumns(partyAppointments),
        owned: sql<boolean>`${partyAppointments.nexonAccountId} = ${identity.nexonAccountId}`,
      })
      .from(partyAppointments)
      .where(eq(partyAppointments.id, id))
    const kept = await writeDeviceRow({
      id,
      existing,
      sameKey: undefined,
      isSameContent: () => false,
      insert: async () => {
        await tx.insert(partyAppointments).values({ id, ...incoming })
      },
      update: async () => {
        await tx
          .update(partyAppointments)
          .set({ ...incoming, updatedAt: sql`now()` })
          .where(eq(partyAppointments.id, id))
      },
      revive: () => Promise.reject(new Error('약속은 내용으로 가리지 않는다')),
      discard: () => Promise.reject(new Error('약속은 내용으로 가리지 않는다')),
    })
    // 예외를 지우면 그 예외의 보스도 함께 지워진다.
    await tx.delete(partyAppointmentBosses).where(eq(partyAppointmentBosses.appointmentId, id))
    await tx
      .delete(partyAppointmentExceptions)
      .where(eq(partyAppointmentExceptions.appointmentId, id))
    await insertAppointmentBosses(ctx, id, null, bosses)
    for (const { bosses: exceptionBosses, ...exception } of exceptions) {
      const [written] = await tx
        .insert(partyAppointmentExceptions)
        .values({ ...exception, appointmentId: id })
        .returning({ id: partyAppointmentExceptions.id })
      await insertAppointmentBosses(ctx, id, written.id, exceptionBosses)
    }
    return kept
  },
  deleteOwners: async (ctx) => [nexonAccountOwner(ctx)],
  remove: (ctx, row) => markAccountRowDeleted(ctx, partyAppointments, row.id),
})

/** 계산기 기록. 손으로 저장하는 기록이라 기록 id 로만 가리고, 캐릭터와 보스는 받을 때마다 갈아 끼운다. */
export const bossProfitCalculatorRecordsTable = defineTable<
  BossProfitCalculatorRecordRow,
  DeleteById
>({
  upsertRow: bossProfitCalculatorRecordRow,
  deleteRow: deleteById,
  upsertOwners: async (ctx) => [nexonAccountOwner(ctx)],
  async upsert(ctx, row) {
    const { tx, identity } = ctx
    const { id, characters: recordCharacters, savedAt } = row
    const incoming = { savedAt, nexonAccountId: identity.nexonAccountId }
    const [existing] = await tx
      .select({
        row: getTableColumns(bossProfitCalculatorRecords),
        owned: sql<boolean>`${bossProfitCalculatorRecords.nexonAccountId} = ${identity.nexonAccountId}`,
      })
      .from(bossProfitCalculatorRecords)
      .where(eq(bossProfitCalculatorRecords.id, id))
    const kept = await writeDeviceRow({
      id,
      existing,
      sameKey: undefined,
      isSameContent: () => false,
      insert: async () => {
        await tx.insert(bossProfitCalculatorRecords).values({ id, ...incoming })
      },
      update: async () => {
        await tx
          .update(bossProfitCalculatorRecords)
          .set({ ...incoming, updatedAt: sql`now()` })
          .where(eq(bossProfitCalculatorRecords.id, id))
      },
      revive: () => Promise.reject(new Error('계산기 기록은 내용으로 가리지 않는다')),
      discard: () => Promise.reject(new Error('계산기 기록은 내용으로 가리지 않는다')),
    })
    // 캐릭터 줄을 지우면 그 캐릭터의 보스도 함께 지워진다.
    await tx
      .delete(bossProfitCalculatorRecordCharacters)
      .where(eq(bossProfitCalculatorRecordCharacters.recordId, id))
    for (const { mapleId, ocid, bosses, sortOrder } of recordCharacters) {
      const characterId = await characterIdFor(tx, identity.nexonAccountId, mapleId, ocid)
      const [written] = await tx
        .insert(bossProfitCalculatorRecordCharacters)
        .values({ recordId: id, sortOrder, characterId })
        .returning({ id: bossProfitCalculatorRecordCharacters.id })
      if (bosses.length > 0) {
        await tx
          .insert(bossProfitCalculatorRecordBosses)
          .values(bosses.map((boss) => ({ ...boss, recordCharacterId: written.id })))
      }
    }
    return kept
  },
  deleteOwners: async (ctx) => [nexonAccountOwner(ctx)],
  remove: (ctx, row) => markAccountRowDeleted(ctx, bossProfitCalculatorRecords, row.id),
})

/** 그 메이플 ID 가 달린 넥슨 계정의 메이플 ID 전부. 굳은 날은 넥슨 계정의 것이라 그 계정의 메이플 ID 를 모두 잠근다. */
async function accountMapleIdHashes(tx: Tx, mapleIdHash: string): Promise<string[]> {
  const result = await tx.execute<{ hash: string }>(sql`
    SELECT o.hash FROM ${mapleIds} m JOIN ${mapleIds} o ON o.nexon_account_id = m.nexon_account_id
     WHERE m.hash = ${mapleIdHash}`)
  return result.rows.map((row) => row.hash)
}

/**
 * 강화 내역을 넥슨 계정이 다 받은 날. 넥슨 계정은 그 계정의 메이플 ID 하나로 찾는다. 같은 날은 같은 사실이라 살아 있는 줄이
 * 있으면 그 줄을 두고, 데이터 삭제로 지운 줄이면 되살린다. 받기는 그 계정의 메이플 ID 마다 이 줄을 싣는다. 기기는 다 받은 날을
 * 하루씩 지우지 않아 지우기는 받지 않는다.
 */
export const enhancementSettledDaysTable = defineTable<EnhancementSettledDayRow, never>({
  upsertRow: enhancementSettledDayRow,
  deleteRow: null,
  upsertOwners: async (ctx, row) =>
    (await accountMapleIdHashes(ctx.tx, row.mapleId)).map(mapleIdOwner),
  async upsert(ctx, row) {
    const { tx, identity } = ctx
    const mapleId = await mapleIdRowFor(tx, identity.nexonAccountId, row.mapleId)
    const [account] = await tx
      .select({ nexonAccountId: mapleIds.nexonAccountId })
      .from(mapleIds)
      .where(eq(mapleIds.id, mapleId))
    const key = {
      nexonAccountId: account.nexonAccountId,
      apiType: row.apiType,
      historyDate: row.historyDate,
    }
    await tx
      .insert(enhancementSettledDays)
      .values(key)
      .onConflictDoUpdate({
        target: [
          enhancementSettledDays.nexonAccountId,
          enhancementSettledDays.apiType,
          enhancementSettledDays.historyDate,
        ],
        set: revived,
        // 살아 있는 줄은 고치지 않는다. 고치면 변경 번호가 올라 같은 날을 모든 기기가 다시 받는다.
        setWhere: sql`${enhancementSettledDays.deletedAt} IS NOT NULL`,
      })
    const [written] = await tx
      .select({ id: enhancementSettledDays.id })
      .from(enhancementSettledDays)
      .where(
        and(
          eq(enhancementSettledDays.nexonAccountId, key.nexonAccountId),
          eq(enhancementSettledDays.apiType, key.apiType),
          eq(enhancementSettledDays.historyDate, key.historyDate),
        ),
      )
    return written.id
  },
})

/** 굳은 날을 그 메이플 ID 가 달린 넥슨 계정에서 읽는다. 응답에는 그 메이플 ID 해시를 싣는다. */
export const readEnhancementSettledDays: MapleIdReader = async (tx, owner, after, limit) => {
  const rows = await tx
    .select(getTableColumns(enhancementSettledDays))
    .from(enhancementSettledDays)
    .innerJoin(mapleIds, eq(mapleIds.nexonAccountId, enhancementSettledDays.nexonAccountId))
    .where(
      and(
        eq(mapleIds.id, owner.id),
        changedAfter(enhancementSettledDays.changeSeq, enhancementSettledDays.deletedAt, after),
      ),
    )
    .orderBy(asc(enhancementSettledDays.changeSeq))
    .limit(limit)
  return rows.map((row) => ({
    table: 'enhancementSettledDays' as const,
    changeSeq: row.changeSeq,
    row: { ...omit(row, ['nexonAccountId']), mapleId: owner.hash },
  }))
}

export const readAccountSettings: NexonAccountReader = async (tx, nexonAccountId, after, limit) => {
  const rows = await tx
    .select()
    .from(accountSettings)
    .where(
      and(
        eq(accountSettings.nexonAccountId, nexonAccountId),
        changedAfter(accountSettings.changeSeq, null, after),
      ),
    )
    .orderBy(asc(accountSettings.changeSeq))
    .limit(limit)
  return rows.map((row) => ({
    table: 'accountSettings' as const,
    changeSeq: row.changeSeq,
    row: omit(row, ['nexonAccountId']),
  }))
}

export const readBottomBarSubPageOrders: NexonAccountReader = async (
  tx,
  nexonAccountId,
  after,
  limit,
) => {
  const rows = await tx
    .select()
    .from(bottomBarSubPageOrders)
    .where(
      and(
        eq(bottomBarSubPageOrders.nexonAccountId, nexonAccountId),
        changedAfter(bottomBarSubPageOrders.changeSeq, null, after),
      ),
    )
    .orderBy(asc(bottomBarSubPageOrders.changeSeq))
    .limit(limit)
  return rows.map((row) => ({
    table: 'bottomBarSubPageOrders' as const,
    changeSeq: row.changeSeq,
    row: omit(row, ['nexonAccountId']),
  }))
}

/** 캐릭터 줄 id 를 메이플 ID 해시 · ocid 해시로 푸는 짝. 사람의 기록은 여러 메이플 ID 의 캐릭터를 가리킨다. */
const characterHashes = {
  mapleId: mapleIds.hash,
  ocid: characters.ocid,
}

export const readTrackedCharacters: NexonAccountReader = async (
  tx,
  nexonAccountId,
  after,
  limit,
) => {
  const rows = await tx
    .select({ row: getTableColumns(trackedCharacters), ...characterHashes })
    .from(trackedCharacters)
    .innerJoin(characters, eq(characters.id, trackedCharacters.characterId))
    .innerJoin(mapleIds, eq(mapleIds.id, characters.mapleId))
    .where(
      and(
        eq(trackedCharacters.nexonAccountId, nexonAccountId),
        changedAfter(trackedCharacters.changeSeq, trackedCharacters.deletedAt, after),
      ),
    )
    .orderBy(asc(trackedCharacters.changeSeq))
    .limit(limit)
  return rows.map(({ row, mapleId, ocid }) => ({
    table: 'trackedCharacters' as const,
    changeSeq: row.changeSeq,
    row: { ...omit(row, ['nexonAccountId', 'characterId']), mapleId, ocid },
  }))
}

/** 약속을 보스 · 예외와 함께 읽는다. 올리기의 몸과 같은 꼴이다. */
export const readPartyAppointments: NexonAccountReader = async (
  tx,
  nexonAccountId,
  after,
  limit,
) => {
  const rows = await tx
    .select()
    .from(partyAppointments)
    .where(
      and(
        eq(partyAppointments.nexonAccountId, nexonAccountId),
        changedAfter(partyAppointments.changeSeq, partyAppointments.deletedAt, after),
      ),
    )
    .orderBy(asc(partyAppointments.changeSeq))
    .limit(limit)
  if (rows.length === 0) return []
  const ids = rows.map((row) => row.id)
  const exceptions = await tx
    .select()
    .from(partyAppointmentExceptions)
    .where(inArray(partyAppointmentExceptions.appointmentId, ids))
  const bosses = await tx
    .select({ row: getTableColumns(partyAppointmentBosses), ...characterHashes })
    .from(partyAppointmentBosses)
    .innerJoin(characters, eq(characters.id, partyAppointmentBosses.characterId))
    .innerJoin(mapleIds, eq(mapleIds.id, characters.mapleId))
    .where(inArray(partyAppointmentBosses.appointmentId, ids))
    .orderBy(asc(partyAppointmentBosses.sortOrder))
  const bossesOf = (appointmentId: string, exceptionId: string | null) =>
    bosses
      .filter(
        (boss) => boss.row.appointmentId === appointmentId && boss.row.exceptionId === exceptionId,
      )
      .map(({ row, mapleId, ocid }) => ({
        sortOrder: row.sortOrder,
        bossDifficultyId: row.bossDifficultyId,
        mapleId,
        ocid,
      }))
  return rows.map((row) => ({
    table: 'partyAppointments' as const,
    changeSeq: row.changeSeq,
    row: {
      ...omit(row, ['nexonAccountId']),
      bosses: bossesOf(row.id, null),
      exceptions: exceptions
        .filter((exception) => exception.appointmentId === row.id)
        .map((exception) => ({
          ...omit(exception, ['id', 'appointmentId']),
          bosses: bossesOf(row.id, exception.id),
        })),
    },
  }))
}

/** 계산기 기록을 캐릭터 · 보스와 함께 읽는다. 올리기의 몸과 같은 꼴이다. */
export const readBossProfitCalculatorRecords: NexonAccountReader = async (
  tx,
  nexonAccountId,
  after,
  limit,
) => {
  const rows = await tx
    .select()
    .from(bossProfitCalculatorRecords)
    .where(
      and(
        eq(bossProfitCalculatorRecords.nexonAccountId, nexonAccountId),
        changedAfter(
          bossProfitCalculatorRecords.changeSeq,
          bossProfitCalculatorRecords.deletedAt,
          after,
        ),
      ),
    )
    .orderBy(asc(bossProfitCalculatorRecords.changeSeq))
    .limit(limit)
  if (rows.length === 0) return []
  const recordCharacters = await tx
    .select({ row: getTableColumns(bossProfitCalculatorRecordCharacters), ...characterHashes })
    .from(bossProfitCalculatorRecordCharacters)
    .innerJoin(characters, eq(characters.id, bossProfitCalculatorRecordCharacters.characterId))
    .innerJoin(mapleIds, eq(mapleIds.id, characters.mapleId))
    .where(
      inArray(
        bossProfitCalculatorRecordCharacters.recordId,
        rows.map((row) => row.id),
      ),
    )
    .orderBy(asc(bossProfitCalculatorRecordCharacters.sortOrder))
  const bosses =
    recordCharacters.length === 0
      ? []
      : await tx
          .select()
          .from(bossProfitCalculatorRecordBosses)
          .where(
            inArray(
              bossProfitCalculatorRecordBosses.recordCharacterId,
              recordCharacters.map((character) => character.row.id),
            ),
          )
  return rows.map((row) => ({
    table: 'bossProfitCalculatorRecords' as const,
    changeSeq: row.changeSeq,
    row: {
      ...omit(row, ['nexonAccountId']),
      characters: recordCharacters
        .filter((character) => character.row.recordId === row.id)
        .map(({ row: character, mapleId, ocid }) => ({
          sortOrder: character.sortOrder,
          mapleId,
          ocid,
          bosses: bosses
            .filter((boss) => boss.recordCharacterId === character.id)
            .map((boss) => omit(boss, ['id', 'recordCharacterId'])),
        })),
    },
  }))
}
