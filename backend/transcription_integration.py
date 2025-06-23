"""
Transcription Integration Module
Integrates network transcription with existing audio pipeline and streaming services
"""

import asyncio
import logging
import numpy as np
import time
from typing import Dict, List, Optional, Any, Callable
from datetime import datetime
import json

from network_transcription_service import (
    NetworkTranscriptionService, get_network_transcription_service,
    StreamTranscriptionConfig, TranscriptionSegment, NetworkAudioChunk
)
from video_transcription_sync import (
    VideoTranscriptionSyncService, get_video_transcription_sync_service,
    SyncedTranscriptionSegment
)
from stream_vad import (
    StreamVAD, get_stream_vad, AudioQualityMetrics, calculate_audio_quality_metrics
)

logger = logging.getLogger(__name__)

class TranscriptionIntegrationService:
    """
    Integration service that connects the enhanced transcription system
    with existing MeetingMind audio pipeline and streaming services
    """
    
    def __init__(self):
        self.transcription_service: Optional[NetworkTranscriptionService] = None
        self.sync_service: Optional[VideoTranscriptionSyncService] = None
        self.vad_service: Optional[StreamVAD] = None
        
        # Stream mappings
        self.stream_configs: Dict[str, StreamTranscriptionConfig] = {}
        self.active_streams: Dict[str, Dict[str, Any]] = {}
        
        # Callbacks for transcription events
        self.transcription_callbacks: List[Callable[[TranscriptionSegment], None]] = []
        self.sync_callbacks: List[Callable[[SyncedTranscriptionSegment], None]] = []
        
        # Statistics
        self.integration_stats = {
            "total_audio_chunks_processed": 0,
            "total_transcription_segments": 0,
            "total_sync_events": 0,
            "average_processing_latency_ms": 0.0,
            "active_integrations": 0
        }
        
        self.is_running = False
    
    async def start(self):
        """Start the integration service"""
        if self.is_running:
            return
        
        # Initialize underlying services
        self.transcription_service = await get_network_transcription_service()
        self.sync_service = await get_video_transcription_sync_service()
        self.vad_service = await get_stream_vad()
        
        self.is_running = True
        logger.info("Transcription Integration Service started")
    
    async def stop(self):
        """Stop the integration service"""
        if not self.is_running:
            return
        
        self.is_running = False
        
        # Clean up active streams
        for stream_id in list(self.active_streams.keys()):
            await self.remove_stream_integration(stream_id)
        
        logger.info("Transcription Integration Service stopped")
    
    async def create_stream_integration(self, 
                                      stream_id: str,
                                      transcription_config: Optional[StreamTranscriptionConfig] = None,
                                      enable_video_sync: bool = True) -> bool:
        """Create integrated transcription for a stream"""
        
        if not self.is_running:
            await self.start()
        
        if stream_id in self.active_streams:
            logger.warning(f"Stream integration {stream_id} already exists")
            return False
        
        try:
            # Create transcription stream
            config = transcription_config or StreamTranscriptionConfig()
            self.stream_configs[stream_id] = config
            
            success = self.transcription_service.create_stream(stream_id, config)
            if not success:
                return False
            
            # Create video sync if enabled
            if enable_video_sync:
                self.sync_service.create_stream_sync(stream_id)
            
            # Initialize stream tracking
            self.active_streams[stream_id] = {
                "created_at": datetime.now(),
                "transcription_enabled": True,
                "video_sync_enabled": enable_video_sync,
                "audio_chunks_processed": 0,
                "transcription_segments": 0,
                "last_activity": datetime.now(),
                "quality_history": [],
                "latency_history": []
            }
            
            self.integration_stats["active_integrations"] += 1
            
            logger.info(f"Created stream integration: {stream_id}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to create stream integration {stream_id}: {e}")
            return False
    
    async def remove_stream_integration(self, stream_id: str) -> bool:
        """Remove stream integration"""
        
        if stream_id not in self.active_streams:
            return False
        
        try:
            # Remove from transcription service
            if self.transcription_service:
                self.transcription_service.remove_stream(stream_id)
            
            # Remove from sync service
            if self.sync_service:
                self.sync_service.remove_stream_sync(stream_id)
            
            # Clean up tracking
            del self.active_streams[stream_id]
            if stream_id in self.stream_configs:
                del self.stream_configs[stream_id]
            
            self.integration_stats["active_integrations"] -= 1
            
            logger.info(f"Removed stream integration: {stream_id}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to remove stream integration {stream_id}: {e}")
            return False
    
    async def process_audio_from_pipeline(self, 
                                        stream_id: str,
                                        audio_data: np.ndarray,
                                        sample_rate: int,
                                        timestamp: float,
                                        network_metrics: Optional[Dict[str, float]] = None) -> bool:
        """
        Process audio data from the existing audio pipeline
        This is the main integration point with the MeetingMind audio system
        """
        
        if stream_id not in self.active_streams:
            logger.warning(f"Stream integration {stream_id} not found")
            return False
        
        try:
            processing_start = time.time()
            
            # Calculate audio quality metrics
            quality_metrics = calculate_audio_quality_metrics(
                audio_data,
                sample_rate=sample_rate,
                packet_loss=network_metrics.get("packet_loss", 0.0) if network_metrics else 0.0,
                jitter_ms=network_metrics.get("jitter_ms", 0.0) if network_metrics else 0.0,
                bitrate_kbps=network_metrics.get("bitrate_kbps", 128.0) if network_metrics else 128.0
            )
            
            # Create network audio chunk
            audio_chunk = NetworkAudioChunk(
                stream_id=stream_id,
                audio_data=audio_data,
                timestamp=timestamp,
                sample_rate=sample_rate,
                quality_metrics=quality_metrics,
                sequence_number=self.active_streams[stream_id]["audio_chunks_processed"]
            )
            
            # Process with transcription service
            success = await self.transcription_service.process_audio_chunk(audio_chunk)
            
            if success:
                # Update stream statistics
                stream_info = self.active_streams[stream_id]
                stream_info["audio_chunks_processed"] += 1
                stream_info["last_activity"] = datetime.now()
                stream_info["quality_history"].append(quality_metrics.overall_quality)
                
                # Keep quality history manageable
                if len(stream_info["quality_history"]) > 100:
                    stream_info["quality_history"] = stream_info["quality_history"][-100:]
                
                # Update global stats
                self.integration_stats["total_audio_chunks_processed"] += 1
                
                processing_time = (time.time() - processing_start) * 1000
                stream_info["latency_history"].append(processing_time)
                
                if len(stream_info["latency_history"]) > 50:
                    stream_info["latency_history"] = stream_info["latency_history"][-50:]
                
                # Update average latency
                if stream_info["latency_history"]:
                    avg_latency = sum(stream_info["latency_history"]) / len(stream_info["latency_history"])
                    self.integration_stats["average_processing_latency_ms"] = avg_latency
            
            return success
            
        except Exception as e:
            logger.error(f"Error processing audio for stream {stream_id}: {e}")
            return False
    
    async def process_video_frame_from_pipeline(self,
                                              stream_id: str,
                                              frame_data: np.ndarray,
                                              frame_number: int,
                                              timestamp: float) -> bool:
        """
        Process video frame from existing video pipeline
        Integrates with video-transcription synchronization
        """
        
        if stream_id not in self.active_streams:
            return False
        
        stream_info = self.active_streams[stream_id]
        if not stream_info.get("video_sync_enabled", False):
            return True  # Not an error, just not enabled
        
        try:
            synchronizer = self.sync_service.get_synchronizer(stream_id)
            if not synchronizer:
                return False
            
            # Process frame for synchronization
            video_timestamp = synchronizer.add_video_frame(frame_data, timestamp, frame_number)
            
            if video_timestamp:
                stream_info["last_activity"] = datetime.now()
                return True
            
            return False
            
        except Exception as e:
            logger.error(f"Error processing video frame for stream {stream_id}: {e}")
            return False
    
    def add_transcription_callback(self, callback: Callable[[TranscriptionSegment], None]):
        """Add callback for transcription events"""
        self.transcription_callbacks.append(callback)
    
    def add_sync_callback(self, callback: Callable[[SyncedTranscriptionSegment], None]):
        """Add callback for synchronization events"""
        self.sync_callbacks.append(callback)
    
    def remove_transcription_callback(self, callback: Callable[[TranscriptionSegment], None]):
        """Remove transcription callback"""
        if callback in self.transcription_callbacks:
            self.transcription_callbacks.remove(callback)
    
    def remove_sync_callback(self, callback: Callable[[SyncedTranscriptionSegment], None]):
        """Remove sync callback"""
        if callback in self.sync_callbacks:
            self.sync_callbacks.remove(callback)
    
    async def get_recent_transcriptions(self, stream_id: str, limit: int = 10) -> List[TranscriptionSegment]:
        """Get recent transcription segments for a stream"""
        # This would integrate with the transcription service's segment storage
        # For now, return empty list as segments are handled via callbacks
        return []
    
    async def search_transcriptions(self, stream_id: str, text: str) -> List[Dict[str, Any]]:
        """Search transcriptions for specific text"""
        if stream_id not in self.active_streams:
            return []
        
        try:
            synchronizer = self.sync_service.get_synchronizer(stream_id)
            if not synchronizer:
                return []
            
            matches = synchronizer.get_video_frames_for_text(text)
            
            return [
                {
                    "start_frame": match[0],
                    "end_frame": match[1],
                    "confidence": match[2],
                    "stream_id": stream_id
                }
                for match in matches
            ]
            
        except Exception as e:
            logger.error(f"Error searching transcriptions for stream {stream_id}: {e}")
            return []
    
    async def get_transcription_at_timestamp(self, stream_id: str, timestamp: float) -> Optional[SyncedTranscriptionSegment]:
        """Get transcription active at specific timestamp"""
        if stream_id not in self.active_streams:
            return None
        
        try:
            synchronizer = self.sync_service.get_synchronizer(stream_id)
            if not synchronizer:
                return None
            
            # Convert timestamp to frame number (approximate)
            frame_number = int(timestamp * 30)  # Assume 30fps
            
            return synchronizer.get_transcription_at_frame(frame_number)
            
        except Exception as e:
            logger.error(f"Error getting transcription at timestamp for stream {stream_id}: {e}")
            return None
    
    async def resync_stream(self, stream_id: str, reference_timestamp: float, video_frame: Optional[int] = None):
        """Resync stream with reference timestamp"""
        if stream_id not in self.active_streams:
            return
        
        try:
            # Resync transcription service
            if self.transcription_service:
                await self.transcription_service.resync_stream(stream_id, reference_timestamp)
            
            # Resync video synchronization
            if video_frame is not None and self.sync_service:
                synchronizer = self.sync_service.get_synchronizer(stream_id)
                if synchronizer:
                    synchronizer.resync_streams(reference_timestamp, video_frame)
            
            logger.info(f"Resynced stream {stream_id} to timestamp {reference_timestamp}")
            
        except Exception as e:
            logger.error(f"Error resyncing stream {stream_id}: {e}")
    
    def get_stream_statistics(self, stream_id: str) -> Dict[str, Any]:
        """Get comprehensive statistics for a stream"""
        if stream_id not in self.active_streams:
            return {}
        
        stream_info = self.active_streams[stream_id]
        
        # Get statistics from underlying services
        transcription_stats = {}
        sync_stats = {}
        
        if self.transcription_service:
            transcription_stats = self.transcription_service.get_stream_statistics(stream_id)
        
        if self.sync_service:
            sync_stats = self.sync_service.get_stream_statistics(stream_id)
        
        # Calculate additional metrics
        avg_quality = 0.0
        if stream_info["quality_history"]:
            avg_quality = sum(stream_info["quality_history"]) / len(stream_info["quality_history"])
        
        avg_latency = 0.0
        if stream_info["latency_history"]:
            avg_latency = sum(stream_info["latency_history"]) / len(stream_info["latency_history"])
        
        return {
            "stream_id": stream_id,
            "integration": {
                "created_at": stream_info["created_at"].isoformat(),
                "audio_chunks_processed": stream_info["audio_chunks_processed"],
                "transcription_segments": stream_info["transcription_segments"],
                "last_activity": stream_info["last_activity"].isoformat(),
                "average_quality": avg_quality,
                "average_latency_ms": avg_latency,
                "transcription_enabled": stream_info["transcription_enabled"],
                "video_sync_enabled": stream_info["video_sync_enabled"]
            },
            "transcription": transcription_stats,
            "synchronization": sync_stats
        }
    
    def get_global_statistics(self) -> Dict[str, Any]:
        """Get global integration statistics"""
        
        # Get statistics from underlying services
        transcription_stats = {}
        sync_stats = {}
        
        if self.transcription_service:
            transcription_stats = self.transcription_service.get_global_statistics()
        
        if self.sync_service:
            sync_stats = self.sync_service.get_global_statistics()
        
        return {
            "integration": self.integration_stats.copy(),
            "transcription": transcription_stats,
            "synchronization": sync_stats,
            "is_running": self.is_running,
            "active_streams": list(self.active_streams.keys())
        }

# Global integration service
transcription_integration = TranscriptionIntegrationService()

async def get_transcription_integration() -> TranscriptionIntegrationService:
    """Get the global transcription integration service"""
    global transcription_integration
    
    if not transcription_integration.is_running:
        await transcription_integration.start()
    
    return transcription_integration

# Convenience functions for easy integration with existing pipeline

async def integrate_audio_stream(stream_id: str, 
                                transcription_config: Optional[StreamTranscriptionConfig] = None,
                                enable_video_sync: bool = True) -> bool:
    """
    Convenience function to add transcription to an existing audio stream
    """
    integration = await get_transcription_integration()
    return await integration.create_stream_integration(
        stream_id, transcription_config, enable_video_sync
    )

async def process_pipeline_audio(stream_id: str,
                               audio_data: np.ndarray,
                               sample_rate: int,
                               timestamp: float,
                               network_metrics: Optional[Dict[str, float]] = None) -> bool:
    """
    Convenience function to process audio from the MeetingMind pipeline
    """
    integration = await get_transcription_integration()
    return await integration.process_audio_from_pipeline(
        stream_id, audio_data, sample_rate, timestamp, network_metrics
    )

async def process_pipeline_video(stream_id: str,
                               frame_data: np.ndarray,
                               frame_number: int,
                               timestamp: float) -> bool:
    """
    Convenience function to process video frames from the MeetingMind pipeline
    """
    integration = await get_transcription_integration()
    return await integration.process_video_frame_from_pipeline(
        stream_id, frame_data, frame_number, timestamp
    )

async def remove_audio_stream_integration(stream_id: str) -> bool:
    """
    Convenience function to remove transcription integration from a stream
    """
    integration = await get_transcription_integration()
    return await integration.remove_stream_integration(stream_id)