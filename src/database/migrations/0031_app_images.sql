-- 게임 데이터의 그림 칸을 그림 id 로 통일하면서 앱 코드가 이름으로 쓰던 그림을 표에 붙인다(앱 저장소 ADR-187 결정 4 · 7 · 8).
-- MVP 명패는 mvp_grades, 컨텐츠 카드 배경 다섯 줄과 지역 아이콘은 contents, 나머지 72장은 새 표 app_images 에 둔다.
-- 값은 이 이관 전 앱 코드가 이름으로 찾던 그림 그대로다. 그림 표가 빈 새 DB 는 채울 그림이 없어 건너뛰고 씨앗이 채운다.
-- 그림 표에 줄이 있는데 찾는 그림이 없으면 RAISE 로 멈추고 아무것도 안 바뀐다.
CREATE TABLE "app_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"asset_id" uuid NOT NULL,
	CONSTRAINT "app_images_key_unique" UNIQUE("key")
);
--> statement-breakpoint
ALTER TABLE "contents" ADD COLUMN "region_icon_asset_id" uuid;--> statement-breakpoint
ALTER TABLE "mvp_grades" ADD COLUMN "plate_asset_id" uuid;--> statement-breakpoint
ALTER TABLE "app_images" ADD CONSTRAINT "app_images_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contents" ADD CONSTRAINT "contents_region_icon_asset_id_assets_id_fk" FOREIGN KEY ("region_icon_asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mvp_grades" ADD CONSTRAINT "mvp_grades_plate_asset_id_assets_id_fk" FOREIGN KEY ("plate_asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
INSERT INTO "cashbook_item_kinds" ("key", "name", "unit", "has_tariff", "sort_order")
  SELECT 'cash', '캐시', '개', true, COALESCE(max("sort_order") + 1, 0) FROM "cashbook_item_kinds"
  ON CONFLICT ("key") DO NOTHING;--> statement-breakpoint
UPDATE "mvp_grades" g SET "plate_asset_id" = a."id" FROM "assets" a
  WHERE g."key" <> 'normal' AND a."path" = 'mvp/' || g."key" || '.webp';--> statement-breakpoint
UPDATE "contents" c SET "background_portrait_asset_id" = a."id" FROM "assets" a
  WHERE c."background_map_asset_id" IS NULL AND c."background_portrait_asset_id" IS NULL AND (
    (c."key" IN ('maple_union_weekly_dragon', 'maple_union_pc_cafe_weekly_dragon') AND a."path" = 'bosses/armorDragon.webp')
    OR (c."key" = 'guild_underground_waterway' AND a."path" = 'bosses/arcanus.webp'));--> statement-breakpoint
UPDATE "contents" c SET "background_map_asset_id" = a."id" FROM "assets" a
  WHERE c."background_map_asset_id" IS NULL AND c."background_portrait_asset_id" IS NULL AND (
    (c."key" = 'guild_weekly_mission_points' AND a."path" = 'maps/hallOfHeroes.webp')
    OR (c."key" = 'guild_flag_race' AND a."path" = 'maps/flagRace.jpg'));--> statement-breakpoint
UPDATE "contents" c SET "region_icon_asset_id" = (
  SELECT i."id" FROM "assets" m
    CROSS JOIN LATERAL (SELECT 'maps/icons/' || substring(m."path" from '^maps/(.*)\.[^./]+$') AS stem) n
    JOIN "assets" i ON i."path" IN (n.stem || '.webp', n.stem || '.png', n.stem || '.jpg')
  WHERE m."id" = c."background_map_asset_id"
  ORDER BY array_position(ARRAY['webp', 'png', 'jpg'], substring(i."path" from '\.([^.]+)$'))
  LIMIT 1)
  WHERE c."background_map_asset_id" IS NOT NULL;--> statement-breakpoint
INSERT INTO "app_images" ("key", "asset_id")
  SELECT v."key", a."id" FROM (VALUES
  ('boss_crystal_weekly', 'items/intense_power_crystal_weekly.webp'),
  ('boss_crystal_monthly', 'items/intense_power_crystal_monthly.webp'),
  ('enhancement_cube_reset', 'items/cube_gold.png'),
  ('enhancement_starforce', 'items/equipment_enhancement_scroll.png'),
  ('enhancement_potential', 'items/potential_reset.png'),
  ('enhancement_additional_potential', 'items/additional_potential_reset.png'),
  ('enhancement_soul_potential', 'items/soul_weapon_potential.webp'),
  ('meso_pouch', 'items/meso_pouch.webp'),
  ('union_wealth', 'items/union_wealth.webp'),
  ('selazar_coin', 'items/selazar_coin.webp'),
  ('sol_erda_energy_1000', 'items/sole_1000.webp'),
  ('sol_erda_energy_500', 'items/sole_500.webp'),
  ('sol_erda_energy_200', 'items/sole_200.png'),
  ('sol_erda_energy_10', 'items/sole_10.png'),
  ('arcane_force', 'force/arcane-force.png'),
  ('authentic_force', 'force/authentic-force.png'),
  ('unknown_character', 'characters/unknown.webp'),
  ('drop_effect_screen_0', 'drop-effect/screen/0.webp'),
  ('drop_effect_screen_1', 'drop-effect/screen/1.webp'),
  ('drop_effect_screen_2', 'drop-effect/screen/2.webp'),
  ('drop_effect_screen_3', 'drop-effect/screen/3.webp'),
  ('drop_effect_screen_4', 'drop-effect/screen/4.webp'),
  ('drop_effect_screen_5', 'drop-effect/screen/5.webp'),
  ('drop_effect_screen_6', 'drop-effect/screen/6.webp'),
  ('drop_effect_screen_7', 'drop-effect/screen/7.webp'),
  ('drop_effect_screen_8', 'drop-effect/screen/8.webp'),
  ('drop_effect_screen_9', 'drop-effect/screen/9.webp'),
  ('drop_effect_screen_10', 'drop-effect/screen/10.webp'),
  ('drop_effect_screen_11', 'drop-effect/screen/11.webp'),
  ('drop_effect_screen_12', 'drop-effect/screen/12.webp'),
  ('drop_effect_screen_13', 'drop-effect/screen/13.webp'),
  ('drop_effect_screen_14', 'drop-effect/screen/14.webp'),
  ('drop_effect_screen_15', 'drop-effect/screen/15.webp'),
  ('drop_effect_pre_0', 'drop-effect/pre/0.webp'),
  ('drop_effect_pre_1', 'drop-effect/pre/1.webp'),
  ('drop_effect_pre_2', 'drop-effect/pre/2.webp'),
  ('drop_effect_pre_3', 'drop-effect/pre/3.webp'),
  ('drop_effect_pre_4', 'drop-effect/pre/4.webp'),
  ('drop_effect_pre_5', 'drop-effect/pre/5.webp'),
  ('drop_effect_pre_6', 'drop-effect/pre/6.webp'),
  ('drop_effect_pre_7', 'drop-effect/pre/7.webp'),
  ('drop_effect_loop_0', 'drop-effect/loop/0.webp'),
  ('drop_effect_loop_1', 'drop-effect/loop/1.webp'),
  ('drop_effect_loop_2', 'drop-effect/loop/2.webp'),
  ('drop_effect_loop_3', 'drop-effect/loop/3.webp'),
  ('drop_effect_loop_4', 'drop-effect/loop/4.webp'),
  ('drop_effect_loop_5', 'drop-effect/loop/5.webp'),
  ('drop_effect_loop_6', 'drop-effect/loop/6.webp'),
  ('drop_effect_loop_7', 'drop-effect/loop/7.webp'),
  ('drop_effect_loop_8', 'drop-effect/loop/8.webp'),
  ('drop_effect_loop_9', 'drop-effect/loop/9.webp'),
  ('drop_effect_loop_10', 'drop-effect/loop/10.webp'),
  ('drop_effect_loop_11', 'drop-effect/loop/11.webp'),
  ('drop_effect_loop_12', 'drop-effect/loop/12.webp'),
  ('drop_effect_loop_13', 'drop-effect/loop/13.webp'),
  ('drop_effect_loop_14', 'drop-effect/loop/14.webp'),
  ('drop_effect_loop_15', 'drop-effect/loop/15.webp'),
  ('drop_effect_loop_16', 'drop-effect/loop/16.webp'),
  ('drop_effect_loop_17', 'drop-effect/loop/17.webp'),
  ('drop_effect_loop_18', 'drop-effect/loop/18.webp'),
  ('drop_effect_loop_19', 'drop-effect/loop/19.webp'),
  ('drop_effect_loop_20', 'drop-effect/loop/20.webp'),
  ('drop_effect_loop_21', 'drop-effect/loop/21.webp'),
  ('drop_effect_loop_22', 'drop-effect/loop/22.webp'),
  ('drop_effect_loop_23', 'drop-effect/loop/23.webp'),
  ('drop_effect_end_0', 'drop-effect/end/0.webp'),
  ('drop_effect_end_1', 'drop-effect/end/1.webp'),
  ('drop_effect_end_2', 'drop-effect/end/2.webp'),
  ('drop_effect_end_3', 'drop-effect/end/3.webp'),
  ('drop_effect_end_4', 'drop-effect/end/4.webp'),
  ('drop_effect_end_5', 'drop-effect/end/5.webp'),
  ('drop_effect_end_6', 'drop-effect/end/6.webp')
  ) AS v("key", "path") JOIN "assets" a ON a."path" = v."path";--> statement-breakpoint
DO $$
DECLARE missing text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "assets") THEN RETURN; END IF;
  SELECT string_agg(m, ' · ') INTO missing FROM (
    SELECT 'app_images ' || (72 - count(*))::text || '줄' AS m FROM "app_images" HAVING count(*) <> 72
    UNION ALL SELECT 'mvp_grades.' || "key" FROM "mvp_grades" WHERE "key" <> 'normal' AND "plate_asset_id" IS NULL
    UNION ALL SELECT 'contents.' || "key" FROM "contents"
      WHERE "key" IN ('maple_union_weekly_dragon', 'maple_union_pc_cafe_weekly_dragon', 'guild_underground_waterway', 'guild_weekly_mission_points', 'guild_flag_race')
        AND "background_map_asset_id" IS NULL AND "background_portrait_asset_id" IS NULL
  ) gaps;
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION '그림 표에 없는 그림이다: %', missing;
  END IF;
  INSERT INTO "game_data_sections" ("key", "updated_at")
    VALUES ('mvpGrades', now()), ('contents', now()), ('cashbookCategories', now()), ('appImages', now())
    ON CONFLICT ("key") DO UPDATE SET "updated_at" = now();
END $$;
