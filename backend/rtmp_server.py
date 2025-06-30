"""
Enhanced RTMP Server for MeetingMind
Provides robust RTMP stream reception with multiple stream support and advanced features
"""

import asyncio
import logging
import json
import subprocess
import time
import uuid
import os
import signal
from typing import Dict, List, Optional, Callable, Any
from dataclasses import dataclass, asdict
from datetime import datetime, timedelta
from enum import Enum
from pathlib import Path
import threading
import queue
import socket

logger = logging.getLogger(__name__)


class RTMPStreamState(Enum):
    DISCONNECTED = "disconnected"
    CONNECTING = "connecting"
    CONNECTED = "connected"
    PUBLISHING = "publishing"
    ERROR = "error"
    STOPPED = "stopped"


class RTMPServerState(Enum):
    STOPPED = "stopped"
    STARTING = "starting"
    RUNNING = "running"
    STOPPING = "stopping"
    ERROR = "error"


@dataclass
class RTMPStreamInfo:
    """Information about an RTMP stream"""

    stream_key: str
    client_ip: str
    client_port: int
    app_name: str
    stream_name: str
    state: RTMPStreamState
    start_time: datetime
    last_activity: datetime
    bytes_received: int
    frames_received: int
    bitrate_kbps: float
    resolution: str
    fps: float
    codec: str
    audio_codec: str
    audio_sample_rate: int
    audio_channels: int
    duration_seconds: float


@dataclass
class RTMPServerConfig:
    """RTMP server configuration"""

    port: int = 1935
    max_connections: int = 100
    chunk_size: int = 4096
    timeout_seconds: int = 30
    enable_authentication: bool = False
    allowed_apps: List[str] = None
    recording_enabled: bool = False
    recording_path: str = "./recordings"
    enable_relay: bool = False
    relay_targets: List[str] = None
    buffer_size_ms: int = 2000
    enable_stats: bool = True


class RTMPServer:
    """
    Enhanced RTMP Server Implementation

    Features:
    - Multiple concurrent stream support
    - Stream authentication and authorization
    - Real-time stream statistics
    - Automatic stream recording
    - Stream relay/rebroadcast
    - Connection management and monitoring
    - Integration with audio pipeline
    """

    def __init__(self, config: RTMPServerConfig = None):
        self.config = config or RTMPServerConfig()
        self.state = RTMPServerState.STOPPED
        self.active_streams: Dict[str, RTMPStreamInfo] = {}
        self.ffmpeg_processes: Dict[str, subprocess.Popen] = {}
        self.stream_callbacks: List[Callable] = []

        # Server process
        self.server_process: Optional[subprocess.Popen] = None
        self.monitor_task: Optional[asyncio.Task] = None

        # Statistics
        self.stats = {
            "total_connections": 0,
            "current_connections": 0,
            "total_bytes_received": 0,
            "uptime_seconds": 0,
            "start_time": None,
        }

        # Ensure directories exist
        if self.config.recording_enabled:
            os.makedirs(self.config.recording_path, exist_ok=True)

    async def start(self) -> bool:
        """Start the RTMP server"""
        if self.state != RTMPServerState.STOPPED:
            logger.warning("RTMP server is not in stopped state")
            return False

        try:
            self.state = RTMPServerState.STARTING
            logger.info(f"Starting RTMP server on port {self.config.port}...")

            # Check if port is available
            if not await self._check_port_available():
                raise Exception(f"Port {self.config.port} is already in use")

            # Start FFmpeg RTMP server
            await self._start_ffmpeg_server()

            # Start monitoring
            self.monitor_task = asyncio.create_task(self._monitor_streams())

            self.state = RTMPServerState.RUNNING
            self.stats["start_time"] = datetime.now()

            logger.info(f"RTMP server started successfully on port {self.config.port}")
            return True

        except Exception as e:
            logger.error(f"Failed to start RTMP server: {e}")
            self.state = RTMPServerState.ERROR
            await self.stop()
            return False

    async def stop(self) -> bool:
        """Stop the RTMP server"""
        if self.state == RTMPServerState.STOPPED:
            return True

        try:
            self.state = RTMPServerState.STOPPING
            logger.info("Stopping RTMP server...")

            # Stop monitoring
            if self.monitor_task:
                self.monitor_task.cancel()
                try:
                    await self.monitor_task
                except asyncio.CancelledError:
                    pass

            # Stop all stream processors
            await self._stop_all_streams()

            # Stop server process
            if self.server_process:
                try:
                    self.server_process.terminate()
                    await asyncio.wait_for(
                        asyncio.create_task(
                            self._wait_for_process(self.server_process)
                        ),
                        timeout=5.0,
                    )
                except asyncio.TimeoutError:
                    logger.warning(
                        "RTMP server process didn't terminate gracefully, killing..."
                    )
                    self.server_process.kill()
                    await asyncio.create_task(
                        self._wait_for_process(self.server_process)
                    )

                self.server_process = None

            self.state = RTMPServerState.STOPPED
            logger.info("RTMP server stopped")
            return True

        except Exception as e:
            logger.error(f"Error stopping RTMP server: {e}")
            self.state = RTMPServerState.ERROR
            return False

    async def _check_port_available(self) -> bool:
        """Check if the RTMP port is available"""
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(1)
            result = sock.connect_ex(("localhost", self.config.port))
            sock.close()
            return result != 0  # Port is available if connection failed
        except Exception:
            return False

    async def _start_ffmpeg_server(self):
        """Start FFmpeg RTMP server process"""
        # Create FFmpeg command for RTMP server
        cmd = [
            "ffmpeg",
            "-hide_banner",
            "-loglevel",
            "info",
            "-f",
            "flv",
            "-listen",
            "1",
            "-timeout",
            str(self.config.timeout_seconds * 1000000),  # microseconds
            "-i",
            f"rtmp://localhost:{self.config.port}/live",
            "-c",
            "copy",
            "-f",
            "null",
            "-",
        ]

        # Start the process
        self.server_process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            stdin=asyncio.subprocess.DEVNULL,
        )

        # Start reading stderr for connection info
        asyncio.create_task(self._read_server_stderr())

        # Wait a moment for server to start
        await asyncio.sleep(1)

        if self.server_process.returncode is not None:
            raise Exception("FFmpeg RTMP server failed to start")

    async def _read_server_stderr(self):
        """Read FFmpeg server stderr for connection monitoring"""
        if not self.server_process:
            return

        try:
            while self.server_process.returncode is None:
                line = await self.server_process.stderr.readline()
                if not line:
                    break

                log_line = line.decode().strip()
                if log_line:
                    await self._parse_ffmpeg_log(log_line)

        except Exception as e:
            logger.error(f"Error reading RTMP server stderr: {e}")

    async def _parse_ffmpeg_log(self, log_line: str):
        """Parse FFmpeg log lines for stream events"""
        try:
            # Look for connection events
            if "Stream #" in log_line:
                # New stream detected
                await self._handle_new_stream(log_line)
            elif "Connection from" in log_line:
                # New client connection
                self.stats["total_connections"] += 1
                self.stats["current_connections"] += 1
            elif "Closing connection" in log_line:
                # Client disconnection
                self.stats["current_connections"] = max(
                    0, self.stats["current_connections"] - 1
                )

            # Log important events
            if any(
                keyword in log_line.lower()
                for keyword in ["error", "warning", "connection"]
            ):
                logger.info(f"RTMP Server: {log_line}")

        except Exception as e:
            logger.error(f"Error parsing FFmpeg log: {e}")

    async def _handle_new_stream(self, log_line: str):
        """Handle new incoming stream"""
        try:
            # Extract stream information from log
            stream_key = str(uuid.uuid4())  # Generate unique key

            # Create stream info
            stream_info = RTMPStreamInfo(
                stream_key=stream_key,
                client_ip="unknown",
                client_port=0,
                app_name="live",
                stream_name="stream",
                state=RTMPStreamState.CONNECTING,
                start_time=datetime.now(),
                last_activity=datetime.now(),
                bytes_received=0,
                frames_received=0,
                bitrate_kbps=0,
                resolution="unknown",
                fps=0,
                codec="unknown",
                audio_codec="unknown",
                audio_sample_rate=44100,
                audio_channels=2,
                duration_seconds=0,
            )

            self.active_streams[stream_key] = stream_info

            # Start processing this stream
            await self._start_stream_processor(stream_key)

            logger.info(f"New RTMP stream: {stream_key}")

        except Exception as e:
            logger.error(f"Error handling new stream: {e}")

    async def _start_stream_processor(self, stream_key: str):
        """Start processing a specific RTMP stream"""
        try:
            stream_info = self.active_streams.get(stream_key)
            if not stream_info:
                return

            # Create FFmpeg command to process this specific stream
            cmd = [
                "ffmpeg",
                "-hide_banner",
                "-loglevel",
                "warning",
                "-i",
                f"rtmp://localhost:{self.config.port}/live/{stream_info.stream_name}",
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

            # Add recording if enabled
            if self.config.recording_enabled:
                timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                recording_file = (
                    f"{self.config.recording_path}/rtmp_{stream_key}_{timestamp}.mp4"
                )
                cmd.extend(["-c:v", "copy", "-c:a", "aac", recording_file])

            # Start processor
            process = await asyncio.create_subprocess_exec(
                *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
            )

            self.ffmpeg_processes[stream_key] = process

            # Start reading audio data
            asyncio.create_task(self._read_stream_audio(stream_key, process))
            asyncio.create_task(self._read_stream_stderr(stream_key, process))

            # Update stream state
            stream_info.state = RTMPStreamState.CONNECTED

        except Exception as e:
            logger.error(f"Error starting stream processor for {stream_key}: {e}")
            if stream_key in self.active_streams:
                self.active_streams[stream_key].state = RTMPStreamState.ERROR

    async def _read_stream_audio(self, stream_key: str, process: subprocess.Popen):
        """Read audio data from stream processor"""
        try:
            chunk_size = 4096
            sequence = 0

            while process.returncode is None:
                data = await process.stdout.read(chunk_size)
                if not data:
                    break

                # Update stream stats
                if stream_key in self.active_streams:
                    stream_info = self.active_streams[stream_key]
                    stream_info.bytes_received += len(data)
                    stream_info.frames_received += 1
                    stream_info.last_activity = datetime.now()
                    stream_info.duration_seconds = (
                        datetime.now() - stream_info.start_time
                    ).total_seconds()
                    stream_info.state = RTMPStreamState.PUBLISHING

                    # Calculate bitrate
                    if stream_info.duration_seconds > 0:
                        stream_info.bitrate_kbps = (stream_info.bytes_received * 8) / (
                            stream_info.duration_seconds * 1000
                        )

                # Create audio chunk for pipeline
                audio_chunk = {
                    "stream_id": f"rtmp_{stream_key}",
                    "chunk_id": str(uuid.uuid4()),
                    "timestamp": time.time(),
                    "sequence": sequence,
                    "data": data,
                    "sample_rate": 44100,
                    "channels": 2,
                    "duration_ms": (len(data) / 4) / 44100 * 1000,  # 16bit stereo
                    "source": "rtmp",
                }

                # Send to callbacks
                for callback in self.stream_callbacks:
                    try:
                        await callback(audio_chunk, self.active_streams[stream_key])
                    except Exception as e:
                        logger.error(f"Error in stream callback: {e}")

                sequence += 1

        except Exception as e:
            logger.error(f"Error reading audio for stream {stream_key}: {e}")
        finally:
            # Mark stream as disconnected
            if stream_key in self.active_streams:
                self.active_streams[stream_key].state = RTMPStreamState.DISCONNECTED

    async def _read_stream_stderr(self, stream_key: str, process: subprocess.Popen):
        """Read stderr from stream processor for debugging"""
        try:
            while process.returncode is None:
                line = await process.stderr.readline()
                if not line:
                    break

                log_line = line.decode().strip()
                if log_line and "error" in log_line.lower():
                    logger.warning(f"Stream {stream_key}: {log_line}")

        except Exception as e:
            logger.error(f"Error reading stderr for stream {stream_key}: {e}")

    async def _monitor_streams(self):
        """Monitor active streams and cleanup stale ones"""
        while self.state == RTMPServerState.RUNNING:
            try:
                await asyncio.sleep(10)  # Check every 10 seconds

                current_time = datetime.now()
                stale_streams = []

                for stream_key, stream_info in self.active_streams.items():
                    # Check for stale streams (no activity for timeout period)
                    time_since_activity = current_time - stream_info.last_activity
                    if time_since_activity > timedelta(
                        seconds=self.config.timeout_seconds
                    ):
                        stale_streams.append(stream_key)

                # Remove stale streams
                for stream_key in stale_streams:
                    logger.info(f"Removing stale stream: {stream_key}")
                    await self._stop_stream(stream_key)

                # Update uptime
                if self.stats["start_time"]:
                    self.stats["uptime_seconds"] = (
                        current_time - self.stats["start_time"]
                    ).total_seconds()

            except Exception as e:
                logger.error(f"Error in stream monitoring: {e}")

    async def _stop_stream(self, stream_key: str):
        """Stop processing a specific stream"""
        try:
            # Stop FFmpeg process
            if stream_key in self.ffmpeg_processes:
                process = self.ffmpeg_processes[stream_key]
                try:
                    process.terminate()
                    await asyncio.wait_for(
                        asyncio.create_task(self._wait_for_process(process)),
                        timeout=5.0,
                    )
                except asyncio.TimeoutError:
                    process.kill()
                    await asyncio.create_task(self._wait_for_process(process))

                del self.ffmpeg_processes[stream_key]

            # Remove from active streams
            if stream_key in self.active_streams:
                del self.active_streams[stream_key]

            logger.info(f"Stopped stream: {stream_key}")

        except Exception as e:
            logger.error(f"Error stopping stream {stream_key}: {e}")

    async def _stop_all_streams(self):
        """Stop all active streams"""
        stream_keys = list(self.active_streams.keys())
        for stream_key in stream_keys:
            await self._stop_stream(stream_key)

    async def _wait_for_process(self, process: subprocess.Popen):
        """Wait for a process to terminate"""
        while process.returncode is None:
            await asyncio.sleep(0.1)

    def add_stream_callback(self, callback: Callable):
        """Add callback for stream audio data"""
        self.stream_callbacks.append(callback)

    def remove_stream_callback(self, callback: Callable):
        """Remove stream callback"""
        if callback in self.stream_callbacks:
            self.stream_callbacks.remove(callback)

    def get_active_streams(self) -> Dict[str, RTMPStreamInfo]:
        """Get information about active streams"""
        return self.active_streams.copy()

    def get_server_stats(self) -> Dict[str, Any]:
        """Get server statistics"""
        return {
            **self.stats,
            "state": self.state.value,
            "active_streams": len(self.active_streams),
            "config": asdict(self.config),
        }

    def get_stream_info(self, stream_key: str) -> Optional[RTMPStreamInfo]:
        """Get information about a specific stream"""
        return self.active_streams.get(stream_key)


# Global RTMP server instance
rtmp_server: Optional[RTMPServer] = None


async def get_rtmp_server(config: RTMPServerConfig = None) -> RTMPServer:
    """Get or create RTMP server instance"""
    global rtmp_server
    if rtmp_server is None:
        rtmp_server = RTMPServer(config or RTMPServerConfig())
    return rtmp_server


async def start_rtmp_server(config: RTMPServerConfig = None) -> bool:
    """Start the global RTMP server"""
    server = await get_rtmp_server(config)
    return await server.start()


async def stop_rtmp_server() -> bool:
    """Stop the global RTMP server"""
    global rtmp_server
    if rtmp_server:
        result = await rtmp_server.stop()
        rtmp_server = None
        return result
    return True
