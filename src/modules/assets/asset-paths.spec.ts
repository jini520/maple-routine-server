import { parseAssetPath, refCandidates, sniffImage } from './asset-paths'

describe('parseAssetPath', () => {
  it('앱 디렉터리와 그 디렉터리의 확장자만 받는다', () => {
    expect(parseAssetPath('bosses/bellona.webp')).toEqual({
      dir: 'bosses',
      name: 'bellona',
      ext: 'webp',
    })
    expect(parseAssetPath('drop-effect/loop/10.webp')?.dir).toBe('drop-effect/loop')
    expect(parseAssetPath('items/rings/ring.png')?.dir).toBe('items/rings')
    expect(parseAssetPath('mvp/gold.png')).toBeNull()
    expect(parseAssetPath('themes/hontail-background.webp')).toBeNull()
    expect(parseAssetPath('guide/a.webp')).toBeNull()
  })

  it('디렉터리를 벗어나거나 이름이 빈 경로를 받지 않는다', () => {
    expect(parseAssetPath('bosses/../x.webp')).toBeNull()
    expect(parseAssetPath('bosses/.webp')).toBeNull()
    expect(parseAssetPath('bosses/ a.webp')).toBeNull()
    expect(parseAssetPath('bellona.webp')).toBeNull()
  })

  it('NFD 이름을 NFC 로 맞춘다', () => {
    expect(parseAssetPath('items/가.png'.normalize('NFD'))?.name).toBe('가'.normalize('NFC'))
  })
})

describe('refCandidates', () => {
  it('slug 는 디렉터리 확장자마다, fileName 은 디렉터리마다 후보를 낸다', () => {
    expect(refCandidates('bossPortrait', 'bellona')).toEqual([
      'bosses/bellona.webp',
      'bosses/bellona.png',
    ])
    expect(refCandidates('itemIcon', 'ring.png')).toEqual([
      'items/ring.png',
      'items/rings/ring.png',
    ])
  })
})

describe('sniffImage', () => {
  it('머리 바이트로 형식을 가른다', () => {
    expect(sniffImage(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toBe('png')
    expect(sniffImage(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('jpg')
    expect(sniffImage(Buffer.from('RIFF\0\0\0\0WEBPVP8 ', 'ascii'))).toBe('webp')
    expect(sniffImage(Buffer.from('<svg></svg>'))).toBeNull()
  })
})
