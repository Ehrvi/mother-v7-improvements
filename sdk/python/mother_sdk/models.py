"""Data models for MOTHER SDK using Pydantic for validation."""

from enum import IntEnum
from typing import Optional, Literal
from pydantic import BaseModel, Field, ConfigDict


class Tier(IntEnum):
    """
    Query tier selection.
    
    - Tier 1: Fast, cheap models (gpt-4o-mini, claude-3-haiku)
    - Tier 2: Balanced models (gpt-4o, claude-3.5-sonnet)
    - Tier 3: Premium models (o1, o3-mini) - uses async queue
    """
    FAST = 1
    BALANCED = 2
    PREMIUM = 3


class QueryRequest(BaseModel):
    """Request model for MOTHER queries."""
    
    query: str = Field(..., description="The query text to send to MOTHER")
    tier: Tier = Field(default=Tier.BALANCED, description="Tier selection (1-3)")
    context: Optional[str] = Field(default=None, description="Optional context for the query")
    
    model_config = ConfigDict(use_enum_values=True)


class QueryResponse(BaseModel):
    """Response model for MOTHER queries."""
    
    response: str = Field(..., description="The AI-generated response")
    model: str = Field(..., description="Model used for this query")
    tier: int = Field(..., description="Tier used (1-3)")
    cost: float = Field(..., description="Cost in USD")
    quality: int = Field(..., description="Quality score (0-100)")
    response_time: int = Field(..., alias="responseTime", description="Response time in milliseconds")
    cached: bool = Field(..., description="Whether response was served from cache")
    
    model_config = ConfigDict(populate_by_name=True)


class AsyncQueryResponse(BaseModel):
    """Response model for async MOTHER queries."""
    
    job_id: str = Field(..., alias="jobId", description="Job ID for tracking")
    state: Literal["waiting", "active", "completed", "failed"] = Field(
        ..., description="Current job state"
    )
    progress: int = Field(..., description="Job progress (0-100)")
    result: Optional[QueryResponse] = Field(default=None, description="Result (only when completed)")
    error: Optional[str] = Field(default=None, description="Error message (only when failed)")
    
    model_config = ConfigDict(populate_by_name=True)


class DatabaseInfo(BaseModel):
    """Database connection information."""
    
    connected: bool
    response_time: int = Field(..., alias="responseTime")
    
    model_config = ConfigDict(populate_by_name=True)


class RedisInfo(BaseModel):
    """Redis connection information."""
    
    connected: bool
    response_time: int = Field(..., alias="responseTime")
    
    model_config = ConfigDict(populate_by_name=True)


class MemoryInfo(BaseModel):
    """Memory usage information."""
    
    used: int
    heap: int
    rss: int


class HealthResponse(BaseModel):
    """System health response."""
    
    status: Literal["healthy", "degraded", "unhealthy"]
    timestamp: str
    uptime: int
    memory: MemoryInfo
    database: DatabaseInfo
    redis: Optional[RedisInfo] = None
    environment: str


class CacheStats(BaseModel):
    """Cache statistics."""
    
    hits: int
    misses: int
    hit_rate: float = Field(..., alias="hitRate")
    keys: int
    memory: int
    
    model_config = ConfigDict(populate_by_name=True)


class QueueStats(BaseModel):
    """Queue statistics."""
    
    waiting: int
    active: int
    completed: int
    failed: int


class User(BaseModel):
    """User information."""
    
    id: str
    name: str
    email: str
    role: str
