import { z } from 'zod'

/** 기기가 만든 v4. 변형 비트까지 따지지 않는다. 멀쩡한 본문을 거절하면 앱이 5회 뒤 그 건을 버린다. */
export const uuidLike = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
