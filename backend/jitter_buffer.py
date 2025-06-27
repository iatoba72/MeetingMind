"""
Network Jitter Buffer Implementation for MeetingMind
Handles timing variations, packet loss, and out-of-order delivery for network audio streams
"""

import asyncio
import logging
import time
import threading
from typing import Dict, List, Optional, Callable, Any, Tuple
from dataclasses import dataclass, asdict
from datetime import datetime, timedelta
from enum import Enum
import heapq
import uuid
import statistics
from collections import deque

# Import validation utilities
from .jitter_buffer_validation import (
    PacketSecurityValidator, 
    JitterBufferSecurityMonitor,
    get_security_monitor
)

logger = logging.getLogger(__name__)

class BufferState(Enum):
    FILLING = "filling"
    PLAYING = "playing"
    UNDERRUN = "underrun"
    OVERRUN = "overrun"
    STOPPED = "stopped"

class PacketState(Enum):
    RECEIVED = "received"
    PLAYING = "playing"
    PLAYED = "played"
    LOST = "lost"
    LATE = "late"
    DUPLICATE = "duplicate"

class PacketValidationError(Exception):
    """Exception raised when packet validation fails"""
    pass

@dataclass
class AudioPacket:
    """Represents an audio packet in the jitter buffer"""
    sequence_number: int
    timestamp: float
    arrival_time: float
    data: bytes
    source_id: str
    sample_rate: int
    channels: int
    duration_ms: float
    state: PacketState = PacketState.RECEIVED
    playout_time: Optional[float] = None

    def __post_init__(self):
        """Validate packet data after initialization"""
        self._validate_packet()
    
    def _validate_packet(self):
        """Comprehensive packet validation"""
        # Validate sequence number
        if not isinstance(self.sequence_number, int):
            raise PacketValidationError(f"sequence_number must be int, got {type(self.sequence_number)}")
        if self.sequence_number < 0:
            raise PacketValidationError(f"sequence_number must be non-negative, got {self.sequence_number}")
        if self.sequence_number > 0xFFFFFFFF:  # 32-bit limit
            raise PacketValidationError(f"sequence_number exceeds 32-bit limit: {self.sequence_number}")
        
        # Validate timestamp
        if not isinstance(self.timestamp, (int, float)):
            raise PacketValidationError(f"timestamp must be numeric, got {type(self.timestamp)}")
        if self.timestamp < 0:
            raise PacketValidationError(f"timestamp must be non-negative, got {self.timestamp}")
        if self.timestamp > time.time() + 3600:  # Future timestamp limit (1 hour)
            raise PacketValidationError(f"timestamp too far in future: {self.timestamp}")
        
        # Validate arrival_time
        if not isinstance(self.arrival_time, (int, float)):
            raise PacketValidationError(f"arrival_time must be numeric, got {type(self.arrival_time)}")
        if self.arrival_time < 0:
            raise PacketValidationError(f"arrival_time must be non-negative, got {self.arrival_time}")
        
        # Validate data
        if not isinstance(self.data, (bytes, bytearray)):
            raise PacketValidationError(f"data must be bytes, got {type(self.data)}")
        if len(self.data) > 1024 * 1024:  # 1MB limit
            raise PacketValidationError(f"data size exceeds limit: {len(self.data)} bytes")
        
        # Validate source_id
        if not isinstance(self.source_id, str):
            raise PacketValidationError(f"source_id must be string, got {type(self.source_id)}")
        if not self.source_id or len(self.source_id.strip()) == 0:
            raise PacketValidationError("source_id cannot be empty")
        if len(self.source_id) > 256:
            raise PacketValidationError(f"source_id too long: {len(self.source_id)} chars")
        
        # Validate sample_rate
        if not isinstance(self.sample_rate, int):
            raise PacketValidationError(f"sample_rate must be int, got {type(self.sample_rate)}")
        valid_sample_rates = [8000, 16000, 22050, 44100, 48000, 96000]
        if self.sample_rate not in valid_sample_rates:
            raise PacketValidationError(f"invalid sample_rate: {self.sample_rate}, must be one of {valid_sample_rates}")
        
        # Validate channels
        if not isinstance(self.channels, int):
            raise PacketValidationError(f"channels must be int, got {type(self.channels)}")
        if self.channels < 1 or self.channels > 8:
            raise PacketValidationError(f"channels must be 1-8, got {self.channels}")
        
        # Validate duration_ms
        if not isinstance(self.duration_ms, (int, float)):
            raise PacketValidationError(f"duration_ms must be numeric, got {type(self.duration_ms)}")
        if self.duration_ms <= 0:
            raise PacketValidationError(f"duration_ms must be positive, got {self.duration_ms}")
        if self.duration_ms > 1000:  # 1 second limit
            raise PacketValidationError(f"duration_ms too large: {self.duration_ms}")
        
        # Validate state
        if not isinstance(self.state, PacketState):
            raise PacketValidationError(f"state must be PacketState enum, got {type(self.state)}")
        
        # Validate playout_time if set
        if self.playout_time is not None:
            if not isinstance(self.playout_time, (int, float)):
                raise PacketValidationError(f"playout_time must be numeric, got {type(self.playout_time)}")
            if self.playout_time < 0:
                raise PacketValidationError(f"playout_time must be non-negative, got {self.playout_time}")
        
        # Cross-validation: data size should match audio parameters
        self._validate_data_consistency()
    
    def _validate_data_consistency(self):
        """Validate that data size matches audio parameters"""
        if len(self.data) == 0:
            return  # Allow empty data for placeholder packets
        
        # Calculate expected data size
        bytes_per_sample = 2  # Assume 16-bit audio
        samples_per_ms = self.sample_rate / 1000
        expected_samples = int(self.duration_ms * samples_per_ms)
        expected_bytes = expected_samples * self.channels * bytes_per_sample
        
        # Allow some tolerance for compression/encoding differences
        tolerance = 0.5  # 50% tolerance
        min_bytes = int(expected_bytes * (1 - tolerance))
        max_bytes = int(expected_bytes * (1 + tolerance))
        
        if not (min_bytes <= len(self.data) <= max_bytes):
            logger.warning(f"Data size mismatch: expected ~{expected_bytes} bytes, got {len(self.data)} bytes "
                         f"(duration={self.duration_ms}ms, rate={self.sample_rate}, channels={self.channels})")
            # Don't raise exception for this, just log warning

@dataclass
class JitterBufferConfig:
    """Configuration for jitter buffer"""
    target_delay_ms: int = 150  # Target buffering delay
    min_delay_ms: int = 50      # Minimum buffer size
    max_delay_ms: int = 500     # Maximum buffer size
    adaptive_sizing: bool = True # Enable adaptive buffer sizing
    packet_timeout_ms: int = 1000 # Consider packet lost after this time
    max_buffer_packets: int = 1000 # Maximum packets to buffer
    playout_interval_ms: int = 20  # Playout every 20ms
    loss_concealment: bool = True  # Enable packet loss concealment
    late_packet_threshold_ms: int = 100 # Threshold for late packets
    statistics_window_size: int = 100   # Window for calculating statistics

    def __post_init__(self):
        """Validate configuration parameters"""
        self._validate_config()
    
    def _validate_config(self):
        """Comprehensive configuration validation"""
        # Delay validation
        if not isinstance(self.target_delay_ms, int) or self.target_delay_ms <= 0:
            raise ValueError(f"target_delay_ms must be positive int, got {self.target_delay_ms}")
        if not isinstance(self.min_delay_ms, int) or self.min_delay_ms <= 0:
            raise ValueError(f"min_delay_ms must be positive int, got {self.min_delay_ms}")
        if not isinstance(self.max_delay_ms, int) or self.max_delay_ms <= 0:
            raise ValueError(f"max_delay_ms must be positive int, got {self.max_delay_ms}")
        
        # Range validation
        if self.min_delay_ms >= self.max_delay_ms:
            raise ValueError(f"min_delay_ms ({self.min_delay_ms}) must be < max_delay_ms ({self.max_delay_ms})")
        if not (self.min_delay_ms <= self.target_delay_ms <= self.max_delay_ms):
            raise ValueError(f"target_delay_ms ({self.target_delay_ms}) must be between min ({self.min_delay_ms}) and max ({self.max_delay_ms})")
        
        # Timeout validation
        if not isinstance(self.packet_timeout_ms, int) or self.packet_timeout_ms <= 0:
            raise ValueError(f"packet_timeout_ms must be positive int, got {self.packet_timeout_ms}")
        if self.packet_timeout_ms > 10000:  # 10 seconds max
            raise ValueError(f"packet_timeout_ms too large: {self.packet_timeout_ms}")
        
        # Buffer size validation
        if not isinstance(self.max_buffer_packets, int) or self.max_buffer_packets <= 0:
            raise ValueError(f"max_buffer_packets must be positive int, got {self.max_buffer_packets}")
        if self.max_buffer_packets > 100000:  # Reasonable limit
            raise ValueError(f"max_buffer_packets too large: {self.max_buffer_packets}")
        
        # Playout interval validation
        if not isinstance(self.playout_interval_ms, int) or self.playout_interval_ms <= 0:
            raise ValueError(f"playout_interval_ms must be positive int, got {self.playout_interval_ms}")
        if self.playout_interval_ms > 1000:  # 1 second max
            raise ValueError(f"playout_interval_ms too large: {self.playout_interval_ms}")
        
        # Boolean validation
        if not isinstance(self.adaptive_sizing, bool):
            raise ValueError(f"adaptive_sizing must be bool, got {type(self.adaptive_sizing)}")
        if not isinstance(self.loss_concealment, bool):
            raise ValueError(f"loss_concealment must be bool, got {type(self.loss_concealment)}")
        
        # Threshold validation
        if not isinstance(self.late_packet_threshold_ms, int) or self.late_packet_threshold_ms < 0:
            raise ValueError(f"late_packet_threshold_ms must be non-negative int, got {self.late_packet_threshold_ms}")
        
        # Statistics window validation
        if not isinstance(self.statistics_window_size, int) or self.statistics_window_size <= 0:
            raise ValueError(f"statistics_window_size must be positive int, got {self.statistics_window_size}")
        if self.statistics_window_size > 10000:
            raise ValueError(f"statistics_window_size too large: {self.statistics_window_size}")

class PacketLossConcealer:
    """Handles packet loss concealment using simple interpolation"""
    
    def __init__(self):
        self.last_good_packet: Optional[AudioPacket] = None
        self.silence_duration_ms = 20  # Duration of silence to insert
    
    def conceal_loss(self, missing_sequence: int, expected_duration_ms: float) -> Optional[AudioPacket]:
        """Generate a concealed packet for a missing sequence number"""
        try:
            # Input validation
            if not isinstance(missing_sequence, int) or missing_sequence < 0:
                logger.error(f"Invalid missing_sequence: {missing_sequence}")
                return None
            
            if not isinstance(expected_duration_ms, (int, float)) or expected_duration_ms <= 0:
                logger.error(f"Invalid expected_duration_ms: {expected_duration_ms}")
                return None
            
            if not self.last_good_packet:
                # No reference packet, generate silence
                return self._generate_silence_packet(missing_sequence, expected_duration_ms)
            
            # Validate reference packet before using it
            if not self._validate_reference_packet():
                return self._generate_silence_packet(missing_sequence, expected_duration_ms)
            
            # Simple approach: repeat last packet with fade-out
            concealed_data = self._apply_fadeout(self.last_good_packet.data)
            
            return AudioPacket(
                sequence_number=missing_sequence,
                timestamp=time.time(),
                arrival_time=time.time(),
                data=concealed_data,
                source_id=self.last_good_packet.source_id,
                sample_rate=self.last_good_packet.sample_rate,
                channels=self.last_good_packet.channels,
                duration_ms=expected_duration_ms,
                state=PacketState.LOST
            )
            
        except PacketValidationError as e:
            logger.error(f"Validation error concealing packet loss: {e}")
            return self._generate_silence_packet(missing_sequence, expected_duration_ms)
        except Exception as e:
            logger.error(f"Error concealing packet loss: {e}")
            return self._generate_silence_packet(missing_sequence, expected_duration_ms)
    
    def _generate_silence_packet(self, sequence: int, duration_ms: float) -> AudioPacket:
        """Generate a silence packet"""
        # Assume 16-bit stereo audio at 48kHz
        sample_rate = 48000
        channels = 2
        samples_per_ms = sample_rate / 1000
        num_samples = int(duration_ms * samples_per_ms)
        
        # Generate silence (16-bit samples = 2 bytes per sample)
        silence_data = b'\x00' * (num_samples * channels * 2)
        
        return AudioPacket(
            sequence_number=sequence,
            timestamp=time.time(),
            arrival_time=time.time(),
            data=silence_data,
            source_id="concealer",
            sample_rate=sample_rate,
            channels=channels,
            duration_ms=duration_ms,
            state=PacketState.LOST
        )
    
    def _apply_fadeout(self, data: bytes) -> bytes:
        """Apply fadeout to audio data to reduce artifacts"""
        # Simple implementation: reduce volume by 50%
        # In a real implementation, you'd properly parse the audio samples
        return bytes(int(b * 0.5) if b < 128 else int(128 + (b - 128) * 0.5) for b in data)
    
    def _validate_reference_packet(self) -> bool:
        """Validate the reference packet before using it for concealment"""
        if not self.last_good_packet:
            return False
        
        try:
            # Check if reference packet has valid data
            if not self.last_good_packet.data or len(self.last_good_packet.data) == 0:
                return False
            
            # Check audio parameters
            if (self.last_good_packet.sample_rate <= 0 or 
                self.last_good_packet.channels <= 0 or
                self.last_good_packet.duration_ms <= 0):
                return False
            
            return True
            
        except Exception as e:
            logger.error(f"Error validating reference packet: {e}")
            return False
    
    def update_reference(self, packet: AudioPacket):
        """Update the reference packet for loss concealment"""
        try:
            if packet and packet.state == PacketState.RECEIVED:
                # Validate packet before storing as reference
                if (packet.data and len(packet.data) > 0 and 
                    packet.sample_rate > 0 and packet.channels > 0):
                    self.last_good_packet = packet
        except Exception as e:
            logger.error(f"Error updating reference packet: {e}")

class JitterBufferStatistics:
    """Collects and analyzes jitter buffer statistics"""
    
    def __init__(self, window_size: int = 100):
        self.window_size = window_size
        self.arrival_times = deque(maxlen=window_size)
        self.jitter_values = deque(maxlen=window_size)
        self.loss_events = deque(maxlen=window_size)
        self.late_packets = deque(maxlen=window_size)
        self.buffer_levels = deque(maxlen=window_size)
        
        self.total_packets = 0
        self.lost_packets = 0
        self.late_packets_count = 0
        self.duplicate_packets = 0
        self.concealed_packets = 0
        
        self.start_time = time.time()
    
    def add_packet_arrival(self, packet: AudioPacket, expected_arrival: float):
        """Record packet arrival statistics"""
        self.total_packets += 1
        self.arrival_times.append(packet.arrival_time)
        
        # Calculate jitter (variation in arrival times)
        jitter = abs(packet.arrival_time - expected_arrival)
        self.jitter_values.append(jitter)
        
        if packet.state == PacketState.LOST:
            self.lost_packets += 1
            self.loss_events.append(time.time())
        elif packet.state == PacketState.LATE:
            self.late_packets_count += 1
            self.late_packets.append(time.time())
        elif packet.state == PacketState.DUPLICATE:
            self.duplicate_packets += 1
    
    def add_buffer_level(self, level: int):
        """Record current buffer level"""
        self.buffer_levels.append(level)
    
    def get_statistics(self) -> Dict[str, Any]:
        """Get comprehensive buffer statistics"""
        current_time = time.time()
        uptime = current_time - self.start_time
        
        # Calculate averages and percentiles
        avg_jitter = statistics.mean(self.jitter_values) if self.jitter_values else 0
        max_jitter = max(self.jitter_values) if self.jitter_values else 0
        p95_jitter = statistics.quantiles(self.jitter_values, n=20)[18] if len(self.jitter_values) >= 20 else 0
        
        avg_buffer_level = statistics.mean(self.buffer_levels) if self.buffer_levels else 0
        max_buffer_level = max(self.buffer_levels) if self.buffer_levels else 0
        
        # Calculate rates
        loss_rate = (self.lost_packets / self.total_packets) if self.total_packets > 0 else 0
        late_rate = (self.late_packets_count / self.total_packets) if self.total_packets > 0 else 0
        duplicate_rate = (self.duplicate_packets / self.total_packets) if self.total_packets > 0 else 0
        
        return {
            "uptime_seconds": uptime,
            "total_packets": self.total_packets,
            "lost_packets": self.lost_packets,
            "late_packets": self.late_packets_count,
            "duplicate_packets": self.duplicate_packets,
            "concealed_packets": self.concealed_packets,
            "loss_rate": loss_rate,
            "late_rate": late_rate,
            "duplicate_rate": duplicate_rate,
            "average_jitter_ms": avg_jitter * 1000,
            "max_jitter_ms": max_jitter * 1000,
            "p95_jitter_ms": p95_jitter * 1000,
            "average_buffer_level": avg_buffer_level,
            "max_buffer_level": max_buffer_level,
            "current_buffer_level": self.buffer_levels[-1] if self.buffer_levels else 0
        }

class JitterBuffer:
    """
    Network Jitter Buffer Implementation
    
    Features:
    - Adaptive buffer sizing based on network conditions
    - Packet loss detection and concealment
    - Out-of-order packet handling
    - Duplicate packet detection
    - Real-time statistics and monitoring
    - Configurable playout timing
    - Integration with audio pipeline
    """
    
    def __init__(self, source_id: str, config: JitterBufferConfig = None):
        self.source_id = source_id
        self.config = config or JitterBufferConfig()
        self.state = BufferState.FILLING
        
        # Buffer storage (min-heap ordered by sequence number)
        self.buffer: List[AudioPacket] = []
        self.received_packets: Dict[int, AudioPacket] = {}
        
        # Sequence tracking
        self.next_expected_sequence = 0
        self.highest_sequence_received = -1
        self.base_sequence = None
        
        # Timing
        self.first_packet_time: Optional[float] = None
        self.last_playout_time: Optional[float] = None
        self.playout_task: Optional[asyncio.Task] = None
        
        # Adaptive sizing
        self.current_target_delay = self.config.target_delay_ms
        self.jitter_history = deque(maxlen=50)
        self.loss_history = deque(maxlen=50)
        
        # Components
        self.loss_concealer = PacketLossConcealer()
        self.statistics = JitterBufferStatistics(self.config.statistics_window_size)
        
        # Callbacks
        self.playout_callbacks: List[Callable] = []
        
        # Threading
        self.lock = threading.RLock()
        
        logger.info(f"Jitter buffer created for source {source_id}")
    
    def _validate_incoming_packet(self, packet: AudioPacket) -> bool:
        """Validate incoming packet before processing using comprehensive security validation"""
        security_monitor = get_security_monitor()
        
        try:
            # Primary structure validation
            if not PacketSecurityValidator.validate_packet_structure(packet):
                security_monitor.record_validation_failure("Invalid packet structure", f"type: {type(packet)}")
                return False
            
            # Security validation of all fields
            if not PacketSecurityValidator.validate_sequence_number(packet.sequence_number):
                security_monitor.record_validation_failure("Invalid sequence number", f"seq: {packet.sequence_number}")
                return False
            
            if not PacketSecurityValidator.validate_timestamp(packet.timestamp, packet.arrival_time):
                security_monitor.record_validation_failure("Invalid timestamp", f"ts: {packet.timestamp}")
                return False
            
            if not PacketSecurityValidator.validate_audio_data(packet.data):
                security_monitor.record_validation_failure("Invalid audio data", f"size: {len(packet.data) if packet.data else 0}")
                return False
            
            if not PacketSecurityValidator.validate_source_id(packet.source_id):
                security_monitor.record_validation_failure("Invalid source ID", f"id: {packet.source_id}")
                return False
            
            if not PacketSecurityValidator.validate_audio_parameters(packet.sample_rate, packet.channels, packet.duration_ms):
                security_monitor.record_validation_failure("Invalid audio parameters", 
                    f"rate: {packet.sample_rate}, channels: {packet.channels}, duration: {packet.duration_ms}")
                return False
            
            # Source ID validation for this buffer
            if packet.source_id != self.source_id:
                security_monitor.record_blocked_packet("Source ID mismatch", 
                    f"expected: {self.source_id}, got: {packet.source_id}")
                return False
            
            # Buffer capacity check
            if len(self.buffer) >= self.config.max_buffer_packets:
                security_monitor.record_blocked_packet("Buffer at capacity", 
                    f"size: {len(self.buffer)}, max: {self.config.max_buffer_packets}")
                return False
            
            # Sequence number context validation
            if self.base_sequence is not None:
                # Check for extremely old packets (potential replay attack)
                if packet.sequence_number < self.base_sequence - 10000:
                    security_monitor.record_suspicious_packet("Extremely old packet", 
                        f"seq: {packet.sequence_number}, base: {self.base_sequence}")
                    return False
                
                # Check for extremely future packets (potential sequence manipulation)
                if packet.sequence_number > self.highest_sequence_received + 10000:
                    security_monitor.record_suspicious_packet("Extremely future packet", 
                        f"seq: {packet.sequence_number}, highest: {self.highest_sequence_received}")
                    return False
            
            # Enhanced time-based validation
            current_time = time.time()
            
            # Check packet age (potential replay attack detection)
            if self.first_packet_time and packet.timestamp < self.first_packet_time - 300:  # 5 minutes old
                security_monitor.record_suspicious_packet("Very old packet timestamp", 
                    f"ts: {packet.timestamp}, first: {self.first_packet_time}")
                return False
            
            # Additional duration validation for this buffer context
            if packet.duration_ms > 200:  # Suspiciously long duration
                security_monitor.record_suspicious_packet("Unusually long packet duration", 
                    f"duration: {packet.duration_ms}ms")
                return False
            
            # Check for security threshold warnings
            warnings = security_monitor.check_security_thresholds()
            if warnings:
                for warning in warnings:
                    logger.warning(f"Security threshold exceeded: {warning}")
            
            return True
            
        except PacketValidationError as e:
            security_monitor.record_validation_failure("PacketValidationError", str(e))
            logger.error(f"Packet validation failed: {e}")
            return False
        except Exception as e:
            security_monitor.record_validation_failure("Unexpected validation error", str(e))
            logger.error(f"Unexpected error during packet validation: {e}")
            return False
    
    async def start(self) -> bool:
        """Start the jitter buffer"""
        try:
            logger.info(f"Starting jitter buffer for source {self.source_id}")
            
            # Start playout task
            self.playout_task = asyncio.create_task(self._playout_loop())
            
            self.state = BufferState.FILLING
            logger.info(f"Jitter buffer started for source {self.source_id}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to start jitter buffer for {self.source_id}: {e}")
            return False
    
    async def stop(self) -> bool:
        """Stop the jitter buffer"""
        try:
            logger.info(f"Stopping jitter buffer for source {self.source_id}")
            
            self.state = BufferState.STOPPED
            
            # Stop playout task
            if self.playout_task:
                self.playout_task.cancel()
                try:
                    await self.playout_task
                except asyncio.CancelledError:
                    pass
            
            # Clear buffer
            with self.lock:
                self.buffer.clear()
                self.received_packets.clear()
            
            logger.info(f"Jitter buffer stopped for source {self.source_id}")
            return True
            
        except Exception as e:
            logger.error(f"Error stopping jitter buffer for {self.source_id}: {e}")
            return False
    
    def add_packet(self, packet: AudioPacket) -> bool:
        """Add a packet to the jitter buffer with comprehensive validation"""
        try:
            # Primary validation
            if not self._validate_incoming_packet(packet):
                return False
            
            with self.lock:
                current_time = time.time()
                packet.arrival_time = current_time
                
                # Initialize base sequence if this is the first packet
                if self.base_sequence is None:
                    self.base_sequence = packet.sequence_number
                    self.next_expected_sequence = packet.sequence_number
                    self.first_packet_time = current_time
                
                # Check for duplicate packets
                if packet.sequence_number in self.received_packets:
                    packet.state = PacketState.DUPLICATE
                    self.statistics.add_packet_arrival(packet, current_time)
                    logger.debug(f"Duplicate packet {packet.sequence_number} received")
                    return False
                
                # Check if packet is late
                if packet.sequence_number < self.next_expected_sequence:
                    packet.state = PacketState.LATE
                    self.statistics.add_packet_arrival(packet, current_time)
                    logger.debug(f"Late packet {packet.sequence_number} received (expected {self.next_expected_sequence})")
                    
                    # Decide whether to accept late packet based on threshold
                    arrival_delay = current_time - (self.first_packet_time + 
                                                  (packet.sequence_number - self.base_sequence) * 
                                                  (self.config.playout_interval_ms / 1000))
                    
                    if arrival_delay > (self.config.late_packet_threshold_ms / 1000):
                        return False  # Reject packet that's too late
                
                # Add packet to buffer with additional safety checks
                try:
                    self.received_packets[packet.sequence_number] = packet
                    heapq.heappush(self.buffer, (packet.sequence_number, packet))
                except MemoryError:
                    logger.error(f"Memory error adding packet to buffer for source {self.source_id}")
                    return False
                except Exception as e:
                    logger.error(f"Error adding packet to buffer: {e}")
                    return False
                
                # Update highest sequence received
                if packet.sequence_number > self.highest_sequence_received:
                    self.highest_sequence_received = packet.sequence_number
                
                # Record statistics
                expected_arrival = (self.first_packet_time + 
                                  (packet.sequence_number - self.base_sequence) * 
                                  (self.config.playout_interval_ms / 1000))
                self.statistics.add_packet_arrival(packet, expected_arrival)
                self.statistics.add_buffer_level(len(self.buffer))
                
                # Update loss concealer reference
                self.loss_concealer.update_reference(packet)
                
                # Check for missing packets and handle loss
                self._detect_and_handle_loss()
                
                # Adaptive buffer sizing
                if self.config.adaptive_sizing:
                    self._update_adaptive_sizing()
                
                # Transition from filling to playing state if we have enough packets
                if (self.state == BufferState.FILLING and 
                    len(self.buffer) >= self._get_target_buffer_size()):
                    self.state = BufferState.PLAYING
                    logger.info(f"Jitter buffer {self.source_id} transitioned to PLAYING state")
                
                return True
                
        except Exception as e:
            logger.error(f"Error adding packet to jitter buffer {self.source_id}: {e}")
            return False
    
    def _detect_and_handle_loss(self):
        """Detect missing packets and handle packet loss"""
        try:
            # Check for gaps in sequence numbers
            missing_sequences = []
            for seq in range(self.next_expected_sequence, self.highest_sequence_received):
                if seq not in self.received_packets:
                    # Check if enough time has passed to consider packet lost
                    expected_arrival = (self.first_packet_time + 
                                      (seq - self.base_sequence) * 
                                      (self.config.playout_interval_ms / 1000))
                    
                    if time.time() - expected_arrival > (self.config.packet_timeout_ms / 1000):
                        missing_sequences.append(seq)
            
            # Handle missing packets
            for seq in missing_sequences:
                if self.config.loss_concealment:
                    concealed_packet = self.loss_concealer.conceal_loss(
                        seq, self.config.playout_interval_ms
                    )
                    if concealed_packet:
                        self.received_packets[seq] = concealed_packet
                        heapq.heappush(self.buffer, (seq, concealed_packet))
                        self.statistics.concealed_packets += 1
                        logger.debug(f"Concealed missing packet {seq}")
                
                # Record loss statistics
                loss_packet = AudioPacket(
                    sequence_number=seq,
                    timestamp=time.time(),
                    arrival_time=time.time(),
                    data=b'',
                    source_id=self.source_id,
                    sample_rate=48000,
                    channels=2,
                    duration_ms=self.config.playout_interval_ms,
                    state=PacketState.LOST
                )
                expected_arrival = (self.first_packet_time + 
                                  (seq - self.base_sequence) * 
                                  (self.config.playout_interval_ms / 1000))
                self.statistics.add_packet_arrival(loss_packet, expected_arrival)
                
        except Exception as e:
            logger.error(f"Error detecting packet loss: {e}")
    
    def _update_adaptive_sizing(self):
        """Update buffer target size based on network conditions"""
        try:
            # Calculate recent jitter
            if len(self.statistics.jitter_values) >= 10:
                recent_jitter_ms = statistics.mean(list(self.statistics.jitter_values)[-10:]) * 1000
                self.jitter_history.append(recent_jitter_ms)
            
            # Calculate recent loss rate
            if len(self.statistics.loss_events) >= 5:
                recent_losses = len([t for t in self.statistics.loss_events 
                                   if time.time() - t < 10])  # Last 10 seconds
                recent_loss_rate = recent_losses / 10.0  # Approximate rate
                self.loss_history.append(recent_loss_rate)
            
            # Adjust target delay based on conditions
            if len(self.jitter_history) >= 5 and len(self.loss_history) >= 5:
                avg_jitter = statistics.mean(self.jitter_history)
                avg_loss_rate = statistics.mean(self.loss_history)
                
                # Increase buffer if high jitter or loss
                if avg_jitter > 50 or avg_loss_rate > 0.02:
                    self.current_target_delay = min(
                        self.current_target_delay + 10,
                        self.config.max_delay_ms
                    )
                # Decrease buffer if conditions are good
                elif avg_jitter < 20 and avg_loss_rate < 0.01:
                    self.current_target_delay = max(
                        self.current_target_delay - 5,
                        self.config.min_delay_ms
                    )
                
        except Exception as e:
            logger.error(f"Error updating adaptive sizing: {e}")
    
    def _get_target_buffer_size(self) -> int:
        """Get target buffer size in packets"""
        packets_per_second = 1000 / self.config.playout_interval_ms
        return int((self.current_target_delay / 1000) * packets_per_second)
    
    async def _playout_loop(self):
        """Main playout loop that delivers packets at regular intervals"""
        try:
            while self.state != BufferState.STOPPED:
                await asyncio.sleep(self.config.playout_interval_ms / 1000)
                
                if self.state == BufferState.PLAYING:
                    await self._playout_packet()
                elif self.state == BufferState.FILLING:
                    # Check if we can start playing
                    with self.lock:
                        if len(self.buffer) >= self._get_target_buffer_size():
                            self.state = BufferState.PLAYING
                
        except asyncio.CancelledError:
            logger.info(f"Playout loop cancelled for {self.source_id}")
        except Exception as e:
            logger.error(f"Error in playout loop for {self.source_id}: {e}")
    
    async def _playout_packet(self):
        """Play out the next packet in sequence"""
        try:
            with self.lock:
                # Check buffer underrun
                if len(self.buffer) == 0:
                    if self.state == BufferState.PLAYING:
                        self.state = BufferState.UNDERRUN
                        logger.warning(f"Buffer underrun for {self.source_id}")
                    return
                
                # Check buffer overrun
                if len(self.buffer) > self.config.max_buffer_packets:
                    self.state = BufferState.OVERRUN
                    logger.warning(f"Buffer overrun for {self.source_id}")
                    # Drop oldest packets
                    while len(self.buffer) > self.config.max_buffer_packets:
                        _, dropped_packet = heapq.heappop(self.buffer)
                        del self.received_packets[dropped_packet.sequence_number]
                
                # Get next packet to play
                if self.next_expected_sequence in self.received_packets:
                    packet = self.received_packets[self.next_expected_sequence]
                    
                    # Remove from buffer
                    del self.received_packets[self.next_expected_sequence]
                    # Remove from heap (find and remove)
                    self.buffer = [(seq, pkt) for seq, pkt in self.buffer 
                                 if seq != self.next_expected_sequence]
                    heapq.heapify(self.buffer)
                    
                    # Update packet state
                    packet.state = PacketState.PLAYING
                    packet.playout_time = time.time()
                    
                    # Send to callbacks
                    await self._notify_playout_callbacks(packet)
                    
                    # Update sequence
                    self.next_expected_sequence += 1
                    self.last_playout_time = time.time()
                    
                    # Update statistics
                    self.statistics.add_buffer_level(len(self.buffer))
                    
                    # Return to playing state if we were in underrun
                    if self.state == BufferState.UNDERRUN:
                        self.state = BufferState.PLAYING
                
        except Exception as e:
            logger.error(f"Error playing out packet for {self.source_id}: {e}")
    
    async def _notify_playout_callbacks(self, packet: AudioPacket):
        """Notify all registered callbacks about packet playout"""
        for callback in self.playout_callbacks:
            try:
                await callback(packet)
            except Exception as e:
                logger.error(f"Error in playout callback: {e}")
    
    def add_playout_callback(self, callback: Callable):
        """Add callback for packet playout events"""
        self.playout_callbacks.append(callback)
    
    def remove_playout_callback(self, callback: Callable):
        """Remove playout callback"""
        if callback in self.playout_callbacks:
            self.playout_callbacks.remove(callback)
    
    def get_buffer_status(self) -> Dict[str, Any]:
        """Get current buffer status"""
        with self.lock:
            return {
                "source_id": self.source_id,
                "state": self.state.value,
                "buffer_size": len(self.buffer),
                "target_buffer_size": self._get_target_buffer_size(),
                "current_target_delay_ms": self.current_target_delay,
                "next_expected_sequence": self.next_expected_sequence,
                "highest_sequence_received": self.highest_sequence_received,
                "last_playout_time": self.last_playout_time,
                "config": asdict(self.config)
            }
    
    def get_statistics(self) -> Dict[str, Any]:
        """Get comprehensive buffer statistics including security metrics"""
        security_monitor = get_security_monitor()
        return {
            **self.statistics.get_statistics(),
            "buffer_status": self.get_buffer_status(),
            "security_statistics": security_monitor.get_security_statistics()
        }
    
    def update_config(self, new_config: Dict[str, Any]) -> bool:
        """Update buffer configuration"""
        try:
            for key, value in new_config.items():
                if hasattr(self.config, key):
                    setattr(self.config, key, value)
            
            # Update current target delay if needed
            if 'target_delay_ms' in new_config:
                self.current_target_delay = new_config['target_delay_ms']
            
            logger.info(f"Jitter buffer configuration updated for {self.source_id}")
            return True
            
        except Exception as e:
            logger.error(f"Error updating jitter buffer configuration: {e}")
            return False


class JitterBufferManager:
    """Manages multiple jitter buffers for different sources"""
    
    def __init__(self):
        self.buffers: Dict[str, JitterBuffer] = {}
        self.default_config = JitterBufferConfig()
        
    async def create_buffer(self, source_id: str, config: JitterBufferConfig = None) -> JitterBuffer:
        """Create a new jitter buffer for a source"""
        if source_id in self.buffers:
            logger.warning(f"Jitter buffer for {source_id} already exists")
            return self.buffers[source_id]
        
        buffer = JitterBuffer(source_id, config or self.default_config)
        self.buffers[source_id] = buffer
        
        # Start the buffer
        await buffer.start()
        
        logger.info(f"Created jitter buffer for source {source_id}")
        return buffer
    
    async def remove_buffer(self, source_id: str) -> bool:
        """Remove a jitter buffer"""
        if source_id not in self.buffers:
            return False
        
        buffer = self.buffers[source_id]
        await buffer.stop()
        del self.buffers[source_id]
        
        logger.info(f"Removed jitter buffer for source {source_id}")
        return True
    
    def get_buffer(self, source_id: str) -> Optional[JitterBuffer]:
        """Get a jitter buffer by source ID"""
        return self.buffers.get(source_id)
    
    def get_all_buffers(self) -> Dict[str, JitterBuffer]:
        """Get all jitter buffers"""
        return self.buffers.copy()
    
    async def stop_all_buffers(self):
        """Stop all jitter buffers"""
        for buffer in self.buffers.values():
            await buffer.stop()
        self.buffers.clear()
    
    def get_manager_statistics(self) -> Dict[str, Any]:
        """Get statistics for all buffers"""
        stats = {
            "total_buffers": len(self.buffers),
            "buffers": {}
        }
        
        for source_id, buffer in self.buffers.items():
            stats["buffers"][source_id] = buffer.get_statistics()
        
        return stats


# Global jitter buffer manager instance
jitter_buffer_manager = JitterBufferManager()

async def get_jitter_buffer_manager() -> JitterBufferManager:
    """Get the global jitter buffer manager"""
    return jitter_buffer_manager

async def create_jitter_buffer(source_id: str, config: JitterBufferConfig = None) -> JitterBuffer:
    """Create a new jitter buffer"""
    manager = await get_jitter_buffer_manager()
    return await manager.create_buffer(source_id, config)

async def get_jitter_buffer(source_id: str) -> Optional[JitterBuffer]:
    """Get an existing jitter buffer"""
    manager = await get_jitter_buffer_manager()
    return manager.get_buffer(source_id)