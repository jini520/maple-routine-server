-- 옛 마이그레이션은 컨텐츠 표에 줄을 넣지 않아 새 DB 에서 이 표들은 비어 있다. 그래서 칸을 바꿀 때 줄을 옮기지 않는다.
CREATE TYPE "public"."content_check_type" AS ENUM('state_only', 'count_only', 'both', 'score');--> statement-breakpoint
CREATE TYPE "public"."content_cycle" AS ENUM('daily', 'weekly');--> statement-breakpoint
ALTER TABLE "content_categories" DROP CONSTRAINT "content_categories_weekly_limit_positive";--> statement-breakpoint
ALTER TABLE "content_categories" DROP CONSTRAINT "content_categories_tag_one";--> statement-breakpoint
ALTER TABLE "contents" DROP CONSTRAINT "contents_shared_name_pairs_scope";--> statement-breakpoint
ALTER TABLE "contents" DROP CONSTRAINT "contents_character_flags_off";--> statement-breakpoint
ALTER TABLE "contents" DROP CONSTRAINT "contents_max_count_nonnegative";--> statement-breakpoint
ALTER TABLE "contents" DROP CONSTRAINT "contents_max_count_override_positive";--> statement-breakpoint
ALTER TABLE "contents" ALTER COLUMN "max_count" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "content_categories" ADD COLUMN "hides_count_tag" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "content_categories" ADD COLUMN "weekly_max_count" integer;--> statement-breakpoint
ALTER TABLE "content_categories" ADD COLUMN "shared_sort_order" integer;--> statement-breakpoint
ALTER TABLE "contents" ADD COLUMN "cycle" "content_cycle" NOT NULL;--> statement-breakpoint
ALTER TABLE "contents" ADD COLUMN "name" text NOT NULL;--> statement-breakpoint
ALTER TABLE "contents" ADD COLUMN "check_type" "content_check_type" NOT NULL;--> statement-breakpoint
ALTER TABLE "contents" ADD COLUMN "valid_from" text;--> statement-breakpoint
ALTER TABLE "contents" ADD COLUMN "valid_until" text;--> statement-breakpoint
ALTER TABLE "content_categories" DROP COLUMN "hide_count_tag";--> statement-breakpoint
ALTER TABLE "content_categories" DROP COLUMN "weekly_limit";--> statement-breakpoint
ALTER TABLE "content_categories" DROP COLUMN "shared_order";--> statement-breakpoint
ALTER TABLE "contents" DROP COLUMN "section";--> statement-breakpoint
ALTER TABLE "contents" DROP COLUMN "display_name";--> statement-breakpoint
ALTER TABLE "contents" DROP COLUMN "from";--> statement-breakpoint
ALTER TABLE "contents" DROP COLUMN "until";--> statement-breakpoint
ALTER TABLE "contents" DROP COLUMN "shared_short_name";--> statement-breakpoint
ALTER TABLE "contents" DROP COLUMN "only_when_scheduled";--> statement-breakpoint
ALTER TABLE "contents" DROP COLUMN "trust_registration_flag";--> statement-breakpoint
ALTER TABLE "contents" DROP COLUMN "cumulative_score";--> statement-breakpoint
ALTER TABLE "contents" DROP COLUMN "max_count_override";--> statement-breakpoint
ALTER TABLE "content_categories" ADD CONSTRAINT "content_categories_weekly_max_count_positive" CHECK ("content_categories"."weekly_max_count" IS NULL OR "content_categories"."weekly_max_count" >= 1);--> statement-breakpoint
ALTER TABLE "content_categories" ADD CONSTRAINT "content_categories_tag_one" CHECK ("content_categories"."count_tag" IS NULL OR NOT "content_categories"."hides_count_tag");--> statement-breakpoint
ALTER TABLE "contents" ADD CONSTRAINT "contents_max_count_only_count" CHECK (("contents"."check_type" = 'count_only') = ("contents"."max_count" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "contents" ADD CONSTRAINT "contents_max_count_positive" CHECK ("contents"."max_count" IS NULL OR "contents"."max_count" >= 1);--> statement-breakpoint
DROP TYPE "public"."content_section";