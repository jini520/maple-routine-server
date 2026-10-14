import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Logger,
  NotFoundException,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common'
import type { FastifyReply, FastifyRequest } from 'fastify'

import { ZodValidationPipe } from '../../common/zod-validation.pipe'
import { callbackQuery, loginBody, sessionBody, type LoginBody, type SessionBody } from './auth.dto'
import { AuthService } from './auth.service'
import { bearerOf, SessionGuard } from './session.guard'
import { OAUTH_RETURN_HTML } from './views/oauth-return'

/** 넥슨 화면에서 돌아올 때까지 아무것도 캐시되면 안 된다. 302 가 캐시되면 다음 로그인이 옛 짝으로 간다. */
const NO_STORE = 'no-store'

/** 콜백이 어떤 경우에도 돌아가는 곳. 짝을 못 찾았을 때도 앱으로는 돌려보내야 한다. */
const FALLBACK_RETURN = 'com.mapleroutine.app://oauth/callback'

@Controller()
export class AuthController {
  private readonly logger = new Logger(AuthController.name)

  constructor(private readonly auth: AuthService) {}

  /** ①. 짝을 만들고 넥슨 화면 주소와 되묻기 열쇠를 준다. state 는 주지 않는다. */
  @Post('v1/auth/nexon/login')
  @Header('Cache-Control', NO_STORE)
  login(@Body(new ZodValidationPipe(loginBody)) body: LoginBody) {
    return this.auth.start(body.platform)
  }

  /** ③. 넥슨이 부른다. 무슨 일이 있어도 302 다. 안 그러면 사용자가 브라우저 에러 화면에 갇힌다. */
  @Get('v1/auth/nexon/callback')
  async callback(@Query() query: unknown, @Res() reply: FastifyReply): Promise<void> {
    let location = FALLBACK_RETURN
    try {
      const parsed = callbackQuery.safeParse(query)
      location = await this.auth.callback(parsed.success ? parsed.data : {})
    } catch (error) {
      this.logger.error(`콜백에서 던졌다: ${String(error)}`)
    }
    await reply.header('cache-control', NO_STORE).redirect(location, 302)
  }

  /** 안드로이드 App Link 가 앱을 못 열었을 때 브라우저가 오는 자리. */
  @Get('app/oauth/return')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Cache-Control', NO_STORE)
  oauthReturn(): string {
    return OAUTH_RETURN_HTML
  }

  /** ④. 열쇠 둘로 세션을 받는다. gone 만 404 이고 나머지는 status 로 가른다. */
  @Post('v1/auth/nexon/session')
  @Header('Cache-Control', NO_STORE)
  async session(@Body(new ZodValidationPipe(sessionBody)) body: SessionBody) {
    const result = await this.auth.redeem(body.redeemKey, body.receipt)
    if (result.status === 'gone') throw new NotFoundException({ status: 'gone' })
    return result
  }

  /** 로그아웃. 가드가 세션을 확인했으니 같은 값으로 지운다. */
  @Delete('v1/auth/nexon/session')
  @UseGuards(SessionGuard)
  @HttpCode(204)
  async logout(@Req() request: FastifyRequest): Promise<void> {
    const value = bearerOf(request)
    if (value !== null) await this.auth.logout(value)
  }
}
