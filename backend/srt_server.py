"""
SRT Server Implementation for MeetingMind
Provides robust SRT stream reception with low latency and error correction
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

class SRTStreamState(Enum):
    DISCONNECTED = "disconnected"
    CONNECTING = "connecting"
    CONNECTED = "connected"
    PUBLISHING = "publishing"
    ERROR = "error"
    STOPPED = "stopped"

class SRTServerState(Enum):
    STOPPED = "stopped"
    STARTING = "starting"
    RUNNING = "running"
    STOPPING = "stopping"
    ERROR = "error"

@dataclass
class SRTStreamInfo:
    """Information about an SRT stream"""
    stream_id: str
    client_ip: str
    client_port: int
    stream_name: str
    state: SRTStreamState
    start_time: datetime
    last_activity: datetime
    bytes_received: int
    packets_received: int
    packets_lost: int
    packets_retransmitted: int
    rtt_ms: float
    bandwidth_mbps: float
    bitrate_kbps: float
    resolution: str
    fps: float
    codec: str
    audio_codec: str
    audio_sample_rate: int
    audio_channels: int
    duration_seconds: float
    latency_ms: int

@dataclass
class SRTServerConfig:
    """SRT server configuration"""
    port: int = 9998
    max_connections: int = 50
    latency_ms: int = 200
    recv_buffer_size: int = 12058624  # 12MB
    peer_latency_ms: int = 0
    passphrase: Optional[str] = None
    pbkeylen: int = 16  # AES-128
    recording_enabled: bool = False
    recording_path: str = "./recordings"
    enable_stats: bool = True
    timeout_seconds: int = 30
    max_bw: int = -1  # Unlimited bandwidth
    inputbw: int = 0  # Auto-detect input bandwidth

class SRTServer:
    """
    SRT Server Implementation
    
    Features:
    - Low-latency streaming with error correction
    - Multiple concurrent stream support
    - Packet loss recovery and statistics
    - Optional encryption with passphrase
    - Real-time bandwidth and latency monitoring
    - Stream recording capabilities
    - Integration with audio pipeline
    """
    
    def __init__(self, config: SRTServerConfig = None):
        self.config = config or SRTServerConfig()
        self.state = SRTServerState.STOPPED
        self.active_streams: Dict[str, SRTStreamInfo] = {}
        self.ffmpeg_processes: Dict[str, subprocess.Popen] = {}
        self.stream_callbacks: List[Callable] = []
        
        # Server process
        self.server_process: Optional[subprocess.Popen] = None
        self.monitor_task: Optional[asyncio.Task] = None
        
        # Statistics
        self.stats = {
            'total_connections': 0,
            'current_connections': 0,
            'total_bytes_received': 0,
            'total_packets_received': 0,
            'total_packets_lost': 0,
            'total_packets_retransmitted': 0,
            'uptime_seconds': 0,
            'start_time': None,
            'average_latency_ms': 0,
            'average_bandwidth_mbps': 0
        }
        
        # Ensure directories exist
        if self.config.recording_enabled:
            os.makedirs(self.config.recording_path, exist_ok=True)
    
    async def start(self) -> bool:
        """Start the SRT server"""
        if self.state != SRTServerState.STOPPED:
            logger.warning("SRT server is not in stopped state")
            return False
        
        try:
            self.state = SRTServerState.STARTING
            logger.info(f"Starting SRT server on port {self.config.port}...")
            
            # Check if port is available
            if not await self._check_port_available():
                raise Exception(f"Port {self.config.port} is already in use")
            
            # Start FFmpeg SRT server
            await self._start_ffmpeg_server()
            
            # Start monitoring
            self.monitor_task = asyncio.create_task(self._monitor_streams())
            
            self.state = SRTServerState.RUNNING
            self.stats['start_time'] = datetime.now()
            
            logger.info(f"SRT server started successfully on port {self.config.port}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to start SRT server: {e}")
            self.state = SRTServerState.ERROR
            await self.stop()
            return False
    
    async def stop(self) -> bool:
        """Stop the SRT server"""
        if self.state == SRTServerState.STOPPED:
            return True
        
        try:
            self.state = SRTServerState.STOPPING
            logger.info("Stopping SRT server...")
            
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
                        asyncio.create_task(self._wait_for_process(self.server_process)),
                        timeout=5.0
                    )
                except asyncio.TimeoutError:
                    logger.warning("SRT server process didn't terminate gracefully, killing...")
                    self.server_process.kill()
                    await asyncio.create_task(self._wait_for_process(self.server_process))
                
                self.server_process = None
            
            self.state = SRTServerState.STOPPED
            logger.info("SRT server stopped")
            return True
            
        except Exception as e:
            logger.error(f"Error stopping SRT server: {e}")
            self.state = SRTServerState.ERROR
            return False
    
    async def _check_port_available(self) -> bool:
        """Check if the SRT port is available"""
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            sock.settimeout(1)
            result = sock.connect_ex(('localhost', self.config.port))
            sock.close()
            return result != 0  # Port is available if connection failed
        except Exception:
            return False
    
    async def _start_ffmpeg_server(self):
        """Start FFmpeg SRT server process"""
        # Create FFmpeg command for SRT server
        cmd = [
            'ffmpeg',
            '-hide_banner',
            '-loglevel', 'info',
            '-protocol_whitelist', 'file,udp,rtp,srt',
            '-f', 'mpegts',
            '-listen', '1',
            '-i', f'srt://0.0.0.0:{self.config.port}?mode=listener&latency={self.config.latency_ms}&rcvbuf={self.config.recv_buffer_size}',
        ]
        
        # Add passphrase if configured
        if self.config.passphrase:
            cmd[-1] += f'&passphrase={self.config.passphrase}&pbkeylen={self.config.pbkeylen}'
        
        # Add bandwidth limits if configured
        if self.config.max_bw > 0:
            cmd[-1] += f'&maxbw={self.config.max_bw}'
        
        if self.config.inputbw > 0:
            cmd[-1] += f'&inputbw={self.config.inputbw}'
        
        # Output to null (we'll handle streams separately)
        cmd.extend(['-c', 'copy', '-f', 'null', '-'])
        
        # Start the process
        self.server_process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            stdin=asyncio.subprocess.DEVNULL
        )
        
        # Start reading stderr for connection info
        asyncio.create_task(self._read_server_stderr())
        
        # Wait a moment for server to start
        await asyncio.sleep(2)
        
        if self.server_process.returncode is not None:
            stderr_output = await self.server_process.stderr.read()
            raise Exception(f"FFmpeg SRT server failed to start: {stderr_output.decode()}")
    
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
            logger.error(f"Error reading SRT server stderr: {e}")
    
    async def _parse_ffmpeg_log(self, log_line: str):
        """Parse FFmpeg log lines for stream events"""
        try:
            # Look for SRT connection events
            if "SRT connection" in log_line and "accepted" in log_line:
                # New SRT connection
                await self._handle_new_connection(log_line)
            elif "Stream #" in log_line:
                # New stream detected
                await self._handle_new_stream(log_line)
            elif "SRT connection" in log_line and "closed" in log_line:
                # Connection closed
                await self._handle_connection_closed(log_line)
            
            # Log important events
            if any(keyword in log_line.lower() for keyword in ['error', 'warning', 'connection', 'srt']):
                logger.info(f"SRT Server: {log_line}")
                
        except Exception as e:
            logger.error(f"Error parsing FFmpeg log: {e}")
    
    async def _handle_new_connection(self, log_line: str):
        """Handle new SRT connection"""
        try:
            self.stats['total_connections'] += 1
            self.stats['current_connections'] += 1
            logger.info(f"New SRT connection: {log_line}")
        except Exception as e:
            logger.error(f"Error handling new connection: {e}")
    
    async def _handle_new_stream(self, log_line: str):
        """Handle new incoming stream"""
        try:
            # Generate unique stream ID
            stream_id = str(uuid.uuid4())
            
            # Extract client info if available
            client_ip = "unknown"
            client_port = 0
            
            # Create stream info
            stream_info = SRTStreamInfo(
                stream_id=stream_id,
                client_ip=client_ip,
                client_port=client_port,
                stream_name="srt_stream",
                state=SRTStreamState.CONNECTING,
                start_time=datetime.now(),
                last_activity=datetime.now(),
                bytes_received=0,
                packets_received=0,
                packets_lost=0,
                packets_retransmitted=0,
                rtt_ms=0.0,
                bandwidth_mbps=0.0,
                bitrate_kbps=0,
                resolution="unknown",
                fps=0,
                codec="unknown",
                audio_codec="unknown",
                audio_sample_rate=48000,
                audio_channels=2,
                duration_seconds=0,
                latency_ms=self.config.latency_ms
            )
            
            self.active_streams[stream_id] = stream_info
            
            # Start processing this stream
            await self._start_stream_processor(stream_id)
            
            logger.info(f"New SRT stream: {stream_id}")
            
        except Exception as e:
            logger.error(f"Error handling new stream: {e}")
    
    async def _handle_connection_closed(self, log_line: str):
        """Handle SRT connection closure"""
        try:
            self.stats['current_connections'] = max(0, self.stats['current_connections'] - 1)
            logger.info(f"SRT connection closed: {log_line}")
        except Exception as e:
            logger.error(f"Error handling connection closure: {e}")
    
    async def _start_stream_processor(self, stream_id: str):
        """Start processing a specific SRT stream"""
        try:
            stream_info = self.active_streams.get(stream_id)
            if not stream_info:
                return
            
            # Create FFmpeg command to receive and process SRT stream
            cmd = [
                'ffmpeg',
                '-hide_banner',
                '-loglevel', 'warning',
                '-protocol_whitelist', 'file,udp,rtp,srt',
                '-i', f'srt://0.0.0.0:{self.config.port}?mode=listener&latency={self.config.latency_ms}',
                '-f', 'wav',
                '-acodec', 'pcm_s16le',
                '-ar', '48000',
                '-ac', '2',
                '-'
            ]
            
            # Add recording if enabled
            if self.config.recording_enabled:
                timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                recording_file = f"{self.config.recording_path}/srt_{stream_id}_{timestamp}.mp4"
                cmd.extend(['-c:v', 'copy', '-c:a', 'aac', recording_file])
            
            # Start processor
            process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            
            self.ffmpeg_processes[stream_id] = process
            
            # Start reading audio data and monitoring
            asyncio.create_task(self._read_stream_audio(stream_id, process))
            asyncio.create_task(self._read_stream_stderr(stream_id, process))
            asyncio.create_task(self._monitor_stream_stats(stream_id))
            
            # Update stream state
            stream_info.state = SRTStreamState.CONNECTED
            
        except Exception as e:
            logger.error(f"Error starting stream processor for {stream_id}: {e}")
            if stream_id in self.active_streams:
                self.active_streams[stream_id].state = SRTStreamState.ERROR
    
    async def _read_stream_audio(self, stream_id: str, process: subprocess.Popen):
        """Read audio data from stream processor"""
        try:
            chunk_size = 4096
            sequence = 0
            
            while process.returncode is None:
                data = await process.stdout.read(chunk_size)
                if not data:
                    break
                
                # Update stream stats
                if stream_id in self.active_streams:
                    stream_info = self.active_streams[stream_id]
                    stream_info.bytes_received += len(data)
                    stream_info.packets_received += 1
                    stream_info.last_activity = datetime.now()
                    stream_info.duration_seconds = (datetime.now() - stream_info.start_time).total_seconds()
                    stream_info.state = SRTStreamState.PUBLISHING
                    
                    # Calculate bitrate
                    if stream_info.duration_seconds > 0:
                        stream_info.bitrate_kbps = (stream_info.bytes_received * 8) / (stream_info.duration_seconds * 1000)
                
                # Create audio chunk for pipeline
                audio_chunk = {
                    'stream_id': f'srt_{stream_id}',
                    'chunk_id': str(uuid.uuid4()),
                    'timestamp': time.time(),
                    'sequence': sequence,
                    'data': data,
                    'sample_rate': 48000,
                    'channels': 2,
                    'duration_ms': (len(data) / 4) / 48000 * 1000,  # 16bit stereo
                    'source': 'srt',
                    'latency_ms': self.config.latency_ms
                }
                
                # Send to callbacks
                for callback in self.stream_callbacks:
                    try:
                        await callback(audio_chunk, self.active_streams[stream_id])
                    except Exception as e:
                        logger.error(f"Error in stream callback: {e}")
                
                sequence += 1
                
        except Exception as e:
            logger.error(f"Error reading audio for stream {stream_id}: {e}")
        finally:
            # Mark stream as disconnected
            if stream_id in self.active_streams:
                self.active_streams[stream_id].state = SRTStreamState.DISCONNECTED
    
    async def _read_stream_stderr(self, stream_id: str, process: subprocess.Popen):
        """Read stderr from stream processor for debugging"""
        try:
            while process.returncode is None:
                line = await process.stderr.readline()
                if not line:
                    break
                
                log_line = line.decode().strip()
                if log_line:
                    # Parse SRT statistics from FFmpeg output
                    await self._parse_stream_stats(stream_id, log_line)
                    
                    if 'error' in log_line.lower():
                        logger.warning(f"Stream {stream_id}: {log_line}")
                        
        except Exception as e:
            logger.error(f"Error reading stderr for stream {stream_id}: {e}")
    
    async def _parse_stream_stats(self, stream_id: str, log_line: str):
        """Parse SRT statistics from FFmpeg log"""
        try:
            if stream_id not in self.active_streams:
                return
            
            stream_info = self.active_streams[stream_id]
            
            # Look for SRT statistics in the log
            if "SRT" in log_line and "RTT" in log_line:
                # Parse RTT information
                parts = log_line.split()
                for i, part in enumerate(parts):
                    if "RTT" in part and i + 1 < len(parts):
                        try:
                            rtt_value = float(parts[i + 1].replace("ms", ""))
                            stream_info.rtt_ms = rtt_value
                        except (ValueError, IndexError):
                            pass
            
            if "bandwidth" in log_line.lower():
                # Parse bandwidth information
                parts = log_line.split()
                for i, part in enumerate(parts):
                    if "mbps" in part.lower() and i > 0:
                        try:
                            bw_value = float(parts[i - 1])
                            stream_info.bandwidth_mbps = bw_value
                        except (ValueError, IndexError):
                            pass
            
        except Exception as e:
            logger.error(f"Error parsing stream stats: {e}")
    
    async def _monitor_stream_stats(self, stream_id: str):
        """Monitor stream statistics and health"""
        try:
            while stream_id in self.active_streams:
                await asyncio.sleep(5)  # Update stats every 5 seconds
                
                if stream_id not in self.active_streams:
                    break
                
                stream_info = self.active_streams[stream_id]
                
                # Update global statistics
                self.stats['total_bytes_received'] += stream_info.bytes_received
                self.stats['total_packets_received'] += stream_info.packets_received
                self.stats['total_packets_lost'] += stream_info.packets_lost
                self.stats['total_packets_retransmitted'] += stream_info.packets_retransmitted
                
                # Calculate averages
                active_count = len([s for s in self.active_streams.values() if s.state == SRTStreamState.PUBLISHING])
                if active_count > 0:
                    total_latency = sum(s.rtt_ms for s in self.active_streams.values() if s.state == SRTStreamState.PUBLISHING)
                    total_bandwidth = sum(s.bandwidth_mbps for s in self.active_streams.values() if s.state == SRTStreamState.PUBLISHING)
                    self.stats['average_latency_ms'] = total_latency / active_count
                    self.stats['average_bandwidth_mbps'] = total_bandwidth / active_count
                
        except Exception as e:
            logger.error(f"Error monitoring stream stats for {stream_id}: {e}")
    
    async def _monitor_streams(self):
        """Monitor active streams and cleanup stale ones"""
        while self.state == SRTServerState.RUNNING:
            try:
                await asyncio.sleep(10)  # Check every 10 seconds
                
                current_time = datetime.now()
                stale_streams = []
                
                for stream_id, stream_info in self.active_streams.items():
                    # Check for stale streams (no activity for timeout period)
                    time_since_activity = current_time - stream_info.last_activity
                    if time_since_activity > timedelta(seconds=self.config.timeout_seconds):
                        stale_streams.append(stream_id)
                
                # Remove stale streams
                for stream_id in stale_streams:
                    logger.info(f"Removing stale SRT stream: {stream_id}")
                    await self._stop_stream(stream_id)
                
                # Update uptime
                if self.stats['start_time']:
                    self.stats['uptime_seconds'] = (current_time - self.stats['start_time']).total_seconds()
                
            except Exception as e:
                logger.error(f"Error in stream monitoring: {e}")
    
    async def _stop_stream(self, stream_id: str):
        """Stop processing a specific stream"""
        try:
            # Stop FFmpeg process
            if stream_id in self.ffmpeg_processes:
                process = self.ffmpeg_processes[stream_id]
                try:
                    process.terminate()
                    await asyncio.wait_for(
                        asyncio.create_task(self._wait_for_process(process)),
                        timeout=5.0
                    )
                except asyncio.TimeoutError:
                    process.kill()
                    await asyncio.create_task(self._wait_for_process(process))
                
                del self.ffmpeg_processes[stream_id]
            
            # Remove from active streams
            if stream_id in self.active_streams:
                del self.active_streams[stream_id]
            
            logger.info(f"Stopped SRT stream: {stream_id}")
            
        except Exception as e:
            logger.error(f"Error stopping stream {stream_id}: {e}")
    
    async def _stop_all_streams(self):
        """Stop all active streams"""
        stream_ids = list(self.active_streams.keys())
        for stream_id in stream_ids:
            await self._stop_stream(stream_id)
    
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
    
    def get_active_streams(self) -> Dict[str, SRTStreamInfo]:
        """Get information about active streams"""
        return self.active_streams.copy()
    
    def get_server_stats(self) -> Dict[str, Any]:
        """Get server statistics"""
        return {
            **self.stats,
            'state': self.state.value,
            'active_streams': len(self.active_streams),
            'config': asdict(self.config)
        }
    
    def get_stream_info(self, stream_id: str) -> Optional[SRTStreamInfo]:
        """Get information about a specific stream"""
        return self.active_streams.get(stream_id)


# Global SRT server instance
srt_server: Optional[SRTServer] = None

async def get_srt_server(config: SRTServerConfig = None) -> SRTServer:
    """Get or create SRT server instance"""
    global srt_server
    if srt_server is None:
        srt_server = SRTServer(config or SRTServerConfig())
    return srt_server

async def start_srt_server(config: SRTServerConfig = None) -> bool:
    """Start the global SRT server"""
    server = await get_srt_server(config)
    return await server.start()

async def stop_srt_server() -> bool:
    """Stop the global SRT server"""
    global srt_server
    if srt_server:
        result = await srt_server.stop()
        srt_server = None
        return result
    return True