import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'

import { validateEnv } from './env.schema'

/** env 를 읽어 전역으로 주입한다. 값은 서버의 ~/.config/maple-routine-server/.env 에서 온다. */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // 도커가 env_file 로 넣어 주므로 .env 파일을 찾지 않는다.
      ignoreEnvFile: true,
      validate: validateEnv,
    }),
  ],
})
export class AppConfigModule {}
