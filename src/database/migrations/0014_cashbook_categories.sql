-- 가계부 갈래 · 아이템 종류 · 에픽던전 형태를 서버 표로 옮긴다(앱 저장소 ADR-096). 이름 · 그림 · 설명은 앱 상수
-- (lib/cashbook/categories.ts) 그대로이고, 카드 제목 · 줄인 이름 · 단위는 사용자가 정했다(2026-10-25).
-- 운영 DB 에 묶음 · 형태 줄이 이미 있어서 새 칸은 nullable 로 더하고 채운 뒤 NOT NULL 로 건다.
CREATE TYPE "public"."cashbook_entry_type" AS ENUM('income', 'spend');--> statement-breakpoint
CREATE TABLE "cashbook_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entry_type" "cashbook_entry_type" NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"card_title" text NOT NULL,
	"icon_file" text NOT NULL,
	"description" text NOT NULL,
	"unit" text,
	"sort_order" integer NOT NULL,
	CONSTRAINT "cashbook_categories_entry_type_key_unique" UNIQUE("entry_type","key")
);
--> statement-breakpoint
CREATE TABLE "cashbook_item_kinds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"unit" text,
	"has_tariff" boolean NOT NULL,
	"sort_order" integer NOT NULL,
	CONSTRAINT "cashbook_item_kinds_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "spend_forms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" "spend_form" NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer NOT NULL,
	CONSTRAINT "spend_forms_key_unique" UNIQUE("key")
);
--> statement-breakpoint
INSERT INTO "cashbook_categories" ("entry_type", "key", "name", "card_title", "icon_file", "description", "unit", "sort_order") VALUES
	('spend', 'content', '컨텐츠', '컨텐츠', 'monster_park_ticket.webp', '몬파·에픽던전·퀵패스', NULL, 0),
	('spend', 'event_bm', '이벤트·BM', '이벤트·BM', 'vip_sauna_ticket.webp', '메포샵·보약 버프 등', NULL, 1),
	('spend', 'buff', '버프', '버프', 'seiram_elixir.webp', '메소 구입 버프 아이템', NULL, 2),
	('spend', 'scroll', '주문서', '주문서', 'amazing_positive_chaos_scroll.webp', '장비·악세·펫장비', NULL, 3),
	('spend', 'symbol', '심볼 강화', '심볼강화', 'authentic_symbol_selection_coupon.webp', '심볼 강화 비용', NULL, 4),
	('spend', 'item_purchase', '아이템 구매', '아이템 구매', 'dark_boss_pendant.png', '구매 아이템 지출', NULL, 5),
	('spend', 'etc', '기타', '기타', 'meso.webp', '각종 패스 등 기타 지출', '개', 6),
	('income', 'hunting', '사냥', '사냥', 'wealth_acquisition_potion_small.webp', '메소 · 조각 수익 기록', '소재', 0),
	('income', 'sol_erda_fragment', '솔 에르다 조각', '사냥', 'sol_erda_fragment.webp', '사냥 수익 조각 정산', '개', 1),
	('income', 'item_sale', '아이템 판매', '아이템 판매', 'dark_boss_pendant.png', '판매 아이템 수익', NULL, 2),
	('income', 'etc', '기타', '기타', 'meso.webp', '이벤트 등 기타 수익', '개', 3);--> statement-breakpoint
INSERT INTO "cashbook_item_kinds" ("key", "name", "unit", "has_tariff", "sort_order") VALUES
	('equipment', '장비', NULL, true, 0),
	('consumable', '소비', '개', false, 1),
	('etc', '기타', '개', false, 2);--> statement-breakpoint
INSERT INTO "spend_forms" ("key", "name", "sort_order") VALUES
	('exp', '경험치', 0),
	('sol_erda', '솔 에르다', 1);--> statement-breakpoint
ALTER TABLE "spend_groups" ADD COLUMN "category_id" uuid;--> statement-breakpoint
ALTER TABLE "spend_groups" ADD COLUMN "card_title" text;--> statement-breakpoint
UPDATE "spend_groups" SET "category_id" = c."id" FROM "cashbook_categories" c
	WHERE c."entry_type" = 'spend' AND c."key" = "spend_groups"."category"::text;--> statement-breakpoint
UPDATE "spend_groups" SET "card_title" = CASE "key"
	WHEN 'epic_dungeon_bonus_reward' THEN '에픽던전'
	WHEN 'etc' THEN '이벤트·BM'
	WHEN 'boss_buff' THEN '버프(보스)'
	WHEN 'hunting_buff' THEN '버프(사냥)'
	ELSE "name" END;--> statement-breakpoint
ALTER TABLE "spend_groups" ALTER COLUMN "category_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "spend_groups" ALTER COLUMN "card_title" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "spend_groups" ADD CONSTRAINT "spend_groups_category_id_cashbook_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."cashbook_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spend_groups" DROP COLUMN "category";--> statement-breakpoint
DROP TYPE "public"."spend_category";--> statement-breakpoint
ALTER TABLE "spend_item_forms" DROP CONSTRAINT "spend_item_forms_item_form_unique";--> statement-breakpoint
ALTER TABLE "spend_item_forms" ADD COLUMN "form_id" uuid;--> statement-breakpoint
UPDATE "spend_item_forms" SET "form_id" = f."id" FROM "spend_forms" f WHERE f."key" = "spend_item_forms"."form";--> statement-breakpoint
ALTER TABLE "spend_item_forms" ALTER COLUMN "form_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "spend_item_forms" ADD CONSTRAINT "spend_item_forms_form_id_spend_forms_id_fk" FOREIGN KEY ("form_id") REFERENCES "public"."spend_forms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spend_item_forms" DROP COLUMN "form";--> statement-breakpoint
ALTER TABLE "spend_item_forms" ADD CONSTRAINT "spend_item_forms_item_form_unique" UNIQUE("item_id","form_id");--> statement-breakpoint
-- 줄인 이름은 지금 앱에 서 있는 이름이고, 원본 이름은 사용자가 카드 이름표에서 정했다.
ALTER TABLE "spend_items" ADD COLUMN "short_name" text;--> statement-breakpoint
UPDATE "spend_items" SET "short_name" = "name", "name" = CASE "key"
	WHEN 'blueberry_farm' THEN '블루베리 농장 입장권'
	WHEN 'mechaberry_farm' THEN '메카베리 농장 입장권'
	WHEN 'vip_sauna' THEN 'VIP 사우나 입장권'
	WHEN 'pet_equipment_innocent_scroll' THEN '펫장비 이노센트 주문서'
	WHEN 'pet_equipment_return_scroll' THEN '펫장비 리턴 스크롤'
	END
	WHERE "key" IN ('blueberry_farm', 'mechaberry_farm', 'vip_sauna', 'pet_equipment_innocent_scroll', 'pet_equipment_return_scroll');--> statement-breakpoint
UPDATE "game_data_sections" SET "updated_at" = now() WHERE "key" = 'spendCatalog';
--> statement-breakpoint
INSERT INTO "game_data_sections" ("key", "updated_at") VALUES ('cashbookCategories', now()) ON CONFLICT ("key") DO UPDATE SET "updated_at" = now();
