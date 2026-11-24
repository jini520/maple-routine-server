import { and, asc, eq, inArray, isNotNull, ne, sql } from 'drizzle-orm'

import type { Db } from '../../database/database.module'
import {
  accountSettings,
  bossProfitCalculatorRecords,
  bottomBarSubPageOrders,
  enhancementAnomalies,
  enhancementSettledDays,
  mapleIds,
  nexonAccounts,
  partyAppointments,
  subAccountRegistrations,
  trackedCharacters,
  users,
} from '../../database/schema'
import { lockOwners, type RecordOwner } from './owner-locks'

export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]

/** 찾은 사람과 그 자격의 넥슨 계정. */
export interface FoundAccount {
  /** 사람(users.id). */
  id: string
  nexonAccountId: string
}

export const ACCOUNT_COLUMNS = {
  id: nexonAccounts.userId,
  nexonAccountId: nexonAccounts.id,
}

/**
 * 넥슨 계정 줄을 합치거나 메이플 ID 를 적는 트랜잭션을 한 줄로 세운다. 두 요청이 같은 메이플 ID 를 동시에 알리면 서로의
 * 줄을 못 봐 합쳐야 할 줄이 둘로 남는다. 메이플 ID 를 알리는 일은 목록이 바뀔 때만 있어 드물다.
 */
export async function lockNexonAccounts(tx: Tx): Promise<void> {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('nexon_accounts'))`)
}

export async function findAccountByMapleId(
  tx: Tx | Db,
  mapleId: string,
): Promise<FoundAccount | null> {
  const [row] = await tx
    .select(ACCOUNT_COLUMNS)
    .from(mapleIds)
    .innerJoin(nexonAccounts, eq(nexonAccounts.id, mapleIds.nexonAccountId))
    .where(eq(mapleIds.hash, mapleId))
  return row ?? null
}

/**
 * 메이플 ID 로 넥슨 계정을 찾고, 없으면 사람 · 계정 줄 · 메이플 ID 줄을 함께 만든다. `lockNexonAccounts` 안에서 부른다. 잠그지
 * 않으면 같은 메이플 ID 가 동시에 와 UNIQUE 에 진 쪽이 실패한다.
 */
export async function findOrCreateMapleIdAccount(tx: Tx, mapleId: string): Promise<FoundAccount> {
  const found = await findAccountByMapleId(tx, mapleId)
  if (found !== null) return found
  const [user] = await tx.insert(users).values({}).returning({ id: users.id })
  if (user === undefined) throw new Error('사람을 만들지 못했다')
  const [account] = await tx
    .insert(nexonAccounts)
    .values({ userId: user.id })
    .returning(ACCOUNT_COLUMNS)
  if (account === undefined) throw new Error('계정 줄을 만들지 못했다')
  await tx.insert(mapleIds).values({ nexonAccountId: account.nexonAccountId, hash: mapleId })
  return account
}

/**
 * 같은 넥슨 ID 인 두 줄을 into 하나로 합친다. 메이플 ID · 부계정 등록 · 강화 이상 보고와 넥슨 계정에 붙는 기록을 옮기고 from
 * 을 지운다. 지우는 from 을 가리키는 줄은 함께 지워지므로 지우기 전에 옮겨야 한다. 캐릭터와 그 기록은 메이플 ID 를 가리키므로
 * 메이플 ID 를 따라 옮겨진다. from 의 사람에게 다른 줄이 없으면 그 사람의 옛 기록을 into 의 사람에게 옮기고 사람도 지운다.
 */
export async function mergeNexonAccounts(tx: Tx, from: string, into: string): Promise<void> {
  const [source] = await tx
    .select({ userId: nexonAccounts.userId })
    .from(nexonAccounts)
    .where(eq(nexonAccounts.id, from))
  const [target] = await tx
    .select({ userId: nexonAccounts.userId })
    .from(nexonAccounts)
    .where(eq(nexonAccounts.id, into))
  if (source === undefined || target === undefined) throw new Error('합칠 넥슨 계정 줄이 없다')
  // 옮기는 기록 줄은 변경 번호가 새로 붙는다. 그 주인을 받는 중인 기기가 이 번호를 건너뛰지 않게 쓰기처럼 잠근다.
  const held = await tx
    .select({ hash: mapleIds.hash })
    .from(mapleIds)
    .where(inArray(mapleIds.nexonAccountId, [from, into]))
  await lockOwners(
    tx,
    [
      { type: 'nexon_account', id: from },
      { type: 'nexon_account', id: into },
      ...held.map((row): RecordOwner => ({ type: 'maple_id', hash: row.hash })),
    ],
    'write',
  )

  await tx.update(mapleIds).set({ nexonAccountId: into }).where(eq(mapleIds.nexonAccountId, from))

  // 합치면 자기 자신을 잇게 되는 등록과, into 가 이미 다른 로그인의 부계정일 때 from 의 등록은 지운다. 부계정은 로그인 하나에만 붙는다.
  await tx.execute(sql`
    DELETE FROM ${subAccountRegistrations}
     WHERE (login_nexon_account_id = ${from} AND sub_nexon_account_id = ${into})
        OR (login_nexon_account_id = ${into} AND sub_nexon_account_id = ${from})
        OR (sub_nexon_account_id = ${from}
            AND EXISTS (SELECT 1 FROM ${subAccountRegistrations} s WHERE s.sub_nexon_account_id = ${into}))`)
  await tx
    .update(subAccountRegistrations)
    .set({ subNexonAccountId: into })
    .where(eq(subAccountRegistrations.subNexonAccountId, from))
  await tx
    .update(subAccountRegistrations)
    .set({ loginNexonAccountId: into })
    .where(eq(subAccountRegistrations.loginNexonAccountId, from))

  // 같은 열쇠의 강화 이상 보고가 양쪽에 있으면 늦게 고친 줄만 남긴다. 시각이 같으면 from 쪽을 버린다.
  await tx.execute(sql`
    DELETE FROM ${enhancementAnomalies} d USING ${enhancementAnomalies} o
     WHERE d.nexon_account_id IN (${from}, ${into}) AND o.nexon_account_id IN (${from}, ${into})
       AND d.nexon_account_id <> o.nexon_account_id
       AND d.history_date = o.history_date AND d.api_type = o.api_type
       AND d.reason = o.reason AND d.item_name = o.item_name
       AND coalesce(d.detail, '') = coalesce(o.detail, '')
       AND (d.updated_at < o.updated_at OR (d.updated_at = o.updated_at AND d.nexon_account_id = ${from}))`)
  await tx
    .update(enhancementAnomalies)
    .set({ nexonAccountId: into })
    .where(eq(enhancementAnomalies.nexonAccountId, from))
  await moveAccountRecords(tx, from, into)
  await tx.delete(nexonAccounts).where(eq(nexonAccounts.id, from))

  if (source.userId === target.userId) return
  const [rest] = await tx
    .select({ id: nexonAccounts.id })
    .from(nexonAccounts)
    .where(eq(nexonAccounts.userId, source.userId))
    .limit(1)
  if (rest !== undefined) return
  await moveLegacyRecords(tx, source.userId, target.userId)
  await tx.delete(users).where(eq(users.id, source.userId))
}

/**
 * 넥슨 계정에 붙는 기록을 옮긴다. from 의 삭제 표식이 선 줄은 옮기지 않고 지운다. 한 계정에 하나인 줄(설정 · 하위 페이지 차례 ·
 * 추적 캐릭터)이 양쪽에 있으면 늦게 고친 줄을 남기고, 시각이 같으면 from 쪽을 버린다. 대표 캐릭터는 into 에 있으면 into 의 것을
 * 남긴다. 대표는 계정에 하나다. 굳은 날은 같은 날이 양쪽에 있어도 같은 사실이라 한 줄만 남긴다. into 에서 지운 날보다 from 의 살아
 * 있는 날을 남긴다. 손으로 적은 약속과 계산기 기록은 둘 다 남긴다.
 */
async function moveAccountRecords(tx: Tx, from: string, into: string): Promise<void> {
  // 옮기면 변경 번호가 새로 붙어, 180일 뒤 지우기가 그 줄을 지울 때 받기의 지운 번호가 그 번호까지 올라 모든 기기가 한 번 비우고
  // 다시 받는다. from 을 보던 기기는 0 부터 받아 표식이 필요 없고, into 를 보던 기기에는 가진 적 없는 줄의 지우기다.
  for (const table of [
    trackedCharacters,
    partyAppointments,
    bossProfitCalculatorRecords,
    enhancementSettledDays,
  ]) {
    await tx.delete(table).where(and(eq(table.nexonAccountId, from), isNotNull(table.deletedAt)))
  }
  for (const [table, key] of [
    ['account_settings', ''],
    ['bottom_bar_sub_page_orders', 'AND d.group_key = o.group_key'],
    ['tracked_characters', 'AND d.character_id = o.character_id'],
  ] as const) {
    await tx.execute(sql`
      DELETE FROM ${sql.identifier(table)} d USING ${sql.identifier(table)} o
       WHERE d.nexon_account_id IN (${from}, ${into}) AND o.nexon_account_id IN (${from}, ${into})
         AND d.nexon_account_id <> o.nexon_account_id ${sql.raw(key)}
         AND (d.updated_at < o.updated_at OR (d.updated_at = o.updated_at AND d.nexon_account_id = ${from}))`)
  }
  await tx.execute(sql`
    UPDATE ${trackedCharacters} SET is_representative = false
     WHERE nexon_account_id = ${from} AND is_representative
       AND EXISTS (SELECT 1 FROM ${trackedCharacters} t
                    WHERE t.nexon_account_id = ${into} AND t.is_representative AND t.deleted_at IS NULL)`)
  // 같은 날이 양쪽에 있으면 살아 있는 줄을 남긴다. from 의 줄은 이제 모두 살아 있어, 둘 다 살아 있으면 into 쪽을 남긴다.
  await tx.execute(sql`
    DELETE FROM ${enhancementSettledDays} d USING ${enhancementSettledDays} o
     WHERE d.nexon_account_id = ${from} AND o.nexon_account_id = ${into}
       AND d.api_type = o.api_type AND d.history_date = o.history_date
       AND o.deleted_at IS NULL`)
  await tx.execute(sql`
    DELETE FROM ${enhancementSettledDays} d USING ${enhancementSettledDays} o
     WHERE d.nexon_account_id = ${into} AND o.nexon_account_id = ${from}
       AND d.api_type = o.api_type AND d.history_date = o.history_date`)
  for (const table of [
    accountSettings,
    bottomBarSubPageOrders,
    trackedCharacters,
    partyAppointments,
    bossProfitCalculatorRecords,
    enhancementSettledDays,
  ]) {
    await tx.update(table).set({ nexonAccountId: into }).where(eq(table.nexonAccountId, from))
  }
}

/** 사람 칸으로 찾는 기록(드롭 판매가 · 사용 로그)을 옮긴다. 옮기지 않으면 사람을 지울 때 사람 칸이 비어 익명 줄이 된다. */
async function moveLegacyRecords(tx: Tx, from: string, into: string): Promise<void> {
  await tx.execute(sql`UPDATE drop_sale_prices SET user_id = ${into} WHERE user_id = ${from}`)
  await tx.execute(sql`UPDATE usage_events SET user_id = ${into} WHERE user_id = ${from}`)
}

interface Holder {
  id: string
  uidHash: string | null
  createdAt: Date
  deletionRequestedAt: Date | null
}

const HOLDER_COLUMNS = {
  id: nexonAccounts.id,
  uidHash: nexonAccounts.uidHash,
  createdAt: nexonAccounts.createdAt,
  deletionRequestedAt: users.deletionRequestedAt,
}

const byAge = (a: Holder, b: Holder): number =>
  a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id)

/**
 * 메이플 ID 를 그 계정 줄에 더하고, 다른 줄이 가진 메이플 ID 면 그 줄과 합친다. 남는 줄의 id 를 돌려준다.
 *
 * 남기는 줄은 로그인 줄이고, 없으면 먼저 생긴 줄이다. 두 로그인 줄이나 삭제를 예약한 사람의 줄과는 합치지 않고, 그 줄이 가진
 * 메이플 ID 도 받지 않는다. 메이플 ID 는 다른 넥슨 ID 로 옮겨 가지 않아 목록에서 빠진 것도 지우지 않는다.
 */
export async function addMapleIds(
  tx: Tx,
  nexonAccountId: string,
  hashes: readonly string[],
): Promise<string> {
  const unique = [...new Set(hashes)]
  const [self] = await tx
    .select(HOLDER_COLUMNS)
    .from(nexonAccounts)
    .innerJoin(users, eq(users.id, nexonAccounts.userId))
    .where(eq(nexonAccounts.id, nexonAccountId))
  if (self === undefined) throw new Error('메이플 ID 를 적을 넥슨 계정 줄이 없다')
  if (unique.length === 0) return self.id

  const owners = await tx
    .selectDistinct(HOLDER_COLUMNS)
    .from(mapleIds)
    .innerJoin(nexonAccounts, eq(nexonAccounts.id, mapleIds.nexonAccountId))
    .innerJoin(users, eq(users.id, nexonAccounts.userId))
    .where(and(inArray(mapleIds.hash, unique), ne(mapleIds.nexonAccountId, self.id)))
  let group: Holder[] = [
    self,
    ...owners.filter(
      (owner) =>
        self.deletionRequestedAt === null &&
        owner.deletionRequestedAt === null &&
        !(self.uidHash !== null && owner.uidHash !== null),
    ),
  ]
  // 로그인 없는 줄이 알린 메이플 ID 가 로그인 줄 둘에 걸치면 앞 로그인 줄 하나와만 합친다. 두 로그인 줄은 넥슨 ID 가 달라 합칠 수 없다.
  const logins = group.filter((holder) => holder.uidHash !== null).sort(byAge)
  if (logins.length > 1) group = group.filter((h) => h.uidHash === null || h.id === logins[0]?.id)
  const target = logins[0] ?? [...group].sort(byAge)[0] ?? self
  for (const holder of group) {
    if (holder.id !== target.id) await mergeNexonAccounts(tx, holder.id, target.id)
  }
  await tx
    .insert(mapleIds)
    .values(unique.map((hash) => ({ nexonAccountId: target.id, hash })))
    .onConflictDoNothing()
  return target.id
}

export async function mapleIdsOf(tx: Tx | Db, nexonAccountId: string): Promise<string[]> {
  const rows = await tx
    .select({ hash: mapleIds.hash })
    .from(mapleIds)
    .where(eq(mapleIds.nexonAccountId, nexonAccountId))
    .orderBy(asc(mapleIds.hash))
  return rows.map((row) => row.hash)
}
