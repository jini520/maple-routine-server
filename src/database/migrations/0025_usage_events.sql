CREATE TYPE "public"."usage_event_type" AS ENUM('visit', 'screen', 'action');--> statement-breakpoint
CREATE TABLE "usage_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"identified_by" "identity_source" NOT NULL,
	"type" "usage_event_type" NOT NULL,
	"name" text NOT NULL,
	"duration_ms" integer,
	"platform" "platform" NOT NULL,
	"app_version" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "usage_events_occurred_at_idx" ON "usage_events" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "usage_events_user_id_idx" ON "usage_events" USING btree ("user_id");