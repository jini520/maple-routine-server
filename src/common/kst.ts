/**
 * 시각의 글자 규칙. 저장은 timestamptz(절대 시각)이고, 사람이 보는 글자는 전부 KST 다.
 *
 * 서버 시계와 브라우저 시간대에 기대지 않는다. KST 는 서머타임이 없어 +9 시간이 곧 KST 라 Intl 없이 센다.
 * 관리 화면의 `when()` 도 같은 셈이다(`admin/views/layout.ts`).
 */

const KST_OFFSET_MS = 9 * 60 * 60 * 1000

const pad = (n: number): string => String(n).padStart(2, '0')

/** `YYYY-MM-DD HH:mm:ss` (KST). */
export function formatKst(date: Date): string {
  const k = new Date(date.getTime() + KST_OFFSET_MS)
  return `${k.getUTCFullYear()}-${pad(k.getUTCMonth() + 1)}-${pad(k.getUTCDate())} ${pad(k.getUTCHours())}:${pad(k.getUTCMinutes())}:${pad(k.getUTCSeconds())}`
}

/** datetime-local 값(`YYYY-MM-DDTHH:mm[:ss]`)을 KST 로 읽어 ISO 글자로. 모양이 아니면 null. */
export function kstLocalToIso(local: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(local)) return null
  const date = new Date(`${local.length === 16 ? `${local}:00` : local}+09:00`)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}
