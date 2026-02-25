-- ============================================================
-- Migration 0022: v65.3 — Fix knowledge_wisdom duplicate entries
--
-- Root cause: Migration 0020 (failed silently) and migration 0021 both
-- contained INSERT IGNORE statements for knowledge_wisdom. The UNIQUE KEY
-- on (domain, subdomain) should have prevented duplicates, but the
-- migration 0020 ran partially — it created the table WITHOUT the UNIQUE KEY
-- (because the CREATE TABLE statement used a different collation and the
-- UNIQUE KEY syntax was part of a failed statement group). Then migration 0021
-- re-created the table with the UNIQUE KEY, but by then the data was already
-- duplicated.
--
-- Fix: Keep only the row with the minimum id for each (domain, subdomain) pair.
-- ============================================================

DELETE FROM `knowledge_wisdom`
WHERE `id` NOT IN (
  SELECT min_id FROM (
    SELECT MIN(`id`) as min_id
    FROM `knowledge_wisdom`
    GROUP BY `domain`, COALESCE(`subdomain`, '__NULL__')
  ) as keep_ids
);
