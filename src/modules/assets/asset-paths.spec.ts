import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  ASSET_CATEGORIES,
  FOLDER_CATEGORIES,
  imageSize,
  parseAssetKey,
  parseAssetPath,
  sniffImage,
} from './asset-paths'

describe('parseAssetKey', () => {
  it('분류와 그 분류가 받는 확장자만 받는다', () => {
    expect(parseAssetKey({ category: 'boss', fileName: 'bellona', extension: 'webp' })).toEqual({
      category: 'boss',
      fileName: 'bellona',
      extension: 'webp',
    })
    expect(
      parseAssetKey({ category: 'skill', fileName: 'KFPDKDPEMA', extension: 'jpg' }),
    ).toBeNull()
    expect(parseAssetKey({ category: 'mvp', fileName: 'gold', extension: 'png' })).toBeNull()
    expect(parseAssetKey({ category: 'theme', fileName: 'a', extension: 'webp' })).toBeNull()
  })

  it('디렉터리를 벗어나거나 비었거나 공백으로 시작하는 이름을 받지 않는다', () => {
    for (const fileName of ['../x', 'a/b', '.hidden', ' a', 'a ', ''])
      expect(parseAssetKey({ category: 'boss', fileName, extension: 'webp' })).toBeNull()
  })

  it('NFD 이름을 NFC 로 맞춘다', () => {
    expect(
      parseAssetKey({ category: 'item', fileName: '가'.normalize('NFD'), extension: 'png' })
        ?.fileName,
    ).toBe('가'.normalize('NFC'))
  })
})

describe('parseAssetPath', () => {
  it('옛 경로의 폴더를 분류로 읽는다', () => {
    expect(parseAssetPath('bosses/bellona.webp')).toEqual({
      category: 'boss',
      fileName: 'bellona',
      extension: 'webp',
    })
    expect(parseAssetPath('drop-effect/loop/10.webp')?.category).toBe('drop_effect_loop')
    expect(parseAssetPath('items/rings/ring.png')?.category).toBe('item_ring')
    expect(parseAssetPath('maps/icons/roadOfVanishing.png')?.category).toBe('map_icon')
    expect(parseAssetPath('skills/KFPDKDPEMA.jpg')).toBeNull()
    expect(parseAssetPath('themes/hontail-background.webp')).toBeNull()
    expect(parseAssetPath('bellona.webp')).toBeNull()
    expect(parseAssetPath('bosses/../x.webp')).toBeNull()
  })

  // 옛 DB 를 옮길 때 폴더가 분류로 읽히지 않는 그림이 있으면 옮기기가 멈춘다.
  it('분류마다 옛 폴더가 하나씩 있다', () => {
    expect(Object.values(FOLDER_CATEGORIES).sort()).toEqual(Object.keys(ASSET_CATEGORIES).sort())
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

describe('imageSize', () => {
  const fixture = (name: string) => readFileSync(join(__dirname, '__fixtures__', name))

  it('png · jpg · webp 세 가지(VP8 · VP8L · VP8X)의 머리에서 가로 · 세로를 읽는다', () => {
    expect(imageSize(fixture('icon.png'))).toEqual({ width: 38, height: 38 })
    expect(imageSize(fixture('photo.jpg'))).toEqual({ width: 1280, height: 720 })
    expect(imageSize(fixture('vp8.webp'))).toEqual({ width: 1000, height: 405 })
    expect(imageSize(fixture('vp8l.webp'))).toEqual({ width: 744, height: 120 })
    expect(imageSize(fixture('vp8x.webp'))).toEqual({ width: 1000, height: 214 })
    expect(imageSize(Buffer.from('nope'))).toBeNull()
  })
})
