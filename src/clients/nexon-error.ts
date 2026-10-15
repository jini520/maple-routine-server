/** 넥슨 에러 본문은 { error: { name, message } } 다. JSON 이 아니면 이름이 없다. */
export function errorNameOf(text: string): string | null {
  try {
    const body = JSON.parse(text) as { error?: { name?: unknown } }
    return typeof body.error?.name === 'string' ? body.error.name : null
  } catch {
    return null
  }
}
