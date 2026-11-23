-- 굳은 날 표에 다른 기록 표와 같은 삭제 표식과 고친 시각을 둔다(앱 저장소 ADR-099 결정 9 · 16 · 66). 데이터 삭제의 강화
-- 묶음이 굳은 날을 지우면, 표식이 있어야 다른 기기가 받아 자기 기기의 다 받은 날 표시를 지우고 그 날을 넥슨에서 다시 받는다.
-- 변경 번호 트리거는 0062 가 이미 걸었다. 받기가 남은 표식의 가장 작은 번호를 읽으므로 표식이 선 줄만 담는 색인도 둔다.
ALTER TABLE "enhancement_settled_days" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "enhancement_settled_days" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
CREATE INDEX "enhancement_settled_days_deleted_change_seq_idx" ON "enhancement_settled_days" USING btree ("change_seq") WHERE "enhancement_settled_days"."deleted_at" IS NOT NULL;