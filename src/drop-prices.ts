/**
 * 사용자가 적은 드롭 아이템 판매가를 받는 자리. 시세 추이의 표본이다(이슈 #610).
 *
 * **기록 하나에 한 줄이다.** 가격을 고치면 그 줄을 덮어쓰고 이력을 남기지 않는다(사용자 지정
 * 2026-10-10). 그래서 이 파일에 유효한 줄을 가리는 장치가 없다 - `drop_record_id` 의 `UNIQUE` 가
 * 그것을 맡고, 멱등도 그 제약이 공짜로 준다.
 *
 * **DB 를 인자로 받는다**(`DropPriceDeps`). 직접 import 하면 이 파일을 부르는 테스트가 전부 DB 를
 * 요구한다. `users.ts` · `api.ts` 가 이미 쓰는 모양과 같다.
 */

/** 한 건에 실려 오는 값. 분배 인원·비율·수수료는 내 몫을 세는 재료라 안 받는다. */
export interface DropPrice {
  /** 기기가 만든 v4 uuid. 같은 기록의 수정을 잇는 열쇠다. */
  dropRecordId: string
  itemKey: string
  /** **판매 총액**이다. 내 몫이 아니다. */
  priceMeso: number
  /** 주간은 리셋일 `YYYY-MM-DD`, 월간은 `YYYY-MM`. */
  periodKey: string
  worldKey: string | null
  ringLevel: number | null
  slot: string | null
}

/**
 * 이 파일이 DB 에서 하는 일 전부. 진짜 구현은 `db.ts` 에 있고 테스트는 가짜를 넣는다.
 *
 * **둘 다 한 문장이고 소유 확인을 그 문장이 든다.** 읽어서 비교한 뒤 쓰는 모양이 아니다 - 그
 * 사이에 다른 요청이 끼면 둘이 서로를 덮는다. 손댄 줄 수를 돌려주므로 0 이 「내 줄이 아니다」다.
 */
export interface DropPriceDeps {
  /** 넣거나 덮어쓴다. 남의 줄이면 아무것도 안 하고 0 을 돌려준다. */
  upsertDropPrice: (userId: string, one: DropPrice) => Promise<number>
  /** 가격을 뺀다. 줄은 남고 `deleted_at` 만 찬다. 남의 줄이거나 이미 뺐으면 0 이다. */
  deleteDropPrice: (userId: string, dropRecordId: string) => Promise<number>
}

/**
 * 저장이 한 일.
 *
 * **`unchanged` 가 없다.** 같은 값이 다시 와도 그냥 덮어쓰면 되고, 결과가 같으므로 가를 이유가
 * 없다. 줄을 쌓던 시절에는 그 구분이 「줄이 하나 더 생기나」를 갈랐다.
 */
export type SaveOutcome = 'saved' | 'not_mine'

/**
 * 빼기가 한 일.
 *
 * **`not_mine` 이 없다.** 손댄 줄이 0 인 경우가 셋인데(없는 기록 · 이미 뺀 기록 · 남의 기록) 앱이
 * 할 수 있는 일이 셋 다 없다. 가르려면 읽기가 한 번 더 필요하고 그 값을 쓸 자리가 없다.
 */
export type DeleteOutcome = 'deleted' | 'unchanged'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
/** 주간은 리셋일, 월간은 달. 달은 01~12 만 받는다. */
const PERIOD_KEY = /^\d{4}-(0[1-9]|1[0-2])(-\d{2})?$/

/** 없는 칸과 `null` 을 같은 뜻으로 읽는다. 옛 앱이 칸을 안 실어 보낼 수 있다. */
function optionalText(value: unknown): string | null | undefined {
  if (value === undefined || value === null) return null
  if (typeof value !== 'string' || value === '') return undefined
  return value
}

function optionalCount(value: unknown): number | null | undefined {
  if (value === undefined || value === null) return null
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) return undefined
  return value
}

/**
 * 계약을 지킨 본문만 통과시킨다. 어긴 본문은 `null` 이고 그 자리가 곧 400 이다.
 *
 * **가격을 안전 정수로 제한한다.** `bigint` 칸에 들어가지만 JSON 을 거치면 그보다 큰 수는 이미
 * 자리값이 틀어져 있어, 받아 봐야 틀린 값을 저장하는 것이다.
 */
export function parseDropPrice(value: unknown): DropPrice | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const one = value as Record<string, unknown>

  if (typeof one.dropRecordId !== 'string' || !UUID.test(one.dropRecordId)) return null
  if (typeof one.itemKey !== 'string' || one.itemKey === '') return null
  if (typeof one.periodKey !== 'string' || !PERIOD_KEY.test(one.periodKey)) return null

  const priceMeso = one.priceMeso
  if (typeof priceMeso !== 'number' || !Number.isSafeInteger(priceMeso) || priceMeso <= 0) {
    return null
  }

  const worldKey = optionalText(one.worldKey)
  const slot = optionalText(one.slot)
  const ringLevel = optionalCount(one.ringLevel)
  if (worldKey === undefined || slot === undefined || ringLevel === undefined) return null

  return {
    dropRecordId: one.dropRecordId,
    itemKey: one.itemKey,
    priceMeso,
    periodKey: one.periodKey,
    worldKey,
    ringLevel,
    slot,
  }
}

/**
 * 가격 한 건을 적는다. 처음이면 넣고 있으면 덮어쓴다.
 *
 * **남의 기록은 제약이 아니라 문장이 막는다.** uuid 를 맞혀도 그 줄의 주인이 다르면 손댄 줄이
 * 0 이다. 제약으로 풀려 하면(`user_id` 를 `UNIQUE` 에 엮으면) 같은 `drop_record_id` 로 줄이 둘
 * 생긴다.
 */
export async function saveDropPrice(
  deps: DropPriceDeps,
  userId: string,
  one: DropPrice,
): Promise<SaveOutcome> {
  const touched = await deps.upsertDropPrice(userId, one)
  return touched === 0 ? 'not_mine' : 'saved'
}

/**
 * 가격을 뺀다. 기기에서 그 기록이 사라졌거나 `'excluded'` 로 바뀐 경우다.
 *
 * **줄을 지우지 않는다.** 사용자 요청으로는 행을 안 지우기로 했으므로 `deleted_at` 이 그 자리를
 * 대신한다. 다시 적으면 그 칸이 `NULL` 로 돌아간다.
 *
 * 이미 뺐거나 애초에 없던 기록, 그리고 남의 기록이 모두 `unchanged` 다 - 앱이 하려던 일이
 * 이뤄진 상태이거나, 무엇을 해도 안 되는 상태다.
 */
export async function deleteDropPrice(
  deps: DropPriceDeps,
  userId: string,
  dropRecordId: string,
): Promise<DeleteOutcome> {
  if (!UUID.test(dropRecordId)) return 'unchanged'

  const touched = await deps.deleteDropPrice(userId, dropRecordId)
  return touched === 0 ? 'unchanged' : 'deleted'
}
