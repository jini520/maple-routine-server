import type { ConfigService } from '@nestjs/config'

import type { Env } from '../config/env.schema'
import { NexonOpenApiClient } from './nexon-open-api.client'

function clientOf(key: string | undefined): NexonOpenApiClient {
  return new NexonOpenApiClient({ get: () => key } as unknown as ConfigService<Env, true>)
}

function answer(status: number, body: unknown): () => Promise<Response> {
  return () => Promise.resolve(new Response(JSON.stringify(body), { status }))
}

describe('NexonOpenApiClient', () => {
  const fetchMock = jest.fn()
  beforeEach(() => {
    fetchMock.mockReset()
    globalThis.fetch = fetchMock
  })

  it('키가 없으면 enabled 가 거짓이고 부르면 던진다', async () => {
    const client = clientOf(undefined)
    expect(client.enabled).toBe(false)
    await expect(client.noticeList('game')).rejects.toThrow()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('목록은 분류의 경로와 응답 키로 읽고 x-nxopen-api-key 를 싣는다', async () => {
    fetchMock.mockImplementation(
      answer(200, {
        update_notice: [
          {
            title: '업데이트 안내',
            url: 'https://u/1',
            notice_id: 811,
            date: '2026-09-09T16:24+09:00',
          },
        ],
      }),
    )
    const client = clientOf('KEY')

    const items = await client.noticeList('update')

    expect(items).toEqual([
      { noticeId: 811, title: '업데이트 안내', url: 'https://u/1', date: '2026-09-09T16:24+09:00' },
    ])
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://open.api.nexon.com/maplestory/v1/notice-update')
    expect((init.headers as Record<string, string>)['x-nxopen-api-key']).toBe('KEY')
  })

  it('네 분류의 경로와 응답 키가 다르다', async () => {
    fetchMock
      .mockImplementationOnce(answer(200, { notice: [] }))
      .mockImplementationOnce(answer(200, { event_notice: [] }))
      .mockImplementationOnce(answer(200, { cashshop_notice: [] }))
    const client = clientOf('KEY')

    await client.noticeList('game')
    await client.noticeList('event')
    await client.noticeList('cashshop')

    expect(fetchMock.mock.calls.map((c) => (c as [string])[0])).toEqual([
      'https://open.api.nexon.com/maplestory/v1/notice',
      'https://open.api.nexon.com/maplestory/v1/notice-event',
      'https://open.api.nexon.com/maplestory/v1/notice-cashshop',
    ])
  })

  it('상세는 notice_id 를 쿼리로 보내고 이벤트 기간을 같이 돌려준다', async () => {
    fetchMock.mockImplementation(
      answer(200, {
        title: '썬데이 메이플',
        url: 'https://e/1397',
        contents: '<img src="x">',
        date: '2026-10-08T10:00+09:00',
        date_event_start: '2026-10-11T00:00+09:00',
        date_event_end: '2026-10-11T23:59+09:00',
      }),
    )
    const client = clientOf('KEY')

    const detail = await client.noticeDetail('event', 1397)

    expect(detail).toEqual({
      title: '썬데이 메이플',
      url: 'https://e/1397',
      contents: '<img src="x">',
      date: '2026-10-08T10:00+09:00',
      eventStart: '2026-10-11T00:00+09:00',
      eventEnd: '2026-10-11T23:59+09:00',
    })
    expect((fetchMock.mock.calls[0] as [string])[0]).toBe(
      'https://open.api.nexon.com/maplestory/v1/notice-event/detail?notice_id=1397',
    )
  })

  it('200 이 아니면 상태를 담아 던진다', async () => {
    fetchMock.mockImplementation(answer(429, { error: { name: 'OPENAPI00007' } }))
    const client = clientOf('KEY')

    await expect(client.noticeList('game')).rejects.toThrow('429')
  })
})
