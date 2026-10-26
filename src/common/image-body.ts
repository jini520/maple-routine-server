import type { NestFastifyApplication } from '@nestjs/platform-fastify'

/** 그림 한 장의 상한. 지금 가장 큰 그림이 160KB 남짓이다. */
export const IMAGE_BODY_LIMIT_BYTES = 1024 * 1024

/**
 * 그림 본문을 Buffer 그대로 받는 파서. 관리 화면의 그림 올리기가 파일을 본문 그대로 보낸다.
 *
 * multipart 파서를 들이지 않는 이유는 한 요청에 파일이 한 장뿐이기 때문이다. 상한은 그림 경로에만 따로 둔다.
 * 나머지 경로는 앱 전체의 본문 상한(main.ts)을 그대로 쓴다.
 */
export function registerImageBody(app: NestFastifyApplication): void {
  app
    .getHttpAdapter()
    .getInstance()
    .addContentTypeParser(
      ['image/png', 'image/webp', 'image/jpeg'],
      { parseAs: 'buffer', bodyLimit: IMAGE_BODY_LIMIT_BYTES },
      (_req, body, done) => done(null, body),
    )
}
