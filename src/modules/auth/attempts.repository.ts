import { Inject, Injectable } from '@nestjs/common'
import { and, eq, gt, isNotNull, isNull, sql } from 'drizzle-orm'

import { DB, type Db } from '../../database/database.module'
import { nexonLoginAttempts, type platformEnum } from '../../database/schema'

export type Platform = (typeof platformEnum.enumValues)[number]

/** 되묻는 창. 콜백이 봉한 시각부터 잰다. */
const REDEEM_WINDOW = sql`now() - interval '60 seconds'`
/** 봉한 짝과 콜백 도중에 죽은 짝을 두는 시간. 창이 닫힌 뒤에도 행이 이만큼 남는다. */
const SEALED_RETENTION = sql`now() - interval '2 minutes'`

/**
 * 로그인 짝. 시작 경로가 만들고, 콜백이 집어 봉하고, 앱이 되물어 가져간다.
 *
 * 한 짝의 단계는 세 칸이 말한다. claimed_at 이 없으면 아직 넥슨 화면이고, 있는데 sealed_at 이 없으면
 * 콜백이 넥슨과 왕복하는 중이며, 둘 다 있으면 앱이 가져가기를 기다리는 중이다.
 */
@Injectable()
export class AttemptsRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  async create(input: {
    state: string
    redeemHash: Buffer
    platform: Platform
    expiresAt: Date
  }): Promise<{ id: string }> {
    const [row] = await this.db
      .insert(nexonLoginAttempts)
      .values(input)
      .returning({ id: nexonLoginAttempts.id })
    if (row === undefined) throw new Error('insert 가 행을 안 돌려줬다')
    return row
  }

  /**
   * 콜백이 state 로 짝을 집는다. 한 문장이라 경합이 없고, 한 번 집힌 state 는 두 번째부터 null 이다.
   * state 는 리다이렉트 주소와 로그에 적혀 비밀이 아니므로 이 1회용이 재사용을 막는 유일한 자리다.
   */
  async claim(state: string): Promise<{ id: string; platform: Platform } | null> {
    const [row] = await this.db
      .update(nexonLoginAttempts)
      .set({ claimedAt: sql`now()` })
      .where(
        and(
          eq(nexonLoginAttempts.state, state),
          isNull(nexonLoginAttempts.claimedAt),
          gt(nexonLoginAttempts.expiresAt, sql`now()`),
        ),
      )
      .returning({ id: nexonLoginAttempts.id, platform: nexonLoginAttempts.platform })
    return row ?? null
  }

  /** 콜백이 세션을 만든 뒤 그 원본을 짝에 봉한다. receipt 는 여기서 만들어 돌아오는 길로만 보낸다. */
  async seal(
    id: string,
    input: { receiptHash: Buffer; sessionSealed: Buffer; sessionId: string },
  ): Promise<void> {
    await this.db
      .update(nexonLoginAttempts)
      .set({ ...input, sealedAt: sql`now()` })
      .where(eq(nexonLoginAttempts.id, id))
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(nexonLoginAttempts).where(eq(nexonLoginAttempts.id, id))
  }

  /**
   * 앱이 열쇠 둘로 봉한 세션을 가져간다. 가져가는 순간 행이 사라지므로 두 번 가져갈 수 없다.
   * 창은 봉한 시각부터 60초다. 콜백의 넥슨 왕복이 창을 깎지 않게 claimed_at 이 아니라 sealed_at 을 본다.
   */
  async redeem(redeemHash: Buffer, receiptHash: Buffer): Promise<Buffer | null> {
    const [row] = await this.db
      .delete(nexonLoginAttempts)
      .where(
        and(
          eq(nexonLoginAttempts.redeemHash, redeemHash),
          eq(nexonLoginAttempts.receiptHash, receiptHash),
          isNotNull(nexonLoginAttempts.sessionSealed),
          gt(nexonLoginAttempts.sealedAt, REDEEM_WINDOW),
        ),
      )
      .returning({ sessionSealed: nexonLoginAttempts.sessionSealed })
    return row?.sessionSealed ?? null
  }

  /** 가져가지 못했을 때 짝이 어느 단계인지 본다. 앱에 취소 · 진행 중 · 없음 중 무엇인지 답하는 근거다. */
  async peek(
    redeemHash: Buffer,
  ): Promise<{ claimedAt: Date | null; sealedAt: Date | null } | null> {
    const [row] = await this.db
      .select({ claimedAt: nexonLoginAttempts.claimedAt, sealedAt: nexonLoginAttempts.sealedAt })
      .from(nexonLoginAttempts)
      .where(eq(nexonLoginAttempts.redeemHash, redeemHash))
    return row ?? null
  }

  /**
   * 죽은 짝을 걷고, 봉한 채 남은 짝에 달린 세션을 고아로 보고 함께 지운다.
   *
   * 한 문장이어야 한다. 짝을 먼저 지우면 session_id 가 사라져 고아 세션을 영영 못 찾는다.
   * 세 조건은 집히지 않은 채 만료된 짝, 봉한 지 2분이 지난 짝, 집혔는데 2분 넘게 봉해지지 않은 짝이다.
   * 셋째는 콜백이 넥슨과 왕복하다 프로세스가 죽었을 때 남는 모양이다.
   */
  async sweep(): Promise<{ orphanSessions: number }> {
    const result = await this.db.execute(sql`
      WITH dead AS (
        DELETE FROM nexon_login_attempts
         WHERE (claimed_at IS NULL AND expires_at <= now())
            OR (sealed_at IS NOT NULL AND sealed_at <= ${SEALED_RETENTION})
            OR (claimed_at IS NOT NULL AND sealed_at IS NULL AND claimed_at <= ${SEALED_RETENTION})
        RETURNING session_id
      )
      DELETE FROM nexon_sessions
       WHERE id IN (SELECT session_id FROM dead WHERE session_id IS NOT NULL)
    `)
    return { orphanSessions: result.rowCount ?? 0 }
  }
}
