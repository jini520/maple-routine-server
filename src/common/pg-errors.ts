/**
 * pg 의 SQLSTATE 판정. drizzle 이 DrizzleQueryError 로 감싸므로 cause 까지 내려가 본다. constraint 를 주면 그 제약의 위반만
 * 맞다고 본다.
 */
function hasCode(error: unknown, code: string, constraint?: string): boolean {
  for (let current = error; typeof current === 'object' && current !== null;) {
    const found = current as { code?: unknown; constraint?: unknown }
    if (found.code === code) return constraint === undefined || found.constraint === constraint
    current = (current as { cause?: unknown }).cause
  }
  return false
}

/** unique_violation. constraint 를 주면 그 UNIQUE 의 위반만이다. */
export function isUniqueViolation(error: unknown, constraint?: string): boolean {
  return hasCode(error, '23505', constraint)
}

/** foreign_key_violation. 가리키는 줄이 없거나, 가리키는 줄이 있어 못 지운다. */
export function isForeignKeyViolation(error: unknown): boolean {
  return hasCode(error, '23503')
}

/** check_violation. 표의 CHECK 제약을 어겼다. */
export function isCheckViolation(error: unknown): boolean {
  return hasCode(error, '23514')
}
