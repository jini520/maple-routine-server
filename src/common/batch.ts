import { z, type ZodType } from 'zod'

/** 묶음 한 번에 받는 건수. 앱이 과거 기록을 이만큼씩 나눠 보낸다. */
export const BATCH_LIMIT = 100

/** 묶음 본문. 건마다 따로 검사하므로 여기서는 배열의 길이만 본다. */
export const batchBody = z.object({ items: z.array(z.unknown()).min(1).max(BATCH_LIMIT) })
export type BatchBody = z.infer<typeof batchBody>

/** 한 건의 결과. 앱이 실패한 건만 평소 대기 표에 넣는다. */
export type BatchResult =
  { recordId: string | null; ok: true } | { recordId: string | null; ok: false; reason: string }

/**
 * 묶음의 건을 하나씩 검사하고 적는다. 틀린 한 건이 나머지를 막지 않는다.
 *
 * 통째로 거절하면 앱이 같은 묶음을 계속 다시 보내 그 사용자의 과거 올리기가 멈춘다. 본문이 틀린 건과 `rejectReasonOf` 가
 * 아는 오류(표에 없는 key 등)는 그 건만 실패로 적는다. 모르는 오류는 서버 잘못이라 던져 묶음 전체가 500 이 된다.
 *
 * @example await eachInBatch(body.items, bossClearBody, (raw) => recordIdOf(raw, 'periodRecordId'), save, reasonOf)
 */
export async function eachInBatch<T>(
  items: readonly unknown[],
  schema: ZodType<T>,
  idOf: (raw: unknown) => string | null,
  save: (item: T) => Promise<void>,
  rejectReasonOf: (error: unknown) => string | null,
): Promise<BatchResult[]> {
  const results: BatchResult[] = []
  for (const raw of items) {
    const recordId = idOf(raw)
    const parsed = schema.safeParse(raw)
    if (!parsed.success) {
      results.push({
        recordId,
        ok: false,
        reason: parsed.error.issues.map((issue) => issue.message).join('; '),
      })
      continue
    }
    try {
      await save(parsed.data)
      results.push({ recordId, ok: true })
    } catch (error) {
      const reason = rejectReasonOf(error)
      if (reason === null) throw error
      results.push({ recordId, ok: false, reason })
    }
  }
  return results
}

/** 본문이 틀려도 결과에 붙일 기록 id 를 꺼낸다. 없거나 글자가 아니면 null. */
export function recordIdOf(raw: unknown, field: string): string | null {
  if (typeof raw !== 'object' || raw === null) return null
  const value = (raw as Record<string, unknown>)[field]
  return typeof value === 'string' ? value : null
}
