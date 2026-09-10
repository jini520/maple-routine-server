/**
 * 진입점. 스키마를 맞추고 API 를 연 다음 넥슨 폴링을 건다.
 *
 * 운영자 발송은 여기 없다. CLI(`bin/notice.ts`)와 `/admin` 이 한다. 발송이 공개 API 안에
 * 있으면 그 경로를 열어 둬야 하고, 인증 없는 서버에서 그것은 아무나 전 사용자에게 알림을
 * 쏘는 문이 된다.
 *
 * **`NEXON_KEY` 가 없으면 폴링을 안 건다.** 조회 API 는 그대로 열린다. 키 없이 폴링을 걸면
 * 1분마다 401 을 찍는 서버가 되고, 그 로그가 진짜 고장을 덮는다.
 */
import { createApi } from './api.ts'
import { hasAny, insertNotice, knownIds, markSent } from './db.ts'
import { migrate } from './db.ts'
import { NexonClient } from './nexon.ts'
import { startPolling } from './poll.ts'
import { sendNotice } from './send.ts'

const port = Number(process.env.PORT ?? 4000)
/** 넥슨 목록에서 빠지면 그 글은 영영 못 받는다. 촘촘히 도는 이유가 그것이다. */
const pollIntervalMs = Number(process.env.POLL_INTERVAL_MS ?? 60_000)

await migrate()

createApi().listen(port, () => {
  console.log(`[api] :${port}`)
})

const nexonKey = process.env.NEXON_KEY
if (nexonKey === undefined || nexonKey === '') {
  console.warn('[poll] NEXON_KEY 가 없어 넥슨 공지를 안 받는다')
} else {
  const client = new NexonClient(nexonKey)
  startPolling(
    {
      list: (kind) => client.list(kind),
      detail: (kind, item) => client.detail(kind, item),
      knownIds,
      hasAny,
      save: insertNotice,
      send: async (notice, push) => {
        await sendNotice(notice, push)
        await markSent(notice.id, push.title, push.body)
      },
    },
    pollIntervalMs,
  )
  console.log(`[poll] ${pollIntervalMs}ms 간격`)
}
