-- 새 DB 의 심볼 표 셋은 비어 있다. 옛 마이그레이션이 기준 줄을 넣지 않아 칸을 지우고 새로 더한다.
-- 옮기는 스크립트가 옛 DB 의 줄을 줄 id 그대로 채운다.
ALTER TABLE "symbol_level_costs" DROP CONSTRAINT "symbol_level_costs_row_unique";--> statement-breakpoint
ALTER TABLE "symbol_groups" DROP CONSTRAINT "symbol_groups_default_range";--> statement-breakpoint
ALTER TABLE "symbol_level_costs" DROP CONSTRAINT "symbol_level_costs_level_positive";--> statement-breakpoint
ALTER TABLE "symbol_groups" ADD COLUMN "default_from_level" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "symbol_groups" ADD COLUMN "default_to_level" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "symbol_level_costs" ADD COLUMN "from_level" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "symbol_level_costs" ADD COLUMN "valid_from" text;--> statement-breakpoint
ALTER TABLE "symbol_level_costs" ADD COLUMN "valid_until" text;--> statement-breakpoint
ALTER TABLE "symbol_groups" DROP COLUMN "default_from";--> statement-breakpoint
ALTER TABLE "symbol_groups" DROP COLUMN "default_to";--> statement-breakpoint
ALTER TABLE "symbol_level_costs" DROP COLUMN "level";--> statement-breakpoint
ALTER TABLE "symbol_level_costs" DROP COLUMN "from";--> statement-breakpoint
ALTER TABLE "symbol_level_costs" DROP COLUMN "until";--> statement-breakpoint
ALTER TABLE "symbol_level_costs" ADD CONSTRAINT "symbol_level_costs_row_unique" UNIQUE NULLS NOT DISTINCT("symbol_id","from_level","valid_from");--> statement-breakpoint
ALTER TABLE "symbol_groups" ADD CONSTRAINT "symbol_groups_default_range" CHECK ("symbol_groups"."default_from_level" < "symbol_groups"."default_to_level" AND "symbol_groups"."default_to_level" <= "symbol_groups"."max_level");--> statement-breakpoint
ALTER TABLE "symbol_level_costs" ADD CONSTRAINT "symbol_level_costs_from_level_positive" CHECK ("symbol_level_costs"."from_level" >= 1);