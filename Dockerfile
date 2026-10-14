# 빌드와 실행을 가른다. 실행 이미지에 타입스크립트와 개발 의존성을 안 남긴다.
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
# 마이그레이션 SQL 은 빌드 산출물이 아니라 그대로 실린다.
COPY src/database/migrations ./src/database/migrations
COPY drizzle.config.ts ./

USER node
EXPOSE 4000
CMD ["node", "dist/main.js"]
