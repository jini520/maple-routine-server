-- 옛 마이그레이션은 헥사 표에 줄을 넣지 않아 새 DB 에서 이 표들은 비어 있다. 그래서 칸을 바꿀 때 줄을 옮기지 않는다.
CREATE TABLE "hexa_core_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"api_type" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"max_level" integer DEFAULT 30 NOT NULL,
	"icon_asset_id" uuid NOT NULL,
	"sort_order" integer NOT NULL,
	CONSTRAINT "hexa_core_types_key_unique" UNIQUE("key"),
	CONSTRAINT "hexa_core_types_max_level_positive" CHECK ("hexa_core_types"."max_level" >= 1)
);
--> statement-breakpoint
CREATE TABLE "hexa_cores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"name" text NOT NULL,
	"type_id" uuid NOT NULL,
	"icon_asset_id" uuid NOT NULL,
	"sort_order" integer NOT NULL,
	CONSTRAINT "hexa_cores_job_name_unique" UNIQUE("job_id","name")
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"is_all_jobs" boolean DEFAULT false NOT NULL,
	CONSTRAINT "jobs_name_unique" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "hexa_core_kinds" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "hexa_core_name_kinds" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "hexa_job_cores" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
-- CASCADE 가 hexa_core_level_costs.kind_id 의 FK 도 지운다.
DROP TABLE "hexa_core_kinds" CASCADE;--> statement-breakpoint
DROP TABLE "hexa_core_name_kinds" CASCADE;--> statement-breakpoint
DROP TABLE "hexa_job_cores" CASCADE;--> statement-breakpoint
ALTER TABLE "hexa_core_level_costs" DROP CONSTRAINT "hexa_core_level_costs_kind_level_unique";--> statement-breakpoint
ALTER TABLE "hexa_core_level_costs" DROP CONSTRAINT "hexa_core_level_costs_level_nonnegative";--> statement-breakpoint
ALTER TABLE "hexa_core_level_costs" DROP CONSTRAINT "hexa_core_level_costs_amounts_nonnegative";--> statement-breakpoint
ALTER TABLE "hexa_stats" DROP CONSTRAINT "hexa_stats_activation_nonnegative";--> statement-breakpoint
ALTER TABLE "hexa_core_level_costs" ADD COLUMN "type_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "hexa_core_level_costs" ADD COLUMN "from_level" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "hexa_core_level_costs" ADD COLUMN "fragment_quantity" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "hexa_core_level_costs" ADD COLUMN "sol_erda_quantity" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "hexa_stats" ADD COLUMN "activation_fragment_quantity" integer;--> statement-breakpoint
ALTER TABLE "hexa_core_types" ADD CONSTRAINT "hexa_core_types_icon_asset_id_assets_id_fk" FOREIGN KEY ("icon_asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hexa_cores" ADD CONSTRAINT "hexa_cores_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hexa_cores" ADD CONSTRAINT "hexa_cores_type_id_hexa_core_types_id_fk" FOREIGN KEY ("type_id") REFERENCES "public"."hexa_core_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hexa_cores" ADD CONSTRAINT "hexa_cores_icon_asset_id_assets_id_fk" FOREIGN KEY ("icon_asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "hexa_core_types_default_unique" ON "hexa_core_types" USING btree ("api_type") WHERE "hexa_core_types"."is_default";--> statement-breakpoint
CREATE UNIQUE INDEX "jobs_all_jobs_unique" ON "jobs" USING btree ("is_all_jobs") WHERE "jobs"."is_all_jobs";--> statement-breakpoint
ALTER TABLE "hexa_core_level_costs" ADD CONSTRAINT "hexa_core_level_costs_type_id_hexa_core_types_id_fk" FOREIGN KEY ("type_id") REFERENCES "public"."hexa_core_types"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hexa_core_level_costs" DROP COLUMN "kind_id";--> statement-breakpoint
ALTER TABLE "hexa_core_level_costs" DROP COLUMN "level";--> statement-breakpoint
ALTER TABLE "hexa_core_level_costs" DROP COLUMN "fragments";--> statement-breakpoint
ALTER TABLE "hexa_core_level_costs" DROP COLUMN "sol_erda";--> statement-breakpoint
ALTER TABLE "hexa_stats" DROP COLUMN "activation_fragments";--> statement-breakpoint
ALTER TABLE "hexa_core_level_costs" ADD CONSTRAINT "hexa_core_level_costs_type_from_level_unique" UNIQUE("type_id","from_level");--> statement-breakpoint
ALTER TABLE "hexa_core_level_costs" ADD CONSTRAINT "hexa_core_level_costs_from_level_nonnegative" CHECK ("hexa_core_level_costs"."from_level" >= 0);--> statement-breakpoint
ALTER TABLE "hexa_core_level_costs" ADD CONSTRAINT "hexa_core_level_costs_quantities_nonnegative" CHECK ("hexa_core_level_costs"."fragment_quantity" >= 0 AND "hexa_core_level_costs"."sol_erda_quantity" >= 0);--> statement-breakpoint
ALTER TABLE "hexa_stats" ADD CONSTRAINT "hexa_stats_activation_nonnegative" CHECK ("hexa_stats"."activation_fragment_quantity" IS NULL OR "hexa_stats"."activation_fragment_quantity" >= 0);