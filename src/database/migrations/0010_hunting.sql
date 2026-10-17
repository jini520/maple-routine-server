CREATE TYPE "public"."force_type" AS ENUM('arcane', 'authentic');--> statement-breakpoint
CREATE TABLE "hunting_ground_levels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ground_id" uuid NOT NULL,
	"level" integer NOT NULL,
	CONSTRAINT "hunting_ground_levels_ground_level_unique" UNIQUE("ground_id","level"),
	CONSTRAINT "hunting_ground_levels_level_positive" CHECK ("hunting_ground_levels"."level" >= 1)
);
--> statement-breakpoint
CREATE TABLE "hunting_grounds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"region_id" uuid NOT NULL,
	"name" text NOT NULL,
	"force" integer NOT NULL,
	"mobs" integer NOT NULL,
	"sort_order" integer NOT NULL,
	CONSTRAINT "hunting_grounds_key_unique" UNIQUE("key"),
	CONSTRAINT "hunting_grounds_name_unique" UNIQUE("name"),
	CONSTRAINT "hunting_grounds_force_nonnegative" CHECK ("hunting_grounds"."force" >= 0),
	CONSTRAINT "hunting_grounds_mobs_positive" CHECK ("hunting_grounds"."mobs" >= 1)
);
--> statement-breakpoint
CREATE TABLE "hunting_regions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"force_type" "force_type" NOT NULL,
	"sort_order" integer NOT NULL,
	CONSTRAINT "hunting_regions_key_unique" UNIQUE("key")
);
--> statement-breakpoint
ALTER TABLE "hunting_ground_levels" ADD CONSTRAINT "hunting_ground_levels_ground_id_hunting_grounds_id_fk" FOREIGN KEY ("ground_id") REFERENCES "public"."hunting_grounds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hunting_grounds" ADD CONSTRAINT "hunting_grounds_region_id_hunting_regions_id_fk" FOREIGN KEY ("region_id") REFERENCES "public"."hunting_regions"("id") ON DELETE no action ON UPDATE no action;