import { assetCategoryEnum } from '../../database/schema'

/**
 * 그림 한 줄을 가리는 세 칸(분류 · 파일 이름 · 확장자)의 규칙.
 */

export type AssetCategory = (typeof assetCategoryEnum.enumValues)[number]
export type AssetExt = 'png' | 'webp' | 'jpg'

/** 분류마다 받는 확장자. 앞선 확장자가 옛 그림 이름을 풀 때 먼저 고르는 것이다. */
export const ASSET_CATEGORIES = {
  boss: ['webp', 'png'],
  item: ['png', 'webp'],
  item_ring: ['png', 'webp'],
  world: ['png', 'webp'],
  character: ['webp'],
  mvp: ['webp'],
  map: ['webp', 'jpg', 'png'],
  map_icon: ['png', 'webp'],
  force: ['png', 'webp'],
  skill: ['png', 'webp'],
  drop_effect_screen: ['jpg', 'webp'],
  drop_effect_pre: ['jpg', 'webp'],
  drop_effect_loop: ['jpg', 'webp'],
  drop_effect_end: ['jpg', 'webp'],
} as const satisfies Record<AssetCategory, readonly AssetExt[]>

export interface AssetKey {
  category: AssetCategory
  /** 확장자를 뗀 이름 */
  fileName: string
  extension: AssetExt
}

/** 이름에 슬래시 · 점으로 시작하는 이름 · 공백 끝을 막는다. 디렉터리를 벗어나는 이름을 받지 않기 위해서다. */
const NAME = /^[^/\\.\s][^/\\]*$/

/** 규칙에 맞으면 맞춘 값, 아니면 null. 파일 이름은 NFC 로 맞춘 뒤 본다. */
export function parseAssetKey(raw: {
  category: string
  fileName: string
  extension: string
}): AssetKey | null {
  const fileName = raw.fileName.normalize('NFC')
  if (!(raw.category in ASSET_CATEGORIES) || !NAME.test(fileName) || fileName.trim() !== fileName)
    return null
  const category = raw.category as AssetCategory
  const exts: readonly string[] = ASSET_CATEGORIES[category]
  if (!exts.includes(raw.extension)) return null
  return { category, fileName, extension: raw.extension as AssetExt }
}

/**
 * 옛 경로(`bosses/bellona.webp`)의 폴더와 분류. 옛 DB 를 옮길 때와 폴더째 그림을 올릴 때 폴더를 분류로 읽는다.
 */
export const FOLDER_CATEGORIES: Record<string, AssetCategory> = {
  bosses: 'boss',
  items: 'item',
  'items/rings': 'item_ring',
  worlds: 'world',
  characters: 'character',
  mvp: 'mvp',
  maps: 'map',
  'maps/icons': 'map_icon',
  force: 'force',
  skills: 'skill',
  'drop-effect/screen': 'drop_effect_screen',
  'drop-effect/pre': 'drop_effect_pre',
  'drop-effect/loop': 'drop_effect_loop',
  'drop-effect/end': 'drop_effect_end',
}

/** `<폴더>/<이름>.<확장자>` 를 세 칸으로 나눈다. 폴더 · 확장자가 규칙에 없으면 null 이다. */
export function parseAssetPath(raw: string): AssetKey | null {
  const path = raw.normalize('NFC')
  const slash = path.lastIndexOf('/')
  const dot = path.lastIndexOf('.')
  if (slash <= 0 || dot <= slash + 1) return null
  const category = FOLDER_CATEGORIES[path.slice(0, slash)]
  if (category === undefined) return null
  return parseAssetKey({
    category,
    fileName: path.slice(slash + 1, dot),
    extension: path.slice(dot + 1),
  })
}

/** 세 칸을 한 글자로. 줄을 맵에서 찾고 관리 화면 알림에 쓴다. */
export function assetKeyText(key: {
  category: string
  fileName: string
  extension: string
}): string {
  return `${key.category}/${key.fileName}.${key.extension}`
}

/** 디스크와 nginx `/assets/` 의 파일 이름. 내용 해시라 같은 이름을 덮어쓰지 않는다. */
export function storedFileName(sha256: string, ext: string): string {
  return `${sha256}.${ext}`
}

/**
 * 옛 앱이 읽던 그림 이름을 내는 칸의 종류. 칸의 값을 그림 후보로 푸는 방법이 종류마다 다르다.
 * `slug` 는 확장자를 뗀 이름, `fileName` 은 확장자까지 든 이름이다. 그 칸을 내는 표를 새 표로 바꿀 때 종류를 걷는다.
 */
export const ASSET_REFS = {
  bossPortrait: { categories: ['boss'], key: 'slug' },
  itemIcon: { categories: ['item', 'item_ring'], key: 'fileName' },
  mapBackground: { categories: ['map'], key: 'slug' },
  mapIcon: { categories: ['map_icon'], key: 'slug' },
} as const satisfies Record<
  string,
  { categories: readonly AssetCategory[]; key: 'slug' | 'fileName' }
>

export type AssetRef = keyof typeof ASSET_REFS

/** 칸 값 하나가 가리킬 수 있는 그림 전부. 앞선 것이 먼저 고르는 것이다. */
export function refCandidates(ref: AssetRef, value: string): AssetKey[] {
  const { categories, key } = ASSET_REFS[ref]
  const v = value.normalize('NFC')
  if (key === 'fileName') {
    const dot = v.lastIndexOf('.')
    if (dot <= 0) return []
    const fileName = v.slice(0, dot)
    const extension = v.slice(dot + 1)
    return categories.flatMap((category) => {
      const exts: readonly string[] = ASSET_CATEGORIES[category]
      return exts.includes(extension)
        ? [{ category, fileName, extension: extension as AssetExt }]
        : []
    })
  }
  return categories.flatMap((category) =>
    ASSET_CATEGORIES[category].map((extension) => ({ category, fileName: v, extension })),
  )
}

/** 파일 머리 바이트로 본 형식. 확장자와 내용이 다른 그림을 받지 않기 위해서다. */
export function sniffImage(bytes: Buffer): AssetExt | null {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(PNG)) return 'png'
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpg'
  if (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
    bytes.subarray(8, 12).toString('ascii') === 'WEBP'
  )
    return 'webp'
  return null
}

/**
 * 파일 머리에서 읽은 가로 · 세로 픽셀. 앱이 크롭과 연출 배치를 그림의 원래 크기로 계산하는데, 내려받은 파일은
 * 그 자리에서 크기를 알 수 없어서 목록에 함께 싣는다. 머리를 못 읽으면 null 이다.
 */
export function imageSize(bytes: Buffer): { width: number; height: number } | null {
  const kind = sniffImage(bytes)
  if (kind === 'png') {
    if (bytes.length < 24) return null
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) }
  }
  if (kind === 'webp') return webpSize(bytes)
  if (kind === 'jpg') return jpegSize(bytes)
  return null
}

function webpSize(b: Buffer): { width: number; height: number } | null {
  const chunk = b.subarray(12, 16).toString('ascii')
  if (chunk === 'VP8X' && b.length >= 30)
    return { width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3) }
  if (chunk === 'VP8 ' && b.length >= 30)
    return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff }
  if (chunk === 'VP8L' && b.length >= 25) {
    const bits = b.readUInt32LE(21)
    return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >> 14) & 0x3fff) }
  }
  return null
}

/** SOF 표지까지 표지 길이를 따라 건너뛴다. DHT(C4) · JPG(C8) · DAC(CC) 는 SOF 가 아니다. */
function jpegSize(b: Buffer): { width: number; height: number } | null {
  let i = 2
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) return null
    const marker = b[i + 1] ?? 0
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc)
      return { width: b.readUInt16BE(i + 7), height: b.readUInt16BE(i + 5) }
    i += 2 + b.readUInt16BE(i + 2)
  }
  return null
}

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
