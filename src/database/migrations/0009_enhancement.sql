CREATE TYPE "public"."mvp_grade" AS ENUM('normal', 'bronze', 'silver', 'gold', 'diamond', 'red', 'black');--> statement-breakpoint
CREATE TYPE "public"."potential_grade" AS ENUM('rare', 'epic', 'unique', 'legendary');--> statement-breakpoint
CREATE TYPE "public"."potential_reset_type" AS ENUM('potential', 'additional');--> statement-breakpoint
CREATE TABLE "equipment_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"level" integer,
	CONSTRAINT "equipment_items_key_unique" UNIQUE("key"),
	CONSTRAINT "equipment_items_name_unique" UNIQUE("name"),
	CONSTRAINT "equipment_items_level_positive" CHECK ("equipment_items"."level" IS NULL OR "equipment_items"."level" >= 1)
);
--> statement-breakpoint
CREATE TABLE "mvp_grades" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" "mvp_grade" NOT NULL,
	"name" text NOT NULL,
	"auction_fee_percent" integer NOT NULL,
	"starforce_discount_percent" integer NOT NULL,
	"sort_order" integer NOT NULL,
	CONSTRAINT "mvp_grades_key_unique" UNIQUE("key"),
	CONSTRAINT "mvp_grades_auction_fee_range" CHECK ("mvp_grades"."auction_fee_percent" BETWEEN 0 AND 100),
	CONSTRAINT "mvp_grades_starforce_discount_range" CHECK ("mvp_grades"."starforce_discount_percent" BETWEEN 0 AND 100)
);
--> statement-breakpoint
CREATE TABLE "potential_reset_costs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "potential_reset_type" NOT NULL,
	"min_level" integer NOT NULL,
	"grade" "potential_grade" NOT NULL,
	"cost_meso" bigint NOT NULL,
	CONSTRAINT "potential_reset_costs_cell_unique" UNIQUE("type","min_level","grade"),
	CONSTRAINT "potential_reset_costs_min_level_positive" CHECK ("potential_reset_costs"."min_level" >= 1),
	CONSTRAINT "potential_reset_costs_cost_nonnegative" CHECK ("potential_reset_costs"."cost_meso" >= 0)
);
--> statement-breakpoint
CREATE TABLE "soul_potential_reset_costs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"grade" "potential_grade" NOT NULL,
	"cost_meso" bigint NOT NULL,
	CONSTRAINT "soul_potential_reset_costs_grade_unique" UNIQUE("grade"),
	CONSTRAINT "soul_potential_reset_costs_cost_nonnegative" CHECK ("soul_potential_reset_costs"."cost_meso" >= 0)
);
--> statement-breakpoint
CREATE TABLE "starforce_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"from_star" integer NOT NULL,
	"exponent" double precision NOT NULL,
	"divisor" integer NOT NULL,
	CONSTRAINT "starforce_steps_from_star_unique" UNIQUE("from_star"),
	CONSTRAINT "starforce_steps_from_star_nonnegative" CHECK ("starforce_steps"."from_star" >= 0),
	CONSTRAINT "starforce_steps_divisor_positive" CHECK ("starforce_steps"."divisor" >= 1)
);
