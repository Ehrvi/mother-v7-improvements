"""MOTHER API client implementation."""

import json
import urllib.parse
from typing import Optional, Dict, Any
from dataclasses import dataclass, field

import httpx

from .models import (
    QueryRequest,
    QueryResponse,
    AsyncQueryResponse,
    HealthResponse,
    CacheStats,
    QueueStats,
    User,
)
from .exceptions import MotherAPIError


@dataclass
class MotherConfig:
    """Configuration for MOTHER client."""
    
    base_url: str = "https://mother-interface-233196174701.australia-southeast1.run.app"
    session_cookie: Optional[str] = None
    timeout: float = 30.0
    debug: bool = False
    headers: Dict[str, str] = field(default_factory=dict)


class MotherClient:
    """
    MOTHER API client.
    
    Supports both synchronous and asynchronous operations.
    
    Example:
        ```python
        # Synchronous usage
        client = MotherClient()
        response = client.query(QueryRequest(query="What is AI?", tier=2))
        print(response.response)
        
        # Asynchronous usage
        import asyncio
        
        async def main():
            client = MotherClient()
            response = await client.query_async(QueryRequest(query="What is AI?", tier=2))
            print(response.response)
        
        asyncio.run(main())
        ```
    """
    
    def __init__(self, config: Optional[MotherConfig] = None) -> None:
        """
        Initialize MOTHER client.
        
        Args:
            config: Client configuration. If None, uses defaults.
        """
        self.config = config or MotherConfig()
        self._client: Optional[httpx.Client] = None
        self._async_client: Optional[httpx.AsyncClient] = None
    
    def __enter__(self) -> "MotherClient":
        """Context manager entry."""
        return self
    
    def __exit__(self, *args: Any) -> None:
        """Context manager exit."""
        self.close()
    
    async def __aenter__(self) -> "MotherClient":
        """Async context manager entry."""
        return self
    
    async def __aexit__(self, *args: Any) -> None:
        """Async context manager exit."""
        await self.aclose()
    
    @property
    def client(self) -> httpx.Client:
        """Get or create synchronous HTTP client."""
        if self._client is None:
            self._client = httpx.Client(
                base_url=self.config.base_url,
                timeout=self.config.timeout,
                headers=self._get_headers(),
            )
        return self._client
    
    @property
    def async_client(self) -> httpx.AsyncClient:
        """Get or create asynchronous HTTP client."""
        if self._async_client is None:
            self._async_client = httpx.AsyncClient(
                base_url=self.config.base_url,
                timeout=self.config.timeout,
                headers=self._get_headers(),
            )
        return self._async_client
    
    def _get_headers(self) -> Dict[str, str]:
        """Get request headers."""
        headers = {
            "Content-Type": "application/json",
            **self.config.headers,
        }
        if self.config.session_cookie:
            headers["Cookie"] = self.config.session_cookie
        return headers
    
    def _handle_response(self, response: httpx.Response) -> Any:
        """
        Handle HTTP response.
        
        Args:
            response: HTTP response
            
        Returns:
            Parsed response data
            
        Raises:
            MotherAPIError: If request failed
        """
        if self.config.debug:
            print(f"[MOTHER SDK] {response.request.method} {response.url} -> {response.status_code}")
        
        if not response.is_success:
            try:
                error = response.json()
            except Exception:
                error = {"message": response.text or response.reason_phrase}
            
            raise MotherAPIError(
                message=error.get("message", "Request failed"),
                code=error.get("code", "UNKNOWN_ERROR"),
                status_code=response.status_code,
                data=error.get("data"),
            )
        
        data = response.json()
        
        # Handle tRPC batch response format
        if isinstance(data, list) and len(data) > 0:
            return data[0]["result"]["data"]
        
        # Handle tRPC single response format
        if isinstance(data, dict) and "result" in data:
            return data["result"]["data"]
        
        return data
    
    def get_login_url(self, return_path: str = "/") -> str:
        """
        Get OAuth login URL.
        
        Args:
            return_path: Path to return to after login
            
        Returns:
            Login URL
        """
        state = json.dumps({
            "origin": self.config.base_url,
            "returnPath": return_path,
        })
        encoded_state = urllib.parse.quote(state)
        return f"{self.config.base_url}/api/oauth/login?state={encoded_state}"
    
    def set_session_cookie(self, cookie: str) -> None:
        """
        Set session cookie.
        
        Args:
            cookie: Session cookie value
        """
        self.config.session_cookie = cookie
        # Reset clients to pick up new cookie
        if self._client:
            self._client.close()
            self._client = None
        if self._async_client:
            import asyncio
            asyncio.create_task(self._async_client.aclose())
            self._async_client = None
    
    # Synchronous methods
    
    def query(self, request: QueryRequest) -> QueryResponse:
        """
        Query MOTHER synchronously.
        
        Args:
            request: Query request
            
        Returns:
            Query response
        """
        response = self.client.post(
            "/api/trpc/mother.query",
            json={"json": request.model_dump()},
        )
        data = self._handle_response(response)
        return QueryResponse.model_validate(data)
    
    def query_async_job(self, request: QueryRequest) -> AsyncQueryResponse:
        """
        Query MOTHER asynchronously (returns job ID immediately).
        
        Args:
            request: Query request
            
        Returns:
            Async query response with job ID
        """
        response = self.client.post(
            "/api/trpc/mother.queryAsync",
            json={"json": request.model_dump()},
        )
        data = self._handle_response(response)
        return AsyncQueryResponse.model_validate(data)
    
    def get_job_status(self, job_id: str) -> AsyncQueryResponse:
        """
        Get job status for async query.
        
        Args:
            job_id: Job ID
            
        Returns:
            Async query response with current status
        """
        input_data = urllib.parse.quote(json.dumps({"json": {"jobId": job_id}}))
        response = self.client.get(f"/api/trpc/queue.job?input={input_data}")
        data = self._handle_response(response)
        return AsyncQueryResponse.model_validate(data)
    
    def get_current_user(self) -> User:
        """
        Get current authenticated user.
        
        Returns:
            User information
        """
        response = self.client.get(
            "/api/trpc/auth.me?batch=1&input=%7B%220%22%3A%7B%22json%22%3Anull%7D%7D"
        )
        data = self._handle_response(response)
        return User.model_validate(data)
    
    def logout(self) -> None:
        """Logout current user."""
        self.client.post("/api/trpc/auth.logout", json={"json": None})
        self.config.session_cookie = None
    
    def get_health(self) -> HealthResponse:
        """
        Get system health status.
        
        Returns:
            Health response
        """
        response = self.client.get("/api/trpc/health.detailed")
        data = self._handle_response(response)
        return HealthResponse.model_validate(data)
    
    def get_cache_stats(self) -> CacheStats:
        """
        Get cache statistics.
        
        Returns:
            Cache statistics
        """
        response = self.client.get("/api/trpc/health.cache")
        data = self._handle_response(response)
        return CacheStats.model_validate(data)
    
    def get_queue_stats(self) -> QueueStats:
        """
        Get queue statistics.
        
        Returns:
            Queue statistics
        """
        response = self.client.get("/api/trpc/queue.stats")
        data = self._handle_response(response)
        return QueueStats.model_validate(data)
    
    # Asynchronous methods
    
    async def query_async(self, request: QueryRequest) -> QueryResponse:
        """
        Query MOTHER asynchronously.
        
        Args:
            request: Query request
            
        Returns:
            Query response
        """
        response = await self.async_client.post(
            "/api/trpc/mother.query",
            json={"json": request.model_dump()},
        )
        data = self._handle_response(response)
        return QueryResponse.model_validate(data)
    
    async def query_async_job_async(self, request: QueryRequest) -> AsyncQueryResponse:
        """
        Query MOTHER asynchronously (returns job ID immediately).
        
        Args:
            request: Query request
            
        Returns:
            Async query response with job ID
        """
        response = await self.async_client.post(
            "/api/trpc/mother.queryAsync",
            json={"json": request.model_dump()},
        )
        data = self._handle_response(response)
        return AsyncQueryResponse.model_validate(data)
    
    async def get_job_status_async(self, job_id: str) -> AsyncQueryResponse:
        """
        Get job status for async query.
        
        Args:
            job_id: Job ID
            
        Returns:
            Async query response with current status
        """
        input_data = urllib.parse.quote(json.dumps({"json": {"jobId": job_id}}))
        response = await self.async_client.get(f"/api/trpc/queue.job?input={input_data}")
        data = self._handle_response(response)
        return AsyncQueryResponse.model_validate(data)
    
    async def get_current_user_async(self) -> User:
        """
        Get current authenticated user.
        
        Returns:
            User information
        """
        response = await self.async_client.get(
            "/api/trpc/auth.me?batch=1&input=%7B%220%22%3A%7B%22json%22%3Anull%7D%7D"
        )
        data = self._handle_response(response)
        return User.model_validate(data)
    
    async def logout_async(self) -> None:
        """Logout current user."""
        await self.async_client.post("/api/trpc/auth.logout", json={"json": None})
        self.config.session_cookie = None
    
    async def get_health_async(self) -> HealthResponse:
        """
        Get system health status.
        
        Returns:
            Health response
        """
        response = await self.async_client.get("/api/trpc/health.detailed")
        data = self._handle_response(response)
        return HealthResponse.model_validate(data)
    
    async def get_cache_stats_async(self) -> CacheStats:
        """
        Get cache statistics.
        
        Returns:
            Cache statistics
        """
        response = await self.async_client.get("/api/trpc/health.cache")
        data = self._handle_response(response)
        return CacheStats.model_validate(data)
    
    async def get_queue_stats_async(self) -> QueueStats:
        """
        Get queue statistics.
        
        Returns:
            Queue statistics
        """
        response = await self.async_client.get("/api/trpc/queue.stats")
        data = self._handle_response(response)
        return QueueStats.model_validate(data)
    
    # Cleanup methods
    
    def close(self) -> None:
        """Close synchronous HTTP client."""
        if self._client:
            self._client.close()
            self._client = None
    
    async def aclose(self) -> None:
        """Close asynchronous HTTP client."""
        if self._async_client:
            await self._async_client.aclose()
            self._async_client = None
