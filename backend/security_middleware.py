"""
Security Middleware
Adds security headers and protections to FastAPI application
"""

from fastapi import Request, Response
from fastapi.middleware.base import BaseHTTPMiddleware
from typing import Callable
import time


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """
    Middleware to add basic security headers
    """

    def __init__(self, app, strict_mode: bool = False):
        super().__init__(app)
        self.strict_mode = strict_mode

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        """Add security headers to response"""

        # Process the request
        response = await call_next(request)

        # Add security headers
        headers = self._get_security_headers(request)

        for header_name, header_value in headers.items():
            response.headers[header_name] = header_value

        return response

    def _get_security_headers(self, request: Request) -> dict:
        """Get security headers based on request"""

        # Basic security headers
        headers = {
            # Prevent MIME type sniffing
            "X-Content-Type-Options": "nosniff",
            # XSS protection
            "X-XSS-Protection": "1; mode=block",
            # Prevent clickjacking
            "X-Frame-Options": "DENY",
            # Referrer policy
            "Referrer-Policy": "strict-origin-when-cross-origin",
            # Remove server information
            "Server": "MeetingMind",
        }

        # Content Security Policy for HTML responses
        if self._is_html_response(request):
            if self.strict_mode:
                # Strict CSP for production
                headers["Content-Security-Policy"] = (
                    "default-src 'self'; "
                    "script-src 'self' 'unsafe-inline'; "
                    "style-src 'self' 'unsafe-inline'; "
                    "img-src 'self' data: blob:; "
                    "connect-src 'self' ws: wss:; "
                    "media-src 'self' blob:; "
                    "object-src 'none'; "
                    "base-uri 'self'"
                )
            else:
                # More permissive CSP for development
                headers["Content-Security-Policy"] = (
                    "default-src 'self' 'unsafe-inline' 'unsafe-eval'; "
                    "connect-src 'self' ws: wss: http: https:; "
                    "img-src 'self' data: blob: http: https:; "
                    "media-src 'self' blob: http: https:"
                )

        # HSTS for HTTPS (only add if connection is secure)
        if request.url.scheme == "https" or self.strict_mode:
            headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"

        return headers

    def _is_html_response(self, request: Request) -> bool:
        """Check if request might return HTML"""
        # Simple heuristic: if path doesn't start with /api/, it might be HTML
        return not request.url.path.startswith("/api/")


class RateLimitMiddleware(BaseHTTPMiddleware):
    """
    Basic rate limiting middleware
    """

    def __init__(self, app, requests_per_minute: int = 60):
        super().__init__(app)
        self.requests_per_minute = requests_per_minute
        self.request_counts = {}
        self.last_cleanup = time.time()

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        """Apply rate limiting"""

        # Get client identifier
        client_ip = self._get_client_ip(request)

        # Check rate limit
        if not self._is_allowed(client_ip):
            return Response(
                content="Rate limit exceeded",
                status_code=429,
                headers={"Retry-After": "60"},
            )

        # Process request
        response = await call_next(request)

        # Add rate limit headers
        remaining = self._get_remaining_requests(client_ip)
        response.headers["X-RateLimit-Limit"] = str(self.requests_per_minute)
        response.headers["X-RateLimit-Remaining"] = str(remaining)
        response.headers["X-RateLimit-Reset"] = str(int(time.time()) + 60)

        return response

    def _get_client_ip(self, request: Request) -> str:
        """Get client IP address"""
        # Check for forwarded headers first
        forwarded_for = request.headers.get("X-Forwarded-For")
        if forwarded_for:
            return forwarded_for.split(",")[0].strip()

        real_ip = request.headers.get("X-Real-IP")
        if real_ip:
            return real_ip

        # Fall back to direct connection
        if hasattr(request, "client") and request.client:
            return request.client.host

        return "unknown"

    def _is_allowed(self, client_ip: str) -> bool:
        """Check if client is within rate limit"""
        current_time = time.time()
        current_minute = int(current_time / 60)

        # Cleanup old entries periodically
        if current_time - self.last_cleanup > 120:  # Every 2 minutes
            self._cleanup_old_entries(current_minute)
            self.last_cleanup = current_time

        # Initialize or update counter
        if client_ip not in self.request_counts:
            self.request_counts[client_ip] = {}

        client_requests = self.request_counts[client_ip]

        # Count request for current minute
        if current_minute not in client_requests:
            client_requests[current_minute] = 0

        client_requests[current_minute] += 1

        # Check if limit exceeded
        return client_requests[current_minute] <= self.requests_per_minute

    def _get_remaining_requests(self, client_ip: str) -> int:
        """Get remaining requests for client"""
        current_minute = int(time.time() / 60)

        if client_ip not in self.request_counts:
            return self.requests_per_minute

        used = self.request_counts[client_ip].get(current_minute, 0)
        return max(0, self.requests_per_minute - used)

    def _cleanup_old_entries(self, current_minute: int):
        """Remove old rate limit entries"""
        cutoff_minute = current_minute - 2  # Keep last 2 minutes

        for client_ip in list(self.request_counts.keys()):
            client_requests = self.request_counts[client_ip]

            # Remove old minutes
            for minute in list(client_requests.keys()):
                if minute < cutoff_minute:
                    del client_requests[minute]

            # Remove empty clients
            if not client_requests:
                del self.request_counts[client_ip]
