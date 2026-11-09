/**
 * 분류 확인을 마친 아이템 목록을 운영에 넣는다. 그림을 올리고, 새 아이템을 더하고, 아이템의 분류와 빈 그림을 채운다.
 *
 * 맥에서 돈다. 관리 화면 경로를 거쳐야 분류 트리 · 이름 겹침 · 그림 검사가 관리 화면과 같다. 기본은 할 일만 보이고,
 * `--apply` 를 붙여야 쓴다. 폴더에는 `plan.json`(CatalogPlan)과 `items/` 그림이 있다.
 *
 * @example
 * npm run build && ADMIN_AUTH=아이디:비밀번호 node dist/cli/apply-item-catalog.js https://mapleroutine.store ~/Downloads/item-catalog --apply
 */
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { parseAssetPath } from '../modules/assets/asset-paths'
import type { AssetsSection } from '../modules/assets/assets.repository'
import type { ItemAdminRow } from '../modules/items/items.repository'
import { type CatalogPlan, type CatalogWrite, planCatalog } from './apply-item-catalog-plan'

const CONTENT_TYPES = { png: 'image/png', webp: 'image/webp', jpg: 'image/jpeg' } as const

async function main(): Promise<void> {
  const [base, dir, flag] = process.argv.slice(2)
  const auth = process.env.ADMIN_AUTH
  if (base === undefined || dir === undefined || auth === undefined)
    throw new Error(
      '사용: ADMIN_AUTH=아이디:비밀번호 node dist/cli/apply-item-catalog.js <서버 주소> <폴더> [--apply]',
    )
  const apply = flag === '--apply'
  const headers = { authorization: `Basic ${Buffer.from(auth).toString('base64')}` }
  const getJson = async <T>(path: string): Promise<T> => {
    const res = await fetch(`${base}${path}`, { headers })
    if (!res.ok) throw new Error(`${path} 를 못 읽었다 ${res.status}`)
    return (await res.json()) as T
  }
  const send = async (method: string, path: string, body: unknown): Promise<void> => {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error(`${method} ${path} 실패 ${res.status} ${await res.text()}`)
  }

  const plan = JSON.parse(readFileSync(join(dir, 'plan.json'), 'utf8')) as CatalogPlan
  const local = new Map(
    readdirSync(join(dir, 'items')).map((name) => [
      `items/${name}`.normalize('NFC'),
      createHash('sha256')
        .update(readFileSync(join(dir, 'items', name)))
        .digest('hex'),
    ]),
  )
  const assetRows = async (): Promise<AssetsSection> =>
    (await getJson<{ assets: AssetsSection }>('/admin/assets/rows')).assets
  const { items } = await getJson<{ items: ItemAdminRow[] }>('/admin/items/rows')
  const result = planCatalog(items, (await assetRows()).files, plan, local)

  console.log(
    `그림 ${result.uploads.length}장을 올리고, 아이템 ${result.creates.length}개를 더하고, ${result.updates.length}개를 고친다`,
  )
  for (const [label, list] of [
    ['같은 경로에 다른 그림이 있어 건너뜀', result.conflicts],
    ['서버에 없는 key', result.unknown],
    ['폴더에 없는 그림', result.missingFiles],
  ] as const)
    if (list.length > 0) console.log(`${label} ${list.length}: ${list.join(', ')}`)
  if (!apply) {
    console.log('보기만 했다. 쓰려면 --apply 를 붙인다')
    return
  }

  for (const path of result.uploads) {
    const ext = parseAssetPath(path)?.ext
    if (ext === undefined) throw new Error(`그림 경로 규칙에 맞지 않는다: ${path}`)
    const res = await fetch(`${base}/admin/assets/file?path=${encodeURIComponent(path)}`, {
      method: 'PUT',
      headers: { ...headers, 'content-type': CONTENT_TYPES[ext] },
      body: readFileSync(join(dir, path)),
    })
    if (!res.ok) throw new Error(`${path} 를 못 올렸다 ${res.status} ${await res.text()}`)
  }
  const ids = new Map((await assetRows()).files.map((f) => [f.path, f.id]))
  const withIcon = ({ input, iconPath }: CatalogWrite) => {
    if (iconPath === null) return input
    const id = ids.get(iconPath)
    if (id === undefined) throw new Error(`올린 그림을 서버에서 못 찾았다: ${iconPath}`)
    return { ...input, iconAssetId: id }
  }
  for (const write of result.creates)
    await send('POST', '/admin/items', { key: write.key, ...withIcon(write) })
  for (const write of result.updates)
    await send('PUT', `/admin/items/${write.key}`, withIcon(write))
  console.log('끝')
}

main().catch((error: unknown) => {
  console.error(error)
  process.exit(1)
})
