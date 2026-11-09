-- 영어(GMS) 이름을 옮긴 장비 이름을 한국 서버 이름으로 고치고, 한국 서버에 없는 해외 전용 장비와 같은 아이템을 다른 이름으로
-- 둔 줄을 지운다(앱 저장소 ADR-187 결정 1). 옮긴 이름은 넥슨 API 이름과 맞지 않아 그 장비의 강화 기록이 레벨을 못 찾는다.
DO $$
DECLARE
  used text;
  clash text;
BEGIN
  CREATE TEMP TABLE "kms_renames" ("key" text PRIMARY KEY, "old_name" text NOT NULL, "new_name" text NOT NULL) ON COMMIT DROP;
  INSERT INTO "kms_renames" VALUES
    ('absolab_bladecaster', '앱솔랩스블레이드캐스터', '앱솔랩스블레이드'),
    ('absolab_forked_cane', '앱솔랩스포크드케인', '앱솔랩스핀쳐케인'),
    ('absolab_hellslayer', '앱솔랩스헬슬레이어', '앱솔랩스핼버드'),
    ('absolab_soul_shooter', '앱솔랩스엔젤릭슈터', '앱솔랩스소울슈터'),
    ('absolab_whip_blade', '앱솔랩스스플릿엣지', '앱솔랩스에너지소드'),
    ('absolab_furious_sword', '앱솔랩스퓨리어스소드', '앱솔랩스폭검'),
    ('supreme_glorion_ring', '슈프림글로리온링', '글로리온링:슈프림');

  CREATE TEMP TABLE "kms_removals" ("key" text PRIMARY KEY) ON COMMIT DROP;
  INSERT INTO "kms_removals" VALUES
    ('absolab_katana'), ('arcane_umbra_katana'), ('genesis_katana'), ('destiny_katana'),
    ('absolab_memorial_staff'), ('arcane_umbra_memorial_staff'), ('genesis_memorial_staff'), ('destiny_memorial_staff'),
    ('absolab_martial_brace'), ('arcane_umbra_martial_brace'), ('genesis_mukwon'), ('destiny_mukwon'),
    ('absolab_celestial_light'), ('arcane_umbra_celestial_light'), ('genesis_celestial_light'), ('destiny_celestial_light'),
    ('absolab_spirit_walker_fan'), ('arcane_umbra_spirit_walker_fan'), ('genesis_yinyang_fan'), ('destiny_yinyang_fan'),
    ('absolab_monster_ritual_fan'), ('arcane_umbra_super_ritual_fan'), ('arcane_umbra_illusory_sword');

  -- 지울 줄을 무엇이 가리키면 멈춘다. 이 이름은 넥슨 API 에 나오지 않아 기록이 없어야 맞고, 있으면 사람이 봐야 한다.
  SELECT string_agg(DISTINCT r."key", ', ') INTO used FROM "kms_removals" r
  WHERE EXISTS (SELECT 1 FROM "items" i WHERE i."key" = r."key" AND (i."is_drop" OR NOT i."is_equipment"))
     OR EXISTS (SELECT 1 FROM "items" i JOIN "hunt_loot_items" h ON h."item_id" = i."id" WHERE i."key" = r."key")
     OR EXISTS (SELECT 1 FROM "items" i JOIN "boss_drop_rewards" b ON b."item_id" = i."id" WHERE i."key" = r."key")
     OR EXISTS (SELECT 1 FROM "items" i JOIN "drop_boxes" b ON b."item_id" = i."id" WHERE i."key" = r."key")
     OR EXISTS (SELECT 1 FROM "items" i JOIN "drop_box_contents" b ON b."item_id" = i."id" WHERE i."key" = r."key")
     OR EXISTS (SELECT 1 FROM "items" i JOIN "drop_prices" p ON p."item_id" = i."id" WHERE i."key" = r."key")
     OR EXISTS (SELECT 1 FROM "enhancement_totals" t WHERE t."item_key" = r."key")
     OR EXISTS (SELECT 1 FROM "enhancement_anomalies" a WHERE a."item_key" = r."key")
     OR EXISTS (SELECT 1 FROM "cashbook_entry_items" c WHERE c."item_key" = r."key");
  IF used IS NOT NULL THEN
    RAISE EXCEPTION '지울 장비를 가리키는 줄이 있다: %', used;
  END IF;

  DELETE FROM "items" i USING "kms_removals" r WHERE i."key" = r."key";

  -- 관리 화면에서 이미 다른 이름으로 고쳤으면 그 이름을 둔다.
  UPDATE "items" i SET "name" = r."new_name", "updated_at" = now()
  FROM "kms_renames" r WHERE i."key" = r."key" AND i."name" = r."old_name";

  SELECT string_agg(norm, ', ') INTO clash FROM (
    SELECT regexp_replace(normalize("name", NFC), '\s+', '', 'g') AS norm FROM "items"
    GROUP BY 1 HAVING count(*) > 1
  ) same_name;
  IF clash IS NOT NULL THEN
    RAISE EXCEPTION '이름이 겹치는 아이템이 생긴다: %', clash;
  END IF;

  INSERT INTO "game_data_sections" ("key", "updated_at")
    VALUES ('equipmentItems', now())
    ON CONFLICT ("key") DO UPDATE SET "updated_at" = now();
END $$;
