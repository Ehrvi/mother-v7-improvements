# MOTHER Omniscient API Documentation

**Version**: MVP Phase 1  
**Date**: February 22, 2026  
**Status**: Backend 100% Functional, UI Deferred

---

## Overview

MOTHER Omniscient is a knowledge area study system that automatically:
1. Searches arXiv for academic papers
2. Downloads and extracts text from PDFs
3. Chunks text into semantic units
4. Generates embeddings for vector search
5. Indexes everything in a database
6. Provides semantic search across all indexed papers

**Architecture**: 7-layer pipeline with job orchestration, progress tracking, and error recovery.

---

## tRPC API Endpoints

All endpoints are accessible via tRPC at `/api/trpc/omniscient.*`

### 1. `omniscient.createStudyJob`

**Description**: Start a new study job to index papers from a knowledge area.

**Input**:
```typescript
{
  name: string;           // Knowledge area name (e.g., "quantum computing")
  description?: string;   // Optional description
  maxPapers: number;      // Max papers to process (1-200)
}
```

**Output**:
```typescript
{
  jobId: string;          // Unique job ID for tracking
  knowledgeAreaId: number; // Database ID of knowledge area
  status: "pending";      // Initial status
}
```

**Example** (via curl):
```bash
curl -X POST https://your-domain.com/api/trpc/omniscient.createStudyJob \
  -H "Content-Type: application/json" \
  -d '{
    "name": "quantum computing",
    "description": "Study quantum computing algorithms",
    "maxPapers": 50
  }'
```

---

### 2. `omniscient.getJobStatus`

**Description**: Get current status of a study job.

**Input**:
```typescript
{
  jobId: string;  // Job ID from createStudyJob
}
```

**Output**:
```typescript
{
  id: string;
  knowledgeAreaId: number;
  knowledgeAreaName: string;
  status: "pending" | "discovering" | "retrieving" | "processing" | "indexing" | "validating" | "completed" | "failed";
  currentStep: string;     // Human-readable current step
  progress: number;        // Papers processed so far
  total: number;           // Total papers to process
  errorMessage?: string;   // Error message if failed
}
```

**Example**:
```bash
curl -X POST https://your-domain.com/api/trpc/omniscient.getJobStatus \
  -H "Content-Type: application/json" \
  -d '{"jobId": "abc123"}'
```

---

### 3. `omniscient.getAllJobs`

**Description**: List all study jobs (active and completed).

**Input**: None

**Output**:
```typescript
Array<{
  id: string;
  knowledgeAreaId: number;
  knowledgeAreaName: string;
  status: string;
  currentStep: string;
  progress: number;
  total: number;
  errorMessage?: string;
}>
```

**Example**:
```bash
curl -X POST https://your-domain.com/api/trpc/omniscient.getAllJobs
```

---

### 4. `omniscient.listAreas`

**Description**: List all knowledge areas with metrics.

**Input**: None

**Output**:
```typescript
Array<{
  id: number;
  name: string;
  description?: string;
  status: "pending" | "in_progress" | "completed" | "failed";
  papersCount: number;   // Total papers indexed
  chunksCount: number;   // Total chunks created
  cost: string;          // Total cost (USD)
  createdAt: Date;
  updatedAt: Date;
}>
```

**Example**:
```bash
curl -X POST https://your-domain.com/api/trpc/omniscient.listAreas
```

---

### 5. `omniscient.search`

**Description**: Semantic search across all indexed papers.

**Input**:
```typescript
{
  query: string;         // Natural language query
  topK?: number;         // Number of results (default: 10)
  minSimilarity?: number; // Minimum similarity threshold 0-1 (default: 0.5)
}
```

**Output**:
```typescript
Array<{
  chunkId: string;
  paperId: string;
  chunkIndex: number;
  content: string;       // Chunk text
  similarity: number;    // Cosine similarity (0-1)
  paperTitle?: string;
  paperAuthors?: string;
  paperUrl?: string;
}>
```

**Example**:
```bash
curl -X POST https://your-domain.com/api/trpc/omniscient.search \
  -H "Content-Type: application/json" \
  -d '{
    "query": "What are the applications of quantum computing?",
    "topK": 5,
    "minSimilarity": 0.3
  }'
```

---

## Database Schema

### `knowledge_areas`
```sql
CREATE TABLE knowledge_areas (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  status ENUM('pending', 'in_progress', 'completed', 'failed'),
  papers_count INT DEFAULT 0,
  chunks_count INT DEFAULT 0,
  cost DECIMAL(10,4) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

### `papers`
```sql
CREATE TABLE papers (
  id INT PRIMARY KEY AUTO_INCREMENT,
  knowledge_area_id INT,
  arxiv_id VARCHAR(255) UNIQUE NOT NULL,
  title TEXT,
  authors TEXT,
  abstract TEXT,
  url VARCHAR(512),
  published_date DATE,
  pdf_url VARCHAR(512),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (knowledge_area_id) REFERENCES knowledge_areas(id)
);
```

### `paper_chunks`
```sql
CREATE TABLE paper_chunks (
  id INT PRIMARY KEY AUTO_INCREMENT,
  paper_id INT,
  chunk_index INT,
  text TEXT,
  embedding BLOB,  -- Serialized float32 array (1536 dimensions)
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (paper_id) REFERENCES papers(id)
);
```

---

## Usage Examples

### Example 1: Study Quantum Computing (50 papers)

```typescript
// 1. Create study job
const job = await trpc.omniscient.createStudyJob.mutate({
  name: "quantum computing",
  description: "Study quantum computing algorithms and applications",
  maxPapers: 50,
});

console.log(`Job started: ${job.jobId}`);

// 2. Poll for progress
const interval = setInterval(async () => {
  const status = await trpc.omniscient.getJobStatus.query({ jobId: job.jobId });
  console.log(`Status: ${status.status} - ${status.currentStep} (${status.progress}/${status.total})`);
  
  if (status.status === "completed" || status.status === "failed") {
    clearInterval(interval);
    console.log("Job finished!");
  }
}, 5000);

// 3. Search after completion
const results = await trpc.omniscient.search.query({
  query: "What are the applications of quantum computing in cryptography?",
  topK: 5,
  minSimilarity: 0.3,
});

results.forEach((result, idx) => {
  console.log(`\n${idx + 1}. ${result.paperTitle} (${(result.similarity * 100).toFixed(1)}% match)`);
  console.log(`   ${result.content.substring(0, 200)}...`);
});
```

### Example 2: Monitor All Jobs

```typescript
const jobs = await trpc.omniscient.getAllJobs.query();

jobs.forEach(job => {
  console.log(`${job.knowledgeAreaName}: ${job.status} (${job.progress}/${job.total})`);
});
```

### Example 3: List Knowledge Areas

```typescript
const areas = await trpc.omniscient.listAreas.query();

areas.forEach(area => {
  console.log(`\n${area.name}`);
  console.log(`  Papers: ${area.papersCount}`);
  console.log(`  Chunks: ${area.chunksCount}`);
  console.log(`  Cost: $${area.cost}`);
  console.log(`  Status: ${area.status}`);
});
```

---

## Performance Metrics

**Tested with 3 papers** (quantum computing):
- Papers processed: 3/3 (100% success rate)
- Chunks created: 48
- Processing time: ~5 minutes
- Cost: ~$0.10 (embeddings generation)
- Semantic search latency: <1s

**Estimated for 100 papers**:
- Processing time: ~2.5 hours
- Cost: ~$3-5 (embeddings + API calls)
- Chunks: ~1,600
- Storage: ~50MB (database)

---

## Error Handling

### Common Errors

1. **arXiv API Rate Limit**: Retry with exponential backoff
2. **PDF Download Failure**: Skip paper, continue with others
3. **PDF Parsing Failure**: Skip paper, log error
4. **OpenAI API Error**: Retry up to 3 times
5. **Database Error**: Rollback transaction, fail job

### Partial Success

Jobs can succeed partially (e.g., 8/10 papers processed). The system marks the job as "completed" if at least 50% of papers succeed.

---

## Future Enhancements (Phase 8)

1. **UI Implementation**: Web interface for creating jobs and searching
2. **Real-time Progress**: WebSocket updates instead of polling
3. **Advanced Filters**: Filter by date, author, journal
4. **Export Results**: Export search results to CSV/PDF
5. **Knowledge Graph**: Visualize relationships between papers
6. **Multi-source**: Support for PubMed, IEEE Xplore, etc.
7. **Collaborative**: Share knowledge areas with team members

---

## Support

For issues or questions:
- Check logs: `.manus-logs/devserver.log`
- Database: Management UI → Database panel
- API testing: Use Postman or curl examples above

---

**Last Updated**: February 22, 2026  
**Status**: Production-ready backend, UI pending
