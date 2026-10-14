# 빌드와 실행을 가른다. 실행 이미지에 타입스크립트와 개발 의존성을 안 남긴다.
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
COPY bin ./bin
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
# 스키마는 빌드 산출물이 아니라 그대로 실린다. 부팅 때 migrate 가 이 자리를 읽는다.
COPY migrations ./migrations

# 루트로 안 돈다. 이 컨테이너가 하는 일은 읽기와 FCM 호출뿐이라 권한이 필요 없다.
USER node
EXPOSE 4000
CMD ["node", "dist/src/main.js"]
