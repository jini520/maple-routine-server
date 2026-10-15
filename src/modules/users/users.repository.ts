import { Inject, Injectable } from '@nestjs/common'
import { eq, sql } from 'drizzle-orm'

import { DB, type Db } from '../../database/database.module'
import { users } from '../../database/schema'

@Injectable()
export class UsersRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** 넥슨 uid 로 사람을 하나로 묶는다. 탈퇴 표시는 다시 로그인한 순간 거둔다. */
  async upsertByNexonUid(nexonUid: string): Promise<{ id: string }> {
    const [row] = await this.db
      .insert(users)
      .values({ nexonUid })
      .onConflictDoUpdate({ target: users.nexonUid, set: { deletedAt: null } })
      .returning({ id: users.id })
    if (row === undefined) throw new Error('upsert 가 행을 안 돌려줬다')
    return row
  }

  /** 키 해시로 사람을 하나로 묶는다. 처음 보는 해시는 사람을 만든다. 증명은 없고 표본을 묶는 꼬리표다. */
  async upsertByApiKeyHash(apiKeyHash: Buffer): Promise<{ id: string }> {
    const [row] = await this.db
      .insert(users)
      .values({ apiKeyHash })
      .onConflictDoUpdate({ target: users.apiKeyHash, set: { deletedAt: null } })
      .returning({ id: users.id })
    if (row === undefined) throw new Error('upsert 가 행을 안 돌려줬다')
    return row
  }

  /** 탈퇴를 적는다. 이미 적힌 시각은 안 덮는다. 처음 탈퇴한 때가 답이어야 한다. */
  async markDeleted(id: string): Promise<void> {
    await this.db
      .update(users)
      .set({ deletedAt: sql`COALESCE(${users.deletedAt}, now())` })
      .where(eq(users.id, id))
  }
}
