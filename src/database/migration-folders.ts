/**
 * 이관 스펙이 쓰는 마이그레이션 폴더 사본. 저널을 어느 태그까지 자른 폴더를 만들어, 그 전까지 올린 DB 에 줄을 넣고 다음
 * 마이그레이션 하나만 적용해 볼 수 있게 한다. test-db 의 마이그레이션은 빈 표에서만 돌아 채우는 SQL 이 한 번도 안 돈다.
 */
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const MIGRATIONS = join(__dirname, 'migrations')

/**
 * 이관 스펙에서 DB 를 만들고 마이그레이션을 올리거나 DB 를 지우는 훅의 시간 상한. 혼자 돌면 1~2초지만 다른 jest 가 함께 돌면 jest
 * 기본 5초를 넘어, 그때 도는 스펙이 훅에서 실패한다(2026-11-24 세 스펙에서 확인).
 */
export const MIGRATION_HOOK_TIMEOUT_MS = 60_000

interface Journal {
  entries: { tag: string }[]
}

/** 태그마다 저널을 그 태그까지 자른 폴더. cleanup 이 사본을 지운다. */
export function migrationFoldersUpTo<T extends string>(
  tags: readonly T[],
): { folders: Record<T, string>; cleanup: () => void } {
  const root = mkdtempSync(join(tmpdir(), 'mig-'))
  const folders = {} as Record<T, string>
  for (const tag of tags) {
    const dir = join(root, tag)
    cpSync(MIGRATIONS, dir, { recursive: true })
    const journalPath = join(dir, 'meta', '_journal.json')
    const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as Journal
    const cut = journal.entries.findIndex((e) => e.tag === tag)
    if (cut === -1) throw new Error(`저널에 없는 태그다: ${tag}`)
    journal.entries = journal.entries.slice(0, cut + 1)
    writeFileSync(journalPath, JSON.stringify(journal))
    folders[tag] = dir
  }
  return { folders, cleanup: () => rmSync(root, { recursive: true, force: true }) }
}
