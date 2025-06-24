"""
Network Transcription API Endpoints
REST API for stream-aware transcription with network audio support
"""

from fastapi import APIRouter, HTTPException, BackgroundTasks, WebSocket, WebSocketDisconnect
from pydantic import BaseModel
from typing import Dict, List, Optional, Any
import logging
import asyncio
import json
from datetime import datetime

from network_transcription_service import (
    NetworkTranscriptionService, get_network_transcription_service,
    StreamTranscriptionConfig, TranscriptionSegment, NetworkAudioChunk
)
from video_transcription_sync import (
    VideoTranscriptionSyncService, get_video_transcription_sync_service,
    StreamSyncConfig, SyncedTranscriptionSegment
)
from stream_vad import AudioQualityMetrics

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/network-transcription", tags=["Network Transcription"])

class TranscriptionResponse(BaseModel):
    success: bool
    message: str
    data: Optional[Dict[str, Any]] = None

class StreamConfigRequest(BaseModel):
    model_size: Optional[str] = "base"
    language: Optional[str] = None
    task: Optional[str] = "transcribe"
    latency_mode: Optional[str] = "balanced"
    adaptive_model_selection: Optional[bool] = True
    chunk_duration_s: Optional[float] = 30.0
    max_concurrent_streams: Optional[int] = 4

class AudioChunkRequest(BaseModel):
    stream_id: str
    audio_data: List[float]  # Audio samples as float array
    timestamp: float
    sample_rate: int
    sequence_number: Optional[int] = 0
    quality_metrics: Optional[Dict[str, float]] = None

class VideoFrameRequest(BaseModel):
    stream_id: str
    frame_data: str  # Base64 encoded frame data
    timestamp: float
    frame_number: int

class SyncConfigRequest(BaseModel):
    max_audio_video_drift_ms: Optional[float] = 100.0
    enable_visual_cues: Optional[bool] = True
    adaptive_sync: Optional[bool] = True
    jitter_compensation: Optional[bool] = True

# WebSocket connection manager for real-time transcription
class TranscriptionConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, List[WebSocket]] = {}
    
    async def connect(self, websocket: WebSocket, stream_id: str):
        await websocket.accept()
        if stream_id not in self.active_connections:
            self.active_connections[stream_id] = []
        self.active_connections[stream_id].append(websocket)
        logger.info(f"WebSocket connected for stream {stream_id}")
    
    def disconnect(self, websocket: WebSocket, stream_id: str):
        if stream_id in self.active_connections:
            self.active_connections[stream_id].remove(websocket)
            if not self.active_connections[stream_id]:
                del self.active_connections[stream_id]
        logger.info(f"WebSocket disconnected for stream {stream_id}")
    
    async def broadcast_transcription(self, stream_id: str, segment: TranscriptionSegment):
        if stream_id in self.active_connections:
            message = {
                "type": "transcription",
                "stream_id": stream_id,
                "segment": {
                    "id": segment.id,
                    "text": segment.text,
                    "start_time": segment.start_time,
                    "end_time": segment.end_time,
                    "confidence": segment.confidence,
                    "language": segment.language,
                    "audio_quality": segment.audio_quality,
                    "model_used": segment.model_used,
                    "processing_latency_ms": segment.processing_latency_ms,
                    "timestamp": segment.timestamp.isoformat()
                }
            }
            
            # Send to all connected clients for this stream
            disconnected = []
            for connection in self.active_connections[stream_id]:
                try:
                    await connection.send_text(json.dumps(message))
                except:
                    disconnected.append(connection)
            
            # Remove disconnected clients
            for conn in disconnected:
                self.disconnect(conn, stream_id)

connection_manager = TranscriptionConnectionManager()

@router.post("/streams/{stream_id}/create", response_model=TranscriptionResponse)
async def create_transcription_stream(
    stream_id: str,
    config: StreamConfigRequest,
    background_tasks: BackgroundTasks
):
    """Create a new transcription stream"""
    try:
        # Create transcription config
        transcription_config = StreamTranscriptionConfig(
            model_size=config.model_size,
            language=config.language,
            task=config.task,
            latency_mode=config.latency_mode,
            adaptive_model_selection=config.adaptive_model_selection,
            chunk_duration_s=config.chunk_duration_s,
            max_concurrent_streams=config.max_concurrent_streams
        )
        
        # Get transcription service
        service = await get_network_transcription_service(transcription_config)
        
        # Create stream
        success = service.create_stream(stream_id, transcription_config)
        
        if not success:
            raise HTTPException(status_code=400, detail=f"Failed to create stream {stream_id}")
        
        # Create sync service
        sync_service = await get_video_transcription_sync_service()
        sync_service.create_stream_sync(stream_id)
        
        return TranscriptionResponse(
            success=True,
            message=f"Transcription stream {stream_id} created successfully",
            data={
                "stream_id": stream_id,
                "config": transcription_config.__dict__
            }
        )
        
    except Exception as e:
        logger.error(f"Error creating transcription stream {stream_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/streams/{stream_id}", response_model=TranscriptionResponse)
async def remove_transcription_stream(stream_id: str):
    """Remove transcription stream"""
    try:
        service = await get_network_transcription_service()
        sync_service = await get_video_transcription_sync_service()
        
        # Remove from both services
        transcription_removed = service.remove_stream(stream_id)
        sync_removed = sync_service.remove_stream_sync(stream_id)
        
        if not transcription_removed:
            raise HTTPException(status_code=404, detail=f"Stream {stream_id} not found")
        
        return TranscriptionResponse(
            success=True,
            message=f"Transcription stream {stream_id} removed successfully"
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error removing transcription stream {stream_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/streams/{stream_id}/audio", response_model=TranscriptionResponse)
async def process_audio_chunk(stream_id: str, request: AudioChunkRequest):
    """Process audio chunk for transcription"""
    try:
        service = await get_network_transcription_service()
        
        # Convert quality metrics
        quality_metrics = None
        if request.quality_metrics:
            quality_metrics = AudioQualityMetrics(
                snr_db=request.quality_metrics.get("snr_db", 20.0),
                thd_percent=request.quality_metrics.get("thd_percent", 1.0),
                packet_loss_percent=request.quality_metrics.get("packet_loss", 0.0),
                jitter_ms=request.quality_metrics.get("jitter_ms", 0.0),
                bitrate_kbps=request.quality_metrics.get("bitrate_kbps", 128.0),
                sample_rate=request.sample_rate,
                overall_quality=request.quality_metrics.get("overall_quality", 0.8)
            )
        
        # Create audio chunk
        import numpy as np
        audio_chunk = NetworkAudioChunk(
            stream_id=stream_id,
            audio_data=np.array(request.audio_data, dtype=np.float32),
            timestamp=request.timestamp,
            sample_rate=request.sample_rate,
            quality_metrics=quality_metrics,
            sequence_number=request.sequence_number
        )
        
        # Process chunk
        success = await service.process_audio_chunk(audio_chunk)
        
        if not success:
            raise HTTPException(status_code=400, detail=f"Failed to process audio for stream {stream_id}")
        
        return TranscriptionResponse(
            success=True,
            message="Audio chunk processed successfully",
            data={
                "stream_id": stream_id,
                "timestamp": request.timestamp,
                "processed": True
            }
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error processing audio chunk for stream {stream_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/streams/{stream_id}/video", response_model=TranscriptionResponse)
async def process_video_frame(stream_id: str, request: VideoFrameRequest):
    """Process video frame for synchronization"""
    try:
        sync_service = await get_video_transcription_sync_service()
        synchronizer = sync_service.get_synchronizer(stream_id)
        
        if not synchronizer:
            raise HTTPException(status_code=404, detail=f"Stream synchronizer {stream_id} not found")
        
        # Decode frame data (would implement base64 decoding)
        # For now, create dummy frame
        import numpy as np
        dummy_frame = np.zeros((480, 640, 3), dtype=np.uint8)
        
        # Process frame
        video_timestamp = synchronizer.add_video_frame(
            dummy_frame, request.timestamp, request.frame_number
        )
        
        return TranscriptionResponse(
            success=True,
            message="Video frame processed successfully",
            data={
                "stream_id": stream_id,
                "frame_number": request.frame_number,
                "timestamp": request.timestamp,
                "estimated_fps": video_timestamp.frame_rate
            }
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error processing video frame for stream {stream_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/streams/{stream_id}/statistics", response_model=TranscriptionResponse)
async def get_stream_statistics(stream_id: str):
    """Get statistics for transcription stream"""
    try:
        service = await get_network_transcription_service()
        sync_service = await get_video_transcription_sync_service()
        
        # Get statistics from both services
        transcription_stats = service.get_stream_statistics(stream_id)
        sync_stats = sync_service.get_stream_statistics(stream_id)
        
        return TranscriptionResponse(
            success=True,
            message=f"Statistics retrieved for stream {stream_id}",
            data={
                "stream_id": stream_id,
                "transcription": transcription_stats,
                "synchronization": sync_stats
            }
        )
        
    except Exception as e:
        logger.error(f"Error getting statistics for stream {stream_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/statistics/global", response_model=TranscriptionResponse)
async def get_global_statistics():
    """Get global transcription statistics"""
    try:
        service = await get_network_transcription_service()
        sync_service = await get_video_transcription_sync_service()
        
        transcription_stats = service.get_global_statistics()
        sync_stats = sync_service.get_global_statistics()
        
        return TranscriptionResponse(
            success=True,
            message="Global statistics retrieved",
            data={
                "transcription": transcription_stats,
                "synchronization": sync_stats
            }
        )
        
    except Exception as e:
        logger.error(f"Error getting global statistics: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/streams/{stream_id}/resync", response_model=TranscriptionResponse)
async def resync_stream(
    stream_id: str,
    reference_timestamp: float,
    video_frame_number: Optional[int] = None
):
    """Resync stream with reference timestamp"""
    try:
        service = await get_network_transcription_service()
        sync_service = await get_video_transcription_sync_service()
        
        # Resync transcription service
        await service.resync_stream(stream_id, reference_timestamp)
        
        # Resync video synchronization if frame number provided
        if video_frame_number is not None:
            synchronizer = sync_service.get_synchronizer(stream_id)
            if synchronizer:
                synchronizer.resync_streams(reference_timestamp, video_frame_number)
        
        return TranscriptionResponse(
            success=True,
            message=f"Stream {stream_id} resynced successfully",
            data={
                "stream_id": stream_id,
                "reference_timestamp": reference_timestamp,
                "video_frame_number": video_frame_number
            }
        )
        
    except Exception as e:
        logger.error(f"Error resyncing stream {stream_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/streams/{stream_id}/transcription/{frame_number}", response_model=TranscriptionResponse)
async def get_transcription_at_frame(stream_id: str, frame_number: int):
    """Get transcription active at specific video frame"""
    try:
        sync_service = await get_video_transcription_sync_service()
        synchronizer = sync_service.get_synchronizer(stream_id)
        
        if not synchronizer:
            raise HTTPException(status_code=404, detail=f"Stream synchronizer {stream_id} not found")
        
        synced_segment = synchronizer.get_transcription_at_frame(frame_number)
        
        if not synced_segment:
            return TranscriptionResponse(
                success=True,
                message="No transcription found at specified frame",
                data=None
            )
        
        return TranscriptionResponse(
            success=True,
            message="Transcription retrieved for frame",
            data={
                "stream_id": stream_id,
                "frame_number": frame_number,
                "transcription": {
                    "text": synced_segment.transcription.text,
                    "start_time": synced_segment.transcription.start_time,
                    "end_time": synced_segment.transcription.end_time,
                    "confidence": synced_segment.transcription.confidence,
                    "sync_confidence": synced_segment.sync_confidence,
                    "video_start_frame": synced_segment.video_start_frame,
                    "video_end_frame": synced_segment.video_end_frame
                }
            }
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting transcription at frame {frame_number} for stream {stream_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/streams/{stream_id}/search", response_model=TranscriptionResponse)
async def search_transcription_by_text(stream_id: str, text: str):
    """Search for video frames containing specific text"""
    try:
        sync_service = await get_video_transcription_sync_service()
        synchronizer = sync_service.get_synchronizer(stream_id)
        
        if not synchronizer:
            raise HTTPException(status_code=404, detail=f"Stream synchronizer {stream_id} not found")
        
        matches = synchronizer.get_video_frames_for_text(text)
        
        return TranscriptionResponse(
            success=True,
            message=f"Found {len(matches)} matches for text search",
            data={
                "stream_id": stream_id,
                "search_text": text,
                "matches": [
                    {
                        "start_frame": match[0],
                        "end_frame": match[1],
                        "confidence": match[2]
                    }
                    for match in matches
                ]
            }
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error searching transcription for stream {stream_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.websocket("/streams/{stream_id}/ws")
async def websocket_transcription_endpoint(websocket: WebSocket, stream_id: str):
    """WebSocket endpoint for real-time transcription updates"""
    await connection_manager.connect(websocket, stream_id)
    
    try:
        while True:
            # Keep connection alive and handle any client messages
            data = await websocket.receive_text()
            message = json.loads(data)
            
            # Handle different message types
            if message.get("type") == "ping":
                await websocket.send_text(json.dumps({"type": "pong"}))
            elif message.get("type") == "get_status":
                # Send current stream status
                service = await get_network_transcription_service()
                stats = service.get_stream_statistics(stream_id)
                
                response = {
                    "type": "status",
                    "stream_id": stream_id,
                    "statistics": stats
                }
                await websocket.send_text(json.dumps(response))
            
    except WebSocketDisconnect:
        connection_manager.disconnect(websocket, stream_id)
    except Exception as e:
        logger.error(f"WebSocket error for stream {stream_id}: {e}")
        connection_manager.disconnect(websocket, stream_id)

@router.get("/models/available", response_model=TranscriptionResponse)
async def get_available_models():
    """Get list of available Whisper models"""
    try:
        models = [
            {
                "name": "tiny",
                "size_mb": 39,
                "speed": "fastest",
                "quality": "lowest",
                "recommended_for": ["real-time", "low-power", "testing"]
            },
            {
                "name": "base",
                "size_mb": 74,
                "speed": "fast",
                "quality": "good",
                "recommended_for": ["balanced", "general-purpose"]
            },
            {
                "name": "small",
                "size_mb": 244,
                "speed": "medium",
                "quality": "better",
                "recommended_for": ["quality", "streaming"]
            },
            {
                "name": "medium",
                "size_mb": 769,
                "speed": "slow",
                "quality": "high",
                "recommended_for": ["accuracy", "production"]
            },
            {
                "name": "large-v2",
                "size_mb": 1550,
                "speed": "slowest",
                "quality": "highest",
                "recommended_for": ["maximum-accuracy", "post-processing"]
            },
            {
                "name": "large-v3",
                "size_mb": 1550,
                "speed": "slowest",
                "quality": "highest",
                "recommended_for": ["latest-features", "maximum-accuracy"]
            }
        ]
        
        return TranscriptionResponse(
            success=True,
            message="Available models retrieved",
            data={"models": models}
        )
        
    except Exception as e:
        logger.error(f"Error getting available models: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/health", response_model=TranscriptionResponse)
async def health_check():
    """Health check for transcription service"""
    try:
        # Check if services are running
        try:
            service = await get_network_transcription_service()
            is_transcription_healthy = service.is_running
        except:
            is_transcription_healthy = False
        
        try:
            sync_service = await get_video_transcription_sync_service()
            is_sync_healthy = sync_service.is_running
        except:
            is_sync_healthy = False
        
        overall_health = is_transcription_healthy and is_sync_healthy
        
        return TranscriptionResponse(
            success=overall_health,
            message="Health check completed",
            data={
                "transcription_service": is_transcription_healthy,
                "sync_service": is_sync_healthy,
                "overall_health": overall_health,
                "timestamp": datetime.now().isoformat()
            }
        )
        
    except Exception as e:
        logger.error(f"Health check error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# Custom transcription result publisher (integrates with WebSocket manager)
class TranscriptionPublisher:
    """Publishes transcription results to WebSocket clients"""
    
    def __init__(self, connection_manager: TranscriptionConnectionManager):
        self.connection_manager = connection_manager
    
    async def publish_segment(self, segment: TranscriptionSegment):
        """Publish transcription segment to WebSocket clients"""
        await self.connection_manager.broadcast_transcription(
            segment.stream_id, segment
        )

# Global publisher instance
transcription_publisher = TranscriptionPublisher(connection_manager)