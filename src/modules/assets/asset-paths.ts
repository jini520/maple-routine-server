/**
 * 그림 경로의 규칙. 경로는 앱 저장소 `src/assets/` 기준의 상대 경로(`bosses/bellona.webp`)이고 표의 자연키다.
 *
 * 디렉터리와 확장자 목록은 앱의 `assets/asset-groups.ts` 와 같다. 앱이 이 경로로 그림을 찾으므로 한쪽만 바꾸면
 * 앱이 그림을 못 찾는다.
 */

export const ASSET_DIRS = {
  bosses: ['webp', 'png'],
  items: ['png', 'webp'],
  'items/rings': ['png', 'webp'],
  worlds: ['png', 'webp'],
  characters: ['webp'],
  mvp: ['webp'],
  maps: ['webp', 'jpg', 'png'],
  'maps/icons': ['png', 'webp'],
  force: ['png', 'webp'],
  'drop-effect/screen': ['jpg', 'webp'],
  'drop-effect/pre': ['jpg', 'webp'],
  'drop-effect/loop': ['jpg', 'webp'],
  'drop-effect/end': ['jpg', 'webp'],
} as const satisfies Record<string, readonly AssetExt[]>

export type AssetDir = keyof typeof ASSET_DIRS
export type AssetExt = 'png' | 'webp' | 'jpg'

export interface AssetPath {
  dir: AssetDir
  /** 확장자를 뗀 이름 */
  name: string
  ext: AssetExt
}

/** 이름에 슬래시 · 점으로 시작하는 이름 · 공백 끝을 막는다. 디렉터리를 벗어나는 경로를 받지 않기 위해서다. */
const NAME = /^[^/\\.\s][^/\\]*$/

/** 규칙에 맞으면 나눈 값, 아니면 null. 경로는 NFC 로 맞춘 뒤 본다. */
export function parseAssetPath(raw: string): AssetPath | null {
  const path = raw.normalize('NFC')
  const slash = path.lastIndexOf('/')
  const dot = path.lastIndexOf('.')
  if (slash <= 0 || dot <= slash + 1) return null
  const dir = path.slice(0, slash)
  const name = path.slice(slash + 1, dot)
  const ext = path.slice(dot + 1)
  if (!(dir in ASSET_DIRS) || !NAME.test(name) || name.trim() !== name) return null
  const exts: readonly string[] = ASSET_DIRS[dir as AssetDir]
  if (!exts.includes(ext)) return null
  return { dir: dir as AssetDir, name, ext: ext as AssetExt }
}

/** 디스크와 nginx `/assets/` 의 파일 이름. 내용 해시라 같은 이름을 덮어쓰지 않는다. */
export function storedFileName(sha256: string, ext: AssetExt): string {
  return `${sha256}.${ext}`
}

/**
 * 게임 데이터 표의 그림 칸이 가리키는 종류. 칸의 값을 경로 후보로 푸는 방법이 종류마다 다르다.
 * `slug` 는 확장자를 뗀 이름, `fileName` 은 확장자까지 든 이름이다(앱의 `AssetKeyRule`).
 */
export const ASSET_REFS = {
  bossPortrait: { dirs: ['bosses'], key: 'slug' },
  itemIcon: { dirs: ['items', 'items/rings'], key: 'fileName' },
  worldEmblem: { dirs: ['worlds'], key: 'slug' },
  mapBackground: { dirs: ['maps'], key: 'slug' },
  mapIcon: { dirs: ['maps/icons'], key: 'slug' },
} as const satisfies Record<string, { dirs: readonly AssetDir[]; key: 'slug' | 'fileName' }>

export type AssetRef = keyof typeof ASSET_REFS

/** 칸 값 하나가 가리킬 수 있는 경로 전부. 이 중 하나라도 표에 있으면 그림이 있다. */
export function refCandidates(ref: AssetRef, value: string): string[] {
  const { dirs, key } = ASSET_REFS[ref]
  const v = value.normalize('NFC')
  if (key === 'fileName') return dirs.map((d) => `${d}/${v}`)
  return dirs.flatMap((d) => ASSET_DIRS[d].map((ext) => `${d}/${v}.${ext}`))
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
