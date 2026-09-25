// 라우팅. 이 파일이 이 저장소에서 `api.ts` 에 붙는 첫 테스트다.
//
// 전에는 붙일 수가 없었다. `api.ts` 가 `db.ts` 를 직접 import 해서 부르는 순간 DB 를
// 요구했고, 이 저장소의 테스트는 DB 를 안 탄다. 이제 DB 를 인자로 받으므로 가짜를 넣는다.
//
// 여기서 막는 사고는 엉뚱한 경로로 새는 것이다. 옛 라우터는 `/admin/notices/` 뒤를 전부
// id 로 읽어서, 등록 순서를 바꾸면 예약 취소가 공지 삭제로 들어갔다.
import assert from 'node:assert/strict'
import { afterEach, beforeEach, test } from 'node:test'

import { createApi, type ApiDeps } from './api.ts'
import type { Notice } from './notice.ts'

const 공지: Notice = {
  id: 'notice-20260916-120000',
  kind: 'app',
  title: '점검 안내',
  body: '새벽 2시부터 점검합니다.',
  publishedAt: '2026-09-16T03:00:00.000Z',
}

/** DB 를 안 탄다. 부른 인자를 그대로 남겨 라우트가 무엇을 넘겼는지 본다. */
function 가짜DB(): { 부른것: Record<string, unknown[]>; deps: ApiDeps } {
  const 부른것: Record<string, unknown[]> = {}
  const 적기 =
    <T>(이름: string, 답: T) =>
    async (...args: unknown[]): Promise<T> => {
      부른것[이름] = args
      return 답
    }

  return {
    부른것,
    deps: {
      settlement: () => ({ settling: true, startedAt: '2026-09-16T15:00:00.000Z' }),
      listNotices: 적기('listNotices', { items: [공지], nextCursor: null }),
      getNotice: 적기<Notice | null>('getNotice', 공지),
      listEventRows: 적기('listEventRows', []),
      listOpenManualCompletionBosses: 적기('bosses', [{ boss: 'lucid', from: '2026-09-01' }]),
    },
  }
}

// 라우팅을 보는 테스트라 요청 로그가 필요 없다. 안 끄면 단언 한 줄이 JSON 수십 줄에 묻힌다.
process.env.LOG_LEVEL = 'silent'

const 원래토큰 = process.env.ADMIN_TOKEN

beforeEach(() => {
  process.env.ADMIN_TOKEN = '비밀'
})

afterEach(() => {
  if (원래토큰 === undefined) delete process.env.ADMIN_TOKEN
  else process.env.ADMIN_TOKEN = 원래토큰
})

test('살아 있는지 묻는 자리', async () => {
  const app = createApi(가짜DB().deps)
  const res = await app.inject({ method: 'GET', url: '/healthz' })

  assert.equal(res.statusCode, 200)
  assert.deepEqual(res.json(), { ok: true })
})

test('목록은 짧게 캐시하고 결산과 직접 완료는 안 한다', async () => {
  // 목록은 같은 화면을 두 번 열 때 서버를 안 깨우려고 캐시한다. 결산 판정은 1분마다 갈려서
  // 60초를 걸면 앱이 최대 2분 낡은 값을 본다. 직접 완료는 운영자가 연 것이 바로 닿아야 한다.
  const app = createApi(가짜DB().deps)

  const 목록 = await app.inject({ method: 'GET', url: '/v1/notices' })
  assert.equal(목록.headers['cache-control'], 'public, max-age=60')

  const 결산 = await app.inject({ method: 'GET', url: '/v1/settlement' })
  assert.equal(결산.headers['cache-control'], 'no-store')

  const 직접완료 = await app.inject({ method: 'GET', url: '/v1/manual-completion' })
  assert.equal(직접완료.headers['cache-control'], 'no-store')
})

test('limit 은 상한 안으로 깎인다', async () => {
  const 가짜 = 가짜DB()
  const app = createApi(가짜.deps)

  await app.inject({ method: 'GET', url: '/v1/notices?limit=9999' })
  assert.equal(가짜.부른것.listNotices?.[0], 50, '상한은 50')

  await app.inject({ method: 'GET', url: '/v1/notices?limit=0' })
  assert.equal(가짜.부른것.listNotices?.[0], 1, '하한은 1')

  await app.inject({ method: 'GET', url: '/v1/notices?limit=이상한값' })
  assert.equal(가짜.부른것.listNotices?.[0], 20, '숫자가 아니면 기본값')

  await app.inject({ method: 'GET', url: '/v1/notices' })
  assert.equal(가짜.부른것.listNotices?.[0], 20)
})

test('모르는 분류는 버리고 빈 목록은 전 분류다', async () => {
  const 가짜 = 가짜DB()
  const app = createApi(가짜.deps)

  await app.inject({ method: 'GET', url: '/v1/notices?kind=game,없는분류,update' })
  assert.deepEqual(가짜.부른것.listNotices?.[2], ['game', 'update'])

  // 옛 앱이 `kind` 없이 부른다. 그때는 전부 준다.
  await app.inject({ method: 'GET', url: '/v1/notices' })
  assert.deepEqual(가짜.부른것.listNotices?.[2], [])
})

test('상세는 id 를 그대로 넘기고 없으면 404 다', async () => {
  const 가짜 = 가짜DB()
  const app = createApi(가짜.deps)

  const 있음 = await app.inject({ method: 'GET', url: '/v1/notices/notice-20260916-120000' })
  assert.equal(있음.statusCode, 200)
  assert.equal(가짜.부른것.getNotice?.[0], 'notice-20260916-120000')

  const 없음 = createApi({ ...가짜.deps, getNotice: async () => null })
  const res = await 없음.inject({ method: 'GET', url: '/v1/notices/없는id' })
  assert.equal(res.statusCode, 404)
  assert.deepEqual(res.json(), { error: 'not_found' })
})

test('인코딩된 id 를 푼다', async () => {
  // 안 풀면 DB 의 id 와 안 맞아 멀쩡한 공지가 없는 것이 된다.
  const 가짜 = 가짜DB()
  const app = createApi(가짜.deps)

  await app.inject({ method: 'GET', url: '/v1/notices/notice%20a' })
  assert.equal(가짜.부른것.getNotice?.[0], 'notice a')
})

test('목록 경로가 상세로 안 샌다', async () => {
  // 옛 라우터가 `/v1/notices/` 뒤를 전부 id 로 읽어서 생긴 위험이다.
  const 가짜 = 가짜DB()
  const app = createApi(가짜.deps)

  await app.inject({ method: 'GET', url: '/v1/notices' })
  assert.equal(가짜.부른것.getNotice, undefined, '목록 조회가 상세를 안 부른다')
})

test('없는 주소는 404, GET 이 아니면 405', async () => {
  const app = createApi(가짜DB().deps)

  const 없음 = await app.inject({ method: 'GET', url: '/v1/모르는것' })
  assert.equal(없음.statusCode, 404)
  assert.deepEqual(없음.json(), { error: 'not_found' })

  const 안되는메서드 = await app.inject({ method: 'POST', url: '/v1/notices' })
  assert.equal(안되는메서드.statusCode, 405)
  assert.deepEqual(안되는메서드.json(), { error: 'method_not_allowed' })
})

test('관리자 경로는 토큰이 없으면 403 이다', async () => {
  const app = createApi(가짜DB().deps)

  for (const url of ['/admin', '/admin/notices', '/admin/manual-completion', '/admin/없는것']) {
    const res = await app.inject({ method: 'GET', url })
    assert.equal(res.statusCode, 403, `${url} 이 토큰 없이 열렸다`)
    assert.deepEqual(res.json(), { error: 'forbidden' })
  }
})

test('토큰이 설정 안 돼 있으면 관리자 경로를 닫는다', async () => {
  // 열어 두면 설정을 빠뜨린 서버가 조용히 무방비가 된다.
  delete process.env.ADMIN_TOKEN
  const app = createApi(가짜DB().deps)

  const res = await app.inject({
    method: 'GET',
    url: '/admin',
    headers: { 'x-admin-token': '아무값' },
  })
  assert.equal(res.statusCode, 403)
})

test('토큰이 맞으면 관리자 화면이 선다', async () => {
  const app = createApi(가짜DB().deps)

  const res = await app.inject({
    method: 'GET',
    url: '/admin',
    headers: { 'x-admin-token': '비밀' },
  })
  assert.equal(res.statusCode, 200)
  assert.match(res.headers['content-type'] as string, /text\/html/)
  assert.equal(res.headers['cache-control'], 'no-store')
})

test('예약 취소가 공지 삭제로 안 들어간다', async () => {
  // 옛 라우터에서 실제로 위험했던 자리다. `/admin/notices/` 뒤를 전부 id 로 읽어서, 등록
  // 순서를 바꾸면 예약 취소 요청이 그 공지를 지웠다. 경로 모양이 다르므로 이제는 안 섞인다.
  const app = createApi(가짜DB().deps)

  const res = await app.inject({
    method: 'DELETE',
    url: '/admin/notices/어떤id/schedule',
    headers: { 'x-admin-token': '비밀' },
  })
  // DB 를 타는 핸들러라 여기서는 500 이 정상이다. 요점은 404 나 405 가 아니라는 것,
  // 곧 이 주소가 제 라우트로 들어갔다는 것이다.
  assert.notEqual(res.statusCode, 404)
  assert.notEqual(res.statusCode, 405)
})

test('본문 상한을 넘기면 413 이다', async () => {
  // 상한이 없으면 메모리를 먹이는 길이 된다.
  const app = createApi(가짜DB().deps)

  const res = await app.inject({
    method: 'POST',
    url: '/admin/notices',
    headers: { 'x-admin-token': '비밀', 'content-type': 'application/json' },
    payload: JSON.stringify({ title: 'ㄱ'.repeat(300 * 1024) }),
  })
  assert.equal(res.statusCode, 413)
})
