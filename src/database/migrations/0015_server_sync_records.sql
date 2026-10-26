-- 보스 처치 · 가계부 기록을 받는 표와 사람 · 넥슨 계정 분리(앱 저장소 ADR-099). users 의 자격 두 칸은 nexon_accounts 로
-- 옮기고 지운다. 두 칸이 다 찬 사람은 계정 두 줄이 된다. 옮긴 뒤에 칸을 지워야 운영 DB 의 사람이 자격을 안 잃는다.
CREATE TYPE "public"."clear_source" AS ENUM('auto', 'manual');--> statement-breakpoint
CREATE TYPE "public"."split_mode" AS ENUM('even', 'ratio');--> statement-breakpoint
CREATE TABLE "boss_clears" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"identified_by" "identity_source" NOT NULL,
	"period_record_id" uuid NOT NULL,
	"ocid" text NOT NULL,
	"boss_difficulty_id" uuid,
	"cycle" "boss_cycle" NOT NULL,
	"period_key" text NOT NULL,
	"world_id" uuid,
	"price_meso" bigint NOT NULL,
	"payout_meso" bigint NOT NULL,
	"split_mode" "split_mode" NOT NULL,
	"party_size" integer NOT NULL,
	"my_share" integer,
	"shares_total" integer,
	"split_fee_percent" integer,
	"defeated_date" text,
	"source" "clear_source" NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "boss_clears_user_record_unique" UNIQUE("user_id","period_record_id"),
	CONSTRAINT "boss_clears_ratio_shares" CHECK (("boss_clears"."split_mode" = 'ratio') = ("boss_clears"."my_share" IS NOT NULL AND "boss_clears"."shares_total" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "nexon_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"identity_source" "identity_source" NOT NULL,
	"nexon_uid" text,
	"api_key_hash" "bytea",
	"account_record_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "nexon_accounts_nexon_uid_unique" UNIQUE("nexon_uid"),
	CONSTRAINT "nexon_accounts_api_key_hash_unique" UNIQUE("api_key_hash"),
	CONSTRAINT "nexon_accounts_user_record_unique" UNIQUE("user_id","account_record_id"),
	CONSTRAINT "nexon_accounts_credential_matches_source" CHECK (("nexon_accounts"."identity_source" = 'login' AND "nexon_accounts"."nexon_uid" IS NOT NULL AND "nexon_accounts"."api_key_hash" IS NULL)
        OR ("nexon_accounts"."identity_source" = 'key' AND "nexon_accounts"."api_key_hash" IS NOT NULL AND "nexon_accounts"."nexon_uid" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "cashbook_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"identified_by" "identity_source" NOT NULL,
	"entry_record_id" uuid NOT NULL,
	"ocid" text,
	"nexon_account_id" uuid,
	"entry_type" "cashbook_entry_type" NOT NULL,
	"category_key" text NOT NULL,
	"entry_date" text NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cashbook_entries_user_record_unique" UNIQUE("user_id","entry_record_id")
);
--> statement-breakpoint
CREATE TABLE "cashbook_entry_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entry_id" uuid NOT NULL,
	"sort_order" integer NOT NULL,
	"item_key" text,
	"item_name" text,
	"form_key" text,
	"item_kind_key" text,
	"quantity" integer,
	"from_level" integer,
	"to_level" integer,
	"amount_meso" bigint,
	"tariff_meso" bigint,
	"sale_fee_percent" integer,
	"sale_fee_meso" bigint,
	"amount_point" bigint,
	"point_per_100m_meso" integer,
	"amount_cash" bigint,
	CONSTRAINT "cashbook_entry_items_entry_order_unique" UNIQUE("entry_id","sort_order")
);
--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT "users_nexon_uid_unique";--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT "users_api_key_hash_unique";--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT "users_identity";--> statement-breakpoint
ALTER TABLE "drop_prices" ADD COLUMN "period_record_id" uuid;--> statement-breakpoint
ALTER TABLE "boss_clears" ADD CONSTRAINT "boss_clears_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boss_clears" ADD CONSTRAINT "boss_clears_boss_difficulty_id_boss_difficulties_id_fk" FOREIGN KEY ("boss_difficulty_id") REFERENCES "public"."boss_difficulties"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boss_clears" ADD CONSTRAINT "boss_clears_world_id_worlds_id_fk" FOREIGN KEY ("world_id") REFERENCES "public"."worlds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nexon_accounts" ADD CONSTRAINT "nexon_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cashbook_entries" ADD CONSTRAINT "cashbook_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cashbook_entries" ADD CONSTRAINT "cashbook_entries_nexon_account_id_nexon_accounts_id_fk" FOREIGN KEY ("nexon_account_id") REFERENCES "public"."nexon_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cashbook_entry_items" ADD CONSTRAINT "cashbook_entry_items_entry_id_cashbook_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."cashbook_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "boss_clears_difficulty_period_idx" ON "boss_clears" USING btree ("boss_difficulty_id","period_key");--> statement-breakpoint
CREATE INDEX "nexon_accounts_user_id_idx" ON "nexon_accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "cashbook_entries_category_date_idx" ON "cashbook_entries" USING btree ("entry_type","category_key","entry_date");--> statement-breakpoint
INSERT INTO "nexon_accounts" ("user_id", "identity_source", "nexon_uid", "created_at", "updated_at")
  SELECT "id", 'login', "nexon_uid", "created_at", "created_at" FROM "users" WHERE "nexon_uid" IS NOT NULL;--> statement-breakpoint
INSERT INTO "nexon_accounts" ("user_id", "identity_source", "api_key_hash", "created_at", "updated_at")
  SELECT "id", 'key', "api_key_hash", "created_at", "created_at" FROM "users" WHERE "api_key_hash" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "nexon_uid";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "api_key_hash";