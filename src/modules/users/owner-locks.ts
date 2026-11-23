import { createHash } from 'node:crypto'

import { sql } from 'drizzle-orm'

import type { Tx } from './nexon-account-store'

/**
 * 기록의 주인. 메이플 ID 는 해시로, 사람은 그 사람의 넥슨 계정 줄 id 로 가린다. 기기는 주인마다 마지막으로 받은 변경 번호를
 * 기억한다.
 */
export type RecordOwner = { type: 'maple_id'; hash: string } | { type: 'nexon_account'; id: string }

/** 주인 하나의 잠금 열쇠. 다른 잠금(`hashtext('nexon_accounts')`)과 겹치지 않게 앞말을 붙여 64비트로 줄인다. */
function lockKeyOf(owner: RecordOwner): bigint {
  const text =
    owner.type === 'maple_id'
      ? `record-owner:maple_id:${owner.hash}`
      : `record-owner:nexon_account:${owner.id}`
  return createHash('sha256').update(text, 'utf8').digest().readBigInt64BE(0)
}

/**
 * 주인들의 잠금을 트랜잭션이 끝날 때까지 쥔다. 쓰기는 혼자 쥐고 받기는 함께 쥔다.
 *
 * 변경 번호는 서버 전체의 순번이라 번호를 받은 차례와 커밋 차례가 다를 수 있다. 한 주인의 쓰기를 한 줄로 세워야 받기가 지나간 뒤에
 * 더 작은 번호의 줄이 나타나지 않는다. 받기는 함께 쥐어, 도는 쓰기가 끝난 뒤에 읽고 읽는 동안 새 쓰기를 세운다. 그래야 그 주인을
 * 다 읽었을 때 순번의 지금 값을 다음 번호로 돌려줄 수 있다. 쓰는 쪽은 줄을 적기 전에 잠가야 한다. 열쇠를 정렬해 잠가 두
 * 트랜잭션이 서로를 기다리지 않게 한다.
 */
export async function lockOwners(
  tx: Tx,
  owners: readonly RecordOwner[],
  mode: 'write' | 'read',
): Promise<void> {
  const keys = [...new Set(owners.map(lockKeyOf))].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
  for (const key of keys) {
    await tx.execute(
      mode === 'write'
        ? sql`SELECT pg_advisory_xact_lock(${key.toString()}::bigint)`
        : sql`SELECT pg_advisory_xact_lock_shared(${key.toString()}::bigint)`,
    )
  }
}
