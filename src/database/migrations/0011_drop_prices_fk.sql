-- 가격 줄이 아이템 · 월드를 글자 key 대신 id 로 가리킨다(앱 저장소 ADR-342 정정 7). 옛 줄은 key 로 id 를 채우고 나서 글자 칸을
-- 지운다. 표에 없는 item_key 가 하나라도 있으면 SET NOT NULL 에서 멈추고 아무것도 안 바뀐다.
DROP INDEX "drop_prices_item_period_idx";--> statement-breakpoint
ALTER TABLE "drop_prices" ADD COLUMN "item_id" uuid;--> statement-breakpoint
ALTER TABLE "drop_prices" ADD COLUMN "world_id" uuid;--> statement-breakpoint
UPDATE "drop_prices" dp SET "item_id" = i."id" FROM "drop_items" i WHERE i."key" = dp."item_key";--> statement-breakpoint
UPDATE "drop_prices" dp SET "world_id" = w."id" FROM "worlds" w WHERE w."key" = dp."world_key";--> statement-breakpoint
ALTER TABLE "drop_prices" ALTER COLUMN "item_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "drop_prices" ADD CONSTRAINT "drop_prices_item_id_drop_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."drop_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drop_prices" ADD CONSTRAINT "drop_prices_world_id_worlds_id_fk" FOREIGN KEY ("world_id") REFERENCES "public"."worlds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "drop_prices_item_period_idx" ON "drop_prices" USING btree ("item_id","period_key") WHERE "drop_prices"."deleted_at" IS NULL;--> statement-breakpoint
ALTER TABLE "drop_prices" DROP COLUMN "item_key";--> statement-breakpoint
ALTER TABLE "drop_prices" DROP COLUMN "world_key";
