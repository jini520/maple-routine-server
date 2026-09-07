/**
 * 진입점. 스키마를 맞추고 API 를 연다.
 *
 * 발송은 여기 없다. CLI(`bin/notice.ts`)가 한다. 발송이 API 안에 있으면 그 경로를 열어 둬야
 * 하고, 인증 없는 서버에서 그것은 아무나 전 사용자에게 알림을 쏘는 문이 된다.
 */
import { createApi } from './api.ts'
import { migrate } from './db.ts'

const port = Number(process.env.PORT ?? 4000)

await migrate()
createApi().listen(port, () => {
  console.log(`[api] :${port}`)
})
