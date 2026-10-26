-- 지금 줄은 전부 seed-assets 가 넣은 것이라 지우고 다시 시드한다. 픽셀 크기는 파일 머리에서만 읽을 수 있어 SQL 로 채울 수 없다.
-- 디스크의 파일은 그대로 남고, 다시 시드하면 같은 해시라 파일을 다시 쓰지 않는다.
DELETE FROM "assets";--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "width" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "height" integer NOT NULL;
