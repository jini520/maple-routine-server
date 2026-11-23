import { Inject, Injectable } from '@nestjs/common'

import { ERROR_CODES, type ErrorCode } from '../../common/error-codes'
import { isCheckViolation, isForeignKeyViolation, isUniqueViolation } from '../../common/pg-errors'
import { DB, type Db } from '../../database/database.module'
import type { IdentityContext } from '../identity/identity.guard'
import { MapleIdNotOwned } from '../users/maple-id-ownership'
import { lockOwners } from '../users/owner-locks'
import { pushRecord } from './sync.dto'
import { DuplicateRecord, RecordDeleted, RecordRejected } from './sync-write'
import { TABLE_WRITERS } from './tables'

/**
 * 올린 기록 한 건의 결과. 차례는 올린 기록의 차례와 같다. id 는 서버에 남은 줄의 id 다. 유일 기준이 같은 줄로 합쳐졌거나 기기에
 * id 가 없는 표면 기기가 보낸 id 와 다르고, 기기는 다음 받기에서 자기 줄을 그 id 로 바꾼다. 지울 줄이 없던 지우기는 null 이다.
 * 거절은 정해진 코드가 있으면 code 를 싣고, 나중에 맞을 수 있는 거절은 code 가 null 이다.
 */
export type PushResult =
  | { recordId: string | null; ok: true; id: string | null }
  | { recordId: string | null; ok: false; code: ErrorCode | null; reason: string }

/** 결과에 붙일 기록 id. 몸이 틀려도 기기가 어느 건인지 알게 row 의 id 를 꺼낸다. */
function recordIdOf(raw: unknown): string | null {
  if (typeof raw !== 'object' || raw === null) return null
  const row = (raw as { row?: unknown }).row
  if (typeof row !== 'object' || row === null) return null
  const id = (row as { id?: unknown }).id
  return typeof id === 'string' ? id : null
}

/** 아는 거절을 결과로 바꾼다. 모르는 오류는 서버 잘못이라 null 을 돌려주고 요청 전체가 500 이 된다. */
function rejectionOf(error: unknown): { code: ErrorCode | null; reason: string } | null {
  if (error instanceof MapleIdNotOwned) {
    return {
      code: ERROR_CODES.mapleIdNotRegistered,
      reason: `이 신원의 메이플 ID 가 아니다: ${error.message}`,
    }
  }
  if (error instanceof DuplicateRecord || isUniqueViolation(error)) {
    return { code: ERROR_CODES.duplicateRecord, reason: '함께 있을 수 없는 기록이 이미 있다' }
  }
  if (error instanceof RecordDeleted) {
    return { code: ERROR_CODES.recordDeleted, reason: '다른 기기에서 지운 기록이다' }
  }
  if (error instanceof RecordRejected) return { code: null, reason: error.message }
  if (isForeignKeyViolation(error)) return { code: null, reason: '가리키는 줄이 표에 없다' }
  if (isCheckViolation(error)) return { code: null, reason: '칸끼리 맞지 않는다' }
  return null
}

/**
 * 동기화의 올리기. 종류를 섞은 기록을 한 건씩 자기 트랜잭션에서 적는다. 한 건의 거절이 다른 건을 막지 않는다. 통째로 거절하면
 * 앱이 같은 묶음을 계속 다시 보내 그 사용자의 올리기가 멈춘다. 적기 전에 그 기록의 주인을 잠근다.
 */
@Injectable()
export class SyncPushRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  async push(identity: IdentityContext, records: readonly unknown[]): Promise<PushResult[]> {
    const results: PushResult[] = []
    for (const raw of records) results.push(await this.pushOne(identity, raw))
    return results
  }

  private async pushOne(identity: IdentityContext, raw: unknown): Promise<PushResult> {
    const recordId = recordIdOf(raw)
    const envelope = pushRecord.safeParse(raw)
    if (!envelope.success) {
      return { recordId, ok: false, code: null, reason: '기록의 table · action · row 가 틀렸다' }
    }
    const { table, action, row } = envelope.data
    const prepared = TABLE_WRITERS[table].prepare(action, row)
    if ('reason' in prepared) return { recordId, ok: false, code: null, reason: prepared.reason }
    try {
      const id = await this.db.transaction(async (tx) => {
        const ctx = { tx, identity }
        await lockOwners(tx, await prepared.owners(ctx), 'write')
        return prepared.run(ctx)
      })
      return { recordId, ok: true, id }
    } catch (error) {
      const rejection = rejectionOf(error)
      if (rejection === null) throw error
      return { recordId, ok: false, ...rejection }
    }
  }
}
