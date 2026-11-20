-- 캐릭터와 캐릭터 · 메이플 ID 에 붙는 기록 표 일곱을 새로 만든다. 운영에 줄이 없는 표라 옮길 줄이 없다(앱 저장소 ADR-099 결정 8 · 20).
-- 기록 표의 변경 번호는 서버 전체에서 하나인 순번이고, 줄을 넣거나 고칠 때마다 트리거가 다음 값을 적는다(결정 9). 쓰는 코드가
-- 번호를 잊으면 다른 기기가 그 줄을 받지 못한다. drizzle 은 트리거를 모르므로 새 기록 표의 마이그레이션마다 손으로 건다.
CREATE TYPE "public"."manual_tracked_type" AS ENUM('daily', 'weekly', 'boss');--> statement-breakpoint
CREATE TYPE "public"."remembered_level_type" AS ENUM('symbol', 'hexa');--> statement-breakpoint
CREATE SEQUENCE "public"."record_change_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE TABLE "character_world_leaps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"character_id" uuid NOT NULL,
	"previous_ocid" text NOT NULL,
	"change_seq" bigint DEFAULT nextval('record_change_seq') NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "character_world_leaps_previous_ocid_unique" UNIQUE("previous_ocid")
);
--> statement-breakpoint
CREATE TABLE "characters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"maple_id" uuid NOT NULL,
	"ocid" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "characters_ocid_unique" UNIQUE("ocid")
);
--> statement-breakpoint
CREATE TABLE "manual_tracked_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"character_id" uuid NOT NULL,
	"type" "manual_tracked_type" NOT NULL,
	"target_id" uuid NOT NULL,
	"change_seq" bigint DEFAULT nextval('record_change_seq') NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "manual_tracked_items_character_type_target_unique" UNIQUE("character_id","type","target_id")
);
--> statement-breakpoint
CREATE TABLE "maple_id_names" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"maple_id" uuid NOT NULL,
	"name" text NOT NULL,
	"change_seq" bigint DEFAULT nextval('record_change_seq') NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "maple_id_names_maple_id_unique" UNIQUE("maple_id")
);
--> statement-breakpoint
CREATE TABLE "mvp_grade_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"maple_id" uuid NOT NULL,
	"from_date" text NOT NULL,
	"grade_id" uuid,
	"change_seq" bigint DEFAULT nextval('record_change_seq') NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mvp_grade_history_maple_id_from_date_unique" UNIQUE("maple_id","from_date")
);
--> statement-breakpoint
CREATE TABLE "remembered_levels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"character_id" uuid NOT NULL,
	"type" "remembered_level_type" NOT NULL,
	"target_id" uuid NOT NULL,
	"level" integer NOT NULL,
	"change_seq" bigint DEFAULT nextval('record_change_seq') NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "remembered_levels_character_type_target_unique" UNIQUE("character_id","type","target_id")
);
--> statement-breakpoint
CREATE TABLE "representative_character_motions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"character_id" uuid NOT NULL,
	"actions" text[] NOT NULL,
	"emotions" text[] NOT NULL,
	"duration_ms" integer NOT NULL,
	"rests_between_actions" boolean NOT NULL,
	"change_seq" bigint DEFAULT nextval('record_change_seq') NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "representative_character_motions_character_id_unique" UNIQUE("character_id")
);
--> statement-breakpoint
CREATE TABLE "shared_content_progress" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"maple_id" uuid NOT NULL,
	"world_id" uuid,
	"content_id" uuid NOT NULL,
	"is_registered" boolean NOT NULL,
	"now_count" integer,
	"max_count" integer,
	"quest_state" smallint,
	"period_code" text NOT NULL,
	"change_seq" bigint DEFAULT nextval('record_change_seq') NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shared_content_progress_maple_id_world_content_unique" UNIQUE NULLS NOT DISTINCT("maple_id","world_id","content_id")
);
--> statement-breakpoint
ALTER TABLE "character_world_leaps" ADD CONSTRAINT "character_world_leaps_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "characters" ADD CONSTRAINT "characters_maple_id_maple_ids_id_fk" FOREIGN KEY ("maple_id") REFERENCES "public"."maple_ids"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manual_tracked_items" ADD CONSTRAINT "manual_tracked_items_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maple_id_names" ADD CONSTRAINT "maple_id_names_maple_id_maple_ids_id_fk" FOREIGN KEY ("maple_id") REFERENCES "public"."maple_ids"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mvp_grade_history" ADD CONSTRAINT "mvp_grade_history_maple_id_maple_ids_id_fk" FOREIGN KEY ("maple_id") REFERENCES "public"."maple_ids"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mvp_grade_history" ADD CONSTRAINT "mvp_grade_history_grade_id_mvp_grades_id_fk" FOREIGN KEY ("grade_id") REFERENCES "public"."mvp_grades"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remembered_levels" ADD CONSTRAINT "remembered_levels_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "representative_character_motions" ADD CONSTRAINT "representative_character_motions_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_content_progress" ADD CONSTRAINT "shared_content_progress_maple_id_maple_ids_id_fk" FOREIGN KEY ("maple_id") REFERENCES "public"."maple_ids"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_content_progress" ADD CONSTRAINT "shared_content_progress_world_id_worlds_id_fk" FOREIGN KEY ("world_id") REFERENCES "public"."worlds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_content_progress" ADD CONSTRAINT "shared_content_progress_content_id_contents_id_fk" FOREIGN KEY ("content_id") REFERENCES "public"."contents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "character_world_leaps_character_id_idx" ON "character_world_leaps" USING btree ("character_id");--> statement-breakpoint
CREATE INDEX "characters_maple_id_idx" ON "characters" USING btree ("maple_id");--> statement-breakpoint
CREATE FUNCTION "bump_change_seq"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.change_seq := nextval('record_change_seq');
  RETURN NEW;
END
$$;--> statement-breakpoint
CREATE TRIGGER "character_world_leaps_change_seq" BEFORE INSERT OR UPDATE ON "character_world_leaps" FOR EACH ROW EXECUTE FUNCTION "bump_change_seq"();--> statement-breakpoint
CREATE TRIGGER "manual_tracked_items_change_seq" BEFORE INSERT OR UPDATE ON "manual_tracked_items" FOR EACH ROW EXECUTE FUNCTION "bump_change_seq"();--> statement-breakpoint
CREATE TRIGGER "maple_id_names_change_seq" BEFORE INSERT OR UPDATE ON "maple_id_names" FOR EACH ROW EXECUTE FUNCTION "bump_change_seq"();--> statement-breakpoint
CREATE TRIGGER "mvp_grade_history_change_seq" BEFORE INSERT OR UPDATE ON "mvp_grade_history" FOR EACH ROW EXECUTE FUNCTION "bump_change_seq"();--> statement-breakpoint
CREATE TRIGGER "remembered_levels_change_seq" BEFORE INSERT OR UPDATE ON "remembered_levels" FOR EACH ROW EXECUTE FUNCTION "bump_change_seq"();--> statement-breakpoint
CREATE TRIGGER "representative_character_motions_change_seq" BEFORE INSERT OR UPDATE ON "representative_character_motions" FOR EACH ROW EXECUTE FUNCTION "bump_change_seq"();--> statement-breakpoint
CREATE TRIGGER "shared_content_progress_change_seq" BEFORE INSERT OR UPDATE ON "shared_content_progress" FOR EACH ROW EXECUTE FUNCTION "bump_change_seq"();
