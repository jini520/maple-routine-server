import { Inject, Injectable } from '@nestjs/common'
import { and, asc, inArray, isNull, or, type SQL, sql } from 'drizzle-orm'

import { DB, type Db } from '../../database/database.module'
import {
  bossDrops,
  bossProfitEntries,
  bossSplitSettings,
  cashbookEntries,
  characters,
  dropSalePrices,
  enhancementSettledDays,
  enhancementTotals,
  inventoryItems,
  manualTrackedItems,
  mapleIds,
  rememberedLevels,
  sharedContentProgress,
} from '../../database/schema'
import type { IdentityContext } from '../identity/identity.guard'
import { ownedMapleIds } from '../users/maple-id-ownership'
import type { Tx } from '../users/nexon-account-store'
import { lockOwners } from '../users/owner-locks'
import type { ClearGroup } from './sync.dto'
import { mapleIdOwner } from './sync-table'

const deleted = { deletedAt: sql`now()`, updatedAt: sql`now()` }

/** 묶음을 지우는 차례. 기기의 데이터 삭제(`storage/cache-data.ts`)와 같다. 보스 처치를 지운 뒤에 분배 칸을 비운다. */
const GROUP_ORDER: readonly ClearGroup[] = ['cashbook', 'enhancement', 'boss', 'manual']

/**
 * 데이터 삭제 화면에서 지운 기록 묶음을 서버에서도 지운다. 기기에서만 지우면 다음 받기가 서버의 기록을 다시 넣는다. 이 신원이
 * 쓸 수 있는 메이플 ID 의 기록이 대상이고, 줄마다 삭제 표식을 적어 다른 기기도 지운다. 기기의 묶음과 같은 줄을 지운다. 화면에 적지 않은 것을 함께 지우면 사용자가 모르는 것을 잃는다.
 */
@Injectable()
export class SyncClearRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  async clear(identity: IdentityContext, groups: readonly ClearGroup[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      const owned = await tx
        .select({ id: mapleIds.id, hash: mapleIds.hash })
        .from(mapleIds)
        .where(sql`${mapleIds.hash} IN ${ownedMapleIds(identity.nexonAccountId)}`)
        .orderBy(asc(mapleIds.hash))
      if (owned.length === 0) return
      await lockOwners(
        tx,
        owned.map((owner) => mapleIdOwner(owner.hash)),
        'write',
      )
      const scope = new ClearScope(
        tx,
        identity.userId,
        owned.map((owner) => owner.id),
      )
      for (const group of GROUP_ORDER) if (groups.includes(group)) await scope.clear(group)
    })
  }
}

/** 한 번의 데이터 삭제가 지우는 메이플 ID 들의 기록 */
class ClearScope {
  constructor(
    private readonly tx: Tx,
    private readonly userId: string,
    private readonly mapleIdRows: readonly string[],
  ) {}

  private get characterIds(): SQL {
    return sql`(SELECT ${characters.id} FROM ${characters} WHERE ${inArray(characters.mapleId, [...this.mapleIdRows])})`
  }

  private get entryIds(): SQL {
    return sql`(SELECT ${bossProfitEntries.id} FROM ${bossProfitEntries}
                 WHERE ${bossProfitEntries.characterId} IN ${this.characterIds})`
  }

  async clear(group: ClearGroup): Promise<void> {
    const { tx } = this
    switch (group) {
      case 'cashbook':
        // 인벤토리는 남은 개수를 가계부 판매에서 세고, 기억한 레벨은 가계부 기록에서 나온 값이라 함께 지운다.
        await tx
          .update(cashbookEntries)
          .set(deleted)
          .where(
            and(
              inArray(cashbookEntries.mapleId, [...this.mapleIdRows]),
              isNull(cashbookEntries.deletedAt),
            ),
          )
        await tx
          .update(inventoryItems)
          .set(deleted)
          .where(
            and(
              inArray(inventoryItems.mapleId, [...this.mapleIdRows]),
              isNull(inventoryItems.deletedAt),
            ),
          )
        await tx
          .update(rememberedLevels)
          .set(deleted)
          .where(
            and(
              sql`${rememberedLevels.characterId} IN ${this.characterIds}`,
              isNull(rememberedLevels.deletedAt),
            ),
          )
        return
      case 'enhancement':
        await tx
          .update(enhancementTotals)
          .set(deleted)
          .where(
            and(
              sql`${enhancementTotals.characterId} IN ${this.characterIds}`,
              isNull(enhancementTotals.deletedAt),
            ),
          )
        // 굳은 날만 남으면 다른 기기와 새 기기가 그 날을 넥슨에서 다시 받지 않아 합계가 빈 채로 굳는다.
        await tx
          .update(enhancementSettledDays)
          .set(deleted)
          .where(
            and(
              inArray(
                enhancementSettledDays.nexonAccountId,
                tx
                  .select({ id: mapleIds.nexonAccountId })
                  .from(mapleIds)
                  .where(inArray(mapleIds.id, [...this.mapleIdRows])),
              ),
              isNull(enhancementSettledDays.deletedAt),
            ),
          )
        return
      case 'boss': {
        // 처치와 드롭은 한 묶음이다. 드롭만 남으면 같은 처치를 다시 적을 때 지웠다고 생각한 옛 드롭이 붙는다.
        const gone = await tx
          .update(bossDrops)
          .set(deleted)
          .where(
            and(sql`${bossDrops.profitEntryId} IN ${this.entryIds}`, isNull(bossDrops.deletedAt)),
          )
          .returning({ id: bossDrops.id })
        if (gone.length > 0) {
          await tx.delete(dropSalePrices).where(
            and(
              inArray(
                dropSalePrices.id,
                gone.map((row) => row.id),
              ),
              or(isNull(dropSalePrices.userId), sql`${dropSalePrices.userId} = ${this.userId}`),
            ),
          )
        }
        // 그 기간 값만 남은 처치 전 수익 건은 수동 선택 묶음이라 남긴다.
        await tx
          .update(bossProfitEntries)
          .set(deleted)
          .where(
            and(
              sql`${bossProfitEntries.characterId} IN ${this.characterIds}`,
              isNull(bossProfitEntries.deletedAt),
              sql`(${bossProfitEntries.clearRecordedBy} IS NOT NULL OR ${bossProfitEntries.splitType} IS NULL)`,
            ),
          )
        return
      }
      case 'manual':
        await tx
          .update(bossSplitSettings)
          .set(deleted)
          .where(
            and(
              sql`${bossSplitSettings.characterId} IN ${this.characterIds}`,
              isNull(bossSplitSettings.deletedAt),
            ),
          )
        // 드롭이 없는 처치 전 수익 건은 지우고, 드롭이 남은 처치 전 수익 건은 줄을 남기고 분배 칸만 비운다.
        await tx
          .update(bossProfitEntries)
          .set(deleted)
          .where(
            and(
              sql`${bossProfitEntries.characterId} IN ${this.characterIds}`,
              isNull(bossProfitEntries.deletedAt),
              isNull(bossProfitEntries.clearRecordedBy),
              sql`NOT EXISTS (SELECT 1 FROM ${bossDrops}
                               WHERE ${bossDrops.profitEntryId} = ${bossProfitEntries.id}
                                 AND ${bossDrops.deletedAt} IS NULL)`,
            ),
          )
        await tx
          .update(bossProfitEntries)
          .set({
            splitType: null,
            partySize: null,
            splitShareMillipercent: null,
            splitFeePercent: null,
            splitFeeFollowsMvpGrade: true,
            updatedAt: sql`now()`,
          })
          .where(
            and(
              sql`${bossProfitEntries.characterId} IN ${this.characterIds}`,
              isNull(bossProfitEntries.deletedAt),
              isNull(bossProfitEntries.clearRecordedBy),
            ),
          )
        await tx
          .update(manualTrackedItems)
          .set(deleted)
          .where(
            and(
              sql`${manualTrackedItems.characterId} IN ${this.characterIds}`,
              isNull(manualTrackedItems.deletedAt),
            ),
          )
        await tx
          .update(sharedContentProgress)
          .set(deleted)
          .where(
            and(
              inArray(sharedContentProgress.mapleId, [...this.mapleIdRows]),
              isNull(sharedContentProgress.deletedAt),
            ),
          )
        return
    }
  }
}
