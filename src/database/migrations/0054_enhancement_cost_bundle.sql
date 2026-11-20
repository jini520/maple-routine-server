-- 새 DB 의 잠재 비용 · 스타포스 단계 표는 비어 있어 칸과 표를 지우고 새로 만든다. 슈페리얼 계열 · 장비 표는 옛 마이그레이션
-- 0043 이 줄을 넣어 형만 바꾼다. 옮기는 스크립트가 여섯 표를 비우고 옛 DB 의 줄을 줄 id 그대로 채운다.
CREATE TABLE "starforce_cost_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"from_star" integer NOT NULL,
	"exponent" double precision NOT NULL,
	"divisor" integer NOT NULL,
	CONSTRAINT "starforce_cost_steps_from_star_unique" UNIQUE("from_star"),
	CONSTRAINT "starforce_cost_steps_from_star_nonnegative" CHECK ("starforce_cost_steps"."from_star" >= 0),
	CONSTRAINT "starforce_cost_steps_divisor_positive" CHECK ("starforce_cost_steps"."divisor" >= 1)
);
--> statement-breakpoint
ALTER TABLE "starforce_steps" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "starforce_steps" CASCADE;--> statement-breakpoint
ALTER TABLE "potential_reset_costs" DROP CONSTRAINT "potential_reset_costs_cell_unique";--> statement-breakpoint
ALTER TABLE "potential_reset_costs" DROP CONSTRAINT "potential_reset_costs_min_level_positive";--> statement-breakpoint
ALTER TABLE "superior_series" ALTER COLUMN "starforce_cost_meso" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "potential_reset_costs" ADD COLUMN "min_required_level" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "potential_reset_costs" DROP COLUMN "min_level";--> statement-breakpoint
ALTER TABLE "potential_reset_costs" ADD CONSTRAINT "potential_reset_costs_cell_unique" UNIQUE("type","min_required_level","grade");--> statement-breakpoint
ALTER TABLE "potential_reset_costs" ADD CONSTRAINT "potential_reset_costs_min_required_level_positive" CHECK ("potential_reset_costs"."min_required_level" >= 1);