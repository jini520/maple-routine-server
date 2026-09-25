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
import { exclusively, hasAny, insertNotice, knownIds, listDueScheduled, markSent } from './db.ts'
import { migrate } from './migrate.ts'
import { NexonClient } from './nexon.ts'
import { startPolling } from './poll.ts'
import { startScheduleWatch } from './schedule.ts'
import { startSettlementWatch, type Settlement } from './settlement.ts'
import { LOCK_IDS } from './single-runner.ts'
import { sendNotice } from './send.ts'

const port = Number(process.env.PORT ?? 4000)
/** 넥슨 목록에서 빠지면 그 글은 영영 못 받는다. 촘촘히 도는 이유가 그것이다. */
const pollIntervalMs = Number(process.env.POLL_INTERVAL_MS ?? 60_000)
/**
 * 예약 알림을 보는 간격. **`POLL_INTERVAL_MS` 를 안 나눠 쓴다.**
 *
 * 그 값은 넥슨 목록을 놓치지 않으려고 두는 것이라 운영자가 늘릴 수 있는데, 늘리면 예약 알림이
 * 그만큼 늦게 나간다. 운영자가 고른 시각과 트레이가 울리는 시각의 차이는 1분 안이어야 한다.
 */
const scheduleIntervalMs = 60_000

await migrate()

const nexonKey = process.env.NEXON_KEY
/** 결산을 재는 캐릭터. 없으면 확인을 안 돌고 앱에는 늘 «결산 아님» 이 간다. */
const settlementOcid = process.env.SETTLEMENT_OCID
const client = nexonKey === undefined || nexonKey === '' ? null : new NexonClient(nexonKey)

let settlement: () => Settlement = () => ({ settling: false, startedAt: null })
if (client !== null && settlementOcid !== undefined && settlementOcid !== '') {
  // 폴링과 같은 간격으로 돈다. 창 밖이면 넥슨을 안 부르므로 낮에는 이 고리가 놀기만 한다.
  // 자물쇠를 안 건다. 판정을 프로세스 메모리에 들고 API 가 그 값을 읽어서, 한 인스턴스만
  // 재게 하면 나머지가 늘 `결산 아님` 을 내놓는다. 인스턴스를 늘리기 전에 판정을 DB 로 옮길 것.
  settlement = startSettlementWatch(
    { probe: (date) => client.probeSchedulerState(settlementOcid, date) },
    pollIntervalMs,
  ).settlement
  console.log('[settlement] 밤마다 결산을 본다')
} else {
  console.warn('[settlement] NEXON_KEY 나 SETTLEMENT_OCID 가 없어 결산을 안 본다')
}

// 판정을 만든 뒤에 API 를 연다. 서버가 뜬 직후에도 같은 함수를 읽는다.
createApi(settlement).listen(port, () => {
  console.log(`[api] :${port}`)
})

// 예약 알림은 넥슨 키와 무관하게 돈다. 운영자가 `/admin` 에서 건 것이라, 넥슨 공지를 안 받는
// 서버에서도 그 시각에 나가야 한다. 예약이 없는 회차는 DB 만 한 번 물어보고 끝난다.
startScheduleWatch(
  {
    due: listDueScheduled,
    send: async (notice, push) => {
      await sendNotice(notice, push)
      await markSent(notice.id, push.title, push.body)
    },
  },
  scheduleIntervalMs,
  exclusively(LOCK_IDS.schedule),
)
console.log(`[schedule] ${scheduleIntervalMs}ms 간격`)

if (client === null) {
  console.warn('[poll] NEXON_KEY 가 없어 넥슨 공지를 안 받는다')
} else {
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
    exclusively(LOCK_IDS.poll),
  )
  console.log(`[poll] ${pollIntervalMs}ms 간격`)
}
