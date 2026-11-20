/**
 * 점검 잠금을 켜고 끈다. 맥에서 돌린다.
 *
 * `npm run build && npm run maintenance -- on --until "2026-12-02 06:00"` · `off` · `status`
 *
 * 점검 상태는 앱 박스의 파일 하나다. 파일이 있으면 nginx 가 `GET /v1/maintenance` 에 그 내용을 200 으로 내고 `/v1/` 의 나머지
 * 요청을 서버로 넘기지 않는다. 서버가 아니라 nginx 가 답하는 것은 서버 컨테이너를 내린 동안에도 앱이 점검 중인 것을 알아야
 * 하기 때문이다. nginx 설정은 `README.md` 에 있다.
 */
import { execFileSync } from 'node:child_process'

import { maintenanceFile, parseMaintenanceArgs } from './maintenance-args'

/** 앱 박스. 앱 저장소의 OTA 발행 스크립트가 쓰는 주소와 같다. */
const HOST = 'ubuntu@158.179.175.230'
const DIR = '/srv/maple-routine-maintenance'
const FILE = `${DIR}/maintenance.json`
const STATUS_URL = 'https://mapleroutine.store/v1/maintenance'

function ssh(command: string, input?: string): void {
  execFileSync('ssh', ['-o', 'BatchMode=yes', HOST, command], {
    input,
    stdio: [input === undefined ? 'ignore' : 'pipe', 'inherit', 'inherit'],
  })
}

/** 앱이 묻는 주소에 그대로 물어 본다. 파일을 쓴 것과 nginx 가 내는 것이 같은지 여기서 확인된다. */
async function printStatus(): Promise<void> {
  const response = await fetch(STATUS_URL, { headers: { 'cache-control': 'no-cache' } })
  if (response.status === 204) console.log('점검 아님')
  else if (response.status === 200) console.log(`점검 중 ${(await response.text()).trim()}`)
  else console.log(`모름 (HTTP ${response.status}). nginx 에 점검 설정이 들어가 있는지 확인한다`)
}

async function main(): Promise<void> {
  const args = parseMaintenanceArgs(process.argv.slice(2), Date.now())
  switch (args.command) {
    case 'on':
      // 임시 이름에 쓰고 옮긴다. nginx 가 반쯤 쓴 파일을 내지 않는다.
      ssh(`cat > ${FILE}.tmp && mv ${FILE}.tmp ${FILE}`, maintenanceFile(args.until))
      break
    case 'off':
      ssh(`rm -f ${FILE}`)
      break
    case 'status':
      break
  }
  await printStatus()
}

main().catch((error: unknown) => {
  console.error(String(error))
  process.exitCode = 1
})
