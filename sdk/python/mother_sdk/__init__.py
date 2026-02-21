"""
MOTHER SDK - Official Python client for MOTHER API

MOTHER (Multi-Operational Tiered Hierarchical Execution & Routing)
83% cost reduction | 90+ quality | 7-layer architecture
"""

from .client import MotherClient, MotherConfig
from .models import (
    QueryRequest,
    QueryResponse,
    AsyncQueryResponse,
    HealthResponse,
    CacheStats,
    QueueStats,
    Tier,
)
from .exceptions import MotherAPIError

__version__ = "1.0.0"
__all__ = [
    "MotherClient",
    "MotherConfig",
    "QueryRequest",
    "QueryResponse",
    "AsyncQueryResponse",
    "HealthResponse",
    "CacheStats",
    "QueueStats",
    "Tier",
    "MotherAPIError",
]
