import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * 관리 화면은 앱처럼 테두리와 구분선을 쓰지 않는다. 면은 바탕색 · 간격 · 그림자로 가른다.
 * 부품을 하나씩 고치면 빠뜨린 선이 남는다. 그래서 뷰 파일 전부를 읽어 굵기가 있는 border 선언을 찾는다.
 */
const DIR = __dirname
const BORDER =
  /\bborder(?:-(?:top|right|bottom|left))?(?:-(?:width|style|color))?\s*:\s*([^;}"'`]+)/g

describe('관리 화면 테두리', () => {
  const files = readdirSync(DIR).filter(
    (name) => name.endsWith('.ts') && !name.endsWith('.spec.ts'),
  )

  it('뷰 파일을 실제로 읽었다', () => {
    expect(files).toEqual(expect.arrayContaining(['layout.ts', 'users.ts', 'usage.ts']))
  })

  it('굵기가 0 이 아닌 border 선언이 없다', () => {
    const found: string[] = []
    for (const name of files) {
      const text = readFileSync(join(DIR, name), 'utf8')
      for (const m of text.matchAll(BORDER)) {
        const value = m[1].trim()
        if (value !== '0' && value !== 'none') found.push(`${name}: ${m[0].trim()}`)
      }
    }
    expect(found).toEqual([])
  })
})
