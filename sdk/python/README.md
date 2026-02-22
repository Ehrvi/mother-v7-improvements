

# mother-sdk

Official Python SDK for **MOTHER API** (Multi-Operational Tiered Hierarchical Execution & Routing)

🚀 **83% cost reduction** | ⭐ **90+ quality** | 🎯 **7-layer architecture**

## Features

- ✅ **Type Hints** - Full type annotations with Pydantic models
- ✅ **Async/Await Support** - Both sync and async methods
- ✅ **Context Managers** - Automatic resource cleanup
- ✅ **Zero Config** - Works out of the box
- ✅ **Pythonic API** - Follows Python best practices
- ✅ **OAuth Integration** - Seamless authentication
- ✅ **Cache Support** - 70%+ hit rate for faster responses
- ✅ **Queue Monitoring** - Track async job progress

## Installation

```bash
pip install mother-sdk
```

## Quick Start

### Synchronous Usage

```python
from mother_sdk import MotherClient, QueryRequest, Tier

# Initialize client
client = MotherClient()

# Query MOTHER
response = client.query(QueryRequest(
    query="Explain quantum computing in simple terms",
    tier=Tier.BALANCED,  # 1=FAST, 2=BALANCED, 3=PREMIUM
    context="For a high school student"
))

print(response.response)  # AI-generated answer
print(f"Cost: ${response.cost}")  # Track spending
print(f"Quality: {response.quality}/100")  # Quality score
print(f"Cached: {response.cached}")  # Was it cached?
```

### Asynchronous Usage

```python
import asyncio
from mother_sdk import MotherClient, QueryRequest, Tier

async def main():
    client = MotherClient()
    
    # Async query
    response = await client.query_async(QueryRequest(
        query="What is machine learning?",
        tier=Tier.BALANCED
    ))
    
    print(response.response)
    
    # Clean up
    await client.aclose()

asyncio.run(main())
```

### Context Manager

```python
from mother_sdk import MotherClient, QueryRequest

# Automatic cleanup
with MotherClient() as client:
    response = client.query(QueryRequest(query="What is AI?"))
    print(response.response)

# Async context manager
async with MotherClient() as client:
    response = await client.query_async(QueryRequest(query="What is AI?"))
    print(response.response)
```

## Authentication

MOTHER uses OAuth for authentication:

```python
from mother_sdk import MotherClient

client = MotherClient()

# 1. Get login URL
login_url = client.get_login_url(return_path="/dashboard")
print(f"Please visit: {login_url}")

# 2. After OAuth callback, set session cookie
client.set_session_cookie("your-session-cookie")

# 3. Get current user
user = client.get_current_user()
print(f"{user.name} ({user.email}) - Role: {user.role}")

# 4. Logout when done
client.logout()
```

## Query Tiers

MOTHER uses intelligent tier selection to optimize cost and quality:

| Tier | Models | Use Case | Cost | Speed |
|------|--------|----------|------|-------|
| **1 (FAST)** | gpt-4o-mini, claude-3-haiku | Simple queries, high volume | 💰 Cheapest | ⚡ Fastest |
| **2 (BALANCED)** | gpt-4o, claude-3.5-sonnet | Balanced quality/cost | 💰💰 Moderate | ⚡⚡ Fast |
| **3 (PREMIUM)** | o1, o3-mini | Complex reasoning | 💰💰💰 Premium | ⚡⚡⚡ Slower |

```python
from mother_sdk import MotherClient, QueryRequest, Tier

client = MotherClient()

# Tier 1: Fast and cheap
simple = client.query(QueryRequest(
    query="What is 2+2?",
    tier=Tier.FAST
))

# Tier 2: Balanced (default)
balanced = client.query(QueryRequest(
    query="Write a product description for wireless headphones",
    tier=Tier.BALANCED
))

# Tier 3: Premium quality (use async for best experience)
complex_job = client.query_async_job(QueryRequest(
    query="Design a distributed system architecture for 1M users",
    tier=Tier.PREMIUM
))
```

## Async Queries

For heavy queries (tier 3), use async processing with BullMQ:

```python
import time
from mother_sdk import MotherClient, QueryRequest, Tier

client = MotherClient()

# Start async query
job = client.query_async_job(QueryRequest(
    query="Analyze this 10-page document and summarize key findings",
    tier=Tier.PREMIUM
))

print(f"Job ID: {job.job_id}")
print(f"State: {job.state}")  # 'waiting' | 'active' | 'completed' | 'failed'

# Poll for completion
while job.state not in ["completed", "failed"]:
    time.sleep(2)  # Wait 2 seconds
    job = client.get_job_status(job.job_id)
    print(f"Progress: {job.progress}%")

if job.state == "completed":
    print(job.result.response)
else:
    print(f"Error: {job.error}")
```

### Async/Await Version

```python
import asyncio
from mother_sdk import MotherClient, QueryRequest, Tier

async def process_query():
    client = MotherClient()
    
    # Start async query
    job = await client.query_async_job_async(QueryRequest(
        query="Complex analysis task",
        tier=Tier.PREMIUM
    ))
    
    # Poll for completion
    while job.state not in ["completed", "failed"]:
        await asyncio.sleep(2)
        job = await client.get_job_status_async(job.job_id)
        print(f"Progress: {job.progress}%")
    
    if job.state == "completed":
        print(job.result.response)
    
    await client.aclose()

asyncio.run(process_query())
```

## Monitoring

Track system health and performance:

```python
from mother_sdk import MotherClient

client = MotherClient()

# System health
health = client.get_health()
print(f"Status: {health.status}")  # 'healthy' | 'degraded' | 'unhealthy'
print(f"Uptime: {health.uptime}s")
print(f"Memory: {health.memory.used}MB")
print(f"DB Response: {health.database.response_time}ms")

# Cache statistics
cache = client.get_cache_stats()
print(f"Hit Rate: {cache.hit_rate}%")  # Target: 70%+
print(f"Keys: {cache.keys}")
print(f"Memory: {cache.memory}MB")

# Queue statistics
queue = client.get_queue_stats()
print(f"Waiting: {queue.waiting}")
print(f"Active: {queue.active}")
print(f"Completed: {queue.completed}")
print(f"Failed: {queue.failed}")
```

## Error Handling

```python
from mother_sdk import MotherClient, QueryRequest, MotherAPIError

client = MotherClient()

try:
    response = client.query(QueryRequest(
        query="Test query",
        tier=2
    ))
except MotherAPIError as e:
    print(f"Error: {e.message}")
    print(f"Code: {e.code}")
    print(f"Status: {e.status_code}")
    print(f"Data: {e.data}")
    
    # Handle specific errors
    if e.code == "RATE_LIMIT_EXCEEDED":
        print("Too many requests, wait and retry")
    elif e.code == "UNAUTHORIZED":
        print("Please login first")
except Exception as e:
    print(f"Unexpected error: {e}")
```

## Configuration

```python
from mother_sdk import MotherClient, MotherConfig

config = MotherConfig(
    base_url="https://mother-interface-qtvghovzxa-ts.a.run.app",
    session_cookie="your-session-cookie",
    timeout=30.0,  # seconds
    debug=True,  # Enable logging
    headers={"X-Custom-Header": "value"}
)

client = MotherClient(config)
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

### Batch Processing

```python
from mother_sdk import MotherClient, QueryRequest, Tier

client = MotherClient()

queries = [
    "What is AI?",
    "Explain machine learning",
    "What is deep learning?"
]

for query_text in queries:
    response = client.query(QueryRequest(
        query=query_text,
        tier=Tier.FAST
    ))
    print(f"Q: {query_text}")
    print(f"A: {response.response}")
    print(f"Cost: ${response.cost}\n")

client.close()
```

### Data Science Workflow

```python
import pandas as pd
from mother_sdk import MotherClient, QueryRequest, Tier

# Load dataset
df = pd.read_csv("data.csv")

# Initialize MOTHER
client = MotherClient()

# Analyze each row
results = []
for _, row in df.iterrows():
    response = client.query(QueryRequest(
        query=f"Analyze this data: {row.to_dict()}",
        tier=Tier.BALANCED
    ))
    results.append({
        "input": row.to_dict(),
        "analysis": response.response,
        "cost": response.cost,
        "quality": response.quality
    })

# Save results
results_df = pd.DataFrame(results)
results_df.to_csv("analysis_results.csv", index=False)

print(f"Total cost: ${sum(r['cost'] for r in results)}")
print(f"Average quality: {sum(r['quality'] for r in results) / len(results)}")

client.close()
```

### Async Batch Processing

```python
import asyncio
from mother_sdk import MotherClient, QueryRequest, Tier

async def process_batch(queries):
    client = MotherClient()
    
    # Process all queries concurrently
    tasks = [
        client.query_async(QueryRequest(query=q, tier=Tier.BALANCED))
        for q in queries
    ]
    
    responses = await asyncio.gather(*tasks)
    
    for query, response in zip(queries, responses):
        print(f"Q: {query}")
        print(f"A: {response.response}\n")
    
    await client.aclose()

queries = ["What is AI?", "Explain ML", "What is DL?"]
asyncio.run(process_batch(queries))
```

## API Reference

### MotherClient

#### Constructor

```python
MotherClient(config: Optional[MotherConfig] = None)
```

#### Synchronous Methods

- `query(request: QueryRequest) -> QueryResponse` - Synchronous query
- `query_async_job(request: QueryRequest) -> AsyncQueryResponse` - Start async query
- `get_job_status(job_id: str) -> AsyncQueryResponse` - Get job status
- `get_current_user() -> User` - Get current user
- `logout() -> None` - Logout
- `get_health() -> HealthResponse` - System health
- `get_cache_stats() -> CacheStats` - Cache statistics
- `get_queue_stats() -> QueueStats` - Queue statistics
- `get_login_url(return_path: str = "/") -> str` - Get OAuth login URL
- `set_session_cookie(cookie: str) -> None` - Set session cookie
- `close() -> None` - Close HTTP client

#### Asynchronous Methods

- `query_async(request: QueryRequest) -> QueryResponse` - Async query
- `query_async_job_async(request: QueryRequest) -> AsyncQueryResponse` - Start async query
- `get_job_status_async(job_id: str) -> AsyncQueryResponse` - Get job status
- `get_current_user_async() -> User` - Get current user
- `logout_async() -> None` - Logout
- `get_health_async() -> HealthResponse` - System health
- `get_cache_stats_async() -> CacheStats` - Cache statistics
- `get_queue_stats_async() -> QueueStats` - Queue statistics
- `aclose() -> None` - Close async HTTP client

### Models

All models use Pydantic for validation and serialization:

- `QueryRequest` - Query request with validation
- `QueryResponse` - Query response with parsed data
- `AsyncQueryResponse` - Async query response with job tracking
- `HealthResponse` - System health information
- `CacheStats` - Cache statistics
- `QueueStats` - Queue statistics
- `User` - User information
- `Tier` - Enum for tier selection (FAST=1, BALANCED=2, PREMIUM=3)

### Exceptions

- `MotherAPIError` - Base exception for all API errors
  - `message: str` - Error message
  - `code: str` - Error code
  - `status_code: int` - HTTP status code
  - `data: Optional[Any]` - Additional error data

## Development

### Install Development Dependencies

```bash
pip install -e ".[dev]"
```

### Run Tests

```bash
pytest
```

### Format Code

```bash
black mother_sdk/
```

### Type Checking

```bash
mypy mother_sdk/
```

### Lint

```bash
ruff check mother_sdk/
```

## Contributing

Contributions are welcome! Please open an issue or PR on GitHub.

## License

MIT © Everton Luis Garcia

## Links

- [API Documentation](https://mother-interface-qtvghovzxa-ts.a.run.app/api/docs)
- [GitHub Repository](https://github.com/Ehrvi/mother-v7-improvements)
- [Report Issues](https://github.com/Ehrvi/mother-v7-improvements/issues)

## Support

For questions or support, please open an issue on GitHub or contact everton@intelltech.com.br
