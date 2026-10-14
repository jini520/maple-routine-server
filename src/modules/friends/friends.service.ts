import { Injectable, Logger, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { FastifyReply } from 'fastify'

import { NexonFriendsClient } from '../../clients/nexon-friends.client'
import type { Env } from '../../config/env.schema'
import type { SessionContext } from '../auth/session.guard'
import { ReloginRequired, TokenService } from '../auth/token.service'
import type { StreamTask } from './friends.dto'
import { pathOf } from './lines'
import { NdjsonOutput } from './ndjson-output'
import { MAX_PAGES_PER_TASK, runStream } from './stream-run'

/** 한 회차. 토큰을 받고, 응답을 가로채 NDJSON 을 흘리고, 끝나면 한 줄을 남긴다. */
@Injectable()
export class FriendsService {
  private readonly logger = new Logger(FriendsService.name)

  constructor(
    private readonly tokens: TokenService,
    private readonly nexon: NexonFriendsClient,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /**
   * 작업 목록을 넥슨에 돌며 응답에 줄을 흘린다. 돌아오면 응답은 끝나 있다.
   *
   * 첫 토큰은 헤더를 내기 전에 받는다. 갱신이 거절되면 그 자리에서 401 을 낼 수 있다.
   * 헤더가 나간 뒤의 거절은 end 줄의 relogin 으로 간다.
   */
  async stream(
    session: SessionContext,
    tasks: readonly StreamTask[],
    reply: FastifyReply,
  ): Promise<void> {
    const tokenFor = () => this.tokens.tokenFor(session.id)
    try {
      await tokenFor()
    } catch (error) {
      if (error instanceof ReloginRequired) throw new UnauthorizedException()
      throw error
    }

    const abort = new AbortController()
    const res = reply.raw
    // 요청 쪽 close 는 본문을 다 읽어도 나므로 끊김은 응답 쪽에서 본다.
    res.on('close', () => {
      if (!res.writableFinished) abort.abort()
    })
    reply.hijack()
    res.writeHead(200, {
      'content-type': 'application/x-ndjson',
      'content-encoding': 'gzip',
      'x-accel-buffering': 'no',
      'cache-control': 'no-store',
    })
    const out = new NdjsonOutput(res, abort.signal)
    try {
      const summary = await runStream({
        tasks,
        fanout: this.config.get('FRIENDS_FANOUT', { infer: true }),
        deadlineMs: this.config.get('FRIENDS_RUN_DEADLINE_MS', { infer: true }),
        maxBytes: this.config.get('FRIENDS_RUN_BYTES', { infer: true }),
        maxPages: MAX_PAGES_PER_TASK,
        signal: abort.signal,
        now: Date.now,
        tokenFor,
        fetchPage: (task, cursor, token, signal) =>
          this.nexon.page(session.platform, token, pathOf(task, cursor), signal),
        sink: out,
      })
      this.logger.log(
        `회차 ${summary.reason}: 작업 ${summary.done}/${summary.tasks} 실패 ${summary.failed} 쪽 ${summary.pages} ${summary.bytes}B ${summary.elapsedMs}ms user=${session.userId}`,
      )
    } catch (error) {
      this.logger.error(`회차가 던졌다: ${String(error)}`)
      abort.abort()
    } finally {
      await out.end()
    }
  }
}
