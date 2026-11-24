import { sql } from 'drizzle-orm'

import type { Tx } from '../users/nexon-account-store'

/** 한 보스 난이도의 드롭 표가 드롭의 상자를 하나로 정하지 못하게 하는 저장. message 가 관리 화면에 그대로 뜸 */
export class AmbiguousDropBox extends Error {}

type Conflict = { boss: string; difficulty: string; item: string }

/**
 * 그 난이도들의 드롭 표가 상자를 하나로 정하는지 보는 검사. 드롭 기록은 상자를 적지 않아, 한 난이도가 직접 주는 아이템이 그
 * 난이도의 상자에도 들거나 한 난이도의 두 상자에 같은 아이템이 들면 어느 쪽에서 나왔는지 가를 수 없음. 어기면 AmbiguousDropBox
 *
 * @param bossDifficultyIds 방금 고친 난이도 줄 id. 저장과 같은 트랜잭션에서 불러 어기면 저장이 되돌아감
 */
export async function assertSingleDropBox(
  tx: Tx,
  bossDifficultyIds: readonly string[],
): Promise<void> {
  if (bossDifficultyIds.length === 0) return
  const ids = sql.join(
    bossDifficultyIds.map((id) => sql`${id}::uuid`),
    sql`, `,
  )
  const direct = await tx.execute<Conflict>(sql`
    SELECT b.key AS boss, d.difficulty, i.key AS item
      FROM boss_difficulty_rewards box_reward
      JOIN drop_boxes box ON box.item_id = box_reward.item_id
      JOIN drop_box_contents content ON content.box_id = box.id
      JOIN boss_difficulty_rewards direct_reward
        ON direct_reward.boss_difficulty_id = box_reward.boss_difficulty_id
       AND direct_reward.item_id = content.item_id
      JOIN boss_difficulties d ON d.id = box_reward.boss_difficulty_id
      JOIN bosses b ON b.id = d.boss_id
      JOIN items i ON i.id = content.item_id
     WHERE box_reward.boss_difficulty_id IN (${ids})
     LIMIT 1`)
  const [both] = direct.rows
  if (both !== undefined) {
    throw new AmbiguousDropBox(
      `한 난이도가 직접 주는 아이템을 그 난이도의 상자에도 넣을 수 없다: ${both.boss}/${both.difficulty} ${both.item}`,
    )
  }
  const twice = await tx.execute<Conflict>(sql`
    SELECT b.key AS boss, d.difficulty, i.key AS item
      FROM boss_difficulty_rewards first_reward
      JOIN drop_boxes first_box ON first_box.item_id = first_reward.item_id
      JOIN drop_box_contents first_content ON first_content.box_id = first_box.id
      JOIN boss_difficulty_rewards second_reward
        ON second_reward.boss_difficulty_id = first_reward.boss_difficulty_id
       AND second_reward.item_id <> first_reward.item_id
      JOIN drop_boxes second_box ON second_box.item_id = second_reward.item_id
      JOIN drop_box_contents second_content
        ON second_content.box_id = second_box.id
       AND second_content.item_id = first_content.item_id
      JOIN boss_difficulties d ON d.id = first_reward.boss_difficulty_id
      JOIN bosses b ON b.id = d.boss_id
      JOIN items i ON i.id = first_content.item_id
     WHERE first_reward.boss_difficulty_id IN (${ids})
     LIMIT 1`)
  const [shared] = twice.rows
  if (shared !== undefined) {
    throw new AmbiguousDropBox(
      `한 난이도의 두 상자에 같은 아이템을 넣을 수 없다: ${shared.boss}/${shared.difficulty} ${shared.item}`,
    )
  }
}
