import { Module } from '@nestjs/common'

import { OtaController } from './ota.controller'

/** 앱의 OTA 매니페스트와 스토어 업데이트 판정. 번들과 에셋은 nginx 가 낸다. */
@Module({
  controllers: [OtaController],
})
export class OtaModule {}
