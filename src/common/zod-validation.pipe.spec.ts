import { BadRequestException } from '@nestjs/common'
import { z } from 'zod'

import { ZodValidationPipe } from './zod-validation.pipe'

describe('ZodValidationPipe', () => {
  const pipe = new ZodValidationPipe(z.object({ platform: z.enum(['ios', 'android']) }))

  it('맞는 값은 파싱된 모양으로 돌려준다', () => {
    expect(pipe.transform({ platform: 'ios', extra: 1 })).toEqual({ platform: 'ios' })
  })

  it('틀린 값은 400 으로 던진다', () => {
    expect(() => pipe.transform({ platform: 'web' })).toThrow(BadRequestException)
  })
})
