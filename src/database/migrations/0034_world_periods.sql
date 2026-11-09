CREATE TABLE "world_periods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"world_id" uuid NOT NULL,
	"from" text NOT NULL,
	"until" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "world_periods_world_from_unique" UNIQUE("world_id","from")
);
--> statement-breakpoint
ALTER TABLE "world_periods" ADD CONSTRAINT "world_periods_world_id_worlds_id_fk" FOREIGN KEY ("world_id") REFERENCES "public"."worlds"("id") ON DELETE cascade ON UPDATE no action;