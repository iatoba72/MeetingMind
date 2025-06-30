"""
WebSocket Security and Input Validation
Provides security functions for WebSocket message handling
"""

import json
import re
from typing import Dict, Any, Optional
from pydantic import BaseModel, ValidationError, validator
import logging

logger = logging.getLogger(__name__)

# Maximum message size (1MB)
MAX_MESSAGE_SIZE = 1024 * 1024
# Maximum string field length
MAX_STRING_LENGTH = 10000
# Maximum nested object depth
MAX_DEPTH = 10


class WebSocketMessage(BaseModel):
    """Base model for WebSocket message validation"""

    type: str
    data: Dict[str, Any]
    timestamp: Optional[str] = None

    @validator("type")
    def validate_type(cls, v):
        # Only allow alphanumeric and underscore
        if not re.match(r"^[a-zA-Z0-9_]+$", v):
            raise ValueError("Invalid message type format")
        if len(v) > 50:
            raise ValueError("Message type too long")
        return v

    @validator("data")
    def validate_data(cls, v):
        # Check depth and size
        if get_depth(v) > MAX_DEPTH:
            raise ValueError("Data structure too deeply nested")
        return v


class ChatMessage(BaseModel):
    """Chat message validation"""

    message: str
    sender_name: Optional[str] = None

    @validator("message")
    def validate_message(cls, v):
        if len(v) > MAX_STRING_LENGTH:
            raise ValueError("Message too long")
        # Basic XSS prevention
        if "<script" in v.lower() or "javascript:" in v.lower():
            raise ValueError("Invalid message content")
        return v

    @validator("sender_name")
    def validate_sender_name(cls, v):
        if v and len(v) > 100:
            raise ValueError("Sender name too long")
        if v and not re.match(r"^[a-zA-Z0-9\s._-]+$", v):
            raise ValueError("Invalid sender name format")
        return v


class AudioConfig(BaseModel):
    """Audio configuration validation"""

    sample_rate: Optional[int] = 16000
    channels: Optional[int] = 1
    format: Optional[str] = "wav"

    @validator("sample_rate")
    def validate_sample_rate(cls, v):
        if v and v not in [8000, 16000, 22050, 44100, 48000]:
            raise ValueError("Invalid sample rate")
        return v

    @validator("channels")
    def validate_channels(cls, v):
        if v and v not in [1, 2]:
            raise ValueError("Invalid channel count")
        return v

    @validator("format")
    def validate_format(cls, v):
        if v and v not in ["wav", "mp3", "ogg", "webm"]:
            raise ValueError("Invalid audio format")
        return v


def get_depth(obj, depth=0):
    """Calculate the depth of nested dictionaries/lists"""
    if depth > MAX_DEPTH:  # Prevent infinite recursion
        return depth

    if isinstance(obj, dict):
        return max(get_depth(v, depth + 1) for v in obj.values()) if obj else depth
    elif isinstance(obj, list):
        return max(get_depth(item, depth + 1) for item in obj) if obj else depth
    else:
        return depth


def validate_websocket_message(raw_message: str) -> Optional[Dict[str, Any]]:
    """
    Validate and parse WebSocket message
    Returns parsed message if valid, None if invalid
    """
    try:
        # Check message size
        if len(raw_message) > MAX_MESSAGE_SIZE:
            logger.warning(f"Message too large: {len(raw_message)} bytes")
            return None

        # Parse JSON
        try:
            message_data = json.loads(raw_message)
        except json.JSONDecodeError as e:
            logger.warning(f"Invalid JSON in WebSocket message: {e}")
            return None

        # Validate base structure
        try:
            validated_message = WebSocketMessage(**message_data)
        except ValidationError as e:
            logger.warning(f"WebSocket message validation failed: {e}")
            return None

        # Type-specific validation
        message_type = validated_message.type
        message_data_obj = validated_message.data

        if message_type == "chat_message":
            try:
                ChatMessage(**message_data_obj)
            except ValidationError as e:
                logger.warning(f"Chat message validation failed: {e}")
                return None

        elif message_type == "audio_start_session":
            config = message_data_obj.get("config", {})
            try:
                AudioConfig(**config)
            except ValidationError as e:
                logger.warning(f"Audio config validation failed: {e}")
                return None

        elif message_type == "audio_chunk_data":
            # Validate base64 encoded data
            audio_data = message_data_obj.get("audio_data", "")
            if not validate_base64_audio(audio_data):
                logger.warning("Invalid base64 audio data")
                return None

        return validated_message.dict()

    except Exception as e:
        logger.error(f"Unexpected error validating WebSocket message: {e}")
        return None


def validate_base64_audio(data: str) -> bool:
    """Validate base64 encoded audio data"""
    import base64

    try:
        # Check if it's valid base64
        decoded = base64.b64decode(data, validate=True)

        # Check size limits (10MB max)
        if len(decoded) > 10 * 1024 * 1024:
            return False

        # Basic audio format validation (check for common headers)
        # WAV files start with "RIFF"
        # MP3 files start with "ID3" or have sync frame
        if len(decoded) > 4:
            header = decoded[:4]
            if header == b"RIFF" or header[:3] == b"ID3":
                return True
            # Check for MP3 sync frame
            if len(decoded) > 2 and (
                decoded[0] == 0xFF and (decoded[1] & 0xE0) == 0xE0
            ):
                return True

        return True  # Allow other formats for now

    except Exception:
        return False


def sanitize_string(value: str, max_length: int = MAX_STRING_LENGTH) -> str:
    """Sanitize string input"""
    if not isinstance(value, str):
        return str(value)[:max_length]

    # Remove potential XSS patterns
    value = re.sub(
        r"<script[^>]*>.*?</script>", "", value, flags=re.IGNORECASE | re.DOTALL
    )
    value = re.sub(r"javascript:", "", value, flags=re.IGNORECASE)
    value = re.sub(r"on\w+\s*=", "", value, flags=re.IGNORECASE)

    return value[:max_length]


def validate_client_id(client_id: str) -> bool:
    """Validate client ID format"""
    if not isinstance(client_id, str):
        return False

    # Only allow alphanumeric, underscore, hyphen
    if not re.match(r"^[a-zA-Z0-9_-]+$", client_id):
        return False

    # Length check
    if len(client_id) < 1 or len(client_id) > 100:
        return False

    return True
