"""
OBS WebSocket Integration for MeetingMind
Provides remote control, monitoring, and automation features for OBS Studio
"""

import asyncio
import json
import logging
import hashlib
import base64
from typing import Dict, List, Optional, Any, Callable
from datetime import datetime, timedelta
from dataclasses import dataclass, asdict
from enum import Enum

import websockets
from websockets.exceptions import ConnectionClosed, WebSocketException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from .database import get_db
from .models import Meeting, User

logger = logging.getLogger(__name__)


class OBSMessageOpCode(Enum):
    """OBS WebSocket message operation codes"""

    HELLO = 0
    IDENTIFY = 1
    IDENTIFIED = 2
    REIDENTIFY = 3
    EVENT = 5
    REQUEST = 6
    REQUEST_RESPONSE = 7
    REQUEST_BATCH = 8
    REQUEST_BATCH_RESPONSE = 9


class OBSRequestType(Enum):
    """Common OBS request types"""

    GET_VERSION = "GetVersion"
    GET_STATS = "GetStats"
    GET_SCENE_LIST = "GetSceneList"
    SET_CURRENT_SCENE = "SetCurrentProgramScene"
    GET_CURRENT_SCENE = "GetCurrentProgramScene"
    SET_SCENE_ITEM_ENABLED = "SetSceneItemEnabled"
    GET_SOURCE_LIST = "GetSourcesList"
    CREATE_SOURCE = "CreateSource"
    REMOVE_SOURCE = "RemoveSource"
    START_STREAM = "StartStream"
    STOP_STREAM = "StopStream"
    START_RECORD = "StartRecord"
    STOP_RECORD = "StopRecord"
    GET_RECORD_STATUS = "GetRecordStatus"
    GET_STREAM_STATUS = "GetStreamStatus"
    SET_STREAM_SETTINGS = "SetStreamServiceSettings"
    GET_AUDIO_MONITOR_TYPE = "GetInputAudioMonitorType"
    SET_AUDIO_MONITOR_TYPE = "SetInputAudioMonitorType"
    GET_INPUT_VOLUME = "GetInputVolume"
    SET_INPUT_VOLUME = "SetInputVolume"
    SET_INPUT_MUTE = "SetInputMute"
    TOGGLE_INPUT_MUTE = "ToggleInputMute"


class OBSEventType(Enum):
    """OBS event types we monitor"""

    SCENE_CHANGED = "CurrentProgramSceneChanged"
    STREAM_STARTED = "StreamStateChanged"
    STREAM_STOPPED = "StreamStateChanged"
    RECORD_STARTED = "RecordStateChanged"
    RECORD_STOPPED = "RecordStateChanged"
    SOURCE_CREATED = "SourceCreated"
    SOURCE_REMOVED = "SourceRemoved"
    INPUT_MUTE_CHANGED = "InputMuteStateChanged"
    INPUT_VOLUME_CHANGED = "InputVolumeChanged"


@dataclass
class OBSStats:
    """OBS performance statistics"""

    active_fps: float
    average_frame_time: float
    cpu_usage: float
    memory_usage: float
    free_disk_space: float
    output_skipped_frames: int
    output_total_frames: int
    render_missed_frames: int
    render_total_frames: int
    web_socket_session_incoming_messages: int
    web_socket_session_outgoing_messages: int
    recording_active: bool
    streaming_active: bool
    streaming_bytes: int
    streaming_time: int

    @property
    def dropped_frames_percentage(self) -> float:
        """Calculate percentage of dropped frames"""
        if self.output_total_frames == 0:
            return 0.0
        return (self.output_skipped_frames / self.output_total_frames) * 100

    @property
    def render_lag_percentage(self) -> float:
        """Calculate percentage of render lag"""
        if self.render_total_frames == 0:
            return 0.0
        return (self.render_missed_frames / self.render_total_frames) * 100


@dataclass
class OBSScene:
    """OBS Scene information"""

    scene_name: str
    scene_index: int
    scene_uuid: str


@dataclass
class OBSSource:
    """OBS Source information"""

    source_name: str
    source_type: str
    source_uuid: str
    source_kind: str


class OBSWebSocketClient:
    """OBS WebSocket client for remote control and monitoring"""

    def __init__(self, host: str = "localhost", port: int = 4455, password: str = ""):
        self.host = host
        self.port = port
        self.password = password
        self.websocket = None
        self.connected = False
        self.identified = False
        self.request_id = 0
        self.pending_requests: Dict[str, asyncio.Future] = {}
        self.event_callbacks: Dict[str, List[Callable]] = {}
        self.stats_history: List[OBSStats] = []
        self.current_scene = None
        self.scenes: List[OBSScene] = []
        self.sources: List[OBSSource] = []

    async def connect(self) -> bool:
        """Connect to OBS WebSocket"""
        try:
            uri = f"ws://{self.host}:{self.port}"
            logger.info(f"Connecting to OBS WebSocket at {uri}")

            self.websocket = await websockets.connect(uri)
            self.connected = True

            # Start listening for messages
            asyncio.create_task(self._listen())

            # Wait for HELLO message and authenticate
            await self._wait_for_identification()

            # Initialize data
            await self._initialize_obs_data()

            return True

        except Exception as e:
            logger.error(f"Failed to connect to OBS: {str(e)}")
            self.connected = False
            return False

    async def disconnect(self):
        """Disconnect from OBS"""
        if self.websocket:
            await self.websocket.close()
        self.connected = False
        self.identified = False

    async def _listen(self):
        """Listen for incoming messages"""
        try:
            async for message in self.websocket:
                try:
                    data = json.loads(message)
                    await self._handle_message(data)
                except json.JSONDecodeError as e:
                    logger.error(f"Failed to decode OBS message: {e}")
                except Exception as e:
                    logger.error(f"Error handling OBS message: {e}")

        except ConnectionClosed:
            logger.info("OBS WebSocket connection closed")
            self.connected = False
            self.identified = False
        except Exception as e:
            logger.error(f"Error in OBS WebSocket listener: {e}")
            self.connected = False
            self.identified = False

    async def _handle_message(self, data: Dict[str, Any]):
        """Handle incoming WebSocket messages"""
        op_code = data.get("op")

        if op_code == OBSMessageOpCode.HELLO.value:
            await self._handle_hello(data["d"])
        elif op_code == OBSMessageOpCode.IDENTIFIED.value:
            self.identified = True
            logger.info("Successfully identified with OBS")
        elif op_code == OBSMessageOpCode.EVENT.value:
            await self._handle_event(data["d"])
        elif op_code == OBSMessageOpCode.REQUEST_RESPONSE.value:
            await self._handle_request_response(data["d"])

    async def _handle_hello(self, data: Dict[str, Any]):
        """Handle HELLO message and authenticate"""
        auth_data = data.get("authentication")

        if auth_data and self.password:
            # Generate authentication response
            challenge = auth_data["challenge"]
            salt = auth_data["salt"]

            # Create authentication string
            secret = base64.b64encode(
                hashlib.sha256((self.password + salt).encode()).digest()
            ).decode()

            auth_response = base64.b64encode(
                hashlib.sha256((secret + challenge).encode()).digest()
            ).decode()

            identify_data = {
                "rpcVersion": 1,
                "authentication": auth_response,
                "eventSubscriptions": 511,  # Subscribe to all events
            }
        else:
            identify_data = {"rpcVersion": 1, "eventSubscriptions": 511}

        # Send IDENTIFY message
        await self._send_message(OBSMessageOpCode.IDENTIFY.value, identify_data)

    async def _handle_event(self, data: Dict[str, Any]):
        """Handle OBS events"""
        event_type = data.get("eventType")
        event_data = data.get("eventData", {})

        logger.debug(f"Received OBS event: {event_type}")

        # Store scene changes
        if event_type == OBSEventType.SCENE_CHANGED.value:
            self.current_scene = event_data.get("sceneName")

        # Trigger registered callbacks
        callbacks = self.event_callbacks.get(event_type, [])
        for callback in callbacks:
            try:
                await callback(event_type, event_data)
            except Exception as e:
                logger.error(f"Error in event callback: {e}")

    async def _handle_request_response(self, data: Dict[str, Any]):
        """Handle request responses"""
        request_id = data.get("requestId")

        if request_id in self.pending_requests:
            future = self.pending_requests.pop(request_id)
            if data.get("requestStatus", {}).get("result"):
                future.set_result(data.get("responseData"))
            else:
                error_msg = data.get("requestStatus", {}).get(
                    "comment", "Unknown error"
                )
                future.set_exception(Exception(f"OBS request failed: {error_msg}"))

    async def _send_message(self, op_code: int, data: Dict[str, Any]):
        """Send message to OBS"""
        if not self.connected or not self.websocket:
            raise Exception("Not connected to OBS")

        message = {"op": op_code, "d": data}

        await self.websocket.send(json.dumps(message))

    async def _send_request(
        self, request_type: str, request_data: Dict[str, Any] = None
    ) -> Dict[str, Any]:
        """Send request and wait for response"""
        if not self.identified:
            raise Exception("Not identified with OBS")

        self.request_id += 1
        request_id = str(self.request_id)

        request = {"requestType": request_type, "requestId": request_id}

        if request_data:
            request["requestData"] = request_data

        # Create future for response
        future = asyncio.Future()
        self.pending_requests[request_id] = future

        # Send request
        await self._send_message(OBSMessageOpCode.REQUEST.value, request)

        # Wait for response (with timeout)
        try:
            response = await asyncio.wait_for(future, timeout=10.0)
            return response or {}
        except asyncio.TimeoutError:
            if request_id in self.pending_requests:
                del self.pending_requests[request_id]
            raise Exception("Request timeout")

    async def _wait_for_identification(self):
        """Wait for successful identification"""
        max_wait = 10  # seconds
        start_time = asyncio.get_event_loop().time()

        while not self.identified:
            if asyncio.get_event_loop().time() - start_time > max_wait:
                raise Exception("Identification timeout")
            await asyncio.sleep(0.1)

    async def _initialize_obs_data(self):
        """Initialize OBS data after connection"""
        try:
            # Get scenes
            scenes_response = await self._send_request(
                OBSRequestType.GET_SCENE_LIST.value
            )
            scenes_data = scenes_response.get("scenes", [])
            self.scenes = [
                OBSScene(
                    scene_name=scene["sceneName"],
                    scene_index=scene["sceneIndex"],
                    scene_uuid=scene["sceneUuid"],
                )
                for scene in scenes_data
            ]

            # Get current scene
            current_scene_response = await self._send_request(
                OBSRequestType.GET_CURRENT_SCENE.value
            )
            self.current_scene = current_scene_response.get("currentProgramSceneName")

            # Get sources
            sources_response = await self._send_request(
                OBSRequestType.GET_SOURCE_LIST.value
            )
            sources_data = sources_response.get("sources", [])
            self.sources = [
                OBSSource(
                    source_name=source["sourceName"],
                    source_type=source["sourceType"],
                    source_uuid=source["sourceUuid"],
                    source_kind=source["sourceKind"],
                )
                for source in sources_data
            ]

            logger.info(
                f"Initialized OBS data: {len(self.scenes)} scenes, {len(self.sources)} sources"
            )

        except Exception as e:
            logger.error(f"Failed to initialize OBS data: {e}")

    # Public API methods

    def add_event_callback(self, event_type: str, callback: Callable):
        """Add callback for OBS events"""
        if event_type not in self.event_callbacks:
            self.event_callbacks[event_type] = []
        self.event_callbacks[event_type].append(callback)

    def remove_event_callback(self, event_type: str, callback: Callable):
        """Remove event callback"""
        if event_type in self.event_callbacks:
            try:
                self.event_callbacks[event_type].remove(callback)
            except ValueError:
                pass

    async def get_version(self) -> Dict[str, Any]:
        """Get OBS version information"""
        return await self._send_request(OBSRequestType.GET_VERSION.value)

    async def get_stats(self) -> OBSStats:
        """Get OBS performance statistics"""
        response = await self._send_request(OBSRequestType.GET_STATS.value)
        stats = OBSStats(**response)

        # Store in history (keep last 100)
        self.stats_history.append(stats)
        if len(self.stats_history) > 100:
            self.stats_history.pop(0)

        return stats

    async def get_scenes(self) -> List[OBSScene]:
        """Get list of scenes"""
        await self._initialize_obs_data()  # Refresh data
        return self.scenes

    async def get_current_scene(self) -> str:
        """Get current scene name"""
        response = await self._send_request(OBSRequestType.GET_CURRENT_SCENE.value)
        self.current_scene = response.get("currentProgramSceneName")
        return self.current_scene

    async def set_scene(self, scene_name: str) -> bool:
        """Switch to specified scene"""
        try:
            await self._send_request(
                OBSRequestType.SET_CURRENT_SCENE.value, {"sceneName": scene_name}
            )
            self.current_scene = scene_name
            return True
        except Exception as e:
            logger.error(f"Failed to set scene: {e}")
            return False

    async def start_streaming(self) -> bool:
        """Start streaming"""
        try:
            await self._send_request(OBSRequestType.START_STREAM.value)
            return True
        except Exception as e:
            logger.error(f"Failed to start streaming: {e}")
            return False

    async def stop_streaming(self) -> bool:
        """Stop streaming"""
        try:
            await self._send_request(OBSRequestType.STOP_STREAM.value)
            return True
        except Exception as e:
            logger.error(f"Failed to stop streaming: {e}")
            return False

    async def start_recording(self) -> bool:
        """Start recording"""
        try:
            await self._send_request(OBSRequestType.START_RECORD.value)
            return True
        except Exception as e:
            logger.error(f"Failed to start recording: {e}")
            return False

    async def stop_recording(self) -> bool:
        """Stop recording"""
        try:
            await self._send_request(OBSRequestType.STOP_RECORD.value)
            return True
        except Exception as e:
            logger.error(f"Failed to stop recording: {e}")
            return False

    async def get_stream_status(self) -> Dict[str, Any]:
        """Get streaming status"""
        return await self._send_request(OBSRequestType.GET_STREAM_STATUS.value)

    async def get_record_status(self) -> Dict[str, Any]:
        """Get recording status"""
        return await self._send_request(OBSRequestType.GET_RECORD_STATUS.value)

    async def create_source(
        self, source_name: str, source_kind: str, source_settings: Dict[str, Any] = None
    ) -> bool:
        """Create a new source"""
        try:
            request_data = {"sourceName": source_name, "sourceKind": source_kind}
            if source_settings:
                request_data["sourceSettings"] = source_settings

            await self._send_request(OBSRequestType.CREATE_SOURCE.value, request_data)
            await self._initialize_obs_data()  # Refresh sources list
            return True
        except Exception as e:
            logger.error(f"Failed to create source: {e}")
            return False

    async def remove_source(self, source_name: str) -> bool:
        """Remove a source"""
        try:
            await self._send_request(
                OBSRequestType.REMOVE_SOURCE.value, {"sourceName": source_name}
            )
            await self._initialize_obs_data()  # Refresh sources list
            return True
        except Exception as e:
            logger.error(f"Failed to remove source: {e}")
            return False

    async def set_source_volume(self, source_name: str, volume: float) -> bool:
        """Set source volume (0.0 - 1.0)"""
        try:
            await self._send_request(
                OBSRequestType.SET_INPUT_VOLUME.value,
                {"inputName": source_name, "inputVolumeMul": volume},
            )
            return True
        except Exception as e:
            logger.error(f"Failed to set source volume: {e}")
            return False

    async def mute_source(self, source_name: str, muted: bool = True) -> bool:
        """Mute or unmute source"""
        try:
            await self._send_request(
                OBSRequestType.SET_INPUT_MUTE.value,
                {"inputName": source_name, "inputMuted": muted},
            )
            return True
        except Exception as e:
            logger.error(f"Failed to mute source: {e}")
            return False

    async def toggle_source_mute(self, source_name: str) -> bool:
        """Toggle source mute state"""
        try:
            await self._send_request(
                OBSRequestType.TOGGLE_INPUT_MUTE.value, {"inputName": source_name}
            )
            return True
        except Exception as e:
            logger.error(f"Failed to toggle source mute: {e}")
            return False


class OBSAutomationManager:
    """Manages automatic OBS control based on meeting events"""

    def __init__(self, obs_client: OBSWebSocketClient):
        self.obs_client = obs_client
        self.automation_rules: Dict[str, Dict[str, Any]] = {}
        self.meeting_scenes: Dict[str, str] = {}  # meeting_id -> scene_name
        self.enabled = True

        # Default automation rules
        self.setup_default_rules()

    def setup_default_rules(self):
        """Setup default automation rules"""
        self.automation_rules = {
            "meeting_started": {
                "actions": [
                    {"type": "switch_scene", "scene": "Meeting - Welcome"},
                    {"type": "start_recording"},
                    {"type": "unmute_source", "source": "Meeting Audio"},
                ]
            },
            "meeting_ended": {
                "actions": [
                    {"type": "switch_scene", "scene": "Meeting - Ended"},
                    {"type": "stop_recording"},
                    {"type": "stop_streaming"},
                ]
            },
            "participant_joined": {
                "actions": [
                    {"type": "switch_scene", "scene": "Meeting - Discussion"},
                    {"type": "adjust_volume", "source": "Meeting Audio", "volume": 0.8},
                ]
            },
            "screen_share_started": {
                "actions": [
                    {"type": "switch_scene", "scene": "Meeting - Screen Share"},
                    {"type": "adjust_volume", "source": "System Audio", "volume": 1.0},
                ]
            },
            "screen_share_ended": {
                "actions": [{"type": "switch_scene", "scene": "Meeting - Discussion"}]
            },
            "recording_requested": {
                "actions": [
                    {"type": "start_recording"},
                    {"type": "switch_scene", "scene": "Meeting - Recording"},
                ]
            },
            "break_started": {
                "actions": [
                    {"type": "switch_scene", "scene": "Meeting - Break"},
                    {"type": "mute_source", "source": "Meeting Audio"},
                ]
            },
        }

    async def handle_meeting_event(
        self, event_type: str, meeting_id: str, event_data: Dict[str, Any] = None
    ):
        """Handle meeting events and trigger automation"""
        if not self.enabled:
            return

        logger.info(f"Handling meeting event: {event_type} for meeting {meeting_id}")

        # Get automation rules for this event
        rules = self.automation_rules.get(event_type)
        if not rules:
            logger.debug(f"No automation rules for event: {event_type}")
            return

        # Execute actions
        actions = rules.get("actions", [])
        for action in actions:
            try:
                await self._execute_action(action, meeting_id, event_data)
            except Exception as e:
                logger.error(f"Failed to execute automation action: {e}")

    async def _execute_action(
        self, action: Dict[str, Any], meeting_id: str, event_data: Dict[str, Any] = None
    ):
        """Execute automation action"""
        action_type = action.get("type")

        if action_type == "switch_scene":
            scene_name = action.get("scene")
            # Replace meeting-specific placeholders
            scene_name = scene_name.replace("{meeting_id}", meeting_id)
            await self.obs_client.set_scene(scene_name)

        elif action_type == "start_recording":
            await self.obs_client.start_recording()

        elif action_type == "stop_recording":
            await self.obs_client.stop_recording()

        elif action_type == "start_streaming":
            await self.obs_client.start_streaming()

        elif action_type == "stop_streaming":
            await self.obs_client.stop_streaming()

        elif action_type == "mute_source":
            source_name = action.get("source")
            await self.obs_client.mute_source(source_name, True)

        elif action_type == "unmute_source":
            source_name = action.get("source")
            await self.obs_client.mute_source(source_name, False)

        elif action_type == "adjust_volume":
            source_name = action.get("source")
            volume = action.get("volume", 1.0)
            await self.obs_client.set_source_volume(source_name, volume)

        elif action_type == "toggle_mute":
            source_name = action.get("source")
            await self.obs_client.toggle_source_mute(source_name)

        else:
            logger.warning(f"Unknown automation action type: {action_type}")

    def add_automation_rule(self, event_type: str, actions: List[Dict[str, Any]]):
        """Add custom automation rule"""
        self.automation_rules[event_type] = {"actions": actions}

    def remove_automation_rule(self, event_type: str):
        """Remove automation rule"""
        if event_type in self.automation_rules:
            del self.automation_rules[event_type]

    def set_meeting_scene(self, meeting_id: str, scene_name: str):
        """Set custom scene for specific meeting"""
        self.meeting_scenes[meeting_id] = scene_name

    def enable_automation(self):
        """Enable automation"""
        self.enabled = True

    def disable_automation(self):
        """Disable automation"""
        self.enabled = False


class OBSStatsMonitor:
    """Monitors OBS performance statistics and provides alerts"""

    def __init__(self, obs_client: OBSWebSocketClient):
        self.obs_client = obs_client
        self.monitoring = False
        self.stats_interval = 5  # seconds
        self.alert_thresholds = {
            "cpu_usage": 80.0,  # %
            "dropped_frames": 5.0,  # %
            "render_lag": 10.0,  # %
            "memory_usage": 2000,  # MB
            "free_disk_space": 1000,  # MB
        }
        self.alert_callbacks: List[Callable] = []

    def add_alert_callback(self, callback: Callable):
        """Add callback for performance alerts"""
        self.alert_callbacks.append(callback)

    async def start_monitoring(self):
        """Start performance monitoring"""
        if self.monitoring:
            return

        self.monitoring = True
        logger.info("Starting OBS stats monitoring")

        while self.monitoring:
            try:
                stats = await self.obs_client.get_stats()
                await self._check_alerts(stats)
                await asyncio.sleep(self.stats_interval)
            except Exception as e:
                logger.error(f"Error monitoring OBS stats: {e}")
                await asyncio.sleep(self.stats_interval)

    def stop_monitoring(self):
        """Stop performance monitoring"""
        self.monitoring = False
        logger.info("Stopped OBS stats monitoring")

    async def _check_alerts(self, stats: OBSStats):
        """Check for alert conditions"""
        alerts = []

        # CPU usage alert
        if stats.cpu_usage > self.alert_thresholds["cpu_usage"]:
            alerts.append(
                {
                    "type": "high_cpu_usage",
                    "value": stats.cpu_usage,
                    "threshold": self.alert_thresholds["cpu_usage"],
                    "message": f"High CPU usage: {stats.cpu_usage:.1f}%",
                }
            )

        # Dropped frames alert
        dropped_frames_pct = stats.dropped_frames_percentage
        if dropped_frames_pct > self.alert_thresholds["dropped_frames"]:
            alerts.append(
                {
                    "type": "dropped_frames",
                    "value": dropped_frames_pct,
                    "threshold": self.alert_thresholds["dropped_frames"],
                    "message": f"High dropped frames: {dropped_frames_pct:.1f}%",
                }
            )

        # Render lag alert
        render_lag_pct = stats.render_lag_percentage
        if render_lag_pct > self.alert_thresholds["render_lag"]:
            alerts.append(
                {
                    "type": "render_lag",
                    "value": render_lag_pct,
                    "threshold": self.alert_thresholds["render_lag"],
                    "message": f"High render lag: {render_lag_pct:.1f}%",
                }
            )

        # Memory usage alert (convert bytes to MB)
        memory_mb = stats.memory_usage / (1024 * 1024)
        if memory_mb > self.alert_thresholds["memory_usage"]:
            alerts.append(
                {
                    "type": "high_memory_usage",
                    "value": memory_mb,
                    "threshold": self.alert_thresholds["memory_usage"],
                    "message": f"High memory usage: {memory_mb:.0f}MB",
                }
            )

        # Disk space alert (convert bytes to MB)
        disk_mb = stats.free_disk_space / (1024 * 1024)
        if disk_mb < self.alert_thresholds["free_disk_space"]:
            alerts.append(
                {
                    "type": "low_disk_space",
                    "value": disk_mb,
                    "threshold": self.alert_thresholds["free_disk_space"],
                    "message": f"Low disk space: {disk_mb:.0f}MB remaining",
                }
            )

        # Trigger callbacks for any alerts
        for alert in alerts:
            for callback in self.alert_callbacks:
                try:
                    await callback(alert)
                except Exception as e:
                    logger.error(f"Error in alert callback: {e}")

    def set_threshold(self, metric: str, value: float):
        """Set alert threshold for metric"""
        if metric in self.alert_thresholds:
            self.alert_thresholds[metric] = value
            logger.info(f"Set alert threshold for {metric}: {value}")

    def get_stats_history(self, minutes: int = 60) -> List[OBSStats]:
        """Get stats history for specified time period"""
        cutoff_time = datetime.now() - timedelta(minutes=minutes)
        return [
            stats
            for stats in self.obs_client.stats_history
            if hasattr(stats, "timestamp") and stats.timestamp > cutoff_time
        ]


# Pydantic models for API
class OBSConnectionRequest(BaseModel):
    host: str = Field(default="localhost", description="OBS WebSocket host")
    port: int = Field(default=4455, description="OBS WebSocket port")
    password: str = Field(default="", description="OBS WebSocket password")


class OBSSceneSwitchRequest(BaseModel):
    scene_name: str = Field(description="Name of scene to switch to")
    meeting_id: Optional[str] = Field(
        default=None, description="Meeting ID for context"
    )


class OBSSourceControlRequest(BaseModel):
    source_name: str = Field(description="Name of source to control")
    action: str = Field(description="Action: mute, unmute, volume")
    value: Optional[float] = Field(
        default=None, description="Value for volume action (0.0-1.0)"
    )


class OBSAutomationRuleRequest(BaseModel):
    event_type: str = Field(description="Meeting event type to trigger on")
    actions: List[Dict[str, Any]] = Field(description="List of actions to execute")


class OBSStatsResponse(BaseModel):
    stats: Dict[str, Any]
    alerts: List[Dict[str, Any]]
    timestamp: datetime


# Global OBS client instance
obs_client: Optional[OBSWebSocketClient] = None
obs_automation: Optional[OBSAutomationManager] = None
obs_monitor: Optional[OBSStatsMonitor] = None


async def get_obs_client() -> OBSWebSocketClient:
    """Get or create OBS client"""
    global obs_client
    if obs_client is None or not obs_client.connected:
        obs_client = OBSWebSocketClient()
        await obs_client.connect()
    return obs_client


async def get_obs_automation() -> OBSAutomationManager:
    """Get or create OBS automation manager"""
    global obs_automation
    if obs_automation is None:
        client = await get_obs_client()
        obs_automation = OBSAutomationManager(client)
    return obs_automation


async def get_obs_monitor() -> OBSStatsMonitor:
    """Get or create OBS stats monitor"""
    global obs_monitor
    if obs_monitor is None:
        client = await get_obs_client()
        obs_monitor = OBSStatsMonitor(client)
    return obs_monitor
