import { and, eq, sql } from 'drizzle-orm'
import type { PgTable } from 'drizzle-orm/pg-core'

import { characters } from '../../database/schema'
import { mapleIdRowFor } from '../users/characters'
import type { Tx } from '../users/nexon-account-store'
import type { RecordOwner } from '../users/owner-locks'
import { mapleIdOwner } from './sync-table'

/**
 * 캐릭터가 주인인 줄의 주인 메이플 ID. 기기는 지운 뒤에 보내 주인을 몰라 서버가 줄에서 찾는다. 줄이 없으면 잠글 것이 없다.
 * 표는 `character_id` 칸을 가진 기록 표여야 한다.
 */
export async function characterRowOwners(
  tx: Tx,
  table: PgTable,
  id: string,
): Promise<RecordOwner[]> {
  const result = await tx.execute<{ hash: string }>(sql`
    SELECT m.hash FROM ${table} t
      JOIN characters c ON c.id = t.character_id
      JOIN maple_ids m ON m.id = c.maple_id
     WHERE t.id = ${id}`)
  return result.rows.map((row) => mapleIdOwner(row.hash))
}

/** 메이플 ID 가 주인인 줄의 주인 메이플 ID. 표는 `maple_id` 칸을 가진 기록 표여야 한다. */
export async function mapleIdRowOwners(tx: Tx, table: PgTable, id: string): Promise<RecordOwner[]> {
  const result = await tx.execute<{ hash: string }>(sql`
    SELECT m.hash FROM ${table} t JOIN maple_ids m ON m.id = t.maple_id WHERE t.id = ${id}`)
  return result.rows.map((row) => mapleIdOwner(row.hash))
}

/**
 * 지우기가 가리키는 캐릭터 줄 id. 올리기와 달리 줄이 없으면 만들지 않고 null 이다. 지울 줄도 없기 때문이다. 메이플 ID 가 보낸
 * 신원의 것이 아니면 MapleIdNotOwned 다.
 */
export async function existingCharacterId(
  tx: Tx,
  nexonAccountId: string,
  mapleIdHash: string,
  ocid: string,
): Promise<string | null> {
  const mapleId = await mapleIdRowFor(tx, nexonAccountId, mapleIdHash)
  const [row] = await tx
    .select({ id: characters.id })
    .from(characters)
    .where(and(eq(characters.ocid, ocid), eq(characters.mapleId, mapleId)))
  return row?.id ?? null
}

/** 캐릭터 기록의 응답 꼴. 캐릭터 줄 id 대신 메이플 ID 해시와 ocid 해시를 싣는다. 기기는 캐릭터를 ocid 로 가리킨다. */
export function characterWire<T extends { characterId: string }>(
  row: T,
  mapleIdHash: string,
  ocid: string,
): Omit<T, 'characterId'> & { mapleId: string; ocid: string } {
  return { ...omit(row, ['characterId']), mapleId: mapleIdHash, ocid }
}

/** 메이플 ID 기록의 응답 꼴. 메이플 ID 줄 id 대신 해시를 싣는다. */
export function mapleIdWire<T extends { mapleId: string }>(
  row: T,
  mapleIdHash: string,
): Omit<T, 'mapleId'> & { mapleId: string } {
  return { ...row, mapleId: mapleIdHash }
}

/** 칸 몇 개를 뺀 사본. 응답에 서버 안의 줄 id 를 싣지 않을 때 쓴다. */
export function omit<T extends object, K extends keyof T>(
  value: T,
  keys: readonly K[],
): Omit<T, K> {
  return Object.fromEntries(
    Object.entries(value).filter(([key]) => !(keys as readonly PropertyKey[]).includes(key)),
  ) as Omit<T, K>
}
