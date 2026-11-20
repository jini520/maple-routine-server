-- 새 DB 의 시세 표는 비어 있다. 표 넷의 이름과 칸을 바꾸고, 범위를 종류와 줄 id 로, 판정의 사람을 사람 줄로 바꾼다. 옮기는
-- 스크립트가 옛 DB 의 줄을 채운다. 반지 레벨 칸은 없앤다. 반지는 레벨마다 아이템 줄이 따로 있다(앱 저장소 ADR-099 결정 63).
CREATE TYPE "public"."market_scope_type" AS ENUM('trade_group', 'world');--> statement-breakpoint
CREATE TABLE "market_published_days" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "market_published_days_date_unique" UNIQUE("date")
);
--> statement-breakpoint
CREATE TABLE "market_reference_prices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date" date NOT NULL,
	"item_id" uuid NOT NULL,
	"scope_type" "market_scope_type" NOT NULL,
	"scope_id" uuid NOT NULL,
	"source" "market_reference_source" NOT NULL,
	"reference_price_meso" bigint NOT NULL,
	"range_low_meso" bigint,
	"range_high_meso" bigint,
	"fence_low_meso" double precision NOT NULL,
	"fence_high_meso" double precision NOT NULL,
	"fresh_date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "market_reference_prices_date_item_scope_unique" UNIQUE("date","item_id","scope_type","scope_id")
);
--> statement-breakpoint
CREATE TABLE "maspi_basket_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"scope_type" "market_scope_type" NOT NULL,
	"scope_id" uuid NOT NULL,
	"base_price_meso" bigint NOT NULL,
	"voter_count" integer NOT NULL,
	"index_weight" double precision NOT NULL,
	"from_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "maspi_basket_items_item_scope_unique" UNIQUE("item_id","scope_type","scope_id")
);
--> statement-breakpoint
CREATE TABLE "maspi_daily_closes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date" date NOT NULL,
	"close" double precision NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "maspi_daily_closes_date_unique" UNIQUE("date")
);
--> statement-breakpoint
ALTER TABLE "market_days" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "market_runs" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "maspi_basket" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "maspi_days" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "market_days" CASCADE;--> statement-breakpoint
DROP TABLE "market_runs" CASCADE;--> statement-breakpoint
DROP TABLE "maspi_basket" CASCADE;--> statement-breakpoint
DROP TABLE "maspi_days" CASCADE;--> statement-breakpoint
ALTER TABLE "market_judgements" DROP CONSTRAINT "market_judgements_day_person_unique";--> statement-breakpoint
ALTER TABLE "market_responses" DROP CONSTRAINT "market_responses_day_key_unique";--> statement-breakpoint
ALTER TABLE "market_reference_prices" ALTER COLUMN "source" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."market_reference_source";--> statement-breakpoint
CREATE TYPE "public"."market_reference_source" AS ENUM('today', 'three_day', 'kept');--> statement-breakpoint
ALTER TABLE "market_reference_prices" ALTER COLUMN "source" SET DATA TYPE "public"."market_reference_source" USING "source"::"public"."market_reference_source";--> statement-breakpoint
ALTER TABLE "market_judgements" ADD COLUMN "date" date NOT NULL;--> statement-breakpoint
ALTER TABLE "market_judgements" ADD COLUMN "user_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "market_judgements" ADD COLUMN "judged_count" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "market_judgements" ADD COLUMN "excluded_count" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "market_judgements" ADD COLUMN "is_dummy" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "market_responses" ADD COLUMN "date" date NOT NULL;--> statement-breakpoint
ALTER TABLE "market_reference_prices" ADD CONSTRAINT "market_reference_prices_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maspi_basket_items" ADD CONSTRAINT "maspi_basket_items_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market_judgements" ADD CONSTRAINT "market_judgements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market_judgements" DROP COLUMN "day";--> statement-breakpoint
ALTER TABLE "market_judgements" DROP COLUMN "person";--> statement-breakpoint
ALTER TABLE "market_judgements" DROP COLUMN "judged";--> statement-breakpoint
ALTER TABLE "market_judgements" DROP COLUMN "excluded";--> statement-breakpoint
ALTER TABLE "market_judgements" DROP COLUMN "dummy";--> statement-breakpoint
ALTER TABLE "market_responses" DROP COLUMN "day";--> statement-breakpoint
ALTER TABLE "market_judgements" ADD CONSTRAINT "market_judgements_date_user_unique" UNIQUE("date","user_id");--> statement-breakpoint
ALTER TABLE "market_responses" ADD CONSTRAINT "market_responses_date_key_unique" UNIQUE("date","key");