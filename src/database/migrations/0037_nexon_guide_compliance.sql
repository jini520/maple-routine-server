ALTER TABLE "boss_clears" DROP CONSTRAINT "boss_clears_maple_id_nexon_account_maple_ids_maple_id_fk";
--> statement-breakpoint
ALTER TABLE "drop_prices" DROP CONSTRAINT "drop_prices_maple_id_nexon_account_maple_ids_maple_id_fk";
--> statement-breakpoint
ALTER TABLE "enhancement_totals" DROP CONSTRAINT "enhancement_totals_maple_id_nexon_account_maple_ids_maple_id_fk";
--> statement-breakpoint
ALTER TABLE "cashbook_entries" DROP CONSTRAINT "cashbook_entries_maple_id_nexon_account_maple_ids_maple_id_fk";
--> statement-breakpoint
ALTER TABLE "notices" ADD COLUMN "fetched_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "notices" ADD COLUMN "detail_fetched_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "boss_clears" ADD CONSTRAINT "boss_clears_maple_id_nexon_account_maple_ids_maple_id_fk" FOREIGN KEY ("maple_id") REFERENCES "public"."nexon_account_maple_ids"("maple_id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "drop_prices" ADD CONSTRAINT "drop_prices_maple_id_nexon_account_maple_ids_maple_id_fk" FOREIGN KEY ("maple_id") REFERENCES "public"."nexon_account_maple_ids"("maple_id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "enhancement_totals" ADD CONSTRAINT "enhancement_totals_maple_id_nexon_account_maple_ids_maple_id_fk" FOREIGN KEY ("maple_id") REFERENCES "public"."nexon_account_maple_ids"("maple_id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "cashbook_entries" ADD CONSTRAINT "cashbook_entries_maple_id_nexon_account_maple_ids_maple_id_fk" FOREIGN KEY ("maple_id") REFERENCES "public"."nexon_account_maple_ids"("maple_id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "enhancement_totals" DROP COLUMN "character_name";--> statement-breakpoint
-- 넥슨 식별자 원문을 앱과 같은 SHA-256 소문자 16진으로 바꾼다(앱 저장소 ADR-017 결정 11). 기록 표의 메이플 ID 는 위의 ON UPDATE CASCADE 로 따라온다.
UPDATE "nexon_accounts" SET "nexon_uid" = encode(sha256(convert_to("nexon_uid", 'UTF8')), 'hex') WHERE "nexon_uid" IS NOT NULL;--> statement-breakpoint
UPDATE "nexon_account_maple_ids" SET "maple_id" = encode(sha256(convert_to("maple_id", 'UTF8')), 'hex');--> statement-breakpoint
UPDATE "drop_prices" SET "ocid" = encode(sha256(convert_to("ocid", 'UTF8')), 'hex') WHERE "ocid" IS NOT NULL;--> statement-breakpoint
UPDATE "boss_clears" SET "ocid" = encode(sha256(convert_to("ocid", 'UTF8')), 'hex');--> statement-breakpoint
UPDATE "cashbook_entries" SET "ocid" = encode(sha256(convert_to("ocid", 'UTF8')), 'hex') WHERE "ocid" IS NOT NULL;--> statement-breakpoint
UPDATE "enhancement_totals" SET "ocid" = encode(sha256(convert_to("ocid", 'UTF8')), 'hex');--> statement-breakpoint
-- 이미 있는 넥슨 공지는 올린 시각을 받은 시각으로 둔다. 목록에 있는 글은 배포 뒤 첫 회차가 고친다(앱 저장소 ADR-057 결정 11).
UPDATE "notices" SET "fetched_at" = "published_at" WHERE "kind" <> 'app';--> statement-breakpoint
UPDATE "notices" SET "detail_fetched_at" = "published_at" WHERE "kind" = 'event' AND "blocks" IS NOT NULL;
