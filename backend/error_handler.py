"""
Secure Error Handler
Provides secure error handling that prevents information disclosure
"""

import logging
import traceback
from typing import Dict, Any, Optional
from fastapi import HTTPException
from enum import Enum

logger = logging.getLogger(__name__)


class ErrorLevel(Enum):
    """Error severity levels"""

    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class SecureErrorHandler:
    """
    Handles errors securely without exposing sensitive information
    """

    # Safe error messages that don't reveal system details
    SAFE_ERROR_MESSAGES = {
        "validation_error": "Invalid input data",
        "authentication_error": "Authentication failed",
        "authorization_error": "Access denied",
        "not_found_error": "Resource not found",
        "database_error": "Database operation failed",
        "file_error": "File operation failed",
        "network_error": "Network operation failed",
        "processing_error": "Processing failed",
        "rate_limit_error": "Rate limit exceeded",
        "internal_error": "Internal server error",
    }

    def __init__(self, debug_mode: bool = False):
        self.debug_mode = debug_mode

    def handle_error(
        self,
        error: Exception,
        error_type: str = "internal_error",
        user_message: Optional[str] = None,
        log_level: ErrorLevel = ErrorLevel.MEDIUM,
    ) -> Dict[str, Any]:
        """
        Handle error securely

        Args:
            error: The original exception
            error_type: Type of error for safe message lookup
            user_message: Custom user-safe message
            log_level: Logging level for the error

        Returns:
            Safe error response dictionary
        """
        # Get safe message
        safe_message = user_message or self.SAFE_ERROR_MESSAGES.get(
            error_type, self.SAFE_ERROR_MESSAGES["internal_error"]
        )

        # Log the actual error details
        self._log_error(error, error_type, log_level)

        # Return safe response
        response = {"error": True, "message": safe_message, "error_type": error_type}

        # Only include details in debug mode
        if self.debug_mode:
            response["debug_info"] = {
                "exception_type": type(error).__name__,
                "exception_message": str(error),
            }

        return response

    def _log_error(self, error: Exception, error_type: str, level: ErrorLevel):
        """Log error with appropriate level"""
        error_msg = (
            f"Error type: {error_type}, Exception: {type(error).__name__}: {str(error)}"
        )

        if level == ErrorLevel.CRITICAL:
            logger.critical(error_msg, exc_info=True)
        elif level == ErrorLevel.HIGH:
            logger.error(error_msg, exc_info=True)
        elif level == ErrorLevel.MEDIUM:
            logger.warning(error_msg)
        else:
            logger.info(error_msg)

    def create_http_exception(
        self,
        status_code: int,
        error_type: str = "internal_error",
        user_message: Optional[str] = None,
    ) -> HTTPException:
        """
        Create secure HTTPException

        Args:
            status_code: HTTP status code
            error_type: Type of error
            user_message: Custom user message

        Returns:
            HTTPException with safe details
        """
        safe_message = user_message or self.SAFE_ERROR_MESSAGES.get(
            error_type, self.SAFE_ERROR_MESSAGES["internal_error"]
        )

        return HTTPException(status_code=status_code, detail=safe_message)


# Global error handler instance
error_handler = SecureErrorHandler(debug_mode=False)  # Set to True only in development


def safe_error_response(
    error: Exception,
    error_type: str = "internal_error",
    user_message: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Convenience function for safe error handling

    Args:
        error: The exception
        error_type: Error type for categorization
        user_message: User-friendly message

    Returns:
        Safe error response
    """
    return error_handler.handle_error(error, error_type, user_message)


def safe_http_exception(
    status_code: int,
    error_type: str = "internal_error",
    user_message: Optional[str] = None,
) -> HTTPException:
    """
    Convenience function for safe HTTP exceptions

    Args:
        status_code: HTTP status code
        error_type: Error type
        user_message: User message

    Returns:
        HTTPException with safe details
    """
    return error_handler.create_http_exception(status_code, error_type, user_message)


# Common error response functions
def validation_error(message: str = None) -> Dict[str, Any]:
    """Return safe validation error response"""
    return safe_error_response(
        ValueError("Validation failed"), "validation_error", message
    )


def not_found_error(resource: str = "Resource") -> Dict[str, Any]:
    """Return safe not found error response"""
    return safe_error_response(
        KeyError("Not found"), "not_found_error", f"{resource} not found"
    )


def authentication_error() -> Dict[str, Any]:
    """Return safe authentication error response"""
    return safe_error_response(
        PermissionError("Authentication failed"), "authentication_error"
    )


def rate_limit_error() -> Dict[str, Any]:
    """Return safe rate limit error response"""
    return safe_error_response(Exception("Rate limit exceeded"), "rate_limit_error")


def database_error() -> Dict[str, Any]:
    """Return safe database error response"""
    return safe_error_response(Exception("Database error"), "database_error")
