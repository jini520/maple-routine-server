import { timestamp } from 'drizzle-orm/pg-core'

/** 절대 시각 칸. 저장은 timestamptz 이고 코드에서는 Date 다. */
export const timestamptz = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' })
