"""
Network Audio Server for MeetingMind
Handles RTMP and SRT audio stream reception from OBS and other sources
"""

import asyncio
import logging
import json
import threading
import time
import struct
from typing import Dict, List, Optional, Callable, Any
from dataclasses import dataclass, asdict
from datetime import datetime, timedelta
from enum import Enum
import queue
import uuid
import socket
import subprocess
import os
from pathlib import Path

import numpy as np
from fastapi import WebSocket

logger = logging.getLogger(__name__)


class StreamProtocol(Enum):
    RTMP = "rtmp"
    SRT = "srt"
    UDP = "udp"
    RTP = "rtp"


class StreamState(Enum):
    DISCONNECTED = "disconnected"
    CONNECTING = "connecting"
    CONNECTED = "connected"
    STREAMING = "streaming"
    ERROR = "error"
    STOPPED = "stopped"


@dataclass
class AudioStreamInfo:
    """Information about an audio stream"""

    stream_id: str
    protocol: StreamProtocol
    source_ip: str
    source_port: int
    codec: str
    sample_rate: int
    channels: int
    bitrate: int
    duration: float
    bytes_received: int
    packets_received: int
    packets_lost: int
    jitter: float
    latency: float
    state: StreamState
    created_at: datetime
    last_packet_at: Optional[datetime]


@dataclass
class AudioChunk:
    """Audio data chunk from network source"""

    stream_id: str
    chunk_id: str
    timestamp: float
    sequence: int
    data: bytes
    sample_rate: int
    channels: int
    duration_ms: float
    rms_level: float
    has_voice: bool


@dataclass
class NetworkMetrics:
    """Network performance metrics"""

    bytes_per_second: float
    packets_per_second: float
    packet_loss_rate: float
    average_jitter: float
    average_latency: float
    connection_count: int
    active_streams: int


class JitterBuffer:
    """Network jitter buffer for smooth audio playback"""

    def __init__(self, target_delay_ms: int = 100, max_delay_ms: int = 500):
        self.target_delay_ms = target_delay_ms
        self.max_delay_ms = max_delay_ms
        self.buffer: Dict[int, AudioChunk] = {}
        self.next_sequence = 0
        self.buffer_size = 0
        self.stats = {
            "buffered_packets": 0,
            "dropped_packets": 0,
            "duplicate_packets": 0,
            "out_of_order_packets": 0,
        }

    def add_packet(self, chunk: AudioChunk) -> None:
        """Add audio chunk to jitter buffer"""
        if chunk.sequence in self.buffer:
            self.stats["duplicate_packets"] += 1
            return

        if chunk.sequence < self.next_sequence:
            self.stats["out_of_order_packets"] += 1
            return

        self.buffer[chunk.sequence] = chunk
        self.buffer_size += len(chunk.data)
        self.stats["buffered_packets"] += 1

        # Remove old packets beyond max delay
        current_time = time.time()
        for seq, buffered_chunk in list(self.buffer.items()):
            if current_time - buffered_chunk.timestamp > self.max_delay_ms / 1000:
                del self.buffer[seq]
                self.buffer_size -= len(buffered_chunk.data)
                self.stats["dropped_packets"] += 1

    def get_next_chunk(self) -> Optional[AudioChunk]:
        """Get next audio chunk if available and within timing"""
        if self.next_sequence not in self.buffer:
            return None

        chunk = self.buffer.pop(self.next_sequence)
        self.buffer_size -= len(chunk.data)

        # Check if we should wait longer for better buffering
        current_time = time.time()
        delay_ms = (current_time - chunk.timestamp) * 1000

        if delay_ms < self.target_delay_ms and len(self.buffer) > 0:
            # Put it back and wait
            self.buffer[self.next_sequence] = chunk
            self.buffer_size += len(chunk.data)
            return None

        self.next_sequence += 1
        return chunk

    def get_stats(self) -> Dict[str, Any]:
        """Get jitter buffer statistics"""
        return {
            **self.stats,
            "buffer_size_bytes": self.buffer_size,
            "buffer_packets": len(self.buffer),
            "next_sequence": self.next_sequence,
            "target_delay_ms": self.target_delay_ms,
        }


class RTMPAudioReceiver:
    """RTMP audio stream receiver using FFmpeg"""

    def __init__(self, port: int = 1935):
        self.port = port
        self.process = None
        self.is_running = False
        self.streams: Dict[str, AudioStreamInfo] = {}
        self.audio_callback: Optional[Callable] = None

    async def start(self) -> bool:
        """Start RTMP server for receiving audio streams"""
        try:
            cmd = [
                "ffmpeg",
                "-f",
                "flv",
                "-listen",
                "1",
                "-i",
                f"rtmp://localhost:{self.port}/live",
                "-f",
                "wav",
                "-acodec",
                "pcm_s16le",
                "-ar",
                "44100",
                "-ac",
                "2",
                "-",
            ]

            self.process = await asyncio.create_subprocess_exec(
                *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
            )

            self.is_running = True

            # Start reading audio data
            asyncio.create_task(self._read_audio_data())
            asyncio.create_task(self._read_stderr())

            logger.info(f"RTMP audio receiver started on port {self.port}")
            return True

        except Exception as e:
            logger.error(f"Failed to start RTMP receiver: {e}")
            return False

    async def _read_audio_data(self):
        """Read audio data from FFmpeg stdout"""
        if not self.process:
            return

        try:
            chunk_size = 4096
            stream_id = f"rtmp_{self.port}"
            sequence = 0

            # Create stream info
            self.streams[stream_id] = AudioStreamInfo(
                stream_id=stream_id,
                protocol=StreamProtocol.RTMP,
                source_ip="localhost",
                source_port=self.port,
                codec="pcm_s16le",
                sample_rate=44100,
                channels=2,
                bitrate=1411200,  # 44.1kHz * 16bit * 2ch
                duration=0,
                bytes_received=0,
                packets_received=0,
                packets_lost=0,
                jitter=0,
                latency=0,
                state=StreamState.CONNECTED,
                created_at=datetime.now(),
                last_packet_at=None,
            )

            while self.is_running and self.process:
                data = await self.process.stdout.read(chunk_size)
                if not data:
                    break

                # Calculate audio properties
                samples = np.frombuffer(data, dtype=np.int16)
                if len(samples) > 0:
                    rms = np.sqrt(np.mean(samples.astype(np.float32) ** 2))
                    rms_normalized = rms / 32768.0  # Normalize to 0-1
                    has_voice = rms_normalized > 0.01  # Simple VAD threshold
                else:
                    rms_normalized = 0
                    has_voice = False

                # Create audio chunk
                chunk = AudioChunk(
                    stream_id=stream_id,
                    chunk_id=str(uuid.uuid4()),
                    timestamp=time.time(),
                    sequence=sequence,
                    data=data,
                    sample_rate=44100,
                    channels=2,
                    duration_ms=(len(data) / 4) / 44100 * 1000,  # 16bit stereo
                    rms_level=rms_normalized,
                    has_voice=has_voice,
                )

                # Update stream info
                stream_info = self.streams[stream_id]
                stream_info.bytes_received += len(data)
                stream_info.packets_received += 1
                stream_info.last_packet_at = datetime.now()
                stream_info.state = StreamState.STREAMING

                # Call audio callback
                if self.audio_callback:
                    await self.audio_callback(chunk, stream_info)

                sequence += 1

        except Exception as e:
            logger.error(f"Error reading RTMP audio data: {e}")

    async def _read_stderr(self):
        """Read FFmpeg stderr for debugging"""
        if not self.process:
            return

        try:
            while self.is_running and self.process:
                line = await self.process.stderr.readline()
                if not line:
                    break

                log_line = line.decode().strip()
                if log_line:
                    logger.debug(f"FFmpeg RTMP: {log_line}")

        except Exception as e:
            logger.error(f"Error reading RTMP stderr: {e}")

    async def stop(self):
        """Stop RTMP receiver"""
        self.is_running = False

        if self.process:
            try:
                self.process.terminate()
                await asyncio.wait_for(self.process.wait(), timeout=5.0)
            except asyncio.TimeoutError:
                self.process.kill()
                await self.process.wait()

            self.process = None

        # Update stream states
        for stream_info in self.streams.values():
            stream_info.state = StreamState.STOPPED

        logger.info("RTMP audio receiver stopped")

    def set_audio_callback(self, callback: Callable):
        """Set callback for received audio chunks"""
        self.audio_callback = callback

    def get_streams(self) -> Dict[str, AudioStreamInfo]:
        """Get active stream information"""
        return self.streams.copy()


class SRTAudioReceiver:
    """SRT audio stream receiver"""

    def __init__(self, port: int = 9998):
        self.port = port
        self.socket = None
        self.is_running = False
        self.streams: Dict[str, AudioStreamInfo] = {}
        self.jitter_buffers: Dict[str, JitterBuffer] = {}
        self.audio_callback: Optional[Callable] = None
        self.receive_task = None

    async def start(self) -> bool:
        """Start SRT listener for receiving audio streams"""
        try:
            # Use FFmpeg with SRT input
            cmd = [
                "ffmpeg",
                "-f",
                "mpegts",
                "-i",
                f"srt://:{self.port}?mode=listener",
                "-f",
                "wav",
                "-acodec",
                "pcm_s16le",
                "-ar",
                "44100",
                "-ac",
                "2",
                "-",
            ]

            self.process = await asyncio.create_subprocess_exec(
                *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
            )

            self.is_running = True

            # Start reading audio data
            asyncio.create_task(self._read_audio_data())
            asyncio.create_task(self._read_stderr())

            logger.info(f"SRT audio receiver started on port {self.port}")
            return True

        except Exception as e:
            logger.error(f"Failed to start SRT receiver: {e}")
            return False

    async def _read_audio_data(self):
        """Read audio data from SRT stream"""
        if not self.process:
            return

        try:
            chunk_size = 4096
            stream_id = f"srt_{self.port}"
            sequence = 0

            # Create stream info
            self.streams[stream_id] = AudioStreamInfo(
                stream_id=stream_id,
                protocol=StreamProtocol.SRT,
                source_ip="0.0.0.0",
                source_port=self.port,
                codec="pcm_s16le",
                sample_rate=44100,
                channels=2,
                bitrate=1411200,
                duration=0,
                bytes_received=0,
                packets_received=0,
                packets_lost=0,
                jitter=0,
                latency=0,
                state=StreamState.CONNECTED,
                created_at=datetime.now(),
                last_packet_at=None,
            )

            # Create jitter buffer for this stream
            self.jitter_buffers[stream_id] = JitterBuffer(
                target_delay_ms=50, max_delay_ms=200
            )

            while self.is_running and self.process:
                data = await self.process.stdout.read(chunk_size)
                if not data:
                    break

                # Calculate audio properties
                samples = np.frombuffer(data, dtype=np.int16)
                if len(samples) > 0:
                    rms = np.sqrt(np.mean(samples.astype(np.float32) ** 2))
                    rms_normalized = rms / 32768.0
                    has_voice = rms_normalized > 0.01
                else:
                    rms_normalized = 0
                    has_voice = False

                # Create audio chunk
                chunk = AudioChunk(
                    stream_id=stream_id,
                    chunk_id=str(uuid.uuid4()),
                    timestamp=time.time(),
                    sequence=sequence,
                    data=data,
                    sample_rate=44100,
                    channels=2,
                    duration_ms=(len(data) / 4) / 44100 * 1000,
                    rms_level=rms_normalized,
                    has_voice=has_voice,
                )

                # Add to jitter buffer
                jitter_buffer = self.jitter_buffers[stream_id]
                jitter_buffer.add_packet(chunk)

                # Try to get smoothed chunk from buffer
                smoothed_chunk = jitter_buffer.get_next_chunk()
                if smoothed_chunk:
                    # Update stream info
                    stream_info = self.streams[stream_id]
                    stream_info.bytes_received += len(smoothed_chunk.data)
                    stream_info.packets_received += 1
                    stream_info.last_packet_at = datetime.now()
                    stream_info.state = StreamState.STREAMING

                    # Calculate jitter
                    current_time = time.time()
                    expected_time = stream_info.created_at.timestamp() + (
                        sequence * chunk.duration_ms / 1000
                    )
                    jitter = abs(current_time - expected_time) * 1000  # ms
                    stream_info.jitter = jitter

                    # Call audio callback
                    if self.audio_callback:
                        await self.audio_callback(smoothed_chunk, stream_info)

                sequence += 1

        except Exception as e:
            logger.error(f"Error reading SRT audio data: {e}")

    async def _read_stderr(self):
        """Read FFmpeg stderr for debugging"""
        if not self.process:
            return

        try:
            while self.is_running and self.process:
                line = await self.process.stderr.readline()
                if not line:
                    break

                log_line = line.decode().strip()
                if log_line:
                    logger.debug(f"FFmpeg SRT: {log_line}")

        except Exception as e:
            logger.error(f"Error reading SRT stderr: {e}")

    async def stop(self):
        """Stop SRT receiver"""
        self.is_running = False

        if hasattr(self, "process") and self.process:
            try:
                self.process.terminate()
                await asyncio.wait_for(self.process.wait(), timeout=5.0)
            except asyncio.TimeoutError:
                self.process.kill()
                await self.process.wait()

            self.process = None

        # Update stream states
        for stream_info in self.streams.values():
            stream_info.state = StreamState.STOPPED

        logger.info("SRT audio receiver stopped")

    def set_audio_callback(self, callback: Callable):
        """Set callback for received audio chunks"""
        self.audio_callback = callback

    def get_streams(self) -> Dict[str, AudioStreamInfo]:
        """Get active stream information"""
        return self.streams.copy()

    def get_jitter_buffer_stats(self, stream_id: str) -> Optional[Dict[str, Any]]:
        """Get jitter buffer statistics for a stream"""
        if stream_id in self.jitter_buffers:
            return self.jitter_buffers[stream_id].get_stats()
        return None


class NetworkAudioServer:
    """Main network audio server managing multiple protocols"""

    def __init__(self, rtmp_port: int = 1935, srt_port: int = 9998):
        self.rtmp_port = rtmp_port
        self.srt_port = srt_port

        # Protocol handlers
        self.rtmp_receiver = RTMPAudioReceiver(rtmp_port)
        self.srt_receiver = SRTAudioReceiver(srt_port)

        # Active connections and streams
        self.active_streams: Dict[str, AudioStreamInfo] = {}
        self.audio_callbacks: List[Callable] = []
        self.websocket_clients: List[WebSocket] = []

        # Metrics and monitoring
        self.metrics = NetworkMetrics(
            bytes_per_second=0,
            packets_per_second=0,
            packet_loss_rate=0,
            average_jitter=0,
            average_latency=0,
            connection_count=0,
            active_streams=0,
        )

        # Stream recording
        self.recording_enabled = False
        self.recording_path = "./recordings"
        self.recorded_streams: Dict[str, Any] = {}

        # Auto source switching
        self.primary_source: Optional[str] = None
        self.fallback_source: Optional[str] = None
        self.auto_switch_enabled = True

        # Monitoring task
        self.monitoring_task = None

    async def start(self) -> bool:
        """Start the network audio server"""
        try:
            logger.info("Starting Network Audio Server...")

            # Set up audio callbacks
            self.rtmp_receiver.set_audio_callback(self._handle_audio_chunk)
            self.srt_receiver.set_audio_callback(self._handle_audio_chunk)

            # Start protocol receivers
            rtmp_started = await self.rtmp_receiver.start()
            srt_started = await self.srt_receiver.start()

            if not rtmp_started and not srt_started:
                raise Exception("Failed to start any protocol receivers")

            # Start monitoring
            self.monitoring_task = asyncio.create_task(self._monitoring_loop())

            # Create recordings directory
            if self.recording_enabled:
                os.makedirs(self.recording_path, exist_ok=True)

            logger.info(
                f"Network Audio Server started - RTMP:{rtmp_started}, SRT:{srt_started}"
            )
            return True

        except Exception as e:
            logger.error(f"Failed to start Network Audio Server: {e}")
            return False

    async def stop(self):
        """Stop the network audio server"""
        logger.info("Stopping Network Audio Server...")

        # Stop monitoring
        if self.monitoring_task:
            self.monitoring_task.cancel()
            try:
                await self.monitoring_task
            except asyncio.CancelledError:
                pass

        # Stop protocol receivers
        await self.rtmp_receiver.stop()
        await self.srt_receiver.stop()

        # Close recordings
        if self.recording_enabled:
            await self._stop_all_recordings()

        # Clear active streams
        self.active_streams.clear()

        logger.info("Network Audio Server stopped")

    async def _handle_audio_chunk(
        self, chunk: AudioChunk, stream_info: AudioStreamInfo
    ):
        """Handle received audio chunk from any protocol"""
        # Update active streams
        self.active_streams[chunk.stream_id] = stream_info

        # Auto source switching logic
        if self.auto_switch_enabled:
            await self._handle_auto_switching(chunk.stream_id, stream_info)

        # Record stream if enabled
        if self.recording_enabled:
            await self._record_audio_chunk(chunk)

        # Forward to registered callbacks
        for callback in self.audio_callbacks:
            try:
                await callback(chunk, stream_info)
            except Exception as e:
                logger.error(f"Error in audio callback: {e}")

        # Broadcast to WebSocket clients
        await self._broadcast_to_websockets(
            {
                "type": "audio_chunk",
                "stream_id": chunk.stream_id,
                "timestamp": chunk.timestamp,
                "duration_ms": chunk.duration_ms,
                "rms_level": chunk.rms_level,
                "has_voice": chunk.has_voice,
                "sequence": chunk.sequence,
            }
        )

    async def _handle_auto_switching(
        self, stream_id: str, stream_info: AudioStreamInfo
    ):
        """Handle automatic source switching"""
        current_time = datetime.now()

        # If no primary source, set this as primary
        if not self.primary_source:
            self.primary_source = stream_id
            logger.info(f"Set primary audio source: {stream_id}")
            return

        # Check if primary source is still active
        if self.primary_source in self.active_streams:
            primary_info = self.active_streams[self.primary_source]
            if primary_info.last_packet_at:
                time_since_last = current_time - primary_info.last_packet_at
                if time_since_last > timedelta(seconds=5):  # 5 second timeout
                    # Primary source timed out, switch to this source
                    logger.info(
                        f"Primary source {self.primary_source} timed out, switching to {stream_id}"
                    )
                    self.fallback_source = self.primary_source
                    self.primary_source = stream_id

        # Quality-based switching (prefer lower latency)
        if (
            stream_info.latency
            < self.active_streams.get(self.primary_source, stream_info).latency - 50
        ):  # 50ms threshold
            logger.info(f"Switching to lower latency source: {stream_id}")
            self.fallback_source = self.primary_source
            self.primary_source = stream_id

    async def _record_audio_chunk(self, chunk: AudioChunk):
        """Record audio chunk to file"""
        if chunk.stream_id not in self.recorded_streams:
            # Start new recording for this stream
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"{self.recording_path}/stream_{chunk.stream_id}_{timestamp}.wav"

            # Create WAV file header (44.1kHz, 16-bit stereo)
            self.recorded_streams[chunk.stream_id] = {
                "filename": filename,
                "file_handle": open(filename, "wb"),
                "sample_count": 0,
            }

            # Write WAV header (will be updated when recording stops)
            file_handle = self.recorded_streams[chunk.stream_id]["file_handle"]
            self._write_wav_header(file_handle, 44100, 2, 0)  # 0 size for now

        # Write audio data
        recording = self.recorded_streams[chunk.stream_id]
        recording["file_handle"].write(chunk.data)
        recording["sample_count"] += len(chunk.data) // 4  # 16-bit stereo

    def _write_wav_header(
        self, file_handle, sample_rate: int, channels: int, sample_count: int
    ):
        """Write WAV file header"""
        bytes_per_sample = 2  # 16-bit
        byte_rate = sample_rate * channels * bytes_per_sample
        block_align = channels * bytes_per_sample
        data_size = sample_count * bytes_per_sample
        file_size = 36 + data_size

        # WAV header
        file_handle.write(b"RIFF")
        file_handle.write(struct.pack("<I", file_size))
        file_handle.write(b"WAVE")
        file_handle.write(b"fmt ")
        file_handle.write(struct.pack("<I", 16))  # PCM format chunk size
        file_handle.write(struct.pack("<H", 1))  # PCM format
        file_handle.write(struct.pack("<H", channels))
        file_handle.write(struct.pack("<I", sample_rate))
        file_handle.write(struct.pack("<I", byte_rate))
        file_handle.write(struct.pack("<H", block_align))
        file_handle.write(struct.pack("<H", bytes_per_sample * 8))  # bits per sample
        file_handle.write(b"data")
        file_handle.write(struct.pack("<I", data_size))

    async def _stop_all_recordings(self):
        """Stop all active recordings"""
        for stream_id, recording in self.recorded_streams.items():
            try:
                file_handle = recording["file_handle"]

                # Update WAV header with correct size
                file_handle.seek(0)
                self._write_wav_header(file_handle, 44100, 2, recording["sample_count"])

                file_handle.close()
                logger.info(
                    f"Stopped recording for stream {stream_id}: {recording['filename']}"
                )

            except Exception as e:
                logger.error(f"Error stopping recording for {stream_id}: {e}")

        self.recorded_streams.clear()

    async def _monitoring_loop(self):
        """Monitor network audio performance"""
        while True:
            try:
                await asyncio.sleep(5)  # Update every 5 seconds

                # Calculate metrics
                total_bytes = sum(
                    stream.bytes_received for stream in self.active_streams.values()
                )
                total_packets = sum(
                    stream.packets_received for stream in self.active_streams.values()
                )
                total_lost = sum(
                    stream.packets_lost for stream in self.active_streams.values()
                )

                # Update metrics
                self.metrics.bytes_per_second = total_bytes / 5  # Rough estimate
                self.metrics.packets_per_second = total_packets / 5
                self.metrics.packet_loss_rate = total_lost / max(total_packets, 1) * 100
                self.metrics.active_streams = len(self.active_streams)
                self.metrics.connection_count = len(self.websocket_clients)

                if self.active_streams:
                    self.metrics.average_jitter = sum(
                        s.jitter for s in self.active_streams.values()
                    ) / len(self.active_streams)
                    self.metrics.average_latency = sum(
                        s.latency for s in self.active_streams.values()
                    ) / len(self.active_streams)

                # Broadcast metrics to WebSocket clients
                await self._broadcast_to_websockets(
                    {
                        "type": "network_metrics",
                        "metrics": asdict(self.metrics),
                        "timestamp": time.time(),
                    }
                )

                # Clean up inactive streams
                current_time = datetime.now()
                inactive_streams = []
                for stream_id, stream_info in self.active_streams.items():
                    if stream_info.last_packet_at:
                        time_since_last = current_time - stream_info.last_packet_at
                        if time_since_last > timedelta(seconds=30):  # 30 second timeout
                            inactive_streams.append(stream_id)

                for stream_id in inactive_streams:
                    logger.info(f"Removing inactive stream: {stream_id}")
                    del self.active_streams[stream_id]

                    # Stop recording for inactive stream
                    if stream_id in self.recorded_streams:
                        recording = self.recorded_streams[stream_id]
                        recording["file_handle"].close()
                        del self.recorded_streams[stream_id]

            except Exception as e:
                logger.error(f"Error in monitoring loop: {e}")

    async def _broadcast_to_websockets(self, message: Dict[str, Any]):
        """Broadcast message to all connected WebSocket clients"""
        if not self.websocket_clients:
            return

        message_json = json.dumps(message)
        disconnected_clients = []

        for client in self.websocket_clients:
            try:
                await client.send_text(message_json)
            except Exception as e:
                logger.error(f"Error sending to WebSocket client: {e}")
                disconnected_clients.append(client)

        # Remove disconnected clients
        for client in disconnected_clients:
            self.websocket_clients.remove(client)

    # Public API methods

    def add_audio_callback(self, callback: Callable):
        """Add callback for received audio chunks"""
        self.audio_callbacks.append(callback)

    def remove_audio_callback(self, callback: Callable):
        """Remove audio callback"""
        if callback in self.audio_callbacks:
            self.audio_callbacks.remove(callback)

    def add_websocket_client(self, websocket: WebSocket):
        """Add WebSocket client for real-time updates"""
        self.websocket_clients.append(websocket)

    def remove_websocket_client(self, websocket: WebSocket):
        """Remove WebSocket client"""
        if websocket in self.websocket_clients:
            self.websocket_clients.remove(websocket)

    def get_active_streams(self) -> Dict[str, AudioStreamInfo]:
        """Get information about active streams"""
        return self.active_streams.copy()

    def get_metrics(self) -> NetworkMetrics:
        """Get current network metrics"""
        return self.metrics

    def enable_recording(self, path: str = "./recordings"):
        """Enable stream recording"""
        self.recording_enabled = True
        self.recording_path = path
        os.makedirs(path, exist_ok=True)
        logger.info(f"Stream recording enabled: {path}")

    def disable_recording(self):
        """Disable stream recording"""
        self.recording_enabled = False
        logger.info("Stream recording disabled")

    def set_auto_switching(self, enabled: bool):
        """Enable/disable automatic source switching"""
        self.auto_switch_enabled = enabled
        logger.info(f"Auto source switching: {'enabled' if enabled else 'disabled'}")

    def get_primary_source(self) -> Optional[str]:
        """Get current primary audio source"""
        return self.primary_source

    def set_primary_source(self, stream_id: str):
        """Manually set primary audio source"""
        if stream_id in self.active_streams:
            self.primary_source = stream_id
            logger.info(f"Manually set primary source: {stream_id}")
        else:
            logger.warning(f"Cannot set primary source to inactive stream: {stream_id}")

    def get_jitter_buffer_stats(self) -> Dict[str, Any]:
        """Get jitter buffer statistics for all streams"""
        stats = {}

        # SRT streams have jitter buffers
        for stream_id in self.srt_receiver.streams:
            buffer_stats = self.srt_receiver.get_jitter_buffer_stats(stream_id)
            if buffer_stats:
                stats[stream_id] = buffer_stats

        return stats


# Global server instance
network_audio_server: Optional[NetworkAudioServer] = None


async def get_network_audio_server() -> NetworkAudioServer:
    """Get or create network audio server instance"""
    global network_audio_server
    if network_audio_server is None:
        network_audio_server = NetworkAudioServer()
        await network_audio_server.start()
    return network_audio_server
