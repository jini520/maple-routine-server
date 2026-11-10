ALTER TABLE "boss_clears" DROP CONSTRAINT "boss_clears_user_record_unique";--> statement-breakpoint
ALTER TABLE "enhancement_totals" DROP CONSTRAINT "enhancement_totals_user_record_unique";--> statement-breakpoint
ALTER TABLE "nexon_accounts" DROP CONSTRAINT "nexon_accounts_user_record_unique";--> statement-breakpoint
ALTER TABLE "cashbook_entries" DROP CONSTRAINT "cashbook_entries_user_record_unique";--> statement-breakpoint
ALTER TABLE "boss_clears" DROP CONSTRAINT "boss_clears_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "enhancement_totals" DROP CONSTRAINT "enhancement_totals_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "enhancement_totals" DROP CONSTRAINT "enhancement_totals_nexon_account_id_nexon_accounts_id_fk";
--> statement-breakpoint
ALTER TABLE "cashbook_entries" DROP CONSTRAINT "cashbook_entries_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "cashbook_entries" DROP CONSTRAINT "cashbook_entries_nexon_account_id_nexon_accounts_id_fk";
--> statement-breakpoint
ALTER TABLE "boss_clears" ADD COLUMN "maple_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "boss_clears" ADD COLUMN "boss_id" uuid;--> statement-breakpoint
ALTER TABLE "drop_prices" ADD COLUMN "maple_id" text;--> statement-breakpoint
ALTER TABLE "drop_prices" ADD COLUMN "ocid" text;--> statement-breakpoint
ALTER TABLE "drop_prices" ADD COLUMN "boss_id" uuid;--> statement-breakpoint
ALTER TABLE "drop_prices" ADD COLUMN "item_ordinal" integer;--> statement-breakpoint
ALTER TABLE "enhancement_totals" ADD COLUMN "maple_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "enhancement_totals" ADD COLUMN "ocid" text NOT NULL;--> statement-breakpoint
ALTER TABLE "enhancement_totals" ADD COLUMN "item_group" text NOT NULL;--> statement-breakpoint
ALTER TABLE "cashbook_entries" ADD COLUMN "maple_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "boss_clears" ADD CONSTRAINT "boss_clears_maple_id_nexon_account_maple_ids_maple_id_fk" FOREIGN KEY ("maple_id") REFERENCES "public"."nexon_account_maple_ids"("maple_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boss_clears" ADD CONSTRAINT "boss_clears_boss_id_bosses_id_fk" FOREIGN KEY ("boss_id") REFERENCES "public"."bosses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drop_prices" ADD CONSTRAINT "drop_prices_maple_id_nexon_account_maple_ids_maple_id_fk" FOREIGN KEY ("maple_id") REFERENCES "public"."nexon_account_maple_ids"("maple_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drop_prices" ADD CONSTRAINT "drop_prices_boss_id_bosses_id_fk" FOREIGN KEY ("boss_id") REFERENCES "public"."bosses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enhancement_totals" ADD CONSTRAINT "enhancement_totals_maple_id_nexon_account_maple_ids_maple_id_fk" FOREIGN KEY ("maple_id") REFERENCES "public"."nexon_account_maple_ids"("maple_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cashbook_entries" ADD CONSTRAINT "cashbook_entries_maple_id_nexon_account_maple_ids_maple_id_fk" FOREIGN KEY ("maple_id") REFERENCES "public"."nexon_account_maple_ids"("maple_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "boss_clears_same_clear_unique" ON "boss_clears" USING btree ("ocid","boss_id","period_key") WHERE "boss_clears"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "drop_prices_same_drop_unique" ON "drop_prices" USING btree ("ocid","boss_id","period_key","item_id","item_ordinal") WHERE "drop_prices"."record_status" <> 'deleted';--> statement-breakpoint
ALTER TABLE "boss_clears" DROP COLUMN "user_id";--> statement-breakpoint
ALTER TABLE "enhancement_totals" DROP COLUMN "user_id";--> statement-breakpoint
ALTER TABLE "enhancement_totals" DROP COLUMN "nexon_account_id";--> statement-breakpoint
ALTER TABLE "nexon_accounts" DROP COLUMN "account_record_id";--> statement-breakpoint
ALTER TABLE "cashbook_entries" DROP COLUMN "user_id";--> statement-breakpoint
ALTER TABLE "cashbook_entries" DROP COLUMN "nexon_account_id";--> statement-breakpoint
ALTER TABLE "boss_clears" ADD CONSTRAINT "boss_clears_maple_record_unique" UNIQUE("maple_id","period_record_id");--> statement-breakpoint
ALTER TABLE "drop_prices" ADD CONSTRAINT "drop_prices_maple_record_unique" UNIQUE("maple_id","drop_record_id");--> statement-breakpoint
ALTER TABLE "enhancement_totals" ADD CONSTRAINT "enhancement_totals_same_total_unique" UNIQUE("ocid","history_date","enhancement_category","item_group");--> statement-breakpoint
ALTER TABLE "cashbook_entries" ADD CONSTRAINT "cashbook_entries_maple_record_unique" UNIQUE("maple_id","entry_record_id");--> statement-breakpoint
ALTER TABLE "drop_prices" ADD CONSTRAINT "drop_prices_ocid_with_ordinal" CHECK (("drop_prices"."ocid" IS NULL) = ("drop_prices"."item_ordinal" IS NULL));