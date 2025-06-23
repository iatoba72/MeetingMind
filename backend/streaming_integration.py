"""
MeetingMind Streaming Integration Module

This module integrates the Node.js streaming server with the main MeetingMind FastAPI backend,
providing stream management, authentication, and monitoring capabilities.
"""

import asyncio
import json
import logging
import aiohttp
import requests
from datetime import datetime, timedelta
from typing import Optional, Dict, List, Any
from fastapi import HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

from .database import get_db
from .models import Meeting, Participant, StreamSession, StreamMetrics
from .crud import get_meeting, get_user_meetings

logger = logging.getLogger(__name__)

class StreamingServerConfig:
    """Configuration for the streaming server integration"""
    def __init__(self):
        self.streaming_server_url = "http://localhost:3001"
        self.streaming_server_ws_url = "ws://localhost:3001"
        self.rtmp_port = 1935
        self.srt_port = 9998
        self.webrtc_port = 8443
        self.auth_timeout = 30  # seconds
        self.health_check_interval = 60  # seconds

class StreamKeyRequest(BaseModel):
    meeting_id: str
    user_id: str
    protocol: str = "rtmp"  # rtmp, srt, webrtc
    expires_in: str = "24h"
    permissions: List[str] = ["publish"]
    metadata: Dict[str, Any] = {}

class StreamStatus(BaseModel):
    stream_id: str
    status: str  # connecting, live, ended, error
    protocol: str
    start_time: Optional[datetime]
    end_time: Optional[datetime]
    viewers: int = 0
    quality: Dict[str, Any] = {}
    health: Dict[str, Any] = {}

class StreamingIntegration:
    """Main integration class for streaming server functionality"""
    
    def __init__(self, config: StreamingServerConfig = None):
        self.config = config or StreamingServerConfig()
        self.session = aiohttp.ClientSession()
        self.websocket = None
        self.active_streams = {}
        self.stream_metrics = {}
        
    async def initialize(self):
        """Initialize the streaming integration"""
        try:
            # Test connection to streaming server
            await self.health_check()
            
            # Connect to WebSocket for real-time updates
            await self.connect_websocket()
            
            logger.info("Streaming integration initialized successfully")
        except Exception as e:
            logger.error(f"Failed to initialize streaming integration: {e}")
            raise

    async def health_check(self) -> Dict[str, Any]:
        """Check the health of the streaming server"""
        try:
            async with self.session.get(f"{self.config.streaming_server_url}/health") as response:
                if response.status == 200:
                    return await response.json()
                else:
                    raise HTTPException(status_code=503, detail="Streaming server unavailable")
        except aiohttp.ClientError as e:
            logger.error(f"Streaming server health check failed: {e}")
            raise HTTPException(status_code=503, detail="Streaming server connection failed")

    async def generate_stream_key(self, request: StreamKeyRequest, db: Session) -> Dict[str, str]:
        """Generate a stream key for a meeting"""
        try:
            # Verify meeting exists and user has access
            meeting = get_meeting(db, request.meeting_id)
            if not meeting:
                raise HTTPException(status_code=404, detail="Meeting not found")
            
            # Check if user is a participant
            participant = db.query(Participant).filter(
                Participant.meeting_id == request.meeting_id,
                Participant.user_id == request.user_id
            ).first()
            
            if not participant:
                raise HTTPException(status_code=403, detail="User not authorized for this meeting")
            
            # Generate stream key via streaming server
            payload = {
                "meetingId": request.meeting_id,
                "userId": request.user_id,
                "permissions": request.permissions,
                "expiresIn": request.expires_in,
                "metadata": {
                    **request.metadata,
                    "protocol": request.protocol,
                    "meeting_title": meeting.title,
                    "user_role": participant.role
                }
            }
            
            async with self.session.post(
                f"{self.config.streaming_server_url}/api/auth/stream-keys",
                json=payload,
                headers={"Content-Type": "application/json"}
            ) as response:
                
                if response.status == 200:
                    result = await response.json()
                    
                    # Store stream session in database
                    stream_session = StreamSession(
                        meeting_id=request.meeting_id,
                        user_id=request.user_id,
                        stream_key_id=result["keyId"],
                        protocol=request.protocol,
                        expires_at=datetime.utcnow() + timedelta(
                            hours=24 if request.expires_in == "24h" else 1
                        ),
                        created_at=datetime.utcnow()
                    )
                    db.add(stream_session)
                    db.commit()
                    
                    return {
                        "stream_key": result["streamKey"],
                        "key_id": result["keyId"],
                        "expires": result["expires"],
                        "rtmp_url": f"rtmp://{self.get_server_ip()}:{self.config.rtmp_port}/live",
                        "srt_url": f"srt://{self.get_server_ip()}:{self.config.srt_port}?streamid={result['streamKey']}",
                        "whip_url": f"https://{self.get_server_ip()}:{self.config.webrtc_port}/whip/{request.meeting_id}"
                    }
                else:
                    error_data = await response.json()
                    raise HTTPException(status_code=response.status, detail=error_data.get("error", "Stream key generation failed"))
                    
        except Exception as e:
            logger.error(f"Error generating stream key: {e}")
            raise

    async def revoke_stream_key(self, key_id: str, db: Session) -> bool:
        """Revoke a stream key"""
        try:
            # Find stream session in database
            stream_session = db.query(StreamSession).filter(
                StreamSession.stream_key_id == key_id
            ).first()
            
            if not stream_session:
                raise HTTPException(status_code=404, detail="Stream key not found")
            
            # Revoke via streaming server
            async with self.session.delete(
                f"{self.config.streaming_server_url}/api/auth/stream-keys/{key_id}"
            ) as response:
                
                if response.status == 200:
                    # Update database
                    stream_session.revoked_at = datetime.utcnow()
                    db.commit()
                    return True
                else:
                    error_data = await response.json()
                    raise HTTPException(status_code=response.status, detail=error_data.get("error", "Stream key revocation failed"))
                    
        except Exception as e:
            logger.error(f"Error revoking stream key: {e}")
            raise

    async def get_active_streams(self, meeting_id: Optional[str] = None) -> List[StreamStatus]:
        """Get active streams, optionally filtered by meeting"""
        try:
            url = f"{self.config.streaming_server_url}/api/streams"
            if meeting_id:
                url += f"?meetingId={meeting_id}"
                
            async with self.session.get(url) as response:
                if response.status == 200:
                    streams_data = await response.json()
                    return [
                        StreamStatus(
                            stream_id=stream["id"],
                            status=stream["status"],
                            protocol=stream["type"],
                            start_time=datetime.fromisoformat(stream["startTime"]) if stream.get("startTime") else None,
                            end_time=datetime.fromisoformat(stream["endTime"]) if stream.get("endTime") else None,
                            viewers=stream.get("viewers", 0),
                            quality=stream.get("quality", {}),
                            health=stream.get("health", {})
                        )
                        for stream in streams_data
                    ]
                else:
                    error_data = await response.json()
                    raise HTTPException(status_code=response.status, detail=error_data.get("error", "Failed to fetch streams"))
                    
        except Exception as e:
            logger.error(f"Error fetching active streams: {e}")
            raise

    async def get_stream_metrics(self, stream_id: str) -> Dict[str, Any]:
        """Get detailed metrics for a specific stream"""
        try:
            async with self.session.get(
                f"{self.config.streaming_server_url}/api/streams/{stream_id}"
            ) as response:
                if response.status == 200:
                    return await response.json()
                elif response.status == 404:
                    raise HTTPException(status_code=404, detail="Stream not found")
                else:
                    error_data = await response.json()
                    raise HTTPException(status_code=response.status, detail=error_data.get("error", "Failed to fetch stream metrics"))
                    
        except Exception as e:
            logger.error(f"Error fetching stream metrics: {e}")
            raise

    async def get_system_metrics(self) -> Dict[str, Any]:
        """Get system-wide streaming metrics"""
        try:
            async with self.session.get(
                f"{self.config.streaming_server_url}/api/metrics"
            ) as response:
                if response.status == 200:
                    return await response.json()
                else:
                    error_data = await response.json()
                    raise HTTPException(status_code=response.status, detail=error_data.get("error", "Failed to fetch system metrics"))
                    
        except Exception as e:
            logger.error(f"Error fetching system metrics: {e}")
            raise

    async def get_stream_health(self) -> Dict[str, Any]:
        """Get streaming system health status"""
        try:
            async with self.session.get(
                f"{self.config.streaming_server_url}/api/health-monitor"
            ) as response:
                if response.status == 200:
                    return await response.json()
                else:
                    error_data = await response.json()
                    raise HTTPException(status_code=response.status, detail=error_data.get("error", "Failed to fetch health status"))
                    
        except Exception as e:
            logger.error(f"Error fetching stream health: {e}")
            raise

    async def connect_websocket(self):
        """Connect to streaming server WebSocket for real-time updates"""
        try:
            import socketio
            
            self.sio = socketio.AsyncClient()
            
            @self.sio.event
            async def connect():
                logger.info("Connected to streaming server WebSocket")
            
            @self.sio.event
            async def disconnect():
                logger.info("Disconnected from streaming server WebSocket")
            
            @self.sio.event
            async def stream_live(data):
                await self.handle_stream_live(data)
            
            @self.sio.event
            async def stream_ended(data):
                await self.handle_stream_ended(data)
            
            @self.sio.event
            async def health_alert(data):
                await self.handle_health_alert(data)
            
            await self.sio.connect(self.config.streaming_server_url)
            
        except Exception as e:
            logger.error(f"WebSocket connection failed: {e}")

    async def handle_stream_live(self, data: Dict[str, Any]):
        """Handle stream going live event"""
        stream_id = data.get("streamId")
        logger.info(f"Stream went live: {stream_id}")
        
        # Update database
        # You would implement database updates here
        
        # Notify meeting participants
        await self.notify_meeting_participants(stream_id, "stream_started", data)

    async def handle_stream_ended(self, data: Dict[str, Any]):
        """Handle stream ending event"""
        stream_id = data.get("streamId")
        logger.info(f"Stream ended: {stream_id}")
        
        # Update database
        # You would implement database updates here
        
        # Notify meeting participants
        await self.notify_meeting_participants(stream_id, "stream_ended", data)

    async def handle_health_alert(self, data: Dict[str, Any]):
        """Handle stream health alert"""
        stream_id = data.get("streamId")
        issue = data.get("issue", {})
        logger.warning(f"Health alert for stream {stream_id}: {issue.get('message')}")
        
        # Store alert in database
        # You would implement alert storage here
        
        # Notify administrators
        await self.notify_administrators("health_alert", data)

    async def notify_meeting_participants(self, stream_id: str, event_type: str, data: Dict[str, Any]):
        """Notify meeting participants about stream events"""
        # This would integrate with your existing WebSocket notification system
        # Implementation depends on your current notification infrastructure
        pass

    async def notify_administrators(self, event_type: str, data: Dict[str, Any]):
        """Notify system administrators about important events"""
        # This would integrate with your admin notification system
        # Could send emails, Slack messages, etc.
        pass

    def get_server_ip(self) -> str:
        """Get the server IP address for stream URLs"""
        # This should be configurable or auto-detected
        return "localhost"  # Replace with actual server IP/domain

    async def cleanup(self):
        """Cleanup resources"""
        if self.session:
            await self.session.close()
        if hasattr(self, 'sio'):
            await self.sio.disconnect()

# FastAPI Integration Functions

async def create_stream_key(request: StreamKeyRequest, db: Session) -> Dict[str, str]:
    """FastAPI endpoint function to create a stream key"""
    integration = StreamingIntegration()
    try:
        await integration.initialize()
        return await integration.generate_stream_key(request, db)
    finally:
        await integration.cleanup()

async def get_meeting_streams(meeting_id: str) -> List[StreamStatus]:
    """FastAPI endpoint function to get streams for a meeting"""
    integration = StreamingIntegration()
    try:
        await integration.initialize()
        return await integration.get_active_streams(meeting_id)
    finally:
        await integration.cleanup()

async def get_streaming_metrics() -> Dict[str, Any]:
    """FastAPI endpoint function to get streaming metrics"""
    integration = StreamingIntegration()
    try:
        await integration.initialize()
        return await integration.get_system_metrics()
    finally:
        await integration.cleanup()

async def get_streaming_health() -> Dict[str, Any]:
    """FastAPI endpoint function to get streaming health"""
    integration = StreamingIntegration()
    try:
        await integration.initialize()
        return await integration.get_stream_health()
    finally:
        await integration.cleanup()

# Background Tasks

async def periodic_health_monitoring():
    """Background task for periodic health monitoring"""
    integration = StreamingIntegration()
    
    try:
        await integration.initialize()
        
        while True:
            try:
                health = await integration.get_stream_health()
                
                # Process health data
                if health.get("overall") != "healthy":
                    logger.warning(f"Streaming system health degraded: {health}")
                    await integration.notify_administrators("health_degraded", health)
                
                # Wait for next check
                await asyncio.sleep(integration.config.health_check_interval)
                
            except Exception as e:
                logger.error(f"Health monitoring error: {e}")
                await asyncio.sleep(30)  # Wait 30 seconds before retry
                
    except Exception as e:
        logger.error(f"Health monitoring task failed: {e}")
    finally:
        await integration.cleanup()

# Utility Functions

def format_stream_url(protocol: str, server_ip: str, stream_key: str, meeting_id: str = None) -> str:
    """Format stream URL for different protocols"""
    config = StreamingServerConfig()
    
    if protocol.lower() == "rtmp":
        return f"rtmp://{server_ip}:{config.rtmp_port}/live"
    elif protocol.lower() == "srt":
        return f"srt://{server_ip}:{config.srt_port}?streamid={stream_key}"
    elif protocol.lower() == "webrtc":
        return f"https://{server_ip}:{config.webrtc_port}/whip/{meeting_id or 'stream'}"
    else:
        raise ValueError(f"Unsupported protocol: {protocol}")

def validate_stream_permissions(user_role: str, requested_permissions: List[str]) -> bool:
    """Validate if user role allows requested stream permissions"""
    role_permissions = {
        "host": ["publish", "view", "moderate"],
        "presenter": ["publish", "view"],
        "participant": ["view"],
        "viewer": ["view"]
    }
    
    allowed = role_permissions.get(user_role, [])
    return all(perm in allowed for perm in requested_permissions)

# Database Models Integration

def store_stream_metrics(db: Session, stream_id: str, metrics_data: Dict[str, Any]):
    """Store stream metrics in database"""
    try:
        metrics = StreamMetrics(
            stream_id=stream_id,
            timestamp=datetime.utcnow(),
            bitrate=metrics_data.get("bitrate", 0),
            fps=metrics_data.get("fps", 0),
            latency=metrics_data.get("latency", 0),
            packet_loss=metrics_data.get("packetLoss", 0),
            quality_score=metrics_data.get("qualityScore", 100),
            viewers=metrics_data.get("viewers", 0),
            data=json.dumps(metrics_data)
        )
        db.add(metrics)
        db.commit()
    except Exception as e:
        logger.error(f"Error storing stream metrics: {e}")
        db.rollback()

def get_stream_analytics(db: Session, meeting_id: str, time_range: timedelta = None) -> Dict[str, Any]:
    """Get analytics for streams in a meeting"""
    if time_range is None:
        time_range = timedelta(hours=24)
    
    cutoff = datetime.utcnow() - time_range
    
    # Query stream sessions and metrics
    sessions = db.query(StreamSession).filter(
        StreamSession.meeting_id == meeting_id,
        StreamSession.created_at >= cutoff
    ).all()
    
    if not sessions:
        return {"total_streams": 0, "total_duration": 0}
    
    # Calculate analytics
    total_streams = len(sessions)
    total_duration = sum([
        (s.ended_at - s.created_at).total_seconds() 
        for s in sessions if s.ended_at
    ], 0)
    
    return {
        "total_streams": total_streams,
        "total_duration": total_duration,
        "average_duration": total_duration / total_streams if total_streams > 0 else 0,
        "protocols_used": list(set(s.protocol for s in sessions)),
        "peak_concurrent": max([s.peak_viewers for s in sessions if s.peak_viewers], default=0)
    }