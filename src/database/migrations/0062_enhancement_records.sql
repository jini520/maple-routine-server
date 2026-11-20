-- 강화 합계를 1.0.15 의 칸으로 바꾸고 굳은 날 표를 만든다(앱 저장소 ADR-099 결정 11 · 37 · 55). 새 DB 의 강화 합계는 비어 있다.
-- 운영에 줄이 없어 옮기지 않고, 옮기는 스크립트가 옛 표에 줄이 있으면 멈춘다. 변경 번호 트리거는 0060 의 머리와 같은 이유다.
CREATE TABLE "enhancement_settled_days" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nexon_account_id" uuid NOT NULL,
	"api_type" "enhancement_api_type" NOT NULL,
	"history_date" text NOT NULL,
	"change_seq" bigint DEFAULT nextval('record_change_seq') NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "enhancement_settled_days_account_api_date_unique" UNIQUE("nexon_account_id","api_type","history_date")
);
--> statement-breakpoint
ALTER TABLE "enhancement_totals" DROP CONSTRAINT "enhancement_totals_same_total_unique";--> statement-breakpoint
ALTER TABLE "enhancement_totals" DROP CONSTRAINT "enhancement_totals_maple_id_maple_ids_hash_fk";
--> statement-breakpoint
DROP INDEX "enhancement_totals_category_date_idx";--> statement-breakpoint
ALTER TABLE "enhancement_totals" ALTER COLUMN "id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "enhancement_totals" ADD COLUMN "character_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "enhancement_totals" ADD COLUMN "category" "enhancement_category" NOT NULL;--> statement-breakpoint
ALTER TABLE "enhancement_totals" ADD COLUMN "attempt_count" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "enhancement_totals" ADD COLUMN "world_id" uuid;--> statement-breakpoint
ALTER TABLE "enhancement_totals" ADD COLUMN "superior_cost_meso" bigint;--> statement-breakpoint
ALTER TABLE "enhancement_totals" ADD COLUMN "from_star" integer;--> statement-breakpoint
ALTER TABLE "enhancement_totals" ADD COLUMN "to_star" integer;--> statement-breakpoint
ALTER TABLE "enhancement_totals" ADD COLUMN "is_event_world" boolean;--> statement-breakpoint
ALTER TABLE "enhancement_totals" ADD COLUMN "change_seq" bigint DEFAULT nextval('record_change_seq') NOT NULL;--> statement-breakpoint
ALTER TABLE "enhancement_settled_days" ADD CONSTRAINT "enhancement_settled_days_nexon_account_id_nexon_accounts_id_fk" FOREIGN KEY ("nexon_account_id") REFERENCES "public"."nexon_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enhancement_totals" ADD CONSTRAINT "enhancement_totals_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enhancement_totals" ADD CONSTRAINT "enhancement_totals_world_id_worlds_id_fk" FOREIGN KEY ("world_id") REFERENCES "public"."worlds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enhancement_totals" DROP COLUMN "identified_by";--> statement-breakpoint
ALTER TABLE "enhancement_totals" DROP COLUMN "total_record_id";--> statement-breakpoint
ALTER TABLE "enhancement_totals" DROP COLUMN "maple_id";--> statement-breakpoint
ALTER TABLE "enhancement_totals" DROP COLUMN "ocid";--> statement-breakpoint
ALTER TABLE "enhancement_totals" DROP COLUMN "enhancement_category";--> statement-breakpoint
ALTER TABLE "enhancement_totals" DROP COLUMN "item_key";--> statement-breakpoint
ALTER TABLE "enhancement_totals" DROP COLUMN "item_group";--> statement-breakpoint
ALTER TABLE "enhancement_totals" DROP COLUMN "attempts";--> statement-breakpoint
ALTER TABLE "enhancement_totals" ADD CONSTRAINT "enhancement_totals_character_date_category_item_unique" UNIQUE("character_id","history_date","category","item_name");--> statement-breakpoint
CREATE TRIGGER "enhancement_totals_change_seq" BEFORE INSERT OR UPDATE ON "enhancement_totals" FOR EACH ROW EXECUTE FUNCTION "bump_change_seq"();--> statement-breakpoint
CREATE TRIGGER "enhancement_settled_days_change_seq" BEFORE INSERT OR UPDATE ON "enhancement_settled_days" FOR EACH ROW EXECUTE FUNCTION "bump_change_seq"();
