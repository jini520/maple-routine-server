import { Controller, Get } from '@nestjs/common'

import { BossesRepository } from './bosses.repository'

/** 보스 목록과 규칙. 공개 조회다. 앱은 켤 때 받아 updatedAt 이 다르면 사본을 덮어쓴다. */
@Controller()
export class BossesController {
  constructor(private readonly bosses: BossesRepository) {}

  @Get('v1/bosses')
  catalog() {
    return this.bosses.catalog()
  }
}
