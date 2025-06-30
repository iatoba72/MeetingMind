# Transcription Queue Management System
# Handles audio processing queues, prioritization, and load balancing

import asyncio
import json
import logging
import time
import uuid
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any, Callable
from dataclasses import dataclass, asdict
from enum import Enum
import redis
from collections import defaultdict

from transcription_service import (
    transcription_service,
    TranscriptionConfig,
    TranscriptionResult,
    WhisperModelSize,
)

logger = logging.getLogger(__name__)


class QueuePriority(Enum):
    """Queue priority levels for audio processing"""

    LOW = 1
    NORMAL = 2
    HIGH = 3
    URGENT = 4


class ProcessingStatus(Enum):
    """Processing status for queued items"""

    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


@dataclass
class QueuedAudioChunk:
    """Audio chunk queued for processing"""

    id: str
    session_id: str
    meeting_id: Optional[str]
    audio_data: str  # base64 encoded
    sample_rate: int
    config: TranscriptionConfig
    priority: QueuePriority
    created_at: datetime
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    retry_count: int = 0
    max_retries: int = 3
    status: ProcessingStatus = ProcessingStatus.PENDING
    result: Optional[TranscriptionResult] = None
    error_message: Optional[str] = None
    callback_url: Optional[str] = None
    estimated_processing_time: Optional[float] = None


@dataclass
class QueueStats:
    """Statistics for the transcription queue"""

    total_queued: int
    processing: int
    completed: int
    failed: int
    pending_by_priority: Dict[str, int]
    average_processing_time: float
    average_queue_wait_time: float
    worker_count: int
    system_load: float
    estimated_wait_time: float


class TranscriptionQueueManager:
    """
    Advanced queue management for audio transcription

    Features:
    - Priority-based processing
    - Parallel worker management
    - Load balancing and backpressure
    - Real-time progress tracking
    - Automatic retry with exponential backoff
    - Performance monitoring
    - Queue persistence with Redis
    """

    def __init__(
        self, max_workers: int = 2, redis_client: Optional[redis.Redis] = None
    ):
        self.max_workers = max_workers
        self.current_workers = 0
        self.redis_client = redis_client or redis.Redis(
            host="localhost", port=6379, db=1, decode_responses=True
        )

        # Queue storage
        self.queue_key = "transcription_queue"
        self.processing_key = "transcription_processing"
        self.completed_key = "transcription_completed"
        self.failed_key = "transcription_failed"

        # Worker management
        self.workers: Dict[str, asyncio.Task] = {}
        self.worker_stats: Dict[str, Dict[str, Any]] = {}

        # Performance tracking
        self.processing_times: List[float] = []
        self.queue_wait_times: List[float] = []
        self.max_history = 1000

        # Callbacks for real-time updates
        self.progress_callbacks: List[Callable] = []
        self.completion_callbacks: List[Callable] = []

        # Queue monitoring
        self.is_running = False
        self.monitor_task: Optional[asyncio.Task] = None

        logger.info(
            f"Transcription queue manager initialized with {max_workers} workers"
        )

    async def start(self):
        """Start the queue processing system"""
        if self.is_running:
            return

        self.is_running = True

        # Start worker processes
        for i in range(self.max_workers):
            worker_id = f"worker_{i}"
            self.workers[worker_id] = asyncio.create_task(
                self._worker_process(worker_id)
            )
            self.worker_stats[worker_id] = {
                "processed_count": 0,
                "total_processing_time": 0,
                "last_activity": None,
                "current_task": None,
                "status": "idle",
            }

        # Start queue monitor
        self.monitor_task = asyncio.create_task(self._queue_monitor())

        logger.info(f"Queue processing started with {len(self.workers)} workers")

    async def stop(self):
        """Stop the queue processing system"""
        if not self.is_running:
            return

        self.is_running = False

        # Cancel all workers
        for worker_id, task in self.workers.items():
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass

        # Cancel monitor
        if self.monitor_task:
            self.monitor_task.cancel()
            try:
                await self.monitor_task
            except asyncio.CancelledError:
                pass

        self.workers.clear()
        self.worker_stats.clear()

        logger.info("Queue processing stopped")

    async def enqueue_audio_chunk(
        self,
        session_id: str,
        audio_data: str,
        sample_rate: int,
        config: TranscriptionConfig,
        meeting_id: Optional[str] = None,
        priority: QueuePriority = QueuePriority.NORMAL,
        callback_url: Optional[str] = None,
    ) -> str:
        """
        Add an audio chunk to the processing queue

        Args:
            session_id: Unique session identifier
            audio_data: Base64 encoded audio data
            sample_rate: Audio sample rate
            config: Transcription configuration
            meeting_id: Optional meeting ID for database integration
            priority: Processing priority
            callback_url: Optional callback URL for completion notification

        Returns:
            Unique chunk ID for tracking
        """
        chunk_id = str(uuid.uuid4())

        # Estimate processing time based on historical data
        estimated_time = await self._estimate_processing_time(
            len(audio_data), config.model_size
        )

        queued_chunk = QueuedAudioChunk(
            id=chunk_id,
            session_id=session_id,
            meeting_id=meeting_id,
            audio_data=audio_data,
            sample_rate=sample_rate,
            config=config,
            priority=priority,
            created_at=datetime.utcnow(),
            callback_url=callback_url,
            estimated_processing_time=estimated_time,
        )

        # Store in Redis with priority-based scoring
        priority_score = priority.value * 1000000 + int(time.time())

        await asyncio.get_event_loop().run_in_executor(
            None,
            lambda: self.redis_client.zadd(
                self.queue_key,
                {json.dumps(asdict(queued_chunk), default=str): priority_score},
            ),
        )

        logger.info(
            f"Audio chunk queued - ID: {chunk_id}, Session: {session_id}, "
            f"Priority: {priority.name}, Estimated time: {estimated_time:.2f}s"
        )

        # Notify progress callbacks
        await self._notify_progress_callbacks("enqueued", queued_chunk)

        return chunk_id

    async def get_queue_position(self, chunk_id: str) -> Optional[int]:
        """Get the position of a chunk in the queue"""
        try:
            # Get all items from queue
            queue_items = await asyncio.get_event_loop().run_in_executor(
                None, lambda: self.redis_client.zrange(self.queue_key, 0, -1)
            )

            for i, item_json in enumerate(queue_items):
                item_data = json.loads(item_json)
                if item_data["id"] == chunk_id:
                    return i + 1

            return None

        except Exception as e:
            logger.error(f"Error getting queue position for {chunk_id}: {e}")
            return None

    async def get_chunk_status(self, chunk_id: str) -> Optional[Dict[str, Any]]:
        """Get the current status of a queued chunk"""
        try:
            # Check in different storage locations
            for key in [
                self.queue_key,
                self.processing_key,
                self.completed_key,
                self.failed_key,
            ]:
                items = await asyncio.get_event_loop().run_in_executor(
                    None,
                    lambda: (
                        self.redis_client.zrange(key, 0, -1)
                        if key == self.queue_key
                        else self.redis_client.hgetall(key)
                    ),
                )

                if key == self.queue_key:
                    for item_json in items:
                        item_data = json.loads(item_json)
                        if item_data["id"] == chunk_id:
                            position = await self.get_queue_position(chunk_id)
                            return {
                                "status": "queued",
                                "position": position,
                                "data": item_data,
                            }
                else:
                    if chunk_id in items:
                        item_data = json.loads(items[chunk_id])
                        return {"status": key.split("_")[-1], "data": item_data}

            return None

        except Exception as e:
            logger.error(f"Error getting chunk status for {chunk_id}: {e}")
            return None

    async def cancel_chunk(self, chunk_id: str) -> bool:
        """Cancel a queued or processing chunk"""
        try:
            # Remove from queue if present
            queue_items = await asyncio.get_event_loop().run_in_executor(
                None,
                lambda: self.redis_client.zrange(
                    self.queue_key, 0, -1, withscores=True
                ),
            )

            for item_json, score in queue_items:
                item_data = json.loads(item_json)
                if item_data["id"] == chunk_id:
                    # Remove from queue
                    await asyncio.get_event_loop().run_in_executor(
                        None, lambda: self.redis_client.zrem(self.queue_key, item_json)
                    )

                    # Add to failed with cancelled status
                    item_data["status"] = ProcessingStatus.CANCELLED.value
                    await asyncio.get_event_loop().run_in_executor(
                        None,
                        lambda: self.redis_client.hset(
                            self.failed_key,
                            chunk_id,
                            json.dumps(item_data, default=str),
                        ),
                    )

                    logger.info(f"Chunk {chunk_id} cancelled")
                    return True

            # Check if currently processing (harder to cancel)
            processing_items = await asyncio.get_event_loop().run_in_executor(
                None, lambda: self.redis_client.hgetall(self.processing_key)
            )

            if chunk_id in processing_items:
                logger.warning(
                    f"Chunk {chunk_id} is currently processing, cannot cancel"
                )
                return False

            return False

        except Exception as e:
            logger.error(f"Error cancelling chunk {chunk_id}: {e}")
            return False

    async def get_queue_stats(self) -> QueueStats:
        """Get comprehensive queue statistics"""
        try:
            # Count items in different states
            queue_count = await asyncio.get_event_loop().run_in_executor(
                None, lambda: self.redis_client.zcard(self.queue_key)
            )

            processing_count = await asyncio.get_event_loop().run_in_executor(
                None, lambda: self.redis_client.hlen(self.processing_key)
            )

            completed_count = await asyncio.get_event_loop().run_in_executor(
                None, lambda: self.redis_client.hlen(self.completed_key)
            )

            failed_count = await asyncio.get_event_loop().run_in_executor(
                None, lambda: self.redis_client.hlen(self.failed_key)
            )

            # Count by priority
            pending_by_priority = defaultdict(int)
            queue_items = await asyncio.get_event_loop().run_in_executor(
                None, lambda: self.redis_client.zrange(self.queue_key, 0, -1)
            )

            for item_json in queue_items:
                item_data = json.loads(item_json)
                priority = item_data.get("priority", QueuePriority.NORMAL.value)
                pending_by_priority[QueuePriority(priority).name] += 1

            # Calculate averages
            avg_processing_time = (
                sum(self.processing_times) / len(self.processing_times)
                if self.processing_times
                else 0
            )

            avg_wait_time = (
                sum(self.queue_wait_times) / len(self.queue_wait_times)
                if self.queue_wait_times
                else 0
            )

            # Estimate wait time for new items
            estimated_wait = await self._estimate_queue_wait_time()

            # System load (simplified)
            system_load = min(
                1.0,
                (processing_count / self.max_workers) if self.max_workers > 0 else 0,
            )

            return QueueStats(
                total_queued=queue_count,
                processing=processing_count,
                completed=completed_count,
                failed=failed_count,
                pending_by_priority=dict(pending_by_priority),
                average_processing_time=avg_processing_time,
                average_queue_wait_time=avg_wait_time,
                worker_count=len(
                    [w for w in self.worker_stats.values() if w["status"] != "idle"]
                ),
                system_load=system_load,
                estimated_wait_time=estimated_wait,
            )

        except Exception as e:
            logger.error(f"Error getting queue stats: {e}")
            return QueueStats(
                total_queued=0,
                processing=0,
                completed=0,
                failed=0,
                pending_by_priority={},
                average_processing_time=0,
                average_queue_wait_time=0,
                worker_count=0,
                system_load=0,
                estimated_wait_time=0,
            )

    async def _worker_process(self, worker_id: str):
        """Worker process for handling queued audio chunks"""
        logger.info(f"Worker {worker_id} started")

        while self.is_running:
            try:
                # Get next item from queue (highest priority first)
                queue_item = await asyncio.get_event_loop().run_in_executor(
                    None, lambda: self.redis_client.zpopmax(self.queue_key)
                )

                if not queue_item:
                    # No items in queue, wait and continue
                    await asyncio.sleep(1)
                    continue

                item_json, score = queue_item[0]
                chunk_data = json.loads(item_json)
                chunk = QueuedAudioChunk(**chunk_data)

                # Update worker status
                self.worker_stats[worker_id]["status"] = "processing"
                self.worker_stats[worker_id]["current_task"] = chunk.id
                self.worker_stats[worker_id]["last_activity"] = datetime.utcnow()

                # Move to processing
                chunk.status = ProcessingStatus.PROCESSING
                chunk.started_at = datetime.utcnow()

                await asyncio.get_event_loop().run_in_executor(
                    None,
                    lambda: self.redis_client.hset(
                        self.processing_key,
                        chunk.id,
                        json.dumps(asdict(chunk), default=str),
                    ),
                )

                # Calculate queue wait time
                if chunk.created_at:
                    wait_time = (chunk.started_at - chunk.created_at).total_seconds()
                    self.queue_wait_times.append(wait_time)
                    if len(self.queue_wait_times) > self.max_history:
                        self.queue_wait_times.pop(0)

                # Notify progress callbacks
                await self._notify_progress_callbacks("processing_started", chunk)

                # Process the audio chunk
                start_time = time.time()

                try:
                    result = await transcription_service.transcribe_audio_chunk(
                        chunk.session_id,
                        chunk.id,
                        (
                            chunk.audio_data.encode()
                            if isinstance(chunk.audio_data, str)
                            else chunk.audio_data
                        ),
                        chunk.config,
                        chunk.sample_rate,
                    )

                    processing_time = time.time() - start_time
                    self.processing_times.append(processing_time)
                    if len(self.processing_times) > self.max_history:
                        self.processing_times.pop(0)

                    # Update chunk with result
                    chunk.result = result
                    chunk.status = ProcessingStatus.COMPLETED
                    chunk.completed_at = datetime.utcnow()

                    # Move to completed
                    await asyncio.get_event_loop().run_in_executor(
                        None,
                        lambda: self.redis_client.hset(
                            self.completed_key,
                            chunk.id,
                            json.dumps(asdict(chunk), default=str),
                        ),
                    )

                    # Update worker stats
                    self.worker_stats[worker_id]["processed_count"] += 1
                    self.worker_stats[worker_id][
                        "total_processing_time"
                    ] += processing_time

                    # Notify completion callbacks
                    await self._notify_completion_callbacks(chunk)

                    logger.info(
                        f"Worker {worker_id} completed chunk {chunk.id} "
                        f"in {processing_time:.2f}s"
                    )

                except Exception as e:
                    # Handle processing error
                    chunk.error_message = str(e)
                    chunk.retry_count += 1

                    if chunk.retry_count < chunk.max_retries:
                        # Retry with exponential backoff
                        delay = 2**chunk.retry_count
                        await asyncio.sleep(delay)

                        # Re-queue with lower priority
                        priority_score = (chunk.priority.value - 1) * 1000000 + int(
                            time.time()
                        )
                        await asyncio.get_event_loop().run_in_executor(
                            None,
                            lambda: self.redis_client.zadd(
                                self.queue_key,
                                {
                                    json.dumps(
                                        asdict(chunk), default=str
                                    ): priority_score
                                },
                            ),
                        )

                        logger.warning(
                            f"Worker {worker_id} retrying chunk {chunk.id} "
                            f"(attempt {chunk.retry_count}/{chunk.max_retries})"
                        )
                    else:
                        # Max retries exceeded, move to failed
                        chunk.status = ProcessingStatus.FAILED
                        chunk.completed_at = datetime.utcnow()

                        await asyncio.get_event_loop().run_in_executor(
                            None,
                            lambda: self.redis_client.hset(
                                self.failed_key,
                                chunk.id,
                                json.dumps(asdict(chunk), default=str),
                            ),
                        )

                        logger.error(
                            f"Worker {worker_id} failed to process chunk {chunk.id} "
                            f"after {chunk.max_retries} retries: {e}"
                        )

                # Remove from processing
                await asyncio.get_event_loop().run_in_executor(
                    None, lambda: self.redis_client.hdel(self.processing_key, chunk.id)
                )

                # Update worker status
                self.worker_stats[worker_id]["status"] = "idle"
                self.worker_stats[worker_id]["current_task"] = None

            except asyncio.CancelledError:
                logger.info(f"Worker {worker_id} cancelled")
                break
            except Exception as e:
                logger.error(f"Worker {worker_id} error: {e}")
                await asyncio.sleep(5)  # Back off on error

        logger.info(f"Worker {worker_id} stopped")

    async def _queue_monitor(self):
        """Monitor queue health and performance"""
        while self.is_running:
            try:
                stats = await self.get_queue_stats()

                # Log queue status periodically
                if stats.total_queued > 0 or stats.processing > 0:
                    logger.info(
                        f"Queue status - Pending: {stats.total_queued}, "
                        f"Processing: {stats.processing}, "
                        f"Workers: {stats.worker_count}/{self.max_workers}, "
                        f"Load: {stats.system_load:.2f}"
                    )

                # Clean up old completed/failed items (keep last 1000)
                for key in [self.completed_key, self.failed_key]:
                    items = await asyncio.get_event_loop().run_in_executor(
                        None, lambda: self.redis_client.hgetall(key)
                    )

                    if len(items) > 1000:
                        # Remove oldest items
                        sorted_items = sorted(
                            items.items(),
                            key=lambda x: json.loads(x[1]).get("completed_at", ""),
                            reverse=True,
                        )

                        to_remove = [item[0] for item in sorted_items[1000:]]
                        if to_remove:
                            await asyncio.get_event_loop().run_in_executor(
                                None, lambda: self.redis_client.hdel(key, *to_remove)
                            )

                await asyncio.sleep(30)  # Monitor every 30 seconds

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Queue monitor error: {e}")
                await asyncio.sleep(10)

    async def _estimate_processing_time(
        self, audio_size: int, model_size: WhisperModelSize
    ) -> float:
        """Estimate processing time based on audio size and model"""
        # Base estimates in seconds per MB of audio
        base_times = {
            WhisperModelSize.TINY: 0.1,
            WhisperModelSize.BASE: 0.2,
            WhisperModelSize.SMALL: 0.5,
            WhisperModelSize.MEDIUM: 1.0,
            WhisperModelSize.LARGE: 2.0,
            WhisperModelSize.LARGE_V2: 2.0,
            WhisperModelSize.LARGE_V3: 2.0,
        }

        # Estimate audio size in MB (rough approximation)
        audio_mb = len(
            audio_size.encode() if isinstance(audio_size, str) else audio_size
        ) / (1024 * 1024)

        # Get base time for model
        base_time = base_times.get(model_size, 1.0)

        # Adjust based on recent performance
        if self.processing_times:
            avg_recent = sum(self.processing_times[-10:]) / len(
                self.processing_times[-10:]
            )
            base_time = (
                max(base_time, avg_recent / audio_mb) if audio_mb > 0 else base_time
            )

        return base_time * audio_mb

    async def _estimate_queue_wait_time(self) -> float:
        """Estimate wait time for new items added to queue"""
        try:
            queue_count = await asyncio.get_event_loop().run_in_executor(
                None, lambda: self.redis_client.zcard(self.queue_key)
            )

            if queue_count == 0:
                return 0.0

            # Estimate based on average processing time and active workers
            avg_processing_time = (
                sum(self.processing_times[-50:]) / len(self.processing_times[-50:])
                if self.processing_times
                else 10.0
            )

            active_workers = len(
                [w for w in self.worker_stats.values() if w["status"] != "idle"]
            )
            effective_workers = max(1, active_workers)

            return (queue_count * avg_processing_time) / effective_workers

        except Exception:
            return 0.0

    async def _notify_progress_callbacks(self, event: str, chunk: QueuedAudioChunk):
        """Notify registered progress callbacks"""
        for callback in self.progress_callbacks:
            try:
                await callback(event, chunk)
            except Exception as e:
                logger.error(f"Progress callback error: {e}")

    async def _notify_completion_callbacks(self, chunk: QueuedAudioChunk):
        """Notify registered completion callbacks"""
        for callback in self.completion_callbacks:
            try:
                await callback(chunk)
            except Exception as e:
                logger.error(f"Completion callback error: {e}")

    def add_progress_callback(self, callback: Callable):
        """Add a callback for progress events"""
        self.progress_callbacks.append(callback)

    def add_completion_callback(self, callback: Callable):
        """Add a callback for completion events"""
        self.completion_callbacks.append(callback)


# Global queue manager instance
queue_manager = TranscriptionQueueManager(max_workers=2)

# Export the manager instance
__all__ = [
    "queue_manager",
    "TranscriptionQueueManager",
    "QueuePriority",
    "ProcessingStatus",
]
