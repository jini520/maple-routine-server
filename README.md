# maple-routine-server

메이플 루틴 앱의 서버. NestJS MVC 에 Fastify 어댑터, DB 는 Drizzle 로 PostgreSQL.

설계 문서는 앱 저장소 `docs/adr/ADR-347.md`(무엇을 만드나)와 `docs/adr/ADR-348.md`(어떤 집에 넣나)다.

```
src/
  main.ts · app.module.ts · app.controller.ts(/healthz)
  config/      env 스키마와 ConfigModule
  common/      검증 파이프 · 예외 필터 · 로거
  database/    Drizzle 스키마(Model) · 마이그레이션 · 모듈
  clients/     넥슨 Open API · 넥슨 Open ID · 넥슨 버킷 · FCM
  modules/     기능. 모듈마다 controller · service · repository · job · dto
legacy/        옛 서버. 손대지 않는다. 핫픽스만 그 안에서 빌드한다
```

```
npm ci
npm run start:dev        # nest start --watch
npm test                 # jest. Nest 12 가 ESM 전용이라 --experimental-vm-modules 가 붙어 있다
npm run test:db          # 리포지토리 스펙까지. TEST_DATABASE_URL 이 가리키는 Postgres 에 마이그레이션을 돌리고 표를 비운다
npm run typecheck
npm run lint
npm run format
npm run db:generate      # schema.ts 변경 → migrations/ 에 SQL
npm run db:migrate       # DATABASE_URL 에 적용
npm run build && npm start
```

리포지토리 스펙은 진짜 Postgres 가 있어야 돈다. 없으면 건너뛴다. 맥에서는 colima 로 띄운다.

```
colima start
docker run -d --name mr-test-pg -e POSTGRES_USER=test -e POSTGRES_PASSWORD=test -e POSTGRES_DB=test -p 15432:5432 postgres:16-alpine
TEST_DATABASE_URL=postgres://test:test@127.0.0.1:15432/test npm run test:db
```

## 배포와 운영

기계 둘이다. **앱 박스**(Oracle `10.0.0.55`, `ubuntu@158.179.175.230`)가 nginx 와 이 서버를 돌리고, **DB 박스**
(`10.0.0.192`)가 PostgreSQL 16 을 돌린다. DB 는 사설망에서만 받는다. 설계는 앱 저장소 `ADR-347` 결정 15 다.

```
앱 박스
  ~/maple-routine-server/                 소스. 맥에서 rsync 로 올린다(node_modules · dist · legacy · .git 제외)
  ~/.config/maple-routine-server/.env     값 전부. 이름 목록은 .env.example 과 src/config/env.schema.ts
  ~/.config/maple-routine-server/fcm-key.json   FCM 서비스 계정 키. compose 가 /run/secrets/fcm-key.json 으로 건다
  ~/.config/maple-routine-server/db.env   DATABASE_URL 하나. psql 을 도커로 띄울 때 쓴다
  /etc/nginx/sites-available/mapleroutine /v1 · /admin · /app 을 127.0.0.1:4000 으로 넘긴다
```

```
# 맥에서
rsync -az --delete --exclude node_modules --exclude dist --exclude legacy --exclude .git ./ ubuntu@158.179.175.230:~/maple-routine-server/

# 앱 박스에서
cd ~/maple-routine-server
docker compose build
docker compose run --rm --no-deps server node dist/cli/migrate.js   # 새 마이그레이션이 있을 때
docker compose up -d
curl -s http://127.0.0.1:4000/healthz
docker logs --since 5m maple-routine-server

# DB 를 직접 볼 때. 앱 박스에는 psql 이 없어 도커로 띄운다
docker run --rm -it --env-file ~/.config/maple-routine-server/db.env postgres:16-alpine sh -c 'psql "$DATABASE_URL"'
```

- **마이그레이션은 `node dist/cli/migrate.js` 다.** 실행 이미지에 drizzle-kit 이 없다. 같은 SQL 을 drizzle-orm 의
  migrator 가 적용하고 이미 적용된 것은 건너뛴다.
- **보스 표는 `/admin/bosses` 의 폼으로 고친다.** 규칙 둘, 새 보스, 난이도 줄 더하기 · 레벨 · 지우기다. 보스와 마지막
  난이도는 못 지운다. 바꾸면 앱이 다음에 켤 때 받아 가고, 번들 씨앗은 앱 저장소에서 `npm run sync:bosses` 로 맞춘다
  (앱 저장소 `ADR-349` 정정 1).
- **운영자 공지는 `/admin/notices` 다.** CLI(`npm run notice -- send|list|push`)는 SSH 로 급히 쓸 때만이다.
- **옛 서버의 공지 151줄은 2026-10-15 에 한 번 옮겼다.** 칸이 1:1 이라 `pg_dump --data-only --column-inserts -t notices`
  를 그대로 psql 에 넣었다. 다시 할 일은 없다(앱 저장소 `ADR-347` 결정 2).
- **옛 서버와 같이 도는 동안 `FCM_KEY` 를 비워 둔다.** 두 서버가 같은 넥슨 공지를 보고 각자 알림을 쏘면 사용자가
  두 번 받는다. 전환할 때 옛 컨테이너를 먼저 세우고 `FCM_KEY=/run/secrets/fcm-key.json` 으로 채워 다시 띄운다.
- **되돌리기는 nginx 하나다.** 설정 파일을 옛것으로 바꿔 `nginx -s reload` 하면 미니 PC 의 옛 서버로 돌아간다. 옛
  서버의 DB 는 안 건드렸다.
