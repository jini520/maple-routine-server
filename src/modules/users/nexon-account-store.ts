import { and, asc, eq, inArray, ne, sql } from 'drizzle-orm'

import type { Db } from '../../database/database.module'
import {
  enhancementAnomalies,
  nexonAccountKeys,
  nexonAccountMapleIds,
  nexonAccounts,
  subAccounts,
  users,
} from '../../database/schema'

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

export async function findAccountByKey(
  tx: Tx | Db,
  apiKeyHash: Buffer,
): Promise<FoundAccount | null> {
  const [row] = await tx
    .select(ACCOUNT_COLUMNS)
    .from(nexonAccountKeys)
    .innerJoin(nexonAccounts, eq(nexonAccounts.id, nexonAccountKeys.nexonAccountId))
    .where(eq(nexonAccountKeys.apiKeyHash, apiKeyHash))
  return row ?? null
}

/**
 * 키로 넥슨 계정을 찾고, 없으면 사람 · 계정 줄 · 키 줄을 함께 만든다.
 *
 * 같은 키가 동시에 오면 둘 다 사람을 만든다. 키의 UNIQUE 에 진 쪽은 만든 사람을 지우고(계정 줄은 함께 지워진다) 이긴 쪽을
 * 다시 읽는다.
 */
export async function findOrCreateKeyAccount(tx: Tx, apiKeyHash: Buffer): Promise<FoundAccount> {
  const found = await findAccountByKey(tx, apiKeyHash)
  if (found !== null) return found
  const [user] = await tx.insert(users).values({}).returning({ id: users.id })
  if (user === undefined) throw new Error('사람을 만들지 못했다')
  const [account] = await tx
    .insert(nexonAccounts)
    .values({ userId: user.id })
    .returning(ACCOUNT_COLUMNS)
  if (account === undefined) throw new Error('계정 줄을 만들지 못했다')
  const [key] = await tx
    .insert(nexonAccountKeys)
    .values({ nexonAccountId: account.nexonAccountId, apiKeyHash })
    .onConflictDoNothing()
    .returning({ id: nexonAccountKeys.id })
  if (key !== undefined) return account
  await tx.delete(users).where(eq(users.id, user.id))
  const winner = await findAccountByKey(tx, apiKeyHash)
  if (winner === null) throw new Error('키 줄을 만들지 못했다')
  return winner
}

/**
 * 같은 넥슨 ID 인 두 줄을 into 하나로 합친다. 키 · 메이플 ID · 부계정 등록 · 강화 이상 보고를 옮기고 from 을 지운다. 기록은
 * 메이플 ID 를 가리키므로 메이플 ID 를 따라 옮겨진다. from 의 사람에게 다른 줄이 없으면 그 사람의 옛 기록을 into 의 사람에게
 * 옮기고 사람도 지운다.
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

  await tx
    .update(nexonAccountKeys)
    .set({ nexonAccountId: into })
    .where(eq(nexonAccountKeys.nexonAccountId, from))
  await tx
    .update(nexonAccountMapleIds)
    .set({ nexonAccountId: into })
    .where(eq(nexonAccountMapleIds.nexonAccountId, from))

  // 합치면 자기 자신을 잇게 되는 등록과, into 가 이미 다른 로그인의 부계정일 때 from 의 등록은 지운다. 부계정은 로그인 하나에만 붙는다.
  await tx.execute(sql`
    DELETE FROM ${subAccounts}
     WHERE (login_account_id = ${from} AND sub_account_id = ${into})
        OR (login_account_id = ${into} AND sub_account_id = ${from})
        OR (sub_account_id = ${from}
            AND EXISTS (SELECT 1 FROM ${subAccounts} s WHERE s.sub_account_id = ${into}))`)
  await tx.update(subAccounts).set({ subAccountId: into }).where(eq(subAccounts.subAccountId, from))
  await tx
    .update(subAccounts)
    .set({ loginAccountId: into })
    .where(eq(subAccounts.loginAccountId, from))

  // 같은 열쇠의 강화 이상 보고가 양쪽에 있으면 늦게 고친 줄만 남긴다. 시각이 같으면 from 쪽을 버린다.
  await tx.execute(sql`
    DELETE FROM ${enhancementAnomalies} d USING ${enhancementAnomalies} o
     WHERE d.nexon_account_id IN (${from}, ${into}) AND o.nexon_account_id IN (${from}, ${into})
       AND d.nexon_account_id <> o.nexon_account_id
       AND d.history_date = o.history_date AND d.enhancement_type = o.enhancement_type
       AND d.anomaly_type = o.anomaly_type AND d.item_name = o.item_name
       AND (d.updated_at < o.updated_at OR (d.updated_at = o.updated_at AND d.nexon_account_id = ${from}))`)
  await tx
    .update(enhancementAnomalies)
    .set({ nexonAccountId: into })
    .where(eq(enhancementAnomalies.nexonAccountId, from))
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
 * 사람 칸으로 찾는 기록을 옮긴다. 1.0.13 앱의 드롭 줄은 사람 안에서 기록 id 로 유일해, 양쪽에 같은 기록이 있으면 늦게 고친 줄을
 * 남긴다. 옮기지 않으면 사람을 지울 때 사람 칸이 비어 익명 줄이 된다.
 */
async function moveLegacyRecords(tx: Tx, from: string, into: string): Promise<void> {
  await tx.execute(sql`
    DELETE FROM drop_prices d USING drop_prices o
     WHERE d.user_id IN (${from}, ${into}) AND o.user_id IN (${from}, ${into})
       AND d.user_id <> o.user_id AND d.drop_record_id = o.drop_record_id
       AND (d.updated_at < o.updated_at OR (d.updated_at = o.updated_at AND d.user_id = ${from}))`)
  await tx.execute(sql`UPDATE drop_prices SET user_id = ${into} WHERE user_id = ${from}`)
  await tx.execute(sql`UPDATE enhancement_anomalies SET user_id = ${into} WHERE user_id = ${from}`)
  await tx.execute(sql`UPDATE usage_events SET user_id = ${into} WHERE user_id = ${from}`)
}

interface Holder {
  id: string
  nexonUid: string | null
  createdAt: Date
  deletionRequestedAt: Date | null
}

const HOLDER_COLUMNS = {
  id: nexonAccounts.id,
  nexonUid: nexonAccounts.nexonUid,
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
  mapleIds: readonly string[],
): Promise<string> {
  const unique = [...new Set(mapleIds)]
  const [self] = await tx
    .select(HOLDER_COLUMNS)
    .from(nexonAccounts)
    .innerJoin(users, eq(users.id, nexonAccounts.userId))
    .where(eq(nexonAccounts.id, nexonAccountId))
  if (self === undefined) throw new Error('메이플 ID 를 적을 넥슨 계정 줄이 없다')
  if (unique.length === 0) return self.id

  const owners = await tx
    .selectDistinct(HOLDER_COLUMNS)
    .from(nexonAccountMapleIds)
    .innerJoin(nexonAccounts, eq(nexonAccounts.id, nexonAccountMapleIds.nexonAccountId))
    .innerJoin(users, eq(users.id, nexonAccounts.userId))
    .where(
      and(
        inArray(nexonAccountMapleIds.mapleId, unique),
        ne(nexonAccountMapleIds.nexonAccountId, self.id),
      ),
    )
  let group: Holder[] = [
    self,
    ...owners.filter(
      (owner) =>
        self.deletionRequestedAt === null &&
        owner.deletionRequestedAt === null &&
        !(self.nexonUid !== null && owner.nexonUid !== null),
    ),
  ]
  // 키 줄이 알린 메이플 ID 가 로그인 줄 둘에 걸치면 앞 로그인 줄 하나와만 합친다. 두 로그인 줄은 넥슨 ID 가 달라 합칠 수 없다.
  const logins = group.filter((holder) => holder.nexonUid !== null).sort(byAge)
  if (logins.length > 1) group = group.filter((h) => h.nexonUid === null || h.id === logins[0]?.id)
  const target = logins[0] ?? [...group].sort(byAge)[0] ?? self
  for (const holder of group) {
    if (holder.id !== target.id) await mergeNexonAccounts(tx, holder.id, target.id)
  }
  await tx
    .insert(nexonAccountMapleIds)
    .values(unique.map((mapleId) => ({ nexonAccountId: target.id, mapleId })))
    .onConflictDoNothing()
  return target.id
}

export async function mapleIdsOf(tx: Tx | Db, nexonAccountId: string): Promise<string[]> {
  const rows = await tx
    .select({ mapleId: nexonAccountMapleIds.mapleId })
    .from(nexonAccountMapleIds)
    .where(eq(nexonAccountMapleIds.nexonAccountId, nexonAccountId))
    .orderBy(asc(nexonAccountMapleIds.mapleId))
  return rows.map((row) => row.mapleId)
}
