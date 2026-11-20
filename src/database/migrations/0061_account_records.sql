-- 넥슨 계정 줄에 붙는 기록 표 아홉을 새로 만든다. 운영에 줄이 없는 표라 옮길 줄이 없다(앱 저장소 ADR-099 결정 57).
-- 변경 번호 칸을 가진 표에 트리거를 건다. 0060 의 머리와 같은 이유다.
CREATE TYPE "public"."appointment_schedule_type" AS ENUM('once', 'weekly');--> statement-breakpoint
CREATE TYPE "public"."split_type" AS ENUM('even', 'ratio', 'excluded');--> statement-breakpoint
CREATE TYPE "public"."tracking_type" AS ENUM('auto', 'manual');--> statement-breakpoint
CREATE TABLE "account_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nexon_account_id" uuid NOT NULL,
	"tracking_type" "tracking_type",
	"quick_link_row_count" smallint,
	"quick_link_keys" text[],
	"bar_group_keys" text[],
	"stats_cumulative_start_date" text,
	"is_mvp_weekly_check_off" boolean DEFAULT false NOT NULL,
	"mvp_last_checked_week_code" text,
	"is_mvp_bulk_apply_asked" boolean DEFAULT false NOT NULL,
	"change_seq" bigint DEFAULT nextval('record_change_seq') NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_settings_nexon_account_id_unique" UNIQUE("nexon_account_id")
);
--> statement-breakpoint
CREATE TABLE "boss_profit_calculator_record_bosses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"record_character_id" uuid NOT NULL,
	"boss_difficulty_id" uuid NOT NULL,
	"split_type" "split_type" NOT NULL,
	"party_size" integer NOT NULL,
	"split_share_millipercent" integer,
	"split_fee_percent" integer,
	"split_fee_follows_mvp_grade" boolean NOT NULL,
	CONSTRAINT "boss_profit_calculator_record_bosses_character_difficulty_unique" UNIQUE("record_character_id","boss_difficulty_id"),
	CONSTRAINT "boss_profit_calculator_record_bosses_split_type_check" CHECK ("boss_profit_calculator_record_bosses"."split_type" <> 'excluded'),
	CONSTRAINT "boss_profit_calculator_record_bosses_share_check" CHECK ("boss_profit_calculator_record_bosses"."split_share_millipercent" BETWEEN 0 AND 100000)
);
--> statement-breakpoint
CREATE TABLE "boss_profit_calculator_record_characters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"record_id" uuid NOT NULL,
	"sort_order" integer NOT NULL,
	"character_id" uuid NOT NULL,
	CONSTRAINT "boss_profit_calculator_record_characters_record_order_unique" UNIQUE("record_id","sort_order")
);
--> statement-breakpoint
CREATE TABLE "boss_profit_calculator_records" (
	"id" uuid PRIMARY KEY NOT NULL,
	"nexon_account_id" uuid NOT NULL,
	"saved_at" timestamp with time zone NOT NULL,
	"change_seq" bigint DEFAULT nextval('record_change_seq') NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bottom_bar_sub_page_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nexon_account_id" uuid NOT NULL,
	"group_key" text NOT NULL,
	"sub_page_keys" text[] NOT NULL,
	"change_seq" bigint DEFAULT nextval('record_change_seq') NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bottom_bar_sub_page_orders_account_group_unique" UNIQUE("nexon_account_id","group_key")
);
--> statement-breakpoint
CREATE TABLE "party_appointment_bosses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"appointment_id" uuid NOT NULL,
	"exception_id" uuid,
	"sort_order" integer NOT NULL,
	"boss_difficulty_id" uuid NOT NULL,
	"character_id" uuid NOT NULL,
	CONSTRAINT "party_appointment_bosses_appointment_exception_order_unique" UNIQUE NULLS NOT DISTINCT("appointment_id","exception_id","sort_order")
);
--> statement-breakpoint
CREATE TABLE "party_appointment_exceptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"appointment_id" uuid NOT NULL,
	"week_code" text NOT NULL,
	"date" text NOT NULL,
	"time" text NOT NULL,
	"duration_minutes" integer NOT NULL,
	"alarm_minutes_before" integer,
	CONSTRAINT "party_appointment_exceptions_appointment_week_unique" UNIQUE("appointment_id","week_code")
);
--> statement-breakpoint
CREATE TABLE "party_appointments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"nexon_account_id" uuid NOT NULL,
	"time" text NOT NULL,
	"duration_minutes" integer NOT NULL,
	"alarm_minutes_before" integer,
	"schedule_type" "appointment_schedule_type" NOT NULL,
	"date" text,
	"weekday" smallint,
	"from_week_code" text,
	"until_week_code" text,
	"memo" text,
	"change_seq" bigint DEFAULT nextval('record_change_seq') NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "party_appointments_schedule_check" CHECK (("party_appointments"."schedule_type" = 'once' AND "party_appointments"."date" IS NOT NULL AND "party_appointments"."weekday" IS NULL
             AND "party_appointments"."from_week_code" IS NULL AND "party_appointments"."until_week_code" IS NULL)
          OR ("party_appointments"."schedule_type" = 'weekly' AND "party_appointments"."date" IS NULL AND "party_appointments"."weekday" IS NOT NULL
             AND "party_appointments"."from_week_code" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "tracked_characters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nexon_account_id" uuid NOT NULL,
	"character_id" uuid NOT NULL,
	"sort_order" integer NOT NULL,
	"is_representative" boolean NOT NULL,
	"change_seq" bigint DEFAULT nextval('record_change_seq') NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tracked_characters_account_character_unique" UNIQUE("nexon_account_id","character_id")
);
--> statement-breakpoint
ALTER TABLE "account_settings" ADD CONSTRAINT "account_settings_nexon_account_id_nexon_accounts_id_fk" FOREIGN KEY ("nexon_account_id") REFERENCES "public"."nexon_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boss_profit_calculator_record_bosses" ADD CONSTRAINT "boss_profit_calculator_record_bosses_record_character_id_boss_profit_calculator_record_characters_id_fk" FOREIGN KEY ("record_character_id") REFERENCES "public"."boss_profit_calculator_record_characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boss_profit_calculator_record_bosses" ADD CONSTRAINT "boss_profit_calculator_record_bosses_boss_difficulty_id_boss_difficulties_id_fk" FOREIGN KEY ("boss_difficulty_id") REFERENCES "public"."boss_difficulties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boss_profit_calculator_record_characters" ADD CONSTRAINT "boss_profit_calculator_record_characters_record_id_boss_profit_calculator_records_id_fk" FOREIGN KEY ("record_id") REFERENCES "public"."boss_profit_calculator_records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boss_profit_calculator_record_characters" ADD CONSTRAINT "boss_profit_calculator_record_characters_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boss_profit_calculator_records" ADD CONSTRAINT "boss_profit_calculator_records_nexon_account_id_nexon_accounts_id_fk" FOREIGN KEY ("nexon_account_id") REFERENCES "public"."nexon_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bottom_bar_sub_page_orders" ADD CONSTRAINT "bottom_bar_sub_page_orders_nexon_account_id_nexon_accounts_id_fk" FOREIGN KEY ("nexon_account_id") REFERENCES "public"."nexon_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "party_appointment_bosses" ADD CONSTRAINT "party_appointment_bosses_appointment_id_party_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."party_appointments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "party_appointment_bosses" ADD CONSTRAINT "party_appointment_bosses_exception_id_party_appointment_exceptions_id_fk" FOREIGN KEY ("exception_id") REFERENCES "public"."party_appointment_exceptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "party_appointment_bosses" ADD CONSTRAINT "party_appointment_bosses_boss_difficulty_id_boss_difficulties_id_fk" FOREIGN KEY ("boss_difficulty_id") REFERENCES "public"."boss_difficulties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "party_appointment_bosses" ADD CONSTRAINT "party_appointment_bosses_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "party_appointment_exceptions" ADD CONSTRAINT "party_appointment_exceptions_appointment_id_party_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."party_appointments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "party_appointments" ADD CONSTRAINT "party_appointments_nexon_account_id_nexon_accounts_id_fk" FOREIGN KEY ("nexon_account_id") REFERENCES "public"."nexon_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracked_characters" ADD CONSTRAINT "tracked_characters_nexon_account_id_nexon_accounts_id_fk" FOREIGN KEY ("nexon_account_id") REFERENCES "public"."nexon_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracked_characters" ADD CONSTRAINT "tracked_characters_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "boss_profit_calculator_records_nexon_account_id_idx" ON "boss_profit_calculator_records" USING btree ("nexon_account_id");--> statement-breakpoint
CREATE INDEX "party_appointments_nexon_account_id_idx" ON "party_appointments" USING btree ("nexon_account_id");--> statement-breakpoint
CREATE TRIGGER "account_settings_change_seq" BEFORE INSERT OR UPDATE ON "account_settings" FOR EACH ROW EXECUTE FUNCTION "bump_change_seq"();--> statement-breakpoint
CREATE TRIGGER "bottom_bar_sub_page_orders_change_seq" BEFORE INSERT OR UPDATE ON "bottom_bar_sub_page_orders" FOR EACH ROW EXECUTE FUNCTION "bump_change_seq"();--> statement-breakpoint
CREATE TRIGGER "tracked_characters_change_seq" BEFORE INSERT OR UPDATE ON "tracked_characters" FOR EACH ROW EXECUTE FUNCTION "bump_change_seq"();--> statement-breakpoint
CREATE TRIGGER "party_appointments_change_seq" BEFORE INSERT OR UPDATE ON "party_appointments" FOR EACH ROW EXECUTE FUNCTION "bump_change_seq"();--> statement-breakpoint
CREATE TRIGGER "boss_profit_calculator_records_change_seq" BEFORE INSERT OR UPDATE ON "boss_profit_calculator_records" FOR EACH ROW EXECUTE FUNCTION "bump_change_seq"();
