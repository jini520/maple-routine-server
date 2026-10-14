import { z } from 'zod'

export const loginBody = z.object({ platform: z.enum(['ios', 'android']) })
export type LoginBody = z.infer<typeof loginBody>

export const sessionBody = z.object({
  redeemKey: z.string().min(1),
  receipt: z.string().min(1),
})
export type SessionBody = z.infer<typeof sessionBody>

/** 넥슨이 붙여 오는 쿼리. 모양이 틀려도 거절하지 않는다. 콜백은 무슨 일이 있어도 302 다. */
export const callbackQuery = z
  .object({
    code: z.string().optional(),
    state: z.string().optional(),
    error: z.string().optional(),
  })
  .passthrough()
export type CallbackQuery = z.infer<typeof callbackQuery>
