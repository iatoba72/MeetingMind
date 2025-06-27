"""
Stream Recorder API Endpoints
Provides REST API for managing stream recording
"""

from fastapi import APIRouter, HTTPException, Depends, UploadFile, File
from pydantic import BaseModel
from typing import Dict, List, Optional, Any
import logging
import os
from pathlib import Path

from stream_recorder import (
    get_recording_manager, create_recorder, get_recorder,
    RecordingConfig, RecordingFormat, RecordingQuality, RecordingState, AudioChunk
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/recording", tags=["Stream Recording"])

class RecordingConfigRequest(BaseModel):
    output_directory: str = "./recordings"
    filename_template: str = "{source_id}_{timestamp}_{session_id}"
    format: str = "wav"
    quality: str = "high"
    sample_rate: int = 48000
    channels: int = 2
    auto_start: bool = False
    max_file_size_mb: int = 1024
    max_duration_minutes: int = 180
    split_on_silence: bool = False
    silence_threshold_db: float = -40.0
    silence_duration_seconds: float = 5.0
    enable_metadata: bool = True
    compress_on_complete: bool = False
    delete_source_after_compress: bool = False

class AudioChunkRequest(BaseModel):
    timestamp: float
    data: bytes
    sample_rate: int
    channels: int
    source_id: str
    sequence_number: int
    duration_ms: float

class RecordingResponse(BaseModel):
    success: bool
    message: str
    data: Optional[Dict[str, Any]] = None

@router.get("/status", response_model=RecordingResponse)
async def get_recording_status():
    """Get status of all recording sessions"""
    try:
        manager = await get_recording_manager()
        stats = manager.get_manager_statistics()
        
        return RecordingResponse(
            success=True,
            message="Recording status retrieved",
            data={"statistics": stats}
        )
    except Exception as e:
        logger.error(f"Error getting recording status: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/recorders/{source_id}", response_model=RecordingResponse)
async def create_recorder_endpoint(source_id: str, config: Optional[RecordingConfigRequest] = None):
    """Create a new recorder for a source"""
    try:
        # Convert request to config if provided
        recorder_config = None
        if config:
            # Convert string enums to actual enums
            format_mapping = {
                "wav": RecordingFormat.WAV,
                "mp3": RecordingFormat.MP3,
                "aac": RecordingFormat.AAC,
                "flac": RecordingFormat.FLAC,
                "ogg": RecordingFormat.OGG
            }
            
            quality_mapping = {
                "low": RecordingQuality.LOW,
                "medium": RecordingQuality.MEDIUM,
                "high": RecordingQuality.HIGH,
                "lossless": RecordingQuality.LOSSLESS
            }
            
            recorder_config = RecordingConfig(
                output_directory=config.output_directory,
                filename_template=config.filename_template,
                format=format_mapping.get(config.format, RecordingFormat.WAV),
                quality=quality_mapping.get(config.quality, RecordingQuality.HIGH),
                sample_rate=config.sample_rate,
                channels=config.channels,
                auto_start=config.auto_start,
                max_file_size_mb=config.max_file_size_mb,
                max_duration_minutes=config.max_duration_minutes,
                split_on_silence=config.split_on_silence,
                silence_threshold_db=config.silence_threshold_db,
                silence_duration_seconds=config.silence_duration_seconds,
                enable_metadata=config.enable_metadata,
                compress_on_complete=config.compress_on_complete,
                delete_source_after_compress=config.delete_source_after_compress
            )
        
        recorder = await create_recorder(source_id, recorder_config)
        
        # Auto-start if configured
        if recorder_config and recorder_config.auto_start:
            await recorder.start_recording()
        
        stats = recorder.get_statistics()
        
        return RecordingResponse(
            success=True,
            message=f"Recorder created for source {source_id}",
            data={"recorder_stats": stats}
        )
        
    except Exception as e:
        logger.error(f"Error creating recorder for {source_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/recorders/{source_id}", response_model=RecordingResponse)
async def remove_recorder(source_id: str):
    """Remove a recorder"""
    try:
        manager = await get_recording_manager()
        success = await manager.remove_recorder(source_id)
        
        if success:
            return RecordingResponse(
                success=True,
                message=f"Recorder removed for source {source_id}"
            )
        else:
            raise HTTPException(status_code=404, detail=f"Recorder for source {source_id} not found")
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error removing recorder for {source_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/recorders", response_model=RecordingResponse)
async def get_all_recorders():
    """Get list of all recorders"""
    try:
        manager = await get_recording_manager()
        recorders = manager.get_all_recorders()
        
        recorder_info = {}
        for source_id, recorder in recorders.items():
            recorder_info[source_id] = recorder.get_statistics()
        
        return RecordingResponse(
            success=True,
            message=f"Retrieved {len(recorder_info)} recorders",
            data={"recorders": recorder_info}
        )
        
    except Exception as e:
        logger.error(f"Error getting recorders: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/recorders/{source_id}", response_model=RecordingResponse)
async def get_recorder_info(source_id: str):
    """Get information about a specific recorder"""
    try:
        recorder = await get_recorder(source_id)
        
        if not recorder:
            raise HTTPException(status_code=404, detail=f"Recorder for source {source_id} not found")
        
        stats = recorder.get_statistics()
        session_info = recorder.get_session_info()
        
        return RecordingResponse(
            success=True,
            message=f"Recorder information for {source_id}",
            data={
                "recorder_stats": stats,
                "session_info": session_info.__dict__ if session_info else None
            }
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting recorder info for {source_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/recorders/{source_id}/start", response_model=RecordingResponse)
async def start_recording(source_id: str):
    """Start recording for a source"""
    try:
        recorder = await get_recorder(source_id)
        
        if not recorder:
            raise HTTPException(status_code=404, detail=f"Recorder for source {source_id} not found")
        
        success = await recorder.start_recording()
        
        if success:
            stats = recorder.get_statistics()
            return RecordingResponse(
                success=True,
                message=f"Recording started for source {source_id}",
                data={"recorder_stats": stats}
            )
        else:
            raise HTTPException(status_code=400, detail=f"Failed to start recording for source {source_id}")
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error starting recording for {source_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/recorders/{source_id}/stop", response_model=RecordingResponse)
async def stop_recording(source_id: str):
    """Stop recording for a source"""
    try:
        recorder = await get_recorder(source_id)
        
        if not recorder:
            raise HTTPException(status_code=404, detail=f"Recorder for source {source_id} not found")
        
        success = await recorder.stop_recording()
        
        if success:
            stats = recorder.get_statistics()
            session_info = recorder.get_session_info()
            
            return RecordingResponse(
                success=True,
                message=f"Recording stopped for source {source_id}",
                data={
                    "recorder_stats": stats,
                    "session_info": session_info.__dict__ if session_info else None
                }
            )
        else:
            raise HTTPException(status_code=400, detail=f"Failed to stop recording for source {source_id}")
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error stopping recording for {source_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/recorders/{source_id}/pause", response_model=RecordingResponse)
async def pause_recording(source_id: str):
    """Pause recording for a source"""
    try:
        recorder = await get_recorder(source_id)
        
        if not recorder:
            raise HTTPException(status_code=404, detail=f"Recorder for source {source_id} not found")
        
        success = await recorder.pause_recording()
        
        if success:
            stats = recorder.get_statistics()
            return RecordingResponse(
                success=True,
                message=f"Recording paused for source {source_id}",
                data={"recorder_stats": stats}
            )
        else:
            raise HTTPException(status_code=400, detail=f"Failed to pause recording for source {source_id}")
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error pausing recording for {source_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/recorders/{source_id}/resume", response_model=RecordingResponse)
async def resume_recording(source_id: str):
    """Resume recording for a source"""
    try:
        recorder = await get_recorder(source_id)
        
        if not recorder:
            raise HTTPException(status_code=404, detail=f"Recorder for source {source_id} not found")
        
        success = await recorder.resume_recording()
        
        if success:
            stats = recorder.get_statistics()
            return RecordingResponse(
                success=True,
                message=f"Recording resumed for source {source_id}",
                data={"recorder_stats": stats}
            )
        else:
            raise HTTPException(status_code=400, detail=f"Failed to resume recording for source {source_id}")
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error resuming recording for {source_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/recorders/{source_id}/audio", response_model=RecordingResponse)
async def add_audio_chunk(source_id: str, chunk_data: AudioChunkRequest):
    """Add an audio chunk to a recorder (for testing purposes)"""
    try:
        recorder = await get_recorder(source_id)
        
        if not recorder:
            raise HTTPException(status_code=404, detail=f"Recorder for source {source_id} not found")
        
        # Create AudioChunk from request
        chunk = AudioChunk(
            timestamp=chunk_data.timestamp,
            data=chunk_data.data,
            sample_rate=chunk_data.sample_rate,
            channels=chunk_data.channels,
            source_id=chunk_data.source_id,
            sequence_number=chunk_data.sequence_number,
            duration_ms=chunk_data.duration_ms
        )
        
        success = recorder.add_audio_chunk(chunk)
        
        if success:
            stats = recorder.get_statistics()
            return RecordingResponse(
                success=True,
                message=f"Audio chunk added to recorder {source_id}",
                data={"recorder_stats": stats}
            )
        else:
            raise HTTPException(status_code=400, detail="Failed to add audio chunk")
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error adding audio chunk to {source_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/files", response_model=RecordingResponse)
async def list_recording_files(directory: Optional[str] = None):
    """List all recording files"""
    try:
        # Use default recordings directory if not specified
        recordings_dir = directory or "./recordings"
        
        if not os.path.exists(recordings_dir):
            return RecordingResponse(
                success=True,
                message="No recordings directory found",
                data={"files": []}
            )
        
        files = []
        for file_path in Path(recordings_dir).rglob("*"):
            if file_path.is_file() and file_path.suffix in ['.wav', '.mp3', '.aac', '.flac', '.ogg']:
                stat = file_path.stat()
                files.append({
                    "filename": file_path.name,
                    "path": str(file_path),
                    "size_bytes": stat.st_size,
                    "created_time": stat.st_ctime,
                    "modified_time": stat.st_mtime,
                    "extension": file_path.suffix
                })
        
        # Sort by creation time (newest first)
        files.sort(key=lambda x: x["created_time"], reverse=True)
        
        return RecordingResponse(
            success=True,
            message=f"Found {len(files)} recording files",
            data={"files": files, "directory": recordings_dir}
        )
        
    except Exception as e:
        logger.error(f"Error listing recording files: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/files/{filename}", response_model=RecordingResponse)
async def delete_recording_file(filename: str, directory: Optional[str] = None):
    """Delete a recording file"""
    try:
        recordings_dir = directory or "./recordings"
        file_path = os.path.join(recordings_dir, filename)
        
        if not os.path.exists(file_path):
            raise HTTPException(status_code=404, detail=f"File {filename} not found")
        
        # Security check - ensure file is within recordings directory
        real_path = os.path.realpath(file_path)
        real_recordings_dir = os.path.realpath(recordings_dir)
        
        if not real_path.startswith(real_recordings_dir):
            raise HTTPException(status_code=403, detail="Access denied")
        
        os.unlink(file_path)
        
        # Also delete metadata file if it exists
        metadata_file = os.path.splitext(file_path)[0] + '.json'
        if os.path.exists(metadata_file):
            os.unlink(metadata_file)
        
        return RecordingResponse(
            success=True,
            message=f"File {filename} deleted successfully"
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting file {filename}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/files/{filename}/metadata", response_model=RecordingResponse)
async def get_file_metadata(filename: str, directory: Optional[str] = None):
    """Get metadata for a recording file"""
    try:
        recordings_dir = directory or "./recordings"
        metadata_file = os.path.join(recordings_dir, os.path.splitext(filename)[0] + '.json')
        
        if not os.path.exists(metadata_file):
            raise HTTPException(status_code=404, detail=f"Metadata for {filename} not found")
        
        with open(metadata_file, 'r') as f:
            metadata = json.load(f)
        
        return RecordingResponse(
            success=True,
            message=f"Metadata retrieved for {filename}",
            data={"metadata": metadata}
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting metadata for {filename}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/statistics", response_model=RecordingResponse)
async def get_recording_statistics():
    """Get comprehensive recording statistics"""
    try:
        manager = await get_recording_manager()
        stats = manager.get_manager_statistics()
        
        # Calculate additional metrics
        total_recording_time = 0
        active_sessions = []
        
        for source_id, recorder_stats in stats["recorders"].items():
            session_info = recorder_stats.get("session_info")
            if session_info:
                total_recording_time += session_info.get("duration_seconds", 0)
                
                if recorder_stats.get("state") == "recording":
                    active_sessions.append({
                        "source_id": source_id,
                        "session_id": session_info.get("session_id"),
                        "start_time": session_info.get("start_time"),
                        "duration": session_info.get("duration_seconds", 0)
                    })
        
        enhanced_stats = {
            **stats,
            "total_recording_time_seconds": total_recording_time,
            "active_sessions": active_sessions,
            "recording_efficiency": (stats["active_recordings"] / max(stats["total_recorders"], 1)) * 100
        }
        
        return RecordingResponse(
            success=True,
            message="Recording statistics retrieved",
            data={"statistics": enhanced_stats}
        )
        
    except Exception as e:
        logger.error(f"Error getting recording statistics: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/stop-all", response_model=RecordingResponse)
async def stop_all_recordings():
    """Stop all active recordings"""
    try:
        manager = await get_recording_manager()
        await manager.stop_all_recordings()
        
        return RecordingResponse(
            success=True,
            message="All recordings stopped"
        )
        
    except Exception as e:
        logger.error(f"Error stopping all recordings: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/formats", response_model=RecordingResponse)
async def get_supported_formats():
    """Get list of supported recording formats and qualities"""
    try:
        formats = [format.value for format in RecordingFormat]
        qualities = [quality.value for quality in RecordingQuality]
        
        format_info = {
            "wav": {"description": "Uncompressed PCM audio", "lossless": True},
            "mp3": {"description": "MPEG-1 Audio Layer 3", "lossless": False},
            "aac": {"description": "Advanced Audio Coding", "lossless": False},
            "flac": {"description": "Free Lossless Audio Codec", "lossless": True},
            "ogg": {"description": "Ogg Vorbis", "lossless": False}
        }
        
        quality_info = {
            "low": {"bitrate": "64 kbps", "description": "Low quality, small file size"},
            "medium": {"bitrate": "128 kbps", "description": "Good quality, balanced"},
            "high": {"bitrate": "256 kbps", "description": "High quality, larger files"},
            "lossless": {"bitrate": "Variable", "description": "Best quality, largest files"}
        }
        
        return RecordingResponse(
            success=True,
            message="Supported formats and qualities retrieved",
            data={
                "formats": formats,
                "qualities": qualities,
                "format_info": format_info,
                "quality_info": quality_info
            }
        )
        
    except Exception as e:
        logger.error(f"Error getting supported formats: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/health", response_model=RecordingResponse)
async def recording_health_check():
    """Health check endpoint for recording system"""
    try:
        manager = await get_recording_manager()
        stats = manager.get_manager_statistics()
        
        # Check system health
        health_issues = []
        
        # Check if recordings directory is writable
        try:
            test_file = os.path.join("./recordings", ".write_test")
            with open(test_file, 'w') as f:
                f.write("test")
            os.unlink(test_file)
        except Exception:
            health_issues.append("Recordings directory is not writable")
        
        # Check for failed recorders
        failed_recorders = []
        for source_id, recorder_stats in stats["recorders"].items():
            if recorder_stats.get("state") == "error":
                failed_recorders.append(source_id)
        
        if failed_recorders:
            health_issues.append(f"Failed recorders: {', '.join(failed_recorders)}")
        
        is_healthy = len(health_issues) == 0
        
        health_data = {
            "healthy": is_healthy,
            "total_recorders": stats["total_recorders"],
            "active_recordings": stats["active_recordings"],
            "issues": health_issues,
            "failed_recorders": failed_recorders
        }
        
        return RecordingResponse(
            success=True,
            message="Recording system health check completed",
            data={"health": health_data, "statistics": stats}
        )
        
    except Exception as e:
        logger.error(f"Error in recording health check: {e}")
        return RecordingResponse(
            success=False,
            message=f"Health check failed: {str(e)}",
            data={"healthy": False}
        )

# Import json for metadata operations
import json