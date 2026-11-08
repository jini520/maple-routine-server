-- 드롭 아이템 · 강화 장비 · 사냥 전리품을 아이템 표 하나(items)로 합친다(앱 저장소 ADR-187 결정 1).
-- drop_items 는 이름만 items 로 바꿔 줄과 id 를 지킨다. 그래서 드롭 표 · 상자 · 드롭 가격의 FK 는 그대로 이어지고 이름만
-- 새 표를 따라 바꾼다. 강화 장비는 key 가 같은 줄에 겹쳐 얹고 나머지를 더하며, 사냥 전리품은 아이템 줄을 만들어 item_id 로
-- 가리킨다. 이름이 NFC · 공백 제거 뒤에 겹치면 한 물건이 두 줄이 되므로 RAISE 로 멈추고 아무것도 안 바뀐다.
ALTER TABLE "drop_items" RENAME TO "items";--> statement-breakpoint
ALTER INDEX "drop_items_pkey" RENAME TO "items_pkey";--> statement-breakpoint
ALTER TABLE "items" RENAME CONSTRAINT "drop_items_key_unique" TO "items_key_unique";--> statement-breakpoint
ALTER TABLE "items" RENAME CONSTRAINT "drop_items_icon_asset_id_assets_id_fk" TO "items_icon_asset_id_assets_id_fk";--> statement-breakpoint
ALTER TABLE "boss_drop_rewards" RENAME CONSTRAINT "boss_drop_rewards_item_id_drop_items_id_fk" TO "boss_drop_rewards_item_id_items_id_fk";--> statement-breakpoint
ALTER TABLE "drop_box_contents" RENAME CONSTRAINT "drop_box_contents_item_id_drop_items_id_fk" TO "drop_box_contents_item_id_items_id_fk";--> statement-breakpoint
ALTER TABLE "drop_boxes" RENAME CONSTRAINT "drop_boxes_item_id_drop_items_id_fk" TO "drop_boxes_item_id_items_id_fk";--> statement-breakpoint
ALTER TABLE "drop_prices" RENAME CONSTRAINT "drop_prices_item_id_drop_items_id_fk" TO "drop_prices_item_id_items_id_fk";--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "category" text;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "level" integer;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "is_drop" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "is_equipment" boolean DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE "items" SET "is_drop" = true;--> statement-breakpoint
UPDATE "items" i SET "is_equipment" = true, "level" = e."level" FROM "equipment_items" e WHERE e."key" = i."key";--> statement-breakpoint
INSERT INTO "items" ("key", "name", "level", "is_equipment")
  SELECT e."key", e."name", e."level", true FROM "equipment_items" e
  WHERE NOT EXISTS (SELECT 1 FROM "items" i WHERE i."key" = e."key");--> statement-breakpoint
ALTER TABLE "hunt_loot_items" ADD COLUMN "item_id" uuid;--> statement-breakpoint
INSERT INTO "items" ("key", "name", "icon_asset_id")
  SELECT h."key", h."name", h."icon_asset_id" FROM "hunt_loot_items" h
  WHERE NOT EXISTS (SELECT 1 FROM "items" i WHERE i."key" = h."key");--> statement-breakpoint
UPDATE "hunt_loot_items" h SET "item_id" = i."id" FROM "items" i WHERE i."key" = h."key";--> statement-breakpoint
DO $$
DECLARE clash text;
BEGIN
  SELECT string_agg(keys, ' · ') INTO clash FROM (
    SELECT string_agg("key", ', ' ORDER BY "key") AS keys
    FROM "items"
    GROUP BY regexp_replace(normalize("name", NFC), '\s+', '', 'g')
    HAVING count(*) > 1
  ) same_name;
  IF clash IS NOT NULL THEN
    RAISE EXCEPTION '이름이 같은 아이템이 key 둘 이상으로 있다: %', clash;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "hunt_loot_items" ALTER COLUMN "item_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "hunt_loot_items" ADD CONSTRAINT "hunt_loot_items_item_id_unique" UNIQUE("item_id");--> statement-breakpoint
ALTER TABLE "hunt_loot_items" ADD CONSTRAINT "hunt_loot_items_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hunt_loot_items" DROP CONSTRAINT "hunt_loot_items_key_unique";--> statement-breakpoint
ALTER TABLE "hunt_loot_items" DROP CONSTRAINT "hunt_loot_items_icon_asset_id_assets_id_fk";--> statement-breakpoint
ALTER TABLE "hunt_loot_items" DROP COLUMN "key";--> statement-breakpoint
ALTER TABLE "hunt_loot_items" DROP COLUMN "name";--> statement-breakpoint
ALTER TABLE "hunt_loot_items" DROP COLUMN "icon_asset_id";--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_level_positive" CHECK ("items"."level" IS NULL OR "items"."level" >= 1);--> statement-breakpoint
DROP TABLE "equipment_items";
