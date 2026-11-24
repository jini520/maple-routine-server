-- 값이 같은 고치기는 변경 번호와 고친 시각을 두는 트리거(앱 저장소 ADR-099 결정 17 · 66). 기기는 서버의 줄과 같은 값을 다시
-- 올리는 일이 흔하다. 다른 기기가 올린 값을 받은 기기가 같은 값을 다시 적고, 처음 동기화는 받은 기록을 다시 올린다. 번호가
-- 오르면 같은 줄이 모든 기기의 받기로 되돌아간다. 고친 시각 말고 바뀐 칸이 없으면 앞 줄의 번호와 시각을 그대로 둔다. 번호를
-- 올려야 하는 쓰기(딸린 줄만 바뀐 기록)는 변경 번호 칸을 새 값으로 적어 다른 줄로 만든다.
CREATE OR REPLACE FUNCTION "bump_change_seq"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND to_jsonb(NEW) - 'updated_at' = to_jsonb(OLD) - 'updated_at' THEN
    NEW.updated_at := OLD.updated_at;
    RETURN NEW;
  END IF;
  NEW.change_seq := nextval('record_change_seq');
  RETURN NEW;
END
$$;
