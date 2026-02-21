# @mother/sdk-js

Official JavaScript/TypeScript SDK for **MOTHER API** (Multi-Operational Tiered Hierarchical Execution & Routing)

🚀 **83% cost reduction** | ⭐ **90+ quality** | 🎯 **7-layer architecture**

## Features

- ✅ **TypeScript Support** - Full type definitions included
- ✅ **Dual Package** - Works with ESM and CommonJS
- ✅ **Zero Dependencies** - Lightweight and fast
- ✅ **Async/Sync Queries** - Choose based on your needs
- ✅ **Automatic Retries** - Built-in error handling
- ✅ **OAuth Integration** - Seamless authentication
- ✅ **Cache Support** - 70%+ hit rate for faster responses
- ✅ **Queue Monitoring** - Track async job progress

## Installation

```bash
npm install @mother/sdk-js
```

## Quick Start

```typescript
import { MotherClient } from '@mother/sdk-js';

// Initialize client
const mother = new MotherClient({
  baseUrl: 'https://mother-interface-233196174701.australia-southeast1.run.app',
  sessionCookie: 'your-session-cookie', // Optional, from OAuth
  timeout: 30000, // Optional, default 30s
  debug: false // Optional, enable logging
});

// Query MOTHER (synchronous)
const response = await mother.query({
  query: 'Explain quantum computing in simple terms',
  tier: 2, // 1=fast, 2=balanced, 3=premium
  context: 'For a high school student'
});

console.log(response.response); // AI-generated answer
console.log(`Cost: $${response.cost}`); // Track spending
console.log(`Quality: ${response.quality}/100`); // Quality score
console.log(`Cached: ${response.cached}`); // Was it cached?
```

## Authentication

MOTHER uses OAuth for authentication:

```typescript
// 1. Get login URL
const loginUrl = mother.getLoginUrl('/dashboard');

// 2. Redirect user to login URL
window.location.href = loginUrl;

// 3. After OAuth callback, extract session cookie
// (Cookie is automatically set by browser)

// 4. Get current user
const user = await mother.getCurrentUser();
console.log(user.name, user.email, user.role);

// 5. Logout when done
await mother.logout();
```

## Query Tiers

MOTHER uses intelligent tier selection to optimize cost and quality:

| Tier | Models | Use Case | Cost | Speed |
|------|--------|----------|------|-------|
| **1** | gpt-4o-mini, claude-3-haiku | Simple queries, high volume | 💰 Cheapest | ⚡ Fastest |
| **2** | gpt-4o, claude-3.5-sonnet | Balanced quality/cost | 💰💰 Moderate | ⚡⚡ Fast |
| **3** | o1, o3-mini | Complex reasoning | 💰💰💰 Premium | ⚡⚡⚡ Slower |

```typescript
// Tier 1: Fast and cheap
const simple = await mother.query({
  query: 'What is 2+2?',
  tier: 1
});

// Tier 2: Balanced (default)
const balanced = await mother.query({
  query: 'Write a product description for wireless headphones',
  tier: 2
});

// Tier 3: Premium quality (use async for best experience)
const complex = await mother.queryAsync({
  query: 'Design a distributed system architecture for 1M users',
  tier: 3
});
```

## Async Queries

For heavy queries (tier 3), use async processing with BullMQ:

```typescript
// Start async query
const job = await mother.queryAsync({
  query: 'Analyze this 10-page document and summarize key findings',
  tier: 3
});

console.log(`Job ID: ${job.jobId}`);
console.log(`State: ${job.state}`); // 'waiting' | 'active' | 'completed' | 'failed'

// Poll for completion
while (job.state !== 'completed' && job.state !== 'failed') {
  await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2s
  job = await mother.getJobStatus(job.jobId);
  console.log(`Progress: ${job.progress}%`);
}

if (job.state === 'completed') {
  console.log(job.result?.response);
} else {
  console.error(job.error);
}
```

## Monitoring

Track system health and performance:

```typescript
// System health
const health = await mother.getHealth();
console.log(`Status: ${health.status}`); // 'healthy' | 'degraded' | 'unhealthy'
console.log(`Uptime: ${health.uptime}s`);
console.log(`Memory: ${health.memory.used}MB`);
console.log(`DB Response: ${health.database.responseTime}ms`);

// Cache statistics
const cache = await mother.getCacheStats();
console.log(`Hit Rate: ${cache.hitRate}%`); // Target: 70%+
console.log(`Keys: ${cache.keys}`);
console.log(`Memory: ${cache.memory}MB`);

// Queue statistics
const queue = await mother.getQueueStats();
console.log(`Waiting: ${queue.waiting}`);
console.log(`Active: ${queue.active}`);
console.log(`Completed: ${queue.completed}`);
console.log(`Failed: ${queue.failed}`);
```

## Error Handling

```typescript
import { MotherAPIError } from '@mother/sdk-js';

try {
  const response = await mother.query({
    query: 'Test query',
    tier: 2
  });
} catch (error) {
  if (error instanceof MotherAPIError) {
    console.error(`Error: ${error.message}`);
    console.error(`Code: ${error.code}`);
    console.error(`Status: ${error.statusCode}`);
    console.error(`Data:`, error.data);
    
    // Handle specific errors
    if (error.code === 'RATE_LIMIT_EXCEEDED') {
      console.log('Too many requests, wait and retry');
    } else if (error.code === 'UNAUTHORIZED') {
      console.log('Please login first');
    }
  } else {
    console.error('Unexpected error:', error);
  }
}
```

## Rate Limits

MOTHER enforces rate limits to ensure fair usage:

- **Global**: 100 requests per 15 minutes
- **MOTHER Query**: 10 requests per minute
- **MOTHER Async**: 5 requests per minute

Rate limit headers are included in responses:
- `X-RateLimit-Limit`: Maximum requests allowed
- `X-RateLimit-Remaining`: Requests remaining
- `X-RateLimit-Reset`: Timestamp when limit resets

## Examples

### React Integration

```typescript
import { MotherClient } from '@mother/sdk-js';
import { useState } from 'react';

const mother = new MotherClient();

function ChatComponent() {
  const [query, setQuery] = useState('');
  const [response, setResponse] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      const result = await mother.query({ query, tier: 2 });
      setResponse(result.response);
    } catch (error) {
      console.error('Query failed:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Ask MOTHER anything..."
      />
      <button type="submit" disabled={loading}>
        {loading ? 'Thinking...' : 'Submit'}
      </button>
      {response && <div>{response}</div>}
    </form>
  );
}
```

### Node.js Script

```typescript
import { MotherClient } from '@mother/sdk-js';

const mother = new MotherClient({
  debug: true // Enable logging
});

async function main() {
  // Batch processing
  const queries = [
    'What is AI?',
    'Explain machine learning',
    'What is deep learning?'
  ];

  for (const query of queries) {
    const response = await mother.query({ query, tier: 1 });
    console.log(`Q: ${query}`);
    console.log(`A: ${response.response}`);
    console.log(`Cost: $${response.cost}\n`);
  }
}

main().catch(console.error);
```

## API Reference

### MotherClient

#### Constructor

```typescript
new MotherClient(config?: MotherConfig)
```

#### Methods

- `getLoginUrl(returnPath?: string): string` - Get OAuth login URL
- `setSessionCookie(cookie: string): void` - Set session cookie
- `query(request: QueryRequest): Promise<QueryResponse>` - Synchronous query
- `queryAsync(request: QueryRequest): Promise<AsyncQueryResponse>` - Asynchronous query
- `getJobStatus(jobId: string): Promise<AsyncQueryResponse>` - Get job status
- `getCurrentUser(): Promise<User>` - Get current user
- `logout(): Promise<void>` - Logout
- `getHealth(): Promise<HealthResponse>` - System health
- `getCacheStats(): Promise<CacheStats>` - Cache statistics
- `getQueueStats(): Promise<QueueStats>` - Queue statistics

## TypeScript Support

Full TypeScript definitions are included. Import types as needed:

```typescript
import type {
  MotherConfig,
  QueryRequest,
  QueryResponse,
  AsyncQueryResponse,
  HealthResponse,
  CacheStats,
  QueueStats
} from '@mother/sdk-js';
```

## Contributing

Contributions are welcome! Please open an issue or PR on GitHub.

## License

MIT © Everton Luis Garcia

## Links

- [API Documentation](https://mother-interface-233196174701.australia-southeast1.run.app/api/docs)
- [GitHub Repository](https://github.com/Ehrvi/mother-v7-improvements)
- [Report Issues](https://github.com/Ehrvi/mother-v7-improvements/issues)

## Support

For questions or support, please open an issue on GitHub or contact everton@intelltech.com.br
