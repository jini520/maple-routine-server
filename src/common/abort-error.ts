/** 끊김으로 거절할 때 던지는 것. fetch 가 던지는 것과 같은 이름이라 받는 쪽이 하나로 가른다. */
export function abortError(): Error {
  return new DOMException('끊겼다', 'AbortError')
}
