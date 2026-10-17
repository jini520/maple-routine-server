CREATE TYPE "public"."content_category" AS ENUM('monster_park', 'daily_quest', 'epic_dungeon', 'maple_union', 'arcane_river_quest', 'weekly_quest', 'mu_lung_dojo', 'guild');--> statement-breakpoint
CREATE TYPE "public"."content_section" AS ENUM('daily', 'weekly');--> statement-breakpoint
CREATE TYPE "public"."content_type" AS ENUM('contents', 'quest');--> statement-breakpoint
CREATE TYPE "public"."share_scope" AS ENUM('character', 'world', 'account');--> statement-breakpoint
CREATE TABLE "content_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" "content_category" NOT NULL,
	"name" text NOT NULL,
	"count_tag" text,
	"hide_count_tag" boolean DEFAULT false NOT NULL,
	"weekly_limit" integer,
	"shared_order" integer,
	"sort_order" integer NOT NULL,
	CONSTRAINT "content_categories_key_unique" UNIQUE("key"),
	CONSTRAINT "content_categories_tag_one" CHECK ("content_categories"."count_tag" IS NULL OR NOT "content_categories"."hide_count_tag"),
	CONSTRAINT "content_categories_weekly_limit_positive" CHECK ("content_categories"."weekly_limit" IS NULL OR "content_categories"."weekly_limit" >= 1)
);
--> statement-breakpoint
CREATE TABLE "contents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"section" "content_section" NOT NULL,
	"api_name" text NOT NULL,
	"category_id" uuid NOT NULL,
	"display_name" text NOT NULL,
	"short_name" text NOT NULL,
	"background_map" text,
	"background_portrait" text,
	"count_tag" text,
	"type" "content_type" NOT NULL,
	"max_count" integer NOT NULL,
	"required_level" integer,
	"from" text,
	"until" text,
	"share_scope" "share_scope" DEFAULT 'character' NOT NULL,
	"shared_short_name" text,
	"only_when_scheduled" boolean DEFAULT false NOT NULL,
	"trust_registration_flag" boolean DEFAULT false NOT NULL,
	"cumulative_score" boolean DEFAULT false NOT NULL,
	"max_count_override" integer,
	"sort_order" integer NOT NULL,
	CONSTRAINT "contents_key_unique" UNIQUE("key"),
	CONSTRAINT "contents_api_name_unique" UNIQUE("api_name"),
	CONSTRAINT "contents_background_one" CHECK ("contents"."background_map" IS NULL OR "contents"."background_portrait" IS NULL),
	CONSTRAINT "contents_shared_name_pairs_scope" CHECK (("contents"."share_scope" = 'character') = ("contents"."shared_short_name" IS NULL)),
	CONSTRAINT "contents_character_flags_off" CHECK ("contents"."share_scope" <> 'character' OR (NOT "contents"."only_when_scheduled" AND NOT "contents"."trust_registration_flag")),
	CONSTRAINT "contents_max_count_nonnegative" CHECK ("contents"."max_count" >= 0),
	CONSTRAINT "contents_required_level_positive" CHECK ("contents"."required_level" IS NULL OR "contents"."required_level" >= 1),
	CONSTRAINT "contents_max_count_override_positive" CHECK ("contents"."max_count_override" IS NULL OR "contents"."max_count_override" >= 1)
);
--> statement-breakpoint
ALTER TABLE "contents" ADD CONSTRAINT "contents_category_id_content_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."content_categories"("id") ON DELETE no action ON UPDATE no action;