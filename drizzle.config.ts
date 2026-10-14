import { defineConfig } from 'drizzle-kit'

/** 스키마 선언은 src/database/schema.ts 하나이고, 마이그레이션은 그 옆 migrations/ 에 쌓인다. */
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/database/schema.ts',
  out: './src/database/migrations',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://localhost:5432/maple_routine',
  },
  strict: true,
  verbose: true,
})
