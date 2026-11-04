ALTER TABLE "drop_prices" DROP CONSTRAINT "drop_prices_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "enhancement_anomalies" DROP CONSTRAINT "enhancement_anomalies_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "usage_events" DROP CONSTRAINT "usage_events_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "drop_prices" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "enhancement_anomalies" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "usage_events" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "drop_prices" ADD CONSTRAINT "drop_prices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enhancement_anomalies" ADD CONSTRAINT "enhancement_anomalies_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "deleted_at";