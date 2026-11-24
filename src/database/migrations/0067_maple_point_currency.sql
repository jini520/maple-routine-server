-- 지출 항목의 재화 값 `point` 를 `maple_point` 로 바꾼다(앱 저장소 ADR-099 결정 53). `point` 만으로는 어느 포인트인지 알 수 없다.
-- drizzle 은 enum 을 지우고 다시 만들며 칸을 새 형으로 바꾸는데, 그러면 이미 `point` 를 든 줄이 새 형으로 바뀌지 못해 실패한다.
-- 값의 이름만 바꾸면 든 줄도 함께 새 값이 된다.
ALTER TYPE "public"."spend_currency" RENAME VALUE 'point' TO 'maple_point';
