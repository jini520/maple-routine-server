import { z } from 'zod'

/** 한 요청의 작업 수 상한. 창 채우기가 캐릭터 수 × 날짜라 가장 많고, 본문 상한 256KB 안에 든다. */
export const MAX_TASKS = 1000

const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

/**
 * 작업 하나. kind 는 넥슨 경로의 마지막 마디 그대로다.
 * 내역 넷은 date 를, character-state 는 ocid 와 date(없으면 오늘)를 들고, character-list 는 아무것도 안 든다.
 */
export const streamTask = z.discriminatedUnion('kind', [
  z.object({ kind: z.enum(['cube', 'starforce', 'potential', 'soul-potential']), date: dateKey }),
  z.object({
    kind: z.literal('character-state'),
    date: dateKey.optional(),
    ocid: z.string().min(1),
  }),
  z.object({ kind: z.literal('character-list') }),
])
export type StreamTask = z.infer<typeof streamTask>

export const streamBody = z.object({ tasks: z.array(streamTask).min(1).max(MAX_TASKS) })
export type StreamBody = z.infer<typeof streamBody>
