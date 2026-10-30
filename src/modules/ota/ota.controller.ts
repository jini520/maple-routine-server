import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { BadRequestException, Controller, Get, Headers, Query, Res } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { FastifyReply } from 'fastify'

import type { Env } from '../../config/env.schema'

/** 앱이 OTA 를 받는 두 플랫폼. 이 밖의 값은 파일 이름에 넣지 않는다. */
const PLATFORMS = new Set(['ios', 'android'])

/** 지문은 해시 글자라 이 집합을 벗어나지 않는다. 벗어나면 없는 번들을 물은 것으로 친다. */
const RUNTIME_VERSION = /^[A-Za-z0-9._-]{1,128}$/

/** `expo-updates` 는 `expo-protocol-version` 이 없는 매니페스트를 버린다. */
const PROTOCOL_HEADERS = {
  'expo-protocol-version': '1',
  'expo-sfv-version': '0',
  'cache-control': 'private, max-age=0',
}

/**
 * OTA 매니페스트와 스토어 업데이트 판정. 공개 조회다.
 *
 * 파일은 발행 스크립트가 `OTA_DIR` 에 올리고 여기서는 읽기만 한다. 번들과 에셋은 같은 박스의 nginx 가 `/ota/files/` 로 낸다.
 * 이름은 그대로인데 내용만 바뀌는 파일이라 캐시하지 않는다.
 */
@Controller()
export class OtaController {
  private readonly dir: string

  constructor(config: ConfigService<Env, true>) {
    this.dir = config.get('OTA_DIR', { infer: true })
  }

  /** 프로토콜에서 204 는 업데이트가 없다는 뜻이다. 헤더가 이상해도 같은 답을 준다. */
  @Get('v1/ota/manifest')
  async manifest(
    @Headers('expo-platform') platform: string | undefined,
    @Headers('expo-runtime-version') runtimeVersion: string | undefined,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    void reply.headers(PROTOCOL_HEADERS)
    const body =
      platform !== undefined && PLATFORMS.has(platform) && runtimeVersion !== undefined && RUNTIME_VERSION.test(runtimeVersion)
        ? await this.read(`manifest-${platform}-${runtimeVersion}.json`)
        : null
    if (body === null) {
      await reply.code(204).send()
      return
    }
    await reply.type('application/json; charset=utf-8').send(body)
  }

  /** 아직 발행 전이면 빈 값이다. 404 면 앱이 확인 실패로 읽는데, 사실은 비교할 대상이 없는 것이다. */
  @Get('v1/ota/latest')
  async latest(@Query('platform') platform: string | undefined, @Res() reply: FastifyReply): Promise<void> {
    if (platform === undefined || !PLATFORMS.has(platform)) throw new BadRequestException('bad platform')
    const body = (await this.read(`latest-${platform}.json`)) ?? JSON.stringify({ runtimeVersion: null, appVersion: null })
    await reply
      .header('cache-control', 'private, max-age=0')
      .type('application/json; charset=utf-8')
      .send(body)
  }

  private async read(fileName: string): Promise<string | null> {
    try {
      return await readFile(join(this.dir, fileName), 'utf8')
    } catch {
      return null
    }
  }
}
