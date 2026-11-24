/**
 * 그림 폴더를 관리 화면 경로로 올린다. 폴더 안의 `<폴더>/<이름>.<확장자>`(`bosses/bellona.webp`)를 분류 · 파일 이름 · 확장자로
 * 읽는다. 폴더 이름과 분류의 짝은 서버 FOLDER_CATEGORIES 다.
 *
 * 맥에서 돌린다. 관리 화면 경로를 거쳐야 형식 검사와 파일 쓰기 순서가 운영과 같다. 서버에 이미 있는 그림은 건너뛴다.
 *
 * @example
 * npm run build && ADMIN_AUTH=아이디:비밀번호 node dist/cli/seed-assets.js https://admin.mapleroutine.store ~/.maple-routine/hexa
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { assetKeyText } from '../modules/assets/asset-paths'
import type { AssetAdminRow } from '../modules/assets/assets.repository'
import { planSeed, SEED_DIRS } from './seed-assets-plan'

const CONTENT_TYPES = { png: 'image/png', webp: 'image/webp', jpg: 'image/jpeg' } as const

async function main(): Promise<void> {
  const [base, root] = process.argv.slice(2)
  const auth = process.env.ADMIN_AUTH
  if (base === undefined || root === undefined || auth === undefined)
    throw new Error(
      '사용: ADMIN_AUTH=아이디:비밀번호 node dist/cli/seed-assets.js <서버 주소> <그림 폴더>',
    )
  const headers = { authorization: `Basic ${Buffer.from(auth).toString('base64')}` }

  const listRes = await fetch(`${base}/images/list`, { headers })
  if (!listRes.ok) throw new Error(`목록을 못 읽었다 ${listRes.status}`)
  const { rows } = (await listRes.json()) as { rows: AssetAdminRow[] }

  const local = SEED_DIRS.flatMap((dir) => {
    try {
      return readdirSync(join(root, dir), { withFileTypes: true })
        .filter((e) => e.isFile())
        .map((e) => `${dir}/${e.name}`)
    } catch {
      return []
    }
  })
  const plan = planSeed(local, new Set(rows.map(assetKeyText)))
  console.log(`그림 ${plan.length}장을 올린다`)

  for (const { path, key } of plan) {
    const query = new URLSearchParams({ ...key }).toString()
    const res = await fetch(`${base}/images/file?${query}`, {
      method: 'PUT',
      headers: { ...headers, 'content-type': CONTENT_TYPES[key.extension] },
      body: readFileSync(join(root, path)),
    })
    if (!res.ok) throw new Error(`${path} 를 못 올렸다 ${res.status} ${await res.text()}`)
  }
  console.log('끝')
}

main().catch((error: unknown) => {
  console.error(error)
  process.exit(1)
})
