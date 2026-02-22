-- Semantic Cache Table for MOTHER v15
-- Stores query embeddings and responses for semantic similarity matching
-- Threshold: 0.95 cosine similarity for cache hits

CREATE TABLE IF NOT EXISTS semantic_cache (
    id INT AUTO_INCREMENT PRIMARY KEY,
    
    -- Query information
    query_text TEXT NOT NULL,
    query_embedding TEXT NOT NULL, -- JSON array of 1536 floats (text-embedding-3-small)
    
    -- Response information
    response TEXT NOT NULL,
    response_metadata JSON, -- Store additional metadata (tier, quality scores, etc.)
    
    -- Performance tracking
    hit_count INT DEFAULT 0,
    last_hit_at TIMESTAMP NULL,
    
    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
    
    -- Indexes
    INDEX idx_created_at (created_at),
    INDEX idx_hit_count (hit_count)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Note: Vector similarity search will be done in application code
-- TiDB Serverless doesn't support native vector indexes yet
-- We'll fetch recent cache entries and compute cosine similarity in-memory
