import { Controller, Get, Header } from '@nestjs/common'

import { SettlementService } from './settlement.service'

/** 결산 중인지 본다. 공개 조회다. 앱이 스케줄러를 갱신하는 자리마다 부른다. */
@Controller()
export class SettlementController {
  constructor(private readonly settlement: SettlementService) {}

  @Get('v1/settlement')
  @Header('cache-control', 'no-store')
  current() {
    return this.settlement.current()
  }
}
