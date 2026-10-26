-- 강화 지출 합계를 받는 표(앱 저장소 ADR-100 결정 7 · 8). 이벤트 월드가 아닌 합계 줄의 사본이고 비용은 MVP 할인 전이다.
CREATE TYPE "public"."enhancement_category" AS ENUM('cube_reset', 'starforce', 'potential', 'additional_potential', 'soul_potential');--> statement-breakpoint
CREATE TABLE "enhancement_totals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"identified_by" "identity_source" NOT NULL,
	"total_record_id" uuid NOT NULL,
	"nexon_account_id" uuid,
	"character_name" text NOT NULL,
	"history_date" text NOT NULL,
	"enhancement_category" "enhancement_category" NOT NULL,
	"item_key" text,
	"item_name" text NOT NULL,
	"attempts" integer NOT NULL,
	"attempt_cost_meso" bigint NOT NULL,
	"destroy_defence_cost_meso" bigint NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "enhancement_totals_user_record_unique" UNIQUE("user_id","total_record_id")
);
--> statement-breakpoint
ALTER TABLE "enhancement_totals" ADD CONSTRAINT "enhancement_totals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enhancement_totals" ADD CONSTRAINT "enhancement_totals_nexon_account_id_nexon_accounts_id_fk" FOREIGN KEY ("nexon_account_id") REFERENCES "public"."nexon_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "enhancement_totals_category_date_idx" ON "enhancement_totals" USING btree ("enhancement_category","history_date");