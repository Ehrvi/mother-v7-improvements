-- MOTHER v41.0: Migration 0003 - Omniscient & Advanced Agent Tables
-- Based on schema from branch main (v31-v36)
-- Apply via: gcloud sql connect mother-db --user=mother_app < this_file

-- Knowledge Areas (for Omniscient study jobs)
CREATE TABLE IF NOT EXISTS `knowledge_areas` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(500) NOT NULL,
  `description` text,
  `status` enum('pending','studying','completed','failed') NOT NULL DEFAULT 'pending',
  `paper_count` int NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Papers (arXiv papers discovered by Omniscient)
CREATE TABLE IF NOT EXISTS `papers` (
  `id` int NOT NULL AUTO_INCREMENT,
  `arxiv_id` varchar(50) NOT NULL,
  `title` varchar(1000) NOT NULL,
  `authors` text NOT NULL,
  `abstract` text NOT NULL,
  `published_date` date NOT NULL,
  `knowledge_area_id` int,
  `status` enum('pending','processing','completed','failed') NOT NULL DEFAULT 'pending',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `arxiv_id` (`arxiv_id`),
  KEY `knowledge_area_id` (`knowledge_area_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Paper Chunks (processed text chunks for RAG)
CREATE TABLE IF NOT EXISTS `paper_chunks` (
  `id` int NOT NULL AUTO_INCREMENT,
  `paper_id` int NOT NULL,
  `chunk_index` int NOT NULL,
  `content` mediumtext NOT NULL,
  `embedding` mediumtext,
  `token_count` int NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `paper_id` (`paper_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Study Jobs (async processing queue)
CREATE TABLE IF NOT EXISTS `study_jobs` (
  `id` int NOT NULL AUTO_INCREMENT,
  `knowledge_area_id` int NOT NULL,
  `arxiv_id` varchar(50),
  `job_type` enum('discovery','paper_processing') NOT NULL DEFAULT 'discovery',
  `status` enum('pending','running','completed','failed') NOT NULL DEFAULT 'pending',
  `error_message` text,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `knowledge_area_id` (`knowledge_area_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Semantic Cache (vector-based response caching)
CREATE TABLE IF NOT EXISTS `semantic_cache` (
  `id` int NOT NULL AUTO_INCREMENT,
  `query_hash` varchar(64) NOT NULL,
  `query_text` text NOT NULL,
  `response_text` mediumtext NOT NULL,
  `embedding` mediumtext,
  `hit_count` int NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `expires_at` timestamp,
  PRIMARY KEY (`id`),
  UNIQUE KEY `query_hash` (`query_hash`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Episodic Memory (for MemoryAgent v35.0)
-- Note: This table may already exist. CREATE TABLE IF NOT EXISTS is safe.
CREATE TABLE IF NOT EXISTS `episodic_memory` (
  `id` int NOT NULL AUTO_INCREMENT,
  `content` text NOT NULL,
  `embedding` mediumtext,
  `metadata` text,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- DGM Archive (may already exist - safe to skip)
-- Already exists from migration 0002
