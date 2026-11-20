-- 보스 기록 표 넷을 1.0.15 의 칸으로 만든다(앱 저장소 ADR-099 결정 8 · 19 · 22 · 25 · 26 · 29). 처치 표(boss_clears)는
-- 수익 건 표로 바꾸고, 드롭 판매가 표(drop_prices)는 시세가 읽는 칸만 남긴 판매가 표로 바꾼다. 새 DB 의 두 표는 비어 있어
-- 지우고 새로 만든다. 옛 판매가 줄은 옮기는 스크립트가 채우고, 옛 처치 표는 운영에 줄이 없어 옮기지 않는다.
-- 수익 건의 난이도 · 보스 참조가 기댈 유일 제약을 그 참조보다 먼저 건다. 변경 번호 트리거는 0060 의 머리와 같은 이유다.
CREATE TYPE "public"."clear_recorded_by" AS ENUM('auto', 'manual');--> statement-breakpoint
CREATE TYPE "public"."drop_price_status" AS ENUM('pending', 'entered', 'skipped');--> statement-breakpoint
CREATE TABLE "boss_drops" (
	"id" uuid PRIMARY KEY NOT NULL,
	"profit_entry_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"category" "drop_category" NOT NULL,
	"price_status" "drop_price_status" NOT NULL,
	"sale_price_meso" bigint,
	"sale_received_meso" bigint,
	"priced_at" timestamp with time zone,
	"sale_fee_percent" integer,
	"sale_fee_follows_mvp_grade" boolean NOT NULL,
	"split_type" "split_type",
	"party_size" integer,
	"split_share_millipercent" integer,
	"split_fee_percent" integer,
	"split_fee_follows_mvp_grade" boolean NOT NULL,
	"change_seq" bigint DEFAULT nextval('record_change_seq') NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "boss_drops_price_check" CHECK (("boss_drops"."price_status" = 'entered') = ("boss_drops"."sale_price_meso" IS NOT NULL)
          AND ("boss_drops"."sale_price_meso" IS NULL) = ("boss_drops"."sale_received_meso" IS NULL)
          AND ("boss_drops"."sale_price_meso" IS NULL) = ("boss_drops"."priced_at" IS NULL)),
	CONSTRAINT "boss_drops_split_check" CHECK ("boss_drops"."split_type" IS DISTINCT FROM 'excluded' AND "boss_drops"."split_share_millipercent" BETWEEN 0 AND 100000)
);
--> statement-breakpoint
CREATE TABLE "boss_profit_entries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"character_id" uuid NOT NULL,
	"boss_id" uuid NOT NULL,
	"boss_difficulty_id" uuid NOT NULL,
	"period_code" text NOT NULL,
	"world_id" uuid,
	"crystal_price_meso" bigint,
	"crystal_received_meso" bigint,
	"split_type" "split_type",
	"party_size" integer,
	"split_share_millipercent" integer,
	"split_fee_percent" integer,
	"split_fee_follows_mvp_grade" boolean NOT NULL,
	"cleared_date" date,
	"clear_recorded_by" "clear_recorded_by",
	"change_seq" bigint DEFAULT nextval('record_change_seq') NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "boss_profit_entries_cleared_check" CHECK (("boss_profit_entries"."clear_recorded_by" IS NULL) = ("boss_profit_entries"."crystal_price_meso" IS NULL)
          AND ("boss_profit_entries"."clear_recorded_by" IS NULL) = ("boss_profit_entries"."crystal_received_meso" IS NULL)),
	CONSTRAINT "boss_profit_entries_split_check" CHECK (("boss_profit_entries"."split_type" IS DISTINCT FROM 'excluded'
            OR ("boss_profit_entries"."party_size" IS NULL AND "boss_profit_entries"."split_share_millipercent" IS NULL))
          AND "boss_profit_entries"."split_share_millipercent" BETWEEN 0 AND 100000),
	CONSTRAINT "boss_profit_entries_fee_check" CHECK (CASE WHEN "boss_profit_entries"."clear_recorded_by" IS NOT NULL
               THEN "boss_profit_entries"."split_type" IS DISTINCT FROM 'ratio' OR "boss_profit_entries"."split_fee_percent" IS NOT NULL
               ELSE ("boss_profit_entries"."split_fee_follows_mvp_grade" = ("boss_profit_entries"."split_fee_percent" IS NULL)) END)
);
--> statement-breakpoint
CREATE TABLE "boss_split_settings" (
	"id" uuid PRIMARY KEY NOT NULL,
	"character_id" uuid NOT NULL,
	"boss_difficulty_id" uuid NOT NULL,
	"split_type" "split_type" NOT NULL,
	"party_size" integer,
	"split_share_millipercent" integer,
	"split_fee_percent" integer,
	"split_fee_follows_mvp_grade" boolean NOT NULL,
	"change_seq" bigint DEFAULT nextval('record_change_seq') NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "boss_split_settings_split_check" CHECK (("boss_split_settings"."split_type" <> 'excluded' OR ("boss_split_settings"."party_size" IS NULL AND "boss_split_settings"."split_share_millipercent" IS NULL))
          AND "boss_split_settings"."split_share_millipercent" BETWEEN 0 AND 100000),
	CONSTRAINT "boss_split_settings_fee_check" CHECK ("boss_split_settings"."split_fee_follows_mvp_grade" = ("boss_split_settings"."split_fee_percent" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "drop_sale_prices" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid,
	"item_id" uuid NOT NULL,
	"world_id" uuid,
	"sale_price_meso" bigint NOT NULL,
	"priced_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "boss_clears" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "drop_prices" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "boss_clears" CASCADE;--> statement-breakpoint
DROP TABLE "drop_prices" CASCADE;--> statement-breakpoint
ALTER TABLE "boss_difficulties" ADD CONSTRAINT "boss_difficulties_id_boss_unique" UNIQUE("id","boss_id");--> statement-breakpoint
ALTER TABLE "boss_drops" ADD CONSTRAINT "boss_drops_profit_entry_id_boss_profit_entries_id_fk" FOREIGN KEY ("profit_entry_id") REFERENCES "public"."boss_profit_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boss_drops" ADD CONSTRAINT "boss_drops_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boss_profit_entries" ADD CONSTRAINT "boss_profit_entries_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boss_profit_entries" ADD CONSTRAINT "boss_profit_entries_boss_id_bosses_id_fk" FOREIGN KEY ("boss_id") REFERENCES "public"."bosses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boss_profit_entries" ADD CONSTRAINT "boss_profit_entries_world_id_worlds_id_fk" FOREIGN KEY ("world_id") REFERENCES "public"."worlds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boss_profit_entries" ADD CONSTRAINT "boss_profit_entries_difficulty_boss_fk" FOREIGN KEY ("boss_difficulty_id","boss_id") REFERENCES "public"."boss_difficulties"("id","boss_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boss_split_settings" ADD CONSTRAINT "boss_split_settings_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boss_split_settings" ADD CONSTRAINT "boss_split_settings_boss_difficulty_id_boss_difficulties_id_fk" FOREIGN KEY ("boss_difficulty_id") REFERENCES "public"."boss_difficulties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drop_sale_prices" ADD CONSTRAINT "drop_sale_prices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drop_sale_prices" ADD CONSTRAINT "drop_sale_prices_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drop_sale_prices" ADD CONSTRAINT "drop_sale_prices_world_id_worlds_id_fk" FOREIGN KEY ("world_id") REFERENCES "public"."worlds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "boss_drops_entry_item_unique" ON "boss_drops" USING btree ("profit_entry_id","item_id") WHERE "boss_drops"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "boss_profit_entries_character_difficulty_period_unique" ON "boss_profit_entries" USING btree ("character_id","boss_difficulty_id","period_code") WHERE "boss_profit_entries"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "boss_profit_entries_cleared_character_boss_period_unique" ON "boss_profit_entries" USING btree ("character_id","boss_id","period_code") WHERE "boss_profit_entries"."clear_recorded_by" IS NOT NULL AND "boss_profit_entries"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "boss_split_settings_character_difficulty_unique" ON "boss_split_settings" USING btree ("character_id","boss_difficulty_id") WHERE "boss_split_settings"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "drop_sale_prices_priced_at_idx" ON "drop_sale_prices" USING btree ("priced_at");--> statement-breakpoint
CREATE INDEX "drop_sale_prices_user_id_idx" ON "drop_sale_prices" USING btree ("user_id");--> statement-breakpoint
DROP TYPE "public"."clear_source";--> statement-breakpoint
DROP TYPE "public"."drop_record_status";--> statement-breakpoint
DROP TYPE "public"."split_mode";--> statement-breakpoint
CREATE TRIGGER "boss_profit_entries_change_seq" BEFORE INSERT OR UPDATE ON "boss_profit_entries" FOR EACH ROW EXECUTE FUNCTION "bump_change_seq"();--> statement-breakpoint
CREATE TRIGGER "boss_drops_change_seq" BEFORE INSERT OR UPDATE ON "boss_drops" FOR EACH ROW EXECUTE FUNCTION "bump_change_seq"();--> statement-breakpoint
CREATE TRIGGER "boss_split_settings_change_seq" BEFORE INSERT OR UPDATE ON "boss_split_settings" FOR EACH ROW EXECUTE FUNCTION "bump_change_seq"();
