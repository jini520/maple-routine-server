ALTER TABLE "assets" ADD COLUMN "name" text;--> statement-breakpoint
-- 표도 앱 코드도 쓰지 않는 그림 하나를 지운다(앱 저장소 ADR-187 결정 9). 그새 무엇이 가리키게 됐으면 지우지 않는다.
-- 크롭은 그림에 딸린 값이라 함께 지운다. 디스크의 해시 파일은 옛 목록을 받은 앱이 받는 중일 수 있어 남긴다.
DO $$
DECLARE
  target uuid;
  fk record;
  used boolean := false;
  crops integer;
BEGIN
  SELECT "id" INTO target FROM "assets" WHERE "path" = 'items/rings/Tower_Boost_Ring.png';
  IF target IS NULL THEN
    RETURN;
  END IF;
  FOR fk IN
    SELECT kcu.table_name, kcu.column_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
    JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY' AND ccu.table_name = 'assets' AND kcu.table_name <> 'image_crops'
  LOOP
    EXECUTE format('SELECT EXISTS (SELECT 1 FROM %I WHERE %I = $1)', fk.table_name, fk.column_name)
      INTO used USING target;
    IF used THEN
      RETURN;
    END IF;
  END LOOP;
  DELETE FROM "image_crops" WHERE "asset_id" = target;
  GET DIAGNOSTICS crops = ROW_COUNT;
  DELETE FROM "assets" WHERE "id" = target;
  INSERT INTO "game_data_sections" ("key", "updated_at") VALUES ('assets', now())
    ON CONFLICT ("key") DO UPDATE SET "updated_at" = now();
  IF crops > 0 THEN
    INSERT INTO "game_data_sections" ("key", "updated_at") VALUES ('imageCrops', now())
      ON CONFLICT ("key") DO UPDATE SET "updated_at" = now();
  END IF;
END $$;
