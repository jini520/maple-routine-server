import { Inject, Injectable } from '@nestjs/common'
import { and, eq, sql } from 'drizzle-orm'

import { DB, type Db } from '../../database/database.module'
import {
  nexonAccounts,
  serverCashbookEntries,
  serverCashbookEntryItems,
} from '../../database/schema'
import type { IdentitySource } from '../identity/identity.guard'
import type { CashbookEntryBody } from './cashbook-entries.dto'

/** 전송값 그대로에 사람과 신원을 더한 것. */
export interface CashbookEntryInput extends Omit<CashbookEntryBody, 'ocid' | 'accountRecordId'> {
  userId: string
  identifiedBy: IdentitySource
  ocid: string | null
  accountRecordId: string | null
}

/** 가계부 기록의 사본. 같은 사람의 같은 기록은 한 줄이고, 품목은 다시 받을 때마다 통째로 갈아 끼운다. */
@Injectable()
export class CashbookEntriesRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  /**
   * 사람과 기록 id 로 덮어 적는다. 지운 줄도 다시 적으면 되살아난다.
   *
   * 캐릭터 없는 기록만 넥슨 계정을 찾아 적는다. 캐릭터가 있는 기록은 ocid 로 계정을 찾으므로 적지 않는다.
   */
  async upsert(input: CashbookEntryInput): Promise<void> {
    const { userId, entryRecordId, accountRecordId, items, ...rest } = input
    await this.db.transaction(async (tx) => {
      let nexonAccountId: string | null = null
      if (rest.ocid === null && accountRecordId !== null) {
        const [account] = await tx
          .select({ id: nexonAccounts.id })
          .from(nexonAccounts)
          .where(
            and(
              eq(nexonAccounts.userId, userId),
              eq(nexonAccounts.accountRecordId, accountRecordId),
            ),
          )
        nexonAccountId = account?.id ?? null
      }
      const values = { ...rest, nexonAccountId }
      const [entry] = await tx
        .insert(serverCashbookEntries)
        .values({ userId, entryRecordId, ...values })
        .onConflictDoUpdate({
          target: [serverCashbookEntries.userId, serverCashbookEntries.entryRecordId],
          set: { ...values, deletedAt: null, updatedAt: sql`now()` },
        })
        .returning({ id: serverCashbookEntries.id })
      if (entry === undefined) throw new Error('가계부 기록을 적지 못했다')
      await tx
        .delete(serverCashbookEntryItems)
        .where(eq(serverCashbookEntryItems.entryId, entry.id))
      await tx.insert(serverCashbookEntryItems).values(
        items.map((item, sortOrder) => ({
          entryId: entry.id,
          sortOrder,
          itemKey: item.itemKey ?? null,
          itemName: item.itemName ?? null,
          formKey: item.formKey ?? null,
          itemKindKey: item.itemKindKey ?? null,
          quantity: item.quantity ?? null,
          fromLevel: item.fromLevel ?? null,
          toLevel: item.toLevel ?? null,
          amountMeso: item.amountMeso ?? null,
          tariffMeso: item.tariffMeso ?? null,
          saleFeePercent: item.saleFeePercent ?? null,
          saleFeeMeso: item.saleFeeMeso ?? null,
          amountPoint: item.amountPoint ?? null,
          pointPer100mMeso: item.pointPer100mMeso ?? null,
          amountCash: item.amountCash ?? null,
        })),
      )
    })
  }

  /** 내 줄에 지운 시각을 적는다. 품목은 남긴다. 없는 줄이면 아무 일도 없다. */
  async markDeleted(userId: string, entryRecordId: string): Promise<void> {
    await this.db
      .update(serverCashbookEntries)
      .set({
        deletedAt: sql`COALESCE(${serverCashbookEntries.deletedAt}, now())`,
        updatedAt: sql`now()`,
      })
      .where(
        and(
          eq(serverCashbookEntries.userId, userId),
          eq(serverCashbookEntries.entryRecordId, entryRecordId),
        ),
      )
  }
}
