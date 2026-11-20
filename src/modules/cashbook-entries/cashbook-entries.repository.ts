import { Inject, Injectable } from '@nestjs/common'
import { and, eq, sql } from 'drizzle-orm'

import { DB, type Db } from '../../database/database.module'
import {
  cashbookEntries,
  cashbookEntryExchangeInputs,
  cashbookEntryFragmentUses,
  cashbookEntryHuntInputs,
  cashbookEntryItems,
  cashbookEntryTransferInputs,
} from '../../database/schema'
import type { IdentityContext } from '../identity/identity.guard'
import { characterIdFor, mapleIdRowFor, ownedMapleIdRows } from '../users/characters'
import { MapleIdNotOwned } from '../users/maple-id-ownership'
import type { CashbookEntryBody } from './cashbook-entries.dto'

/** 전송값 그대로에 신원을 더한 것. */
export interface CashbookEntryInput extends CashbookEntryBody {
  /** 보낸 신원의 넥슨 계정. 메이플 ID 가 이 계정의 것이어야 적는다. */
  nexonAccountId: string
}

/**
 * 가계부 기록의 사본. 줄 id 는 기기의 기록 id 이고, 딸린 줄(품목 · 입력 · 조각 사용)은 다시 받을 때마다 통째로 갈아 끼운다.
 * 사용자가 직접 적는 기록이라 내용으로 가리지 않는다.
 */
@Injectable()
export class CashbookEntriesRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  /**
   * 줄 id 로 덮어 적는다. 지운 줄도 다시 적으면 되살아난다. 남의 메이플 ID 나 캐릭터, 남의 줄 id 는 MapleIdNotOwned 다. 남의
   * 줄을 덮지 못한 채 딸린 줄만 갈아 끼우면 그 사람의 품목이 바뀌기 때문이다.
   */
  async upsert(input: CashbookEntryInput): Promise<void> {
    const { nexonAccountId, mapleId: mapleIdHash, ocid, id, items, ...rest } = input
    const { huntInput, transferInput, exchangeInput, fragmentUses, ...values } = rest
    await this.db.transaction(async (tx) => {
      const mapleId = await mapleIdRowFor(tx, nexonAccountId, mapleIdHash)
      const characterId =
        ocid === null ? null : await characterIdFor(tx, nexonAccountId, mapleIdHash, ocid)
      const row = { ...values, mapleId, characterId }
      const [written] = await tx
        .insert(cashbookEntries)
        .values({ id, ...row })
        .onConflictDoUpdate({
          target: cashbookEntries.id,
          set: { ...row, deletedAt: null, updatedAt: sql`now()` },
          setWhere: sql`${cashbookEntries.mapleId} IN ${ownedMapleIdRows(nexonAccountId)}`,
        })
        .returning({ id: cashbookEntries.id })
      if (written === undefined) throw new MapleIdNotOwned(mapleIdHash)

      for (const table of [
        cashbookEntryItems,
        cashbookEntryHuntInputs,
        cashbookEntryTransferInputs,
        cashbookEntryExchangeInputs,
        cashbookEntryFragmentUses,
      ])
        await tx.delete(table).where(eq(table.entryId, id))
      await tx.insert(cashbookEntryItems).values(items.map((item) => ({ ...item, entryId: id })))
      if (huntInput !== null)
        await tx.insert(cashbookEntryHuntInputs).values({ ...huntInput, entryId: id })
      if (exchangeInput !== null)
        await tx.insert(cashbookEntryExchangeInputs).values({ ...exchangeInput, entryId: id })
      if (transferInput !== null) {
        const { receiverOcid, ...transfer } = transferInput
        const receiverCharacterId =
          receiverOcid === null
            ? null
            : await characterIdFor(tx, nexonAccountId, mapleIdHash, receiverOcid)
        await tx
          .insert(cashbookEntryTransferInputs)
          .values({ ...transfer, receiverCharacterId, entryId: id })
      }
      for (const use of fragmentUses) {
        const { ocid: from, ...fragment } = use
        const fromCharacterId =
          from === null ? null : await characterIdFor(tx, nexonAccountId, mapleIdHash, from)
        await tx
          .insert(cashbookEntryFragmentUses)
          .values({ ...fragment, characterId: fromCharacterId, entryId: id })
      }
    })
  }

  /** 내 계정의 메이플 ID 줄에 지운 시각을 적는다. 딸린 줄은 남긴다. 없는 줄이면 아무 일도 없다. */
  async markDeleted(identity: Pick<IdentityContext, 'nexonAccountId'>, id: string): Promise<void> {
    await this.db
      .update(cashbookEntries)
      .set({
        deletedAt: sql`COALESCE(${cashbookEntries.deletedAt}, now())`,
        updatedAt: sql`now()`,
      })
      .where(
        and(
          eq(cashbookEntries.id, id),
          sql`${cashbookEntries.mapleId} IN ${ownedMapleIdRows(identity.nexonAccountId)}`,
        ),
      )
  }
}
