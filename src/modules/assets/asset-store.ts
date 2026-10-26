import { randomUUID } from 'node:crypto'
import { access, mkdir, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

import type { Env } from '../../config/env.schema'

/**
 * 그림 파일을 디스크에 두는 곳. 같은 박스의 nginx 가 이 디렉터리를 `/assets/` 로 바로 낸다.
 *
 * 이름이 내용 해시라 이미 있으면 쓰지 않는다. 임시 이름에 쓰고 옮기므로 nginx 가 반쯤 쓴 파일을 내지 않는다.
 * 옛 해시의 파일은 지우지 않는다. 옛 목록을 받은 앱이 아직 그 파일을 받는 중일 수 있기 때문이다.
 */
@Injectable()
export class AssetStore {
  private readonly dir: string

  constructor(config: ConfigService<Env, true>) {
    this.dir = config.get('ASSETS_DIR', { infer: true })
  }

  async write(fileName: string, bytes: Buffer): Promise<void> {
    const target = join(this.dir, fileName)
    if (await exists(target)) return
    await mkdir(this.dir, { recursive: true })
    const temp = `${target}.${randomUUID()}.tmp`
    await writeFile(temp, bytes)
    await rename(temp, target)
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}
