import { and, gt, isNull, type SQL } from 'drizzle-orm'
import type { PgColumn } from 'drizzle-orm/pg-core'
import type { z } from 'zod'

import type { Tx } from '../users/nexon-account-store'
import type { RecordOwner } from '../users/owner-locks'
import type { SyncTableName } from './sync.dto'
import type { WriteContext } from './sync-write'

/** 받기가 돌려주는 줄 하나. 표 이름과 변경 번호를 붙여 주인마다 번호 차례로 모은다. */
export interface PulledRow {
  table: SyncTableName
  changeSeq: number
  row: Record<string, unknown>
}

/** 받기가 읽는 메이플 ID 주인. 줄 id 로 찾고 응답에는 해시를 싣는다. */
export interface MapleIdOwner {
  id: string
  hash: string
}

/** 한 주인의 바뀐 줄을 번호 차례로 limit 줄까지 읽는다. after 가 0 이면 지운 줄은 뺀다. 처음 받는 기기에는 지울 줄이 없다. */
export type MapleIdReader = (
  tx: Tx,
  owner: MapleIdOwner,
  after: number,
  limit: number,
) => Promise<PulledRow[]>
export type NexonAccountReader = (
  tx: Tx,
  nexonAccountId: string,
  after: number,
  limit: number,
) => Promise<PulledRow[]>

/** 변경 번호가 after 보다 큰 줄. after 가 0 이면 지운 줄은 뺀다. */
export function changedAfter(changeSeq: PgColumn, deletedAt: PgColumn | null, after: number): SQL {
  const changed = gt(changeSeq, after)
  if (after > 0 || deletedAt === null) return changed
  return and(changed, isNull(deletedAt)) as SQL
}

/** 표 하나의 올리기. 몸의 검사 · 잠글 주인 · 쓰기다. 지우기가 없는 표는 deleteRow 가 null 이다. */
export interface TableDefinition<U, D> {
  upsertRow: z.ZodType<U>
  deleteRow: z.ZodType<D> | null
  /** 쓰기 전에 잠글 주인. 줄을 적기 전에 잠가야 변경 번호의 차례가 커밋 차례와 같다. */
  upsertOwners(ctx: WriteContext, row: U): Promise<RecordOwner[]>
  /** 서버에 남은 줄의 id 를 돌려준다. */
  upsert(ctx: WriteContext, row: U): Promise<string>
  deleteOwners?(ctx: WriteContext, row: D): Promise<RecordOwner[]>
  /** 지운 줄의 id 를 돌려준다. 지울 줄이 없으면 null 이다. */
  remove?(ctx: WriteContext, row: D): Promise<string | null>
}

/** 검사를 마친 기록 한 건. 잠글 주인을 찾고 적는다. */
export interface PreparedWrite {
  owners(ctx: WriteContext): Promise<RecordOwner[]>
  run(ctx: WriteContext): Promise<string | null>
}

/** 표 이름으로 고른 올리기. 몸이 틀리면 이유를 돌려준다. */
export interface TableWriter {
  prepare(action: 'upsert' | 'delete', raw: unknown): PreparedWrite | { reason: string }
}

/** 표마다 다른 몸의 형을 한 모양의 올리기로 감싼다. */
export function defineTable<U, D>(definition: TableDefinition<U, D>): TableWriter {
  return {
    prepare(action, raw) {
      if (action === 'upsert') {
        const parsed = definition.upsertRow.safeParse(raw)
        if (!parsed.success) return { reason: reasonOf(parsed.error) }
        const row = parsed.data
        return {
          owners: (ctx) => definition.upsertOwners(ctx, row),
          run: (ctx) => definition.upsert(ctx, row),
        }
      }
      const { deleteRow } = definition
      if (deleteRow === null || !definition.deleteOwners || !definition.remove) {
        return { reason: '지우기가 없는 표다' }
      }
      const parsed = deleteRow.safeParse(raw)
      if (!parsed.success) return { reason: reasonOf(parsed.error) }
      const row = parsed.data
      return {
        owners: (ctx) => definition.deleteOwners!(ctx, row),
        run: (ctx) => definition.remove!(ctx, row),
      }
    },
  }
}

function reasonOf(error: z.ZodError): string {
  return error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')
}

/** 메이플 ID 해시 하나를 주인으로 */
export const mapleIdOwner = (hash: string): RecordOwner => ({ type: 'maple_id', hash })

/** 보낸 신원의 넥슨 계정을 주인으로 */
export const nexonAccountOwner = (ctx: WriteContext): RecordOwner => ({
  type: 'nexon_account',
  id: ctx.identity.nexonAccountId,
})
