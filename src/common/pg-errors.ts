/** pg 의 SQLSTATE 판정. drizzle 이 DrizzleQueryError 로 감싸므로 cause 까지 내려가 본다. */
function hasCode(error: unknown, code: string): boolean {
  for (let current = error; typeof current === 'object' && current !== null;) {
    if ((current as { code?: unknown }).code === code) return true
    current = (current as { cause?: unknown }).cause
  }
  return false
}

/** unique_violation. */
export function isUniqueViolation(error: unknown): boolean {
  return hasCode(error, '23505')
}

/** foreign_key_violation. 가리키는 줄이 없거나, 가리키는 줄이 있어 못 지운다. */
export function isForeignKeyViolation(error: unknown): boolean {
  return hasCode(error, '23503')
}

/** check_violation. 표의 CHECK 제약을 어겼다. */
export function isCheckViolation(error: unknown): boolean {
  return hasCode(error, '23514')
}
