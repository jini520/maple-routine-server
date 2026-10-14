import { z } from 'zod'

import { NOTICE_KINDS } from './notice.types'

const limit = z.coerce.number().int().min(1).max(100).default(20)

/** kind 는 쉼표로 잇는다. `kind=game,update`. */
const kindList = z
  .string()
  .transform((value) =>
    value
      .split(',')
      .map((kind) => kind.trim())
      .filter((kind) => kind !== ''),
  )
  .pipe(z.array(z.enum(NOTICE_KINDS)).min(1))

export const listQuery = z.object({ limit, kind: kindList.optional() })
export type ListQuery = z.infer<typeof listQuery>

export const sundayQuery = z.object({ limit })
export type SundayQuery = z.infer<typeof sundayQuery>
