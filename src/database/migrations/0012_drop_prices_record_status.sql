-- 가격 줄이 기록의 상태를 든다(앱 저장소 ADR-352). 미입력 · 기록 안함도 줄이 되고 DELETE 는 기기에서 기록이 사라진 때만이다.
-- 옛 줄은 deleted_at 이 찬 것을 deleted 로, 나머지를 completed 로 옮기고 나서 deleted_at 을 지운다. 가격은 completed 만 갖는다.
CREATE TYPE "public"."drop_record_status" AS ENUM('pending', 'completed', 'skipped', 'deleted');--> statement-breakpoint
DROP INDEX "drop_prices_item_period_idx";--> statement-breakpoint
ALTER TABLE "drop_prices" ALTER COLUMN "price_meso" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "drop_prices" ADD COLUMN "record_status" "drop_record_status";--> statement-breakpoint
UPDATE "drop_prices" SET "record_status" = CASE WHEN "deleted_at" IS NULL THEN 'completed'::"drop_record_status" ELSE 'deleted'::"drop_record_status" END;--> statement-breakpoint
UPDATE "drop_prices" SET "price_meso" = NULL WHERE "record_status" = 'deleted';--> statement-breakpoint
ALTER TABLE "drop_prices" ALTER COLUMN "record_status" SET NOT NULL;--> statement-breakpoint
CREATE INDEX "drop_prices_item_period_idx" ON "drop_prices" USING btree ("item_id","period_key") WHERE "drop_prices"."record_status" = 'completed';--> statement-breakpoint
ALTER TABLE "drop_prices" DROP COLUMN "deleted_at";--> statement-breakpoint
ALTER TABLE "drop_prices" ADD CONSTRAINT "drop_prices_price_matches_status" CHECK (("drop_prices"."record_status" = 'completed') = ("drop_prices"."price_meso" IS NOT NULL));
