-- 동기화의 받기가 쓰는 색인을 건다(앱 저장소 ADR-099 결정 17 · 66). 받기는 주인의 줄을 변경 번호 차례로 읽는다. 그래서 줄이
-- 많아지는 강화 합계 · 수익 건 · 드롭 · 가계부 기록에 주인 · 변경 번호 색인을 둔다. 가계부 기록의 메이플 ID 색인은 새 색인이
-- 앞 칸으로 맡아 지운다. 받기마다 남은 삭제 표식 가운데 가장 작은 번호를 읽으므로, 표식이 있는 기록 표마다 표식이 선 줄만
-- 담는 색인을 둔다. 없으면 큰 기록 표를 받기마다 다 훑는다.
DROP INDEX "cashbook_entries_maple_id_idx";--> statement-breakpoint
CREATE INDEX "boss_drops_profit_entry_id_change_seq_idx" ON "boss_drops" USING btree ("profit_entry_id","change_seq");--> statement-breakpoint
CREATE INDEX "boss_drops_deleted_change_seq_idx" ON "boss_drops" USING btree ("change_seq") WHERE "boss_drops"."deleted_at" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "boss_profit_calculator_records_deleted_change_seq_idx" ON "boss_profit_calculator_records" USING btree ("change_seq") WHERE "boss_profit_calculator_records"."deleted_at" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "boss_profit_entries_character_id_change_seq_idx" ON "boss_profit_entries" USING btree ("character_id","change_seq");--> statement-breakpoint
CREATE INDEX "boss_profit_entries_deleted_change_seq_idx" ON "boss_profit_entries" USING btree ("change_seq") WHERE "boss_profit_entries"."deleted_at" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "boss_split_settings_deleted_change_seq_idx" ON "boss_split_settings" USING btree ("change_seq") WHERE "boss_split_settings"."deleted_at" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "cashbook_entries_maple_id_change_seq_idx" ON "cashbook_entries" USING btree ("maple_id","change_seq");--> statement-breakpoint
CREATE INDEX "cashbook_entries_deleted_change_seq_idx" ON "cashbook_entries" USING btree ("change_seq") WHERE "cashbook_entries"."deleted_at" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "character_world_leaps_deleted_change_seq_idx" ON "character_world_leaps" USING btree ("change_seq") WHERE "character_world_leaps"."deleted_at" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "enhancement_totals_character_id_change_seq_idx" ON "enhancement_totals" USING btree ("character_id","change_seq");--> statement-breakpoint
CREATE INDEX "enhancement_totals_deleted_change_seq_idx" ON "enhancement_totals" USING btree ("change_seq") WHERE "enhancement_totals"."deleted_at" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "inventory_items_deleted_change_seq_idx" ON "inventory_items" USING btree ("change_seq") WHERE "inventory_items"."deleted_at" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "manual_tracked_items_deleted_change_seq_idx" ON "manual_tracked_items" USING btree ("change_seq") WHERE "manual_tracked_items"."deleted_at" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "maple_id_names_deleted_change_seq_idx" ON "maple_id_names" USING btree ("change_seq") WHERE "maple_id_names"."deleted_at" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "mvp_grade_history_deleted_change_seq_idx" ON "mvp_grade_history" USING btree ("change_seq") WHERE "mvp_grade_history"."deleted_at" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "party_appointments_deleted_change_seq_idx" ON "party_appointments" USING btree ("change_seq") WHERE "party_appointments"."deleted_at" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "remembered_levels_deleted_change_seq_idx" ON "remembered_levels" USING btree ("change_seq") WHERE "remembered_levels"."deleted_at" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "representative_character_motions_deleted_change_seq_idx" ON "representative_character_motions" USING btree ("change_seq") WHERE "representative_character_motions"."deleted_at" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "shared_content_progress_deleted_change_seq_idx" ON "shared_content_progress" USING btree ("change_seq") WHERE "shared_content_progress"."deleted_at" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "tracked_characters_deleted_change_seq_idx" ON "tracked_characters" USING btree ("change_seq") WHERE "tracked_characters"."deleted_at" IS NOT NULL;