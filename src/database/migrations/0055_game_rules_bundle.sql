-- 새 DB 의 게임 규칙 표는 비어 있어 칸을 바꿀 때 줄을 옮기지 않는다. 갱신 시각 표는 옛 마이그레이션이 줄을 넣지만 지우고 새로
-- 만든다. 옮기는 스크립트가 규칙 줄 아홉을 한 줄로 모아 넣고, 갱신 시각 줄을 지금 응답의 칸만 다시 채운다.
CREATE TABLE "game_data_section_updates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "game_data_section_updates_key_unique" UNIQUE("key")
);
--> statement-breakpoint
ALTER TABLE "game_data_sections" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "game_data_sections" CASCADE;--> statement-breakpoint
ALTER TABLE "game_rules" DROP CONSTRAINT "game_rules_key_unique";--> statement-breakpoint
ALTER TABLE "game_rules" ADD COLUMN "weekly_boss_selection_limit" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "game_rules" ADD COLUMN "weekly_crystal_sale_limit" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "game_rules" ADD COLUMN "default_max_party_size" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "game_rules" ADD COLUMN "spend_tariff_percent" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "game_rules" ADD COLUMN "reward_coin_price_meso" bigint NOT NULL;--> statement-breakpoint
ALTER TABLE "game_rules" ADD COLUMN "meso_market_fee_percent" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "game_rules" ADD COLUMN "cube_appraisal_free_max_level" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "game_rules" ADD COLUMN "cube_appraisal_coefficient" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "game_rules" ADD COLUMN "starforce_destroy_defence_surcharge_percent" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "game_rules" DROP COLUMN "key";--> statement-breakpoint
ALTER TABLE "game_rules" DROP COLUMN "value";