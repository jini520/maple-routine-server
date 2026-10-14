import { BadRequestException, Injectable, type PipeTransform } from '@nestjs/common'
import type { ZodType } from 'zod'

/**
 * zod 스키마로 요청 값을 검사하는 파이프.
 *
 * @example @Body(new ZodValidationPipe(loginBody)) body: LoginBody
 */
@Injectable()
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value)
    if (!result.success) {
      throw new BadRequestException(result.error.issues)
    }
    return result.data
  }
}
