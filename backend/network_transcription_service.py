"""
Network Stream-Aware Transcription Service
Enhanced transcription with support for network audio streams, variable bitrates, and quality adaptation
"""

import asyncio
import logging
import numpy as np
import torch
import threading
import queue
import time
import io
import tempfile
import os
from typing import Dict, List, Optional, Tuple, Any, AsyncGenerator, Union
from dataclasses import dataclass, asdict
from datetime import datetime, timedelta
from concurrent.futures import ThreadPoolExecutor
import collections

try:
    from faster_whisper import WhisperModel, BatchedInferencePipeline

    FASTER_WHISPER_AVAILABLE = True
except ImportError:
    FASTER_WHISPER_AVAILABLE = False
    logging.error("faster-whisper not available")

try:
    import librosa
    import soundfile as sf

    AUDIO_PROCESSING_AVAILABLE = True
except ImportError:
    AUDIO_PROCESSING_AVAILABLE = False
    logging.error("Audio processing libraries not available")

from stream_vad import (
    StreamVAD,
    StreamVADConfig,
    VADResult,
    AudioQualityMetrics,
    get_stream_vad,
    calculate_audio_quality_metrics,
)

logger = logging.getLogger(__name__)


@dataclass
class TranscriptionSegment:
    """Transcription segment with network stream metadata"""

    id: str
    text: str
    start_time: float
    end_time: float
    confidence: float
    language: str
    stream_id: str
    audio_quality: float
    vad_confidence: float
    model_used: str
    processing_latency_ms: float
    timestamp: datetime

    # Network-specific metadata
    packet_loss: float = 0.0
    jitter_ms: float = 0.0
    bitrate_kbps: float = 0.0
    resync_count: int = 0


@dataclass
class StreamTranscriptionConfig:
    """Configuration for stream transcription"""

    # Model settings
    model_size: str = "base"  # tiny, base, small, medium, large-v2, large-v3
    model_path: Optional[str] = None  # Custom model path
    device: str = "auto"  # auto, cpu, cuda
    compute_type: str = "auto"  # auto, int8, int16, float16, float32

    # Transcription settings
    language: Optional[str] = None  # Auto-detect if None
    task: str = "transcribe"  # transcribe, translate
    beam_size: int = 5
    temperature: float = 0.0

    # Network stream settings
    chunk_duration_s: float = 30.0  # Transcription chunk duration
    overlap_duration_s: float = 5.0  # Overlap between chunks
    max_buffer_duration_s: float = 120.0  # Maximum buffer duration
    min_audio_duration_s: float = 1.0  # Minimum audio for transcription

    # Quality adaptation
    adaptive_model_selection: bool = True
    quality_threshold_high: float = 0.8  # Use large model
    quality_threshold_medium: float = 0.5  # Use medium model
    quality_threshold_low: float = 0.2  # Use small model

    # Latency optimization
    latency_mode: str = "balanced"  # "low_latency", "balanced", "high_accuracy"
    max_processing_latency_ms: float = 5000.0  # Maximum allowed processing latency

    # Multi-stream settings
    max_concurrent_streams: int = 4
    stream_priority_enabled: bool = True


@dataclass
class NetworkAudioChunk:
    """Network audio chunk with metadata"""

    stream_id: str
    audio_data: np.ndarray
    timestamp: float
    sample_rate: int
    quality_metrics: AudioQualityMetrics
    sequence_number: int = 0
    is_final: bool = False


class StreamTranscriptionBuffer:
    """Buffer for managing network audio streams for transcription"""

    def __init__(self, stream_id: str, config: StreamTranscriptionConfig):
        self.stream_id = stream_id
        self.config = config
        self.sample_rate = 16000  # Whisper expects 16kHz

        # Audio buffer
        self.audio_buffer = collections.deque()
        self.timestamp_buffer = collections.deque()
        self.quality_buffer = collections.deque()

        # Synchronization
        self.last_sequence = -1
        self.resync_count = 0
        self.last_transcription_time = 0

        # Quality tracking
        self.quality_history = collections.deque(maxlen=100)
        self.packet_loss_history = collections.deque(maxlen=50)

        self._lock = threading.Lock()

    def add_audio_chunk(self, chunk: NetworkAudioChunk) -> bool:
        """Add audio chunk to buffer with gap detection"""
        with self._lock:
            # Check for sequence gaps
            if (
                self.last_sequence >= 0
                and chunk.sequence_number > self.last_sequence + 1
            ):
                gap_size = chunk.sequence_number - self.last_sequence - 1
                logger.warning(f"Stream {self.stream_id}: {gap_size} packets lost")
                self.resync_count += 1

                # Estimate gap duration and fill with silence if small
                gap_duration = gap_size * 0.02  # Assume 20ms packets
                if gap_duration < 0.5:  # Fill gaps < 500ms
                    silence_samples = int(gap_duration * self.sample_rate)
                    silence = np.zeros(silence_samples)
                    self.audio_buffer.extend(silence)
                    # Extend timestamps for silence
                    for i in range(silence_samples):
                        self.timestamp_buffer.append(
                            chunk.timestamp - gap_duration + (i / self.sample_rate)
                        )

            # Add audio data
            if chunk.sample_rate != self.sample_rate:
                # Resample to 16kHz
                resampled_audio = librosa.resample(
                    chunk.audio_data,
                    orig_sr=chunk.sample_rate,
                    target_sr=self.sample_rate,
                )
            else:
                resampled_audio = chunk.audio_data

            self.audio_buffer.extend(resampled_audio)

            # Add timestamps
            for i, sample in enumerate(resampled_audio):
                sample_timestamp = chunk.timestamp + (i / self.sample_rate)
                self.timestamp_buffer.append(sample_timestamp)

            # Track quality
            self.quality_history.append(chunk.quality_metrics.overall_quality)
            self.packet_loss_history.append(chunk.quality_metrics.packet_loss_percent)

            self.last_sequence = chunk.sequence_number

            # Limit buffer size
            max_samples = int(self.config.max_buffer_duration_s * self.sample_rate)
            while len(self.audio_buffer) > max_samples:
                self.audio_buffer.popleft()
                self.timestamp_buffer.popleft()

            return True

    def get_transcription_chunk(
        self,
    ) -> Optional[Tuple[np.ndarray, float, float, AudioQualityMetrics]]:
        """Get audio chunk ready for transcription"""
        with self._lock:
            chunk_samples = int(self.config.chunk_duration_s * self.sample_rate)

            if len(self.audio_buffer) < chunk_samples:
                return None

            # Get audio chunk
            audio_chunk = np.array(list(self.audio_buffer)[:chunk_samples])
            start_timestamp = self.timestamp_buffer[0]
            end_timestamp = self.timestamp_buffer[chunk_samples - 1]

            # Calculate average quality for this chunk
            avg_quality = (
                sum(self.quality_history) / len(self.quality_history)
                if self.quality_history
                else 0.5
            )
            avg_packet_loss = (
                sum(self.packet_loss_history) / len(self.packet_loss_history)
                if self.packet_loss_history
                else 0.0
            )

            quality_metrics = AudioQualityMetrics(
                snr_db=20.0,  # Estimated
                thd_percent=1.0,  # Estimated
                packet_loss_percent=avg_packet_loss,
                jitter_ms=10.0,  # Estimated
                bitrate_kbps=128,  # Estimated
                sample_rate=self.sample_rate,
                overall_quality=avg_quality,
            )

            # Remove overlap amount from buffer
            overlap_samples = int(self.config.overlap_duration_s * self.sample_rate)
            remove_samples = chunk_samples - overlap_samples

            for _ in range(remove_samples):
                if self.audio_buffer:
                    self.audio_buffer.popleft()
                if self.timestamp_buffer:
                    self.timestamp_buffer.popleft()

            self.last_transcription_time = time.time()

            return audio_chunk, start_timestamp, end_timestamp, quality_metrics

    def get_statistics(self) -> Dict[str, Any]:
        """Get buffer statistics"""
        with self._lock:
            return {
                "stream_id": self.stream_id,
                "buffer_duration_s": (
                    len(self.audio_buffer) / self.sample_rate
                    if self.audio_buffer
                    else 0
                ),
                "buffer_fill_percent": (
                    len(self.audio_buffer)
                    / (self.config.max_buffer_duration_s * self.sample_rate)
                )
                * 100,
                "resync_count": self.resync_count,
                "average_quality": (
                    sum(self.quality_history) / len(self.quality_history)
                    if self.quality_history
                    else 0
                ),
                "average_packet_loss": (
                    sum(self.packet_loss_history) / len(self.packet_loss_history)
                    if self.packet_loss_history
                    else 0
                ),
                "last_transcription_age_s": (
                    time.time() - self.last_transcription_time
                    if self.last_transcription_time > 0
                    else 0
                ),
            }


class ModelManager:
    """Manages multiple Whisper models for quality-adaptive transcription"""

    def __init__(self, config: StreamTranscriptionConfig):
        self.config = config
        self.models: Dict[str, WhisperModel] = {}
        self.model_loading_lock = threading.Lock()

        # Model size mapping based on quality
        self.quality_model_map = {
            "high": "large-v3",
            "medium": "medium",
            "low": "small",
            "minimal": "tiny",
        }

        # Load default model
        self._load_model(config.model_size)

    def _load_model(self, model_size: str) -> WhisperModel:
        """Load Whisper model"""
        if model_size in self.models:
            return self.models[model_size]

        with self.model_loading_lock:
            if model_size in self.models:  # Double-check after acquiring lock
                return self.models[model_size]

            try:
                logger.info(f"Loading Whisper model: {model_size}")

                model = WhisperModel(
                    model_size_or_path=model_size,
                    device=self.config.device,
                    compute_type=self.config.compute_type,
                )

                self.models[model_size] = model
                logger.info(f"Successfully loaded Whisper model: {model_size}")
                return model

            except Exception as e:
                logger.error(f"Failed to load model {model_size}: {e}")
                # Fallback to smaller model
                if model_size != "tiny":
                    return self._load_model("tiny")
                raise

    def get_model_for_quality(
        self, quality: float, latency_mode: str = "balanced"
    ) -> Tuple[WhisperModel, str]:
        """Get appropriate model based on audio quality and latency requirements"""

        if not self.config.adaptive_model_selection:
            model_size = self.config.model_size
        else:
            # Select model based on quality and latency requirements
            if latency_mode == "low_latency":
                if quality >= self.config.quality_threshold_medium:
                    model_size = "base"
                else:
                    model_size = "tiny"
            elif latency_mode == "high_accuracy":
                if quality >= self.config.quality_threshold_high:
                    model_size = "large-v3"
                elif quality >= self.config.quality_threshold_medium:
                    model_size = "medium"
                else:
                    model_size = "base"
            else:  # balanced
                if quality >= self.config.quality_threshold_high:
                    model_size = "medium"
                elif quality >= self.config.quality_threshold_medium:
                    model_size = "base"
                else:
                    model_size = "small"

        model = self._load_model(model_size)
        return model, model_size


class NetworkTranscriptionService:
    """
    Network Stream-Aware Transcription Service

    Features:
    - Multiple Whisper model support with quality-based selection
    - Network stream buffering and synchronization
    - Variable bitrate audio handling
    - Stream-specific VAD integration
    - Multi-stream concurrent transcription
    - Latency optimization modes
    - Quality-aware processing
    """

    def __init__(self, config: StreamTranscriptionConfig = None):
        self.config = config or StreamTranscriptionConfig()

        if not FASTER_WHISPER_AVAILABLE:
            raise RuntimeError("faster-whisper not available")

        # Model management
        self.model_manager = ModelManager(self.config)

        # Stream management
        self.stream_buffers: Dict[str, StreamTranscriptionBuffer] = {}
        self.stream_configs: Dict[str, StreamTranscriptionConfig] = {}

        # VAD integration
        self.vad_service: Optional[StreamVAD] = None

        # Processing
        self.executor = ThreadPoolExecutor(
            max_workers=self.config.max_concurrent_streams
        )
        self.processing_tasks: Dict[str, asyncio.Task] = {}

        # Statistics
        self.transcription_stats = {
            "total_segments": 0,
            "total_processing_time": 0,
            "average_latency_ms": 0,
            "quality_distribution": {"high": 0, "medium": 0, "low": 0},
            "model_usage": {},
        }

        self.is_running = False
        self._shutdown_event = asyncio.Event()

    async def start(self):
        """Start transcription service"""
        if self.is_running:
            return

        self.is_running = True
        logger.info("Network Transcription Service started")

        # Initialize VAD service
        vad_config = StreamVADConfig(
            vad_method="hybrid", adaptive_quality=True, multi_stream_mode=True
        )
        self.vad_service = await get_stream_vad(vad_config)

    async def stop(self):
        """Stop transcription service"""
        if not self.is_running:
            return

        self.is_running = False
        self._shutdown_event.set()

        # Cancel all processing tasks
        for task in self.processing_tasks.values():
            task.cancel()

        await asyncio.gather(*self.processing_tasks.values(), return_exceptions=True)
        self.processing_tasks.clear()

        # Stop VAD service
        if self.vad_service:
            await self.vad_service.stop()

        # Shutdown executor
        self.executor.shutdown(wait=True)

        logger.info("Network Transcription Service stopped")

    def create_stream(
        self, stream_id: str, config: Optional[StreamTranscriptionConfig] = None
    ) -> bool:
        """Create new transcription stream"""
        if stream_id in self.stream_buffers:
            logger.warning(f"Stream {stream_id} already exists")
            return False

        stream_config = config or self.config
        self.stream_configs[stream_id] = stream_config
        self.stream_buffers[stream_id] = StreamTranscriptionBuffer(
            stream_id, stream_config
        )

        # Create VAD buffer for stream
        if self.vad_service:
            self.vad_service.create_stream_buffer(stream_id)

        # Start processing task
        if self.is_running:
            self.processing_tasks[stream_id] = asyncio.create_task(
                self._process_stream(stream_id)
            )

        logger.info(f"Created transcription stream: {stream_id}")
        return True

    def remove_stream(self, stream_id: str) -> bool:
        """Remove transcription stream"""
        if stream_id not in self.stream_buffers:
            return False

        # Cancel processing task
        if stream_id in self.processing_tasks:
            self.processing_tasks[stream_id].cancel()
            del self.processing_tasks[stream_id]

        # Remove buffers
        del self.stream_buffers[stream_id]
        del self.stream_configs[stream_id]

        # Remove VAD buffer
        if self.vad_service:
            self.vad_service.remove_stream_buffer(stream_id)

        logger.info(f"Removed transcription stream: {stream_id}")
        return True

    async def process_audio_chunk(self, chunk: NetworkAudioChunk) -> bool:
        """Process incoming audio chunk"""
        stream_id = chunk.stream_id

        if stream_id not in self.stream_buffers:
            logger.warning(f"Stream {stream_id} not found")
            return False

        # Add to buffer
        buffer = self.stream_buffers[stream_id]
        success = buffer.add_audio_chunk(chunk)

        # Process with VAD
        if self.vad_service and success:
            await self.vad_service.process_audio_chunk(
                stream_id, chunk.audio_data, chunk.timestamp, chunk.quality_metrics
            )

        return success

    async def _process_stream(self, stream_id: str):
        """Main processing loop for a stream"""
        logger.info(f"Started processing stream: {stream_id}")

        buffer = self.stream_buffers[stream_id]
        config = self.stream_configs[stream_id]

        while self.is_running:
            try:
                # Check if we have enough audio for transcription
                chunk_data = buffer.get_transcription_chunk()

                if chunk_data is None:
                    await asyncio.sleep(0.1)  # Wait for more audio
                    continue

                audio_chunk, start_time, end_time, quality_metrics = chunk_data

                # Skip if audio is too short
                if len(audio_chunk) < int(config.min_audio_duration_s * 16000):
                    continue

                # Perform transcription
                segment = await self._transcribe_chunk(
                    stream_id, audio_chunk, start_time, end_time, quality_metrics
                )

                if segment:
                    # Publish transcription result
                    await self._publish_transcription(segment)

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error processing stream {stream_id}: {e}")
                await asyncio.sleep(1)  # Prevent tight error loop

        logger.info(f"Stopped processing stream: {stream_id}")

    async def _transcribe_chunk(
        self,
        stream_id: str,
        audio: np.ndarray,
        start_time: float,
        end_time: float,
        quality_metrics: AudioQualityMetrics,
    ) -> Optional[TranscriptionSegment]:
        """Transcribe audio chunk"""

        config = self.stream_configs[stream_id]
        processing_start = time.time()

        try:
            # Get appropriate model based on quality
            model, model_size = self.model_manager.get_model_for_quality(
                quality_metrics.overall_quality, config.latency_mode
            )

            # Prepare audio for Whisper
            audio_float = audio.astype(np.float32)

            # Run transcription in thread pool
            loop = asyncio.get_event_loop()
            segments, info = await loop.run_in_executor(
                self.executor,
                self._run_whisper_transcription,
                model,
                audio_float,
                config,
            )

            processing_time = (time.time() - processing_start) * 1000

            # Check latency constraints
            if processing_time > config.max_processing_latency_ms:
                logger.warning(
                    f"Transcription latency exceeded: {processing_time:.1f}ms"
                )

            # Process results
            if segments:
                # Combine all segments into one result (for streaming)
                combined_text = " ".join(segment.text.strip() for segment in segments)

                if combined_text.strip():
                    # Get buffer statistics for metadata
                    buffer_stats = self.stream_buffers[stream_id].get_statistics()

                    segment = TranscriptionSegment(
                        id=f"{stream_id}_{int(start_time*1000)}",
                        text=combined_text,
                        start_time=start_time,
                        end_time=end_time,
                        confidence=(
                            segments[0].avg_logprob
                            if hasattr(segments[0], "avg_logprob")
                            else 0.8
                        ),
                        language=info.language if info else "en",
                        stream_id=stream_id,
                        audio_quality=quality_metrics.overall_quality,
                        vad_confidence=0.8,  # Would be provided by VAD
                        model_used=model_size,
                        processing_latency_ms=processing_time,
                        timestamp=datetime.now(),
                        packet_loss=quality_metrics.packet_loss_percent,
                        jitter_ms=quality_metrics.jitter_ms,
                        bitrate_kbps=quality_metrics.bitrate_kbps,
                        resync_count=buffer_stats.get("resync_count", 0),
                    )

                    # Update statistics
                    self._update_statistics(segment, model_size)

                    return segment

        except Exception as e:
            logger.error(f"Transcription failed for stream {stream_id}: {e}")

        return None

    def _run_whisper_transcription(
        self, model: WhisperModel, audio: np.ndarray, config: StreamTranscriptionConfig
    ) -> Tuple[List, Any]:
        """Run Whisper transcription in thread pool"""

        segments, info = model.transcribe(
            audio,
            language=config.language,
            task=config.task,
            beam_size=config.beam_size,
            temperature=config.temperature,
            vad_filter=True,  # Use Whisper's internal VAD
            vad_parameters=dict(min_silence_duration_ms=100),
        )

        return list(segments), info

    async def _publish_transcription(self, segment: TranscriptionSegment):
        """Publish transcription result"""
        # This would be connected to your application's event system
        logger.info(f"Transcription [{segment.stream_id}]: {segment.text}")

        # Could emit to WebSocket, save to database, etc.
        # await self.websocket_manager.broadcast_transcription(segment)
        # await self.database.save_transcription(segment)

    def _update_statistics(self, segment: TranscriptionSegment, model_size: str):
        """Update transcription statistics"""
        stats = self.transcription_stats

        stats["total_segments"] += 1
        stats["total_processing_time"] += segment.processing_latency_ms
        stats["average_latency_ms"] = (
            stats["total_processing_time"] / stats["total_segments"]
        )

        # Quality distribution
        if segment.audio_quality >= 0.7:
            stats["quality_distribution"]["high"] += 1
        elif segment.audio_quality >= 0.4:
            stats["quality_distribution"]["medium"] += 1
        else:
            stats["quality_distribution"]["low"] += 1

        # Model usage
        if model_size not in stats["model_usage"]:
            stats["model_usage"][model_size] = 0
        stats["model_usage"][model_size] += 1

    def get_stream_statistics(self, stream_id: str) -> Dict[str, Any]:
        """Get statistics for specific stream"""
        if stream_id not in self.stream_buffers:
            return {}

        buffer_stats = self.stream_buffers[stream_id].get_statistics()

        # Add VAD statistics if available
        if self.vad_service:
            vad_stats = self.vad_service.get_stream_statistics(stream_id)
            buffer_stats.update(vad_stats)

        return buffer_stats

    def get_global_statistics(self) -> Dict[str, Any]:
        """Get global transcription statistics"""
        return {
            **self.transcription_stats,
            "active_streams": len(self.stream_buffers),
            "loaded_models": list(self.model_manager.models.keys()),
            "is_running": self.is_running,
        }

    async def resync_stream(self, stream_id: str, reference_timestamp: float):
        """Resync stream with reference timestamp"""
        if self.vad_service:
            await self.vad_service.resync_stream(stream_id, reference_timestamp)


# Global transcription service
network_transcription_service = NetworkTranscriptionService()


async def get_network_transcription_service(
    config: Optional[StreamTranscriptionConfig] = None,
) -> NetworkTranscriptionService:
    """Get the global network transcription service"""
    global network_transcription_service

    if config and not network_transcription_service.is_running:
        network_transcription_service = NetworkTranscriptionService(config)

    if not network_transcription_service.is_running:
        await network_transcription_service.start()

    return network_transcription_service
