-- Apply AFTER 0002 has been live for a deploy cycle (in case rollback is needed).
-- D1 supports ALTER TABLE ... DROP COLUMN on recent compatibility dates.
ALTER TABLE accounts DROP COLUMN last_rename_at;
