-- CRITICAL: Clean contaminated test data from failed experiments
-- These papers with status 'failed' are blocking empirical validation
DELETE FROM papers 
WHERE knowledgeAreaId IN (180022, 180023, 180024, 180025, 180026) 
  AND status IN ('failed', 'processing');

-- Verify cleanup
SELECT knowledgeAreaId, status, COUNT(*) as count 
FROM papers 
WHERE knowledgeAreaId IN (180022, 180023, 180024, 180025, 180026)
GROUP BY knowledgeAreaId, status;
