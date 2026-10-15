CREATE TYPE "public"."boss_cycle" AS ENUM('weekly', 'event_weekly', 'monthly');--> statement-breakpoint
CREATE TYPE "public"."boss_difficulty" AS ENUM('easy', 'normal', 'hard', 'chaos', 'extreme');--> statement-breakpoint
CREATE TYPE "public"."identity_source" AS ENUM('login', 'key');--> statement-breakpoint
CREATE TYPE "public"."notice_kind" AS ENUM('app', 'game', 'event', 'update', 'cashshop');--> statement-breakpoint
CREATE TYPE "public"."platform" AS ENUM('ios', 'android');--> statement-breakpoint
CREATE TABLE "boss_difficulties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"boss_id" uuid NOT NULL,
	"difficulty" "boss_difficulty" NOT NULL,
	"required_level" integer NOT NULL,
	CONSTRAINT "boss_difficulties_boss_difficulty_unique" UNIQUE("boss_id","difficulty")
);
--> statement-breakpoint
CREATE TABLE "bosses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"alias" text NOT NULL,
	"cycle" "boss_cycle" NOT NULL,
	"portrait_slug" text NOT NULL,
	"sort_order" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bosses_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "drop_prices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"drop_record_id" uuid NOT NULL,
	"identified_by" "identity_source" NOT NULL,
	"item_key" text NOT NULL,
	"price_meso" bigint NOT NULL,
	"period_key" text NOT NULL,
	"world_key" text,
	"ring_level" integer,
	"slot" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "drop_prices_user_record_unique" UNIQUE("user_id","drop_record_id")
);
--> statement-breakpoint
CREATE TABLE "game_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"value" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "game_rules_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "manual_completion_bosses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"boss_id" uuid NOT NULL,
	"from_date" text NOT NULL,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "nexon_login_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"state" text NOT NULL,
	"redeem_hash" "bytea" NOT NULL,
	"receipt_hash" "bytea",
	"platform" "platform" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"claimed_at" timestamp with time zone,
	"sealed_at" timestamp with time zone,
	"session_sealed" "bytea",
	"session_id" uuid,
	CONSTRAINT "nexon_login_attempts_state_unique" UNIQUE("state"),
	CONSTRAINT "nexon_login_attempts_redeem_hash_unique" UNIQUE("redeem_hash"),
	CONSTRAINT "nexon_login_attempts_receipt_hash_unique" UNIQUE("receipt_hash")
);
--> statement-breakpoint
CREATE TABLE "nexon_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_hash" "bytea" NOT NULL,
	"user_id" uuid NOT NULL,
	"platform" "platform" NOT NULL,
	"access_sealed" "bytea" NOT NULL,
	"access_expires_at" timestamp with time zone NOT NULL,
	"refresh_sealed" "bytea" NOT NULL,
	"refresh_expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "nexon_sessions_session_hash_unique" UNIQUE("session_hash")
);
--> statement-breakpoint
CREATE TABLE "notices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"notice_key" text NOT NULL,
	"kind" "notice_kind" NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"blocks" jsonb,
	"link" text,
	"source_id" bigint,
	"published_at" timestamp with time zone NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"scheduled_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"push_title" text,
	"push_body" text,
	CONSTRAINT "notices_notice_key_unique" UNIQUE("notice_key")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nexon_uid" text,
	"api_key_hash" "bytea",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "users_nexon_uid_unique" UNIQUE("nexon_uid"),
	CONSTRAINT "users_api_key_hash_unique" UNIQUE("api_key_hash"),
	CONSTRAINT "users_identity" CHECK ("users"."nexon_uid" IS NOT NULL OR "users"."api_key_hash" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "boss_difficulties" ADD CONSTRAINT "boss_difficulties_boss_id_bosses_id_fk" FOREIGN KEY ("boss_id") REFERENCES "public"."bosses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drop_prices" ADD CONSTRAINT "drop_prices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manual_completion_bosses" ADD CONSTRAINT "manual_completion_bosses_boss_id_bosses_id_fk" FOREIGN KEY ("boss_id") REFERENCES "public"."bosses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nexon_login_attempts" ADD CONSTRAINT "nexon_login_attempts_session_id_nexon_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."nexon_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nexon_sessions" ADD CONSTRAINT "nexon_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "drop_prices_item_period_idx" ON "drop_prices" USING btree ("item_key","period_key") WHERE "drop_prices"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "manual_completion_bosses_open_unique" ON "manual_completion_bosses" USING btree ("boss_id") WHERE "manual_completion_bosses"."closed_at" IS NULL;--> statement-breakpoint
CREATE INDEX "nexon_login_attempts_expires_at_idx" ON "nexon_login_attempts" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "nexon_sessions_user_id_idx" ON "nexon_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "nexon_sessions_refresh_expires_at_idx" ON "nexon_sessions" USING btree ("refresh_expires_at");--> statement-breakpoint
CREATE INDEX "notices_published_at_idx" ON "notices" USING btree ("published_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "notices_kind_published_at_idx" ON "notices" USING btree ("kind","published_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "notices_scheduled_at_idx" ON "notices" USING btree ("scheduled_at") WHERE "notices"."scheduled_at" IS NOT NULL AND "notices"."sent_at" IS NULL;