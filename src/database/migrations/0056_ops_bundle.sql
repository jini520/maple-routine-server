-- 새 DB 의 크롭 · 공지 · FAQ 표는 비어 있다. 옛 마이그레이션이 줄을 넣지 않아 칸을 지우고 새로 더한다. 옮기는 스크립트가 옛 DB 의
-- 줄을 줄 id 그대로 채운다(크롭 글자는 숫자 셋으로, FAQ 답 블록은 빈 줄로 이은 글로).
CREATE TYPE "public"."image_crop_type" AS ENUM('boss_portrait', 'boss_portrait_icon', 'daily_quest_region');--> statement-breakpoint
CREATE TYPE "public"."notice_type" AS ENUM('app', 'game', 'event', 'update', 'cashshop');--> statement-breakpoint
ALTER TABLE "image_crops" DROP CONSTRAINT "image_crops_kind_asset_unique";--> statement-breakpoint
ALTER TABLE "notices" DROP CONSTRAINT "notices_notice_key_unique";--> statement-breakpoint
ALTER TABLE "faq_items" DROP CONSTRAINT "faq_items_answer_array";--> statement-breakpoint
DROP INDEX "notices_kind_published_at_idx";--> statement-breakpoint
ALTER TABLE "faq_items" ALTER COLUMN "answer" SET DATA TYPE text USING "answer"::text;--> statement-breakpoint
ALTER TABLE "image_crops" ADD COLUMN "type" "image_crop_type" NOT NULL;--> statement-breakpoint
ALTER TABLE "image_crops" ADD COLUMN "width_percent" numeric NOT NULL;--> statement-breakpoint
ALTER TABLE "image_crops" ADD COLUMN "position_x_percent" numeric NOT NULL;--> statement-breakpoint
ALTER TABLE "image_crops" ADD COLUMN "position_y_percent" numeric NOT NULL;--> statement-breakpoint
ALTER TABLE "notices" ADD COLUMN "key" text NOT NULL;--> statement-breakpoint
ALTER TABLE "notices" ADD COLUMN "type" "notice_type" NOT NULL;--> statement-breakpoint
CREATE INDEX "notices_type_published_at_idx" ON "notices" USING btree ("type","published_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "image_crops" DROP COLUMN "kind";--> statement-breakpoint
ALTER TABLE "image_crops" DROP COLUMN "size";--> statement-breakpoint
ALTER TABLE "image_crops" DROP COLUMN "position";--> statement-breakpoint
ALTER TABLE "notices" DROP COLUMN "notice_key";--> statement-breakpoint
ALTER TABLE "notices" DROP COLUMN "kind";--> statement-breakpoint
ALTER TABLE "notices" DROP COLUMN "source_id";--> statement-breakpoint
ALTER TABLE "image_crops" ADD CONSTRAINT "image_crops_type_asset_unique" UNIQUE("type","asset_id");--> statement-breakpoint
ALTER TABLE "notices" ADD CONSTRAINT "notices_key_unique" UNIQUE("key");--> statement-breakpoint
DROP TYPE "public"."image_crop_kind";--> statement-breakpoint
DROP TYPE "public"."notice_kind";