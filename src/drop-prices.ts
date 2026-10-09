/**
 * 사용자가 적은 드롭 아이템 판매가를 받는 자리. 시세 추이의 표본이다(이슈 #610).
 *
 * **가격을 고칠 때마다 줄이 쌓이고 그중 `superseded_at` 이 NULL 인 하나만 유효하다.** 쌓기만
 * 하면 10억으로 적고 3억으로 고친 기록 하나가 분포에 두 번 센다.
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

/** 이 파일이 DB 에서 하는 일 전부. 진짜 구현은 `db.ts` 에 있고 테스트는 가짜를 넣는다. */
export interface DropPriceDeps {
  /** 그 기록의 **유효한 줄 하나**. 없으면 `null`(처음 보내는 것이거나 거둔 것이다). */
  currentDropPrice: (dropRecordId: string) => Promise<{ userId: string; priceMeso: number } | null>
  /** 유효한 줄에 `superseded_at` 을 적는다. 줄을 지우지 않는다. */
  supersedeDropPrice: (dropRecordId: string) => Promise<void>
  insertDropPrice: (userId: string, one: DropPrice) => Promise<void>
}

/**
 * 저장이 한 일. **`not_mine` 을 `unchanged` 로 뭉치지 않는다** - 뭉치면 남의 uuid 를 맞혔을 때
 * 돌아오는 답이 그 사람의 가격을 알아내는 재료가 된다.
 */
export type SaveOutcome = 'inserted' | 'unchanged' | 'not_mine'
export type WithdrawOutcome = 'withdrawn' | 'unchanged' | 'not_mine'

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
 * 가격 한 건을 적는다.
 *
 * **같은 가격이 다시 오면 아무것도 안 한다.** 응답만 유실돼 기기가 다시 보내는 경우이고, 줄이
 * 늘면 한 기록이 분포에 두 번 센다. 멱등을 제약이 아니라 이 비교가 만든다.
 *
 * **덮기가 넣기보다 먼저다.** 반대로 하면 유효한 줄이 둘인 순간이 생겨 `drop_prices_current` 가
 * 그 자리에서 막는다.
 */
export async function saveDropPrice(
  deps: DropPriceDeps,
  userId: string,
  one: DropPrice,
): Promise<SaveOutcome> {
  const current = await deps.currentDropPrice(one.dropRecordId)

  if (current !== null) {
    if (current.userId !== userId) return 'not_mine'
    if (current.priceMeso === one.priceMeso) return 'unchanged'
    await deps.supersedeDropPrice(one.dropRecordId)
  }

  await deps.insertDropPrice(userId, one)
  return 'inserted'
}

/**
 * 가격을 거둔다. 기기에서 그 기록이 사라졌거나 `'excluded'` 로 바뀐 경우다.
 *
 * **줄을 지우지 않는다.** 유효한 줄이 없는 상태가 「가격을 거뒀다」이고, 거둔 사실 자체가 노이즈
 * 관찰의 재료다.
 */
export async function withdrawDropPrice(
  deps: DropPriceDeps,
  userId: string,
  dropRecordId: string,
): Promise<WithdrawOutcome> {
  if (!UUID.test(dropRecordId)) return 'not_mine'

  const current = await deps.currentDropPrice(dropRecordId)
  if (current === null) return 'unchanged'
  if (current.userId !== userId) return 'not_mine'

  await deps.supersedeDropPrice(dropRecordId)
  return 'withdrawn'
}
