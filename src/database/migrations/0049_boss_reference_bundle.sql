-- 옛 마이그레이션은 보스가 쓰는 기준 표에 줄을 넣지 않아 새 DB 에서 이 표들은 비어 있다. 그래서 칸을 바꿀 때 줄을 옮기지 않는다.
CREATE TABLE "boss_difficulty_rewards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"boss_difficulty_id" uuid NOT NULL,
	"category" "drop_category" NOT NULL,
	"item_id" uuid NOT NULL,
	"quantity" integer,
	"valid_from" text,
	"valid_until" text,
	"sort_order" integer NOT NULL,
	CONSTRAINT "boss_difficulty_rewards_row_unique" UNIQUE NULLS NOT DISTINCT("boss_difficulty_id","item_id","valid_from")
);
--> statement-breakpoint
CREATE TABLE "boss_manual_completion_periods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"boss_id" uuid NOT NULL,
	"from_date" text NOT NULL,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "boss_drop_rewards" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "manual_completion_bosses" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "boss_drop_rewards" CASCADE;--> statement-breakpoint
DROP TABLE "manual_completion_bosses" CASCADE;--> statement-breakpoint
ALTER TABLE "boss_crystal_prices" DROP CONSTRAINT "boss_crystal_prices_pair_from_unique";--> statement-breakpoint
ALTER TABLE "drop_boxes" DROP CONSTRAINT "drop_boxes_level_pair";--> statement-breakpoint
ALTER TABLE "drop_boxes" DROP CONSTRAINT "drop_boxes_level_order";--> statement-breakpoint
ALTER TABLE "boss_crystal_prices" ADD COLUMN "valid_from" text;--> statement-breakpoint
ALTER TABLE "boss_crystal_prices" ADD COLUMN "valid_until" text;--> statement-breakpoint
ALTER TABLE "drop_boxes" ADD COLUMN "ring_level_min" integer;--> statement-breakpoint
ALTER TABLE "drop_boxes" ADD COLUMN "ring_level_max" integer;--> statement-breakpoint
ALTER TABLE "boss_difficulty_rewards" ADD CONSTRAINT "boss_difficulty_rewards_boss_difficulty_id_boss_difficulties_id_fk" FOREIGN KEY ("boss_difficulty_id") REFERENCES "public"."boss_difficulties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boss_difficulty_rewards" ADD CONSTRAINT "boss_difficulty_rewards_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boss_manual_completion_periods" ADD CONSTRAINT "boss_manual_completion_periods_boss_id_bosses_id_fk" FOREIGN KEY ("boss_id") REFERENCES "public"."bosses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "boss_manual_completion_periods_open_unique" ON "boss_manual_completion_periods" USING btree ("boss_id") WHERE "boss_manual_completion_periods"."closed_at" IS NULL;--> statement-breakpoint
ALTER TABLE "boss_crystal_prices" DROP COLUMN "from";--> statement-breakpoint
ALTER TABLE "boss_crystal_prices" DROP COLUMN "until";--> statement-breakpoint
ALTER TABLE "drop_boxes" DROP COLUMN "level_min";--> statement-breakpoint
ALTER TABLE "drop_boxes" DROP COLUMN "level_max";--> statement-breakpoint
ALTER TABLE "boss_crystal_prices" ADD CONSTRAINT "boss_crystal_prices_pair_from_unique" UNIQUE NULLS NOT DISTINCT("boss_difficulty_id","valid_from");--> statement-breakpoint
ALTER TABLE "drop_boxes" ADD CONSTRAINT "drop_boxes_level_pair" CHECK (("drop_boxes"."ring_level_min" IS NULL) = ("drop_boxes"."ring_level_max" IS NULL));--> statement-breakpoint
ALTER TABLE "drop_boxes" ADD CONSTRAINT "drop_boxes_level_order" CHECK ("drop_boxes"."ring_level_min" IS NULL OR "drop_boxes"."ring_level_min" <= "drop_boxes"."ring_level_max");