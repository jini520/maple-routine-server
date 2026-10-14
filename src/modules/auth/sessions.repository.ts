import { Inject, Injectable } from '@nestjs/common'
import { eq, lte, sql } from 'drizzle-orm'

import { DB, type Db } from '../../database/database.module'
import { nexonSessions } from '../../database/schema'
import type { Platform } from './attempts.repository'

export interface SessionRow {
  id: string
  userId: string
  platform: Platform
  accessSealed: Buffer
  accessExpiresAt: Date
  refreshSealed: Buffer
  refreshExpiresAt: Date
}

export interface SealedTokens {
  accessSealed: Buffer
  accessExpiresAt: Date
  refreshSealed: Buffer
  refreshExpiresAt: Date
}

const SESSION_COLUMNS = {
  id: nexonSessions.id,
  userId: nexonSessions.userId,
  platform: nexonSessions.platform,
  accessSealed: nexonSessions.accessSealed,
  accessExpiresAt: nexonSessions.accessExpiresAt,
  refreshSealed: nexonSessions.refreshSealed,
  refreshExpiresAt: nexonSessions.refreshExpiresAt,
}

/** 세션. 앱이 든 값은 해시로만 있고 넥슨 토큰은 봉한 채로 있다. */
@Injectable()
export class SessionsRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  async create(
    input: { sessionHash: Buffer; userId: string; platform: Platform } & SealedTokens,
  ): Promise<{ id: string }> {
    const [row] = await this.db
      .insert(nexonSessions)
      .values(input)
      .returning({ id: nexonSessions.id })
    if (row === undefined) throw new Error('insert 가 행을 안 돌려줬다')
    return row
  }

  async findByHash(sessionHash: Buffer): Promise<SessionRow | null> {
    const [row] = await this.db
      .select(SESSION_COLUMNS)
      .from(nexonSessions)
      .where(eq(nexonSessions.sessionHash, sessionHash))
    return row ?? null
  }

  async findById(id: string): Promise<SessionRow | null> {
    const [row] = await this.db
      .select(SESSION_COLUMNS)
      .from(nexonSessions)
      .where(eq(nexonSessions.id, id))
    return row ?? null
  }

  async updateTokens(id: string, tokens: SealedTokens): Promise<void> {
    await this.db.update(nexonSessions).set(tokens).where(eq(nexonSessions.id, id))
  }

  async touch(id: string): Promise<void> {
    await this.db
      .update(nexonSessions)
      .set({ lastUsedAt: sql`now()` })
      .where(eq(nexonSessions.id, id))
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(nexonSessions).where(eq(nexonSessions.id, id))
  }

  async deleteByHash(sessionHash: Buffer): Promise<void> {
    await this.db.delete(nexonSessions).where(eq(nexonSessions.sessionHash, sessionHash))
  }

  /** 갱신 토큰이 죽은 세션은 누구에게도 쓸모가 없다. 추론이 아니라 기록이라 그냥 지운다. */
  async deleteExpired(): Promise<number> {
    const rows = await this.db
      .delete(nexonSessions)
      .where(lte(nexonSessions.refreshExpiresAt, sql`now()`))
      .returning({ id: nexonSessions.id })
    return rows.length
  }
}
