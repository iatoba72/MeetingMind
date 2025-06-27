# Main FastAPI application entry point
# FastAPI was chosen for its modern async capabilities, automatic API documentation,
# and excellent performance with async/await patterns for real-time applications

from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.websockets import WebSocket, WebSocketDisconnect
from pydantic import BaseModel
import json
from typing import List, Dict, Optional
import uvicorn
import asyncio
from datetime import datetime
import uuid
from audio_processor import audio_processor, cleanup_audio_sessions
from ai_provider_registry import registry, initialize_registry, get_registry, ProviderStatus
from transcription_service import (
    transcription_service, TranscriptionConfig, WhisperModelSize, TranscriptionResult
)
from transcription_queue import queue_manager, QueuePriority

# Import cloud transcription components
from cloud_transcription_service import (
    cloud_transcription_service, TranscriptionProvider, TranscriptionJob
)
from transcription_accuracy_analyzer import (
    accuracy_analyzer, ComparisonResult, AccuracyMetrics
)
from database import get_db, init_database, db_manager
from crud import (
    meeting_crud, participant_crud, transcript_crud, ai_insight_crud,
    MeetingCreate, MeetingUpdate, ParticipantCreate, TranscriptCreate, AIInsightCreate,
    PaginationParams, MeetingFilters, NotFoundError, ValidationError, ConflictError
)
from streaming_integration import (
    StreamingIntegration, StreamKeyRequest, StreamStatus,
    create_stream_key, get_meeting_streams, get_streaming_metrics, get_streaming_health,
    periodic_health_monitoring
)

# Import new OBS integration
try:
    from obs_api import router as obs_router
    from obs_integration import get_obs_client, get_obs_automation, get_obs_monitor
    OBS_INTEGRATION_AVAILABLE = True
except ImportError as e:
    print(f"⚠️ OBS integration not available: {e}")
    OBS_INTEGRATION_AVAILABLE = False
from models import Meeting, MeetingStatus, ParticipantRole, ParticipantStatus
from sqlalchemy.orm import Session
from websocket_security import validate_websocket_message, validate_client_id, sanitize_string
from rate_limiter import websocket_rate_limit, api_rate_limit, audio_upload_rate_limit
from error_handler import safe_error_response, safe_http_exception
from security_middleware import SecurityHeadersMiddleware, RateLimitMiddleware
import time

# Import audio pipeline WebSocket handler
from audio_pipeline_ws import handle_audio_pipeline_websocket

# Import RTMP server
try:
    from rtmp_api import router as rtmp_router
    from rtmp_server import get_rtmp_server, start_rtmp_server, RTMPServerConfig
    RTMP_SERVER_AVAILABLE = True
except ImportError as e:
    print(f"⚠️ RTMP server not available: {e}")
    RTMP_SERVER_AVAILABLE = False

# Import SRT server
try:
    from srt_api import router as srt_router
    from srt_server import get_srt_server, start_srt_server, SRTServerConfig
    SRT_SERVER_AVAILABLE = True
except ImportError as e:
    print(f"⚠️ SRT server not available: {e}")
    SRT_SERVER_AVAILABLE = False

# Import Source Switcher
try:
    from source_switcher_api import router as source_switcher_router
    from source_switcher import get_source_switcher, SwitchingConfig
    SOURCE_SWITCHER_AVAILABLE = True
except ImportError as e:
    print(f"⚠️ Source switcher not available: {e}")
    SOURCE_SWITCHER_AVAILABLE = False

# Import Jitter Buffer
try:
    from jitter_buffer_api import router as jitter_buffer_router
    from jitter_buffer import get_jitter_buffer_manager, JitterBufferConfig
    JITTER_BUFFER_AVAILABLE = True
except ImportError as e:
    print(f"⚠️ Jitter buffer not available: {e}")
    JITTER_BUFFER_AVAILABLE = False

# Import Stream Recorder
try:
    from stream_recorder_api import router as stream_recorder_router
    from stream_recorder import get_recording_manager, RecordingConfig
    STREAM_RECORDER_AVAILABLE = True
except ImportError as e:
    print(f"⚠️ Stream recorder not available: {e}")
    STREAM_RECORDER_AVAILABLE = False

# Import startup services
from startup_services import initialize_services, shutdown_services, get_services_status

# Create FastAPI application instance
app = FastAPI(
    title="MeetingMind API",
    description="Advanced meeting management and streaming platform with OBS integration",
    version="2.0.0",
    docs_url="/api/docs",  # Swagger UI at /api/docs
    redoc_url="/api/redoc"  # ReDoc at /api/redoc
)

# Include OBS router if available
if OBS_INTEGRATION_AVAILABLE:
    app.include_router(obs_router, prefix="/api")

# Include RTMP router if available
if RTMP_SERVER_AVAILABLE:
    app.include_router(rtmp_router, prefix="/api")

# Include SRT router if available
if SRT_SERVER_AVAILABLE:
    app.include_router(srt_router, prefix="/api")

# Include Source Switcher router if available
if SOURCE_SWITCHER_AVAILABLE:
    app.include_router(source_switcher_router, prefix="/api")

# Include Jitter Buffer router if available
if JITTER_BUFFER_AVAILABLE:
    app.include_router(jitter_buffer_router, prefix="/api")

# Include Stream Recorder router if available
if STREAM_RECORDER_AVAILABLE:
    app.include_router(stream_recorder_router, prefix="/api")

# Import and include OBS Setup Guide
try:
    from obs_setup_guide_api import router as obs_setup_router
    app.include_router(obs_setup_router, prefix="/api")
    OBS_SETUP_GUIDE_AVAILABLE = True
except ImportError as e:
    print(f"⚠️ OBS Setup Guide not available: {e}")
    OBS_SETUP_GUIDE_AVAILABLE = False

# Import and include Network Diagnostics
try:
    from network_diagnostics_api import router as network_diagnostics_router
    app.include_router(network_diagnostics_router, prefix="/api")
    NETWORK_DIAGNOSTICS_AVAILABLE = True
except ImportError as e:
    print(f"⚠️ Network Diagnostics not available: {e}")
    NETWORK_DIAGNOSTICS_AVAILABLE = False

# Import and include Network Transcription
try:
    from network_transcription_api import router as network_transcription_router
    app.include_router(network_transcription_router, prefix="/api")
    NETWORK_TRANSCRIPTION_AVAILABLE = True
except ImportError as e:
    print(f"⚠️ Network Transcription not available: {e}")
    NETWORK_TRANSCRIPTION_AVAILABLE = False

# Add security middleware
app.add_middleware(SecurityHeadersMiddleware, strict_mode=False)

# Configure CORS middleware to allow frontend connections
# This enables our React frontend to communicate with the FastAPI backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],  # Vite's default port
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Enhanced WebSocket connection manager for real-time features
# This manages the WebSocket lifecycle, message broadcasting, and connection state
class ConnectionManager:
    """
    WebSocket Connection Manager
    
    This class handles all WebSocket connections for the MeetingMind application.
    It provides functionality for:
    - Managing multiple simultaneous connections
    - Broadcasting messages to all connected clients
    - Sending targeted messages to specific clients
    - Handling connection lifecycle (connect, disconnect, error handling)
    - Maintaining connection metadata for debugging and analytics
    
    WebSocket Concepts Explained:
    - WebSocket is a protocol that provides full-duplex communication over TCP
    - Unlike HTTP, connections stay open for bidirectional real-time communication
    - Perfect for features like live chat, real-time notifications, live transcription
    - Each connection maintains state until explicitly closed or network failure
    """
    
    def __init__(self):
        # Dictionary to store active connections with metadata
        # Key: connection_id, Value: {"websocket": WebSocket, "client_id": str, "connected_at": datetime}
        self.active_connections: Dict[str, Dict] = {}
        
        # Store recent messages for debugging and new client catch-up
        self.message_history: List[Dict] = []
        self.max_history = 50  # Keep last 50 messages
        
    async def connect(self, websocket: WebSocket, client_id: str) -> str:
        """
        Accept a new WebSocket connection and register it
        
        Connection Process:
        1. Accept the WebSocket handshake (HTTP -> WebSocket upgrade)
        2. Generate unique connection ID for tracking
        3. Store connection metadata
        4. Send welcome message with connection info
        5. Broadcast connection event to other clients
        6. Send recent message history to new client
        """
        await websocket.accept()
        
        # Generate unique connection ID for internal tracking
        connection_id = str(uuid.uuid4())
        
        # Store connection with metadata
        self.active_connections[connection_id] = {
            "websocket": websocket,
            "client_id": client_id,
            "connected_at": datetime.now(),
            "last_ping": datetime.now()
        }
        
        # Send welcome message to the new client
        welcome_message = {
            "type": "connection_established",
            "data": {
                "connection_id": connection_id,
                "client_id": client_id,
                "connected_at": datetime.now().isoformat(),
                "active_connections": len(self.active_connections)
            },
            "timestamp": datetime.now().isoformat()
        }
        await self.send_personal_message(json.dumps(welcome_message), websocket)
        
        # Send recent message history to new client (helps with context)
        if self.message_history:
            history_message = {
                "type": "message_history",
                "data": {
                    "messages": self.message_history[-10:],  # Last 10 messages
                    "total_messages": len(self.message_history)
                },
                "timestamp": datetime.now().isoformat()
            }
            await self.send_personal_message(json.dumps(history_message), websocket)
        
        # Notify other clients about new connection
        connection_event = {
            "type": "user_joined",
            "data": {
                "client_id": client_id,
                "active_connections": len(self.active_connections)
            },
            "timestamp": datetime.now().isoformat()
        }
        await self.broadcast_except(json.dumps(connection_event), connection_id)
        
        print(f"✅ Client {client_id} connected with connection ID: {connection_id}")
        return connection_id

    def disconnect(self, connection_id: str):
        """
        Remove a connection and clean up resources
        
        Disconnection Process:
        1. Remove from active connections
        2. Log disconnection event
        3. Notify remaining clients
        4. Clean up any connection-specific resources
        """
        if connection_id in self.active_connections:
            connection_info = self.active_connections[connection_id]
            client_id = connection_info["client_id"]
            
            # Remove from active connections
            del self.active_connections[connection_id]
            
            print(f"❌ Client {client_id} disconnected (Connection ID: {connection_id})")
            
            # Notify remaining clients about disconnection
            disconnection_event = {
                "type": "user_left",
                "data": {
                    "client_id": client_id,
                    "active_connections": len(self.active_connections)
                },
                "timestamp": datetime.now().isoformat()
            }
            # Use asyncio to run async function from sync context
            asyncio.create_task(self.broadcast(json.dumps(disconnection_event)))

    async def send_personal_message(self, message: str, websocket: WebSocket):
        """
        Send a message to a specific WebSocket connection
        
        Error Handling:
        - Catch and handle connection errors gracefully
        - Remove broken connections automatically
        - Log errors for debugging
        """
        try:
            await websocket.send_text(message)
        except Exception as e:
            print(f"❌ Error sending personal message: {e}")
            # Find and remove the broken connection
            for conn_id, conn_info in list(self.active_connections.items()):
                if conn_info["websocket"] == websocket:
                    self.disconnect(conn_id)
                    break

    async def broadcast(self, message: str):
        """
        Send a message to all connected clients
        
        Broadcasting Strategy:
        1. Iterate through all active connections
        2. Send message to each connection
        3. Handle individual connection failures
        4. Remove broken connections automatically
        5. Continue broadcasting to remaining connections
        """
        # Store message in history for new clients
        try:
            message_data = json.loads(message)
            self.message_history.append(message_data)
            
            # Keep history size manageable
            if len(self.message_history) > self.max_history:
                self.message_history = self.message_history[-self.max_history:]
        except json.JSONDecodeError:
            pass  # Skip non-JSON messages
        
        # Broadcast to all active connections
        broken_connections = []
        
        for connection_id, connection_info in self.active_connections.items():
            try:
                await connection_info["websocket"].send_text(message)
            except Exception as e:
                print(f"❌ Error broadcasting to {connection_info['client_id']}: {e}")
                broken_connections.append(connection_id)
        
        # Remove broken connections
        for conn_id in broken_connections:
            self.disconnect(conn_id)

    async def broadcast_except(self, message: str, exclude_connection_id: str):
        """
        Broadcast message to all clients except the specified connection
        Useful for events like "user joined" where we don't want to notify the user themselves
        """
        for connection_id, connection_info in self.active_connections.items():
            if connection_id != exclude_connection_id:
                try:
                    await connection_info["websocket"].send_text(message)
                except Exception as e:
                    print(f"❌ Error broadcasting to {connection_info['client_id']}: {e}")
                    self.disconnect(connection_id)

    def get_connection_stats(self) -> Dict:
        """
        Return statistics about current connections for debugging/monitoring
        """
        return {
            "active_connections": len(self.active_connections),
            "total_messages": len(self.message_history),
            "connections": {
                conn_id: {
                    "client_id": conn_info["client_id"],
                    "connected_at": conn_info["connected_at"].isoformat(),
                    "duration": str(datetime.now() - conn_info["connected_at"])
                }
                for conn_id, conn_info in self.active_connections.items()
            }
        }

# Global connection manager instance
manager = ConnectionManager()

# Basic API endpoints
@app.get("/")
async def root():
    """Root endpoint with API information"""
    return {
        "message": "Welcome to MeetingMind API",
        "version": "1.0.0",
        "docs": "/docs",
        "websocket_endpoint": "/ws/{client_id}"
    }

@app.get("/health")
async def health_check():
    """Health check endpoint for monitoring"""
    try:
        # Check database connection
        db = next(get_db())
        db.execute("SELECT 1")
        db.close()
        
        # Check OBS connection if available
        obs_status = "not_configured"
        if OBS_INTEGRATION_AVAILABLE:
            try:
                obs_client = await get_obs_client()
                obs_status = "connected" if obs_client.connected else "disconnected"
            except Exception:
                obs_status = "error"
        
        return {
            "status": "healthy",
            "version": "2.0.0",
            "database": "connected",
            "obs_integration": obs_status,
            "components": {
                "api": "active",
                "database": "connected", 
                "streaming": "available",
                "obs_websocket": obs_status,
                "transcription": "available"
            }
        }
    except Exception as e:
        raise safe_http_exception(503, "internal_error", "Service temporarily unavailable")

@app.get("/ws/stats")
async def websocket_stats():
    """Get WebSocket connection statistics for monitoring/debugging"""
    return manager.get_connection_stats()

# Enhanced WebSocket endpoint for real-time communication
@app.websocket("/ws/{client_id}")
async def websocket_endpoint(websocket: WebSocket, client_id: str):
    """
    Enhanced WebSocket endpoint for real-time meeting features
    
    This endpoint handles:
    - Connection establishment and authentication
    - Message routing and broadcasting
    - Chat functionality
    - Connection lifecycle management
    - Error handling and recovery
    
    Message Format:
    All messages follow this JSON structure:
    {
        "type": "message_type",
        "data": { ... },
        "timestamp": "ISO_timestamp"
    }
    
    Supported Message Types:
    - "chat_message": Send chat message to all users
    - "ping": Heartbeat to keep connection alive
    - "typing_start": Notify others user is typing
    - "typing_stop": Notify others user stopped typing
    - "meeting_action": Meeting-related actions (join, leave, etc.)
    - "audio_chunk_metadata": Audio chunk information
    - "audio_chunk_data": Binary audio data (base64 encoded)
    """
    
    connection_id = None
    audio_session_id = None
    
    # Validate client ID
    if not validate_client_id(client_id):
        await websocket.close(code=1008, reason="Invalid client ID format")
        return
    
    try:
        # Establish connection and get unique connection ID
        connection_id = await manager.connect(websocket, client_id)
        
        # Main message loop - keep connection alive and process messages
        while True:
            # Wait for message from client
            # receive_text() is blocking - it waits until a message arrives
            data = await websocket.receive_text()
            
            try:
                # Check rate limiting
                if not websocket_rate_limit(client_id):
                    logger.warning(f"Rate limit exceeded for {client_id}")
                    await websocket.close(code=1008, reason="Rate limit exceeded")
                    break
                
                # Validate and parse incoming message
                message = validate_websocket_message(data)
                if message is None:
                    logger.warning(f"Invalid message from {client_id}, closing connection")
                    await websocket.close(code=1008, reason="Invalid message format")
                    break
                
                message_type = message.get("type", "unknown")
                message_data = message.get("data", {})
                
                print(f"📨 Received {message_type} from {client_id}: {message_data}")
                
                # Process different message types
                if message_type == "chat_message":
                    # Handle chat messages - broadcast to all connected clients
                    # Messages are already validated by validate_websocket_message
                    chat_broadcast = {
                        "type": "chat_message",
                        "data": {
                            "message": sanitize_string(message_data.get("message", "")),
                            "sender": client_id,
                            "sender_name": sanitize_string(message_data.get("sender_name", client_id), 100),
                            "message_id": str(uuid.uuid4())
                        },
                        "timestamp": datetime.now().isoformat()
                    }
                    await manager.broadcast(json.dumps(chat_broadcast))
                
                elif message_type == "ping":
                    # Handle ping messages - respond with pong for heartbeat
                    pong_response = {
                        "type": "pong",
                        "data": {
                            "original_timestamp": message_data.get("timestamp"),
                            "server_timestamp": datetime.now().isoformat()
                        },
                        "timestamp": datetime.now().isoformat()
                    }
                    await manager.send_personal_message(json.dumps(pong_response), websocket)
                
                elif message_type == "typing_start":
                    # Handle typing indicators - notify other users
                    typing_broadcast = {
                        "type": "user_typing",
                        "data": {
                            "user": client_id,
                            "user_name": message_data.get("user_name", client_id),
                            "is_typing": True
                        },
                        "timestamp": datetime.now().isoformat()
                    }
                    await manager.broadcast_except(json.dumps(typing_broadcast), connection_id)
                
                elif message_type == "typing_stop":
                    # Handle stop typing - notify other users
                    typing_broadcast = {
                        "type": "user_typing",
                        "data": {
                            "user": client_id,
                            "user_name": message_data.get("user_name", client_id),
                            "is_typing": False
                        },
                        "timestamp": datetime.now().isoformat()
                    }
                    await manager.broadcast_except(json.dumps(typing_broadcast), connection_id)
                
                elif message_type == "meeting_action":
                    # Handle meeting-related actions
                    action = message_data.get("action", "")
                    action_broadcast = {
                        "type": "meeting_event",
                        "data": {
                            "action": action,
                            "user": client_id,
                            "user_name": message_data.get("user_name", client_id),
                            "details": message_data.get("details", {})
                        },
                        "timestamp": datetime.now().isoformat()
                    }
                    await manager.broadcast(json.dumps(action_broadcast))
                
                elif message_type == "audio_start_session":
                    # Handle audio session initialization
                    if not audio_upload_rate_limit(client_id):
                        error_response = {
                            "type": "audio_session_error",
                            "data": {"error": "Audio upload rate limit exceeded"},
                            "timestamp": datetime.now().isoformat()
                        }
                        await manager.send_personal_message(json.dumps(error_response), websocket)
                        continue
                    
                    try:
                        audio_config = message_data.get("config", {})
                        audio_session_id = await audio_processor.create_session(client_id, audio_config)
                        
                        session_response = {
                            "type": "audio_session_started",
                            "data": {
                                "session_id": audio_session_id,
                                "client_id": client_id,
                                "config": audio_config
                            },
                            "timestamp": datetime.now().isoformat()
                        }
                        await manager.send_personal_message(json.dumps(session_response), websocket)
                        
                    except Exception as e:
                        error_response = {
                            "type": "audio_session_error",
                            "data": {
                                "error": str(e),
                                "client_id": client_id
                            },
                            "timestamp": datetime.now().isoformat()
                        }
                        await manager.send_personal_message(json.dumps(error_response), websocket)
                
                elif message_type == "audio_chunk_metadata":
                    # Handle audio chunk metadata
                    if audio_session_id:
                        result = await audio_processor.process_chunk_metadata(audio_session_id, message_data)
                        
                        metadata_response = {
                            "type": "audio_metadata_ack",
                            "data": result,
                            "timestamp": datetime.now().isoformat()
                        }
                        await manager.send_personal_message(json.dumps(metadata_response), websocket)
                    else:
                        error_response = {
                            "type": "error",
                            "data": {"error": "No active audio session"},
                            "timestamp": datetime.now().isoformat()
                        }
                        await manager.send_personal_message(json.dumps(error_response), websocket)
                
                elif message_type == "audio_chunk_data":
                    # Handle audio chunk binary data
                    if audio_session_id:
                        result = await audio_processor.process_chunk_data(audio_session_id, message_data)
                        
                        processing_response = {
                            "type": "audio_processing_response",
                            "data": result,
                            "timestamp": datetime.now().isoformat()
                        }
                        await manager.send_personal_message(json.dumps(processing_response), websocket)
                    else:
                        error_response = {
                            "type": "error",
                            "data": {"error": "No active audio session"},
                            "timestamp": datetime.now().isoformat()
                        }
                        await manager.send_personal_message(json.dumps(error_response), websocket)
                
                else:
                    # Handle unknown message types - echo back with warning
                    echo_response = {
                        "type": "echo",
                        "data": {
                            "original_message": message,
                            "warning": f"Unknown message type: {message_type}"
                        },
                        "timestamp": datetime.now().isoformat()
                    }
                    await manager.send_personal_message(json.dumps(echo_response), websocket)
                    
            except json.JSONDecodeError as e:
                # Handle invalid JSON messages
                error_response = {
                    "type": "error",
                    "data": {
                        "error": "Invalid JSON format",
                        "details": str(e),
                        "received_data": data
                    },
                    "timestamp": datetime.now().isoformat()
                }
                await manager.send_personal_message(json.dumps(error_response), websocket)
                
            except Exception as e:
                # Handle other message processing errors
                error_response = {
                    "type": "error",
                    "data": {
                        "error": "Message processing error",
                        "details": str(e)
                    },
                    "timestamp": datetime.now().isoformat()
                }
                await manager.send_personal_message(json.dumps(error_response), websocket)
            
    except WebSocketDisconnect:
        # Handle normal disconnection (user closes browser, network issue, etc.)
        print(f"🔌 WebSocket disconnected for client {client_id}")
        if connection_id:
            manager.disconnect(connection_id)
            
    except Exception as e:
        # Handle unexpected errors
        print(f"💥 Unexpected error in WebSocket for client {client_id}: {e}")
        if connection_id:
            manager.disconnect(connection_id)

# Audio Pipeline WebSocket endpoint
@app.websocket("/ws/audio-pipeline/{client_id}")
async def audio_pipeline_websocket_endpoint(websocket: WebSocket, client_id: str = None):
    """
    WebSocket endpoint for unified audio pipeline
    
    This endpoint handles:
    - Local browser audio capture coordination
    - Network audio stream reception (RTMP/SRT from OBS)
    - Audio chunk processing and forwarding
    - Real-time audio metrics and visualization data
    - Automatic source switching coordination
    
    Message Types:
    - start_network_source: Start receiving from RTMP/SRT stream
    - stop_network_source: Stop receiving from network stream
    - audio_chunks: Process audio chunks from frontend
    - get_source_status: Get status of all audio sources
    - update_source_config: Update audio source configuration
    
    Response Types:
    - network_audio: Audio chunk from network source
    - source_status: Status update for audio source
    - metrics_update: Real-time audio metrics
    - error: Error messages
    """
    await handle_audio_pipeline_websocket(websocket, client_id)

# Audio processing endpoints
@app.get("/audio/stats")
async def get_audio_stats():
    """Get global audio processing statistics"""
    return audio_processor.get_global_stats()

@app.get("/audio/sessions")
async def get_audio_sessions():
    """Get information about active audio sessions"""
    return {
        "active_sessions": len(audio_processor.active_sessions),
        "sessions": [
            session.get_statistics() 
            for session in audio_processor.active_sessions.values()
        ]
    }

@app.get("/audio/sessions/{session_id}")
async def get_audio_session_stats(session_id: str):
    """Get detailed statistics for a specific audio session"""
    stats = await audio_processor.get_session_stats(session_id)
    if stats:
        return stats
    else:
        return {"error": "Session not found"}

# Transcription Service Endpoints
@app.get("/transcription/models")
async def get_available_models():
    """Get available Whisper models and their specifications"""
    try:
        models = await transcription_service.get_available_models()
        system_info = await transcription_service.get_system_info()
        
        return {
            "models": models,
            "system_info": system_info,
            "current_model": system_info.get("current_model"),
            "device": system_info.get("device"),
            "cuda_available": system_info.get("cuda_available")
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get models: {str(e)}")

@app.post("/transcription/load-model")
async def load_transcription_model(model_size: str):
    """Load a specific Whisper model"""
    try:
        # Validate model size
        try:
            model_enum = WhisperModelSize(model_size)
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid model size: {model_size}")
        
        success = await transcription_service.load_model(model_enum, force_reload=True)
        
        if success:
            return {
                "message": f"Model {model_size} loaded successfully",
                "model": model_size,
                "device": transcription_service.device
            }
        else:
            raise HTTPException(status_code=500, detail=f"Failed to load model {model_size}")
            
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error loading model: {str(e)}")

@app.post("/transcription/process-chunk")
async def process_audio_chunk_sync(
    session_id: str,
    audio_data: str,  # base64 encoded
    sample_rate: int = 16000,
    model_size: str = "base",
    language: Optional[str] = None,
    priority: str = "normal"
):
    """Process an audio chunk synchronously (for testing/immediate results)"""
    try:
        # Validate inputs
        try:
            model_enum = WhisperModelSize(model_size)
            priority_enum = QueuePriority[priority.upper()]
        except (ValueError, KeyError):
            raise HTTPException(status_code=400, detail="Invalid model size or priority")
        
        # Create transcription config
        config = TranscriptionConfig(
            model_size=model_enum,
            language=language,
            word_timestamps=True,
            vad_filter=True
        )
        
        # Process directly (bypass queue for sync processing)
        import base64
        audio_bytes = base64.b64decode(audio_data)
        
        result = await transcription_service.transcribe_audio_chunk(
            session_id=session_id,
            audio_chunk_id=str(uuid.uuid4()),
            audio_data=audio_bytes,
            config=config,
            sample_rate=sample_rate
        )
        
        return {
            "session_id": result.session_id,
            "audio_chunk_id": result.audio_chunk_id,
            "language": result.language,
            "language_probability": result.language_probability,
            "full_text": result.full_text,
            "segments": [
                {
                    "id": seg.id,
                    "start_time": seg.start_time,
                    "end_time": seg.end_time,
                    "text": seg.text,
                    "words": seg.words,
                    "confidence": 1 - seg.no_speech_prob
                }
                for seg in result.segments
            ],
            "metrics": {
                "processing_time_ms": result.metrics.processing_time_ms,
                "audio_duration_ms": result.metrics.audio_duration_ms,
                "real_time_factor": result.metrics.real_time_factor,
                "words_per_second": result.metrics.words_per_second,
                "confidence_score": result.metrics.confidence_score
            },
            "timestamp": result.timestamp.isoformat()
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Transcription failed: {str(e)}")

@app.post("/transcription/enqueue-chunk")
async def enqueue_audio_chunk(
    session_id: str,
    audio_data: str,  # base64 encoded
    sample_rate: int = 16000,
    model_size: str = "base",
    language: Optional[str] = None,
    priority: str = "normal",
    meeting_id: Optional[str] = None
):
    """Add an audio chunk to the processing queue"""
    try:
        # Validate inputs
        try:
            model_enum = WhisperModelSize(model_size)
            priority_enum = QueuePriority[priority.upper()]
        except (ValueError, KeyError):
            raise HTTPException(status_code=400, detail="Invalid model size or priority")
        
        # Create transcription config
        config = TranscriptionConfig(
            model_size=model_enum,
            language=language,
            word_timestamps=True,
            vad_filter=True
        )
        
        # Enqueue for processing
        chunk_id = await queue_manager.enqueue_audio_chunk(
            session_id=session_id,
            audio_data=audio_data,
            sample_rate=sample_rate,
            config=config,
            meeting_id=meeting_id,
            priority=priority_enum
        )
        
        # Get queue position
        position = await queue_manager.get_queue_position(chunk_id)
        
        return {
            "chunk_id": chunk_id,
            "session_id": session_id,
            "status": "queued",
            "position": position,
            "estimated_wait_time": await queue_manager._estimate_queue_wait_time()
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to enqueue chunk: {str(e)}")

@app.get("/transcription/chunk-status/{chunk_id}")
async def get_chunk_status(chunk_id: str):
    """Get the status of a queued audio chunk"""
    try:
        status = await queue_manager.get_chunk_status(chunk_id)
        
        if not status:
            raise HTTPException(status_code=404, detail="Chunk not found")
        
        return status
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get chunk status: {str(e)}")

@app.delete("/transcription/chunk/{chunk_id}")
async def cancel_chunk(chunk_id: str):
    """Cancel a queued audio chunk"""
    try:
        success = await queue_manager.cancel_chunk(chunk_id)
        
        if success:
            return {"message": f"Chunk {chunk_id} cancelled successfully"}
        else:
            raise HTTPException(status_code=404, detail="Chunk not found or cannot be cancelled")
            
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to cancel chunk: {str(e)}")

@app.get("/transcription/queue/stats")
async def get_queue_stats():
    """Get transcription queue statistics"""
    try:
        stats = await queue_manager.get_queue_stats()
        return stats
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get queue stats: {str(e)}")

@app.get("/transcription/session/{session_id}/metrics")
async def get_session_metrics(session_id: str):
    """Get aggregated metrics for a transcription session"""
    try:
        metrics = await transcription_service.get_session_metrics(session_id)
        return metrics
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get session metrics: {str(e)}")

@app.get("/transcription/system-info")
async def get_transcription_system_info():
    """Get detailed system information for transcription setup"""
    try:
        system_info = await transcription_service.get_system_info()
        queue_stats = await queue_manager.get_queue_stats()
        
        return {
            "transcription_service": system_info,
            "queue_manager": {
                "max_workers": queue_manager.max_workers,
                "current_workers": len(queue_manager.workers),
                "is_running": queue_manager.is_running,
                "stats": queue_stats
            },
            "recommendations": await _get_system_recommendations(system_info)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get system info: {str(e)}")

async def _get_system_recommendations(system_info: Dict[str, Any]) -> List[str]:
    """Generate system optimization recommendations"""
    recommendations = []
    
    if not system_info.get("cuda_available"):
        recommendations.append("Consider installing CUDA for GPU acceleration")
    
    gpu_memory = system_info.get("gpu_memory_total", 0)
    if gpu_memory > 0 and gpu_memory < 4:
        recommendations.append("Limited GPU memory detected, consider using smaller models (tiny/base)")
    elif gpu_memory >= 8:
        recommendations.append("Sufficient GPU memory for larger models (medium/large)")
    
    if system_info.get("device") == "cpu":
        recommendations.append("CPU inference detected, expect slower processing times")
    
    current_model = system_info.get("current_model")
    if not current_model:
        recommendations.append("No model loaded, load a model to start transcription")
    
    return recommendations

# Cloud Transcription Service Endpoints
@app.get("/cloud-transcription/providers")
async def get_cloud_providers():
    """Get status and information about all cloud transcription providers"""
    try:
        stats = cloud_transcription_service.get_provider_stats()
        cost_summary = cloud_transcription_service.get_cost_summary()
        
        return {
            "providers": stats,
            "cost_summary": cost_summary,
            "timestamp": datetime.now().isoformat()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get provider stats: {str(e)}")

@app.post("/cloud-transcription/transcribe")
async def cloud_transcribe_audio(
    session_id: str,
    audio_data: str,  # base64 encoded
    audio_duration: float,
    preferred_providers: Optional[List[str]] = None,
    reference_text: Optional[str] = None
):
    """Transcribe audio using cloud providers with fallback"""
    try:
        # Convert provider strings to enums
        provider_enums = []
        if preferred_providers:
            for provider_str in preferred_providers:
                try:
                    provider_enums.append(TranscriptionProvider(provider_str))
                except ValueError:
                    logger.warning(f"Unknown provider: {provider_str}")
        
        # Decode audio data
        import base64
        audio_bytes = base64.b64decode(audio_data)
        
        # Submit transcription job
        job = await cloud_transcription_service.transcribe_with_fallback(
            session_id=session_id,
            audio_chunk_id=str(uuid.uuid4()),
            audio_data=audio_bytes,
            audio_duration=audio_duration,
            preferred_providers=provider_enums or None,
            comparison_mode=False
        )
        
        return {
            "job_id": job.id,
            "session_id": job.session_id,
            "status": "completed" if job.completed_at else "processing",
            "attempts": len(job.attempts),
            "successful_attempts": len([a for a in job.attempts if a.success]),
            "total_cost": job.total_cost,
            "result": {
                "full_text": job.final_result.full_text if job.final_result else None,
                "language": job.final_result.language if job.final_result else None,
                "confidence": job.final_result.metrics.confidence_score if job.final_result else 0.0
            } if job.final_result else None
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Cloud transcription failed: {str(e)}")

@app.post("/cloud-transcription/battle")
async def start_transcription_battle(
    session_id: str,
    audio_data: str,  # base64 encoded
    audio_duration: float,
    providers: List[str],
    reference_text: Optional[str] = None
):
    """Start a transcription battle comparing multiple providers"""
    try:
        # Convert provider strings to enums
        provider_enums = []
        for provider_str in providers:
            try:
                provider_enums.append(TranscriptionProvider(provider_str))
            except ValueError:
                raise HTTPException(status_code=400, detail=f"Unknown provider: {provider_str}")
        
        # Decode audio data
        import base64
        audio_bytes = base64.b64decode(audio_data)
        
        # Submit battle job (comparison mode)
        job = await cloud_transcription_service.transcribe_with_fallback(
            session_id=session_id,
            audio_chunk_id=str(uuid.uuid4()),
            audio_data=audio_bytes,
            audio_duration=audio_duration,
            preferred_providers=provider_enums,
            comparison_mode=True
        )
        
        return {
            "job_id": job.id,
            "session_id": job.session_id,
            "providers": [p.value for p in provider_enums],
            "status": "completed" if job.completed_at else "processing",
            "reference_text": reference_text
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Battle start failed: {str(e)}")

@app.get("/cloud-transcription/battle/{job_id}/status")
async def get_battle_status(job_id: str):
    """Get status of a transcription battle"""
    try:
        job = await cloud_transcription_service.get_job_status(job_id)
        
        if not job:
            raise HTTPException(status_code=404, detail="Battle job not found")
        
        # Format attempts for response
        attempts = []
        for attempt in job.attempts:
            attempts.append({
                "provider": attempt.provider.value,
                "success": attempt.success,
                "error_message": attempt.error_message,
                "cost": attempt.cost,
                "processing_time": attempt.processing_time,
                "confidence": attempt.confidence_score,
                "result": {
                    "full_text": attempt.result.full_text if attempt.result else None,
                    "segments": len(attempt.result.segments) if attempt.result else 0,
                    "metrics": {
                        "confidence_score": attempt.result.metrics.confidence_score,
                        "processing_time_ms": attempt.result.metrics.processing_time_ms,
                        "word_count": len(attempt.result.full_text.split()) if attempt.result and attempt.result.full_text else 0
                    } if attempt.result else None
                } if attempt.result else None
            })
        
        return {
            "job_id": job.id,
            "session_id": job.session_id,
            "created_at": job.created_at.isoformat(),
            "completed_at": job.completed_at.isoformat() if job.completed_at else None,
            "total_cost": job.total_cost,
            "attempts": attempts
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get battle status: {str(e)}")

@app.get("/cloud-transcription/battle/{job_id}/comparison")
async def get_battle_comparison(job_id: str):
    """Get detailed comparison analysis of battle results"""
    try:
        job = await cloud_transcription_service.get_job_status(job_id)
        
        if not job:
            raise HTTPException(status_code=404, detail="Battle job not found")
        
        if not job.completed_at:
            raise HTTPException(status_code=400, detail="Battle not yet completed")
        
        # Analyze results using accuracy analyzer
        comparison_result = await accuracy_analyzer.analyze_transcription_job(job)
        
        # Format response
        results = []
        for attempt in job.attempts:
            if attempt.success and attempt.result:
                provider_metrics = comparison_result.provider_results.get(attempt.provider)
                
                results.append({
                    "provider": attempt.provider.value,
                    "text": attempt.result.full_text,
                    "segments": [
                        {
                            "id": seg.id,
                            "text": seg.text,
                            "start_time": seg.start_time,
                            "end_time": seg.end_time,
                            "confidence": 1.0 - seg.no_speech_prob,
                            "words": seg.words
                        }
                        for seg in attempt.result.segments
                    ],
                    "metrics": {
                        "word_error_rate": provider_metrics.word_error_rate if provider_metrics else 0.0,
                        "character_error_rate": provider_metrics.character_error_rate if provider_metrics else 0.0,
                        "bleu_score": provider_metrics.bleu_score if provider_metrics else 0.0,
                        "confidence_score": attempt.result.metrics.confidence_score,
                        "processing_time_ms": attempt.result.metrics.processing_time_ms,
                        "cost": attempt.cost
                    }
                })
        
        # Calculate winners for different categories
        speed_winner = min(job.attempts, key=lambda a: a.processing_time if a.success else float('inf'))
        cost_winner = min([a for a in job.attempts if a.success], key=lambda a: a.cost if a.cost > 0 else float('inf'), default=None)
        accuracy_winner = comparison_result.best_provider if comparison_result.best_provider else None
        
        return {
            "job_id": job.id,
            "reference_text": comparison_result.reference_text,
            "results": results,
            "rankings": [
                {
                    "provider": provider.value,
                    "score": score,
                    "rank": idx + 1
                }
                for idx, (provider, score) in enumerate(comparison_result.rankings)
            ],
            "winner": comparison_result.best_provider.value if comparison_result.best_provider else "none",
            "analysis": {
                "total_cost": job.total_cost,
                "avg_accuracy": statistics.mean([
                    metrics.word_accuracy 
                    for metrics in comparison_result.provider_results.values()
                ]) if comparison_result.provider_results else 0.0,
                "speed_winner": speed_winner.provider.value if speed_winner.success else "none",
                "accuracy_winner": accuracy_winner.value if accuracy_winner else "none",
                "cost_winner": cost_winner.provider.value if cost_winner else "none"
            },
            "cost_effectiveness": comparison_result.cost_effectiveness,
            "detailed_analysis": comparison_result.detailed_analysis,
            "timestamp": comparison_result.timestamp.isoformat()
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get battle comparison: {str(e)}")

@app.get("/cloud-transcription/costs")
async def get_transcription_costs():
    """Get cost summary and breakdown across all providers"""
    try:
        cost_summary = cloud_transcription_service.get_cost_summary()
        
        # Add provider cost configurations
        provider_configs = {}
        for provider, config in cloud_transcription_service.provider_configs.items():
            if config.cost_config:
                provider_configs[provider.value] = {
                    "cost_per_minute": config.cost_config.cost_per_minute,
                    "cost_per_request": config.cost_config.cost_per_request,
                    "free_tier_minutes": config.cost_config.free_tier_minutes,
                    "billing_increment": config.cost_config.billing_increment,
                    "currency": config.cost_config.currency
                }
        
        return {
            "summary": cost_summary,
            "provider_configs": provider_configs,
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get cost information: {str(e)}")

@app.post("/cloud-transcription/benchmark")
async def run_transcription_benchmark(
    providers: List[str],
    test_cases: Optional[List[str]] = None
):
    """Run benchmark tests comparing transcription providers"""
    try:
        # Convert provider strings to enums
        provider_enums = []
        for provider_str in providers:
            try:
                provider_enums.append(TranscriptionProvider(provider_str))
            except ValueError:
                raise HTTPException(status_code=400, detail=f"Unknown provider: {provider_str}")
        
        # Run benchmark tests
        benchmark_results = await accuracy_analyzer.run_benchmark_test(provider_enums)
        
        # Format results
        formatted_results = {}
        for test_name, comparison_result in benchmark_results.items():
            formatted_results[test_name] = {
                "reference_text": comparison_result.reference_text,
                "rankings": [
                    {
                        "provider": provider.value,
                        "score": score,
                        "rank": idx + 1
                    }
                    for idx, (provider, score) in enumerate(comparison_result.rankings)
                ],
                "winner": comparison_result.best_provider.value if comparison_result.best_provider else "none",
                "metrics": {
                    provider.value: {
                        "word_accuracy": metrics.word_accuracy,
                        "word_error_rate": metrics.word_error_rate,
                        "bleu_score": metrics.bleu_score,
                        "confidence_score": metrics.confidence_score
                    }
                    for provider, metrics in comparison_result.provider_results.items()
                }
            }
        
        return {
            "benchmark_results": formatted_results,
            "test_cases": list(benchmark_results.keys()),
            "providers_tested": [p.value for p in provider_enums],
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Benchmark test failed: {str(e)}")

# Meeting-related endpoints (enhanced with WebSocket integration)
@app.get("/meetings")
async def get_meetings():
    """Get all meetings"""
    return {"meetings": []}

@app.post("/meetings")
async def create_meeting():
    """Create a new meeting"""
    return {"message": "Meeting created"}

# Pydantic models for AI provider requests
class TextGenerationRequest(BaseModel):
    prompt: str
    provider_id: Optional[str] = None
    model: Optional[str] = None
    max_tokens: Optional[int] = None
    temperature: Optional[float] = 0.7

class ChatCompletionRequest(BaseModel):
    messages: List[Dict[str, str]]
    provider_id: Optional[str] = None
    model: Optional[str] = None
    max_tokens: Optional[int] = None
    temperature: Optional[float] = 0.7

class ProviderTestRequest(BaseModel):
    provider_id: str
    test_prompt: Optional[str] = "Hello, how are you?"

# AI Provider endpoints
@app.get("/ai/providers")
async def get_providers(ai_registry = Depends(get_registry)):
    """Get status and information about all configured AI providers"""
    try:
        return ai_registry.get_provider_status()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get provider status: {str(e)}")

@app.get("/ai/providers/usage")
async def get_usage_summary(ai_registry = Depends(get_registry)):
    """Get aggregated usage summary across all providers"""
    try:
        return ai_registry.get_usage_summary()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get usage summary: {str(e)}")

@app.get("/ai/providers/{provider_id}")
async def get_provider_details(provider_id: str, ai_registry = Depends(get_registry)):
    """Get detailed information about a specific provider"""
    try:
        status = ai_registry.get_provider_status()
        if provider_id not in status:
            raise HTTPException(status_code=404, detail=f"Provider '{provider_id}' not found")
        return status[provider_id]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get provider details: {str(e)}")

@app.post("/ai/providers/{provider_id}/test")
async def test_provider(provider_id: str, request: ProviderTestRequest, ai_registry = Depends(get_registry)):
    """Test a specific AI provider with a test prompt"""
    try:
        result = await ai_registry.test_provider(request.provider_id, request.test_prompt)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to test provider: {str(e)}")

@app.post("/ai/generate")
async def generate_text(request: TextGenerationRequest, ai_registry = Depends(get_registry)):
    """Generate text using the specified or best available AI provider"""
    try:
        response = await ai_registry.generate_text(
            prompt=request.prompt,
            provider_id=request.provider_id,
            model=request.model,
            max_tokens=request.max_tokens,
            temperature=request.temperature
        )
        
        # Get provider used for response metadata
        provider = await ai_registry.get_provider(request.provider_id)
        provider_info = None
        if provider:
            for pid, pconfig in ai_registry.provider_configs.items():
                if ai_registry.providers[pid] == provider:
                    provider_info = {"id": pid, "name": pconfig["name"], "type": pconfig["type"]}
                    break
        
        return {
            "response": response,
            "provider_used": provider_info,
            "request_id": str(uuid.uuid4()),
            "timestamp": datetime.now().isoformat()
        }
        
    except RuntimeError as e:
        if "No available providers" in str(e):
            raise HTTPException(status_code=503, detail="No AI providers are currently available")
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate text: {str(e)}")

@app.post("/ai/chat")
async def chat_completion(request: ChatCompletionRequest, ai_registry = Depends(get_registry)):
    """Generate chat completion using the specified or best available AI provider"""
    try:
        response = await ai_registry.chat_completion(
            messages=request.messages,
            provider_id=request.provider_id,
            model=request.model,
            max_tokens=request.max_tokens,
            temperature=request.temperature
        )
        
        # Get provider used for response metadata
        provider = await ai_registry.get_provider(request.provider_id)
        provider_info = None
        if provider:
            for pid, pconfig in ai_registry.provider_configs.items():
                if ai_registry.providers[pid] == provider:
                    provider_info = {"id": pid, "name": pconfig["name"], "type": pconfig["type"]}
                    break
        
        return {
            **response,
            "provider_used": provider_info,
            "request_id": str(uuid.uuid4()),
            "timestamp": datetime.now().isoformat()
        }
        
    except RuntimeError as e:
        if "No available providers" in str(e):
            raise HTTPException(status_code=503, detail="No AI providers are currently available")
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate chat completion: {str(e)}")

@app.post("/ai/reload-config")
async def reload_ai_config(ai_registry = Depends(get_registry)):
    """Reload AI provider configuration from file"""
    try:
        await initialize_registry()
        return {
            "message": "AI provider configuration reloaded successfully",
            "providers_loaded": len(ai_registry.providers),
            "timestamp": datetime.now().isoformat()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to reload configuration: {str(e)}")

@app.get("/ai/health")
async def get_health_summary(ai_registry = Depends(get_registry)):
    """Get overall health summary of all AI providers"""
    try:
        status = ai_registry.get_provider_status()
        
        total_providers = len(status)
        healthy_providers = sum(1 for p in status.values() if p["health"]["status"] == "healthy")
        unhealthy_providers = sum(1 for p in status.values() if p["health"]["status"] == "unhealthy")
        degraded_providers = sum(1 for p in status.values() if p["health"]["status"] == "degraded")
        
        # Calculate overall system health score
        if total_providers == 0:
            health_score = 100
        else:
            health_score = (healthy_providers + (degraded_providers * 0.5)) / total_providers * 100
        
        # Get average response time across all providers
        response_times = [p["health"]["response_time_ms"] for p in status.values() if p["health"]["response_time_ms"] > 0]
        avg_response_time = sum(response_times) / len(response_times) if response_times else 0
        
        # Calculate total uptime
        uptimes = [p["health"]["uptime_percentage"] for p in status.values()]
        avg_uptime = sum(uptimes) / len(uptimes) if uptimes else 100
        
        return {
            "system_health": {
                "health_score": round(health_score, 1),
                "overall_status": "healthy" if health_score >= 80 else "degraded" if health_score >= 50 else "unhealthy",
                "average_uptime": round(avg_uptime, 2),
                "average_response_time_ms": round(avg_response_time, 1)
            },
            "provider_summary": {
                "total": total_providers,
                "healthy": healthy_providers,
                "degraded": degraded_providers,
                "unhealthy": unhealthy_providers,
                "enabled": sum(1 for p in status.values() if p["enabled"])
            },
            "timestamp": datetime.now().isoformat()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get health summary: {str(e)}")

@app.post("/ai/providers/{provider_id}/health-check")
async def manual_health_check(provider_id: str, ai_registry = Depends(get_registry)):
    """Manually trigger a health check for a specific provider"""
    try:
        if provider_id not in ai_registry.providers:
            raise HTTPException(status_code=404, detail=f"Provider '{provider_id}' not found")
        
        provider = ai_registry.providers[provider_id]
        start_time = time.time()
        
        try:
            result = await provider.health_check()
            response_time_ms = (time.time() - start_time) * 1000
            
            return {
                "provider_id": provider_id,
                "health_check_result": result,
                "response_time_ms": round(response_time_ms, 1),
                "status": provider.health_metrics.status.value,
                "consecutive_failures": provider.health_metrics.consecutive_failures,
                "timestamp": datetime.now().isoformat()
            }
        except Exception as health_error:
            response_time_ms = (time.time() - start_time) * 1000
            return {
                "provider_id": provider_id,
                "health_check_result": False,
                "response_time_ms": round(response_time_ms, 1),
                "error": str(health_error),
                "status": provider.health_metrics.status.value,
                "consecutive_failures": provider.health_metrics.consecutive_failures,
                "timestamp": datetime.now().isoformat()
            }
            
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to perform health check: {str(e)}")

@app.get("/ai/providers/{provider_id}/health-history")
async def get_provider_health_history(provider_id: str, hours: int = 24, ai_registry = Depends(get_registry)):
    """Get health check history for a specific provider"""
    try:
        if provider_id not in ai_registry.providers:
            raise HTTPException(status_code=404, detail=f"Provider '{provider_id}' not found")
        
        provider = ai_registry.providers[provider_id]
        
        # This is a placeholder - in a real implementation, you'd store health check history
        # in a database or time-series database like InfluxDB
        return {
            "provider_id": provider_id,
            "current_metrics": {
                "status": provider.health_metrics.status.value,
                "check_count": provider.health_metrics.check_count,
                "success_count": provider.health_metrics.success_count,
                "uptime_percentage": provider.health_metrics.uptime_percentage,
                "average_response_time": provider.health_metrics.average_response_time,
                "consecutive_failures": provider.health_metrics.consecutive_failures,
                "last_check": provider.health_metrics.last_check_timestamp.isoformat() if provider.health_metrics.last_check_timestamp else None,
                "last_success": provider.health_metrics.last_success_timestamp.isoformat() if provider.health_metrics.last_success_timestamp else None
            },
            "note": f"Historical data for the last {hours} hours would be stored in a time-series database in production",
            "timestamp": datetime.now().isoformat()
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get health history: {str(e)}")

@app.post("/ai/providers/{provider_id}/reset-health")
async def reset_provider_health(provider_id: str, ai_registry = Depends(get_registry)):
    """Reset health metrics for a specific provider"""
    try:
        if provider_id not in ai_registry.providers:
            raise HTTPException(status_code=404, detail=f"Provider '{provider_id}' not found")
        
        provider = ai_registry.providers[provider_id]
        
        # Reset health metrics
        provider.health_metrics.consecutive_failures = 0
        provider.health_metrics.check_count = 0
        provider.health_metrics.success_count = 0
        provider.health_metrics.uptime_percentage = 100.0
        provider.health_metrics.average_response_time = 0.0
        provider.health_metrics.error_message = None
        provider.health_metrics.status = ProviderStatus.UNKNOWN
        
        return {
            "message": f"Health metrics reset for provider '{provider_id}'",
            "provider_id": provider_id,
            "timestamp": datetime.now().isoformat()
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to reset health metrics: {str(e)}")

# Database Health and Management Endpoints
@app.get("/db/health")
async def get_database_health():
    """Get database health status and connection information"""
    try:
        health_info = db_manager.health_check()
        return health_info
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database health check failed: {str(e)}")

@app.get("/db/stats")
async def get_database_stats(db: Session = Depends(get_db)):
    """Get database statistics and table information"""
    try:
        from database import DatabaseUtils
        table_counts = DatabaseUtils.get_table_row_counts(db)
        
        return {
            "table_row_counts": table_counts,
            "total_records": sum(table_counts.values()),
            "timestamp": datetime.now().isoformat()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get database stats: {str(e)}")

# Meeting Management Endpoints
@app.post("/meetings", response_model=dict)
async def create_meeting(meeting: MeetingCreate, db: Session = Depends(get_db)):
    """Create a new meeting with optional participants"""
    try:
        db_meeting = meeting_crud.create_with_participants(db, meeting_data=meeting)
        return {
            "id": str(db_meeting.id),
            "title": db_meeting.title,
            "meeting_number": db_meeting.meeting_number,
            "status": db_meeting.status.value,
            "scheduled_start": db_meeting.scheduled_start.isoformat(),
            "scheduled_end": db_meeting.scheduled_end.isoformat(),
            "created_at": db_meeting.created_at.isoformat()
        }
    except ValidationError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except ConflictError as e:
        raise HTTPException(status_code=409, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create meeting: {str(e)}")

@app.get("/meetings")
async def get_meetings(
    page: int = 1,
    page_size: int = 20,
    sort_by: str = "created_at",
    sort_order: str = "desc",
    status: Optional[str] = None,
    created_by: Optional[str] = None,
    organization_id: Optional[str] = None,
    search: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Get meetings with filtering and pagination"""
    try:
        # Parse status filter
        status_filter = None
        if status:
            try:
                status_filter = [MeetingStatus(status)]
            except ValueError:
                raise HTTPException(status_code=400, detail=f"Invalid status: {status}")
        
        # Create filter and pagination objects
        filters = MeetingFilters(
            status=status_filter,
            created_by=created_by,
            organization_id=organization_id,
            search=search
        )
        
        pagination = PaginationParams(
            page=page,
            page_size=page_size,
            sort_by=sort_by,
            sort_order=sort_order
        )
        
        result = meeting_crud.get_filtered(db, filters, pagination)
        
        # Format meetings for response
        meetings = []
        for meeting in result["meetings"]:
            meetings.append({
                "id": str(meeting.id),
                "title": meeting.title,
                "description": meeting.description,
                "meeting_number": meeting.meeting_number,
                "status": meeting.status.value,
                "scheduled_start": meeting.scheduled_start.isoformat(),
                "scheduled_end": meeting.scheduled_end.isoformat(),
                "participant_count": meeting.participant_count,
                "created_by": meeting.created_by,
                "created_at": meeting.created_at.isoformat()
            })
        
        return {
            "meetings": meetings,
            "pagination": {
                "total_count": result["total_count"],
                "total_pages": result["total_pages"],
                "current_page": result["current_page"],
                "page_size": result["page_size"],
                "has_next": result["has_next"],
                "has_prev": result["has_prev"]
            }
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get meetings: {str(e)}")

@app.get("/meetings/{meeting_id}")
async def get_meeting(meeting_id: str, db: Session = Depends(get_db)):
    """Get a specific meeting with all related data"""
    try:
        meeting = meeting_crud.get_with_relationships(db, meeting_id)
        if not meeting:
            raise HTTPException(status_code=404, detail="Meeting not found")
        
        # Format participants
        participants = []
        for participant in meeting.participants:
            participants.append({
                "id": str(participant.id),
                "email": participant.email,
                "display_name": participant.display_name,
                "role": participant.role.value,
                "status": participant.status.value,
                "speaking_time_seconds": participant.speaking_time_seconds,
                "engagement_score": participant.engagement_score,
                "joined_at": participant.joined_at.isoformat() if participant.joined_at else None,
                "left_at": participant.left_at.isoformat() if participant.left_at else None
            })
        
        # Format insights
        insights = []
        for insight in meeting.insights:
            insights.append({
                "id": str(insight.id),
                "insight_type": insight.insight_type.value,
                "title": insight.title,
                "content": insight.content,
                "confidence_score": insight.confidence_score,
                "ai_model": insight.ai_model,
                "is_action_required": insight.is_action_required,
                "created_at": insight.created_at.isoformat()
            })
        
        # Format tags
        tags = [{"id": str(tag.id), "name": tag.name, "color": tag.color} for tag in meeting.tags]
        
        return {
            "id": str(meeting.id),
            "title": meeting.title,
            "description": meeting.description,
            "meeting_number": meeting.meeting_number,
            "status": meeting.status.value,
            "scheduled_start": meeting.scheduled_start.isoformat(),
            "scheduled_end": meeting.scheduled_end.isoformat(),
            "actual_start": meeting.actual_start.isoformat() if meeting.actual_start else None,
            "actual_end": meeting.actual_end.isoformat() if meeting.actual_end else None,
            "duration_minutes": meeting.duration_minutes,
            "is_overdue": meeting.is_overdue,
            "agenda": meeting.agenda,
            "meeting_notes": meeting.meeting_notes,
            "is_recording": meeting.is_recording,
            "is_transcription_enabled": meeting.is_transcription_enabled,
            "is_ai_insights_enabled": meeting.is_ai_insights_enabled,
            "participant_count": meeting.participant_count,
            "participants": participants,
            "insights": insights,
            "tags": tags,
            "created_at": meeting.created_at.isoformat(),
            "updated_at": meeting.updated_at.isoformat()
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get meeting: {str(e)}")

@app.put("/meetings/{meeting_id}")
async def update_meeting(meeting_id: str, meeting_update: MeetingUpdate, db: Session = Depends(get_db)):
    """Update an existing meeting"""
    try:
        db_meeting = meeting_crud.get_by_id(db, meeting_id)
        if not db_meeting:
            raise HTTPException(status_code=404, detail="Meeting not found")
        
        updated_meeting = meeting_crud.update(db, db_obj=db_meeting, obj_in=meeting_update)
        
        return {
            "id": str(updated_meeting.id),
            "title": updated_meeting.title,
            "status": updated_meeting.status.value,
            "updated_at": updated_meeting.updated_at.isoformat()
        }
        
    except HTTPException:
        raise
    except ValidationError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update meeting: {str(e)}")

@app.delete("/meetings/{meeting_id}")
async def delete_meeting(meeting_id: str, db: Session = Depends(get_db)):
    """Delete a meeting and all related data"""
    try:
        success = meeting_crud.delete(db, id=meeting_id)
        if not success:
            raise HTTPException(status_code=404, detail="Meeting not found")
        
        return {"message": "Meeting deleted successfully", "meeting_id": meeting_id}
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete meeting: {str(e)}")

@app.patch("/meetings/{meeting_id}/status")
async def update_meeting_status(meeting_id: str, status: MeetingStatus, db: Session = Depends(get_db)):
    """Update meeting status (start, pause, end, cancel)"""
    try:
        updated_meeting = meeting_crud.update_status(db, meeting_id, status)
        if not updated_meeting:
            raise HTTPException(status_code=404, detail="Meeting not found")
        
        return {
            "id": str(updated_meeting.id),
            "status": updated_meeting.status.value,
            "actual_start": updated_meeting.actual_start.isoformat() if updated_meeting.actual_start else None,
            "actual_end": updated_meeting.actual_end.isoformat() if updated_meeting.actual_end else None,
            "updated_at": updated_meeting.updated_at.isoformat()
        }
        
    except HTTPException:
        raise
    except ValidationError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update meeting status: {str(e)}")

@app.get("/meetings/{meeting_id}/statistics")
async def get_meeting_statistics(meeting_id: str, db: Session = Depends(get_db)):
    """Get comprehensive meeting statistics and analytics"""
    try:
        stats = meeting_crud.get_meeting_statistics(db, meeting_id)
        return stats
    except NotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get meeting statistics: {str(e)}")

# Participant Management Endpoints
@app.post("/meetings/{meeting_id}/participants")
async def add_participant(meeting_id: str, participant: ParticipantCreate, db: Session = Depends(get_db)):
    """Add a participant to a meeting"""
    try:
        # Verify meeting exists
        meeting = meeting_crud.get_by_id(db, meeting_id)
        if not meeting:
            raise HTTPException(status_code=404, detail="Meeting not found")
        
        # Check if participant already exists
        existing = participant_crud.get_by_meeting_and_email(db, meeting_id, participant.email)
        if existing:
            raise HTTPException(status_code=409, detail="Participant already exists in this meeting")
        
        # Set meeting_id
        participant.meeting_id = meeting_id
        db_participant = participant_crud.create(db, obj_in=participant)
        
        return {
            "id": str(db_participant.id),
            "email": db_participant.email,
            "display_name": db_participant.display_name,
            "role": db_participant.role.value,
            "status": db_participant.status.value,
            "created_at": db_participant.created_at.isoformat()
        }
        
    except HTTPException:
        raise
    except ConflictError as e:
        raise HTTPException(status_code=409, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to add participant: {str(e)}")

@app.get("/meetings/{meeting_id}/participants")
async def get_meeting_participants(meeting_id: str, db: Session = Depends(get_db)):
    """Get all participants for a meeting"""
    try:
        participants = db.query(Participant).filter(Participant.meeting_id == meeting_id).all()
        
        result = []
        for participant in participants:
            result.append({
                "id": str(participant.id),
                "email": participant.email,
                "display_name": participant.display_name,
                "role": participant.role.value,
                "status": participant.status.value,
                "speaking_time_seconds": participant.speaking_time_seconds,
                "engagement_score": participant.engagement_score,
                "joined_at": participant.joined_at.isoformat() if participant.joined_at else None,
                "left_at": participant.left_at.isoformat() if participant.left_at else None
            })
        
        return {"participants": result}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get participants: {str(e)}")

# User's Meeting Dashboard Endpoints
@app.get("/users/{user_id}/meetings/upcoming")
async def get_upcoming_meetings(user_id: str, hours_ahead: int = 24, db: Session = Depends(get_db)):
    """Get upcoming meetings for a user"""
    try:
        meetings = meeting_crud.get_upcoming_meetings(db, user_id, hours_ahead)
        
        result = []
        for meeting in meetings:
            result.append({
                "id": str(meeting.id),
                "title": meeting.title,
                "scheduled_start": meeting.scheduled_start.isoformat(),
                "scheduled_end": meeting.scheduled_end.isoformat(),
                "status": meeting.status.value,
                "meeting_number": meeting.meeting_number
            })
        
        return {"upcoming_meetings": result}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get upcoming meetings: {str(e)}")

@app.on_event("startup")
async def startup_event():
    """Start background tasks when the application starts"""
    print("🚀 Starting MeetingMind API v2.0.0")
    
    # Start audio session cleanup task
    try:
        asyncio.create_task(cleanup_audio_sessions())
        print("📊 Audio session cleanup task started")
    except Exception as e:
        print(f"⚠️ Failed to start audio cleanup: {e}")
    
    # Initialize AI provider registry
    try:
        await initialize_registry()
        print("🤖 AI Provider Registry initialized")
    except Exception as e:
        print(f"⚠️ Failed to initialize AI Provider Registry: {e}")
        print("   AI endpoints will not be available until configuration is loaded")
    
    # Start transcription queue manager
    try:
        await queue_manager.start()
        print("🎤 Transcription queue manager started")
    except Exception as e:
        print(f"⚠️ Failed to start transcription queue manager: {e}")
        print("   Transcription endpoints may not work properly")
    
    # Initialize cloud transcription service
    try:
        print("☁️ Cloud transcription service initialized")
        print(f"   Available providers: {list(cloud_transcription_service.providers.keys())}")
    except Exception as e:
        print(f"⚠️ Failed to initialize cloud transcription service: {e}")
        print("   Cloud transcription endpoints may not work properly")
    
    # Initialize OBS integration if available
    if OBS_INTEGRATION_AVAILABLE:
        try:
            obs_client = await get_obs_client()
            if obs_client.connected:
                print("🎥 OBS integration initialized successfully")
                
                # Start monitoring
                obs_monitor = await get_obs_monitor()
                # Note: In production, you'd want to run this in a background task
                # asyncio.create_task(obs_monitor.start_monitoring())
                
            else:
                print("🎥 OBS integration available but not connected")
        except Exception as e:
            print(f"⚠️ OBS integration initialization failed: {e}")
    else:
        print("🎥 OBS integration not available")
    
    # Start streaming health monitoring
    try:
        asyncio.create_task(periodic_health_monitoring())
        print("📹 Streaming health monitoring started")
    except Exception as e:
        print(f"⚠️ Failed to start streaming monitoring: {e}")
    
    print("✅ MeetingMind API startup complete")

@app.on_event("shutdown")
async def shutdown_event():
    """Clean up resources when the application shuts down"""
    print("🛑 Shutting down MeetingMind API")
    
    try:
        await queue_manager.stop()
        print("🎤 Transcription queue manager stopped")
    except Exception as e:
        print(f"⚠️ Error stopping transcription queue manager: {e}")
    
    # Cleanup OBS connections
    if OBS_INTEGRATION_AVAILABLE:
        try:
            obs_client = await get_obs_client()
            if obs_client:
                await obs_client.disconnect()
            
            obs_monitor = await get_obs_monitor()
            if obs_monitor:
                obs_monitor.stop_monitoring()
                
        except Exception as e:
            print(f"⚠️ Error during OBS cleanup: {e}")
    
    print("✅ MeetingMind API shutdown complete")

# ==========================================
# STREAMING SERVER INTEGRATION
# ==========================================

@app.post("/api/streaming/stream-keys", response_model=dict)
async def create_meeting_stream_key(
    request: StreamKeyRequest,
    db: Session = Depends(get_db)
):
    """
    Generate a stream key for a meeting
    
    This endpoint creates a secure stream key that can be used with OBS Studio
    or other streaming software to broadcast to a meeting.
    """
    try:
        return await create_stream_key(request, db)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/streaming/stream-keys/{key_id}")
async def revoke_meeting_stream_key(
    key_id: str,
    db: Session = Depends(get_db)
):
    """Revoke a stream key"""
    try:
        integration = StreamingIntegration()
        await integration.initialize()
        result = await integration.revoke_stream_key(key_id, db)
        await integration.cleanup()
        return {"success": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/streaming/streams", response_model=List[StreamStatus])
async def get_active_streams(meeting_id: Optional[str] = None):
    """
    Get active streams
    
    Returns a list of currently active streams, optionally filtered by meeting ID.
    """
    try:
        return await get_meeting_streams(meeting_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/streaming/streams/{stream_id}")
async def get_stream_details(stream_id: str):
    """Get detailed information about a specific stream"""
    try:
        integration = StreamingIntegration()
        await integration.initialize()
        result = await integration.get_stream_metrics(stream_id)
        await integration.cleanup()
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/streaming/metrics")
async def get_streaming_system_metrics():
    """
    Get streaming system metrics
    
    Returns comprehensive metrics about the streaming system including
    bandwidth usage, stream quality, and performance statistics.
    """
    try:
        return await get_streaming_metrics()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/streaming/health")
async def get_streaming_system_health():
    """
    Get streaming system health status
    
    Returns health information including any alerts, system status,
    and performance indicators.
    """
    try:
        return await get_streaming_health()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/streaming/config/{meeting_id}")
async def get_streaming_configuration(meeting_id: str):
    """
    Get streaming configuration for a meeting
    
    Returns the streaming server URLs and configuration needed
    for OBS Studio setup.
    """
    try:
        from streaming_integration import StreamingServerConfig, format_stream_url
        
        config = StreamingServerConfig()
        server_ip = "localhost"  # This should be configurable
        
        return {
            "meeting_id": meeting_id,
            "protocols": {
                "rtmp": {
                    "name": "RTMP Stream",
                    "url": format_stream_url("rtmp", server_ip, "YOUR_STREAM_KEY"),
                    "port": config.rtmp_port,
                    "description": "Standard streaming protocol with universal compatibility",
                    "latency": "3-10 seconds",
                    "setup_guide": "Use 'Custom' service in OBS, paste server URL and your stream key"
                },
                "srt": {
                    "name": "SRT Stream", 
                    "url": format_stream_url("srt", server_ip, "YOUR_STREAM_KEY"),
                    "port": config.srt_port,
                    "description": "Low-latency streaming with error correction",
                    "latency": "0.5-2 seconds",
                    "setup_guide": "Requires OBS 28+ or SRT plugin. Use full SRT URL including streamid parameter"
                },
                "webrtc": {
                    "name": "WebRTC WHIP",
                    "url": format_stream_url("webrtc", server_ip, "YOUR_STREAM_KEY", meeting_id),
                    "port": config.webrtc_port,
                    "description": "Ultra-low latency browser-based streaming",
                    "latency": "0.1-0.5 seconds",
                    "setup_guide": "Requires WebRTC plugin for OBS. Use WHIP endpoint with Bearer token authentication"
                }
            },
            "recommended_settings": {
                "resolution": "1920x1080",
                "fps": 30,
                "bitrate": "2500-5000 Kbps",
                "encoder": "H.264",
                "audio": "AAC 44.1kHz Stereo"
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Background task for streaming health monitoring
@app.on_event("startup")
async def start_streaming_monitoring():
    """Start background streaming health monitoring"""
    try:
        # Start periodic health monitoring in background
        asyncio.create_task(periodic_health_monitoring())
        print("📹 Streaming health monitoring started")
    except Exception as e:
        print(f"⚠️ Failed to start streaming monitoring: {e}")

if __name__ == "__main__":
    # Run the application with uvicorn
    # uvicorn is an ASGI server optimized for async Python web applications
    print("🚀 Starting MeetingMind API server...")
    print("📡 WebSocket endpoint: ws://localhost:8000/ws/{client_id}")
    print("📚 API Documentation: http://localhost:8000/docs")
    print("📊 WebSocket Stats: http://localhost:8000/ws/stats")
    print("🎵 Audio Stats: http://localhost:8000/audio/stats")
    print("🎤 Audio Sessions: http://localhost:8000/audio/sessions")
    print("🤖 AI Providers: http://localhost:8000/ai/providers")
    print("💬 AI Chat: http://localhost:8000/ai/chat")
    print("✍️ AI Generate: http://localhost:8000/ai/generate")
    print("🏥 AI Health: http://localhost:8000/ai/health")
    
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,  # Auto-reload on code changes during development
        log_level="info"
    )