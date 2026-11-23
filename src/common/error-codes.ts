/**
 * 서버가 요청을 받아들이지 않을 때 HTTP 상태와 함께 주는 `code` 전부. 앱은 문구가 아니라 이 글자로 가르고, 같은 목록을 앱
 * `src/server/` 에 둔다. 새 거절은 여기에 먼저 더한다. 글자를 경로마다 흩어 쓰면 앱과 서버가 다른 글자를 쓰게 된다.
 */
export const ERROR_CODES = {
  /** 403. 넥슨 로그인 세션으로만 부를 수 있는 경로다. */
  loginRequired: 'login_required',
  /** 403. 계정 삭제를 예약한 사람이다. */
  accountDeletionPending: 'account_deletion_pending',
  /** 올리기의 기록마다. 기록의 메이플 ID 가 보낸 신원의 것이 아니다. */
  mapleIdNotRegistered: 'maple_id_not_registered',
  /** 409. 자기 넥슨 ID 를 부계정으로 등록하려 했다. */
  sameAccount: 'same_account',
  /** 409. 다른 넥슨 ID 에 등록된 부계정이다. */
  registeredElsewhere: 'registered_elsewhere',
  /** 409. 부계정을 가진 계정을 부계정으로 등록하려 했다. */
  hasSubAccounts: 'has_sub_accounts',
  /** 409. 부계정인 로그인이 부계정을 등록하려 했다. */
  loginIsSubAccount: 'login_is_sub_account',
  /** 올리기의 기록마다. 유일 기준이 같은데 내용이 다른 기록이 다른 기록 id 로 이미 있다. */
  duplicateRecord: 'duplicate_record',
  /** 올리기의 기록마다. 삭제 표식이 선 기록을 고치려 했다. */
  recordDeleted: 'record_deleted',
} as const

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES]

/** 부계정 등록을 거절하는 코드 넷 */
export type SubAccountRejection =
  | typeof ERROR_CODES.sameAccount
  | typeof ERROR_CODES.registeredElsewhere
  | typeof ERROR_CODES.hasSubAccounts
  | typeof ERROR_CODES.loginIsSubAccount
