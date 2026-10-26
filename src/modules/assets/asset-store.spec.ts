import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { ConfigService } from '@nestjs/config'

import type { Env } from '../../config/env.schema'
import { AssetStore } from './asset-store'

describe('AssetStore', () => {
  let dir: string
  let store: AssetStore

  beforeEach(async () => {
    dir = join(await mkdtemp(join(tmpdir(), 'assets-')), 'nested')
    store = new AssetStore({ get: () => dir } as unknown as ConfigService<Env, true>)
  })
  afterEach(() => rm(join(dir, '..'), { recursive: true, force: true }))

  it('디렉터리를 만들어 쓰고, 이미 있는 이름은 덮어쓰지 않으며 임시 파일을 남기지 않는다', async () => {
    await store.write('abc.png', Buffer.from('one'))
    await store.write('abc.png', Buffer.from('two'))
    expect(await readFile(join(dir, 'abc.png'), 'utf8')).toBe('one')
    expect(await readdir(dir)).toEqual(['abc.png'])
  })
})
