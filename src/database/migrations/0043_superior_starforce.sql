CREATE TABLE "superior_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"series_id" uuid NOT NULL,
	"name" text NOT NULL,
	"icon_asset_id" uuid,
	CONSTRAINT "superior_items_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "superior_series" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"starforce_cost_meso" integer NOT NULL,
	CONSTRAINT "superior_series_key_unique" UNIQUE("key"),
	CONSTRAINT "superior_series_starforce_cost_positive" CHECK ("superior_series"."starforce_cost_meso" >= 1)
);
--> statement-breakpoint
ALTER TABLE "superior_items" ADD CONSTRAINT "superior_items_series_id_superior_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."superior_series"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "superior_items" ADD CONSTRAINT "superior_items_icon_asset_id_assets_id_fk" FOREIGN KEY ("icon_asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
-- 슈페리얼 계열 셋과 스타포스 1회 비용(사용자 확인 2026-11-15). 성수 · 할인과 상관없다.
INSERT INTO "superior_series" ("key", "name", "starforce_cost_meso") VALUES
  ('helisium_elite', '헬리시움 정예', 5956000),
  ('nova', '노바', 18507900),
  ('tyrant', '타일런트', 55382200);
--> statement-breakpoint
-- KMS 클라이언트 데이터(maplestory.io KMS v389)에서 superiorEqp 가 참인 장비 전부(2026-11-15 확인). 그림은 경로로 잇는다.
-- 타일런트 벨트 다섯은 아이템 표가 쓰는 그림이고, 나머지는 서버를 내기 전에 올린다. 그림이 없는 환경에서는 그림 칸이 빈다.
INSERT INTO "superior_items" ("series_id", "name", "icon_asset_id")
SELECT s."id", v."name", a."id"
FROM (VALUES
  ('helisium_elite', '헬리시움 정예 전사 부츠', 'items/helisium_elite_knight_shoes.png'),
  ('helisium_elite', '헬리시움 정예 법사 부츠', 'items/helisium_elite_mage_shoes.png'),
  ('helisium_elite', '헬리시움 정예 궁수 부츠', 'items/helisium_elite_archer_shoes.png'),
  ('helisium_elite', '헬리시움 정예 도적 부츠', 'items/helisium_elite_bandit_shoes.png'),
  ('helisium_elite', '헬리시움 정예 해적 부츠', 'items/helisium_elite_pirate_shoes.png'),
  ('helisium_elite', '헬리시움 정예 전사 망토', 'items/helisium_elite_knight_cape.png'),
  ('helisium_elite', '헬리시움 정예 법사 망토', 'items/helisium_elite_mage_cape.png'),
  ('helisium_elite', '헬리시움 정예 궁수 망토', 'items/helisium_elite_archer_cape.png'),
  ('helisium_elite', '헬리시움 정예 도적 망토', 'items/helisium_elite_bandit_cape.png'),
  ('helisium_elite', '헬리시움 정예 해적 망토', 'items/helisium_elite_pirate_cape.png'),
  ('helisium_elite', '헬리시움 정예 전사 벨트', 'items/helisium_elite_knight_belt.png'),
  ('helisium_elite', '헬리시움 정예 법사 벨트', 'items/helisium_elite_mage_belt.png'),
  ('helisium_elite', '헬리시움 정예 궁수 벨트', 'items/helisium_elite_archer_belt.png'),
  ('helisium_elite', '헬리시움 정예 도적 벨트', 'items/helisium_elite_bandit_belt.png'),
  ('helisium_elite', '헬리시움 정예 해적 벨트', 'items/helisium_elite_pirate_belt.png'),
  ('nova', '노바 히아데스 부츠', 'items/nova_hyades_shoes.png'),
  ('nova', '노바 헤르메스 부츠', 'items/nova_hermes_shoes.png'),
  ('nova', '노바 케이론 부츠', 'items/nova_charon_shoes.png'),
  ('nova', '노바 리카온 부츠', 'items/nova_lycaon_shoes.png'),
  ('nova', '노바 알테어 부츠', 'items/nova_altair_shoes.png'),
  ('nova', '노바 히아데스 클록', 'items/nova_hyades_cape.png'),
  ('nova', '노바 헤르메스 클록', 'items/nova_hermes_cape.png'),
  ('nova', '노바 케이론 클록', 'items/nova_charon_cape.png'),
  ('nova', '노바 리카온 클록', 'items/nova_lycaon_cape.png'),
  ('nova', '노바 알테어 클록', 'items/nova_altair_cape.png'),
  ('nova', '노바 히아데스 벨트', 'items/nova_hyades_belt.png'),
  ('nova', '노바 헤르메스 벨트', 'items/nova_hermes_belt.png'),
  ('nova', '노바 케이론 벨트', 'items/nova_charon_belt.png'),
  ('nova', '노바 리카온 벨트', 'items/nova_lycaon_belt.png'),
  ('nova', '노바 알테어 벨트', 'items/nova_altair_belt.png'),
  ('tyrant', '타일런트 히아데스 부츠', 'items/tyrant_hyades_shoes.png'),
  ('tyrant', '타일런트 헤르메스 부츠', 'items/tyrant_hermes_shoes.png'),
  ('tyrant', '타일런트 케이론 부츠', 'items/tyrant_charon_shoes.png'),
  ('tyrant', '타일런트 리카온 부츠', 'items/tyrant_lycaon_shoes.png'),
  ('tyrant', '타일런트 알테어 부츠', 'items/tyrant_altair_shoes.png'),
  ('tyrant', '타일런트 히아데스 글러브', 'items/tyrant_hyades_gloves.png'),
  ('tyrant', '타일런트 헤르메스 글러브', 'items/tyrant_hermes_gloves.png'),
  ('tyrant', '타일런트 케이론 글러브', 'items/tyrant_charon_gloves.png'),
  ('tyrant', '타일런트 리카온 글러브', 'items/tyrant_lycaon_gloves.png'),
  ('tyrant', '타일런트 알테어 글러브', 'items/tyrant_altair_gloves.png'),
  ('tyrant', '타일런트 히아데스 클록', 'items/tyrant_hyades_cape.png'),
  ('tyrant', '타일런트 헤르메스 클록', 'items/tyrant_hermes_cape.png'),
  ('tyrant', '타일런트 케이론 클록', 'items/tyrant_charon_cape.png'),
  ('tyrant', '타일런트 리카온 클록', 'items/tyrant_lycaon_cape.png'),
  ('tyrant', '타일런트 알테어 클록', 'items/tyrant_altair_cape.png'),
  ('tyrant', '타일런트 히아데스 벨트', 'items/tyrant_hyades_belt.png'),
  ('tyrant', '타일런트 헤르메스 벨트', 'items/tyrant_hermes_belt.png'),
  ('tyrant', '타일런트 케이론 벨트', 'items/tyrant_charon_belt.png'),
  ('tyrant', '타일런트 리카온 벨트', 'items/tyrant_lycaon_belt.png'),
  ('tyrant', '타일런트 알테어 벨트', 'items/tyrant_altair_belt.png')
) AS v("series_key", "name", "icon_path")
JOIN "superior_series" s ON s."key" = v."series_key"
LEFT JOIN "assets" a ON a."path" = v."icon_path";
--> statement-breakpoint
INSERT INTO "game_data_sections" ("key", "updated_at") VALUES ('enhancementCosts', now()) ON CONFLICT ("key") DO UPDATE SET "updated_at" = now();
