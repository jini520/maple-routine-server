-- 새 DB 의 사냥터 표 셋은 비어 있다. 옛 마이그레이션이 기준 줄을 넣지 않아 칸을 지우고 새로 더한다.
-- 옮기는 스크립트가 옛 DB 의 줄을 줄 id 그대로 채운다.
ALTER TABLE "hunting_ground_levels" DROP CONSTRAINT "hunting_ground_levels_ground_level_unique";--> statement-breakpoint
ALTER TABLE "hunting_ground_levels" DROP CONSTRAINT "hunting_ground_levels_level_positive";--> statement-breakpoint
ALTER TABLE "hunting_grounds" DROP CONSTRAINT "hunting_grounds_force_nonnegative";--> statement-breakpoint
ALTER TABLE "hunting_grounds" DROP CONSTRAINT "hunting_grounds_mobs_positive";--> statement-breakpoint
ALTER TABLE "hunting_regions" DROP CONSTRAINT "hunting_regions_icon_map_asset_id_assets_id_fk";
--> statement-breakpoint
ALTER TABLE "hunting_ground_levels" ADD COLUMN "mob_level" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "hunting_grounds" ADD COLUMN "required_force" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "hunting_grounds" ADD COLUMN "mob_quantity" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "hunting_grounds" ADD COLUMN "is_popular" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "hunting_regions" ADD COLUMN "icon_asset_id" uuid;--> statement-breakpoint
ALTER TABLE "hunting_regions" ADD CONSTRAINT "hunting_regions_icon_asset_id_assets_id_fk" FOREIGN KEY ("icon_asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hunting_ground_levels" DROP COLUMN "level";--> statement-breakpoint
ALTER TABLE "hunting_grounds" DROP COLUMN "force";--> statement-breakpoint
ALTER TABLE "hunting_grounds" DROP COLUMN "mobs";--> statement-breakpoint
ALTER TABLE "hunting_grounds" DROP COLUMN "popular";--> statement-breakpoint
ALTER TABLE "hunting_regions" DROP COLUMN "icon_map_asset_id";--> statement-breakpoint
ALTER TABLE "hunting_ground_levels" ADD CONSTRAINT "hunting_ground_levels_ground_mob_level_unique" UNIQUE("ground_id","mob_level");--> statement-breakpoint
ALTER TABLE "hunting_ground_levels" ADD CONSTRAINT "hunting_ground_levels_mob_level_positive" CHECK ("hunting_ground_levels"."mob_level" >= 1);--> statement-breakpoint
ALTER TABLE "hunting_grounds" ADD CONSTRAINT "hunting_grounds_required_force_nonnegative" CHECK ("hunting_grounds"."required_force" >= 0);--> statement-breakpoint
ALTER TABLE "hunting_grounds" ADD CONSTRAINT "hunting_grounds_mob_quantity_positive" CHECK ("hunting_grounds"."mob_quantity" >= 1);