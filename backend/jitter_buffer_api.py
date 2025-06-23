"""
Jitter Buffer API Endpoints
Provides REST API for managing network jitter buffers
"""

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Dict, List, Optional, Any
import logging

from jitter_buffer import (
    get_jitter_buffer_manager, create_jitter_buffer, get_jitter_buffer,
    JitterBufferConfig, AudioPacket, BufferState, PacketState
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/jitter-buffer", tags=["Jitter Buffer"])

class JitterBufferConfigRequest(BaseModel):
    target_delay_ms: int = 150
    min_delay_ms: int = 50
    max_delay_ms: int = 500
    adaptive_sizing: bool = True
    packet_timeout_ms: int = 1000
    max_buffer_packets: int = 1000
    playout_interval_ms: int = 20
    loss_concealment: bool = True
    late_packet_threshold_ms: int = 100
    statistics_window_size: int = 100

class AudioPacketRequest(BaseModel):
    sequence_number: int
    timestamp: float
    data: bytes
    source_id: str
    sample_rate: int
    channels: int
    duration_ms: float

class JitterBufferResponse(BaseModel):
    success: bool
    message: str
    data: Optional[Dict[str, Any]] = None

@router.get("/status", response_model=JitterBufferResponse)
async def get_jitter_buffer_status():
    """Get status of all jitter buffers"""
    try:
        manager = await get_jitter_buffer_manager()
        stats = manager.get_manager_statistics()
        
        return JitterBufferResponse(
            success=True,
            message="Jitter buffer status retrieved",
            data={"statistics": stats}
        )
    except Exception as e:
        logger.error(f"Error getting jitter buffer status: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/buffers/{source_id}", response_model=JitterBufferResponse)
async def create_jitter_buffer_endpoint(source_id: str, config: Optional[JitterBufferConfigRequest] = None):
    """Create a new jitter buffer for a source"""
    try:
        # Convert request to config if provided
        buffer_config = None
        if config:
            buffer_config = JitterBufferConfig(
                target_delay_ms=config.target_delay_ms,
                min_delay_ms=config.min_delay_ms,
                max_delay_ms=config.max_delay_ms,
                adaptive_sizing=config.adaptive_sizing,
                packet_timeout_ms=config.packet_timeout_ms,
                max_buffer_packets=config.max_buffer_packets,
                playout_interval_ms=config.playout_interval_ms,
                loss_concealment=config.loss_concealment,
                late_packet_threshold_ms=config.late_packet_threshold_ms,
                statistics_window_size=config.statistics_window_size
            )
        
        buffer = await create_jitter_buffer(source_id, buffer_config)
        status = buffer.get_buffer_status()
        
        return JitterBufferResponse(
            success=True,
            message=f"Jitter buffer created for source {source_id}",
            data={"buffer_status": status}
        )
        
    except Exception as e:
        logger.error(f"Error creating jitter buffer for {source_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/buffers/{source_id}", response_model=JitterBufferResponse)
async def remove_jitter_buffer(source_id: str):
    """Remove a jitter buffer"""
    try:
        manager = await get_jitter_buffer_manager()
        success = await manager.remove_buffer(source_id)
        
        if success:
            return JitterBufferResponse(
                success=True,
                message=f"Jitter buffer removed for source {source_id}"
            )
        else:
            raise HTTPException(status_code=404, detail=f"Jitter buffer for source {source_id} not found")
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error removing jitter buffer for {source_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/buffers", response_model=JitterBufferResponse)
async def get_all_jitter_buffers():
    """Get list of all jitter buffers"""
    try:
        manager = await get_jitter_buffer_manager()
        buffers = manager.get_all_buffers()
        
        buffer_info = {}
        for source_id, buffer in buffers.items():
            buffer_info[source_id] = buffer.get_buffer_status()
        
        return JitterBufferResponse(
            success=True,
            message=f"Retrieved {len(buffer_info)} jitter buffers",
            data={"buffers": buffer_info}
        )
        
    except Exception as e:
        logger.error(f"Error getting jitter buffers: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/buffers/{source_id}", response_model=JitterBufferResponse)
async def get_jitter_buffer_info(source_id: str):
    """Get information about a specific jitter buffer"""
    try:
        buffer = await get_jitter_buffer(source_id)
        
        if not buffer:
            raise HTTPException(status_code=404, detail=f"Jitter buffer for source {source_id} not found")
        
        status = buffer.get_buffer_status()
        statistics = buffer.get_statistics()
        
        return JitterBufferResponse(
            success=True,
            message=f"Jitter buffer information for {source_id}",
            data={
                "buffer_status": status,
                "statistics": statistics
            }
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting jitter buffer info for {source_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/buffers/{source_id}/statistics", response_model=JitterBufferResponse)
async def get_jitter_buffer_statistics(source_id: str):
    """Get detailed statistics for a jitter buffer"""
    try:
        buffer = await get_jitter_buffer(source_id)
        
        if not buffer:
            raise HTTPException(status_code=404, detail=f"Jitter buffer for source {source_id} not found")
        
        statistics = buffer.get_statistics()
        
        return JitterBufferResponse(
            success=True,
            message=f"Statistics for jitter buffer {source_id}",
            data={"statistics": statistics}
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting jitter buffer statistics for {source_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/buffers/{source_id}/config", response_model=JitterBufferResponse)
async def update_jitter_buffer_config(source_id: str, config_update: Dict[str, Any]):
    """Update jitter buffer configuration"""
    try:
        buffer = await get_jitter_buffer(source_id)
        
        if not buffer:
            raise HTTPException(status_code=404, detail=f"Jitter buffer for source {source_id} not found")
        
        success = buffer.update_config(config_update)
        
        if success:
            status = buffer.get_buffer_status()
            return JitterBufferResponse(
                success=True,
                message=f"Configuration updated for jitter buffer {source_id}",
                data={"buffer_status": status}
            )
        else:
            raise HTTPException(status_code=400, detail="Failed to update configuration")
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating jitter buffer config for {source_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/buffers/{source_id}/packets", response_model=JitterBufferResponse)
async def add_packet_to_buffer(source_id: str, packet_data: AudioPacketRequest):
    """Add a packet to a jitter buffer (for testing purposes)"""
    try:
        buffer = await get_jitter_buffer(source_id)
        
        if not buffer:
            raise HTTPException(status_code=404, detail=f"Jitter buffer for source {source_id} not found")
        
        # Create AudioPacket from request
        packet = AudioPacket(
            sequence_number=packet_data.sequence_number,
            timestamp=packet_data.timestamp,
            arrival_time=0,  # Will be set by buffer
            data=packet_data.data,
            source_id=packet_data.source_id,
            sample_rate=packet_data.sample_rate,
            channels=packet_data.channels,
            duration_ms=packet_data.duration_ms
        )
        
        success = buffer.add_packet(packet)
        
        if success:
            status = buffer.get_buffer_status()
            return JitterBufferResponse(
                success=True,
                message=f"Packet added to jitter buffer {source_id}",
                data={"buffer_status": status}
            )
        else:
            raise HTTPException(status_code=400, detail="Failed to add packet to buffer")
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error adding packet to jitter buffer {source_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/health", response_model=JitterBufferResponse)
async def jitter_buffer_health_check():
    """Health check endpoint for jitter buffer system"""
    try:
        manager = await get_jitter_buffer_manager()
        stats = manager.get_manager_statistics()
        
        # Determine health based on buffer states
        total_buffers = stats["total_buffers"]
        healthy_buffers = 0
        
        for source_id, buffer_stats in stats["buffers"].items():
            buffer_status = buffer_stats.get("buffer_status", {})
            state = buffer_status.get("state", "stopped")
            
            if state in ["playing", "filling"]:
                healthy_buffers += 1
        
        health_data = {
            "healthy": True,
            "total_buffers": total_buffers,
            "healthy_buffers": healthy_buffers,
            "health_percentage": (healthy_buffers / total_buffers * 100) if total_buffers > 0 else 100
        }
        
        # Consider system unhealthy if less than 80% of buffers are healthy
        if total_buffers > 0 and (healthy_buffers / total_buffers) < 0.8:
            health_data["healthy"] = False
        
        return JitterBufferResponse(
            success=True,
            message="Jitter buffer health check completed",
            data={"health": health_data, "statistics": stats}
        )
        
    except Exception as e:
        logger.error(f"Error in jitter buffer health check: {e}")
        return JitterBufferResponse(
            success=False,
            message=f"Health check failed: {str(e)}",
            data={"healthy": False}
        )

@router.get("/performance", response_model=JitterBufferResponse)
async def get_jitter_buffer_performance():
    """Get performance metrics for all jitter buffers"""
    try:
        manager = await get_jitter_buffer_manager()
        stats = manager.get_manager_statistics()
        
        # Aggregate performance metrics
        total_packets = 0
        total_lost_packets = 0
        total_late_packets = 0
        total_concealed_packets = 0
        avg_jitter_values = []
        avg_buffer_levels = []
        
        for source_id, buffer_stats in stats["buffers"].items():
            buffer_metrics = buffer_stats
            total_packets += buffer_metrics.get("total_packets", 0)
            total_lost_packets += buffer_metrics.get("lost_packets", 0)
            total_late_packets += buffer_metrics.get("late_packets", 0)
            total_concealed_packets += buffer_metrics.get("concealed_packets", 0)
            
            if buffer_metrics.get("average_jitter_ms", 0) > 0:
                avg_jitter_values.append(buffer_metrics["average_jitter_ms"])
            if buffer_metrics.get("average_buffer_level", 0) > 0:
                avg_buffer_levels.append(buffer_metrics["average_buffer_level"])
        
        # Calculate aggregate metrics
        overall_loss_rate = (total_lost_packets / total_packets) if total_packets > 0 else 0
        overall_late_rate = (total_late_packets / total_packets) if total_packets > 0 else 0
        overall_concealment_rate = (total_concealed_packets / total_packets) if total_packets > 0 else 0
        overall_avg_jitter = sum(avg_jitter_values) / len(avg_jitter_values) if avg_jitter_values else 0
        overall_avg_buffer_level = sum(avg_buffer_levels) / len(avg_buffer_levels) if avg_buffer_levels else 0
        
        performance_data = {
            "total_packets_processed": total_packets,
            "overall_loss_rate": overall_loss_rate,
            "overall_late_rate": overall_late_rate,
            "overall_concealment_rate": overall_concealment_rate,
            "overall_average_jitter_ms": overall_avg_jitter,
            "overall_average_buffer_level": overall_avg_buffer_level,
            "active_buffers": len([b for b in stats["buffers"].values() 
                                 if b.get("buffer_status", {}).get("state") in ["playing", "filling"]]),
            "buffer_efficiency": (1 - overall_loss_rate) * 100  # Percentage of successful packet delivery
        }
        
        return JitterBufferResponse(
            success=True,
            message="Jitter buffer performance metrics retrieved",
            data={"performance": performance_data, "detailed_statistics": stats}
        )
        
    except Exception as e:
        logger.error(f"Error getting jitter buffer performance: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/reset", response_model=JitterBufferResponse)
async def reset_all_jitter_buffers():
    """Reset all jitter buffers (clear all packets and statistics)"""
    try:
        manager = await get_jitter_buffer_manager()
        
        # Stop all buffers
        await manager.stop_all_buffers()
        
        return JitterBufferResponse(
            success=True,
            message="All jitter buffers have been reset"
        )
        
    except Exception as e:
        logger.error(f"Error resetting jitter buffers: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/config/defaults", response_model=JitterBufferResponse)
async def get_default_config():
    """Get default jitter buffer configuration"""
    try:
        manager = await get_jitter_buffer_manager()
        default_config = manager.default_config
        
        config_data = {
            "target_delay_ms": default_config.target_delay_ms,
            "min_delay_ms": default_config.min_delay_ms,
            "max_delay_ms": default_config.max_delay_ms,
            "adaptive_sizing": default_config.adaptive_sizing,
            "packet_timeout_ms": default_config.packet_timeout_ms,
            "max_buffer_packets": default_config.max_buffer_packets,
            "playout_interval_ms": default_config.playout_interval_ms,
            "loss_concealment": default_config.loss_concealment,
            "late_packet_threshold_ms": default_config.late_packet_threshold_ms,
            "statistics_window_size": default_config.statistics_window_size
        }
        
        return JitterBufferResponse(
            success=True,
            message="Default jitter buffer configuration retrieved",
            data={"default_config": config_data}
        )
        
    except Exception as e:
        logger.error(f"Error getting default config: {e}")
        raise HTTPException(status_code=500, detail=str(e))