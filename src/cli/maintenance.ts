/**
 * 점검 잠금을 켜고 끈다. 맥에서 돌린다.
 *
 * `npm run build && npm run maintenance -- on --target api --until "2026-12-02 06:00"` · `off --target api` · `status`
 *
 * 점검 상태는 주소(루트 · api)마다 앱 박스의 파일 하나다. 파일이 있으면 그 주소의 nginx 가 `GET /v1/maintenance` 에 그 내용을
 * 200 으로 내고 `/v1/` 의 나머지 요청을 서버로 넘기지 않는다. 서버가 아니라 nginx 가 답하는 것은 서버 컨테이너를 내린 동안에도
 * 앱이 점검 중인 것을 알아야 하기 때문이다. nginx 설정은 `README.md` 에 있다.
 */
import { execFileSync } from 'node:child_process'

import {
  MAINTENANCE_TARGETS,
  type MaintenanceTarget,
  maintenanceFile,
  parseMaintenanceArgs,
} from './maintenance-args'

/** 앱 박스. 점검 파일을 읽는 nginx 가 여기 있다. */
const HOST = 'ubuntu@158.179.175.230'

function ssh(command: string, input?: string): void {
  execFileSync('ssh', ['-o', 'BatchMode=yes', HOST, command], {
    input,
    stdio: [input === undefined ? 'ignore' : 'pipe', 'inherit', 'inherit'],
  })
}

/** 앱이 묻는 주소에 그대로 물어 본다. 파일을 쓴 것과 nginx 가 내는 것이 같은지 여기서 확인된다. */
async function printStatus(target: MaintenanceTarget): Promise<number> {
  const { statusUrl } = MAINTENANCE_TARGETS[target]
  const response = await fetch(statusUrl, { headers: { 'cache-control': 'no-cache' } })
  const label = `${target.padEnd(4)} ${statusUrl}`
  if (response.status === 204) console.log(`${label}: 점검 아님`)
  else if (response.status === 200)
    console.log(`${label}: 점검 중 ${(await response.text()).trim()}`)
  else
    console.log(
      `${label}: 모름 (HTTP ${response.status}). nginx 에 점검 설정이 들어가 있는지 확인한다`,
    )
  return response.status
}

async function main(): Promise<void> {
  const args = parseMaintenanceArgs(process.argv.slice(2), Date.now())
  for (const target of args.targets) {
    const { file } = MAINTENANCE_TARGETS[target]
    if (args.command === 'on') {
      // 임시 이름에 쓰고 옮긴다. nginx 가 반쯤 쓴 파일을 내지 않는다.
      ssh(`cat > ${file}.tmp && mv ${file}.tmp ${file}`, maintenanceFile(args.until))
    } else if (args.command === 'off') {
      ssh(`rm -f ${file}`)
    }
  }

  // 두 주소를 다 찍는다. 한 주소만 켰는데 다른 주소도 잠겼으면(그 주소의 nginx 가 같은 파일을 읽으면) 여기서 보인다.
  const shown: MaintenanceTarget[] = args.command === 'status' ? args.targets : ['api', 'root']
  const statuses = new Map<MaintenanceTarget, number>()
  for (const target of shown) statuses.set(target, await printStatus(target))

  // nginx 가 읽지 않는 자리에 파일을 쓰면 아무 일도 일어나지 않는다. 켜진 것으로 믿지 않게 실패로 끝낸다.
  if (args.command === 'status') return
  const expected = args.command === 'on' ? 200 : 204
  const wrong = args.targets.filter((target) => statuses.get(target) !== expected)
  if (wrong.length > 0) {
    console.error(
      `${wrong.join(' · ')} 주소가 ${expected} 가 아니다. 그 주소의 nginx 가 이 파일을 읽는지 README 의 점검 잠금을 본다`,
    )
    process.exitCode = 1
  }
}

main().catch((error: unknown) => {
  console.error(String(error))
  process.exitCode = 1
})
