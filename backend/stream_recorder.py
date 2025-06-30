"""
Stream Recording System for MeetingMind
Provides comprehensive recording capabilities for all audio sources
"""

import asyncio
import logging
import os
import time
import uuid
import threading
from typing import Dict, List, Optional, Callable, Any, Union
from dataclasses import dataclass, asdict
from datetime import datetime, timedelta
from enum import Enum
from pathlib import Path
import json
import wave
import subprocess
import tempfile

logger = logging.getLogger(__name__)


class RecordingState(Enum):
    IDLE = "idle"
    RECORDING = "recording"
    PAUSED = "paused"
    STOPPING = "stopping"
    STOPPED = "stopped"
    ERROR = "error"


class RecordingFormat(Enum):
    WAV = "wav"
    MP3 = "mp3"
    AAC = "aac"
    FLAC = "flac"
    OGG = "ogg"


class RecordingQuality(Enum):
    LOW = "low"  # 64 kbps
    MEDIUM = "medium"  # 128 kbps
    HIGH = "high"  # 256 kbps
    LOSSLESS = "lossless"  # No compression


@dataclass
class RecordingConfig:
    """Configuration for stream recording"""

    output_directory: str = "./recordings"
    filename_template: str = "{source_id}_{timestamp}_{session_id}"
    format: RecordingFormat = RecordingFormat.WAV
    quality: RecordingQuality = RecordingQuality.HIGH
    sample_rate: int = 48000
    channels: int = 2
    auto_start: bool = False
    max_file_size_mb: int = 1024  # 1GB default
    max_duration_minutes: int = 180  # 3 hours default
    split_on_silence: bool = False
    silence_threshold_db: float = -40.0
    silence_duration_seconds: float = 5.0
    enable_metadata: bool = True
    compress_on_complete: bool = False
    delete_source_after_compress: bool = False


@dataclass
class AudioChunk:
    """Represents an audio chunk for recording"""

    timestamp: float
    data: bytes
    sample_rate: int
    channels: int
    source_id: str
    sequence_number: int
    duration_ms: float


@dataclass
class RecordingSession:
    """Information about a recording session"""

    session_id: str
    source_id: str
    start_time: datetime
    end_time: Optional[datetime]
    state: RecordingState
    config: RecordingConfig
    output_file: str
    file_size_bytes: int
    duration_seconds: float
    total_chunks: int
    sample_rate: int
    channels: int
    metadata: Dict[str, Any]


class AudioBuffer:
    """Thread-safe audio buffer for recording"""

    def __init__(self, max_size: int = 10000):
        self.max_size = max_size
        self.chunks: List[AudioChunk] = []
        self.lock = threading.RLock()
        self.total_bytes = 0

    def add_chunk(self, chunk: AudioChunk) -> bool:
        """Add an audio chunk to the buffer"""
        with self.lock:
            if len(self.chunks) >= self.max_size:
                # Remove oldest chunk to make room
                removed = self.chunks.pop(0)
                self.total_bytes -= len(removed.data)

            self.chunks.append(chunk)
            self.total_bytes += len(chunk.data)
            return True

    def get_chunks(self, count: Optional[int] = None) -> List[AudioChunk]:
        """Get chunks from the buffer"""
        with self.lock:
            if count is None:
                chunks = self.chunks.copy()
                self.chunks.clear()
                self.total_bytes = 0
            else:
                chunks = self.chunks[:count]
                self.chunks = self.chunks[count:]
                self.total_bytes -= sum(len(chunk.data) for chunk in chunks)

            return chunks

    def clear(self):
        """Clear all chunks from the buffer"""
        with self.lock:
            self.chunks.clear()
            self.total_bytes = 0

    def get_size(self) -> int:
        """Get current buffer size"""
        with self.lock:
            return len(self.chunks)

    def get_total_bytes(self) -> int:
        """Get total bytes in buffer"""
        with self.lock:
            return self.total_bytes


class StreamRecorder:
    """
    Stream Recording Engine

    Features:
    - Multi-source recording (microphone, RTMP, SRT)
    - Multiple audio formats (WAV, MP3, AAC, FLAC, OGG)
    - Quality settings and compression
    - Automatic file splitting based on size/duration
    - Silence detection and splitting
    - Metadata generation and embedding
    - Real-time monitoring and statistics
    - Pause/resume functionality
    - Post-processing and compression
    """

    def __init__(self, source_id: str, config: RecordingConfig = None):
        self.source_id = source_id
        self.config = config or RecordingConfig()
        self.session_id = str(uuid.uuid4())

        # Recording state
        self.state = RecordingState.IDLE
        self.session: Optional[RecordingSession] = None
        self.start_time: Optional[datetime] = None
        self.pause_time: Optional[datetime] = None
        self.total_paused_duration = 0.0

        # Audio processing
        self.buffer = AudioBuffer()
        self.writer_task: Optional[asyncio.Task] = None
        self.current_file_handle: Optional[wave.Wave_write] = None
        self.temp_files: List[str] = []

        # Statistics
        self.stats = {
            "total_chunks_received": 0,
            "total_bytes_recorded": 0,
            "recording_duration_seconds": 0,
            "average_chunk_size": 0,
            "peak_buffer_size": 0,
            "files_created": 0,
            "last_chunk_time": None,
        }

        # Silence detection
        self.silence_detector = (
            SilenceDetector(
                threshold_db=self.config.silence_threshold_db,
                duration_seconds=self.config.silence_duration_seconds,
            )
            if self.config.split_on_silence
            else None
        )

        # Threading
        self.lock = threading.RLock()

        # Ensure output directory exists
        os.makedirs(self.config.output_directory, exist_ok=True)

        logger.info(f"Stream recorder created for source {source_id}")

    async def start_recording(self) -> bool:
        """Start recording"""
        try:
            if self.state != RecordingState.IDLE:
                logger.warning(f"Cannot start recording - current state: {self.state}")
                return False

            logger.info(f"Starting recording for source {self.source_id}")

            self.state = RecordingState.RECORDING
            self.start_time = datetime.now()
            self.session_id = str(uuid.uuid4())

            # Create recording session
            output_file = self._generate_filename()
            self.session = RecordingSession(
                session_id=self.session_id,
                source_id=self.source_id,
                start_time=self.start_time,
                end_time=None,
                state=self.state,
                config=self.config,
                output_file=output_file,
                file_size_bytes=0,
                duration_seconds=0,
                total_chunks=0,
                sample_rate=self.config.sample_rate,
                channels=self.config.channels,
                metadata={},
            )

            # Start writer task
            self.writer_task = asyncio.create_task(self._audio_writer_loop())

            # Initialize file
            await self._initialize_output_file()

            logger.info(
                f"Recording started for source {self.source_id}, session {self.session_id}"
            )
            return True

        except Exception as e:
            logger.error(f"Failed to start recording for {self.source_id}: {e}")
            self.state = RecordingState.ERROR
            return False

    async def stop_recording(self) -> bool:
        """Stop recording"""
        try:
            if self.state not in [RecordingState.RECORDING, RecordingState.PAUSED]:
                logger.warning(f"Cannot stop recording - current state: {self.state}")
                return False

            logger.info(f"Stopping recording for source {self.source_id}")

            self.state = RecordingState.STOPPING

            # Stop writer task
            if self.writer_task:
                self.writer_task.cancel()
                try:
                    await self.writer_task
                except asyncio.CancelledError:
                    pass

            # Finalize current file
            await self._finalize_current_file()

            # Update session
            if self.session:
                self.session.end_time = datetime.now()
                self.session.state = RecordingState.STOPPED
                self.session.duration_seconds = (
                    self.session.end_time - self.session.start_time
                ).total_seconds() - self.total_paused_duration

                # Generate metadata
                if self.config.enable_metadata:
                    await self._generate_metadata()

                # Post-process if needed
                if self.config.compress_on_complete:
                    await self._post_process_recording()

            self.state = RecordingState.STOPPED

            logger.info(f"Recording stopped for source {self.source_id}")
            return True

        except Exception as e:
            logger.error(f"Error stopping recording for {self.source_id}: {e}")
            self.state = RecordingState.ERROR
            return False

    async def pause_recording(self) -> bool:
        """Pause recording"""
        try:
            if self.state != RecordingState.RECORDING:
                return False

            self.state = RecordingState.PAUSED
            self.pause_time = datetime.now()

            logger.info(f"Recording paused for source {self.source_id}")
            return True

        except Exception as e:
            logger.error(f"Error pausing recording: {e}")
            return False

    async def resume_recording(self) -> bool:
        """Resume recording"""
        try:
            if self.state != RecordingState.PAUSED:
                return False

            if self.pause_time:
                pause_duration = (datetime.now() - self.pause_time).total_seconds()
                self.total_paused_duration += pause_duration
                self.pause_time = None

            self.state = RecordingState.RECORDING

            logger.info(f"Recording resumed for source {self.source_id}")
            return True

        except Exception as e:
            logger.error(f"Error resuming recording: {e}")
            return False

    def add_audio_chunk(self, chunk: AudioChunk) -> bool:
        """Add an audio chunk to be recorded"""
        try:
            if self.state != RecordingState.RECORDING:
                return False

            # Update statistics
            self.stats["total_chunks_received"] += 1
            self.stats["total_bytes_recorded"] += len(chunk.data)
            self.stats["last_chunk_time"] = time.time()

            current_buffer_size = self.buffer.get_size()
            if current_buffer_size > self.stats["peak_buffer_size"]:
                self.stats["peak_buffer_size"] = current_buffer_size

            # Add to buffer
            success = self.buffer.add_chunk(chunk)

            # Update session
            if self.session:
                self.session.total_chunks += 1
                if self.start_time:
                    self.session.duration_seconds = (
                        datetime.now() - self.start_time
                    ).total_seconds() - self.total_paused_duration

            return success

        except Exception as e:
            logger.error(f"Error adding audio chunk: {e}")
            return False

    async def _audio_writer_loop(self):
        """Main loop for writing audio data to file"""
        try:
            while self.state in [RecordingState.RECORDING, RecordingState.PAUSED]:
                await asyncio.sleep(0.1)  # Process chunks every 100ms

                if self.state == RecordingState.PAUSED:
                    continue

                # Get chunks from buffer
                chunks = self.buffer.get_chunks(
                    count=10
                )  # Process up to 10 chunks at a time

                if not chunks:
                    continue

                # Write chunks to file
                for chunk in chunks:
                    await self._write_chunk_to_file(chunk)

                    # Check if we need to split the file
                    if await self._should_split_file():
                        await self._split_file()

        except asyncio.CancelledError:
            logger.info(f"Audio writer loop cancelled for {self.source_id}")
        except Exception as e:
            logger.error(f"Error in audio writer loop: {e}")
            self.state = RecordingState.ERROR

    async def _write_chunk_to_file(self, chunk: AudioChunk):
        """Write a single audio chunk to the current file"""
        try:
            if not self.current_file_handle:
                await self._initialize_output_file()

            if self.current_file_handle:
                # Convert chunk data if needed
                audio_data = self._convert_audio_data(chunk)

                # Write to file
                self.current_file_handle.writeframes(audio_data)

                # Update session file size
                if self.session:
                    self.session.file_size_bytes += len(audio_data)

                # Silence detection
                if self.silence_detector and self.config.split_on_silence:
                    is_silent = self.silence_detector.process_chunk(chunk)
                    if is_silent and self.silence_detector.should_split():
                        await self._split_file()
                        self.silence_detector.reset()

        except Exception as e:
            logger.error(f"Error writing chunk to file: {e}")

    def _convert_audio_data(self, chunk: AudioChunk) -> bytes:
        """Convert audio data to the target format"""
        # For now, assume data is already in the correct format
        # In a full implementation, you'd handle sample rate conversion,
        # channel conversion, and bit depth conversion here
        return chunk.data

    async def _initialize_output_file(self):
        """Initialize the output file for recording"""
        try:
            if not self.session:
                return

            output_path = os.path.join(
                self.config.output_directory, self.session.output_file
            )

            if self.config.format == RecordingFormat.WAV:
                self.current_file_handle = wave.open(output_path, "wb")
                self.current_file_handle.setnchannels(self.config.channels)
                self.current_file_handle.setsampwidth(2)  # 16-bit
                self.current_file_handle.setframerate(self.config.sample_rate)
            else:
                # For non-WAV formats, we'll use FFmpeg for conversion
                # Create a temporary WAV file first
                temp_file = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
                temp_file.close()
                self.temp_files.append(temp_file.name)

                self.current_file_handle = wave.open(temp_file.name, "wb")
                self.current_file_handle.setnchannels(self.config.channels)
                self.current_file_handle.setsampwidth(2)  # 16-bit
                self.current_file_handle.setframerate(self.config.sample_rate)

            self.stats["files_created"] += 1
            logger.debug(f"Initialized output file: {output_path}")

        except Exception as e:
            logger.error(f"Error initializing output file: {e}")
            raise

    async def _finalize_current_file(self):
        """Finalize the current recording file"""
        try:
            if self.current_file_handle:
                self.current_file_handle.close()
                self.current_file_handle = None

            # Convert to target format if needed
            if self.config.format != RecordingFormat.WAV and self.temp_files:
                await self._convert_to_target_format()

        except Exception as e:
            logger.error(f"Error finalizing file: {e}")

    async def _convert_to_target_format(self):
        """Convert temporary WAV file to target format using FFmpeg"""
        try:
            if not self.session or not self.temp_files:
                return

            temp_file = self.temp_files[-1]
            output_path = os.path.join(
                self.config.output_directory, self.session.output_file
            )

            # Build FFmpeg command
            cmd = ["ffmpeg", "-y", "-i", temp_file]

            # Add quality settings
            if self.config.format == RecordingFormat.MP3:
                bitrate = self._get_bitrate_for_quality()
                cmd.extend(["-codec:a", "libmp3lame", "-b:a", f"{bitrate}k"])
            elif self.config.format == RecordingFormat.AAC:
                bitrate = self._get_bitrate_for_quality()
                cmd.extend(["-codec:a", "aac", "-b:a", f"{bitrate}k"])
            elif self.config.format == RecordingFormat.FLAC:
                cmd.extend(["-codec:a", "flac"])
            elif self.config.format == RecordingFormat.OGG:
                bitrate = self._get_bitrate_for_quality()
                cmd.extend(["-codec:a", "libvorbis", "-b:a", f"{bitrate}k"])

            cmd.append(output_path)

            # Execute conversion
            process = await asyncio.create_subprocess_exec(
                *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
            )

            stdout, stderr = await process.communicate()

            if process.returncode == 0:
                logger.info(
                    f"Converted recording to {self.config.format.value}: {output_path}"
                )

                # Delete temporary file if configured
                if self.config.delete_source_after_compress:
                    os.unlink(temp_file)
                    self.temp_files.remove(temp_file)
            else:
                logger.error(f"FFmpeg conversion failed: {stderr.decode()}")

        except Exception as e:
            logger.error(f"Error converting to target format: {e}")

    def _get_bitrate_for_quality(self) -> int:
        """Get bitrate based on quality setting"""
        bitrates = {
            RecordingQuality.LOW: 64,
            RecordingQuality.MEDIUM: 128,
            RecordingQuality.HIGH: 256,
            RecordingQuality.LOSSLESS: 320,
        }
        return bitrates.get(self.config.quality, 128)

    async def _should_split_file(self) -> bool:
        """Check if the current file should be split"""
        if not self.session:
            return False

        # Check file size
        if self.session.file_size_bytes > (self.config.max_file_size_mb * 1024 * 1024):
            return True

        # Check duration
        if self.session.duration_seconds > (self.config.max_duration_minutes * 60):
            return True

        return False

    async def _split_file(self):
        """Split the current recording into a new file"""
        try:
            logger.info(f"Splitting recording file for source {self.source_id}")

            # Finalize current file
            await self._finalize_current_file()

            # Create new session with new filename
            if self.session:
                new_filename = self._generate_filename()
                self.session.output_file = new_filename
                self.session.file_size_bytes = 0
                self.session_id = str(uuid.uuid4())
                self.session.session_id = self.session_id

            # Initialize new file
            await self._initialize_output_file()

        except Exception as e:
            logger.error(f"Error splitting file: {e}")

    def _generate_filename(self) -> str:
        """Generate a filename for the recording"""
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = self.config.filename_template.format(
            source_id=self.source_id,
            timestamp=timestamp,
            session_id=self.session_id[:8],
        )

        # Add file extension
        extension = self.config.format.value
        return f"{filename}.{extension}"

    async def _generate_metadata(self):
        """Generate metadata for the recording"""
        try:
            if not self.session:
                return

            metadata = {
                "recording_info": {
                    "session_id": self.session.session_id,
                    "source_id": self.session.source_id,
                    "start_time": self.session.start_time.isoformat(),
                    "end_time": (
                        self.session.end_time.isoformat()
                        if self.session.end_time
                        else None
                    ),
                    "duration_seconds": self.session.duration_seconds,
                    "total_chunks": self.session.total_chunks,
                    "file_size_bytes": self.session.file_size_bytes,
                },
                "audio_info": {
                    "sample_rate": self.session.sample_rate,
                    "channels": self.session.channels,
                    "format": self.config.format.value,
                    "quality": self.config.quality.value,
                },
                "statistics": self.stats.copy(),
            }

            # Save metadata to JSON file
            metadata_file = os.path.join(
                self.config.output_directory,
                f"{os.path.splitext(self.session.output_file)[0]}.json",
            )

            with open(metadata_file, "w") as f:
                json.dump(metadata, f, indent=2, default=str)

            self.session.metadata = metadata
            logger.debug(f"Generated metadata file: {metadata_file}")

        except Exception as e:
            logger.error(f"Error generating metadata: {e}")

    async def _post_process_recording(self):
        """Post-process the recording (compression, normalization, etc.)"""
        try:
            if not self.session:
                return

            logger.info(f"Post-processing recording: {self.session.output_file}")

            # Example: Normalize audio levels
            input_file = os.path.join(
                self.config.output_directory, self.session.output_file
            )
            temp_output = f"{input_file}.temp"

            # FFmpeg command for audio normalization
            cmd = [
                "ffmpeg",
                "-y",
                "-i",
                input_file,
                "-filter:a",
                "loudnorm",
                temp_output,
            ]

            process = await asyncio.create_subprocess_exec(
                *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
            )

            stdout, stderr = await process.communicate()

            if process.returncode == 0:
                # Replace original with normalized version
                os.replace(temp_output, input_file)
                logger.info(f"Post-processing completed: {input_file}")
            else:
                logger.error(f"Post-processing failed: {stderr.decode()}")
                # Clean up temp file
                if os.path.exists(temp_output):
                    os.unlink(temp_output)

        except Exception as e:
            logger.error(f"Error in post-processing: {e}")

    def get_session_info(self) -> Optional[RecordingSession]:
        """Get current recording session information"""
        return self.session

    def get_statistics(self) -> Dict[str, Any]:
        """Get recording statistics"""
        stats = self.stats.copy()
        stats["state"] = self.state.value
        stats["session_id"] = self.session_id
        stats["source_id"] = self.source_id

        if self.session:
            stats["session_info"] = asdict(self.session)

        if self.stats["total_chunks_received"] > 0:
            stats["average_chunk_size"] = (
                self.stats["total_bytes_recorded"] / self.stats["total_chunks_received"]
            )

        return stats

    def cleanup(self):
        """Clean up temporary files and resources"""
        try:
            # Close file handles
            if self.current_file_handle:
                self.current_file_handle.close()
                self.current_file_handle = None

            # Clean up temporary files
            for temp_file in self.temp_files:
                try:
                    if os.path.exists(temp_file):
                        os.unlink(temp_file)
                except Exception as e:
                    logger.error(f"Error deleting temp file {temp_file}: {e}")

            self.temp_files.clear()

        except Exception as e:
            logger.error(f"Error during cleanup: {e}")


class SilenceDetector:
    """Detects silence in audio for automatic splitting"""

    def __init__(self, threshold_db: float = -40.0, duration_seconds: float = 5.0):
        self.threshold_db = threshold_db
        self.duration_seconds = duration_seconds
        self.silence_start_time: Optional[float] = None
        self.is_in_silence = False

    def process_chunk(self, chunk: AudioChunk) -> bool:
        """Process an audio chunk and detect silence"""
        try:
            # Simple RMS calculation for volume detection
            # In a real implementation, you'd properly parse the audio samples
            rms = self._calculate_rms(chunk.data)
            db_level = 20 * math.log10(max(rms, 1e-10))  # Avoid log(0)

            current_time = time.time()

            if db_level < self.threshold_db:
                # Audio is below threshold (silent)
                if not self.is_in_silence:
                    self.is_in_silence = True
                    self.silence_start_time = current_time

                return True
            else:
                # Audio is above threshold (not silent)
                if self.is_in_silence:
                    self.is_in_silence = False
                    self.silence_start_time = None

                return False

        except Exception as e:
            logger.error(f"Error in silence detection: {e}")
            return False

    def should_split(self) -> bool:
        """Check if silence has lasted long enough to trigger a split"""
        if not self.is_in_silence or not self.silence_start_time:
            return False

        silence_duration = time.time() - self.silence_start_time
        return silence_duration >= self.duration_seconds

    def reset(self):
        """Reset the silence detector"""
        self.is_in_silence = False
        self.silence_start_time = None

    def _calculate_rms(self, audio_data: bytes) -> float:
        """Calculate RMS value of audio data"""
        try:
            # Simple approximation - in reality you'd parse the audio properly
            if len(audio_data) == 0:
                return 0.0

            # Assume 16-bit samples
            import struct

            samples = struct.unpack(f"{len(audio_data)//2}h", audio_data)

            # Calculate RMS
            sum_squares = sum(sample * sample for sample in samples)
            rms = (sum_squares / len(samples)) ** 0.5

            # Normalize to 0-1 range
            return rms / 32768.0

        except Exception:
            return 0.0


# Import math for silence detector
import math


class RecordingManager:
    """Manages multiple stream recorders"""

    def __init__(self):
        self.recorders: Dict[str, StreamRecorder] = {}
        self.default_config = RecordingConfig()

    async def create_recorder(
        self, source_id: str, config: RecordingConfig = None
    ) -> StreamRecorder:
        """Create a new recorder for a source"""
        if source_id in self.recorders:
            logger.warning(f"Recorder for {source_id} already exists")
            return self.recorders[source_id]

        recorder = StreamRecorder(source_id, config or self.default_config)
        self.recorders[source_id] = recorder

        logger.info(f"Created recorder for source {source_id}")
        return recorder

    async def remove_recorder(self, source_id: str) -> bool:
        """Remove a recorder"""
        if source_id not in self.recorders:
            return False

        recorder = self.recorders[source_id]

        # Stop recording if active
        if recorder.state == RecordingState.RECORDING:
            await recorder.stop_recording()

        # Cleanup
        recorder.cleanup()
        del self.recorders[source_id]

        logger.info(f"Removed recorder for source {source_id}")
        return True

    def get_recorder(self, source_id: str) -> Optional[StreamRecorder]:
        """Get a recorder by source ID"""
        return self.recorders.get(source_id)

    def get_all_recorders(self) -> Dict[str, StreamRecorder]:
        """Get all recorders"""
        return self.recorders.copy()

    async def stop_all_recordings(self):
        """Stop all active recordings"""
        for recorder in self.recorders.values():
            if recorder.state == RecordingState.RECORDING:
                await recorder.stop_recording()

    def get_manager_statistics(self) -> Dict[str, Any]:
        """Get statistics for all recorders"""
        stats = {
            "total_recorders": len(self.recorders),
            "active_recordings": 0,
            "total_files_created": 0,
            "total_bytes_recorded": 0,
            "recorders": {},
        }

        for source_id, recorder in self.recorders.items():
            recorder_stats = recorder.get_statistics()
            stats["recorders"][source_id] = recorder_stats

            if recorder.state == RecordingState.RECORDING:
                stats["active_recordings"] += 1

            stats["total_files_created"] += recorder_stats.get("files_created", 0)
            stats["total_bytes_recorded"] += recorder_stats.get(
                "total_bytes_recorded", 0
            )

        return stats


# Global recording manager instance
recording_manager = RecordingManager()


async def get_recording_manager() -> RecordingManager:
    """Get the global recording manager"""
    return recording_manager


async def create_recorder(
    source_id: str, config: RecordingConfig = None
) -> StreamRecorder:
    """Create a new recorder"""
    manager = await get_recording_manager()
    return await manager.create_recorder(source_id, config)


async def get_recorder(source_id: str) -> Optional[StreamRecorder]:
    """Get an existing recorder"""
    manager = await get_recording_manager()
    return manager.get_recorder(source_id)
