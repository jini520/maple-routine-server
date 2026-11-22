import type { SyncTableName } from '../sync.dto'
import type { MapleIdReader, NexonAccountReader, TableWriter } from '../sync-table'
import {
  accountSettingsTable,
  bossProfitCalculatorRecordsTable,
  bottomBarSubPageOrdersTable,
  enhancementSettledDaysTable,
  partyAppointmentsTable,
  readAccountSettings,
  readBossProfitCalculatorRecords,
  readBottomBarSubPageOrders,
  readEnhancementSettledDays,
  readPartyAppointments,
  readTrackedCharacters,
  trackedCharactersTable,
} from './account'
import {
  bossDropsTable,
  bossProfitEntriesTable,
  bossSplitSettingsTable,
  readBossDrops,
  readBossProfitEntries,
  readBossSplitSettings,
} from './boss'
import {
  cashbookEntriesTable,
  inventoryItemsTable,
  readCashbookEntries,
  readInventoryItems,
} from './cashbook'
import {
  characterWorldLeapsTable,
  enhancementTotalsTable,
  manualTrackedItemsTable,
  mapleIdNamesTable,
  mvpGradeHistoryTable,
  readCharacterWorldLeaps,
  readEnhancementTotals,
  readManualTrackedItems,
  readMapleIdNames,
  readMvpGradeHistory,
  readRememberedLevels,
  readRepresentativeCharacterMotions,
  readSharedContentProgress,
  rememberedLevelsTable,
  representativeCharacterMotionsTable,
  sharedContentProgressTable,
} from './character'

/** 올리기의 표 이름마다 쓰는 쪽 */
export const TABLE_WRITERS: Record<SyncTableName, TableWriter> = {
  inventoryItems: inventoryItemsTable,
  cashbookEntries: cashbookEntriesTable,
  bossProfitEntries: bossProfitEntriesTable,
  bossDrops: bossDropsTable,
  bossSplitSettings: bossSplitSettingsTable,
  enhancementTotals: enhancementTotalsTable,
  enhancementSettledDays: enhancementSettledDaysTable,
  rememberedLevels: rememberedLevelsTable,
  mvpGradeHistory: mvpGradeHistoryTable,
  characterWorldLeaps: characterWorldLeapsTable,
  manualTrackedItems: manualTrackedItemsTable,
  sharedContentProgress: sharedContentProgressTable,
  mapleIdNames: mapleIdNamesTable,
  trackedCharacters: trackedCharactersTable,
  representativeCharacterMotions: representativeCharacterMotionsTable,
  accountSettings: accountSettingsTable,
  bottomBarSubPageOrders: bottomBarSubPageOrdersTable,
  partyAppointments: partyAppointmentsTable,
  bossProfitCalculatorRecords: bossProfitCalculatorRecordsTable,
}

/** 메이플 ID 가 주인인 표의 읽기. 캐릭터 기록과 굳은 날도 메이플 ID 를 따라 읽는다. */
export const MAPLE_ID_READERS: readonly MapleIdReader[] = [
  readInventoryItems,
  readCashbookEntries,
  readBossProfitEntries,
  readBossDrops,
  readBossSplitSettings,
  readEnhancementTotals,
  readEnhancementSettledDays,
  readRememberedLevels,
  readMvpGradeHistory,
  readCharacterWorldLeaps,
  readManualTrackedItems,
  readSharedContentProgress,
  readMapleIdNames,
  readRepresentativeCharacterMotions,
]

/** 사람(넥슨 계정 줄)이 주인인 표의 읽기 */
export const NEXON_ACCOUNT_READERS: readonly NexonAccountReader[] = [
  readAccountSettings,
  readBottomBarSubPageOrders,
  readTrackedCharacters,
  readPartyAppointments,
  readBossProfitCalculatorRecords,
]
