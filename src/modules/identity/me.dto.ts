import { z } from 'zod'

import { API_KEY_HASH } from './identity.guard'

export const apiKeyLinkBody = z.object({ apiKeyHash: z.string().regex(API_KEY_HASH) })
export type ApiKeyLinkBody = z.infer<typeof apiKeyLinkBody>
