import { Module } from '@nestjs/common'

import { HexaMatrixRepository } from './hexa-matrix.repository'

/** 헥사 매트릭스의 코어 종류 · 레벨 비용 · 이름 표 · 직업별 코어 · 스탯. 관리 화면이 고치고 앱이 받는다. */
@Module({
  providers: [HexaMatrixRepository],
  exports: [HexaMatrixRepository],
})
export class HexaMatrixModule {}
