"""
Comprehensive validation utilities for jitter buffer packet handling
Provides secure packet validation and sanitization
"""

import logging
import time
from typing import Any, Dict, List, Optional, Union
from dataclasses import is_dataclass

logger = logging.getLogger(__name__)


class PacketSecurityValidator:
    """Security-focused packet validation"""

    # Security limits
    MAX_PACKET_SIZE = 1024 * 1024  # 1MB
    MAX_SEQUENCE_NUMBER = 0xFFFFFFFF  # 32-bit limit
    MAX_SOURCE_ID_LENGTH = 256
    MAX_FUTURE_TIMESTAMP_OFFSET = 3600  # 1 hour
    MAX_PAST_TIMESTAMP_OFFSET = 86400  # 24 hours
    MAX_DURATION_MS = 1000  # 1 second

    # Valid audio parameters
    VALID_SAMPLE_RATES = [8000, 16000, 22050, 44100, 48000, 96000]
    VALID_CHANNEL_RANGE = (1, 8)

    @staticmethod
    def validate_packet_structure(packet: Any) -> bool:
        """Validate packet has correct structure"""
        try:
            # Check if it's a dataclass (AudioPacket should be)
            if not is_dataclass(packet):
                logger.error(f"Packet is not a dataclass: {type(packet)}")
                return False

            # Check required fields exist
            required_fields = [
                "sequence_number",
                "timestamp",
                "arrival_time",
                "data",
                "source_id",
                "sample_rate",
                "channels",
                "duration_ms",
                "state",
            ]

            for field in required_fields:
                if not hasattr(packet, field):
                    logger.error(f"Packet missing required field: {field}")
                    return False

            return True

        except Exception as e:
            logger.error(f"Error validating packet structure: {e}")
            return False

    @staticmethod
    def validate_sequence_number(seq_num: Any) -> bool:
        """Validate sequence number is safe"""
        try:
            if not isinstance(seq_num, int):
                logger.error(f"Sequence number must be int, got {type(seq_num)}")
                return False

            if seq_num < 0:
                logger.error(f"Sequence number cannot be negative: {seq_num}")
                return False

            if seq_num > PacketSecurityValidator.MAX_SEQUENCE_NUMBER:
                logger.error(f"Sequence number exceeds limit: {seq_num}")
                return False

            return True

        except Exception as e:
            logger.error(f"Error validating sequence number: {e}")
            return False

    @staticmethod
    def validate_timestamp(timestamp: Any, arrival_time: Any = None) -> bool:
        """Validate timestamps are reasonable"""
        try:
            current_time = time.time()

            # Validate timestamp type and range
            if not isinstance(timestamp, (int, float)):
                logger.error(f"Timestamp must be numeric, got {type(timestamp)}")
                return False

            if timestamp < 0:
                logger.error(f"Timestamp cannot be negative: {timestamp}")
                return False

            # Check for reasonable timestamp (not too far in future/past)
            if (
                timestamp
                > current_time + PacketSecurityValidator.MAX_FUTURE_TIMESTAMP_OFFSET
            ):
                logger.error(f"Timestamp too far in future: {timestamp}")
                return False

            if (
                timestamp
                < current_time - PacketSecurityValidator.MAX_PAST_TIMESTAMP_OFFSET
            ):
                logger.error(f"Timestamp too far in past: {timestamp}")
                return False

            # Validate arrival time if provided
            if arrival_time is not None:
                if not isinstance(arrival_time, (int, float)):
                    logger.error(
                        f"Arrival time must be numeric, got {type(arrival_time)}"
                    )
                    return False

                if arrival_time < 0:
                    logger.error(f"Arrival time cannot be negative: {arrival_time}")
                    return False

            return True

        except Exception as e:
            logger.error(f"Error validating timestamp: {e}")
            return False

    @staticmethod
    def validate_audio_data(data: Any) -> bool:
        """Validate audio data is safe"""
        try:
            if not isinstance(data, (bytes, bytearray)):
                logger.error(f"Audio data must be bytes, got {type(data)}")
                return False

            if len(data) > PacketSecurityValidator.MAX_PACKET_SIZE:
                logger.error(f"Audio data exceeds size limit: {len(data)} bytes")
                return False

            # Additional checks for audio data patterns that might indicate malicious content
            if len(data) > 0:
                # Check for suspicious patterns (all same byte, etc.)
                if len(set(data)) == 1 and len(data) > 1000:
                    logger.warning(
                        f"Audio data contains suspicious pattern (all same byte)"
                    )

                # Check for null bytes at the beginning (potential buffer overflow attempt)
                if data.startswith(b"\x00" * 100):
                    logger.warning(f"Audio data starts with many null bytes")

            return True

        except Exception as e:
            logger.error(f"Error validating audio data: {e}")
            return False

    @staticmethod
    def validate_source_id(source_id: Any) -> bool:
        """Validate source ID is safe"""
        try:
            if not isinstance(source_id, str):
                logger.error(f"Source ID must be string, got {type(source_id)}")
                return False

            if not source_id or len(source_id.strip()) == 0:
                logger.error("Source ID cannot be empty")
                return False

            if len(source_id) > PacketSecurityValidator.MAX_SOURCE_ID_LENGTH:
                logger.error(f"Source ID too long: {len(source_id)} chars")
                return False

            # Check for suspicious characters
            suspicious_chars = ["<", ">", '"', "'", "&", "\x00", "\n", "\r"]
            if any(char in source_id for char in suspicious_chars):
                logger.error(f"Source ID contains suspicious characters: {source_id}")
                return False

            return True

        except Exception as e:
            logger.error(f"Error validating source ID: {e}")
            return False

    @staticmethod
    def validate_audio_parameters(
        sample_rate: Any, channels: Any, duration_ms: Any
    ) -> bool:
        """Validate audio parameters are safe and reasonable"""
        try:
            # Validate sample rate
            if not isinstance(sample_rate, int):
                logger.error(f"Sample rate must be int, got {type(sample_rate)}")
                return False

            if sample_rate not in PacketSecurityValidator.VALID_SAMPLE_RATES:
                logger.error(f"Invalid sample rate: {sample_rate}")
                return False

            # Validate channels
            if not isinstance(channels, int):
                logger.error(f"Channels must be int, got {type(channels)}")
                return False

            min_channels, max_channels = PacketSecurityValidator.VALID_CHANNEL_RANGE
            if not (min_channels <= channels <= max_channels):
                logger.error(f"Invalid channel count: {channels}")
                return False

            # Validate duration
            if not isinstance(duration_ms, (int, float)):
                logger.error(f"Duration must be numeric, got {type(duration_ms)}")
                return False

            if duration_ms <= 0:
                logger.error(f"Duration must be positive: {duration_ms}")
                return False

            if duration_ms > PacketSecurityValidator.MAX_DURATION_MS:
                logger.error(f"Duration too large: {duration_ms}")
                return False

            return True

        except Exception as e:
            logger.error(f"Error validating audio parameters: {e}")
            return False

    @staticmethod
    def sanitize_packet_data(packet_data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Sanitize packet data and return safe version"""
        try:
            sanitized = {}

            # Sanitize sequence number
            seq_num = packet_data.get("sequence_number", 0)
            if isinstance(seq_num, (int, float)):
                sanitized["sequence_number"] = max(
                    0, min(int(seq_num), PacketSecurityValidator.MAX_SEQUENCE_NUMBER)
                )
            else:
                logger.error(f"Cannot sanitize sequence number: {seq_num}")
                return None

            # Sanitize timestamps
            current_time = time.time()
            timestamp = packet_data.get("timestamp", current_time)
            if isinstance(timestamp, (int, float)):
                # Clamp to reasonable range
                min_time = (
                    current_time - PacketSecurityValidator.MAX_PAST_TIMESTAMP_OFFSET
                )
                max_time = (
                    current_time + PacketSecurityValidator.MAX_FUTURE_TIMESTAMP_OFFSET
                )
                sanitized["timestamp"] = max(min_time, min(float(timestamp), max_time))
            else:
                sanitized["timestamp"] = current_time

            arrival_time = packet_data.get("arrival_time", current_time)
            if isinstance(arrival_time, (int, float)):
                sanitized["arrival_time"] = max(0, float(arrival_time))
            else:
                sanitized["arrival_time"] = current_time

            # Sanitize audio data
            data = packet_data.get("data", b"")
            if isinstance(data, (bytes, bytearray)):
                # Truncate if too large
                if len(data) > PacketSecurityValidator.MAX_PACKET_SIZE:
                    logger.warning(
                        f"Truncating oversized packet data: {len(data)} bytes"
                    )
                    data = data[: PacketSecurityValidator.MAX_PACKET_SIZE]
                sanitized["data"] = bytes(data)
            else:
                logger.error(f"Invalid data type for audio data: {type(data)}")
                return None

            # Sanitize source ID
            source_id = packet_data.get("source_id", "unknown")
            if isinstance(source_id, str):
                # Remove dangerous characters and truncate
                safe_chars = "".join(
                    c
                    for c in source_id
                    if c.isprintable() and c not in "<>\"'&\x00\n\r"
                )
                sanitized["source_id"] = (
                    safe_chars[: PacketSecurityValidator.MAX_SOURCE_ID_LENGTH]
                    or "unknown"
                )
            else:
                sanitized["source_id"] = "unknown"

            # Sanitize audio parameters
            sample_rate = packet_data.get("sample_rate", 48000)
            if sample_rate in PacketSecurityValidator.VALID_SAMPLE_RATES:
                sanitized["sample_rate"] = sample_rate
            else:
                sanitized["sample_rate"] = 48000  # Default to safe value

            channels = packet_data.get("channels", 2)
            min_channels, max_channels = PacketSecurityValidator.VALID_CHANNEL_RANGE
            if isinstance(channels, int) and min_channels <= channels <= max_channels:
                sanitized["channels"] = channels
            else:
                sanitized["channels"] = 2  # Default to stereo

            duration_ms = packet_data.get("duration_ms", 20)
            if (
                isinstance(duration_ms, (int, float))
                and 0 < duration_ms <= PacketSecurityValidator.MAX_DURATION_MS
            ):
                sanitized["duration_ms"] = float(duration_ms)
            else:
                sanitized["duration_ms"] = 20.0  # Default duration

            return sanitized

        except Exception as e:
            logger.error(f"Error sanitizing packet data: {e}")
            return None


class JitterBufferSecurityMonitor:
    """Security monitoring for jitter buffer operations"""

    def __init__(self):
        self.validation_failures = 0
        self.suspicious_packets = 0
        self.blocked_packets = 0
        self.start_time = time.time()

    def record_validation_failure(self, reason: str, packet_info: str = ""):
        """Record a validation failure"""
        self.validation_failures += 1
        logger.warning(f"Packet validation failure: {reason} - {packet_info}")

    def record_suspicious_packet(self, reason: str, packet_info: str = ""):
        """Record a suspicious packet"""
        self.suspicious_packets += 1
        logger.warning(f"Suspicious packet detected: {reason} - {packet_info}")

    def record_blocked_packet(self, reason: str, packet_info: str = ""):
        """Record a blocked packet"""
        self.blocked_packets += 1
        logger.info(f"Packet blocked: {reason} - {packet_info}")

    def get_security_statistics(self) -> Dict[str, Any]:
        """Get security monitoring statistics"""
        uptime = time.time() - self.start_time
        return {
            "uptime_seconds": uptime,
            "validation_failures": self.validation_failures,
            "suspicious_packets": self.suspicious_packets,
            "blocked_packets": self.blocked_packets,
            "failure_rate": self.validation_failures / uptime if uptime > 0 else 0,
            "suspicious_rate": self.suspicious_packets / uptime if uptime > 0 else 0,
            "blocked_rate": self.blocked_packets / uptime if uptime > 0 else 0,
        }

    def check_security_thresholds(self) -> List[str]:
        """Check if security thresholds are exceeded"""
        warnings = []
        stats = self.get_security_statistics()

        # Check for high failure rates
        if stats["failure_rate"] > 10:  # More than 10 failures per second
            warnings.append("High validation failure rate detected")

        if stats["suspicious_rate"] > 5:  # More than 5 suspicious packets per second
            warnings.append("High suspicious packet rate detected")

        if stats["blocked_rate"] > 20:  # More than 20 blocked packets per second
            warnings.append("High packet blocking rate detected")

        return warnings


# Global security monitor instance
security_monitor = JitterBufferSecurityMonitor()


def get_security_monitor() -> JitterBufferSecurityMonitor:
    """Get the global security monitor instance"""
    return security_monitor
