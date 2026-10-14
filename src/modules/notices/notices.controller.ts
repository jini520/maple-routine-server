import { Controller, Get, NotFoundException, Param, Query } from '@nestjs/common'

import { ZodValidationPipe } from '../../common/zod-validation.pipe'
import { type ListQuery, listQuery, type SundayQuery, sundayQuery } from './notices.dto'
import { NoticesService } from './notices.service'

/** 공개 조회 셋. 인증이 없다. 공지는 공개 정보다. */
@Controller()
export class NoticesController {
  constructor(private readonly notices: NoticesService) {}

  /** 목록. blocks 는 안 실린다. nextCursor 는 늘 null 이고 계약의 모양만 지킨다. */
  @Get('v1/notices')
  async list(@Query(new ZodValidationPipe(listQuery)) query: ListQuery) {
    const items = await this.notices.list(query.kind ?? null, query.limit)
    return { items, nextCursor: null }
  }

  /** 한 건. blocks 가 여기 실린다. 404 는 없다는 답이고 앱은 사본에서 뺀다. */
  @Get('v1/notices/:id')
  async detail(@Param('id') id: string) {
    const notice = await this.notices.detail(id)
    if (notice === null) throw new NotFoundException()
    return notice
  }

  @Get('v1/sunday-maple')
  async sunday(@Query(new ZodValidationPipe(sundayQuery)) query: SundayQuery) {
    return { items: await this.notices.sunday(query.limit) }
  }
}
