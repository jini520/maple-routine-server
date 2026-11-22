import { Inject, Injectable } from '@nestjs/common'
import { and, asc, eq, getTableColumns, gt, inArray, sql } from 'drizzle-orm'

import { DB, type Db } from '../../database/database.module'
import { bossProfitEntries, characters, inventoryItems, mapleIds } from '../../database/schema'
import type { IdentityContext } from '../identity/identity.guard'
import { ownedMapleIds } from '../users/maple-id-ownership'
import type { Tx } from '../users/nexon-account-store'
import { lockOwners } from '../users/owner-locks'
import { DeletedRowsRepository } from './deleted-rows.repository'
import { characterWire, mapleIdWire, omit } from './row-owners'
import { type PullBody, SYNC_TABLE_NAMES, type SyncTableName } from './sync.dto'
import { type MapleIdOwner, mapleIdOwner, type PulledRow } from './sync-table'
import { MAPLE_ID_READERS, NEXON_ACCOUNT_READERS } from './tables'

/** 한 번의 받기에 싣는 줄 수. 딸린 줄은 세지 않는다. 더 있으면 hasMore 를 켜고 기기가 이어서 받는다. */
export const PULL_ROW_LIMIT = 500

/** 받기 응답 */
export interface PullResponse {
  /** 이 신원이 쓸 수 있는 메이플 ID 해시 전부. 자기 것과 로그인에 등록된 부계정의 것이다. */
  mapleIds: string[]
  /** 다음 받기에 보낼 번호. 다 받은 주인은 순번의 지금 값이라 바뀐 것이 없어도 번호가 오른다. */
  cursors: {
    nexonAccount: { id: string; changeSeq: number }
    mapleIds: Record<string, number>
  }
  /** 서버 전체에 남은 삭제 표식 가운데 가장 작은 변경 번호. 표식이 없으면 null 이다. */
  oldestDeletedChangeSeq: number | null
  /** 상한에 닿아 다 싣지 못한 주인이 있다. */
  hasMore: boolean
  /** 표마다 바뀐 줄. 줄이 있는 표만 SYNC_TABLE_NAMES 의 차례로 싣는다. 지운 줄은 deletedAt 이 차 있다. */
  records: Partial<Record<SyncTableName, Record<string, unknown>[]>>
}

/** 지금까지 나눠 준 변경 번호의 끝. 순번을 아직 한 번도 쓰지 않았으면 0 이다. 처음 값 1 은 아직 어느 줄에도 없다. */
async function currentChangeSeq(tx: Tx): Promise<number> {
  const result = await tx.execute<{ seq: string }>(
    sql`SELECT CASE WHEN is_called THEN last_value ELSE 0 END AS seq FROM record_change_seq`,
  )
  return Number(result.rows[0]?.seq ?? 0)
}

/** 이 신원이 쓸 수 있는 메이플 ID 줄. 해시 차례로 읽어 응답이 늘 같은 차례다. */
function ownedMapleIdRows(tx: Tx, nexonAccountId: string): Promise<MapleIdOwner[]> {
  return tx
    .select({ id: mapleIds.id, hash: mapleIds.hash })
    .from(mapleIds)
    .where(sql`${mapleIds.hash} IN ${ownedMapleIds(nexonAccountId)}`)
    .orderBy(asc(mapleIds.hash))
}

/**
 * 이 쪽에 실은 줄이 가리키는데 싣지 않은 줄을 더한다. 드롭의 수익 건과 가계부 품목의 인벤토리 줄이다. 가리키는 줄이 나중에
 * 고쳐져 번호가 이 쪽 뒤에 있으면, 기기는 가리키는 줄 없이 받은 줄을 넣지 못한다. 더한 줄은 그 번호의 쪽에서 한 번 더 온다.
 * 지운 줄을 가리키는 살아 있는 줄은 없어 살아 있는 줄만 본다.
 */
async function attachReferenced(
  tx: Tx,
  owner: MapleIdOwner,
  after: number,
  rows: PulledRow[],
): Promise<PulledRow[]> {
  const delivered = (table: SyncTableName) =>
    new Set(rows.filter((row) => row.table === table).map((row) => row.row.id as string))
  const live = rows.filter((row) => row.row.deletedAt === null)
  const entries = delivered('bossProfitEntries')
  const entryIds = [
    ...new Set(
      live
        .filter((row) => row.table === 'bossDrops')
        .map((row) => row.row.profitEntryId as string)
        .filter((id) => !entries.has(id)),
    ),
  ]
  const inventory = delivered('inventoryItems')
  const inventoryIds = [
    ...new Set(
      live
        .filter((row) => row.table === 'cashbookEntries')
        .flatMap((row) => row.row.items as { inventoryItemId: string | null }[])
        .map((item) => item.inventoryItemId)
        .filter((id): id is string => id !== null && !inventory.has(id)),
    ),
  ]
  const extra: PulledRow[] = []
  if (entryIds.length > 0) {
    const found = await tx
      .select({ row: getTableColumns(bossProfitEntries), ocid: characters.ocid })
      .from(bossProfitEntries)
      .innerJoin(characters, eq(characters.id, bossProfitEntries.characterId))
      .where(
        and(
          inArray(bossProfitEntries.id, entryIds),
          eq(characters.mapleId, owner.id),
          gt(bossProfitEntries.changeSeq, after),
        ),
      )
    for (const { row, ocid } of found) {
      extra.push({
        table: 'bossProfitEntries',
        changeSeq: row.changeSeq,
        row: characterWire(omit(row, ['bossId']), owner.hash, ocid),
      })
    }
  }
  if (inventoryIds.length > 0) {
    const found = await tx
      .select()
      .from(inventoryItems)
      .where(
        and(
          inArray(inventoryItems.id, inventoryIds),
          eq(inventoryItems.mapleId, owner.id),
          gt(inventoryItems.changeSeq, after),
        ),
      )
    for (const row of found) {
      extra.push({
        table: 'inventoryItems',
        changeSeq: row.changeSeq,
        row: mapleIdWire(row, owner.hash),
      })
    }
  }
  return extra
}

/**
 * 동기화의 받기. 주인(사람과 메이플 ID)마다 기기가 보낸 번호보다 큰 줄을 번호 차례로 돌려준다. 사람 먼저, 메이플 ID 는 해시
 * 차례다. 한 번에 PULL_ROW_LIMIT 줄까지 싣고 상한에 닿은 주인은 마지막으로 실은 줄의 번호를 돌려준다.
 *
 * 주인들의 잠금을 함께 쥐고 읽는다. 도는 쓰기가 끝난 뒤에 읽고 읽는 동안 새 쓰기를 세우므로, 다 읽은 주인에게 순번의 지금
 * 값을 돌려줄 수 있다. 바뀐 것이 없는 주인도 번호가 올라 남은 삭제 표식의 가장 작은 번호보다 뒤에 선다.
 */
@Injectable()
export class SyncPullRepository {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly deletedRows: DeletedRowsRepository,
  ) {}

  pull(identity: IdentityContext, body: PullBody): Promise<PullResponse> {
    return this.db.transaction(async (tx) => {
      const owned = await ownedMapleIdRows(tx, identity.nexonAccountId)
      await lockOwners(
        tx,
        [
          { type: 'nexon_account', id: identity.nexonAccountId },
          ...owned.map((owner) => mapleIdOwner(owner.hash)),
        ],
        'read',
      )
      const sequence = await currentChangeSeq(tx)
      const pulled: PulledRow[] = []
      let budget = PULL_ROW_LIMIT
      let hasMore = false

      /** 한 주인의 바뀐 줄을 남은 상한까지 싣고 그 주인의 다음 번호를 돌려준다. */
      const take = async (
        after: number,
        read: (limit: number) => Promise<PulledRow[]>,
      ): Promise<number> => {
        if (hasMore) return after
        // 표마다 상한보다 한 줄 더 읽어, 모은 줄이 상한을 넘는지로 다 읽었는지 가른다.
        const rows = (await read(budget + 1)).sort((a, b) => a.changeSeq - b.changeSeq)
        const taken = rows.slice(0, budget)
        pulled.push(...taken)
        budget -= taken.length
        if (rows.length <= taken.length) return sequence
        hasMore = true
        return taken.at(-1)?.changeSeq ?? after
      }

      const account = body.cursors.nexonAccount
      const accountAfter = account?.id === identity.nexonAccountId ? account.changeSeq : 0
      const accountNext = await take(accountAfter, async (limit) => {
        const rows: PulledRow[] = []
        for (const read of NEXON_ACCOUNT_READERS) {
          rows.push(...(await read(tx, identity.nexonAccountId, accountAfter, limit)))
        }
        return rows
      })

      const mapleIdCursors: Record<string, number> = {}
      for (const owner of owned) {
        const after = body.cursors.mapleIds[owner.hash] ?? 0
        const start = pulled.length
        mapleIdCursors[owner.hash] = await take(after, async (limit) => {
          const rows: PulledRow[] = []
          for (const read of MAPLE_ID_READERS) rows.push(...(await read(tx, owner, after, limit)))
          return rows
        })
        pulled.push(...(await attachReferenced(tx, owner, after, pulled.slice(start))))
      }

      const records: PullResponse['records'] = {}
      for (const table of SYNC_TABLE_NAMES) {
        const rows = pulled.filter((row) => row.table === table).map((row) => row.row)
        if (rows.length > 0) records[table] = rows
      }
      return {
        mapleIds: owned.map((owner) => owner.hash),
        cursors: {
          nexonAccount: { id: identity.nexonAccountId, changeSeq: accountNext },
          mapleIds: mapleIdCursors,
        },
        oldestDeletedChangeSeq: await this.deletedRows.oldestDeletedChangeSeq(tx),
        hasMore,
        records,
      }
    })
  }
}
