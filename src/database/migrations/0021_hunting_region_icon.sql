ALTER TABLE "hunting_regions" ADD COLUMN "icon_map" text;--> statement-breakpoint
UPDATE "hunting_regions" AS r SET "icon_map" = v.icon FROM (VALUES
  ('road_of_vanishing', 'roadOfVanishing'),
  ('reverse_city', 'reverseCity'),
  ('chew_chew', 'chewChew'),
  ('yum_yum', 'yumYum'),
  ('lacheln', 'lacheln'),
  ('arcana', 'arcana'),
  ('morass', 'morass'),
  ('esfera', 'esfera'),
  ('sellas', 'sellas'),
  ('moon_bridge', 'moonBridge'),
  ('labyrinth_of_suffering', 'theLabyrinthOfSuffering'),
  ('limen', 'limen'),
  ('cernium', 'cernium'),
  ('burning_cernium', 'burningCernium'),
  ('arcs', 'Arcs'),
  ('odium', 'odium'),
  ('dowonkyung', 'dowonkyung'),
  ('arteria', 'arteria'),
  ('carcion', 'carcion'),
  ('tallahart', 'tallahart'),
  ('geardrak', 'geardrak')
) AS v(key, icon) WHERE r."key" = v.key;
--> statement-breakpoint
UPDATE "game_data_sections" SET "updated_at" = now() WHERE "key" = 'huntingGrounds';
