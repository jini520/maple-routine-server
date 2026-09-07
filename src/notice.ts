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
  body: string
  /** ISO 8601. 정렬 기준이다. */
  publishedAt: string
  /** 밖으로 나가는 주소. 없을 수 있다. */
  link?: string
}

/**
 * FCM `data` 로 나갈 모양. **값이 전부 문자열이어야 한다.**
 *
 * FCM 이 그렇게 정해 뒀고, 숫자나 불리언을 넣으면 발송이 거부된다. 그리고 메시지 전체가
 * 4KB 를 넘으면 안 된다. 넘는지 재는 것은 `send.ts` 가 한다.
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
