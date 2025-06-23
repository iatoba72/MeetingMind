"""
Video-Transcription Synchronization Service
Handles precise synchronization between video streams and transcription timing
"""

import asyncio
import logging
import numpy as np
import time
import threading
from typing import Dict, List, Optional, Tuple, Any, NamedTuple
from dataclasses import dataclass, asdict
from datetime import datetime, timedelta
import collections
import json

try:
    import cv2
    VIDEO_PROCESSING_AVAILABLE = True
except ImportError:
    VIDEO_PROCESSING_AVAILABLE = False
    logging.warning("OpenCV not available - video processing disabled")

from network_transcription_service import TranscriptionSegment, NetworkTranscriptionService

logger = logging.getLogger(__name__)

@dataclass
class VideoTimestamp:
    """Video timestamp information"""
    stream_id: str
    frame_number: int
    timestamp: float  # Seconds since stream start
    wall_clock_time: datetime
    frame_rate: float
    resolution: Tuple[int, int]
    
@dataclass
class SyncedTranscriptionSegment:
    """Transcription segment synchronized with video"""
    transcription: TranscriptionSegment
    video_start_frame: int
    video_end_frame: int
    video_start_timestamp: float
    video_end_timestamp: float
    sync_confidence: float  # How confident we are in the sync
    sync_method: str  # Method used for synchronization
    drift_correction_ms: float = 0.0  # Applied drift correction

@dataclass
class StreamSyncConfig:
    """Configuration for stream synchronization"""
    # Timing tolerances
    max_audio_video_drift_ms: float = 100.0  # Maximum allowed A/V drift
    sync_check_interval_s: float = 5.0  # How often to check sync
    drift_correction_threshold_ms: float = 50.0  # When to apply correction
    
    # Buffer management
    max_sync_buffer_duration_s: float = 30.0  # Maximum sync buffer
    min_confidence_threshold: float = 0.7  # Minimum sync confidence
    
    # Video analysis
    enable_visual_cues: bool = True  # Use visual cues for sync
    keyframe_sync_enabled: bool = True  # Sync on keyframes
    scene_change_detection: bool = True  # Detect scene changes
    
    # Network compensation
    adaptive_sync: bool = True  # Adapt to network conditions
    jitter_compensation: bool = True  # Compensate for network jitter

class VideoStreamAnalyzer:
    """Analyzes video stream for synchronization cues"""
    
    def __init__(self, stream_id: str, config: StreamSyncConfig):
        self.stream_id = stream_id
        self.config = config
        
        # Frame analysis
        self.frame_buffer = collections.deque(maxlen=100)  # Recent frames
        self.keyframes = collections.deque(maxlen=50)  # Detected keyframes
        self.scene_changes = collections.deque(maxlen=20)  # Scene changes
        
        # Timing tracking
        self.frame_times = collections.deque(maxlen=1000)
        self.estimated_fps = 30.0
        self.last_frame_time = 0
        
        # Analysis state
        self.prev_frame = None
        self.motion_threshold = 0.1
        self.scene_change_threshold = 0.3
        
    def analyze_frame(self, frame: np.ndarray, timestamp: float, frame_number: int) -> VideoTimestamp:
        """Analyze video frame for synchronization information"""
        
        if not VIDEO_PROCESSING_AVAILABLE:
            return VideoTimestamp(
                stream_id=self.stream_id,
                frame_number=frame_number,
                timestamp=timestamp,
                wall_clock_time=datetime.now(),
                frame_rate=self.estimated_fps,
                resolution=(0, 0)
            )
        
        height, width = frame.shape[:2]
        
        # Update FPS estimation
        if self.last_frame_time > 0:
            frame_interval = timestamp - self.last_frame_time
            if frame_interval > 0:
                current_fps = 1.0 / frame_interval
                # Smooth FPS estimation
                self.estimated_fps = 0.9 * self.estimated_fps + 0.1 * current_fps
        
        self.last_frame_time = timestamp
        
        # Detect keyframes and scene changes
        is_keyframe = False
        is_scene_change = False
        
        if self.prev_frame is not None and self.config.enable_visual_cues:
            # Convert to grayscale for analysis
            gray_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY) if len(frame.shape) == 3 else frame
            prev_gray = cv2.cvtColor(self.prev_frame, cv2.COLOR_BGR2GRAY) if len(self.prev_frame.shape) == 3 else self.prev_frame
            
            # Calculate frame difference
            frame_diff = cv2.absdiff(gray_frame, prev_gray)
            diff_mean = np.mean(frame_diff) / 255.0
            
            # Detect scene changes
            if diff_mean > self.scene_change_threshold:
                is_scene_change = True
                self.scene_changes.append((timestamp, frame_number, diff_mean))
                logger.debug(f"Scene change detected at frame {frame_number}, diff: {diff_mean:.3f}")
            
            # Detect keyframes (frames with significant motion)
            if diff_mean > self.motion_threshold:
                is_keyframe = True
                self.keyframes.append((timestamp, frame_number, diff_mean))
        
        self.prev_frame = frame.copy()
        
        video_timestamp = VideoTimestamp(
            stream_id=self.stream_id,
            frame_number=frame_number,
            timestamp=timestamp,
            wall_clock_time=datetime.now(),
            frame_rate=self.estimated_fps,
            resolution=(width, height)
        )
        
        self.frame_times.append(video_timestamp)
        
        return video_timestamp
    
    def get_nearest_keyframe(self, target_timestamp: float) -> Optional[Tuple[float, int]]:
        """Find nearest keyframe to target timestamp"""
        if not self.keyframes:
            return None
        
        best_keyframe = None
        min_distance = float('inf')
        
        for timestamp, frame_number, _ in self.keyframes:
            distance = abs(timestamp - target_timestamp)
            if distance < min_distance:
                min_distance = distance
                best_keyframe = (timestamp, frame_number)
        
        return best_keyframe
    
    def get_frame_at_timestamp(self, target_timestamp: float) -> Optional[int]:
        """Estimate frame number at specific timestamp"""
        if not self.frame_times:
            return None
        
        # Find closest frame
        best_frame = None
        min_distance = float('inf')
        
        for video_ts in self.frame_times:
            distance = abs(video_ts.timestamp - target_timestamp)
            if distance < min_distance:
                min_distance = distance
                best_frame = video_ts.frame_number
        
        return best_frame

class StreamSynchronizer:
    """Handles synchronization between audio transcription and video streams"""
    
    def __init__(self, stream_id: str, config: StreamSyncConfig):
        self.stream_id = stream_id
        self.config = config
        
        # Video analysis
        self.video_analyzer = VideoStreamAnalyzer(stream_id, config)
        
        # Sync state
        self.audio_video_offset = 0.0  # Current A/V offset in seconds
        self.sync_confidence = 1.0
        self.last_sync_check = 0
        self.drift_corrections = collections.deque(maxlen=100)
        
        # Buffers
        self.transcription_buffer = collections.deque(maxlen=1000)
        self.sync_events = collections.deque(maxlen=100)
        
        # Statistics
        self.sync_stats = {
            "total_segments_synced": 0,
            "average_sync_confidence": 0.0,
            "drift_corrections_applied": 0,
            "max_observed_drift_ms": 0.0
        }
        
        self._lock = threading.Lock()
    
    def add_video_frame(self, frame: np.ndarray, timestamp: float, frame_number: int) -> VideoTimestamp:
        """Add video frame for analysis"""
        video_ts = self.video_analyzer.analyze_frame(frame, timestamp, frame_number)
        
        # Check for sync drift periodically
        current_time = time.time()
        if current_time - self.last_sync_check > self.config.sync_check_interval_s:
            self._check_sync_drift()
            self.last_sync_check = current_time
        
        return video_ts
    
    def add_transcription_segment(self, segment: TranscriptionSegment) -> SyncedTranscriptionSegment:
        """Add transcription segment and sync with video"""
        with self._lock:
            # Apply current drift correction
            corrected_start = segment.start_time + self.audio_video_offset
            corrected_end = segment.end_time + self.audio_video_offset
            
            # Find corresponding video frames
            start_frame = self.video_analyzer.get_frame_at_timestamp(corrected_start)
            end_frame = self.video_analyzer.get_frame_at_timestamp(corrected_end)
            
            # Calculate sync confidence
            sync_confidence = self._calculate_sync_confidence(segment, corrected_start, corrected_end)
            
            # Determine sync method used
            sync_method = "timestamp_mapping"
            if self.config.keyframe_sync_enabled:
                nearest_keyframe = self.video_analyzer.get_nearest_keyframe(corrected_start)
                if nearest_keyframe and abs(nearest_keyframe[0] - corrected_start) < 0.5:
                    sync_method = "keyframe_sync"
            
            synced_segment = SyncedTranscriptionSegment(
                transcription=segment,
                video_start_frame=start_frame or 0,
                video_end_frame=end_frame or 0,
                video_start_timestamp=corrected_start,
                video_end_timestamp=corrected_end,
                sync_confidence=sync_confidence,
                sync_method=sync_method,
                drift_correction_ms=self.audio_video_offset * 1000
            )
            
            self.transcription_buffer.append(synced_segment)
            self._update_sync_stats(synced_segment)
            
            return synced_segment
    
    def _check_sync_drift(self):
        """Check for and correct audio/video drift"""
        if len(self.transcription_buffer) < 2:
            return
        
        # Analyze recent segments for drift patterns
        recent_segments = list(self.transcription_buffer)[-10:]
        drift_measurements = []
        
        for segment in recent_segments:
            # Compare expected vs actual timing
            audio_duration = segment.transcription.end_time - segment.transcription.start_time
            video_duration = segment.video_end_timestamp - segment.video_start_timestamp
            
            if video_duration > 0:
                duration_ratio = audio_duration / video_duration
                # Ideal ratio should be close to 1.0
                drift = abs(1.0 - duration_ratio)
                drift_measurements.append(drift)
        
        if drift_measurements:
            average_drift = sum(drift_measurements) / len(drift_measurements)
            
            # Apply correction if drift exceeds threshold
            if average_drift > (self.config.drift_correction_threshold_ms / 1000.0):
                correction = average_drift * 0.5  # Conservative correction
                
                if self.config.adaptive_sync:
                    self.audio_video_offset += correction
                    self.drift_corrections.append(correction)
                    
                    logger.info(f"Applied drift correction: {correction*1000:.1f}ms for stream {self.stream_id}")
                    
                    # Update statistics
                    self.sync_stats["drift_corrections_applied"] += 1
                    self.sync_stats["max_observed_drift_ms"] = max(
                        self.sync_stats["max_observed_drift_ms"],
                        correction * 1000
                    )
    
    def _calculate_sync_confidence(self, segment: TranscriptionSegment, 
                                 video_start: float, video_end: float) -> float:
        """Calculate confidence in synchronization"""
        confidence = 1.0
        
        # Reduce confidence based on audio quality
        confidence *= segment.audio_quality
        
        # Reduce confidence based on transcription confidence
        confidence *= segment.confidence
        
        # Reduce confidence based on network conditions
        if segment.packet_loss > 5.0:  # 5% packet loss
            confidence *= 0.8
        
        if segment.jitter_ms > 100:  # High jitter
            confidence *= 0.9
        
        # Reduce confidence if we had to resync recently
        if segment.resync_count > 0:
            confidence *= max(0.5, 1.0 - (segment.resync_count * 0.1))
        
        # Video-based confidence adjustments
        video_duration = video_end - video_start
        audio_duration = segment.end_time - segment.start_time
        
        if video_duration > 0:
            duration_similarity = 1.0 - abs(video_duration - audio_duration) / max(video_duration, audio_duration)
            confidence *= duration_similarity
        
        return max(0.0, min(1.0, confidence))
    
    def _update_sync_stats(self, synced_segment: SyncedTranscriptionSegment):
        """Update synchronization statistics"""
        stats = self.sync_stats
        
        stats["total_segments_synced"] += 1
        
        # Update average confidence
        old_avg = stats["average_sync_confidence"]
        new_confidence = synced_segment.sync_confidence
        stats["average_sync_confidence"] = (old_avg * (stats["total_segments_synced"] - 1) + new_confidence) / stats["total_segments_synced"]
    
    def get_sync_statistics(self) -> Dict[str, Any]:
        """Get synchronization statistics"""
        with self._lock:
            stats = self.sync_stats.copy()
            stats.update({
                "stream_id": self.stream_id,
                "current_av_offset_ms": self.audio_video_offset * 1000,
                "current_sync_confidence": self.sync_confidence,
                "recent_drift_corrections": len(self.drift_corrections),
                "buffered_segments": len(self.transcription_buffer),
                "video_fps": self.video_analyzer.estimated_fps,
                "keyframes_detected": len(self.video_analyzer.keyframes),
                "scene_changes_detected": len(self.video_analyzer.scene_changes)
            })
            
            return stats
    
    def resync_streams(self, reference_timestamp: float, video_frame_number: int):
        """Manually resync audio and video streams"""
        with self._lock:
            # Calculate new offset based on reference
            current_video_time = video_frame_number / self.video_analyzer.estimated_fps
            self.audio_video_offset = reference_timestamp - current_video_time
            
            logger.info(f"Manual resync applied for stream {self.stream_id}: "
                       f"offset = {self.audio_video_offset*1000:.1f}ms")
    
    def get_transcription_at_frame(self, frame_number: int) -> Optional[SyncedTranscriptionSegment]:
        """Get transcription segment active at specific video frame"""
        with self._lock:
            frame_timestamp = frame_number / self.video_analyzer.estimated_fps
            
            # Find segment that contains this timestamp
            for segment in reversed(self.transcription_buffer):
                if (segment.video_start_timestamp <= frame_timestamp <= segment.video_end_timestamp):
                    return segment
            
            return None
    
    def get_video_frames_for_text(self, text: str) -> List[Tuple[int, int, float]]:
        """Get video frame ranges that correspond to specific text"""
        with self._lock:
            matches = []
            
            for segment in self.transcription_buffer:
                if text.lower() in segment.transcription.text.lower():
                    matches.append((
                        segment.video_start_frame,
                        segment.video_end_frame,
                        segment.sync_confidence
                    ))
            
            return matches

class VideoTranscriptionSyncService:
    """
    Service for managing video-transcription synchronization across multiple streams
    """
    
    def __init__(self, config: StreamSyncConfig = None):
        self.config = config or StreamSyncConfig()
        self.synchronizers: Dict[str, StreamSynchronizer] = {}
        self.is_running = False
        
        # Global statistics
        self.global_stats = {
            "total_streams": 0,
            "active_streams": 0,
            "average_sync_quality": 0.0,
            "total_drift_corrections": 0
        }
    
    async def start(self):
        """Start synchronization service"""
        self.is_running = True
        logger.info("Video-Transcription Sync Service started")
    
    async def stop(self):
        """Stop synchronization service"""
        self.is_running = False
        self.synchronizers.clear()
        logger.info("Video-Transcription Sync Service stopped")
    
    def create_stream_sync(self, stream_id: str, 
                          config: Optional[StreamSyncConfig] = None) -> StreamSynchronizer:
        """Create synchronizer for new stream"""
        stream_config = config or self.config
        synchronizer = StreamSynchronizer(stream_id, stream_config)
        
        self.synchronizers[stream_id] = synchronizer
        self.global_stats["total_streams"] += 1
        self.global_stats["active_streams"] += 1
        
        logger.info(f"Created stream synchronizer: {stream_id}")
        return synchronizer
    
    def remove_stream_sync(self, stream_id: str) -> bool:
        """Remove stream synchronizer"""
        if stream_id in self.synchronizers:
            del self.synchronizers[stream_id]
            self.global_stats["active_streams"] -= 1
            logger.info(f"Removed stream synchronizer: {stream_id}")
            return True
        return False
    
    def get_synchronizer(self, stream_id: str) -> Optional[StreamSynchronizer]:
        """Get synchronizer for stream"""
        return self.synchronizers.get(stream_id)
    
    def sync_transcription_with_video(self, stream_id: str, 
                                    segment: TranscriptionSegment) -> Optional[SyncedTranscriptionSegment]:
        """Synchronize transcription segment with video"""
        synchronizer = self.synchronizers.get(stream_id)
        if not synchronizer:
            logger.warning(f"No synchronizer found for stream {stream_id}")
            return None
        
        return synchronizer.add_transcription_segment(segment)
    
    def add_video_frame(self, stream_id: str, frame: np.ndarray, 
                       timestamp: float, frame_number: int) -> Optional[VideoTimestamp]:
        """Add video frame for synchronization"""
        synchronizer = self.synchronizers.get(stream_id)
        if not synchronizer:
            return None
        
        return synchronizer.add_video_frame(frame, timestamp, frame_number)
    
    def get_stream_statistics(self, stream_id: str) -> Dict[str, Any]:
        """Get statistics for specific stream"""
        synchronizer = self.synchronizers.get(stream_id)
        if not synchronizer:
            return {}
        
        return synchronizer.get_sync_statistics()
    
    def get_global_statistics(self) -> Dict[str, Any]:
        """Get global synchronization statistics"""
        # Update global statistics
        if self.synchronizers:
            sync_qualities = []
            total_corrections = 0
            
            for synchronizer in self.synchronizers.values():
                stats = synchronizer.get_sync_statistics()
                sync_qualities.append(stats.get("average_sync_confidence", 0))
                total_corrections += stats.get("drift_corrections_applied", 0)
            
            self.global_stats["average_sync_quality"] = sum(sync_qualities) / len(sync_qualities)
            self.global_stats["total_drift_corrections"] = total_corrections
        
        return self.global_stats.copy()

# Global sync service
video_transcription_sync_service = VideoTranscriptionSyncService()

async def get_video_transcription_sync_service(config: Optional[StreamSyncConfig] = None) -> VideoTranscriptionSyncService:
    """Get the global video-transcription sync service"""
    global video_transcription_sync_service
    
    if config and not video_transcription_sync_service.is_running:
        video_transcription_sync_service = VideoTranscriptionSyncService(config)
    
    if not video_transcription_sync_service.is_running:
        await video_transcription_sync_service.start()
    
    return video_transcription_sync_service