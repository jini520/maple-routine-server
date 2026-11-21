#!/usr/bin/env bash
# 도커 없이 도는 박스에 서버를 올린다. 맥에서 빌드하고 박스에서는 빌드하지 않는다. 박스의 메모리가 1GB 라 빌드가 버겁다.
# 운영에 필요한 의존성은 모두 순수 JS 라 맥에서 받은 node_modules 를 그대로 올린다.
#
# 쓰는 법(저장소 맨 위에서): deploy/deploy.sh ubuntu@152.69.225.126
# 박스에는 README 의 `도커 없이 돌리기` 로 사용자 · 폴더 · 환경 파일 · systemd 유닛이 먼저 있어야 한다.
set -euo pipefail

TARGET="${1:?박스 주소를 준다. 예: ubuntu@152.69.225.126}"
SHA="$(git rev-parse --short HEAD)"
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "커밋하지 않은 변경이 있다. 올린 것이 어느 커밋인지 알 수 있게 커밋하고 올린다." >&2
  exit 1
fi

STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
npm run build
cp -R dist package.json package-lock.json "$STAGE"/
mkdir -p "$STAGE/src/database"
cp -R src/database/migrations "$STAGE/src/database/"
(cd "$STAGE" && npm ci --omit=dev --ignore-scripts --no-audit --no-fund --loglevel=error)

rsync -az --delete "$STAGE"/ "$TARGET:/tmp/maple-routine-server-$SHA/"

# 마이그레이션은 서비스와 같은 사용자 · 환경 파일로 돌린다. systemd 가 환경 파일을 읽어 셸의 따옴표 규칙과 갈리지 않는다.
# 새 판으로 바꾼 뒤 서버를 다시 켜고, /healthz 가 답할 때까지 본다. 판은 최근 셋만 남긴다.
ssh "$TARGET" "sudo bash -s" <<REMOTE
set -euo pipefail
R=/srv/maple-routine-server/releases/$SHA
rm -rf "\$R"
mv /tmp/maple-routine-server-$SHA "\$R"
chown -R root:root "\$R"
systemd-run --quiet --wait --pipe --uid=mapleroutine --gid=mapleroutine \
  --property=EnvironmentFile=/etc/maple-routine-server/env --working-directory="\$R" \
  /usr/bin/node dist/cli/migrate.js
ln -sfn "\$R" /srv/maple-routine-server/current
systemctl restart maple-routine-server
for i in \$(seq 1 40); do
  if curl -fsS -o /dev/null http://127.0.0.1:4000/healthz; then echo "UP $SHA"; break; fi
  sleep 0.5
done
curl -fsS -o /dev/null http://127.0.0.1:4000/healthz || { echo "서버가 뜨지 않았다: journalctl -u maple-routine-server" >&2; exit 1; }
ls -1dt /srv/maple-routine-server/releases/* | tail -n +4 | xargs -r rm -rf
REMOTE
