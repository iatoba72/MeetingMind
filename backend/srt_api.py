"""
SRT Server API Endpoints
Provides REST API for managing the SRT server
"""

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Dict, List, Optional, Any
import logging

from srt_server import (
    get_srt_server,
    start_srt_server,
    stop_srt_server,
    SRTServerConfig,
    SRTStreamInfo,
    SRTServerState,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/srt", tags=["SRT Server"])


class SRTServerConfigRequest(BaseModel):
    port: int = 9998
    max_connections: int = 50
    latency_ms: int = 200
    recv_buffer_size: int = 12058624
    peer_latency_ms: int = 0
    passphrase: Optional[str] = None
    pbkeylen: int = 16
    recording_enabled: bool = False
    recording_path: str = "./recordings"
    enable_stats: bool = True
    timeout_seconds: int = 30
    max_bw: int = -1
    inputbw: int = 0


class SRTServerResponse(BaseModel):
    success: bool
    message: str
    data: Optional[Dict[str, Any]] = None


@router.get("/status", response_model=SRTServerResponse)
async def get_srt_server_status():
    """Get SRT server status and statistics"""
    try:
        server = await get_srt_server()
        stats = server.get_server_stats()

        return SRTServerResponse(
            success=True,
            message="SRT server status retrieved",
            data={"status": stats, "streams": len(server.get_active_streams())},
        )
    except Exception as e:
        logger.error(f"Error getting SRT server status: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/start", response_model=SRTServerResponse)
async def start_srt_server_endpoint(config: Optional[SRTServerConfigRequest] = None):
    """Start the SRT server with optional configuration"""
    try:
        # Convert request to config if provided
        server_config = None
        if config:
            server_config = SRTServerConfig(
                port=config.port,
                max_connections=config.max_connections,
                latency_ms=config.latency_ms,
                recv_buffer_size=config.recv_buffer_size,
                peer_latency_ms=config.peer_latency_ms,
                passphrase=config.passphrase,
                pbkeylen=config.pbkeylen,
                recording_enabled=config.recording_enabled,
                recording_path=config.recording_path,
                enable_stats=config.enable_stats,
                timeout_seconds=config.timeout_seconds,
                max_bw=config.max_bw,
                inputbw=config.inputbw,
            )

        success = await start_srt_server(server_config)

        if success:
            server = await get_srt_server()
            stats = server.get_server_stats()

            return SRTServerResponse(
                success=True,
                message=f"SRT server started on port {server.config.port}",
                data={"status": stats},
            )
        else:
            raise HTTPException(status_code=500, detail="Failed to start SRT server")

    except Exception as e:
        logger.error(f"Error starting SRT server: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/stop", response_model=SRTServerResponse)
async def stop_srt_server_endpoint():
    """Stop the SRT server"""
    try:
        success = await stop_srt_server()

        if success:
            return SRTServerResponse(
                success=True, message="SRT server stopped successfully"
            )
        else:
            raise HTTPException(status_code=500, detail="Failed to stop SRT server")

    except Exception as e:
        logger.error(f"Error stopping SRT server: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/streams", response_model=SRTServerResponse)
async def get_active_streams():
    """Get list of active SRT streams"""
    try:
        server = await get_srt_server()
        active_streams = server.get_active_streams()

        # Convert to serializable format
        streams_data = {}
        for stream_id, stream_info in active_streams.items():
            streams_data[stream_id] = {
                "stream_id": stream_info.stream_id,
                "client_ip": stream_info.client_ip,
                "client_port": stream_info.client_port,
                "stream_name": stream_info.stream_name,
                "state": stream_info.state.value,
                "start_time": stream_info.start_time.isoformat(),
                "last_activity": stream_info.last_activity.isoformat(),
                "bytes_received": stream_info.bytes_received,
                "packets_received": stream_info.packets_received,
                "packets_lost": stream_info.packets_lost,
                "packets_retransmitted": stream_info.packets_retransmitted,
                "rtt_ms": stream_info.rtt_ms,
                "bandwidth_mbps": stream_info.bandwidth_mbps,
                "bitrate_kbps": stream_info.bitrate_kbps,
                "resolution": stream_info.resolution,
                "fps": stream_info.fps,
                "codec": stream_info.codec,
                "audio_codec": stream_info.audio_codec,
                "audio_sample_rate": stream_info.audio_sample_rate,
                "audio_channels": stream_info.audio_channels,
                "duration_seconds": stream_info.duration_seconds,
                "latency_ms": stream_info.latency_ms,
            }

        return SRTServerResponse(
            success=True,
            message=f"Retrieved {len(streams_data)} active streams",
            data={"streams": streams_data},
        )

    except Exception as e:
        logger.error(f"Error getting active streams: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/streams/{stream_id}", response_model=SRTServerResponse)
async def get_stream_info(stream_id: str):
    """Get detailed information about a specific stream"""
    try:
        server = await get_srt_server()
        stream_info = server.get_stream_info(stream_id)

        if not stream_info:
            raise HTTPException(status_code=404, detail=f"Stream {stream_id} not found")

        stream_data = {
            "stream_id": stream_info.stream_id,
            "client_ip": stream_info.client_ip,
            "client_port": stream_info.client_port,
            "stream_name": stream_info.stream_name,
            "state": stream_info.state.value,
            "start_time": stream_info.start_time.isoformat(),
            "last_activity": stream_info.last_activity.isoformat(),
            "bytes_received": stream_info.bytes_received,
            "packets_received": stream_info.packets_received,
            "packets_lost": stream_info.packets_lost,
            "packets_retransmitted": stream_info.packets_retransmitted,
            "rtt_ms": stream_info.rtt_ms,
            "bandwidth_mbps": stream_info.bandwidth_mbps,
            "bitrate_kbps": stream_info.bitrate_kbps,
            "resolution": stream_info.resolution,
            "fps": stream_info.fps,
            "codec": stream_info.codec,
            "audio_codec": stream_info.audio_codec,
            "audio_sample_rate": stream_info.audio_sample_rate,
            "audio_channels": stream_info.audio_channels,
            "duration_seconds": stream_info.duration_seconds,
            "latency_ms": stream_info.latency_ms,
        }

        return SRTServerResponse(
            success=True,
            message=f"Stream information for {stream_id}",
            data={"stream": stream_data},
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting stream info for {stream_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/streams/{stream_id}", response_model=SRTServerResponse)
async def disconnect_stream(stream_id: str):
    """Disconnect a specific SRT stream"""
    try:
        server = await get_srt_server()

        if stream_id not in server.get_active_streams():
            raise HTTPException(status_code=404, detail=f"Stream {stream_id} not found")

        await server._stop_stream(stream_id)

        return SRTServerResponse(
            success=True, message=f"Stream {stream_id} disconnected successfully"
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error disconnecting stream {stream_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/health", response_model=SRTServerResponse)
async def srt_server_health_check():
    """Health check endpoint for SRT server"""
    try:
        server = await get_srt_server()
        stats = server.get_server_stats()

        # Determine health status
        is_healthy = stats["state"] == SRTServerState.RUNNING.value

        health_data = {
            "healthy": is_healthy,
            "state": stats["state"],
            "uptime_seconds": stats["uptime_seconds"],
            "active_streams": len(server.get_active_streams()),
            "total_connections": stats["total_connections"],
            "current_connections": stats["current_connections"],
            "average_latency_ms": stats["average_latency_ms"],
            "average_bandwidth_mbps": stats["average_bandwidth_mbps"],
            "total_packets_lost": stats["total_packets_lost"],
            "total_packets_retransmitted": stats["total_packets_retransmitted"],
        }

        return SRTServerResponse(
            success=True,
            message="SRT server health check completed",
            data={"health": health_data},
        )

    except Exception as e:
        logger.error(f"Error in SRT server health check: {e}")
        return SRTServerResponse(
            success=False,
            message=f"Health check failed: {str(e)}",
            data={"healthy": False},
        )


@router.get("/config", response_model=SRTServerResponse)
async def get_srt_server_config():
    """Get current SRT server configuration"""
    try:
        server = await get_srt_server()
        config_data = {
            "port": server.config.port,
            "max_connections": server.config.max_connections,
            "latency_ms": server.config.latency_ms,
            "recv_buffer_size": server.config.recv_buffer_size,
            "peer_latency_ms": server.config.peer_latency_ms,
            "passphrase": "***" if server.config.passphrase else None,
            "pbkeylen": server.config.pbkeylen,
            "recording_enabled": server.config.recording_enabled,
            "recording_path": server.config.recording_path,
            "enable_stats": server.config.enable_stats,
            "timeout_seconds": server.config.timeout_seconds,
            "max_bw": server.config.max_bw,
            "inputbw": server.config.inputbw,
        }

        return SRTServerResponse(
            success=True,
            message="SRT server configuration retrieved",
            data={"config": config_data},
        )

    except Exception as e:
        logger.error(f"Error getting SRT server config: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/instructions", response_model=SRTServerResponse)
async def get_obs_srt_setup_instructions():
    """Get OBS setup instructions for streaming via SRT to this server"""
    try:
        server = await get_srt_server()

        instructions = {
            "obs_settings": {
                "service": "Custom",
                "server": f"srt://localhost:{server.config.port}",
                "stream_key": "your-stream",
                "use_auth": server.config.passphrase is not None,
                "latency_ms": server.config.latency_ms,
            },
            "recommended_settings": {
                "output_mode": "Advanced",
                "encoder": "x264 or hardware encoder",
                "rate_control": "CBR",
                "bitrate": "2500-6000 kbps",
                "keyframe_interval": "2s",
                "preset": "veryfast to medium",
                "profile": "main",
                "audio_bitrate": "160-320 kbps",
                "audio_sample_rate": "48 kHz",
                "srt_latency": f"{server.config.latency_ms}ms",
            },
            "setup_steps": [
                "Open OBS Studio",
                "Go to Settings → Stream",
                "Set Service to 'Custom'",
                f"Set Server to 'srt://localhost:{server.config.port}'",
                "Set Stream Key to your desired stream name",
                f"Set Latency to {server.config.latency_ms}ms or higher",
                "Apply settings and start streaming",
                "Monitor stream status in MeetingMind dashboard",
            ],
            "advanced_settings": {
                "maxbw": "Set maximum bandwidth limit if needed",
                "inputbw": "Set input bandwidth for better congestion control",
                "passphrase": "Set encryption passphrase for secure streaming",
                "pbkeylen": "Choose key length (16, 24, or 32 for AES-128/192/256)",
            },
            "troubleshooting": {
                "connection_failed": "Check if SRT server is running and port is not blocked",
                "high_latency": "Increase latency setting in OBS and server configuration",
                "packet_loss": "Check network connection and consider reducing bitrate",
                "audio_sync_issues": "Ensure audio sample rate is 48kHz",
                "encryption_errors": "Verify passphrase matches between OBS and server",
            },
        }

        return SRTServerResponse(
            success=True,
            message="OBS SRT setup instructions generated",
            data={"instructions": instructions},
        )

    except Exception as e:
        logger.error(f"Error getting OBS SRT setup instructions: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/statistics", response_model=SRTServerResponse)
async def get_srt_statistics():
    """Get detailed SRT server and stream statistics"""
    try:
        server = await get_srt_server()
        stats = server.get_server_stats()
        active_streams = server.get_active_streams()

        # Calculate detailed statistics
        total_packet_loss_rate = 0
        total_retransmission_rate = 0

        if stats["total_packets_received"] > 0:
            total_packet_loss_rate = (
                stats["total_packets_lost"] / stats["total_packets_received"]
            ) * 100
            total_retransmission_rate = (
                stats["total_packets_retransmitted"] / stats["total_packets_received"]
            ) * 100

        stream_stats = []
        for stream_id, stream_info in active_streams.items():
            packet_loss_rate = 0
            retransmission_rate = 0

            if stream_info.packets_received > 0:
                packet_loss_rate = (
                    stream_info.packets_lost / stream_info.packets_received
                ) * 100
                retransmission_rate = (
                    stream_info.packets_retransmitted / stream_info.packets_received
                ) * 100

            stream_stats.append(
                {
                    "stream_id": stream_id,
                    "state": stream_info.state.value,
                    "duration_seconds": stream_info.duration_seconds,
                    "bitrate_kbps": stream_info.bitrate_kbps,
                    "bandwidth_mbps": stream_info.bandwidth_mbps,
                    "rtt_ms": stream_info.rtt_ms,
                    "latency_ms": stream_info.latency_ms,
                    "packet_loss_rate": packet_loss_rate,
                    "retransmission_rate": retransmission_rate,
                    "packets_received": stream_info.packets_received,
                    "packets_lost": stream_info.packets_lost,
                    "packets_retransmitted": stream_info.packets_retransmitted,
                }
            )

        statistics_data = {
            "server": {
                "state": stats["state"],
                "uptime_seconds": stats["uptime_seconds"],
                "total_connections": stats["total_connections"],
                "current_connections": stats["current_connections"],
                "active_streams": len(active_streams),
                "total_bytes_received": stats["total_bytes_received"],
                "total_packets_received": stats["total_packets_received"],
                "total_packets_lost": stats["total_packets_lost"],
                "total_packets_retransmitted": stats["total_packets_retransmitted"],
                "total_packet_loss_rate": total_packet_loss_rate,
                "total_retransmission_rate": total_retransmission_rate,
                "average_latency_ms": stats["average_latency_ms"],
                "average_bandwidth_mbps": stats["average_bandwidth_mbps"],
            },
            "streams": stream_stats,
        }

        return SRTServerResponse(
            success=True,
            message="SRT server statistics retrieved",
            data={"statistics": statistics_data},
        )

    except Exception as e:
        logger.error(f"Error getting SRT statistics: {e}")
        raise HTTPException(status_code=500, detail=str(e))
