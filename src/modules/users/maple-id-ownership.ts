import { and, eq, type SQL, sql } from 'drizzle-orm'

import type { Db } from '../../database/database.module'
import { nexonAccountMapleIds } from '../../database/schema'
import type { Tx } from './nexon-account-store'

/**
 * 기록의 메이플 ID 가 보낸 신원의 넥슨 계정에 없다. message 가 그 메이플 ID 다. 실패로 답해 앱 대기 표가 다시 보낸다. 메이플
 * ID 를 알리기 전에 보낸 기록도 다음 회차에 들어간다.
 */
export class MapleIdNotOwned extends Error {}

/** 남의 메이플 ID 를 아는 사람이 그 기록을 덮거나 막지 못하게, 보낸 넥슨 계정이 가진 메이플 ID 만 받는다. */
export async function assertOwnsMapleId(
  db: Db | Tx,
  nexonAccountId: string,
  mapleId: string,
): Promise<void> {
  const [row] = await db
    .select({ id: nexonAccountMapleIds.id })
    .from(nexonAccountMapleIds)
    .where(
      and(
        eq(nexonAccountMapleIds.mapleId, mapleId),
        eq(nexonAccountMapleIds.nexonAccountId, nexonAccountId),
      ),
    )
  if (row === undefined) throw new MapleIdNotOwned(mapleId)
}

/** 그 넥슨 계정이 가진 메이플 ID 들. 지우기 경로가 내 줄만 고르는 조건에 쓴다. */
export function ownedMapleIds(nexonAccountId: string): SQL {
  return sql`(SELECT maple_id FROM ${nexonAccountMapleIds} WHERE nexon_account_id = ${nexonAccountId})`
}
