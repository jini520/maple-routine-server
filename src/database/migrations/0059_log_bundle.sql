-- 새 DB 의 로그 표는 비어 있다. 두 표에서 신원 종류(identified_by)를 걷고, 강화 이상 보고는 사람 칸과 장비 key 를 걷고 칸 · enum
-- 이름을 바꾼다. 한 줄의 기준에 상세를 넣는다. 옮기는 스크립트가 옛 DB 의 줄을 채운다(앱 저장소 ADR-099 결정 8 · 61).
CREATE TYPE "public"."enhancement_anomaly_reason" AS ENUM('event_world_unknown', 'no_level', 'no_grade', 'no_star', 'no_type', 'no_cost');--> statement-breakpoint
CREATE TYPE "public"."enhancement_api_type" AS ENUM('cube', 'starforce', 'potential', 'soul_potential');--> statement-breakpoint
ALTER TABLE "enhancement_anomalies" DROP CONSTRAINT "enhancement_anomalies_account_key_unique";--> statement-breakpoint
ALTER TABLE "enhancement_anomalies" DROP CONSTRAINT "enhancement_anomalies_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "enhancement_anomalies" ADD COLUMN "api_type" "enhancement_api_type" NOT NULL;--> statement-breakpoint
ALTER TABLE "enhancement_anomalies" ADD COLUMN "reason" "enhancement_anomaly_reason" NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "enhancement_anomalies_account_key_unique" ON "enhancement_anomalies" USING btree ("nexon_account_id","history_date","api_type","reason","item_name",coalesce("detail", '')) WHERE "enhancement_anomalies"."nexon_account_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "enhancement_anomalies" DROP COLUMN "user_id";--> statement-breakpoint
ALTER TABLE "enhancement_anomalies" DROP COLUMN "identified_by";--> statement-breakpoint
ALTER TABLE "enhancement_anomalies" DROP COLUMN "enhancement_type";--> statement-breakpoint
ALTER TABLE "enhancement_anomalies" DROP COLUMN "anomaly_type";--> statement-breakpoint
ALTER TABLE "enhancement_anomalies" DROP COLUMN "item_key";--> statement-breakpoint
ALTER TABLE "usage_events" DROP COLUMN "identified_by";--> statement-breakpoint
DROP TYPE "public"."enhancement_anomaly_type";--> statement-breakpoint
DROP TYPE "public"."enhancement_type";