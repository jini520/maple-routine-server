import { z } from 'zod'

import { platformEnum, usageEventTypeEnum } from '../../database/schema'

/** 한 묶음의 사건 수 상한. 앱은 기기에 500 건까지만 쌓는다. */
export const USAGE_BATCH_MAX = 500

/** 하루. 이보다 긴 체류는 앱이 잘못 잰 값이다. */
const DURATION_MAX_MS = 86_400_000

/** 사건 하나. 이름은 목록으로 거르지 않는다. 앱이 화면을 더할 때마다 서버를 먼저 배포하지 않아도 되게 한다. */
export const usageEventBody = z.object({
  type: z.enum(usageEventTypeEnum.enumValues),
  name: z.string().max(64),
  durationMs: z.number().int().min(0).max(DURATION_MAX_MS).nullish(),
  at: z.coerce.date(),
})
export type UsageEventBody = z.infer<typeof usageEventBody>

export const usageEventsBody = z.object({
  platform: z.enum(platformEnum.enumValues),
  appVersion: z.string().min(1).max(32),
  events: z.array(usageEventBody).min(1).max(USAGE_BATCH_MAX),
})
export type UsageEventsBody = z.infer<typeof usageEventsBody>
