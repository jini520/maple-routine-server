import { and, asc, eq, getTableColumns, inArray, isNull, ne, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'

import {
  cashbookEntries,
  cashbookEntryExchangeInputs,
  cashbookEntryFragmentUses,
  cashbookEntryHuntInputs,
  cashbookEntryItems,
  cashbookEntryTransferInputs,
  cashbookItemTargetTypeEnum,
  cashbookItemTypes,
  characters,
  hexaCores,
  hexaStats,
  huntingGrounds,
  inventoryItems,
  items as itemRows,
  spendItems,
  symbols,
} from '../../../database/schema'
import { characterIdFor, mapleIdRowFor, ownedMapleIdRows } from '../../users/characters'
import type { Tx } from '../../users/nexon-account-store'
import { mapleIdRowOwners, mapleIdWire, omit } from '../row-owners'
import {
  type CashbookEntryRow,
  cashbookEntryRow,
  type DeleteById,
  deleteById,
  type InventoryItemRow,
  inventoryItemRow,
} from '../sync.dto'
import { changedAfter, defineTable, type MapleIdReader, mapleIdOwner } from '../sync-table'
import {
  assertTarget,
  RecordRejected,
  sameContent,
  type TargetTable,
  type WriteContext,
  writeDeviceRow,
} from '../sync-write'

/** 인벤토리 줄이 같은 기록인지 견주는 칸. 장비가 아닌 줄만 메이플 ID · 월드 · 아이템으로 가린다. */
const INVENTORY_CONTENT = ['cashbookItemTypeId', 'addedQuantity'] as const

/** 장비 종류의 key. 장비는 같은 아이템도 하나씩 따로라 유일 기준이 기록 id 다. */
const EQUIPMENT_TYPE_KEY = 'equipment'

/** 품목의 대상 종류가 가리키는 표 */
const ITEM_TARGET_TABLES = {
  hunting_ground: huntingGrounds,
  item: itemRows,
  spend_item: spendItems,
  symbol: symbols,
  hexa_core: hexaCores,
  hexa_stat: hexaStats,
} satisfies Record<(typeof cashbookItemTargetTypeEnum.enumValues)[number], TargetTable>

const CHILD_TABLES = [
  cashbookEntryItems,
  cashbookEntryHuntInputs,
  cashbookEntryTransferInputs,
  cashbookEntryExchangeInputs,
  cashbookEntryFragmentUses,
] as const

/** 메이플 ID 기록 한 줄에 삭제 표식을 적는다. 이미 지운 줄은 건드리지 않는다. 번호가 다시 오르면 받은 기기에 같은 표식이 또 간다. */
async function markMapleRowDeleted(
  ctx: WriteContext,
  table: typeof cashbookEntries | typeof inventoryItems,
  id: string,
): Promise<string | null> {
  const [gone] = await ctx.tx
    .update(table)
    .set({ deletedAt: sql`now()`, updatedAt: sql`now()` })
    .where(
      and(
        eq(table.id, id),
        isNull(table.deletedAt),
        sql`${table.mapleId} IN ${ownedMapleIdRows(ctx.identity.nexonAccountId)}`,
      ),
    )
    .returning({ id: table.id })
  return gone?.id ?? null
}

/**
 * 딸린 줄(품목 · 입력 · 조각 사용)을 받은 값으로 갈아 끼운다. 조각을 가져온 캐릭터는 기록과 같은 메이플 ID 다. 받는 캐릭터는 다른
 * 계정의 캐릭터일 수 있어 몸에 실은 메이플 ID 아래에서 찾는다.
 */
async function replaceEntryChildren(ctx: WriteContext, row: CashbookEntryRow): Promise<void> {
  const { tx, identity } = ctx
  const { id, mapleId, items, huntInput, transferInput, exchangeInput, fragmentUses } = row
  for (const table of CHILD_TABLES) await tx.delete(table).where(eq(table.entryId, id))
  await tx.insert(cashbookEntryItems).values(items.map((item) => ({ ...item, entryId: id })))
  if (huntInput !== null)
    await tx.insert(cashbookEntryHuntInputs).values({ ...huntInput, entryId: id })
  if (exchangeInput !== null) {
    await tx.insert(cashbookEntryExchangeInputs).values({ ...exchangeInput, entryId: id })
  }
  if (transferInput !== null) {
    const { receiverMapleId, receiverOcid, ...transfer } = transferInput
    const receiverCharacterId =
      receiverMapleId === null || receiverOcid === null
        ? null
        : await characterIdFor(tx, identity.nexonAccountId, receiverMapleId, receiverOcid)
    await tx
      .insert(cashbookEntryTransferInputs)
      .values({ ...transfer, receiverCharacterId, entryId: id })
  }
  for (const use of fragmentUses) {
    const { ocid, ...fragment } = use
    const characterId =
      ocid === null ? null : await characterIdFor(tx, identity.nexonAccountId, mapleId, ocid)
    await tx.insert(cashbookEntryFragmentUses).values({ ...fragment, characterId, entryId: id })
  }
}

/**
 * 가계부 기록과 딸린 줄. 손으로 적는 기록이라 내용으로 가리지 않고 기록 id 로만 가린다. 같은 날 같은 물건을 두 번 산 기록도 맞는
 * 기록이다. 캐릭터 기록이면 메이플 ID 를 캐릭터 줄에서 확인하고, 딸린 줄은 받을 때마다 갈아 끼운다. 품목의 대상 id 는 종류가 말하는
 * 표에 있어야 받는다. 대상 칸 하나가 여섯 표를 가리켜 DB 참조를 걸 수 없다.
 */
export const cashbookEntriesTable = defineTable<CashbookEntryRow, DeleteById>({
  upsertRow: cashbookEntryRow,
  deleteRow: deleteById,
  upsertOwners: async (_ctx, row) => [mapleIdOwner(row.mapleId)],
  async upsert(ctx, row) {
    const { tx, identity } = ctx
    const { id, mapleId: mapleIdHash, ocid, ...rest } = row
    for (const item of row.items) {
      if (item.targetType === null || item.targetId === null) continue
      await assertTarget(tx, ITEM_TARGET_TABLES[item.targetType], item.targetId)
    }
    const values = omit(rest, [
      'items',
      'huntInput',
      'transferInput',
      'exchangeInput',
      'fragmentUses',
    ])
    const mapleId = await mapleIdRowFor(tx, identity.nexonAccountId, mapleIdHash)
    const characterId =
      ocid === null ? null : await characterIdFor(tx, identity.nexonAccountId, mapleIdHash, ocid)
    const incoming = { ...values, mapleId, characterId }
    const [existing] = await tx
      .select({
        row: getTableColumns(cashbookEntries),
        owned: sql<boolean>`${cashbookEntries.mapleId} IN ${ownedMapleIdRows(identity.nexonAccountId)}`,
      })
      .from(cashbookEntries)
      .where(eq(cashbookEntries.id, id))
    const kept = await writeDeviceRow({
      id,
      existing,
      sameKey: undefined,
      isSameContent: () => false,
      insert: async () => {
        await tx.insert(cashbookEntries).values({ id, ...incoming })
      },
      update: async () => {
        await tx
          .update(cashbookEntries)
          .set({ ...incoming, updatedAt: sql`now()` })
          .where(eq(cashbookEntries.id, id))
      },
      revive: () => Promise.reject(new Error('가계부 기록은 내용으로 가리지 않는다')),
      discard: () => Promise.reject(new Error('가계부 기록은 내용으로 가리지 않는다')),
    })
    await replaceEntryChildren(ctx, row)
    return kept
  },
  deleteOwners: (ctx, row) => mapleIdRowOwners(ctx.tx, cashbookEntries, row.id),
  remove: (ctx, row) => markMapleRowDeleted(ctx, cashbookEntries, row.id),
})

/** 아이템 종류 줄이 장비인지. 표에 없는 종류면 코드 없이 거절한다. */
async function isEquipmentType(tx: Tx, typeId: string): Promise<boolean> {
  const [type] = await tx
    .select({ key: cashbookItemTypes.key })
    .from(cashbookItemTypes)
    .where(eq(cashbookItemTypes.id, typeId))
  if (type === undefined) throw new RecordRejected(`아이템 종류 표에 없는 줄이다: ${typeId}`)
  return type.key === EQUIPMENT_TYPE_KEY
}

/** 인벤토리에 넣은 아이템. 장비가 아니면 메이플 ID · 월드 · 아이템마다 한 줄이고 장비는 기록 id 로 가린다. */
export const inventoryItemsTable = defineTable<InventoryItemRow, DeleteById>({
  upsertRow: inventoryItemRow,
  deleteRow: deleteById,
  upsertOwners: async (_ctx, row) => [mapleIdOwner(row.mapleId)],
  async upsert(ctx, row) {
    const { tx, identity } = ctx
    const { id, mapleId: mapleIdHash, ...values } = row
    const mapleId = await mapleIdRowFor(tx, identity.nexonAccountId, mapleIdHash)
    const incoming = { ...values, mapleId }
    const [existing] = await tx
      .select({
        row: getTableColumns(inventoryItems),
        owned: sql<boolean>`${inventoryItems.mapleId} IN ${ownedMapleIdRows(identity.nexonAccountId)}`,
      })
      .from(inventoryItems)
      .where(eq(inventoryItems.id, id))
    const otherType = alias(cashbookItemTypes, 'other_type')
    const [sameKey] = (await isEquipmentType(tx, values.cashbookItemTypeId))
      ? []
      : await tx
          .select({ row: getTableColumns(inventoryItems) })
          .from(inventoryItems)
          .innerJoin(otherType, eq(otherType.id, inventoryItems.cashbookItemTypeId))
          .where(
            and(
              ne(inventoryItems.id, id),
              isNull(inventoryItems.deletedAt),
              eq(inventoryItems.mapleId, mapleId),
              eq(inventoryItems.worldId, values.worldId),
              eq(inventoryItems.itemId, values.itemId),
              ne(otherType.key, EQUIPMENT_TYPE_KEY),
            ),
          )
          .limit(1)
    return writeDeviceRow({
      id,
      existing,
      sameKey: sameKey?.row,
      isSameContent: (other) => sameContent(other, incoming, INVENTORY_CONTENT),
      insert: async () => {
        await tx.insert(inventoryItems).values({ id, ...incoming })
      },
      update: async () => {
        await tx
          .update(inventoryItems)
          .set({ ...incoming, updatedAt: sql`now()` })
          .where(eq(inventoryItems.id, id))
      },
      revive: () => Promise.reject(new Error('인벤토리의 유일 기준은 지운 줄을 빼고 견준다')),
      discard: async (gone) => {
        await markMapleRowDeleted(ctx, inventoryItems, gone)
      },
    })
  },
  deleteOwners: (ctx, row) => mapleIdRowOwners(ctx.tx, inventoryItems, row.id),
  remove: (ctx, row) => markMapleRowDeleted(ctx, inventoryItems, row.id),
})

/**
 * 가계부 기록을 딸린 줄과 함께 읽는다. 받는 캐릭터 · 조각을 가져온 캐릭터는 ocid 해시로 싣는다. 받는 캐릭터의 메이플 ID 를 싣지
 * 않는 것 말고는 올리기의 몸과 같은 꼴이다. 기기는 받는 캐릭터를 ocid 로만 둔다.
 */
export const readCashbookEntries: MapleIdReader = async (tx, owner, after, limit) => {
  const entries = await tx
    .select({ row: getTableColumns(cashbookEntries), ocid: characters.ocid })
    .from(cashbookEntries)
    .leftJoin(characters, eq(characters.id, cashbookEntries.characterId))
    .where(
      and(
        eq(cashbookEntries.mapleId, owner.id),
        changedAfter(cashbookEntries.changeSeq, cashbookEntries.deletedAt, after),
      ),
    )
    .orderBy(asc(cashbookEntries.changeSeq))
    .limit(limit)
  if (entries.length === 0) return []
  const ids = entries.map((entry) => entry.row.id)
  const receiver = alias(characters, 'receiver')
  const [items, hunts, transfers, exchanges, uses] = await Promise.all([
    tx.select().from(cashbookEntryItems).where(inArray(cashbookEntryItems.entryId, ids)),
    tx.select().from(cashbookEntryHuntInputs).where(inArray(cashbookEntryHuntInputs.entryId, ids)),
    tx
      .select({ row: getTableColumns(cashbookEntryTransferInputs), receiverOcid: receiver.ocid })
      .from(cashbookEntryTransferInputs)
      .leftJoin(receiver, eq(receiver.id, cashbookEntryTransferInputs.receiverCharacterId))
      .where(inArray(cashbookEntryTransferInputs.entryId, ids)),
    tx
      .select()
      .from(cashbookEntryExchangeInputs)
      .where(inArray(cashbookEntryExchangeInputs.entryId, ids)),
    tx
      .select({ row: getTableColumns(cashbookEntryFragmentUses), ocid: characters.ocid })
      .from(cashbookEntryFragmentUses)
      .leftJoin(characters, eq(characters.id, cashbookEntryFragmentUses.characterId))
      .where(inArray(cashbookEntryFragmentUses.entryId, ids)),
  ])
  return entries.map(({ row, ocid }) => {
    const child = <T extends { id: string; entryId: string }>(rows: T[]) =>
      rows.filter((r) => r.entryId === row.id).map((r) => omit(r, ['id', 'entryId']))
    const transfer = transfers.find((t) => t.row.entryId === row.id)
    return {
      table: 'cashbookEntries' as const,
      changeSeq: row.changeSeq,
      row: {
        ...mapleIdWire(omit(row, ['characterId']), owner.hash),
        ocid,
        items: child(items),
        huntInput: child(hunts)[0] ?? null,
        transferInput:
          transfer === undefined
            ? null
            : {
                ...omit(transfer.row, ['id', 'entryId', 'receiverCharacterId']),
                receiverOcid: transfer.receiverOcid,
              },
        exchangeInput: child(exchanges)[0] ?? null,
        fragmentUses: uses
          .filter((u) => u.row.entryId === row.id)
          .map((u) => ({ ...omit(u.row, ['id', 'entryId', 'characterId']), ocid: u.ocid })),
      },
    }
  })
}

export const readInventoryItems: MapleIdReader = async (tx, owner, after, limit) => {
  const rows = await tx
    .select()
    .from(inventoryItems)
    .where(
      and(
        eq(inventoryItems.mapleId, owner.id),
        changedAfter(inventoryItems.changeSeq, inventoryItems.deletedAt, after),
      ),
    )
    .orderBy(asc(inventoryItems.changeSeq))
    .limit(limit)
  return rows.map((row) => ({
    table: 'inventoryItems' as const,
    changeSeq: row.changeSeq,
    row: mapleIdWire(row, owner.hash),
  }))
}
