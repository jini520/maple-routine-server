CREATE TABLE "faq_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sheet_id" uuid NOT NULL,
	"sort_order" integer NOT NULL,
	"question" text NOT NULL,
	"answer" jsonb NOT NULL,
	CONSTRAINT "faq_items_answer_array" CHECK (jsonb_typeof("faq_items"."answer") = 'array')
);
--> statement-breakpoint
CREATE TABLE "faq_sheets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"title" text NOT NULL,
	"sort_order" integer NOT NULL,
	CONSTRAINT "faq_sheets_key_unique" UNIQUE("key"),
	CONSTRAINT "faq_sheets_key_format" CHECK ("faq_sheets"."key" ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);
--> statement-breakpoint
ALTER TABLE "faq_items" ADD CONSTRAINT "faq_items_sheet_id_faq_sheets_id_fk" FOREIGN KEY ("sheet_id") REFERENCES "public"."faq_sheets"("id") ON DELETE cascade ON UPDATE no action;