import { z } from 'zod'

import { API_KEY_HASH } from './identity.guard'

export const apiKeyLinkBody = z.object({ apiKeyHash: z.string().regex(API_KEY_HASH) })
export type ApiKeyLinkBody = z.infer<typeof apiKeyLinkBody>

/**
 * 넥슨 식별자(메이플 ID · ocid)의 SHA-256 소문자 16진 64자. 서버에는 원문을 두지 않으므로 앱이 해시로 바꿔 보낸다.
 * 원문으로 보이는 값은 받지 않는다.
 */
export const nexonIdHash = z.string().regex(/^[0-9a-f]{64}$/)

/** 넥슨 `character/list` 의 `account_id` 의 해시. */
export const mapleId = nexonIdHash

/** 넥슨 계정 하나의 메이플 ID 목록. 빈 목록은 받기만 하고 적을 것이 없다. */
export const mapleIdsBody = z.object({ mapleIds: z.array(mapleId).max(50) })
export type MapleIdsBody = z.infer<typeof mapleIdsBody>

/** 메이플 ID 가 없으면 같은 넥슨 계정인지 가를 수 없어 받지 않는다. */
export const subAccountBody = z.object({
  apiKeyHash: z.string().regex(API_KEY_HASH),
  mapleIds: z.array(mapleId).min(1).max(50),
})
export type SubAccountBody = z.infer<typeof subAccountBody>
