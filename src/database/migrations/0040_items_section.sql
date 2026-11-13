-- 아이템 표를 게임 데이터 items 칸으로 낸다. 칸의 시각이 없으면 앱이 그 칸을 버리므로 처음 시각을 넣는다.
INSERT INTO "game_data_sections" ("key", "updated_at") VALUES ('items', now())
  ON CONFLICT ("key") DO UPDATE SET "updated_at" = now();
