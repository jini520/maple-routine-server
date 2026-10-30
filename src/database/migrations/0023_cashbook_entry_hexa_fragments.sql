ALTER TABLE "cashbook_entry_items" ADD COLUMN "fragment_count" integer;--> statement-breakpoint
ALTER TABLE "cashbook_entry_items" ADD COLUMN "untradable_fragment_count" integer;--> statement-breakpoint
ALTER TABLE "cashbook_entry_items" ADD COLUMN "fragment_price_meso" bigint;--> statement-breakpoint
ALTER TABLE "cashbook_entry_items" ADD COLUMN "hexa_activation" boolean;