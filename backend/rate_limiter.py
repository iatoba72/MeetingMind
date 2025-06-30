"""
Simple Rate Limiter
Provides basic rate limiting functionality to prevent DoS attacks
"""

import time
from typing import Dict, Optional
from collections import defaultdict, deque
import logging
import threading

logger = logging.getLogger(__name__)


class RateLimiter:
    """
    Simple in-memory rate limiter using sliding window
    """

    def __init__(self):
        self._requests = defaultdict(deque)
        self._lock = threading.Lock()

    def is_allowed(self, identifier: str, limit: int = 100, window: int = 60) -> bool:
        """
        Check if request is allowed based on rate limit

        Args:
            identifier: Unique identifier (IP, user ID, etc.)
            limit: Maximum requests allowed
            window: Time window in seconds

        Returns:
            True if request is allowed, False otherwise
        """
        current_time = time.time()

        with self._lock:
            # Get request history for this identifier
            requests = self._requests[identifier]

            # Remove requests outside the time window
            while requests and requests[0] <= current_time - window:
                requests.popleft()

            # Check if limit exceeded
            if len(requests) >= limit:
                return False

            # Add current request
            requests.append(current_time)
            return True

    def cleanup_expired(self, max_age: int = 3600):
        """
        Clean up expired entries to prevent memory growth

        Args:
            max_age: Maximum age in seconds for keeping entries
        """
        current_time = time.time()
        cutoff_time = current_time - max_age

        with self._lock:
            expired_keys = []
            for identifier, requests in self._requests.items():
                # Remove old requests
                while requests and requests[0] <= cutoff_time:
                    requests.popleft()

                # Mark empty queues for removal
                if not requests:
                    expired_keys.append(identifier)

            # Remove empty entries
            for key in expired_keys:
                del self._requests[key]


# Global rate limiter instance
rate_limiter = RateLimiter()


def check_rate_limit(identifier: str, limit: int = 100, window: int = 60) -> bool:
    """
    Convenience function to check rate limit

    Args:
        identifier: Unique identifier
        limit: Request limit
        window: Time window in seconds

    Returns:
        True if allowed, False if rate limited
    """
    return rate_limiter.is_allowed(identifier, limit, window)


# Rate limiting decorators for different endpoints
def websocket_rate_limit(identifier: str) -> bool:
    """Rate limit for WebSocket connections: 1000 messages per 60 seconds"""
    return check_rate_limit(f"ws_{identifier}", limit=1000, window=60)


def api_rate_limit(identifier: str) -> bool:
    """Rate limit for API endpoints: 100 requests per 60 seconds"""
    return check_rate_limit(f"api_{identifier}", limit=100, window=60)


def audio_upload_rate_limit(identifier: str) -> bool:
    """Rate limit for audio uploads: 50 uploads per 60 seconds"""
    return check_rate_limit(f"audio_{identifier}", limit=50, window=60)


def file_upload_rate_limit(identifier: str) -> bool:
    """Rate limit for file uploads: 10 uploads per 60 seconds"""
    return check_rate_limit(f"file_{identifier}", limit=10, window=60)


# Periodic cleanup task
import asyncio


async def cleanup_rate_limiter():
    """Periodic cleanup task to prevent memory growth"""
    while True:
        try:
            rate_limiter.cleanup_expired()
            await asyncio.sleep(300)  # Run every 5 minutes
        except Exception as e:
            logger.error(f"Rate limiter cleanup error: {e}")
            await asyncio.sleep(60)  # Retry after 1 minute on error
