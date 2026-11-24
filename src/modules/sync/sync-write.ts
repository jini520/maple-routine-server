import { eq } from 'drizzle-orm'
import type { AnyPgColumn, PgTable } from 'drizzle-orm/pg-core'

import type { IdentityContext } from '../identity/identity.guard'
import type { Tx } from '../users/nexon-account-store'

/** 올리기 한 건을 적는 트랜잭션과 보낸 신원 */
export interface WriteContext {
  tx: Tx
  identity: IdentityContext
}

/** 유일 기준이 같은데 내용이 다른 기록이 다른 기록 id 로 이미 있다. 먼저 도착한 줄이 남는다. */
export class DuplicateRecord extends Error {}

/** 삭제 표식이 선 기록을 고치려 했다. 다른 기기가 지운 기록이다. */
export class RecordDeleted extends Error {}

/**
 * 코드 없이 거절하는 기록. message 가 이유다. 앱은 다섯 번까지 다시 보낸다. 나중에 맞을 수 있는 경우(부모 줄이 아직 없다)와
 * 기록의 모양이 틀린 경우(기간 값이 난이도의 주기와 다르다)다.
 */
export class RecordRejected extends Error {}

/** 대상 칸이 가리키는 표. 줄 id 칸으로 찾는다. */
export type TargetTable = PgTable & { id: AnyPgColumn }

/** 대상 줄 id 가 종류가 말하는 표에 있는지. 대상 칸 하나가 여러 표를 가리켜 DB 참조를 걸 수 없어 쓰는 코드가 본다. */
export async function assertTarget(tx: Tx, table: TargetTable, id: string): Promise<void> {
  const [row] = await tx.select({ id: table.id }).from(table).where(eq(table.id, id))
  if (row === undefined) throw new RecordRejected(`종류가 말하는 표에 없는 대상이다: ${id}`)
}

/** 칸 값 둘이 같은지. 시각은 순간으로, 배열은 차례까지 견준다. 빈 칸은 null 과 undefined 를 같게 본다. */
function sameValue(a: unknown, b: unknown): boolean {
  if (a instanceof Date || b instanceof Date) {
    return a instanceof Date && b instanceof Date && a.getTime() === b.getTime()
  }
  if (Array.isArray(a) || Array.isArray(b)) return JSON.stringify(a) === JSON.stringify(b)
  return (a ?? null) === (b ?? null)
}

/** 유일 기준이 같은 두 줄의 내용이 같은지. 표마다 견주는 칸을 받는다. */
export function sameContent<T extends object>(
  existing: T,
  incoming: Partial<T>,
  columns: readonly (keyof T)[],
): boolean {
  return columns.every((column) => sameValue(existing[column], incoming[column]))
}

/** 기기에 id 가 있는 기록 한 줄을 적는 단계. 표마다 줄을 읽고 쓰는 질의를 넘긴다. */
export interface DeviceRowWrite<Row extends { id: string; deletedAt: Date | null }> {
  id: string
  /** 같은 id 의 서버 줄과 그 줄이 보낸 신원의 것인지 */
  existing: { row: Row; owned: boolean } | undefined
  /**
   * 유일 기준이 같고 id 가 다른 줄. 살아 있는 줄을 먼저 찾는다. 표의 유일 기준이 지운 줄도 쥐는 표(부분 인덱스가 아닌 UNIQUE)는
   * 지운 줄도 찾는다. 지운 줄이 자리를 쥐어 새 줄을 넣을 수 없기 때문이다.
   */
  sameKey: Row | undefined
  isSameContent(row: Row): boolean
  insert(): Promise<void>
  /** 받은 값으로 같은 id 의 줄을 고친다. */
  update(): Promise<void>
  /** 받은 값을 그 id 의 지운 줄에 적고 삭제 표식을 걷는다. */
  revive(id: string): Promise<void>
  /** 받은 id 의 줄에 삭제 표식을 적는다. 다른 줄로 합쳐져 없어진 기록이다. 딸린 줄이 있는 표는 함께 지운다. */
  discard(id: string): Promise<void>
}

/**
 * 기기에 id 가 있는 기록을 적고 서버에 남은 줄의 id 를 돌려준다.
 *
 * 같은 id 는 나중에 도착한 값으로 덮는다. 남의 줄이면 적지 않고, 지운 줄이면 RecordDeleted 다. 유일 기준이 같은 다른 줄이
 * 살아 있으면 내용이 같을 때 그 줄의 id 를 돌려주고 받은 기록은 적지 않는다. 받은 id 의 줄이 이미 있었으면 그 줄은 합쳐져
 * 없어진 것이라 지운다. 그러지 않으면 다른 기기에 옛 값으로 남는다. 내용이 다르면 DuplicateRecord 다. 같은 기준의 지운 줄만
 * 있고 표의 UNIQUE 가 그 줄을 쥐면 그 줄을 받은 값으로 되살리고 그 줄의 id 를 돌려준다.
 */
export async function writeDeviceRow<Row extends { id: string; deletedAt: Date | null }>(
  write: DeviceRowWrite<Row>,
): Promise<string> {
  const { existing, sameKey } = write
  if (existing !== undefined && !existing.owned) {
    throw new RecordRejected('다른 사람의 기록 id 다')
  }
  if (existing !== undefined && existing.row.deletedAt !== null) throw new RecordDeleted()
  if (sameKey !== undefined) {
    if (sameKey.deletedAt !== null) {
      await write.revive(sameKey.id)
    } else if (!write.isSameContent(sameKey)) {
      throw new DuplicateRecord()
    }
    if (existing !== undefined) await write.discard(write.id)
    return sameKey.id
  }
  if (existing === undefined) await write.insert()
  else await write.update()
  return write.id
}
