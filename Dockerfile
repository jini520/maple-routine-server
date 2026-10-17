# 빌드와 실행을 가른다. 실행 이미지에 타입스크립트와 개발 의존성을 안 남긴다.
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
# 운영 박스(RAM 1GB)의 기본 힙 488MB 로는 tsc 가 SIGABRT 로 죽는다(2026-10-17, 표 서른하나). 스왑 2GB 가 받는다.
RUN NODE_OPTIONS=--max-old-space-size=1536 npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
# 마이그레이션 SQL 은 빌드 산출물이 아니라 그대로 실린다.
COPY src/database/migrations ./src/database/migrations
# 씨앗 JSON 도 같다. seed-game-data CLI 가 읽는다.
COPY src/database/seed ./src/database/seed
COPY drizzle.config.ts ./

USER node
EXPOSE 4000
CMD ["node", "dist/main.js"]
