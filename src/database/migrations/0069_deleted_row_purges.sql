-- 180일 뒤 지우기가 줄을 지운 한 번마다 지운 줄의 가장 큰 변경 번호를 적는다(앱 저장소 ADR-099 결정 9 · 66). 받기는 이 표의
-- 가장 큰 값을 purgedChangeSeq 로 알려 주고, 기기는 그 값이 바뀌었을 때만 번호가 그보다 작은 주인을 비우고 다시 받는다. 전에는
-- 남은 삭제 표식의 가장 작은 번호와 견주어, 줄이 500줄을 넘는 주인이 표식 하나로 비우고 다시 받기를 끝없이 되풀이했다.
CREATE TABLE "deleted_row_purges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"max_change_seq" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
