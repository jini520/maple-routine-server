import { Controller, Get } from '@nestjs/common'

/** 살아 있는지만 답하는 자리. 도커 healthcheck 와 nginx 가 본다. */
@Controller()
export class AppController {
  @Get('healthz')
  healthz(): { ok: true } {
    return { ok: true }
  }
}
