import { Inject, Injectable } from '@nestjs/common'
import { and, eq, sql } from 'drizzle-orm'

import { DB, type Db } from '../../database/database.module'
import { serverCashbookEntries, serverCashbookEntryItems } from '../../database/schema'
import type { IdentityContext, IdentitySource } from '../identity/identity.guard'
import { assertOwnsMapleId, ownedMapleIds } from '../users/maple-id-ownership'
import type { CashbookEntryBody } from './cashbook-entries.dto'

/** 전송값 그대로에 신원을 더한 것. */
export interface CashbookEntryInput extends Omit<CashbookEntryBody, 'ocid'> {
  /** 보낸 신원의 넥슨 계정. 메이플 ID 가 이 계정의 것이어야 적는다. */
  nexonAccountId: string
  identifiedBy: IdentitySource
  ocid: string | null
}

/**
 * 가계부 기록의 사본. 같은 메이플 ID 의 같은 기록 id 는 한 줄이고, 품목은 다시 받을 때마다 통째로 갈아 끼운다. 사용자가 직접 적는
 * 기록이라 내용으로 가리지 않는다.
 */
@Injectable()
export class CashbookEntriesRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** 메이플 ID 와 기록 id 로 덮어 적는다. 지운 줄도 다시 적으면 되살아난다. 남의 메이플 ID 는 MapleIdNotOwned 다. */
  async upsert(input: CashbookEntryInput): Promise<void> {
    const { nexonAccountId, entryRecordId, mapleId, items, ...values } = input
    await this.db.transaction(async (tx) => {
      await assertOwnsMapleId(tx, nexonAccountId, mapleId)
      const [entry] = await tx
        .insert(serverCashbookEntries)
        .values({ mapleId, entryRecordId, ...values })
        .onConflictDoUpdate({
          target: [serverCashbookEntries.mapleId, serverCashbookEntries.entryRecordId],
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
          fragmentCount: item.fragmentCount ?? null,
          untradableFragmentCount: item.untradableFragmentCount ?? null,
          fragmentPriceMeso: item.fragmentPriceMeso ?? null,
          hexaActivation: item.hexaActivation ?? null,
        })),
      )
    })
  }

  /** 내 계정의 메이플 ID 줄에 지운 시각을 적는다. 품목은 남긴다. 없는 줄이면 아무 일도 없다. */
  async markDeleted(
    identity: Pick<IdentityContext, 'nexonAccountId'>,
    entryRecordId: string,
  ): Promise<void> {
    await this.db
      .update(serverCashbookEntries)
      .set({
        deletedAt: sql`COALESCE(${serverCashbookEntries.deletedAt}, now())`,
        updatedAt: sql`now()`,
      })
      .where(
        and(
          eq(serverCashbookEntries.entryRecordId, entryRecordId),
          sql`${serverCashbookEntries.mapleId} IN ${ownedMapleIds(identity.nexonAccountId)}`,
        ),
      )
  }
}
