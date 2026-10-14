// ConfigModule.forRoot 가 import 시점에 env 를 검사한다. 스펙이 AppModule 을 들이기 전에 필수값을 채운다.
process.env.DATABASE_URL ??= 'postgres://test:test@127.0.0.1:5432/test'
process.env.TOKEN_ENC_KEY_V1 ??= '00'.repeat(32)
