-- 그림을 글자(파일 이름 · slug)로 가리키던 칸 13개와 크롭을 assets.id FK 로 바꾼다(앱 저장소 ADR-187 결정 3).
-- 옛 글자를 경로 규칙(asset-paths.ts 의 ASSET_REFS)대로 그림 한 장으로 풀어 채운다. 하나라도 못 풀면 RAISE 로 멈추고
-- 아무것도 안 바뀐다. 앱에 내는 글자는 리포지토리가 그림 경로에서 다시 만든다.
CREATE FUNCTION pg_temp.asset_by_slug(dir text, v text, exts text[]) RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT a."id" FROM "assets" a
  WHERE a."path" = ANY (SELECT dir || '/' || normalize(v, NFC) || '.' || e FROM unnest(exts) AS e)
  ORDER BY array_position(exts, substring(a."path" from '\.([^./]+)$'))
  LIMIT 1
$$;--> statement-breakpoint
CREATE FUNCTION pg_temp.asset_by_file(dirs text[], v text) RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT a."id" FROM "assets" a
  WHERE a."path" = ANY (SELECT d || '/' || normalize(v, NFC) FROM unnest(dirs) AS d)
  ORDER BY array_position(dirs, regexp_replace(a."path", '/[^/]+$', ''))
  LIMIT 1
$$;--> statement-breakpoint
ALTER TABLE "image_crops" DROP CONSTRAINT "image_crops_kind_slug_unique";--> statement-breakpoint
ALTER TABLE "contents" DROP CONSTRAINT "contents_background_one";--> statement-breakpoint
ALTER TABLE "spend_tiles" DROP CONSTRAINT "spend_tiles_icon_one";--> statement-breakpoint
ALTER TABLE "bosses" ADD COLUMN "portrait_asset_id" uuid;--> statement-breakpoint
ALTER TABLE "cashbook_categories" ADD COLUMN "icon_asset_id" uuid;--> statement-breakpoint
ALTER TABLE "contents" ADD COLUMN "background_map_asset_id" uuid;--> statement-breakpoint
ALTER TABLE "contents" ADD COLUMN "background_portrait_asset_id" uuid;--> statement-breakpoint
ALTER TABLE "drop_items" ADD COLUMN "icon_asset_id" uuid;--> statement-breakpoint
ALTER TABLE "hexa_core_kinds" ADD COLUMN "icon_asset_id" uuid;--> statement-breakpoint
ALTER TABLE "hexa_job_cores" ADD COLUMN "icon_asset_id" uuid;--> statement-breakpoint
ALTER TABLE "hunt_loot_items" ADD COLUMN "icon_asset_id" uuid;--> statement-breakpoint
ALTER TABLE "hunting_regions" ADD COLUMN "icon_map_asset_id" uuid;--> statement-breakpoint
ALTER TABLE "image_crops" ADD COLUMN "asset_id" uuid;--> statement-breakpoint
ALTER TABLE "spend_tiles" ADD COLUMN "icon_asset_id" uuid;--> statement-breakpoint
ALTER TABLE "spend_tiles" ADD COLUMN "icon_map_asset_id" uuid;--> statement-breakpoint
ALTER TABLE "symbols" ADD COLUMN "icon_asset_id" uuid;--> statement-breakpoint
ALTER TABLE "worlds" ADD COLUMN "emblem_asset_id" uuid;--> statement-breakpoint
-- 그림이 한 장도 없는 새 DB 에서는 0014 가 넣은 가계부 분류 줄이 가리킬 그림이 없다. 그 줄은 지우고, seed-assets 뒤
-- seed-game-data 가 그림과 함께 다시 넣는다. 그림이 있는 DB(운영)에서는 아무것도 안 지운다.
DELETE FROM "cashbook_categories" WHERE NOT EXISTS (SELECT 1 FROM "assets");--> statement-breakpoint
UPDATE "bosses" SET "portrait_asset_id" = pg_temp.asset_by_slug('bosses', "portrait_slug", ARRAY['webp', 'png']);--> statement-breakpoint
UPDATE "cashbook_categories" SET "icon_asset_id" = pg_temp.asset_by_file(ARRAY['items', 'items/rings'], "icon_file");--> statement-breakpoint
UPDATE "contents" SET "background_map_asset_id" = pg_temp.asset_by_slug('maps', "background_map", ARRAY['webp', 'jpg', 'png']) WHERE "background_map" IS NOT NULL;--> statement-breakpoint
UPDATE "contents" SET "background_portrait_asset_id" = pg_temp.asset_by_slug('bosses', "background_portrait", ARRAY['webp', 'png']) WHERE "background_portrait" IS NOT NULL;--> statement-breakpoint
UPDATE "drop_items" SET "icon_asset_id" = pg_temp.asset_by_file(ARRAY['items', 'items/rings'], "icon_file") WHERE "icon_file" IS NOT NULL;--> statement-breakpoint
UPDATE "hexa_core_kinds" SET "icon_asset_id" = pg_temp.asset_by_file(ARRAY['items', 'items/rings'], "icon_file");--> statement-breakpoint
UPDATE "hexa_job_cores" SET "icon_asset_id" = pg_temp.asset_by_file(ARRAY['skills'], "icon_file");--> statement-breakpoint
UPDATE "hunt_loot_items" SET "icon_asset_id" = pg_temp.asset_by_file(ARRAY['items', 'items/rings'], "icon_file");--> statement-breakpoint
UPDATE "hunting_regions" SET "icon_map_asset_id" = pg_temp.asset_by_slug('maps/icons', "icon_map", ARRAY['png', 'webp']) WHERE "icon_map" IS NOT NULL;--> statement-breakpoint
UPDATE "image_crops" SET "asset_id" = CASE "kind" WHEN 'daily_quest_region' THEN pg_temp.asset_by_slug('maps', "slug", ARRAY['webp', 'jpg', 'png']) ELSE pg_temp.asset_by_slug('bosses', "slug", ARRAY['webp', 'png']) END;--> statement-breakpoint
UPDATE "spend_tiles" SET "icon_asset_id" = pg_temp.asset_by_file(ARRAY['items', 'items/rings'], "icon_file") WHERE "icon_file" IS NOT NULL;--> statement-breakpoint
UPDATE "spend_tiles" SET "icon_map_asset_id" = pg_temp.asset_by_slug('maps/icons', "icon_map", ARRAY['png', 'webp']) WHERE "icon_map" IS NOT NULL;--> statement-breakpoint
UPDATE "symbols" SET "icon_asset_id" = pg_temp.asset_by_file(ARRAY['items', 'items/rings'], "icon_file");--> statement-breakpoint
UPDATE "worlds" SET "emblem_asset_id" = pg_temp.asset_by_slug('worlds', "emblem", ARRAY['png', 'webp']) WHERE "emblem" IS NOT NULL;--> statement-breakpoint
DO $$
DECLARE unresolved text;
BEGIN
  SELECT string_agg(v, ', ') INTO unresolved FROM (
    SELECT 'bosses.portrait_slug=' || "portrait_slug" AS v FROM "bosses" WHERE "portrait_asset_id" IS NULL
    UNION ALL SELECT 'cashbook_categories.icon_file=' || "icon_file" FROM "cashbook_categories" WHERE "icon_asset_id" IS NULL
    UNION ALL SELECT 'contents.background_map=' || "background_map" FROM "contents" WHERE "background_map" IS NOT NULL AND "background_map_asset_id" IS NULL
    UNION ALL SELECT 'contents.background_portrait=' || "background_portrait" FROM "contents" WHERE "background_portrait" IS NOT NULL AND "background_portrait_asset_id" IS NULL
    UNION ALL SELECT 'drop_items.icon_file=' || "icon_file" FROM "drop_items" WHERE "icon_file" IS NOT NULL AND "icon_asset_id" IS NULL
    UNION ALL SELECT 'hexa_core_kinds.icon_file=' || "icon_file" FROM "hexa_core_kinds" WHERE "icon_asset_id" IS NULL
    UNION ALL SELECT 'hexa_job_cores.icon_file=' || "icon_file" FROM "hexa_job_cores" WHERE "icon_asset_id" IS NULL
    UNION ALL SELECT 'hunt_loot_items.icon_file=' || "icon_file" FROM "hunt_loot_items" WHERE "icon_asset_id" IS NULL
    UNION ALL SELECT 'hunting_regions.icon_map=' || "icon_map" FROM "hunting_regions" WHERE "icon_map" IS NOT NULL AND "icon_map_asset_id" IS NULL
    UNION ALL SELECT 'image_crops.' || "kind" || '=' || "slug" FROM "image_crops" WHERE "asset_id" IS NULL
    UNION ALL SELECT 'spend_tiles.icon_file=' || "icon_file" FROM "spend_tiles" WHERE "icon_file" IS NOT NULL AND "icon_asset_id" IS NULL
    UNION ALL SELECT 'spend_tiles.icon_map=' || "icon_map" FROM "spend_tiles" WHERE "icon_map" IS NOT NULL AND "icon_map_asset_id" IS NULL
    UNION ALL SELECT 'symbols.icon_file=' || "icon_file" FROM "symbols" WHERE "icon_asset_id" IS NULL
    UNION ALL SELECT 'worlds.emblem=' || "emblem" FROM "worlds" WHERE "emblem" IS NOT NULL AND "emblem_asset_id" IS NULL
  ) missing;
  IF unresolved IS NOT NULL THEN
    RAISE EXCEPTION '그림 표에 없는 그림이다: %', unresolved;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "bosses" ALTER COLUMN "portrait_asset_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "cashbook_categories" ALTER COLUMN "icon_asset_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "hexa_core_kinds" ALTER COLUMN "icon_asset_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "hexa_job_cores" ALTER COLUMN "icon_asset_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "hunt_loot_items" ALTER COLUMN "icon_asset_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "image_crops" ALTER COLUMN "asset_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "symbols" ALTER COLUMN "icon_asset_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "bosses" ADD CONSTRAINT "bosses_portrait_asset_id_assets_id_fk" FOREIGN KEY ("portrait_asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cashbook_categories" ADD CONSTRAINT "cashbook_categories_icon_asset_id_assets_id_fk" FOREIGN KEY ("icon_asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contents" ADD CONSTRAINT "contents_background_map_asset_id_assets_id_fk" FOREIGN KEY ("background_map_asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contents" ADD CONSTRAINT "contents_background_portrait_asset_id_assets_id_fk" FOREIGN KEY ("background_portrait_asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drop_items" ADD CONSTRAINT "drop_items_icon_asset_id_assets_id_fk" FOREIGN KEY ("icon_asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hexa_core_kinds" ADD CONSTRAINT "hexa_core_kinds_icon_asset_id_assets_id_fk" FOREIGN KEY ("icon_asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hexa_job_cores" ADD CONSTRAINT "hexa_job_cores_icon_asset_id_assets_id_fk" FOREIGN KEY ("icon_asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hunt_loot_items" ADD CONSTRAINT "hunt_loot_items_icon_asset_id_assets_id_fk" FOREIGN KEY ("icon_asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hunting_regions" ADD CONSTRAINT "hunting_regions_icon_map_asset_id_assets_id_fk" FOREIGN KEY ("icon_map_asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "image_crops" ADD CONSTRAINT "image_crops_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spend_tiles" ADD CONSTRAINT "spend_tiles_icon_asset_id_assets_id_fk" FOREIGN KEY ("icon_asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spend_tiles" ADD CONSTRAINT "spend_tiles_icon_map_asset_id_assets_id_fk" FOREIGN KEY ("icon_map_asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "symbols" ADD CONSTRAINT "symbols_icon_asset_id_assets_id_fk" FOREIGN KEY ("icon_asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "worlds" ADD CONSTRAINT "worlds_emblem_asset_id_assets_id_fk" FOREIGN KEY ("emblem_asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bosses" DROP COLUMN "portrait_slug";--> statement-breakpoint
ALTER TABLE "cashbook_categories" DROP COLUMN "icon_file";--> statement-breakpoint
ALTER TABLE "contents" DROP COLUMN "background_map";--> statement-breakpoint
ALTER TABLE "contents" DROP COLUMN "background_portrait";--> statement-breakpoint
ALTER TABLE "drop_items" DROP COLUMN "icon_file";--> statement-breakpoint
ALTER TABLE "hexa_core_kinds" DROP COLUMN "icon_file";--> statement-breakpoint
ALTER TABLE "hexa_job_cores" DROP COLUMN "icon_file";--> statement-breakpoint
ALTER TABLE "hunt_loot_items" DROP COLUMN "icon_file";--> statement-breakpoint
ALTER TABLE "hunting_regions" DROP COLUMN "icon_map";--> statement-breakpoint
ALTER TABLE "image_crops" DROP COLUMN "slug";--> statement-breakpoint
ALTER TABLE "spend_tiles" DROP COLUMN "icon_file";--> statement-breakpoint
ALTER TABLE "spend_tiles" DROP COLUMN "icon_map";--> statement-breakpoint
ALTER TABLE "symbols" DROP COLUMN "icon_file";--> statement-breakpoint
ALTER TABLE "worlds" DROP COLUMN "emblem";--> statement-breakpoint
ALTER TABLE "image_crops" ADD CONSTRAINT "image_crops_kind_asset_unique" UNIQUE("kind","asset_id");--> statement-breakpoint
ALTER TABLE "contents" ADD CONSTRAINT "contents_background_one" CHECK ("contents"."background_map_asset_id" IS NULL OR "contents"."background_portrait_asset_id" IS NULL);--> statement-breakpoint
ALTER TABLE "spend_tiles" ADD CONSTRAINT "spend_tiles_icon_one" CHECK ("spend_tiles"."icon_asset_id" IS NULL OR "spend_tiles"."icon_map_asset_id" IS NULL);
