"""
Enhanced Audio Pipeline Processor
Integrates the unified audio pipeline with existing audio processing and transcription services
"""

import asyncio
import json
import logging
import uuid
import time
import base64
from typing import Dict, List, Optional, Any, Callable
from datetime import datetime, timedelta
from dataclasses import dataclass, asdict
from enum import Enum

from audio_processor import audio_processor, AudioSession
from transcription_service import (
    transcription_service,
    TranscriptionConfig,
    WhisperModelSize,
)
from transcription_queue import queue_manager, QueuePriority

logger = logging.getLogger(__name__)


class AudioSourceType(Enum):
    MICROPHONE = "microphone"
    SYSTEM = "system"
    NETWORK_RTMP = "network_rtmp"
    NETWORK_SRT = "network_srt"


class ProcessingMode(Enum):
    REAL_TIME = "real_time"
    BATCH = "batch"
    HYBRID = "hybrid"


@dataclass
class PipelineAudioChunk:
    """Enhanced audio chunk for pipeline processing"""

    id: str
    source_id: str
    source_type: AudioSourceType
    timestamp: float
    duration_ms: float
    sample_rate: int
    channels: int
    data: bytes
    rms_level: float
    has_voice: bool
    features: Dict[str, Any]
    metadata: Dict[str, Any]
    processing_latency: float = 0.0


@dataclass
class AudioSourceSession:
    """Session tracking for each audio source"""

    source_id: str
    client_id: str
    source_type: AudioSourceType
    created_at: datetime
    last_activity: datetime
    chunks_processed: int
    total_duration_ms: float
    transcription_session_id: Optional[str] = None
    is_active: bool = True
    config: Dict[str, Any] = None


class AudioPipelineProcessor:
    """
    Enhanced audio processor for the unified audio pipeline
    Handles multiple simultaneous audio sources with intelligent processing
    """

    def __init__(self):
        self.active_sources: Dict[str, AudioSourceSession] = {}
        self.processing_queue = asyncio.Queue()
        self.transcription_buffers: Dict[str, List[PipelineAudioChunk]] = {}

        # Processing configuration
        self.config = {
            "transcription_chunk_duration": 5000,  # ms - send to transcription every 5 seconds
            "voice_activity_threshold": 0.02,
            "batch_processing_interval": 1.0,  # seconds
            "max_buffer_size": 50,  # chunks per source
            "enable_real_time_transcription": True,
            "enable_source_separation": True,
            "primary_source_priority": True,
        }

        # Statistics
        self.stats = {
            "total_chunks_processed": 0,
            "total_transcription_requests": 0,
            "processing_errors": 0,
            "active_sources": 0,
            "average_processing_latency": 0.0,
        }

        # Processing workers
        self.processing_task: Optional[asyncio.Task] = None
        self.transcription_task: Optional[asyncio.Task] = None
        self.cleanup_task: Optional[asyncio.Task] = None
        self.is_running = False

        # Event callbacks
        self.transcription_callbacks: List[Callable] = []
        self.metrics_callbacks: List[Callable] = []

    async def start(self):
        """Start the audio pipeline processor"""
        if self.is_running:
            return

        self.is_running = True

        # Start processing workers
        self.processing_task = asyncio.create_task(self._processing_worker())
        self.transcription_task = asyncio.create_task(self._transcription_worker())
        self.cleanup_task = asyncio.create_task(self._cleanup_worker())

        logger.info("AudioPipelineProcessor started")

    async def stop(self):
        """Stop the audio pipeline processor"""
        if not self.is_running:
            return

        self.is_running = False

        # Cancel tasks
        for task in [self.processing_task, self.transcription_task, self.cleanup_task]:
            if task and not task.done():
                task.cancel()
                try:
                    await task
                except asyncio.CancelledError:
                    pass

        # Cleanup active sources
        for source_id in list(self.active_sources.keys()):
            await self.remove_source(source_id)

        logger.info("AudioPipelineProcessor stopped")

    async def add_source(
        self,
        source_id: str,
        client_id: str,
        source_type: AudioSourceType,
        config: Dict[str, Any] = None,
    ) -> bool:
        """Add a new audio source to the pipeline"""
        try:
            if source_id in self.active_sources:
                logger.warning(f"Source {source_id} already exists")
                return False

            # Create source session
            session = AudioSourceSession(
                source_id=source_id,
                client_id=client_id,
                source_type=source_type,
                created_at=datetime.now(),
                last_activity=datetime.now(),
                chunks_processed=0,
                total_duration_ms=0.0,
                config=config or {},
            )

            # Create transcription session if enabled
            if self.config["enable_real_time_transcription"]:
                try:
                    # Create audio session for transcription
                    audio_config = {
                        "sampleRate": config.get("sample_rate", 44100),
                        "channels": config.get("channels", 1),
                        "format": "webm",
                        "enableVAD": True,
                    }

                    transcription_session_id = await audio_processor.create_session(
                        client_id=f"{client_id}_{source_id}", audio_config=audio_config
                    )

                    session.transcription_session_id = transcription_session_id
                    logger.info(
                        f"Created transcription session {transcription_session_id} for source {source_id}"
                    )

                except Exception as e:
                    logger.error(
                        f"Failed to create transcription session for {source_id}: {e}"
                    )

            self.active_sources[source_id] = session
            self.transcription_buffers[source_id] = []

            self.stats["active_sources"] = len(self.active_sources)

            logger.info(
                f"Added audio source {source_id} ({source_type.value}) for client {client_id}"
            )
            return True

        except Exception as e:
            logger.error(f"Failed to add source {source_id}: {e}")
            return False

    async def remove_source(self, source_id: str) -> bool:
        """Remove an audio source from the pipeline"""
        try:
            session = self.active_sources.get(source_id)
            if not session:
                return False

            # Close transcription session
            if session.transcription_session_id:
                try:
                    await audio_processor.close_session(
                        session.transcription_session_id
                    )
                except Exception as e:
                    logger.error(f"Failed to close transcription session: {e}")

            # Clean up buffers
            if source_id in self.transcription_buffers:
                del self.transcription_buffers[source_id]

            # Remove session
            del self.active_sources[source_id]

            self.stats["active_sources"] = len(self.active_sources)

            logger.info(f"Removed audio source {source_id}")
            return True

        except Exception as e:
            logger.error(f"Failed to remove source {source_id}: {e}")
            return False

    async def process_audio_chunk(self, chunk_data: Dict[str, Any]) -> Dict[str, Any]:
        """Process an audio chunk from the pipeline"""
        try:
            start_time = time.time()

            # Extract chunk information
            source_id = chunk_data.get("sourceId")
            if not source_id or source_id not in self.active_sources:
                return {"error": f"Unknown source: {source_id}"}

            session = self.active_sources[source_id]

            # Create pipeline audio chunk
            chunk = PipelineAudioChunk(
                id=str(uuid.uuid4()),
                source_id=source_id,
                source_type=session.source_type,
                timestamp=chunk_data.get("timestamp", time.time()),
                duration_ms=chunk_data.get("duration", 0),
                sample_rate=chunk_data.get("sampleRate", 44100),
                channels=chunk_data.get("channels", 1),
                data=chunk_data.get("data", b""),
                rms_level=chunk_data.get("rms", 0.0),
                has_voice=chunk_data.get("hasVoice", False),
                features=chunk_data.get("features", {}),
                metadata=chunk_data.get("metadata", {}),
            )

            # Update session
            session.last_activity = datetime.now()
            session.chunks_processed += 1
            session.total_duration_ms += chunk.duration_ms

            # Add to processing queue
            await self.processing_queue.put(chunk)

            # Update statistics
            processing_time = time.time() - start_time
            chunk.processing_latency = processing_time * 1000  # ms

            self.stats["total_chunks_processed"] += 1
            self.stats["average_processing_latency"] = (
                self.stats["average_processing_latency"] * 0.9 + processing_time * 0.1
            )

            return {
                "status": "processed",
                "chunk_id": chunk.id,
                "source_id": source_id,
                "processing_latency_ms": chunk.processing_latency,
            }

        except Exception as e:
            self.stats["processing_errors"] += 1
            logger.error(f"Error processing audio chunk: {e}")
            return {"error": str(e)}

    async def _processing_worker(self):
        """Main processing worker for audio chunks"""
        while self.is_running:
            try:
                # Get chunk from queue with timeout
                chunk = await asyncio.wait_for(self.processing_queue.get(), timeout=1.0)

                await self._process_chunk(chunk)

            except asyncio.TimeoutError:
                continue
            except Exception as e:
                logger.error(f"Error in processing worker: {e}")
                await asyncio.sleep(0.1)

    async def _process_chunk(self, chunk: PipelineAudioChunk):
        """Process individual audio chunk"""
        try:
            source_id = chunk.source_id

            # Add to transcription buffer if voice activity detected
            if (
                chunk.has_voice
                and chunk.rms_level > self.config["voice_activity_threshold"]
            ):
                if source_id not in self.transcription_buffers:
                    self.transcription_buffers[source_id] = []

                self.transcription_buffers[source_id].append(chunk)

                # Limit buffer size
                max_buffer = self.config["max_buffer_size"]
                if len(self.transcription_buffers[source_id]) > max_buffer:
                    self.transcription_buffers[source_id] = self.transcription_buffers[
                        source_id
                    ][-max_buffer:]

            # Trigger metrics callbacks
            await self._trigger_metrics_callbacks(chunk)

        except Exception as e:
            logger.error(f"Error processing chunk {chunk.id}: {e}")

    async def _transcription_worker(self):
        """Worker for handling transcription requests"""
        while self.is_running:
            try:
                await asyncio.sleep(self.config["batch_processing_interval"])

                # Process transcription buffers
                for source_id, buffer in self.transcription_buffers.items():
                    if not buffer:
                        continue

                    # Check if we have enough audio for transcription
                    total_duration = sum(chunk.duration_ms for chunk in buffer)

                    if total_duration >= self.config["transcription_chunk_duration"]:
                        await self._send_for_transcription(source_id, buffer.copy())
                        # Clear processed chunks
                        self.transcription_buffers[source_id] = []

            except Exception as e:
                logger.error(f"Error in transcription worker: {e}")
                await asyncio.sleep(1.0)

    async def _send_for_transcription(
        self, source_id: str, chunks: List[PipelineAudioChunk]
    ):
        """Send audio chunks for transcription"""
        try:
            session = self.active_sources.get(source_id)
            if not session or not session.transcription_session_id:
                return

            # Combine chunks into a single audio buffer
            combined_audio = b"".join(chunk.data for chunk in chunks if chunk.data)

            if not combined_audio:
                return

            # Prepare transcription data
            chunk_metadata = {
                "chunkId": str(uuid.uuid4()),
                "timestamp": chunks[0].timestamp,
                "duration": sum(chunk.duration_ms for chunk in chunks),
                "sampleRate": chunks[0].sample_rate,
                "channels": chunks[0].channels,
                "hasVoice": any(chunk.has_voice for chunk in chunks),
                "source_id": source_id,
                "source_type": session.source_type.value,
            }

            chunk_data = {
                "chunkId": chunk_metadata["chunkId"],
                "data": base64.b64encode(combined_audio).decode("utf-8"),
            }

            # Send to audio processor
            try:
                await audio_processor.process_chunk_metadata(
                    session.transcription_session_id, chunk_metadata
                )

                result = await audio_processor.process_chunk_data(
                    session.transcription_session_id, chunk_data
                )

                self.stats["total_transcription_requests"] += 1

                # Trigger transcription callbacks
                await self._trigger_transcription_callbacks(
                    source_id, chunk_metadata, result
                )

            except Exception as e:
                logger.error(f"Failed to send chunk for transcription: {e}")

        except Exception as e:
            logger.error(f"Error in transcription processing: {e}")

    async def _cleanup_worker(self):
        """Worker for cleaning up inactive sources"""
        while self.is_running:
            try:
                await asyncio.sleep(30)  # Run cleanup every 30 seconds

                current_time = datetime.now()
                inactive_sources = []

                for source_id, session in self.active_sources.items():
                    # Check for inactive sources (no activity for 5 minutes)
                    if current_time - session.last_activity > timedelta(minutes=5):
                        inactive_sources.append(source_id)

                # Remove inactive sources
                for source_id in inactive_sources:
                    logger.info(f"Removing inactive source: {source_id}")
                    await self.remove_source(source_id)

            except Exception as e:
                logger.error(f"Error in cleanup worker: {e}")

    async def _trigger_metrics_callbacks(self, chunk: PipelineAudioChunk):
        """Trigger metrics callbacks for monitoring"""
        try:
            metrics_data = {
                "source_id": chunk.source_id,
                "timestamp": chunk.timestamp,
                "rms_level": chunk.rms_level,
                "has_voice": chunk.has_voice,
                "processing_latency": chunk.processing_latency,
                "features": chunk.features,
            }

            for callback in self.metrics_callbacks:
                try:
                    await callback(metrics_data)
                except Exception as e:
                    logger.error(f"Error in metrics callback: {e}")

        except Exception as e:
            logger.error(f"Error triggering metrics callbacks: {e}")

    async def _trigger_transcription_callbacks(
        self, source_id: str, metadata: Dict, result: Dict
    ):
        """Trigger transcription callbacks"""
        try:
            transcription_data = {
                "source_id": source_id,
                "metadata": metadata,
                "result": result,
                "timestamp": datetime.now().isoformat(),
            }

            for callback in self.transcription_callbacks:
                try:
                    await callback(transcription_data)
                except Exception as e:
                    logger.error(f"Error in transcription callback: {e}")

        except Exception as e:
            logger.error(f"Error triggering transcription callbacks: {e}")

    def add_transcription_callback(self, callback: Callable):
        """Add callback for transcription results"""
        self.transcription_callbacks.append(callback)

    def add_metrics_callback(self, callback: Callable):
        """Add callback for metrics updates"""
        self.metrics_callbacks.append(callback)

    def get_stats(self) -> Dict[str, Any]:
        """Get processing statistics"""
        return {
            **self.stats,
            "active_sources": {
                source_id: {
                    "client_id": session.client_id,
                    "source_type": session.source_type.value,
                    "chunks_processed": session.chunks_processed,
                    "total_duration_ms": session.total_duration_ms,
                    "created_at": session.created_at.isoformat(),
                    "last_activity": session.last_activity.isoformat(),
                    "is_active": session.is_active,
                }
                for source_id, session in self.active_sources.items()
            },
        }

    def get_source_info(self, source_id: str) -> Optional[Dict[str, Any]]:
        """Get information about a specific source"""
        session = self.active_sources.get(source_id)
        if not session:
            return None

        return {
            "source_id": source_id,
            "client_id": session.client_id,
            "source_type": session.source_type.value,
            "chunks_processed": session.chunks_processed,
            "total_duration_ms": session.total_duration_ms,
            "created_at": session.created_at.isoformat(),
            "last_activity": session.last_activity.isoformat(),
            "transcription_session_id": session.transcription_session_id,
            "buffer_size": len(self.transcription_buffers.get(source_id, [])),
            "is_active": session.is_active,
            "config": session.config,
        }

    def update_config(self, config: Dict[str, Any]):
        """Update processing configuration"""
        self.config.update(config)
        logger.info(f"Updated pipeline processor config: {config}")


# Global instance
pipeline_processor = AudioPipelineProcessor()
