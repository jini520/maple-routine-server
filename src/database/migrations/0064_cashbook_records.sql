-- 가계부 기록 표 일곱을 1.0.15 의 칸으로 만든다(앱 저장소 ADR-099 결정 44 · 45 · 46 · 49 · 53 · 54). 새 DB 의 가계부 기록과
-- 품목은 비어 있어 칸을 바꾸고, 입력 넷과 인벤토리는 새로 만든다. 옛 가계부 기록은 운영에 줄이 없어 옮기지 않는다.
-- 기록의 캐릭터 · 메이플 ID 참조가 기댈 유일 제약을 그 참조보다 먼저 건다. 쓰는 표가 없어진 enum identity_source 를 지운다.
-- 인벤토리의 유일 기준은 장비가 아닌 줄에만 걸리고 종류가 다른 표에 있어, 색인이 아니라 트리거가 지킨다. 같은 메이플 ID ·
-- 월드 · 아이템의 살아 있는 줄이 이미 있으면 유일 위반으로 거절한다. 변경 번호 트리거는 0060 의 머리와 같은 이유다.
CREATE TYPE "public"."cashbook_item_target_type" AS ENUM('hunting_ground', 'item', 'spend_item', 'symbol', 'hexa_core', 'hexa_stat');--> statement-breakpoint
CREATE TYPE "public"."fragment_source" AS ENUM('hunt', 'inventory');--> statement-breakpoint
CREATE TABLE "cashbook_entry_exchange_inputs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entry_id" uuid NOT NULL,
	"sold_meso" bigint,
	"sell_maple_point_per_100m_meso" integer,
	"bought_meso" bigint,
	"buy_maple_point_per_100m_meso" integer,
	"meso_market_fee_percent" integer,
	CONSTRAINT "cashbook_entry_exchange_inputs_entry_id_unique" UNIQUE("entry_id")
);
--> statement-breakpoint
CREATE TABLE "cashbook_entry_fragment_uses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entry_id" uuid NOT NULL,
	"fragment_source" "fragment_source" NOT NULL,
	"character_id" uuid,
	"fragment_quantity" integer NOT NULL,
	CONSTRAINT "cashbook_entry_fragment_uses_entry_source_character_unique" UNIQUE NULLS NOT DISTINCT("entry_id","fragment_source","character_id")
);
--> statement-breakpoint
CREATE TABLE "cashbook_entry_hunt_inputs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entry_id" uuid NOT NULL,
	"character_level" integer,
	"missed_mob_quantity" integer,
	"uses_wealth_potion" boolean,
	"uses_union_wealth" boolean,
	"union_wealth_tier" integer,
	"fragment_quantity" integer,
	"fragment_price_meso" bigint,
	"meso_acquisition_percent" integer,
	"typed_meso" bigint,
	CONSTRAINT "cashbook_entry_hunt_inputs_entry_id_unique" UNIQUE("entry_id")
);
--> statement-breakpoint
CREATE TABLE "cashbook_entry_transfer_inputs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entry_id" uuid NOT NULL,
	"receiver_character_id" uuid,
	"transfer_meso" bigint NOT NULL,
	"fee_percent" integer,
	"fee_follows_mvp_grade" boolean NOT NULL,
	CONSTRAINT "cashbook_entry_transfer_inputs_entry_id_unique" UNIQUE("entry_id")
);
--> statement-breakpoint
CREATE TABLE "inventory_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"maple_id" uuid NOT NULL,
	"world_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"cashbook_item_type_id" uuid NOT NULL,
	"added_quantity" integer NOT NULL,
	"change_seq" bigint DEFAULT nextval('record_change_seq') NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cashbook_entries" DROP CONSTRAINT "cashbook_entries_maple_record_unique";--> statement-breakpoint
ALTER TABLE "cashbook_entry_items" DROP CONSTRAINT "cashbook_entry_items_entry_order_unique";--> statement-breakpoint
ALTER TABLE "cashbook_entries" DROP CONSTRAINT "cashbook_entries_maple_id_maple_ids_hash_fk";
--> statement-breakpoint
DROP INDEX "cashbook_entries_category_date_idx";--> statement-breakpoint
ALTER TABLE "characters" ADD CONSTRAINT "characters_id_maple_id_unique" UNIQUE("id","maple_id");--> statement-breakpoint
ALTER TABLE "cashbook_entries" ALTER COLUMN "id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "cashbook_entries" ALTER COLUMN "maple_id" SET DATA TYPE uuid USING "maple_id"::uuid;--> statement-breakpoint
ALTER TABLE "cashbook_entries" ADD COLUMN "character_id" uuid;--> statement-breakpoint
ALTER TABLE "cashbook_entries" ADD COLUMN "world_id" uuid;--> statement-breakpoint
ALTER TABLE "cashbook_entries" ADD COLUMN "category_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "cashbook_entries" ADD COLUMN "date" text NOT NULL;--> statement-breakpoint
ALTER TABLE "cashbook_entries" ADD COLUMN "memo" text;--> statement-breakpoint
ALTER TABLE "cashbook_entries" ADD COLUMN "recorded_at" timestamp with time zone NOT NULL;--> statement-breakpoint
ALTER TABLE "cashbook_entries" ADD COLUMN "change_seq" bigint DEFAULT nextval('record_change_seq') NOT NULL;--> statement-breakpoint
ALTER TABLE "cashbook_entry_items" ADD COLUMN "target_type" "cashbook_item_target_type";--> statement-breakpoint
ALTER TABLE "cashbook_entry_items" ADD COLUMN "target_id" uuid;--> statement-breakpoint
ALTER TABLE "cashbook_entry_items" ADD COLUMN "spend_reward_type_id" uuid;--> statement-breakpoint
ALTER TABLE "cashbook_entry_items" ADD COLUMN "item_type_id" uuid;--> statement-breakpoint
ALTER TABLE "cashbook_entry_items" ADD COLUMN "amount_maple_point" bigint;--> statement-breakpoint
ALTER TABLE "cashbook_entry_items" ADD COLUMN "maple_point_per_100m_meso" integer;--> statement-breakpoint
ALTER TABLE "cashbook_entry_items" ADD COLUMN "fragment_quantity" integer;--> statement-breakpoint
ALTER TABLE "cashbook_entry_items" ADD COLUMN "untradable_fragment_quantity" integer;--> statement-breakpoint
ALTER TABLE "cashbook_entry_items" ADD COLUMN "includes_hexa_activation" boolean;--> statement-breakpoint
ALTER TABLE "cashbook_entry_items" ADD COLUMN "sale_fee_follows_mvp_grade" boolean;--> statement-breakpoint
ALTER TABLE "cashbook_entry_items" ADD COLUMN "meso_market_fee_percent" integer;--> statement-breakpoint
ALTER TABLE "cashbook_entry_items" ADD COLUMN "uses_stored_fragments" boolean;--> statement-breakpoint
ALTER TABLE "cashbook_entry_items" ADD COLUMN "counts_stored_fragments_as_spend" boolean;--> statement-breakpoint
ALTER TABLE "cashbook_entry_items" ADD COLUMN "inventory_item_id" uuid;--> statement-breakpoint
ALTER TABLE "cashbook_entry_exchange_inputs" ADD CONSTRAINT "cashbook_entry_exchange_inputs_entry_id_cashbook_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."cashbook_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cashbook_entry_fragment_uses" ADD CONSTRAINT "cashbook_entry_fragment_uses_entry_id_cashbook_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."cashbook_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cashbook_entry_fragment_uses" ADD CONSTRAINT "cashbook_entry_fragment_uses_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cashbook_entry_hunt_inputs" ADD CONSTRAINT "cashbook_entry_hunt_inputs_entry_id_cashbook_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."cashbook_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cashbook_entry_transfer_inputs" ADD CONSTRAINT "cashbook_entry_transfer_inputs_entry_id_cashbook_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."cashbook_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cashbook_entry_transfer_inputs" ADD CONSTRAINT "cashbook_entry_transfer_inputs_receiver_character_id_characters_id_fk" FOREIGN KEY ("receiver_character_id") REFERENCES "public"."characters"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_maple_id_maple_ids_id_fk" FOREIGN KEY ("maple_id") REFERENCES "public"."maple_ids"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_world_id_worlds_id_fk" FOREIGN KEY ("world_id") REFERENCES "public"."worlds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_cashbook_item_type_id_cashbook_item_types_id_fk" FOREIGN KEY ("cashbook_item_type_id") REFERENCES "public"."cashbook_item_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "inventory_items_maple_world_item_idx" ON "inventory_items" USING btree ("maple_id","world_id","item_id");--> statement-breakpoint
ALTER TABLE "cashbook_entries" ADD CONSTRAINT "cashbook_entries_maple_id_maple_ids_id_fk" FOREIGN KEY ("maple_id") REFERENCES "public"."maple_ids"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cashbook_entries" ADD CONSTRAINT "cashbook_entries_world_id_worlds_id_fk" FOREIGN KEY ("world_id") REFERENCES "public"."worlds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cashbook_entries" ADD CONSTRAINT "cashbook_entries_category_id_cashbook_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."cashbook_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cashbook_entries" ADD CONSTRAINT "cashbook_entries_character_maple_id_fk" FOREIGN KEY ("character_id","maple_id") REFERENCES "public"."characters"("id","maple_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cashbook_entry_items" ADD CONSTRAINT "cashbook_entry_items_spend_reward_type_id_spend_reward_types_id_fk" FOREIGN KEY ("spend_reward_type_id") REFERENCES "public"."spend_reward_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cashbook_entry_items" ADD CONSTRAINT "cashbook_entry_items_item_type_id_cashbook_item_types_id_fk" FOREIGN KEY ("item_type_id") REFERENCES "public"."cashbook_item_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cashbook_entry_items" ADD CONSTRAINT "cashbook_entry_items_inventory_item_id_inventory_items_id_fk" FOREIGN KEY ("inventory_item_id") REFERENCES "public"."inventory_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cashbook_entries_maple_id_idx" ON "cashbook_entries" USING btree ("maple_id");--> statement-breakpoint
ALTER TABLE "cashbook_entries" DROP COLUMN "identified_by";--> statement-breakpoint
ALTER TABLE "cashbook_entries" DROP COLUMN "entry_record_id";--> statement-breakpoint
ALTER TABLE "cashbook_entries" DROP COLUMN "ocid";--> statement-breakpoint
ALTER TABLE "cashbook_entries" DROP COLUMN "entry_type";--> statement-breakpoint
ALTER TABLE "cashbook_entries" DROP COLUMN "category_key";--> statement-breakpoint
ALTER TABLE "cashbook_entries" DROP COLUMN "entry_date";--> statement-breakpoint
ALTER TABLE "cashbook_entry_items" DROP COLUMN "sort_order";--> statement-breakpoint
ALTER TABLE "cashbook_entry_items" DROP COLUMN "item_key";--> statement-breakpoint
ALTER TABLE "cashbook_entry_items" DROP COLUMN "form_key";--> statement-breakpoint
ALTER TABLE "cashbook_entry_items" DROP COLUMN "item_kind_key";--> statement-breakpoint
ALTER TABLE "cashbook_entry_items" DROP COLUMN "amount_point";--> statement-breakpoint
ALTER TABLE "cashbook_entry_items" DROP COLUMN "point_per_100m_meso";--> statement-breakpoint
ALTER TABLE "cashbook_entry_items" DROP COLUMN "fragment_count";--> statement-breakpoint
ALTER TABLE "cashbook_entry_items" DROP COLUMN "untradable_fragment_count";--> statement-breakpoint
ALTER TABLE "cashbook_entry_items" DROP COLUMN "hexa_activation";--> statement-breakpoint
ALTER TABLE "cashbook_entry_items" ADD CONSTRAINT "cashbook_entry_items_entry_reward_type_unique" UNIQUE NULLS NOT DISTINCT("entry_id","spend_reward_type_id");--> statement-breakpoint
ALTER TABLE "cashbook_entry_items" ADD CONSTRAINT "cashbook_entry_items_target_check" CHECK (("cashbook_entry_items"."target_type" IS NULL) = ("cashbook_entry_items"."target_id" IS NULL)
          AND ("cashbook_entry_items"."item_name" IS NULL OR "cashbook_entry_items"."target_id" IS NULL));--> statement-breakpoint
DROP TYPE "public"."identity_source";--> statement-breakpoint
CREATE FUNCTION "inventory_items_check_unique"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.deleted_at IS NULL
     AND (SELECT key FROM cashbook_item_types WHERE id = NEW.cashbook_item_type_id) <> 'equipment'
     AND EXISTS (SELECT 1 FROM inventory_items o JOIN cashbook_item_types t ON t.id = o.cashbook_item_type_id
                  WHERE o.maple_id = NEW.maple_id AND o.world_id = NEW.world_id AND o.item_id = NEW.item_id
                    AND o.deleted_at IS NULL AND o.id <> NEW.id AND t.key <> 'equipment') THEN
    RAISE EXCEPTION 'inventory_items: 같은 메이플 ID · 월드 · 아이템의 줄이 이미 있다'
      USING ERRCODE = 'unique_violation', CONSTRAINT = 'inventory_items_maple_world_item_unique';
  END IF;
  RETURN NEW;
END
$$;--> statement-breakpoint
CREATE TRIGGER "inventory_items_unique" BEFORE INSERT OR UPDATE ON "inventory_items" FOR EACH ROW EXECUTE FUNCTION "inventory_items_check_unique"();--> statement-breakpoint
CREATE TRIGGER "cashbook_entries_change_seq" BEFORE INSERT OR UPDATE ON "cashbook_entries" FOR EACH ROW EXECUTE FUNCTION "bump_change_seq"();--> statement-breakpoint
CREATE TRIGGER "inventory_items_change_seq" BEFORE INSERT OR UPDATE ON "inventory_items" FOR EACH ROW EXECUTE FUNCTION "bump_change_seq"();
