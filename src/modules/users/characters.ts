import { and, eq, type SQL, sql } from 'drizzle-orm'

import { characters, mapleIds } from '../../database/schema'
import { assertOwnsMapleId, MapleIdNotOwned, ownedMapleIds } from './maple-id-ownership'
import type { Tx } from './nexon-account-store'

/**
 * 기록이 가리킬 캐릭터 줄 id. 기기는 이 id 를 모르고 메이플 ID 해시와 ocid 해시를 실어 올린다. 메이플 ID 가 보낸 신원의 것이
 * 아니거나, 그 ocid 의 캐릭터 줄이 다른 메이플 ID 아래에 있으면 MapleIdNotOwned 다. 캐릭터의 메이플 ID 는 바뀌지 않아, 다른
 * 메이플 ID 로 온 ocid 는 남의 캐릭터다. 줄이 없으면 만든다.
 */
export async function characterIdFor(
  tx: Tx,
  nexonAccountId: string,
  mapleIdHash: string,
  ocid: string,
): Promise<string> {
  const mapleId = await mapleIdRowFor(tx, nexonAccountId, mapleIdHash)
  await tx.insert(characters).values({ mapleId, ocid }).onConflictDoNothing()
  const [character] = await tx
    .select({ id: characters.id })
    .from(characters)
    .where(and(eq(characters.ocid, ocid), eq(characters.mapleId, mapleId)))
  if (character === undefined) throw new MapleIdNotOwned(mapleIdHash)
  return character.id
}

/** 기록이 가리킬 메이플 ID 줄 id. 보낸 신원이 쓸 수 있는 메이플 ID 가 아니면 MapleIdNotOwned 다. */
export async function mapleIdRowFor(
  tx: Tx,
  nexonAccountId: string,
  mapleIdHash: string,
): Promise<string> {
  await assertOwnsMapleId(tx, nexonAccountId, mapleIdHash)
  const [row] = await tx
    .select({ id: mapleIds.id })
    .from(mapleIds)
    .where(eq(mapleIds.hash, mapleIdHash))
  if (row === undefined) throw new MapleIdNotOwned(mapleIdHash)
  return row.id
}

/** 그 넥슨 계정이 쓸 수 있는 메이플 ID 줄 id 들 */
export function ownedMapleIdRows(nexonAccountId: string): SQL {
  return sql`(SELECT ${mapleIds.id} FROM ${mapleIds} WHERE ${mapleIds.hash} IN ${ownedMapleIds(nexonAccountId)})`
}

/** 그 넥슨 계정이 쓸 수 있는 메이플 ID 의 캐릭터 줄 id 들. 지우기 같은 쓰기가 남의 줄을 건드리지 않게 거른다. */
export function ownedCharacterIds(nexonAccountId: string): SQL {
  return sql`(SELECT ${characters.id} FROM ${characters}
     JOIN ${mapleIds} ON ${mapleIds.id} = ${characters.mapleId}
     WHERE ${mapleIds.hash} IN ${ownedMapleIds(nexonAccountId)})`
}
