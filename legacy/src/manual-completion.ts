/**
 * 직접 완료를 여는 보스 목록. 넥슨이 완료를 안 주는 보스만 운영자가 켠다(앱 ADR-293).
 *
 * **앱이 판정하지 못하는 것만 여기 있다.** 기록이 있는지 · 주간 12마리를 채웠는지 · 레벨이 되는지는
 * 기기 SQLite 에만 있는 값이라 서버가 모른다. 서버가 드는 것은 **어느 보스를 언제부터 여느냐** 하나다.
 *
 * **닫는 날은 계약에 없다.** 넥슨이 언제 고칠지 모르기 때문이다. 운영자가 닫으면 그 행이 응답에서
 * 빠지고 앱의 단추도 그 순간 사라진다. 닫은 사실은 `closed_at` 으로 남는다.
 */

/** 앱 `src/data/weekly-bosses.json` 의 보스 key 와 표기. 운영자 드롭다운이 이것으로 선다. */
export interface BossOption {
  key: string
  name: string
  cycle: 'weekly' | 'monthly'
}

/**
 * 보스 표 사본. **앱이 진실이고 여기는 사본이다.**
 *
 * 사본을 두는 이유는 운영자가 키를 손으로 치면 오타가 «아무 보스도 안 열림» 으로 조용히 실패하기
 * 때문이다. 새 보스가 나오면 앱의 표에 더한 뒤 이 목록에도 한 줄 더한다. 빠뜨려도 이미 열어 둔
 * 보스는 그대로 돌고, 새 보스를 못 고를 뿐이다.
 */
export const BOSS_OPTIONS: readonly BossOption[] = [
  { key: 'black_mage', name: '검은 마법사', cycle: 'monthly' },
  { key: 'meirin', name: '시즌 보스 메이린', cycle: 'weekly' },
  { key: 'zakum', name: '자쿰', cycle: 'weekly' },
  { key: 'magnus', name: '매그너스', cycle: 'weekly' },
  { key: 'papulatus', name: '파풀라투스', cycle: 'weekly' },
  { key: 'von_bon', name: '반반', cycle: 'weekly' },
  { key: 'pierre', name: '피에르', cycle: 'weekly' },
  { key: 'crimson_queen', name: '블러디퀸', cycle: 'weekly' },
  { key: 'vellum', name: '벨룸', cycle: 'weekly' },
  { key: 'lotus', name: '스우', cycle: 'weekly' },
  { key: 'damien', name: '데미안', cycle: 'weekly' },
  { key: 'guardian_angel_slime', name: '가디언 엔젤 슬라임', cycle: 'weekly' },
  { key: 'lucid', name: '루시드', cycle: 'weekly' },
  { key: 'will', name: '윌', cycle: 'weekly' },
  { key: 'gloom', name: '더스크', cycle: 'weekly' },
  { key: 'verus_hilla', name: '진 힐라', cycle: 'weekly' },
  { key: 'darknell', name: '듄켈', cycle: 'weekly' },
  { key: 'chosen_seren', name: '선택받은 세렌', cycle: 'weekly' },
  { key: 'guardian_kalos', name: '감시자 칼로스', cycle: 'weekly' },
  { key: 'first_adversary', name: '최초의 대적자', cycle: 'weekly' },
  { key: 'kaling', name: '카링', cycle: 'weekly' },
  { key: 'radiant_malefic_star', name: '찬란한 흉성', cycle: 'weekly' },
  { key: 'bellona', name: '벨로나', cycle: 'weekly' },
  { key: 'limbo', name: '림보', cycle: 'weekly' },
  { key: 'bardrix', name: '발드릭스', cycle: 'weekly' },
  { key: 'jupiter', name: '유피테르', cycle: 'weekly' },
]

/** 앱에 나가는 모양. 계약은 앱 저장소의 ADR-293 결정 3 이 소유한다. */
export interface ManualCompletionBoss {
  /** 보스 key. 앱의 보스 표와 같은 값이다. */
  boss: string
  /** 여는 날(KST `YYYY-MM-DD`). 이 날이 든 기간부터 앱이 단추를 세운다. */
  from: string
}

export function isKnownBoss(key: string): boolean {
  return BOSS_OPTIONS.some((option) => option.key === key)
}

export function bossNameOf(key: string): string {
  return BOSS_OPTIONS.find((option) => option.key === key)?.name ?? key
}

/** `YYYY-MM-DD` 인가. 운영자 입력이라 모양만 본다(달력의 실재 여부는 안 따진다). */
export function isDateKey(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
}

/** KST 오늘(`YYYY-MM-DD`). 여는 날의 기본값이다. 서버가 UTC 로 돌아도 축은 KST 다. */
export function todayKst(at: number = Date.now()): string {
  return new Date(at + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
}
