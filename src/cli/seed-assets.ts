/**
 * 그림 · 크롭 표의 첫 채움. 앱 저장소의 `src/assets/` 그림과 `src/data/*-crops.json` 을 관리 화면 경로로 올린다.
 *
 * 맥에서 돌린다. 파일이 앱 저장소에 있고, 관리 화면 경로를 거쳐야 형식 검사와 파일 쓰기 순서가 운영과 같다.
 * 서버에 이미 있는 경로와 크롭은 건너뛴다.
 *
 * @example
 * npm run build && ADMIN_AUTH=아이디:비밀번호 node dist/cli/seed-assets.js https://mapleroutine.store ~/Developments/maple-routine
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { parseAssetPath } from '../modules/assets/asset-paths'
import type {
  ImageCrop,
  ImageCropKind,
  ImageCropsSection,
} from '../modules/assets/image-crops.repository'
import type { AssetsSection } from '../modules/assets/assets.repository'
import { CROP_FILES, planSeed, SEED_DIRS } from './seed-assets-plan'

const CONTENT_TYPES = { png: 'image/png', webp: 'image/webp', jpg: 'image/jpeg' } as const

async function main(): Promise<void> {
  const [base, appRoot] = process.argv.slice(2)
  const auth = process.env.ADMIN_AUTH
  if (base === undefined || appRoot === undefined || auth === undefined)
    throw new Error(
      '사용: ADMIN_AUTH=아이디:비밀번호 node dist/cli/seed-assets.js <서버 주소> <앱 저장소>',
    )
  const headers = { authorization: `Basic ${Buffer.from(auth).toString('base64')}` }

  const rowsRes = await fetch(`${base}/admin/assets/rows`, { headers })
  if (!rowsRes.ok) throw new Error(`목록을 못 읽었다 ${rowsRes.status}`)
  const rows = (await rowsRes.json()) as { assets: AssetsSection; crops: ImageCropsSection }

  const assetsRoot = join(appRoot, 'src/assets')
  const local = SEED_DIRS.flatMap((dir) => {
    try {
      return readdirSync(join(assetsRoot, dir), { withFileTypes: true })
        .filter((e) => e.isFile())
        .map((e) => `${dir}/${e.name}`)
    } catch {
      return []
    }
  })
  const localCrops = Object.fromEntries(
    (Object.entries(CROP_FILES) as [ImageCropKind, string][]).map(([kind, file]) => [
      kind,
      JSON.parse(readFileSync(join(appRoot, 'src/data', file), 'utf8')) as Record<
        string,
        ImageCrop
      >,
    ]),
  )
  const plan = planSeed(
    local,
    new Set(rows.assets.files.map((f) => f.path)),
    localCrops,
    rows.crops.crops,
  )
  console.log(`그림 ${plan.files.length}장 · 크롭 ${plan.crops.length}줄을 올린다`)

  for (const path of plan.files) {
    const ext = parseAssetPath(path)?.ext
    if (ext === undefined) continue
    const res = await fetch(`${base}/admin/assets/file?path=${encodeURIComponent(path)}`, {
      method: 'PUT',
      headers: { ...headers, 'content-type': CONTENT_TYPES[ext] },
      body: readFileSync(join(assetsRoot, path)),
    })
    if (!res.ok) throw new Error(`${path} 를 못 올렸다 ${res.status} ${await res.text()}`)
  }
  for (const { kind, slug, crop } of plan.crops) {
    const res = await fetch(`${base}/admin/image-crops/${kind}/${encodeURIComponent(slug)}`, {
      method: 'PUT',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify(crop),
    })
    if (!res.ok)
      throw new Error(`${kind}/${slug} 크롭을 못 올렸다 ${res.status} ${await res.text()}`)
  }
  console.log('끝')
}

main().catch((error: unknown) => {
  console.error(error)
  process.exit(1)
})
