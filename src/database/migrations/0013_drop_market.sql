-- 드롭 시세(앱 저장소 ADR-071). 가격이 정해진 시각을 거래 시각으로 따로 적고, 장비는 거래권 · 소비 아이템은 월드로 센다.
-- 이 칸이 생기기 전 completed 줄은 updated_at 으로 채운다. 거래권 · 소비 아이템 목록은 사용자가 정했다(2026-10-20).
ALTER TABLE "drop_items" ADD COLUMN "world_bound" boolean DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE "drop_items" SET "world_bound" = true WHERE "key" IN ('life_whetstone', 'faith_whetstone', 'soul_ether_1', 'soul_ether_2', 'soul_ether_3', 'soul_ether_4', 'exceptional_hammer_eye_accessory', 'exceptional_hammer_medal', 'exceptional_hammer_earring', 'exceptional_hammer_face_accessory', 'exceptional_hammer_belt', 'clear_moonlight_potion');--> statement-breakpoint
ALTER TABLE "drop_prices" ADD COLUMN "priced_at" timestamp with time zone;--> statement-breakpoint
UPDATE "drop_prices" SET "priced_at" = "updated_at" WHERE "record_status" = 'completed';--> statement-breakpoint
ALTER TABLE "worlds" ADD COLUMN "price_group" text DEFAULT 'general';--> statement-breakpoint
UPDATE "worlds" SET "price_group" = 'helios_eos' WHERE "key" IN ('helios', 'eos', 'challengers_4');--> statement-breakpoint
UPDATE "worlds" SET "price_group" = NULL WHERE "key" = 'special';--> statement-breakpoint
CREATE INDEX "drop_prices_priced_at_idx" ON "drop_prices" USING btree ("priced_at") WHERE "drop_prices"."record_status" = 'completed';--> statement-breakpoint
ALTER TABLE "drop_prices" ADD CONSTRAINT "drop_prices_priced_at_matches_status" CHECK (("drop_prices"."record_status" = 'completed') = ("drop_prices"."priced_at" IS NOT NULL));
