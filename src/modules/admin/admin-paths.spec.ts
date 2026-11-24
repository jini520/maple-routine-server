import { PATH_METADATA } from '@nestjs/common/constants'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { AdminAppImagesController } from './admin-app-images.controller'
import { AdminAssetsController } from './admin-assets.controller'
import { AdminItemsController } from './admin-items.controller'
import { AdminNoticeImagesController } from './admin-notice-images.controller'
import { AdminController } from './admin.controller'

/**
 * 관리 화면은 admin 주소에서 `/admin` 접두 없이 선다. admin 주소의 nginx 는 모든 경로를 넘기지만, 그 뒤의 nginx 가 `/assets/` ·
 * `/ota/files/` 를 디스크에서 내므로 그 아래의 관리 경로는 서버에 닿지 않는다. api 주소는 `/v1/` 을 인증 없이 같은 서버로
 * 넘기므로 그 아래의 관리 경로는 누구나 부를 수 있다.
 */
const CONTROLLERS = [
  AdminController,
  AdminAssetsController,
  AdminItemsController,
  AdminAppImagesController,
  AdminNoticeImagesController,
] as const

/** 앞뒤 `/` 를 뗀 경로 */
function trim(path: string): string {
  return path.replace(/^\/+|\/+$/g, '')
}

/** 컨트롤러 하나의 경로 전부. 컨트롤러 접두와 메서드 경로를 잇는다. */
function routesOf(controller: (typeof CONTROLLERS)[number]): string[] {
  const prefix = trim(Reflect.getMetadata(PATH_METADATA, controller) as string)
  const proto = controller.prototype as unknown as Record<string, object>
  return Object.getOwnPropertyNames(proto).flatMap((name) => {
    if (name === 'constructor') return []
    const path = Reflect.getMetadata(PATH_METADATA, proto[name]) as string | undefined
    return path === undefined ? [] : ['/' + [prefix, trim(path)].filter(Boolean).join('/')]
  })
}

const ROUTES = CONTROLLERS.flatMap(routesOf)
const RESERVED = ['/admin/', '/v1/', '/assets/', '/ota/files/']

describe('관리 화면 경로', () => {
  it('컨트롤러 다섯의 경로를 실제로 읽었다', () => {
    expect(ROUTES).toEqual(
      expect.arrayContaining(['/', '/notices', '/images', '/app-images', '/items']),
    )
  })

  it('경로가 `/admin` 접두 · 인증 없이 열린 `/v1/` · 디스크가 내는 `/assets/` · `/ota/files/` 로 시작하지 않는다', () => {
    const clash = ROUTES.filter((route) => RESERVED.some((head) => `${route}/`.startsWith(head)))
    expect(clash).toEqual([])
  })

  // 링크나 호출 하나에 `/admin` 이 남으면 접두를 뗀 서버에서 그 화면이나 단추만 404 로 멈춘다.
  it('화면과 그림 올리기 스크립트의 링크 · 호출에 `/admin` 주소가 없다', () => {
    const views = join(__dirname, 'views')
    const files = [
      ...readdirSync(views)
        .filter((name) => name.endsWith('.ts') && !name.endsWith('.spec.ts'))
        .map((name) => join(views, name)),
      join(__dirname, '..', '..', 'cli', 'seed-assets.ts'),
    ]
    const found = files.flatMap((file) =>
      [...readFileSync(file, 'utf8').matchAll(/(?<![\w.])\/admin(?![\w.-])\S*/g)].map(
        (m) => `${file.slice(file.lastIndexOf('/') + 1)}: ${m[0]}`,
      ),
    )
    expect(found).toEqual([])
  })
})
