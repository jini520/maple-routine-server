import { Test } from '@nestjs/testing'

import { AppModule } from './app.module'

describe('AppModule', () => {
  it('env 가 갖춰지면 모듈 전체가 조립된다', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()

    expect(moduleRef).toBeDefined()
    await moduleRef.close()
  })
})
