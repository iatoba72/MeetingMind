# Audio Processing Pipeline for MeetingMind
# This module handles real-time audio processing, format conversion, and analysis
# Demonstrates server-side audio handling for streaming applications

import asyncio
import base64
import io
import json
import logging
import time
import wave
from datetime import datetime
from typing import Dict, List, Optional, Tuple
import numpy as np

logger = logging.getLogger(__name__)


# Audio processing pipeline class
class AudioProcessor:
    """
    Server-side Audio Processing Pipeline

    This class handles incoming audio chunks from WebSocket clients and provides:
    - Audio format validation and conversion
    - Real-time audio analysis (volume, frequency, etc.)
    - Chunk reassembly and buffering
    - Audio quality metrics and statistics
    - Preparation for AI transcription services

    Audio Processing Concepts:

    Sample Rate Handling:
    - 8kHz: Telephone quality, minimal processing overhead
    - 16kHz: Wideband speech, optimal for speech recognition
    - 44.1kHz: CD quality, high fidelity but larger data
    - 48kHz: Professional audio, broadcast standard

    Audio Formats:
    - WebM/Opus: Excellent compression, low latency
    - MP4/AAC: Good compatibility, moderate compression
    - WAV: Uncompressed, large but universally compatible
    - Raw PCM: Direct audio samples, no container overhead

    Chunk Processing:
    - Each chunk represents 250ms of audio by default
    - Chunks arrive out-of-order and must be reassembled
    - Buffer management prevents memory overflow
    - Quality analysis helps optimize streaming parameters
    """

    def __init__(self):
        # Audio session management
        self.active_sessions: Dict[str, "AudioSession"] = {}

        # Global statistics
        self.total_chunks_processed = 0
        self.total_audio_duration = 0.0  # seconds
        self.total_data_processed = 0  # bytes

        # Processing configuration
        self.max_sessions = 100
        self.chunk_timeout = 30.0  # seconds
        self.buffer_size_limit = 10 * 1024 * 1024  # 10MB per session

        logger.info("Audio processor initialized")

    async def create_session(self, client_id: str, audio_config: Dict) -> str:
        """
        Create a new audio processing session for a client

        Args:
            client_id: Unique client identifier
            audio_config: Audio configuration from client

        Returns:
            session_id: Unique session identifier
        """
        if len(self.active_sessions) >= self.max_sessions:
            raise Exception(f"Maximum sessions ({self.max_sessions}) reached")

        session_id = f"session_{client_id}_{int(time.time())}"

        session = AudioSession(
            session_id=session_id, client_id=client_id, config=audio_config
        )

        self.active_sessions[session_id] = session

        logger.info(f"Created audio session {session_id} for client {client_id}")
        logger.debug(f"Session config: {audio_config}")

        return session_id

    async def process_chunk_metadata(self, session_id: str, metadata: Dict) -> Dict:
        """
        Process incoming audio chunk metadata

        Args:
            session_id: Audio session identifier
            metadata: Chunk metadata from client

        Returns:
            Processing acknowledgment
        """
        if session_id not in self.active_sessions:
            return {"error": "Session not found", "session_id": session_id}

        session = self.active_sessions[session_id]
        return await session.process_chunk_metadata(metadata)

    async def process_chunk_data(self, session_id: str, chunk_data: Dict) -> Dict:
        """
        Process incoming audio chunk binary data

        Args:
            session_id: Audio session identifier
            chunk_data: Audio chunk data from client

        Returns:
            Processing results and analysis
        """
        if session_id not in self.active_sessions:
            return {"error": "Session not found", "session_id": session_id}

        session = self.active_sessions[session_id]
        result = await session.process_chunk_data(chunk_data)

        # Update global statistics
        self.total_chunks_processed += 1
        if "audio_data" in result:
            self.total_data_processed += len(result["audio_data"])

        return result

    async def get_session_stats(self, session_id: str) -> Optional[Dict]:
        """Get detailed statistics for an audio session"""
        if session_id not in self.active_sessions:
            return None

        return self.active_sessions[session_id].get_statistics()

    async def cleanup_expired_sessions(self):
        """Remove expired or inactive sessions"""
        current_time = time.time()
        expired_sessions = []

        for session_id, session in self.active_sessions.items():
            if current_time - session.last_activity > self.chunk_timeout:
                expired_sessions.append(session_id)

        for session_id in expired_sessions:
            logger.info(f"Cleaning up expired session: {session_id}")
            del self.active_sessions[session_id]

    def get_global_stats(self) -> Dict:
        """Get global audio processing statistics"""
        return {
            "active_sessions": len(self.active_sessions),
            "total_chunks_processed": self.total_chunks_processed,
            "total_audio_duration": self.total_audio_duration,
            "total_data_processed": self.total_data_processed,
            "average_chunk_size": (
                self.total_data_processed / self.total_chunks_processed
                if self.total_chunks_processed > 0
                else 0
            ),
        }


class AudioSession:
    """
    Individual audio processing session for a client connection

    Each session maintains:
    - Audio configuration and format information
    - Chunk buffer for reassembly
    - Real-time audio analysis
    - Quality metrics and statistics
    - Connection to AI transcription services
    """

    def __init__(self, session_id: str, client_id: str, config: Dict):
        self.session_id = session_id
        self.client_id = client_id
        self.config = config
        self.created_at = time.time()
        self.last_activity = time.time()

        # Audio format information
        self.sample_rate = config.get("sampleRate", 16000)
        self.channels = config.get("channels", 1)
        self.mime_type = config.get("mimeType", "audio/webm;codecs=opus")
        self.chunk_duration = config.get("chunkDuration", 250)  # milliseconds

        # Chunk management
        self.chunks: Dict[str, Dict] = {}  # chunk_id -> chunk_info
        self.chunk_sequence = 0
        self.buffer_size = 0

        # Audio analysis
        self.volume_history: List[float] = []
        self.peak_volume = 0.0
        self.total_audio_duration = 0.0

        # Statistics
        self.chunks_received = 0
        self.chunks_processed = 0
        self.bytes_processed = 0
        self.processing_errors = 0

        logger.info(f"Audio session {session_id} initialized with config: {config}")

    async def process_chunk_metadata(self, metadata: Dict) -> Dict:
        """
        Process audio chunk metadata

        Metadata includes:
        - chunk_id: Unique identifier for this chunk
        - timestamp: When chunk was created
        - size: Expected size in bytes
        - duration: Audio duration in milliseconds
        - format information
        """
        try:
            chunk_id = metadata.get("chunkId")
            if not chunk_id:
                return {"error": "Missing chunk ID"}

            # Store metadata for chunk assembly
            self.chunks[chunk_id] = {
                "metadata": metadata,
                "received_at": time.time(),
                "data": None,
                "processed": False,
            }

            self.last_activity = time.time()
            self.chunks_received += 1

            return {
                "status": "metadata_received",
                "chunk_id": chunk_id,
                "session_id": self.session_id,
            }

        except Exception as e:
            self.processing_errors += 1
            return {"error": f"Metadata processing error: {str(e)}"}

    async def process_chunk_data(self, chunk_data: Dict) -> Dict:
        """
        Process audio chunk binary data and perform analysis

        Args:
            chunk_data: Contains chunk_id and base64-encoded audio data

        Returns:
            Analysis results including volume, duration, quality metrics
        """
        try:
            chunk_id = chunk_data.get("chunkId")
            data_b64 = chunk_data.get("data")

            if not chunk_id or not data_b64:
                return {"error": "Missing chunk ID or data"}

            if chunk_id not in self.chunks:
                return {"error": f"Chunk {chunk_id} metadata not found"}

            # Decode and validate base64 audio data
            try:
                # Validate base64 format first
                if not data_b64 or not isinstance(data_b64, str):
                    return {"error": "Invalid base64 data format"}

                # Check base64 string length (reasonable limit)
                if len(data_b64) > 10 * 1024 * 1024:  # 10MB max encoded
                    return {"error": "Audio data too large"}

                # Decode base64
                audio_bytes = base64.b64decode(data_b64, validate=True)

                # Validate decoded size
                if len(audio_bytes) > 5 * 1024 * 1024:  # 5MB max decoded
                    return {"error": "Decoded audio data too large"}

                # Basic audio format validation
                if len(audio_bytes) < 44:  # Minimum for WAV header
                    return {"error": "Audio data too small to be valid"}

            except Exception as e:
                return {"error": f"Failed to decode audio data: {str(e)}"}

            # Store audio data
            self.chunks[chunk_id]["data"] = audio_bytes
            self.chunks[chunk_id]["actual_size"] = len(audio_bytes)

            # Perform audio analysis
            analysis_result = await self._analyze_audio_chunk(chunk_id, audio_bytes)

            # Update session statistics
            self.chunks_processed += 1
            self.bytes_processed += len(audio_bytes)
            self.buffer_size += len(audio_bytes)
            self.last_activity = time.time()

            # Mark chunk as processed
            self.chunks[chunk_id]["processed"] = True
            self.chunks[chunk_id]["analysis"] = analysis_result

            # Cleanup old chunks to prevent memory overflow
            await self._cleanup_old_chunks()

            # Return processing results
            return {
                "chunkId": chunk_id,
                "processed": True,
                "session_id": self.session_id,
                "analysis": analysis_result,
                "buffer_size": self.buffer_size,
                "chunks_in_buffer": len(self.chunks),
            }

        except Exception as e:
            self.processing_errors += 1
            return {"error": f"Chunk processing error: {str(e)}"}

    async def _analyze_audio_chunk(self, chunk_id: str, audio_bytes: bytes) -> Dict:
        """
        Perform real-time audio analysis on a chunk

        Analysis includes:
        - Volume level calculation
        - Audio quality assessment
        - Format validation
        - Duration verification

        Note: This is a simplified analysis. In production, you would:
        - Use audio processing libraries like librosa, scipy, or pydub
        - Implement proper audio format parsing
        - Add spectral analysis for frequency content
        - Integrate with speech recognition APIs
        """
        try:
            chunk_info = self.chunks[chunk_id]
            metadata = chunk_info["metadata"]

            # Basic analysis based on data size and expected duration
            expected_size = metadata.get("size", 0)
            actual_size = len(audio_bytes)
            duration_ms = metadata.get("duration", self.chunk_duration)

            # Calculate approximate bitrate
            # bitrate = (bytes * 8) / (duration_seconds)
            duration_seconds = duration_ms / 1000.0
            bitrate = (
                (actual_size * 8) / duration_seconds if duration_seconds > 0 else 0
            )

            # Simulate volume analysis
            # In reality, you'd decode the audio and calculate RMS volume
            # For this demo, we'll simulate based on data characteristics
            volume_estimate = min(1.0, actual_size / (expected_size + 1))

            # Update session volume history
            self.volume_history.append(volume_estimate)
            if len(self.volume_history) > 100:  # Keep last 100 measurements
                self.volume_history = self.volume_history[-100:]

            self.peak_volume = max(self.peak_volume, volume_estimate)
            self.total_audio_duration += duration_seconds

            # Quality assessment
            size_ratio = actual_size / expected_size if expected_size > 0 else 1.0
            quality_score = min(100, max(0, 100 * size_ratio))

            # Audio format analysis
            format_info = self._analyze_audio_format(audio_bytes)

            analysis = {
                "duration": duration_seconds,
                "size_bytes": actual_size,
                "expected_size": expected_size,
                "bitrate": round(bitrate),
                "volume": round(volume_estimate, 3),
                "peak_volume": round(self.peak_volume, 3),
                "quality_score": round(quality_score, 1),
                "format": format_info,
                "timestamp": time.time(),
            }

            logger.debug(f"Analyzed chunk {chunk_id}: {analysis}")
            return analysis

        except Exception as e:
            logger.error(f"Error analyzing audio chunk {chunk_id}: {e}")
            return {"error": f"Analysis failed: {str(e)}", "timestamp": time.time()}

    def _analyze_audio_format(self, audio_bytes: bytes) -> Dict:
        """
        Analyze audio format and container information

        This performs basic format detection based on file headers.
        In production, use proper audio parsing libraries.
        """
        if len(audio_bytes) < 4:
            return {"format": "unknown", "reason": "insufficient_data"}

        # Check common audio format signatures
        header = audio_bytes[:4]

        if header == b"RIFF":
            return {"container": "WAV/RIFF", "detected": True, "header": header.hex()}
        elif header[:3] == b"ID3" or header[:2] == b"\xff\xfb":
            return {"container": "MP3", "detected": True, "header": header.hex()}
        elif header == b"OggS":
            return {"container": "OGG", "detected": True, "header": header.hex()}
        elif header[:4] == b"ftyp" or b"webm" in audio_bytes[:32]:
            return {"container": "WebM/MP4", "detected": True, "header": header.hex()}
        else:
            return {
                "container": "unknown",
                "detected": False,
                "header": header.hex(),
                "mime_type": self.mime_type,
            }

    async def _cleanup_old_chunks(self):
        """Remove old processed chunks to prevent memory overflow"""
        current_time = time.time()
        old_chunks = []

        for chunk_id, chunk_info in self.chunks.items():
            # Remove chunks older than 30 seconds or if buffer is too large
            chunk_age = current_time - chunk_info["received_at"]
            if chunk_age > 30 or self.buffer_size > 5 * 1024 * 1024:  # 5MB limit

                if chunk_info.get("processed", False):
                    old_chunks.append(chunk_id)

        for chunk_id in old_chunks:
            chunk_data = self.chunks[chunk_id].get("data")
            if chunk_data:
                self.buffer_size -= len(chunk_data)
            del self.chunks[chunk_id]

        if old_chunks:
            logger.debug(
                f"Cleaned up {len(old_chunks)} old chunks from session {self.session_id}"
            )

    def get_statistics(self) -> Dict:
        """Get comprehensive session statistics"""
        current_time = time.time()
        session_duration = current_time - self.created_at

        # Calculate average volume
        avg_volume = (
            sum(self.volume_history) / len(self.volume_history)
            if self.volume_history
            else 0
        )

        # Calculate processing rate
        processing_rate = (
            self.chunks_processed / session_duration if session_duration > 0 else 0
        )

        return {
            "session_id": self.session_id,
            "client_id": self.client_id,
            "created_at": self.created_at,
            "session_duration": round(session_duration, 2),
            "last_activity": self.last_activity,
            # Audio configuration
            "audio_config": {
                "sample_rate": self.sample_rate,
                "channels": self.channels,
                "mime_type": self.mime_type,
                "chunk_duration": self.chunk_duration,
            },
            # Processing statistics
            "processing": {
                "chunks_received": self.chunks_received,
                "chunks_processed": self.chunks_processed,
                "bytes_processed": self.bytes_processed,
                "processing_errors": self.processing_errors,
                "success_rate": (
                    self.chunks_processed / self.chunks_received
                    if self.chunks_received > 0
                    else 0
                ),
                "processing_rate": round(processing_rate, 2),
            },
            # Audio analysis
            "audio_analysis": {
                "total_duration": round(self.total_audio_duration, 2),
                "average_volume": round(avg_volume, 3),
                "peak_volume": round(self.peak_volume, 3),
                "volume_samples": len(self.volume_history),
            },
            # Buffer status
            "buffer": {
                "chunks_in_buffer": len(self.chunks),
                "buffer_size_bytes": self.buffer_size,
                "buffer_size_mb": round(self.buffer_size / (1024 * 1024), 2),
            },
        }


# Global audio processor instance
audio_processor = AudioProcessor()


# Cleanup task for expired sessions
async def cleanup_audio_sessions():
    """Background task to clean up expired audio sessions"""
    while True:
        try:
            await audio_processor.cleanup_expired_sessions()
            await asyncio.sleep(60)  # Run every minute
        except Exception as e:
            logger.error(f"Error in cleanup task: {e}")
            await asyncio.sleep(60)
