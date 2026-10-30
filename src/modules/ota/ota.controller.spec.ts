import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { ConfigService } from '@nestjs/config'
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import { Test } from '@nestjs/testing'

import { OtaController } from './ota.controller'

const RUNTIME = 'a1b2c3d4e5f6'

describe('OtaController', () => {
  let app: NestFastifyApplication
  let dir: string

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'ota-'))
    const moduleRef = await Test.createTestingModule({
      controllers: [OtaController],
      providers: [{ provide: ConfigService, useValue: { get: () => dir } }],
    }).compile()
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter())
    await app.init()
    await app.getHttpAdapter().getInstance().ready()
  })
  afterAll(async () => {
    await app.close()
    await rm(dir, { recursive: true, force: true })
  })

  const manifest = (headers: Record<string, string>) => app.inject({ method: 'GET', url: '/v1/ota/manifest', headers })

  describe('GET /v1/ota/manifest', () => {
    // `expo-updates` 는 이 헤더가 없으면 매니페스트를 버린다. 이 경로가 있는 이유가 이 헤더다.
    it('플랫폼과 지문에 맞는 매니페스트를 프로토콜 헤더와 함께 낸다', async () => {
      await writeFile(join(dir, `manifest-ios-${RUNTIME}.json`), JSON.stringify({ id: 'm1' }))

      const res = await manifest({ 'expo-platform': 'ios', 'expo-runtime-version': RUNTIME })

      expect(res.statusCode).toBe(200)
      expect(res.json()).toEqual({ id: 'm1' })
      expect(res.headers['expo-protocol-version']).toBe('1')
      expect(res.headers['expo-sfv-version']).toBe('0')
      expect(res.headers['content-type']).toMatch(/^application\/json/)
      // 이름은 그대로인데 내용만 바뀌는 파일이라 캐시하면 옛 발행이 나간다.
      expect(res.headers['cache-control']).toBe('private, max-age=0')
    })

    // 프로토콜에서 204 는 "업데이트 없음" 이다. 앱은 그 뒤 `/latest` 로 스토어 업데이트가 필요한지 묻는다.
    it('그 지문의 매니페스트가 없으면 204 다', async () => {
      const res = await manifest({ 'expo-platform': 'android', 'expo-runtime-version': 'nothing-here' })

      expect(res.statusCode).toBe(204)
      expect(res.headers['expo-protocol-version']).toBe('1')
    })

    // 헤더 값을 파일 이름에 넣으므로 `../` 같은 값이 디렉터리 밖을 읽게 두면 안 된다.
    it.each([
      [{ 'expo-platform': 'ios', 'expo-runtime-version': '../../etc/passwd' }],
      [{ 'expo-platform': 'web', 'expo-runtime-version': RUNTIME }],
      [{ 'expo-platform': 'ios' }],
      [{}],
    ])('헤더가 이상하면 파일을 읽지 않고 204 다: %j', async (headers) => {
      const res = await manifest(headers)

      expect(res.statusCode).toBe(204)
    })
  })

  describe('GET /v1/ota/latest', () => {
    it('플랫폼의 latest 파일을 낸다', async () => {
      const latest = { runtimeVersion: RUNTIME, acceptedRuntimeVersions: [RUNTIME], appVersion: '1.0.13' }
      await writeFile(join(dir, 'latest-ios.json'), JSON.stringify(latest))

      const res = await app.inject({ method: 'GET', url: '/v1/ota/latest?platform=ios&t=1' })

      expect(res.statusCode).toBe(200)
      expect(res.json()).toEqual(latest)
      expect(res.headers['cache-control']).toBe('private, max-age=0')
    })

    // 아직 발행 전이다. 404 면 앱이 확인 실패로 읽는데, 사실은 비교할 대상이 없는 것이다.
    it('아직 발행된 적이 없으면 빈 값을 200 으로 낸다', async () => {
      const res = await app.inject({ method: 'GET', url: '/v1/ota/latest?platform=android' })

      expect(res.statusCode).toBe(200)
      expect(res.json()).toEqual({ runtimeVersion: null, appVersion: null })
    })

    it('플랫폼이 이상하면 400 이다', async () => {
      const res = await app.inject({ method: 'GET', url: '/v1/ota/latest?platform=../x' })

      expect(res.statusCode).toBe(400)
    })
  })
})
