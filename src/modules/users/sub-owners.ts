import { type AnyColumn, type SQL, sql } from 'drizzle-orm'

/**
 * 부계정의 사람과 그 계정을 등록한 로그인의 사람. 사람을 세는 질의가 왼쪽 조인으로 붙인다.
 *
 * 사람 줄은 넥슨 ID 마다 따로 두고 셀 때만 묶는다. 줄을 합치면 부계정의 키로 한 계정 삭제가 메인의 기록까지 지운다.
 */
export const SUB_OWNERS = sql`(
  select distinct on (sa.user_id) sa.user_id as sub_user_id, la.user_id as owner_user_id
    from sub_accounts s
    join nexon_accounts sa on sa.id = s.sub_account_id
    join nexon_accounts la on la.id = s.login_account_id
   order by sa.user_id, s.created_at
) so`

/** `SUB_OWNERS` 를 붙이는 조건. */
export const subOwnerOf = (userId: AnyColumn): SQL => sql`so.sub_user_id = ${userId}`

/** 부계정이면 메인의 사람, 아니면 그 사람. `SUB_OWNERS` 를 붙인 질의에서만 쓴다. */
export const personOf = (userId: AnyColumn): SQL => sql`coalesce(so.owner_user_id, ${userId})`
