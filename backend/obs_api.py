"""
FastAPI endpoints for OBS integration
Provides REST API for OBS control and automation
"""

from typing import List, Dict, Any, Optional
from datetime import datetime
import asyncio
import logging

from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from .database import get_db
from .models import Meeting, User
from .obs_integration import (
    OBSWebSocketClient, OBSAutomationManager, OBSStatsMonitor,
    OBSConnectionRequest, OBSSceneSwitchRequest, OBSSourceControlRequest,
    OBSAutomationRuleRequest, OBSStatsResponse,
    get_obs_client, get_obs_automation, get_obs_monitor
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/obs", tags=["OBS Integration"])

@router.post("/connect")
async def connect_obs(
    connection_data: OBSConnectionRequest,
    background_tasks: BackgroundTasks
):
    """Connect to OBS WebSocket"""
    try:
        global obs_client
        obs_client = OBSWebSocketClient(
            host=connection_data.host,
            port=connection_data.port,
            password=connection_data.password
        )
        
        success = await obs_client.connect()
        
        if success:
            # Start monitoring in background
            monitor = await get_obs_monitor()
            background_tasks.add_task(monitor.start_monitoring)
            
            # Get basic info
            version = await obs_client.get_version()
            scenes = await obs_client.get_scenes()
            
            return {
                "connected": True,
                "version": version,
                "scenes": [{"name": scene.scene_name, "uuid": scene.scene_uuid} for scene in scenes],
                "current_scene": await obs_client.get_current_scene()
            }
        else:
            raise HTTPException(status_code=400, detail="Failed to connect to OBS")
            
    except Exception as e:
        logger.error(f"OBS connection error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/status")
async def get_obs_status():
    """Get OBS connection and streaming status"""
    try:
        client = await get_obs_client()
        
        if not client.connected:
            return {"connected": False}
        
        # Get comprehensive status
        stream_status = await client.get_stream_status()
        record_status = await client.get_record_status()
        current_scene = await client.get_current_scene()
        
        return {
            "connected": True,
            "identified": client.identified,
            "current_scene": current_scene,
            "streaming": stream_status.get("outputActive", False),
            "recording": record_status.get("outputActive", False),
            "stream_timecode": stream_status.get("outputTimecode"),
            "record_timecode": record_status.get("outputTimecode"),
            "total_scenes": len(client.scenes),
            "total_sources": len(client.sources)
        }
        
    except Exception as e:
        logger.error(f"Error getting OBS status: {e}")
        return {"connected": False, "error": str(e)}

@router.get("/scenes")
async def get_scenes():
    """Get list of OBS scenes"""
    try:
        client = await get_obs_client()
        scenes = await client.get_scenes()
        
        return {
            "scenes": [
                {
                    "name": scene.scene_name,
                    "uuid": scene.scene_uuid,
                    "index": scene.scene_index,
                    "current": scene.scene_name == client.current_scene
                }
                for scene in scenes
            ],
            "current_scene": client.current_scene
        }
        
    except Exception as e:
        logger.error(f"Error getting scenes: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/scenes/switch")
async def switch_scene(scene_data: OBSSceneSwitchRequest):
    """Switch to specified scene"""
    try:
        client = await get_obs_client()
        success = await client.set_scene(scene_data.scene_name)
        
        if success:
            # Log scene change with meeting context
            if scene_data.meeting_id:
                logger.info(f"Scene switched to '{scene_data.scene_name}' for meeting {scene_data.meeting_id}")
            
            return {
                "success": True,
                "previous_scene": client.current_scene,
                "current_scene": scene_data.scene_name
            }
        else:
            raise HTTPException(status_code=400, detail="Failed to switch scene")
            
    except Exception as e:
        logger.error(f"Error switching scene: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/sources")
async def get_sources():
    """Get list of OBS sources"""
    try:
        client = await get_obs_client()
        
        return {
            "sources": [
                {
                    "name": source.source_name,
                    "type": source.source_type,
                    "kind": source.source_kind,
                    "uuid": source.source_uuid
                }
                for source in client.sources
            ]
        }
        
    except Exception as e:
        logger.error(f"Error getting sources: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/sources/control")
async def control_source(control_data: OBSSourceControlRequest):
    """Control OBS source (mute, volume, etc.)"""
    try:
        client = await get_obs_client()
        source_name = control_data.source_name
        action = control_data.action.lower()
        
        if action == "mute":
            success = await client.mute_source(source_name, True)
        elif action == "unmute":
            success = await client.mute_source(source_name, False)
        elif action == "toggle_mute":
            success = await client.toggle_source_mute(source_name)
        elif action == "volume":
            if control_data.value is None:
                raise HTTPException(status_code=400, detail="Volume value required")
            success = await client.set_source_volume(source_name, control_data.value)
        else:
            raise HTTPException(status_code=400, detail=f"Unknown action: {action}")
        
        if success:
            return {"success": True, "action": action, "source": source_name}
        else:
            raise HTTPException(status_code=400, detail=f"Failed to {action} source")
            
    except Exception as e:
        logger.error(f"Error controlling source: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/streaming/start")
async def start_streaming():
    """Start OBS streaming"""
    try:
        client = await get_obs_client()
        success = await client.start_streaming()
        
        if success:
            return {"success": True, "action": "streaming_started"}
        else:
            raise HTTPException(status_code=400, detail="Failed to start streaming")
            
    except Exception as e:
        logger.error(f"Error starting stream: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/streaming/stop")
async def stop_streaming():
    """Stop OBS streaming"""
    try:
        client = await get_obs_client()
        success = await client.stop_streaming()
        
        if success:
            return {"success": True, "action": "streaming_stopped"}
        else:
            raise HTTPException(status_code=400, detail="Failed to stop streaming")
            
    except Exception as e:
        logger.error(f"Error stopping stream: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/recording/start")
async def start_recording():
    """Start OBS recording"""
    try:
        client = await get_obs_client()
        success = await client.start_recording()
        
        if success:
            return {"success": True, "action": "recording_started"}
        else:
            raise HTTPException(status_code=400, detail="Failed to start recording")
            
    except Exception as e:
        logger.error(f"Error starting recording: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/recording/stop")
async def stop_recording():
    """Stop OBS recording"""
    try:
        client = await get_obs_client()
        success = await client.stop_recording()
        
        if success:
            return {"success": True, "action": "recording_stopped"}
        else:
            raise HTTPException(status_code=400, detail="Failed to stop recording")
            
    except Exception as e:
        logger.error(f"Error stopping recording: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/stats")
async def get_obs_stats():
    """Get OBS performance statistics"""
    try:
        client = await get_obs_client()
        monitor = await get_obs_monitor()
        
        # Get current stats
        stats = await client.get_stats()
        
        # Get recent alerts (you would implement alert storage)
        alerts = []  # Placeholder for now
        
        return OBSStatsResponse(
            stats=stats.__dict__,
            alerts=alerts,
            timestamp=datetime.now()
        )
        
    except Exception as e:
        logger.error(f"Error getting stats: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/stats/history")
async def get_stats_history(minutes: int = 60):
    """Get OBS stats history"""
    try:
        monitor = await get_obs_monitor()
        history = monitor.get_stats_history(minutes)
        
        return {
            "history": [stats.__dict__ for stats in history],
            "period_minutes": minutes,
            "total_samples": len(history)
        }
        
    except Exception as e:
        logger.error(f"Error getting stats history: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/automation/rules")
async def add_automation_rule(rule_data: OBSAutomationRuleRequest):
    """Add OBS automation rule"""
    try:
        automation = await get_obs_automation()
        automation.add_automation_rule(rule_data.event_type, rule_data.actions)
        
        return {
            "success": True,
            "event_type": rule_data.event_type,
            "actions_count": len(rule_data.actions)
        }
        
    except Exception as e:
        logger.error(f"Error adding automation rule: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/automation/rules/{event_type}")
async def remove_automation_rule(event_type: str):
    """Remove OBS automation rule"""
    try:
        automation = await get_obs_automation()
        automation.remove_automation_rule(event_type)
        
        return {"success": True, "removed_event_type": event_type}
        
    except Exception as e:
        logger.error(f"Error removing automation rule: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/automation/rules")
async def get_automation_rules():
    """Get all automation rules"""
    try:
        automation = await get_obs_automation()
        
        return {
            "rules": automation.automation_rules,
            "enabled": automation.enabled
        }
        
    except Exception as e:
        logger.error(f"Error getting automation rules: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/automation/enable")
async def enable_automation():
    """Enable OBS automation"""
    try:
        automation = await get_obs_automation()
        automation.enable_automation()
        
        return {"success": True, "automation_enabled": True}
        
    except Exception as e:
        logger.error(f"Error enabling automation: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/automation/disable")
async def disable_automation():
    """Disable OBS automation"""
    try:
        automation = await get_obs_automation()
        automation.disable_automation()
        
        return {"success": True, "automation_enabled": False}
        
    except Exception as e:
        logger.error(f"Error disabling automation: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/automation/trigger/{event_type}")
async def trigger_automation(
    event_type: str,
    meeting_id: str,
    event_data: Optional[Dict[str, Any]] = None
):
    """Manually trigger automation for testing"""
    try:
        automation = await get_obs_automation()
        await automation.handle_meeting_event(event_type, meeting_id, event_data or {})
        
        return {
            "success": True,
            "event_type": event_type,
            "meeting_id": meeting_id
        }
        
    except Exception as e:
        logger.error(f"Error triggering automation: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/health")
async def obs_health_check():
    """Health check endpoint for OBS integration"""
    try:
        client = await get_obs_client()
        
        if not client.connected:
            return {
                "status": "unhealthy",
                "connected": False,
                "message": "Not connected to OBS"
            }
        
        # Test basic functionality
        version = await client.get_version()
        current_scene = await client.get_current_scene()
        
        return {
            "status": "healthy",
            "connected": True,
            "identified": client.identified,
            "obs_version": version.get("obsVersion"),
            "websocket_version": version.get("obsWebSocketVersion"),
            "current_scene": current_scene,
            "total_scenes": len(client.scenes),
            "total_sources": len(client.sources)
        }
        
    except Exception as e:
        logger.error(f"OBS health check failed: {e}")
        return {
            "status": "unhealthy",
            "connected": False,
            "error": str(e)
        }

# Meeting integration endpoints

@router.post("/meetings/{meeting_id}/start-streaming")
async def start_meeting_streaming(
    meeting_id: str,
    db: Session = Depends(get_db)
):
    """Start streaming for a specific meeting"""
    try:
        # Get meeting details
        meeting = db.query(Meeting).filter(Meeting.id == meeting_id).first()
        if not meeting:
            raise HTTPException(status_code=404, detail="Meeting not found")
        
        # Trigger automation
        automation = await get_obs_automation()
        await automation.handle_meeting_event("meeting_started", meeting_id, {
            "meeting_title": meeting.title,
            "participants": len(meeting.participants) if hasattr(meeting, 'participants') else 0
        })
        
        # Start streaming
        client = await get_obs_client()
        success = await client.start_streaming()
        
        if success:
            return {
                "success": True,
                "meeting_id": meeting_id,
                "streaming": True,
                "message": f"Started streaming for meeting: {meeting.title}"
            }
        else:
            raise HTTPException(status_code=400, detail="Failed to start streaming")
            
    except Exception as e:
        logger.error(f"Error starting meeting stream: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/meetings/{meeting_id}/stop-streaming")
async def stop_meeting_streaming(
    meeting_id: str,
    db: Session = Depends(get_db)
):
    """Stop streaming for a specific meeting"""
    try:
        # Get meeting details
        meeting = db.query(Meeting).filter(Meeting.id == meeting_id).first()
        if not meeting:
            raise HTTPException(status_code=404, detail="Meeting not found")
        
        # Trigger automation
        automation = await get_obs_automation()
        await automation.handle_meeting_event("meeting_ended", meeting_id)
        
        # Stop streaming
        client = await get_obs_client()
        success = await client.stop_streaming()
        
        if success:
            return {
                "success": True,
                "meeting_id": meeting_id,
                "streaming": False,
                "message": f"Stopped streaming for meeting: {meeting.title}"
            }
        else:
            raise HTTPException(status_code=400, detail="Failed to stop streaming")
            
    except Exception as e:
        logger.error(f"Error stopping meeting stream: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# Event streaming endpoint for real-time updates

async def obs_event_stream():
    """Stream OBS events via Server-Sent Events"""
    try:
        client = await get_obs_client()
        
        # Add event callback for SSE
        event_queue = asyncio.Queue()
        
        async def event_callback(event_type: str, event_data: dict):
            await event_queue.put({
                "event": event_type,
                "data": event_data,
                "timestamp": datetime.now().isoformat()
            })
        
        client.add_event_callback("*", event_callback)  # Listen to all events
        
        while True:
            try:
                event = await asyncio.wait_for(event_queue.get(), timeout=30.0)
                yield f"data: {json.dumps(event)}\n\n"
            except asyncio.TimeoutError:
                # Send keepalive
                yield f"data: {json.dumps({'event': 'keepalive', 'timestamp': datetime.now().isoformat()})}\n\n"
                
    except Exception as e:
        logger.error(f"Error in OBS event stream: {e}")
        yield f"data: {json.dumps({'event': 'error', 'message': str(e)})}\n\n"

@router.get("/events/stream")
async def stream_obs_events():
    """Server-Sent Events stream for OBS events"""
    return StreamingResponse(
        obs_event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        }
    )