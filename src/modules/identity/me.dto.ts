import { z } from 'zod'

import { API_KEY_HASH } from './identity.guard'

export const apiKeyLinkBody = z.object({ apiKeyHash: z.string().regex(API_KEY_HASH) })
export type ApiKeyLinkBody = z.infer<typeof apiKeyLinkBody>

/** 넥슨 `character/list` 의 `account_id`. 모양을 넥슨이 정하지 않아 경로에 실을 수 있는 글자만 받는다. */
export const mapleId = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/)

/** 넥슨 계정 하나의 메이플 ID 목록. 빈 목록은 받기만 하고 적을 것이 없다. */
export const mapleIdsBody = z.object({ mapleIds: z.array(mapleId).max(50) })
export type MapleIdsBody = z.infer<typeof mapleIdsBody>

/** 메이플 ID 가 없으면 같은 넥슨 계정인지 가를 수 없어 받지 않는다. */
export const subAccountBody = z.object({
  apiKeyHash: z.string().regex(API_KEY_HASH),
  mapleIds: z.array(mapleId).min(1).max(50),
})
export type SubAccountBody = z.infer<typeof subAccountBody>
