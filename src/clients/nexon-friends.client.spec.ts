import type { NexonBucket } from './nexon-bucket'
import { NexonFriendsClient } from './nexon-friends.client'

const never = new AbortController().signal

function build() {
  const bucket = {
    run: jest.fn((_platform: string, _signal: AbortSignal, fn: () => Promise<unknown>) => fn()),
    drain: jest.fn().mockResolvedValue(undefined),
  }
  const client = new NexonFriendsClient(bucket as unknown as NexonBucket)
  return { client, bucket }
}

/** 부를 때마다 새 Response 다. 본문은 한 번만 읽히므로 같은 것을 두 번 주면 두 번째가 깨진다. */
function answer(status: number, body: string): () => Promise<Response> {
  return () => Promise.resolve(new Response(body, { status }))
}

describe('NexonFriendsClient', () => {
  const fetchMock = jest.fn()
  beforeEach(() => {
    fetchMock.mockReset()
    globalThis.fetch = fetchMock
  })

  it('Bearer 와 경로로 넥슨을 부르고 status 와 본문 Buffer 를 돌려준다', async () => {
    fetchMock.mockImplementation(answer(200, '{"count":0}'))
    const { client, bucket } = build()

    const page = await client.page(
      'ios',
      'AT',
      '/maplestory/v1/history/cube?count=1000&date=2026-10-01',
      never,
    )

    expect(page.status).toBe(200)
    expect(page.body.toString()).toBe('{"count":0}')
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(
      'https://open.api.nexon.com/maplestory/v1/history/cube?count=1000&date=2026-10-01',
    )
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer AT')
    expect(bucket.run).toHaveBeenCalledWith('ios', never, expect.any(Function))
  })

  it('429 면 버킷을 비우고 한 번만 다시 하고, 두 번째 429 는 그대로 돌려준다', async () => {
    fetchMock
      .mockImplementationOnce(answer(429, '{}'))
      .mockImplementationOnce(answer(200, '{"count":1}'))
    const { client, bucket } = build()

    const page = await client.page('android', 'AT', '/x', never)
    expect(page.status).toBe(200)
    expect(bucket.drain).toHaveBeenCalledWith('android')

    fetchMock.mockReset()
    fetchMock.mockImplementation(answer(429, '{}'))
    const again = await client.page('android', 'AT', '/x', never)
    expect(again.status).toBe(429)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('닿지 못하면 status 0 이다', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'))
    const { client } = build()

    const page = await client.page('ios', 'AT', '/x', never)

    expect(page).toEqual({ status: 0, body: Buffer.alloc(0) })
  })

  it('signal 이 끊기면 거절한다', async () => {
    const ctrl = new AbortController()
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new Error('aborted')))
        }),
    )
    const { client } = build()

    const pending = client.page('ios', 'AT', '/x', ctrl.signal)
    ctrl.abort()

    await expect(pending).rejects.toThrow()
  })
})
