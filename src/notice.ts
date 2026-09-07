/**
 * 공지 한 건. **앱의 `src/types/notice.ts` 와 같은 모양이어야 한다.**
 *
 * 이 타입이 세 자리에 그대로 나간다. 푸시 페이로드의 `data` · 목록 응답의 항목 · 상세 응답.
 * 셋이 같은 모양인 것이 의도다. 앱의 화면이 출처를 안 가리게 하려는 것이고, 한쪽만 바꾸면
 * 다른 저장소의 타입 검사가 못 잡으므로 필드를 더할 때 양쪽을 함께 볼 것.
 */
export interface Notice {
  id: string
  title: string
  /** 개행을 담는다. 화면이 그대로 그린다. */
  body: string
  /** ISO 8601. 정렬 기준이다. */
  publishedAt: string
  /** 밖으로 나가는 주소. 없을 수 있다. */
  link?: string
}

/**
 * 알림에 뜰 문구. **공지 문구와 별개다.**
 *
 * 알림은 트레이에 한두 줄로 뜨고 공지 본문은 길 수 있다. 같은 글을 두 자리에 쓰면 한쪽이
 * 늘 어색해진다. 그래서 운영자가 따로 적는다.
 */
export interface PushText {
  title: string
  body: string
}

/**
 * FCM `data` 로 나갈 모양. **값이 전부 문자열이어야 한다.**
 *
 * FCM 이 그렇게 정해 뒀고, 숫자나 불리언을 넣으면 발송이 거부된다. 그리고 메시지 전체가
 * 4KB 를 넘으면 안 된다. 넘는지 재는 것은 `send.ts` 가 한다.
 *
 * **본문이 길면 잘라서 보낸다.** 상세 화면은 서버 조회가 온전한 것으로 덮으므로, 여기서
 * 잘린 것이 화면에 남지 않는다. 자르지 않으면 발송 자체가 막힌다.
 */
export function toPushData(notice: Notice): Record<string, string> {
  return {
    noticeId: notice.id,
    title: notice.title,
    body: notice.body,
    publishedAt: notice.publishedAt,
    ...(notice.link === undefined ? {} : { link: notice.link }),
  }
}

/** 사람이 읽을 id. 시각이 들어가 목록에서 순서가 눈에 보인다. */
export function newNoticeId(now: Date): string {
  const p = (n: number): string => String(n).padStart(2, '0')
  return `notice-${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`
}
