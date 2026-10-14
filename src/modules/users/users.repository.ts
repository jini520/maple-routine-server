import { Inject, Injectable } from '@nestjs/common'

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
}
