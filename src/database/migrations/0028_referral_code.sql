CREATE TABLE "referrals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"referred_account_id" uuid NOT NULL,
	"referrer_account_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "referrals_referred_account_id_unique" UNIQUE("referred_account_id"),
	CONSTRAINT "referrals_not_self" CHECK ("referrals"."referred_account_id" <> "referrals"."referrer_account_id")
);
--> statement-breakpoint
ALTER TABLE "nexon_accounts" ADD COLUMN "referral_code" text;--> statement-breakpoint
ALTER TABLE "nexon_accounts" ADD CONSTRAINT "nexon_accounts_referral_code_unique" UNIQUE("referral_code");--> statement-breakpoint
DO $$
DECLARE
	account_id uuid;
	code text;
BEGIN
	FOR account_id IN SELECT "id" FROM "nexon_accounts" WHERE "identity_source" = 'login' LOOP
		LOOP
			SELECT string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + floor(random() * 32)::int, 1), '')
				INTO code FROM generate_series(1, 8);
			EXIT WHEN NOT EXISTS (SELECT 1 FROM "nexon_accounts" WHERE "referral_code" = code);
		END LOOP;
		UPDATE "nexon_accounts" SET "referral_code" = code WHERE "id" = account_id;
	END LOOP;
END $$;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referred_account_id_nexon_accounts_id_fk" FOREIGN KEY ("referred_account_id") REFERENCES "public"."nexon_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referrer_account_id_nexon_accounts_id_fk" FOREIGN KEY ("referrer_account_id") REFERENCES "public"."nexon_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nexon_accounts" ADD CONSTRAINT "nexon_accounts_referral_code_login_only" CHECK (("nexon_accounts"."identity_source" = 'login') = ("nexon_accounts"."referral_code" IS NOT NULL));