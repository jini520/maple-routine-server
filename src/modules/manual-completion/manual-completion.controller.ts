import { Controller, Get } from '@nestjs/common'

import { ManualCompletionRepository } from './manual-completion.repository'

/** 직접 완료를 열어 둔 보스. 공개 조회다. 못 받으면 앱이 닫힘으로 본다. */
@Controller()
export class ManualCompletionController {
  constructor(private readonly manual: ManualCompletionRepository) {}

  @Get('v1/manual-completion')
  async open() {
    return { bosses: await this.manual.open() }
  }
}
