import { type SQL, sql } from 'drizzle-orm'

import type { Db } from '../../database/database.module'
import { mapleIds, subAccountRegistrations } from '../../database/schema'
import type { Tx } from './nexon-account-store'

/**
 * 기록의 메이플 ID 가 보낸 신원의 것이 아니다. message 가 그 메이플 ID 다. 실패로 답해 앱 대기 표가 다시 보낸다. 메이플
 * ID 를 알리기 전에 보낸 기록도 다음 회차에 들어간다.
 */
export class MapleIdNotOwned extends Error {}

/**
 * 그 넥슨 계정이 쓸 수 있는 메이플 ID 해시들. 자기 메이플 ID 와, 로그인이면 그 로그인에 등록된 부계정의 메이플 ID 다. 부계정의
 * 기록은 1.0.15 부터 로그인의 세션으로 온다. 로그인 없는 계정에는 등록된 부계정이 없어 자기 것만 나온다.
 */
export function ownedMapleIds(nexonAccountId: string): SQL {
  return sql`(SELECT ${mapleIds.hash} FROM ${mapleIds}
     WHERE ${mapleIds.nexonAccountId} = ${nexonAccountId}
        OR ${mapleIds.nexonAccountId} IN (SELECT ${subAccountRegistrations.subNexonAccountId} FROM ${subAccountRegistrations}
                                          WHERE ${subAccountRegistrations.loginNexonAccountId} = ${nexonAccountId}))`
}

/** 남의 메이플 ID 를 아는 사람이 그 기록을 덮거나 막지 못하게, 보낸 신원이 쓸 수 있는 메이플 ID 만 받는다. */
export async function assertOwnsMapleId(
  db: Db | Tx,
  nexonAccountId: string,
  mapleId: string,
): Promise<void> {
  const result = await db.execute<{ owned: boolean }>(
    sql`SELECT ${mapleId} IN ${ownedMapleIds(nexonAccountId)} AS owned`,
  )
  if (result.rows[0]?.owned !== true) throw new MapleIdNotOwned(mapleId)
}
