CREATE TABLE "nexon_account_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nexon_account_id" uuid NOT NULL,
	"api_key_hash" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "nexon_account_keys_api_key_hash_unique" UNIQUE("api_key_hash")
);
--> statement-breakpoint
CREATE TABLE "nexon_account_maple_ids" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nexon_account_id" uuid NOT NULL,
	"maple_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "nexon_account_maple_ids_maple_id_unique" UNIQUE("maple_id")
);
--> statement-breakpoint
CREATE TABLE "sub_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"login_account_id" uuid NOT NULL,
	"sub_account_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sub_accounts_sub_account_id_unique" UNIQUE("sub_account_id"),
	CONSTRAINT "sub_accounts_not_self" CHECK ("sub_accounts"."login_account_id" <> "sub_accounts"."sub_account_id")
);
--> statement-breakpoint
ALTER TABLE "enhancement_anomalies" DROP CONSTRAINT "enhancement_anomalies_user_key_unique";--> statement-breakpoint
ALTER TABLE "nexon_accounts" DROP CONSTRAINT "nexon_accounts_api_key_hash_unique";--> statement-breakpoint
ALTER TABLE "nexon_accounts" DROP CONSTRAINT "nexon_accounts_credential_matches_source";--> statement-breakpoint
ALTER TABLE "nexon_accounts" DROP CONSTRAINT "nexon_accounts_referral_code_login_only";--> statement-breakpoint
ALTER TABLE "enhancement_anomalies" ADD COLUMN "nexon_account_id" uuid;--> statement-breakpoint
ALTER TABLE "nexon_account_keys" ADD CONSTRAINT "nexon_account_keys_nexon_account_id_nexon_accounts_id_fk" FOREIGN KEY ("nexon_account_id") REFERENCES "public"."nexon_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nexon_account_maple_ids" ADD CONSTRAINT "nexon_account_maple_ids_nexon_account_id_nexon_accounts_id_fk" FOREIGN KEY ("nexon_account_id") REFERENCES "public"."nexon_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sub_accounts" ADD CONSTRAINT "sub_accounts_login_account_id_nexon_accounts_id_fk" FOREIGN KEY ("login_account_id") REFERENCES "public"."nexon_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sub_accounts" ADD CONSTRAINT "sub_accounts_sub_account_id_nexon_accounts_id_fk" FOREIGN KEY ("sub_account_id") REFERENCES "public"."nexon_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "nexon_account_keys_account_idx" ON "nexon_account_keys" USING btree ("nexon_account_id");--> statement-breakpoint
CREATE INDEX "nexon_account_maple_ids_account_idx" ON "nexon_account_maple_ids" USING btree ("nexon_account_id");--> statement-breakpoint
CREATE INDEX "sub_accounts_login_idx" ON "sub_accounts" USING btree ("login_account_id");--> statement-breakpoint
ALTER TABLE "enhancement_anomalies" ADD CONSTRAINT "enhancement_anomalies_nexon_account_id_nexon_accounts_id_fk" FOREIGN KEY ("nexon_account_id") REFERENCES "public"."nexon_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- 키 해시를 키 표로 옮긴다. 줄 id 는 그대로라 키만 가진 사람의 줄은 넥슨 계정 줄로 남는다.
INSERT INTO "nexon_account_keys" ("nexon_account_id", "api_key_hash", "created_at")
SELECT "id", "api_key_hash", "created_at" FROM "nexon_accounts" WHERE "api_key_hash" IS NOT NULL;--> statement-breakpoint
-- 로그인 밑의 키 줄은 앱이 메이플 ID 가 같은 것을 확인하고 보낸 키(api-key-links)로만 들어와 같은 넥슨 ID 다.
-- 키와 그 줄을 가리키는 칸을 로그인 줄로 옮기고 키 줄을 지운다.
UPDATE "nexon_account_keys" k SET "nexon_account_id" = l."id"
  FROM "nexon_accounts" kr JOIN "nexon_accounts" l ON l."user_id" = kr."user_id" AND l."nexon_uid" IS NOT NULL
 WHERE k."nexon_account_id" = kr."id" AND kr."nexon_uid" IS NULL;--> statement-breakpoint
UPDATE "cashbook_entries" e SET "nexon_account_id" = l."id"
  FROM "nexon_accounts" kr JOIN "nexon_accounts" l ON l."user_id" = kr."user_id" AND l."nexon_uid" IS NOT NULL
 WHERE e."nexon_account_id" = kr."id" AND kr."nexon_uid" IS NULL;--> statement-breakpoint
UPDATE "enhancement_totals" e SET "nexon_account_id" = l."id"
  FROM "nexon_accounts" kr JOIN "nexon_accounts" l ON l."user_id" = kr."user_id" AND l."nexon_uid" IS NOT NULL
 WHERE e."nexon_account_id" = kr."id" AND kr."nexon_uid" IS NULL;--> statement-breakpoint
DELETE FROM "nexon_accounts" kr USING "nexon_accounts" l
 WHERE kr."user_id" = l."user_id" AND l."nexon_uid" IS NOT NULL AND kr."nexon_uid" IS NULL;--> statement-breakpoint
-- 강화 이상 보고는 그 사람의 넥슨 계정 줄이 하나일 때만 어느 계정의 것인지 고를 수 있다.
UPDATE "enhancement_anomalies" a SET "nexon_account_id" = n."id"
  FROM "nexon_accounts" n
 WHERE n."user_id" = a."user_id"
   AND (SELECT count(*) FROM "nexon_accounts" c WHERE c."user_id" = a."user_id") = 1;--> statement-breakpoint
ALTER TABLE "nexon_accounts" DROP COLUMN "identity_source";--> statement-breakpoint
ALTER TABLE "nexon_accounts" DROP COLUMN "api_key_hash";--> statement-breakpoint
ALTER TABLE "enhancement_anomalies" ADD CONSTRAINT "enhancement_anomalies_account_key_unique" UNIQUE("nexon_account_id","history_date","enhancement_type","anomaly_type","item_name");--> statement-breakpoint
ALTER TABLE "nexon_accounts" ADD CONSTRAINT "nexon_accounts_referral_code_login_only" CHECK (("nexon_accounts"."nexon_uid" IS NOT NULL) = ("nexon_accounts"."referral_code" IS NOT NULL));