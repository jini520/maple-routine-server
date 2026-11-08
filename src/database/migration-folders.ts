/**
 * 이관 스펙이 쓰는 마이그레이션 폴더 사본. 저널을 어느 태그까지 자른 폴더를 만들어, 그 전까지 올린 DB 에 줄을 넣고 다음
 * 마이그레이션 하나만 적용해 볼 수 있게 한다. test-db 의 마이그레이션은 빈 표에서만 돌아 채우는 SQL 이 한 번도 안 돈다.
 */
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const MIGRATIONS = join(__dirname, 'migrations')

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
