CREATE TABLE "hexa_core_kinds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"api_type" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"max_level" integer DEFAULT 30 NOT NULL,
	"icon_file" text NOT NULL,
	"sort_order" integer NOT NULL,
	CONSTRAINT "hexa_core_kinds_key_unique" UNIQUE("key"),
	CONSTRAINT "hexa_core_kinds_max_level_positive" CHECK ("hexa_core_kinds"."max_level" >= 1)
);
--> statement-breakpoint
CREATE TABLE "hexa_core_level_costs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind_id" uuid NOT NULL,
	"level" integer NOT NULL,
	"fragments" integer NOT NULL,
	"sol_erda" integer NOT NULL,
	CONSTRAINT "hexa_core_level_costs_kind_level_unique" UNIQUE("kind_id","level"),
	CONSTRAINT "hexa_core_level_costs_level_nonnegative" CHECK ("hexa_core_level_costs"."level" >= 0),
	CONSTRAINT "hexa_core_level_costs_amounts_nonnegative" CHECK ("hexa_core_level_costs"."fragments" >= 0 AND "hexa_core_level_costs"."sol_erda" >= 0)
);
--> statement-breakpoint
CREATE TABLE "hexa_core_name_kinds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"kind_id" uuid NOT NULL,
	CONSTRAINT "hexa_core_name_kinds_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "hexa_job_cores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job" text NOT NULL,
	"name" text NOT NULL,
	"api_type" text NOT NULL,
	"icon_file" text NOT NULL,
	"sort_order" integer NOT NULL,
	CONSTRAINT "hexa_job_cores_job_name_unique" UNIQUE("job","name")
);
--> statement-breakpoint
CREATE TABLE "hexa_stats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"activation_fragments" integer,
	"sort_order" integer NOT NULL,
	CONSTRAINT "hexa_stats_key_unique" UNIQUE("key"),
	CONSTRAINT "hexa_stats_activation_nonnegative" CHECK ("hexa_stats"."activation_fragments" IS NULL OR "hexa_stats"."activation_fragments" >= 0)
);
--> statement-breakpoint
ALTER TABLE "hexa_core_level_costs" ADD CONSTRAINT "hexa_core_level_costs_kind_id_hexa_core_kinds_id_fk" FOREIGN KEY ("kind_id") REFERENCES "public"."hexa_core_kinds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hexa_core_name_kinds" ADD CONSTRAINT "hexa_core_name_kinds_kind_id_hexa_core_kinds_id_fk" FOREIGN KEY ("kind_id") REFERENCES "public"."hexa_core_kinds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "hexa_core_kinds_default_unique" ON "hexa_core_kinds" USING btree ("api_type") WHERE "hexa_core_kinds"."is_default";