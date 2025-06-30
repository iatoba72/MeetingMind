"""
RTMP Server API Endpoints
Provides REST API for managing the RTMP server
"""

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Dict, List, Optional, Any
import logging

from rtmp_server import (
    get_rtmp_server,
    start_rtmp_server,
    stop_rtmp_server,
    RTMPServerConfig,
    RTMPStreamInfo,
    RTMPServerState,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/rtmp", tags=["RTMP Server"])


class RTMPServerConfigRequest(BaseModel):
    port: int = 1935
    max_connections: int = 100
    chunk_size: int = 4096
    timeout_seconds: int = 30
    enable_authentication: bool = False
    allowed_apps: Optional[List[str]] = None
    recording_enabled: bool = False
    recording_path: str = "./recordings"
    enable_relay: bool = False
    relay_targets: Optional[List[str]] = None
    buffer_size_ms: int = 2000
    enable_stats: bool = True


class RTMPServerResponse(BaseModel):
    success: bool
    message: str
    data: Optional[Dict[str, Any]] = None


@router.get("/status", response_model=RTMPServerResponse)
async def get_rtmp_server_status():
    """Get RTMP server status and statistics"""
    try:
        server = await get_rtmp_server()
        stats = server.get_server_stats()

        return RTMPServerResponse(
            success=True,
            message="RTMP server status retrieved",
            data={"status": stats, "streams": len(server.get_active_streams())},
        )
    except Exception as e:
        logger.error(f"Error getting RTMP server status: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/start", response_model=RTMPServerResponse)
async def start_rtmp_server_endpoint(config: Optional[RTMPServerConfigRequest] = None):
    """Start the RTMP server with optional configuration"""
    try:
        # Convert request to config if provided
        server_config = None
        if config:
            server_config = RTMPServerConfig(
                port=config.port,
                max_connections=config.max_connections,
                chunk_size=config.chunk_size,
                timeout_seconds=config.timeout_seconds,
                enable_authentication=config.enable_authentication,
                allowed_apps=config.allowed_apps or ["live"],
                recording_enabled=config.recording_enabled,
                recording_path=config.recording_path,
                enable_relay=config.enable_relay,
                relay_targets=config.relay_targets or [],
                buffer_size_ms=config.buffer_size_ms,
                enable_stats=config.enable_stats,
            )

        success = await start_rtmp_server(server_config)

        if success:
            server = await get_rtmp_server()
            stats = server.get_server_stats()

            return RTMPServerResponse(
                success=True,
                message=f"RTMP server started on port {server.config.port}",
                data={"status": stats},
            )
        else:
            raise HTTPException(status_code=500, detail="Failed to start RTMP server")

    except Exception as e:
        logger.error(f"Error starting RTMP server: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/stop", response_model=RTMPServerResponse)
async def stop_rtmp_server_endpoint():
    """Stop the RTMP server"""
    try:
        success = await stop_rtmp_server()

        if success:
            return RTMPServerResponse(
                success=True, message="RTMP server stopped successfully"
            )
        else:
            raise HTTPException(status_code=500, detail="Failed to stop RTMP server")

    except Exception as e:
        logger.error(f"Error stopping RTMP server: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/streams", response_model=RTMPServerResponse)
async def get_active_streams():
    """Get list of active RTMP streams"""
    try:
        server = await get_rtmp_server()
        active_streams = server.get_active_streams()

        # Convert to serializable format
        streams_data = {}
        for stream_key, stream_info in active_streams.items():
            streams_data[stream_key] = {
                "stream_key": stream_info.stream_key,
                "client_ip": stream_info.client_ip,
                "client_port": stream_info.client_port,
                "app_name": stream_info.app_name,
                "stream_name": stream_info.stream_name,
                "state": stream_info.state.value,
                "start_time": stream_info.start_time.isoformat(),
                "last_activity": stream_info.last_activity.isoformat(),
                "bytes_received": stream_info.bytes_received,
                "frames_received": stream_info.frames_received,
                "bitrate_kbps": stream_info.bitrate_kbps,
                "resolution": stream_info.resolution,
                "fps": stream_info.fps,
                "codec": stream_info.codec,
                "audio_codec": stream_info.audio_codec,
                "audio_sample_rate": stream_info.audio_sample_rate,
                "audio_channels": stream_info.audio_channels,
                "duration_seconds": stream_info.duration_seconds,
            }

        return RTMPServerResponse(
            success=True,
            message=f"Retrieved {len(streams_data)} active streams",
            data={"streams": streams_data},
        )

    except Exception as e:
        logger.error(f"Error getting active streams: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/streams/{stream_key}", response_model=RTMPServerResponse)
async def get_stream_info(stream_key: str):
    """Get detailed information about a specific stream"""
    try:
        server = await get_rtmp_server()
        stream_info = server.get_stream_info(stream_key)

        if not stream_info:
            raise HTTPException(
                status_code=404, detail=f"Stream {stream_key} not found"
            )

        stream_data = {
            "stream_key": stream_info.stream_key,
            "client_ip": stream_info.client_ip,
            "client_port": stream_info.client_port,
            "app_name": stream_info.app_name,
            "stream_name": stream_info.stream_name,
            "state": stream_info.state.value,
            "start_time": stream_info.start_time.isoformat(),
            "last_activity": stream_info.last_activity.isoformat(),
            "bytes_received": stream_info.bytes_received,
            "frames_received": stream_info.frames_received,
            "bitrate_kbps": stream_info.bitrate_kbps,
            "resolution": stream_info.resolution,
            "fps": stream_info.fps,
            "codec": stream_info.codec,
            "audio_codec": stream_info.audio_codec,
            "audio_sample_rate": stream_info.audio_sample_rate,
            "audio_channels": stream_info.audio_channels,
            "duration_seconds": stream_info.duration_seconds,
        }

        return RTMPServerResponse(
            success=True,
            message=f"Stream information for {stream_key}",
            data={"stream": stream_data},
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting stream info for {stream_key}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/streams/{stream_key}", response_model=RTMPServerResponse)
async def disconnect_stream(stream_key: str):
    """Disconnect a specific RTMP stream"""
    try:
        server = await get_rtmp_server()

        if stream_key not in server.get_active_streams():
            raise HTTPException(
                status_code=404, detail=f"Stream {stream_key} not found"
            )

        await server._stop_stream(stream_key)

        return RTMPServerResponse(
            success=True, message=f"Stream {stream_key} disconnected successfully"
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error disconnecting stream {stream_key}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/health", response_model=RTMPServerResponse)
async def rtmp_server_health_check():
    """Health check endpoint for RTMP server"""
    try:
        server = await get_rtmp_server()
        stats = server.get_server_stats()

        # Determine health status
        is_healthy = stats["state"] == RTMPServerState.RUNNING.value

        health_data = {
            "healthy": is_healthy,
            "state": stats["state"],
            "uptime_seconds": stats["uptime_seconds"],
            "active_streams": len(server.get_active_streams()),
            "total_connections": stats["total_connections"],
            "current_connections": stats["current_connections"],
        }

        return RTMPServerResponse(
            success=True,
            message="RTMP server health check completed",
            data={"health": health_data},
        )

    except Exception as e:
        logger.error(f"Error in RTMP server health check: {e}")
        return RTMPServerResponse(
            success=False,
            message=f"Health check failed: {str(e)}",
            data={"healthy": False},
        )


@router.get("/config", response_model=RTMPServerResponse)
async def get_rtmp_server_config():
    """Get current RTMP server configuration"""
    try:
        server = await get_rtmp_server()
        config_data = {
            "port": server.config.port,
            "max_connections": server.config.max_connections,
            "chunk_size": server.config.chunk_size,
            "timeout_seconds": server.config.timeout_seconds,
            "enable_authentication": server.config.enable_authentication,
            "allowed_apps": server.config.allowed_apps,
            "recording_enabled": server.config.recording_enabled,
            "recording_path": server.config.recording_path,
            "enable_relay": server.config.enable_relay,
            "relay_targets": server.config.relay_targets,
            "buffer_size_ms": server.config.buffer_size_ms,
            "enable_stats": server.config.enable_stats,
        }

        return RTMPServerResponse(
            success=True,
            message="RTMP server configuration retrieved",
            data={"config": config_data},
        )

    except Exception as e:
        logger.error(f"Error getting RTMP server config: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/instructions", response_model=RTMPServerResponse)
async def get_obs_setup_instructions():
    """Get OBS setup instructions for streaming to this RTMP server"""
    try:
        server = await get_rtmp_server()

        instructions = {
            "obs_settings": {
                "service": "Custom",
                "server": f"rtmp://localhost:{server.config.port}/live",
                "stream_key": "your-stream-name",
                "use_authentication": server.config.enable_authentication,
            },
            "recommended_settings": {
                "output_mode": "Advanced",
                "encoder": "x264 or hardware encoder",
                "rate_control": "CBR",
                "bitrate": "2500-4000 kbps",
                "keyframe_interval": "2s",
                "preset": "veryfast to medium",
                "profile": "main",
                "audio_bitrate": "160-320 kbps",
                "audio_sample_rate": "44.1 kHz",
            },
            "setup_steps": [
                "Open OBS Studio",
                "Go to Settings → Stream",
                "Set Service to 'Custom'",
                f"Set Server to 'rtmp://localhost:{server.config.port}/live'",
                "Set Stream Key to your desired stream name",
                "Apply settings and start streaming",
                "Monitor stream status in MeetingMind dashboard",
            ],
            "troubleshooting": {
                "connection_failed": "Check if RTMP server is running and port is not blocked",
                "high_cpu_usage": "Use hardware encoder (NVENC/AMF/QuickSync) instead of x264",
                "dropped_frames": "Reduce bitrate or check network connection",
                "audio_issues": "Ensure audio sample rate is 44.1kHz or 48kHz",
            },
        }

        return RTMPServerResponse(
            success=True,
            message="OBS setup instructions generated",
            data={"instructions": instructions},
        )

    except Exception as e:
        logger.error(f"Error getting OBS setup instructions: {e}")
        raise HTTPException(status_code=500, detail=str(e))
