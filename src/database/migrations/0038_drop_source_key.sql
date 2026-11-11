ALTER TABLE "drop_prices" DROP CONSTRAINT "drop_prices_ocid_with_ordinal";--> statement-breakpoint
DROP INDEX "drop_prices_same_drop_unique";--> statement-breakpoint
ALTER TABLE "drop_prices" ADD COLUMN "box_origin_item_id" uuid;--> statement-breakpoint
ALTER TABLE "drop_prices" ADD CONSTRAINT "drop_prices_box_origin_item_id_items_id_fk" FOREIGN KEY ("box_origin_item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "drop_prices_same_drop_unique" ON "drop_prices" USING btree ("ocid","boss_id","period_key","item_id",coalesce("box_origin_item_id", '00000000-0000-0000-0000-000000000000'::uuid)) WHERE "drop_prices"."record_status" <> 'deleted';--> statement-breakpoint
ALTER TABLE "drop_prices" DROP COLUMN "item_ordinal";