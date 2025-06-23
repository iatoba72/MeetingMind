"""
Source Switcher API Endpoints
Provides REST API for managing automatic source switching
"""

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Dict, List, Optional, Any
import logging

from source_switcher import (
    get_source_switcher, start_source_switcher, stop_source_switcher,
    SwitchingConfig, AudioSourceInfo, SourceType, SourceState, SwitchingMode
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/source-switcher", tags=["Source Switcher"])

class SwitchingConfigRequest(BaseModel):
    switching_mode: str = "automatic"
    auto_switch_enabled: bool = True
    fallback_timeout_seconds: int = 5
    quality_threshold: float = 0.7
    max_latency_ms: float = 500
    max_packet_loss_rate: float = 0.05
    min_signal_to_noise_ratio: float = 10.0
    priority_weights: Optional[Dict[str, float]] = None
    blacklisted_sources: Optional[List[str]] = None
    preferred_sources: Optional[List[str]] = None
    sticky_switching: bool = True
    switch_cooldown_seconds: int = 3

class SourceMetricsUpdate(BaseModel):
    bytes_received: Optional[int] = None
    bitrate_kbps: Optional[float] = None
    latency_ms: Optional[float] = None
    packet_loss_rate: Optional[float] = None
    signal_to_noise_ratio: Optional[float] = None

class SourceSwitcherResponse(BaseModel):
    success: bool
    message: str
    data: Optional[Dict[str, Any]] = None

@router.get("/status", response_model=SourceSwitcherResponse)
async def get_source_switcher_status():
    """Get source switcher status and statistics"""
    try:
        switcher = await get_source_switcher()
        stats = switcher.get_switcher_stats()
        active_source = switcher.get_active_source()
        all_sources = switcher.get_all_sources()
        
        # Convert sources to serializable format
        sources_data = {}
        for source_id, source in all_sources.items():
            sources_data[source_id] = {
                "source_id": source.source_id,
                "source_type": source.source_type.value,
                "name": source.name,
                "state": source.state.value,
                "priority": source.priority,
                "quality_score": source.quality_score,
                "last_activity": source.last_activity.isoformat(),
                "bytes_received": source.bytes_received,
                "sample_rate": source.sample_rate,
                "channels": source.channels,
                "bitrate_kbps": source.bitrate_kbps,
                "latency_ms": source.latency_ms,
                "packet_loss_rate": source.packet_loss_rate,
                "signal_to_noise_ratio": source.signal_to_noise_ratio,
                "metadata": source.metadata
            }
        
        active_source_data = None
        if active_source:
            active_source_data = {
                "source_id": active_source.source_id,
                "source_type": active_source.source_type.value,
                "name": active_source.name,
                "state": active_source.state.value,
                "priority": active_source.priority,
                "quality_score": active_source.quality_score,
                "last_activity": active_source.last_activity.isoformat(),
                "bitrate_kbps": active_source.bitrate_kbps,
                "latency_ms": active_source.latency_ms,
                "packet_loss_rate": active_source.packet_loss_rate,
                "signal_to_noise_ratio": active_source.signal_to_noise_ratio
            }
        
        return SourceSwitcherResponse(
            success=True,
            message="Source switcher status retrieved",
            data={
                "stats": stats,
                "active_source": active_source_data,
                "sources": sources_data
            }
        )
    except Exception as e:
        logger.error(f"Error getting source switcher status: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/start", response_model=SourceSwitcherResponse)
async def start_source_switcher_endpoint(config: Optional[SwitchingConfigRequest] = None):
    """Start the source switcher with optional configuration"""
    try:
        # Convert request to config if provided
        switcher_config = None
        if config:
            # Convert string enum to actual enum
            mode_mapping = {
                "automatic": SwitchingMode.AUTOMATIC,
                "manual": SwitchingMode.MANUAL,
                "priority_based": SwitchingMode.PRIORITY_BASED,
                "quality_based": SwitchingMode.QUALITY_BASED
            }
            
            switcher_config = SwitchingConfig(
                switching_mode=mode_mapping.get(config.switching_mode, SwitchingMode.AUTOMATIC),
                auto_switch_enabled=config.auto_switch_enabled,
                fallback_timeout_seconds=config.fallback_timeout_seconds,
                quality_threshold=config.quality_threshold,
                max_latency_ms=config.max_latency_ms,
                max_packet_loss_rate=config.max_packet_loss_rate,
                min_signal_to_noise_ratio=config.min_signal_to_noise_ratio,
                priority_weights=config.priority_weights,
                blacklisted_sources=config.blacklisted_sources or [],
                preferred_sources=config.preferred_sources or [],
                sticky_switching=config.sticky_switching,
                switch_cooldown_seconds=config.switch_cooldown_seconds
            )
        
        success = await start_source_switcher(switcher_config)
        
        if success:
            switcher = await get_source_switcher()
            stats = switcher.get_switcher_stats()
            
            return SourceSwitcherResponse(
                success=True,
                message="Source switcher started successfully",
                data={"stats": stats}
            )
        else:
            raise HTTPException(status_code=500, detail="Failed to start source switcher")
            
    except Exception as e:
        logger.error(f"Error starting source switcher: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/stop", response_model=SourceSwitcherResponse)
async def stop_source_switcher_endpoint():
    """Stop the source switcher"""
    try:
        success = await stop_source_switcher()
        
        if success:
            return SourceSwitcherResponse(
                success=True,
                message="Source switcher stopped successfully"
            )
        else:
            raise HTTPException(status_code=500, detail="Failed to stop source switcher")
            
    except Exception as e:
        logger.error(f"Error stopping source switcher: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/sources", response_model=SourceSwitcherResponse)
async def get_all_sources():
    """Get list of all registered sources"""
    try:
        switcher = await get_source_switcher()
        sources = switcher.get_all_sources()
        
        # Convert to serializable format
        sources_data = {}
        for source_id, source in sources.items():
            sources_data[source_id] = {
                "source_id": source.source_id,
                "source_type": source.source_type.value,
                "name": source.name,
                "state": source.state.value,
                "priority": source.priority,
                "quality_score": source.quality_score,
                "last_activity": source.last_activity.isoformat(),
                "bytes_received": source.bytes_received,
                "sample_rate": source.sample_rate,
                "channels": source.channels,
                "bitrate_kbps": source.bitrate_kbps,
                "latency_ms": source.latency_ms,
                "packet_loss_rate": source.packet_loss_rate,
                "signal_to_noise_ratio": source.signal_to_noise_ratio,
                "metadata": source.metadata
            }
        
        return SourceSwitcherResponse(
            success=True,
            message=f"Retrieved {len(sources_data)} sources",
            data={"sources": sources_data}
        )
        
    except Exception as e:
        logger.error(f"Error getting sources: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/sources/available", response_model=SourceSwitcherResponse)
async def get_available_sources():
    """Get list of available sources"""
    try:
        switcher = await get_source_switcher()
        sources = switcher.get_available_sources()
        
        # Convert to serializable format
        sources_data = {}
        for source_id, source in sources.items():
            sources_data[source_id] = {
                "source_id": source.source_id,
                "source_type": source.source_type.value,
                "name": source.name,
                "state": source.state.value,
                "priority": source.priority,
                "quality_score": source.quality_score,
                "last_activity": source.last_activity.isoformat(),
                "bitrate_kbps": source.bitrate_kbps,
                "latency_ms": source.latency_ms,
                "packet_loss_rate": source.packet_loss_rate,
                "signal_to_noise_ratio": source.signal_to_noise_ratio
            }
        
        return SourceSwitcherResponse(
            success=True,
            message=f"Retrieved {len(sources_data)} available sources",
            data={"sources": sources_data}
        )
        
    except Exception as e:
        logger.error(f"Error getting available sources: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/sources/active", response_model=SourceSwitcherResponse)
async def get_active_source():
    """Get the currently active source"""
    try:
        switcher = await get_source_switcher()
        active_source = switcher.get_active_source()
        
        if not active_source:
            return SourceSwitcherResponse(
                success=True,
                message="No active source",
                data={"active_source": None}
            )
        
        source_data = {
            "source_id": active_source.source_id,
            "source_type": active_source.source_type.value,
            "name": active_source.name,
            "state": active_source.state.value,
            "priority": active_source.priority,
            "quality_score": active_source.quality_score,
            "last_activity": active_source.last_activity.isoformat(),
            "bytes_received": active_source.bytes_received,
            "sample_rate": active_source.sample_rate,
            "channels": active_source.channels,
            "bitrate_kbps": active_source.bitrate_kbps,
            "latency_ms": active_source.latency_ms,
            "packet_loss_rate": active_source.packet_loss_rate,
            "signal_to_noise_ratio": active_source.signal_to_noise_ratio,
            "metadata": active_source.metadata
        }
        
        return SourceSwitcherResponse(
            success=True,
            message="Active source retrieved",
            data={"active_source": source_data}
        )
        
    except Exception as e:
        logger.error(f"Error getting active source: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/switch/{source_id}", response_model=SourceSwitcherResponse)
async def switch_to_source(source_id: str):
    """Manually switch to a specific source"""
    try:
        switcher = await get_source_switcher()
        
        success = await switcher.switch_to_source(source_id, manual=True)
        
        if success:
            active_source = switcher.get_active_source()
            source_data = None
            if active_source:
                source_data = {
                    "source_id": active_source.source_id,
                    "source_type": active_source.source_type.value,
                    "name": active_source.name,
                    "state": active_source.state.value,
                    "quality_score": active_source.quality_score
                }
            
            return SourceSwitcherResponse(
                success=True,
                message=f"Successfully switched to source {source_id}",
                data={"active_source": source_data}
            )
        else:
            raise HTTPException(status_code=400, detail=f"Failed to switch to source {source_id}")
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error switching to source {source_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/sources/{source_id}/metrics", response_model=SourceSwitcherResponse)
async def update_source_metrics(source_id: str, metrics: SourceMetricsUpdate):
    """Update metrics for a specific source"""
    try:
        switcher = await get_source_switcher()
        
        # Convert to dict, excluding None values
        metrics_dict = {k: v for k, v in metrics.dict().items() if v is not None}
        
        success = switcher.update_source_metrics(source_id, metrics_dict)
        
        if success:
            return SourceSwitcherResponse(
                success=True,
                message=f"Metrics updated for source {source_id}"
            )
        else:
            raise HTTPException(status_code=404, detail=f"Source {source_id} not found")
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating metrics for source {source_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/config", response_model=SourceSwitcherResponse)
async def get_source_switcher_config():
    """Get current source switcher configuration"""
    try:
        switcher = await get_source_switcher()
        stats = switcher.get_switcher_stats()
        config = stats.get('config', {})
        
        return SourceSwitcherResponse(
            success=True,
            message="Source switcher configuration retrieved",
            data={"config": config}
        )
        
    except Exception as e:
        logger.error(f"Error getting source switcher config: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/config", response_model=SourceSwitcherResponse)
async def update_source_switcher_config(config_update: Dict[str, Any]):
    """Update source switcher configuration"""
    try:
        switcher = await get_source_switcher()
        
        success = switcher.update_config(config_update)
        
        if success:
            return SourceSwitcherResponse(
                success=True,
                message="Source switcher configuration updated"
            )
        else:
            raise HTTPException(status_code=400, detail="Failed to update configuration")
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating source switcher config: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/statistics", response_model=SourceSwitcherResponse)
async def get_source_switcher_statistics():
    """Get detailed source switcher statistics"""
    try:
        switcher = await get_source_switcher()
        stats = switcher.get_switcher_stats()
        
        # Calculate additional statistics
        sources = switcher.get_all_sources()
        available_count = len(switcher.get_available_sources())
        
        # Quality distribution
        quality_scores = [source.quality_score for source in sources.values()]
        avg_quality = sum(quality_scores) / len(quality_scores) if quality_scores else 0
        
        # Source type distribution
        type_distribution = {}
        for source in sources.values():
            source_type = source.source_type.value
            type_distribution[source_type] = type_distribution.get(source_type, 0) + 1
        
        enhanced_stats = {
            **stats,
            "source_metrics": {
                "total_sources": len(sources),
                "available_sources": available_count,
                "average_quality_score": avg_quality,
                "source_type_distribution": type_distribution
            }
        }
        
        return SourceSwitcherResponse(
            success=True,
            message="Source switcher statistics retrieved",
            data={"statistics": enhanced_stats}
        )
        
    except Exception as e:
        logger.error(f"Error getting source switcher statistics: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/evaluate", response_model=SourceSwitcherResponse)
async def trigger_source_evaluation():
    """Manually trigger source evaluation and potential switching"""
    try:
        switcher = await get_source_switcher()
        
        # Force evaluation
        await switcher._evaluate_sources()
        
        active_source = switcher.get_active_source()
        source_data = None
        if active_source:
            source_data = {
                "source_id": active_source.source_id,
                "name": active_source.name,
                "quality_score": active_source.quality_score
            }
        
        return SourceSwitcherResponse(
            success=True,
            message="Source evaluation completed",
            data={"active_source": source_data}
        )
        
    except Exception as e:
        logger.error(f"Error triggering source evaluation: {e}")
        raise HTTPException(status_code=500, detail=str(e))