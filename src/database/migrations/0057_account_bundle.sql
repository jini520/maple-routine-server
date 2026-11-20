-- 새 DB 의 계정 · 로그인 표는 비어 있다. 옛 마이그레이션이 줄을 넣지 않아 칸과 표를 지우고 새로 만든다. 옮기는 스크립트가 옛 DB 의
-- 줄을 줄 id 그대로 채운다. 키 표(nexon_account_keys)는 1.0.15 에 두지 않는다. 1.0.15 앱은 세션이나 메이플 ID 해시로 사람을
-- 밝힌다(앱 저장소 ADR-099 결정 62).
CREATE TABLE "maple_ids" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nexon_account_id" uuid NOT NULL,
	"hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "maple_ids_hash_unique" UNIQUE("hash")
);
--> statement-breakpoint
CREATE TABLE "sub_account_registrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"login_nexon_account_id" uuid NOT NULL,
	"sub_nexon_account_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sub_account_registrations_sub_nexon_account_id_unique" UNIQUE("sub_nexon_account_id"),
	CONSTRAINT "sub_account_registrations_not_self" CHECK ("sub_account_registrations"."login_nexon_account_id" <> "sub_account_registrations"."sub_nexon_account_id")
);
--> statement-breakpoint
ALTER TABLE "boss_clears" DROP CONSTRAINT "boss_clears_maple_id_nexon_account_maple_ids_maple_id_fk";--> statement-breakpoint
ALTER TABLE "drop_prices" DROP CONSTRAINT "drop_prices_maple_id_nexon_account_maple_ids_maple_id_fk";--> statement-breakpoint
ALTER TABLE "enhancement_totals" DROP CONSTRAINT "enhancement_totals_maple_id_nexon_account_maple_ids_maple_id_fk";--> statement-breakpoint
ALTER TABLE "cashbook_entries" DROP CONSTRAINT "cashbook_entries_maple_id_nexon_account_maple_ids_maple_id_fk";--> statement-breakpoint
ALTER TABLE "nexon_account_keys" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "nexon_account_maple_ids" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sub_accounts" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "nexon_account_keys" CASCADE;--> statement-breakpoint
DROP TABLE "nexon_account_maple_ids" CASCADE;--> statement-breakpoint
DROP TABLE "sub_accounts" CASCADE;--> statement-breakpoint
ALTER TABLE "nexon_accounts" DROP CONSTRAINT "nexon_accounts_nexon_uid_unique";--> statement-breakpoint
ALTER TABLE "nexon_sessions" DROP CONSTRAINT "nexon_sessions_session_hash_unique";--> statement-breakpoint
ALTER TABLE "referrals" DROP CONSTRAINT "referrals_referred_account_id_unique";--> statement-breakpoint
ALTER TABLE "nexon_accounts" DROP CONSTRAINT "nexon_accounts_referral_code_login_only";--> statement-breakpoint
ALTER TABLE "referrals" DROP CONSTRAINT "referrals_not_self";--> statement-breakpoint
ALTER TABLE "referrals" DROP CONSTRAINT "referrals_referred_account_id_nexon_accounts_id_fk";
--> statement-breakpoint
ALTER TABLE "referrals" DROP CONSTRAINT "referrals_referrer_account_id_nexon_accounts_id_fk";
--> statement-breakpoint
ALTER TABLE "nexon_accounts" ADD COLUMN "uid_hash" text;--> statement-breakpoint
ALTER TABLE "nexon_sessions" ADD COLUMN "hash" "bytea" NOT NULL;--> statement-breakpoint
ALTER TABLE "nexon_sessions" ADD COLUMN "sealed_access_token" "bytea" NOT NULL;--> statement-breakpoint
ALTER TABLE "nexon_sessions" ADD COLUMN "sealed_refresh_token" "bytea" NOT NULL;--> statement-breakpoint
ALTER TABLE "referrals" ADD COLUMN "referred_nexon_account_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "referrals" ADD COLUMN "referrer_nexon_account_id" uuid;--> statement-breakpoint
ALTER TABLE "maple_ids" ADD CONSTRAINT "maple_ids_nexon_account_id_nexon_accounts_id_fk" FOREIGN KEY ("nexon_account_id") REFERENCES "public"."nexon_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sub_account_registrations" ADD CONSTRAINT "sub_account_registrations_login_nexon_account_id_nexon_accounts_id_fk" FOREIGN KEY ("login_nexon_account_id") REFERENCES "public"."nexon_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sub_account_registrations" ADD CONSTRAINT "sub_account_registrations_sub_nexon_account_id_nexon_accounts_id_fk" FOREIGN KEY ("sub_nexon_account_id") REFERENCES "public"."nexon_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "maple_ids_nexon_account_id_idx" ON "maple_ids" USING btree ("nexon_account_id");--> statement-breakpoint
CREATE INDEX "sub_account_registrations_login_idx" ON "sub_account_registrations" USING btree ("login_nexon_account_id");--> statement-breakpoint
ALTER TABLE "boss_clears" ADD CONSTRAINT "boss_clears_maple_id_maple_ids_hash_fk" FOREIGN KEY ("maple_id") REFERENCES "public"."maple_ids"("hash") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "drop_prices" ADD CONSTRAINT "drop_prices_maple_id_maple_ids_hash_fk" FOREIGN KEY ("maple_id") REFERENCES "public"."maple_ids"("hash") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "enhancement_totals" ADD CONSTRAINT "enhancement_totals_maple_id_maple_ids_hash_fk" FOREIGN KEY ("maple_id") REFERENCES "public"."maple_ids"("hash") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referred_nexon_account_id_nexon_accounts_id_fk" FOREIGN KEY ("referred_nexon_account_id") REFERENCES "public"."nexon_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referrer_nexon_account_id_nexon_accounts_id_fk" FOREIGN KEY ("referrer_nexon_account_id") REFERENCES "public"."nexon_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cashbook_entries" ADD CONSTRAINT "cashbook_entries_maple_id_maple_ids_hash_fk" FOREIGN KEY ("maple_id") REFERENCES "public"."maple_ids"("hash") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "nexon_accounts" DROP COLUMN "nexon_uid";--> statement-breakpoint
ALTER TABLE "nexon_sessions" DROP COLUMN "session_hash";--> statement-breakpoint
ALTER TABLE "nexon_sessions" DROP COLUMN "access_sealed";--> statement-breakpoint
ALTER TABLE "nexon_sessions" DROP COLUMN "refresh_sealed";--> statement-breakpoint
ALTER TABLE "referrals" DROP COLUMN "referred_account_id";--> statement-breakpoint
ALTER TABLE "referrals" DROP COLUMN "referrer_account_id";--> statement-breakpoint
ALTER TABLE "nexon_accounts" ADD CONSTRAINT "nexon_accounts_uid_hash_unique" UNIQUE("uid_hash");--> statement-breakpoint
ALTER TABLE "nexon_sessions" ADD CONSTRAINT "nexon_sessions_hash_unique" UNIQUE("hash");--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referred_nexon_account_id_unique" UNIQUE("referred_nexon_account_id");--> statement-breakpoint
ALTER TABLE "nexon_accounts" ADD CONSTRAINT "nexon_accounts_referral_code_login_only" CHECK (("nexon_accounts"."uid_hash" IS NOT NULL) = ("nexon_accounts"."referral_code" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_not_self" CHECK ("referrals"."referred_nexon_account_id" <> "referrals"."referrer_nexon_account_id");