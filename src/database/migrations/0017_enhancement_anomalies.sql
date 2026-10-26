-- 앱이 강화 합계에서 빼거나 판정하지 못한 줄의 수를 받는 표(앱 저장소 ADR-102). 운영자가 예상하지 못한 상황을 보는 용도다.
CREATE TYPE "public"."enhancement_anomaly_type" AS ENUM('event_world_unknown', 'no_level', 'no_grade', 'no_star', 'no_type', 'no_cost');--> statement-breakpoint
CREATE TYPE "public"."enhancement_type" AS ENUM('cube', 'starforce', 'potential', 'soul_potential');--> statement-breakpoint
CREATE TABLE "enhancement_anomalies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"identified_by" "identity_source" NOT NULL,
	"history_date" text NOT NULL,
	"enhancement_type" "enhancement_type" NOT NULL,
	"anomaly_type" "enhancement_anomaly_type" NOT NULL,
	"item_key" text,
	"item_name" text NOT NULL,
	"row_count" integer NOT NULL,
	"detail" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "enhancement_anomalies_user_key_unique" UNIQUE("user_id","history_date","enhancement_type","anomaly_type","item_name")
);
--> statement-breakpoint
ALTER TABLE "enhancement_anomalies" ADD CONSTRAINT "enhancement_anomalies_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;