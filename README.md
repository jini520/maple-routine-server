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
  /etc/nginx/sites-available/mapleroutine /v1 · /admin 을 127.0.0.1:4000 으로 넘기고, /assets/ 는 아래 디렉터리를 바로 낸다
  /srv/maple-routine-assets/              그림 파일(<sha256>.<확장자>). compose 가 /data/assets 로 건다. 주인은 uid 1000(컨테이너의 node)
  /srv/maple-routine-ota/                 OTA 매니페스트 · latest · releases.json 과 files/(번들 · 에셋). compose 가 /data/ota 로 읽기 전용으로 건다. 주인은 ubuntu
```

```
# 맥에서. 배포는 main 에서만 한다(아래 배포 규칙). 본 체크아웃을 main 으로 옮기고, 끝나면 develop 으로 돌아온다
git switch main && git pull --ff-only
# 이미지는 맥에서 빌드한다. 앱 박스에서 docker compose build 를 돌리지 않는다(아래 배포 규칙)
colima start
git archive --format=tar HEAD | docker build --platform linux/amd64 -t maple-routine-server:prod -
docker save maple-routine-server:prod | gzip > ~/maple-routine-server-image.tar.gz
scp ~/maple-routine-server-image.tar.gz ubuntu@158.179.175.230:~/
rsync -az --delete --exclude node_modules --exclude dist --exclude legacy --exclude .git --exclude .claude ./ ubuntu@158.179.175.230:~/maple-routine-server/

# 앱 박스에서. 여기부터는 한국 시각 3 ~ 7시에 한다(아래 배포 규칙)
docker tag maple-routine-server:prod maple-routine-server:prev   # 되돌릴 이미지
gunzip -c ~/maple-routine-server-image.tar.gz | docker load
cd ~/maple-routine-server
docker compose run --rm --no-deps server node dist/cli/migrate.js   # 새 마이그레이션이 있을 때
docker compose run --rm --no-deps server node dist/cli/seed-game-data.js   # 게임 데이터 표가 비었을 때. 줄이 있는 표는 건너뛴다
docker compose up -d --no-build
curl -s http://127.0.0.1:4000/healthz
docker logs --since 5m maple-routine-server

# 되돌릴 때
docker tag maple-routine-server:prev maple-routine-server:prod && docker compose up -d --no-build

# DB 를 직접 볼 때. 앱 박스에는 psql 이 없어 도커로 띄운다
docker run --rm -it --env-file ~/.config/maple-routine-server/db.env postgres:16-alpine sh -c 'psql "$DATABASE_URL"'
```

- **배포는 main 에서만 한다**(2026-11-09 사용자 지정, 앱 저장소 `ADR-188` 결정 9). main 은 운영 박스에 배포된 것만 담는다. develop 의
  작업은 develop 을 head, main 을 base 로 PR 해 merge commit 으로 머지한 뒤 배포한다. `git archive HEAD` 와 rsync 는 서 있는 체크아웃을
  그대로 보내므로, develop 에 선 채로 돌리면 검토하지 않은 작업이 박스에 올라간다.
- **배포 규칙. 빌드는 맥에서, 재시작은 한국 시각 3 ~ 7시에 한다**(2026-11-06 사용자 지정). 배포하는 동안 사용자가 기능을 못 쓸 수 있어서다.
  - 앱 박스는 메모리 952MB · CPU 2 다. 2026-11-06 에 박스에서 `docker compose build` 를 돌리자 10분 넘게 부하가 5.4 까지 오르고
    남은 메모리가 66MB 로 줄어 스왑을 썼다. 그동안 사용 중인 요청이 느려진다. 그래서 박스에서는 이미지를 받기만 한다.
  - `git archive` 로 커밋된 파일만 빌드 맥락에 보낸다. 체크아웃을 그대로 보내면 `.claude/worktrees/` 의 `node_modules` 까지 실린다.
    맥은 arm64 라 `--platform linux/amd64` 로 에뮬레이션해 빌드한다.
  - `docker compose up -d --no-build` 의 재시작 동안 15초쯤 요청이 502 로 떨어진다(2026-11-06 실측 17건). 앱은 서버 없이도 돌지만
    그 사이 보낸 사용 로그 묶음은 사라지고 로그인 · 프렌즈 조회가 실패한다. 그래서 사용자가 가장 적은 새벽에 한다.
    nginx 로그의 결산 요청을 시간마다 세면 3 ~ 7시가 가장 적고 5 ~ 6시가 바닥이다.
  - `docker load` 도 새벽에 한다. 2026-11-06 저녁에 불러오기가 2분 18초 동안 디스크를 쓰는 끝 무렵에 `/v1/game-data` ·
    `/v1/notices` 가 500 으로 떨어졌다. 그날 `/v1` 의 500 은 박스 빌드 중 한 건과 이 두 건뿐이었다.
  - 무중단 전환(새 컨테이너를 옆에 띄우고 nginx 를 넘기는 것)은 아직 안 한다. 공지 폴러 같은 예약 작업이 두 컨테이너에서
    함께 돌면 알림이 두 번 나간다. 예약 작업을 한쪽에서만 돌게 막은 뒤에야 할 수 있다.
- **그림은 `/admin/assets` 에서 올린다**(앱 저장소 `ADR-103`). 파일은 `/srv/maple-routine-assets/` 에 내용 해시 이름으로 쌓이고,
  표 `assets` 가 앱 경로(`bosses/bellona.webp`)와 해시를 잇는다. 옛 해시 파일은 지우지 않는다. 옛 목록을 받은 앱이 아직 받는 중일 수
  있다. 게임 데이터 표의 그림 칸은 그림 표의 `id` 를 FK 로 가리킨다(앱 저장소 `ADR-187` 결정 3). 그래서 쓰이는 그림은 지울 수 없고,
  관리 화면 API 는 지금처럼 파일 이름 · slug 글자를 받아 그림 id 로 푼다(없으면 400). 앱에 내는 게임 데이터는 그림 경로에서 그 글자를
  다시 만들어 예전과 같다. 처음 채울 때는 맥에서
  `npm run build && ADMIN_AUTH=아이디:비밀번호 node dist/cli/seed-assets.js https://mapleroutine.store ~/Developments/maple-routine` 이다.
  이미 있는 경로와 크롭은 건너뛴다. 분류 확인을 마친 아이템의 분류 · 그림 · 새 아이템은
  `ADMIN_AUTH=아이디:비밀번호 node dist/cli/apply-item-catalog.js https://mapleroutine.store <폴더> --apply` 로 넣는다. 폴더에는
  `plan.json` 과 `items/` 그림이 있다. `--apply` 를 빼면 할 일만 보인다. 이미 붙은 그림은 바꾸지 않는다. nginx 는 이렇게 둔다.

  ```
  location /assets/ {
      alias /srv/maple-routine-assets/;
      add_header Cache-Control "public, max-age=31536000, immutable";
      try_files $uri =404;
  }
  ```

  디렉터리는 `sudo install -d -o 1000 -g 1000 -m 755 /srv/maple-routine-assets` 로 만든다. 홈 디렉터리 아래에 두면 nginx(www-data)가 못 읽는다. 호스트의 ubuntu(uid 1001)가 주인이면 컨테이너가
  못 쓴다(2026-10-15 FCM 키 사고와 같은 원인). 밤 백업에 이 디렉터리를 DB 덤프와 함께 넣는다.

- **OTA 는 앱 저장소의 `node scripts/publish-rn-ota.mjs` 가 올린다**(앱 저장소 `ADR-011` 결정 1 · 13). 스크립트가 맥에서 rsync 로
  `/srv/maple-routine-ota/` 에 쓰고, 서버는 `GET /v1/ota/manifest` · `GET /v1/ota/latest` 로 매니페스트만 읽어 준다. 번들과 에셋은
  nginx 가 `files/` 를 바로 낸다. 번들은 옆에 둔 `.gz` 를 `gzip_static` 이 그대로 내준다. 최근 세 번의 발행이 쓰지 않는 파일은
  스크립트가 지운다. nginx 는 이렇게 둔다.

  ```
  location /ota/files/ {
      alias /srv/maple-routine-ota/files/;
      gzip_static on;
      gzip_vary on;
      add_header Cache-Control "public, max-age=31536000, immutable";
      try_files $uri =404;
  }
  ```

  디렉터리는 `sudo install -d -o ubuntu -g ubuntu -m 755 /srv/maple-routine-ota /srv/maple-routine-ota/files` 로 만든다. 서버는 읽기만
  하므로 주인이 ubuntu 여도 된다. `/v1/` 의 속도 제한은 매니페스트에만 걸리고 `/ota/files/` 에는 안 걸린다.

- **마이그레이션은 `node dist/cli/migrate.js` 다.** 실행 이미지에 drizzle-kit 이 없다. 같은 SQL 을 drizzle-orm 의
  migrator 가 적용하고 이미 적용된 것은 건너뛴다.
- **보스 표는 `/admin/bosses` 의 폼으로 고친다.** 규칙 둘, 새 보스, 이미 있는 보스의 별칭, 난이도 줄 더하기 · 레벨 · 지우기다. 보스와 마지막
  난이도는 못 지운다. 화면은 보스 표 하나이고, 줄의 수정을 누르면 그 아래로 난이도 편집기가 펼쳐지며 새 보스는 같은
  편집기가 표 맨 위에 열린다(2026-10-16 사용자 선택, 구조 시안 셋 중 A). 난이도 표를 따로 두면 보스 이름이 56번
  반복되고, 몇 달에 한 번 쓰는 새 보스 폼이 늘 펼쳐져 목록을 밀어내서다. 바꾸면 앱이 다음에 켤 때 받아 가고, 번들 사본은 앱 저장소에서 `node scripts/sync-game-data.mjs` 로 맞춘다
  (앱 저장소 `ADR-349` 정정 1 · `ADR-350`).
- **게임 데이터 표는 `GET /v1/game-data` 하나로 나간다**(앱 저장소 `ADR-350`). 칸 하나가 표 하나이고 칸마다 `updatedAt` 을
  든다. 칸은 `bosses` · `dropItems` · `bossDrops` · `dropBoxes` · `crystalPrices` · `worlds` · `spendCatalog` · `symbolCosts` · `contents` · `equipmentItems` · `enhancementCosts` · `mvpGrades` · `huntingGrounds` · `hexaMatrix` · `faqs` 열다섯이고 결정 2 의 표 전부가 옮겨 왔다(앱 저장소 `ADR-350` 정정 1 ~ 6). 아이템(드롭 아이템 · 강화 장비 · 사냥 전리품의 이름 · 분류 · 그림 · 고가 · 착용 레벨 · 역할)은
  `/admin/items` 하나에서 고친다(앱 저장소 `ADR-187` 결정 6. 분류 트리 · 그림 격자 · 편집 서랍이고, 역할은 붙이기만 한다). 드롭 묶음의 관리 화면은
  `/admin/drop-boxes` · `/admin/boss-drops` · `/admin/crystal-prices` 다. 월드는 `/admin/worlds` 다(ADR-350 정정 2). 지출 카탈로그는 `/admin/spend-catalog`,
  심볼 비용은 `/admin/symbol-costs` 다(ADR-350 정정 3. 묶음의 열림 스위치가 앱에서 고를 수 있는지를 정하고, 항목은 지우지 않고 until 로 닫는다). 컨텐츠는 `/admin/contents` 다(ADR-350 정정 4.
  갈래 표 8줄은 ENUM 과 일대일이라 글자 · 태그 · 한도 · 차례만 고치고, 컨텐츠는 섹션 맨 끝에 더하며 API 이름은 공백을 지워도 다른 줄과 달라야 한다. 지우지 않고 until 로 닫는다). 강화 비용은 `/admin/enhancement-costs`, MVP 등급은 `/admin/mvp-grades` 다(ADR-350 정정 5. 비용 표는 기간 줄 없이 지금 값 하나다. 강화 기록은 서버에 안 두고 앱이 합계로 저장하므로 고친 값은 다음 수집분부터 쓰인다. 잠재 구간은 등급 넷을 한 번에 더하고 1 구간은 못 지우며, 스타포스 단계는 끝 성수만 더하고 지운다). 사냥터는 `/admin/hunting-grounds` 다(ADR-350 정정 6. 사냥터 key 는 지역 key 로 시작하고 이름은 전역 유일이며 몬스터 레벨은 줄 표다. 지우지 않는다). 헥사 매트릭스는 `/admin/hexa-matrix` 다(앱 저장소 `ADR-137`. 코어 종류 · 레벨 비용 · 이름 표 · 직업별 코어 · 헥사 스탯 다섯 표를 한 칸으로 낸다. 이름 표에 없는 코어는 그 API 타입의 기본 종류로 보므로 기본 종류는 API 타입마다 하나다. 비용은 기간 줄 없이 레벨 0 부터 만렙 - 1 까지 한 번에 갈아 끼운다). FAQ 는 `/admin/faqs` 다(앱 저장소 `ADR-150`. 앱 화면의 물음표가 여는 시트 문구다. 묶음 목록이 코드가 아니라 표의 줄이라 새 페이지는 같은 key 의 묶음 하나만 더하면 된다. key 는 소문자 · 숫자 · 붙임표이고 못 바꾼다. 문항은 묶음 화면 `/admin/faqs/sheets/<key>` 에서 쓰고, 답은 빈 줄로 문단을 나눈 글로 받아 문단 블록으로 바꾼다. 묶음을 지우면 문항도 지워진다). 결정석의 새 가격은 지금 줄을 닫고 새 줄을 연다. 시작은 그
  보스의 기간 경계(주간 · 시즌 목요일, 월간 1일)여야 한다. 심볼의 새 비용도 같다. 시작은 KST 날짜이고 지금 줄의 시작보다 뒤면 된다. 새 심볼은 레벨 전부를 한 번에 넣는다. `GET /v1/bosses` 는 옛 OTA 가 불러 당분간 남긴다. 표의 첫
  채움은 `node dist/cli/seed-game-data.js` 가 `src/database/seed/<표>.json` 으로 한다. 비어 있는 표만 채운다. 씨앗의 그림 이름을
  그림 id 로 풀기 때문에 그림을 먼저 올린다(`seed-assets`). 그림이 없으면 그 표에서 멈춘다.
- **드롭 아이템 · 강화 장비 · 사냥 전리품은 아이템 표(`items`) 하나를 나눠 쓴다**(앱 저장소 `ADR-187` 결정 1). key 가 같으면
  한 줄이고 `is_drop` · `is_equipment` 와 사냥 전리품 줄(`hunt_loot_items.item_id`)이 역할을 가른다. `dropItems` · `equipmentItems` ·
  `huntLoot` 칸은 자기 역할의 줄만 내므로 응답 모양은 그대로다. 이름을 NFC 로 맞추고 공백을 지웠을 때 다른 key 의 아이템과
  같으면 더하거나 고칠 수 없다. 한 물건이 두 key 로 서면 기록이 갈려서다.
- **게임 데이터의 그림 칸은 그림 표의 id 를 함께 낸다**(앱 저장소 `ADR-187` 결정 4). `assets` 칸의 줄은 `id` 를 들고, 그림 칸마다
  옛 글자 칸(`portraitSlug` · `iconFile` · `emblem` · `backgroundMap` 등) 옆에 `id` 칸(`portraitAssetId` · `iconAssetId` 등)이
  선다. 크롭 줄은 `assetId` 를 든다. 옛 글자 칸은 이미 깔린 옛 앱이 읽어 남긴다. 칸이 없으면 옛 앱이 게임 데이터를 거절하고
  잠금 화면에서 멈추기 때문이다. 새 앱이 퍼지고 옛 버전을 잠근 뒤에 지운다.
- **앱 코드가 쓰는 그림도 표에 붙어 있다**(앱 저장소 `ADR-187` 결정 8). MVP 명패는 `mvp_grades.plate_asset_id`, 컨텐츠 카드의
  지역 아이콘은 `contents.region_icon_asset_id`, 붙일 표가 없는 72장(결정석 칩 · 강화 다섯 · 메소 주머니 · 포스 · 드롭 연출
  프레임 등)은 `app_images`(key 와 그림 id)이고 게임 데이터 칸 `appImages` 로 나간다. key 는 앱 코드가 그림을 찾는 이름이다.
  지역 아이콘은 고르는 칸이 아직 없어서, 컨텐츠의 지도 배경을 바꾸면 같은 이름의 `maps/icons/` 그림이 따라간다. `app_images`
  를 고치는 화면도 아직 없다.
- **시각은 timestamptz 로 저장하고, 사람이 보는 글자는 전부 KST `YYYY-MM-DD HH:mm:ss` 다**(앱 저장소 `ADR-347` 정정 2). 관리 화면은
  `layout.ts` 의 `when()` 으로만 시각을 그리고 `datetime-local` 입력도 KST 로 읽는다. CLI 는 `common/kst.ts` 의 `formatKst` 다. 브라우저와
  컨테이너의 시간대에 기대지 않는다.
- **운영자 공지는 `/admin/notices` 다.** CLI(`npm run notice -- send|list|push`)는 SSH 로 급히 쓸 때만이다.
- **관리 화면의 생김새는 `src/modules/admin/views/layout.ts` 하나가 정한다**(2026-10-15 사용자 선택, 시안 셋 중 B).
  왼쪽 사이드바 메뉴, 차가운 중립 회색에 코발트 강조, 글꼴은 Google Fonts 의 IBM Plex Sans KR(못 받으면 시스템 글꼴).
  각 화면은 부품 클래스(`card` · `field` · `btn` · `tag` · `table`)를 조립만 하고 색이나 둥글기를 직접 적지 않는다.
  그래야 다음에 모양을 바꿀 때 한 파일만 고친다.
  테두리와 구분선은 쓰지 않는다(앱 저장소 `ADR-016` 결정 13). 면은 바탕색 · 간격 · 그림자로 가르고, 뷰 파일의 굵기 있는
  `border` 선언은 `views/borderless.spec.ts` 가 막는다. 차트 눈금선과 키보드 초점 표시는 선이 아니라 표시라 남긴다.
- **사용자 · 사용 로그는 `로그` 묶음의 대시보드 두 장이다**(`/admin/users` · `/admin/usage`, 앱 저장소 `ADR-158` 결정 4 ~ 8).
  기간은 한국 시각 오늘까지 세고(오늘 값은 새로고침할 때마다 늘어난다), 일별 막대 아래에 그 날 보낸 앱 공지 · 게임 알림 수를 둔다. 화면 이름의 한국어
  대응표는 `views/screen-names.ts` 다.
- **옛 서버의 공지 151줄은 2026-10-15 에 한 번 옮겼다.** 칸이 1:1 이라 `pg_dump --data-only --column-inserts -t notices`
  를 그대로 psql 에 넣었다. 다시 할 일은 없다(앱 저장소 `ADR-347` 결정 2).
- **FCM 키 파일은 컨테이너 사용자(`node`, uid 1000) 소유여야 한다.** compose 가 호스트 파일을 권한 그대로 거는데
  호스트의 `ubuntu` 는 uid 1001 이다. `ubuntu` 소유 600 이면 컨테이너가 못 읽어 운영자 공지와 넥슨 공지 알림이
  전부 `EACCES` 로 실패한다. 저장은 발송보다 먼저라 공지는 남고 알림만 빠진다(2026-10-15 전환 뒤 하루 동안 알림
  4건이 그렇게 빠졌다). 키를 새로 놓을 때마다 `sudo chown 1000:1000 ~/.config/maple-routine-server/fcm-key.json`.
  재시작은 필요 없다. firebase 가 보낼 때마다 키를 읽는다.
- **옛 서버와 같이 도는 동안 `FCM_KEY` 를 비워 둔다.** 두 서버가 같은 넥슨 공지를 보고 각자 알림을 쏘면 사용자가
  두 번 받는다. 전환할 때 옛 컨테이너를 먼저 세우고 `FCM_KEY=/run/secrets/fcm-key.json` 으로 채워 다시 띄운다.
- **되돌리기는 nginx 하나다.** 설정 파일을 옛것으로 바꿔 `nginx -s reload` 하면 미니 PC 의 옛 서버로 돌아간다. 옛
  서버의 DB 는 안 건드렸다.
