"""Exceptions for MOTHER SDK."""

from typing import Any, Optional


class MotherAPIError(Exception):
    """Base exception for MOTHER API errors."""
    
    def __init__(
        self,
        message: str,
        code: str,
        status_code: int,
        data: Optional[Any] = None
    ) -> None:
        """
        Initialize MOTHER API error.
        
        Args:
            message: Error message
            code: Error code
            status_code: HTTP status code
            data: Additional error data
        """
        super().__init__(message)
        self.message = message
        self.code = code
        self.status_code = status_code
        self.data = data
    
    def __str__(self) -> str:
        """String representation of the error."""
        return f"{self.code}: {self.message} (HTTP {self.status_code})"
    
    def __repr__(self) -> str:
        """Detailed representation of the error."""
        return (
            f"MotherAPIError(message={self.message!r}, code={self.code!r}, "
            f"status_code={self.status_code}, data={self.data!r})"
        )
