/**
 * 예약한 알림을 시각이 되면 보낸다. **공지는 이미 저장돼 있고 트레이만 나중에 울린다.**
 *
 * 예약을 메모리 타이머로 안 드는 이유. 배포가 `docker compose up -d --build` 라 컨테이너가
 * 자주 새로 뜨는데, 타이머로 들면 그때 걸린 예약이 통째로 사라진다. DB 의 `scheduled_at` 을
 * 1분마다 훑으면 재시작이 예약을 못 지운다.
 *
 * **시각을 지나친 예약도 보낸다**(사용자 지정 2026-09-19). 서버가 죽어 있었거나 배포가 예약
 * 시각과 겹쳤으면 살아난 첫 회차에 나간다. 늦은 알림이 안 온 알림보다 낫다는 판단이다.
 *
 * **발송이 실패하면 예약을 그대로 둔다.** 발송 기록(`sent_at`)이 성공한 건에만 찍히므로 다음
 * 회차가 같은 건을 다시 잡는다. 폴러가 못 보낸 것을 안 다시 보내는 것과 반대인 이유는, 저쪽은
 * 회차마다 스무 건이 밀릴 수 있고 이쪽은 운영자가 손으로 건 한 건이라서다. 영구 실패를 끊는
 * 자리는 운영자 화면의 예약 취소다.
 */
import type { Notice, PushText } from './notice.ts'
import { runAnyway, type RunExclusively } from './single-runner.ts'

/** 보낼 시각이 된 한 건. 문구는 예약할 때 적어 둔 것이다. */
export interface DuePush {
  notice: Notice
  push: PushText
}

export interface ScheduleDeps {
  /** 시각이 된 예약. 이미 보낸 것과 취소한 것은 안 온다. */
  due: () => Promise<DuePush[]>
  /** 보내고 발송 기록까지 적는다. 던지면 그 건은 다음 회차가 다시 잡는다. */
  send: (notice: Notice, push: PushText) => Promise<void>
}

export interface ScheduleResult {
  sent: number
  /** 보내다 실패한 건수. 예약은 그대로 남아 다음 회차에 다시 나간다. */
  failed: number
}

/**
 * 한 회차. **한 건이 실패해도 나머지를 보낸다.**
 *
 * 같은 시각에 두 건을 걸어 둘 수 있고, 앞 건의 실패가 뒤 건을 막으면 그 회차가 통째로 밀린다.
 */
export async function sendDue(deps: ScheduleDeps): Promise<ScheduleResult> {
  const result: ScheduleResult = { sent: 0, failed: 0 }

  for (const one of await deps.due()) {
    try {
      await deps.send(one.notice, one.push)
      result.sent += 1
    } catch (error) {
      console.error(`[schedule] ${one.notice.id} 발송 실패`, error)
      result.failed += 1
    }
  }

  return result
}

/**
 * 고리를 건다. 돌려주는 함수를 부르면 멈춘다.
 *
 * 폴링·결산과 같은 모양이다. `setInterval` 이 아니라 끝난 뒤에 다음을 잡아, FCM 이 느린 날
 * 회차가 겹쳐 같은 예약을 두 번 쏘는 일이 없다.
 *
 * @param exclusive 인스턴스가 여럿일 때 한 쪽에서만 돌게 하는 자물쇠. 못 잡으면 그 회차를
 *   건너뛴다. 안 주면 아무도 안 막는다
 */
export function startScheduleWatch(
  deps: ScheduleDeps,
  intervalMs: number,
  exclusive: RunExclusively = runAnyway,
): () => void {
  let stopped = false
  let timer: NodeJS.Timeout | undefined

  const loop = async (): Promise<void> => {
    if (stopped) return

    try {
      await exclusive(async () => {
        const result = await sendDue(deps)
        if (result.sent > 0 || result.failed > 0) {
          console.log('[schedule]', JSON.stringify(result))
        }
      })
    } catch (error) {
      // 예약 조회가 죽었다. 다음 회차가 다시 묻는다.
      console.error('[schedule] 회차 실패', error)
    }

    if (!stopped) timer = setTimeout(() => void loop(), intervalMs)
  }

  void loop()

  return () => {
    stopped = true
    if (timer !== undefined) clearTimeout(timer)
  }
}
