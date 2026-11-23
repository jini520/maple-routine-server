-- 같은 물건 연결이 두 번 이어지지 못하게 트리거가 지킨다(앱 저장소 ADR-099 결정 30). 원래 아이템 줄은 다른 줄의 따로 둔 줄이
-- 될 수 없고, 따로 둔 줄은 다른 줄의 원래 줄이 될 수 없다. 두 번 이어지면 원래 아이템을 찾을 때마다 끝까지 따라가야 하는데,
-- 시세와 게임 데이터는 연결을 한 번만 따라간다. 다른 줄을 견줘야 해서 CHECK 로는 걸 수 없다. 연결을 고치는 관리 화면이 아직
-- 없어 쓰는 곳은 옛 DB 를 옮기는 명령뿐이다.
CREATE FUNCTION "same_item_links_check_one_hop"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM same_item_links
              WHERE id <> NEW.id
                AND (item_id = NEW.original_item_id OR original_item_id = NEW.item_id)) THEN
    RAISE EXCEPTION 'same_item_links: 같은 물건 연결이 두 번 이어진다'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'same_item_links_one_hop';
  END IF;
  RETURN NEW;
END
$$;--> statement-breakpoint
CREATE TRIGGER "same_item_links_one_hop" BEFORE INSERT OR UPDATE ON "same_item_links" FOR EACH ROW EXECUTE FUNCTION "same_item_links_check_one_hop"();
