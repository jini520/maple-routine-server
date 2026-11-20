import type { FastifyReply, FastifyRequest } from 'fastify'

import type { MarketDailyRepository } from './market-daily.repository'
import { MarketController } from './market.controller'

const STORED = { body: '{"close":9119}', etag: '"abc"' }

/** 부른 차례대로 상태 코드 · 머리 · 몸을 남기는 응답. */
function fakeReply() {
  const sent: { status: number; headers: Record<string, string>; body?: string } = {
    status: 200,
    headers: {},
  }
  const reply = {
    header: (k: string, v: string) => ((sent.headers[k] = v), reply),
    code: (s: number) => ((sent.status = s), reply),
    type: (t: string) => ((sent.headers['content-type'] = t), reply),
    send: (b?: string) => ((sent.body = b), Promise.resolve(reply)),
  }
  return { reply: reply as unknown as FastifyReply, sent }
}

function request(ifNoneMatch?: string): FastifyRequest {
  return {
    headers: ifNoneMatch === undefined ? {} : { 'if-none-match': ifNoneMatch },
  } as FastifyRequest
}

function controller(stored: typeof STORED | null) {
  return new MarketController({
    latestResponse: () => Promise.resolve(stored),
  } as unknown as MarketDailyRepository)
}

describe('MarketController', () => {
  it('저장한 몸을 ETag 와 그대로 주고, 앱이 같은 ETag 를 보내면 몸 없이 304 다. nginx 가 붙인 W/ 도 같은 ETag 로 본다', async () => {
    const first = fakeReply()
    await controller(STORED).maspi(request(), first.reply)
    const again = fakeReply()
    await controller(STORED).maspi(request('W/"abc"'), again.reply)

    expect(first.sent).toMatchObject({
      status: 200,
      body: STORED.body,
      headers: { etag: '"abc"', 'cache-control': 'no-cache' },
    })
    expect(again.sent).toMatchObject({ status: 304, body: undefined })
  })

  it('낸 MASPI 가 아직 없으면 close 가 null 인 빈 몸을 준다', async () => {
    const { reply, sent } = fakeReply()
    await controller(null).maspi(request(), reply)

    expect(JSON.parse(sent.body ?? '')).toEqual({
      change: null,
      close: null,
      date: null,
      series: [],
    })
  })
})
