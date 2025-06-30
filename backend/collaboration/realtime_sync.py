# Real-time Synchronization System
# WebSocket-based real-time collaboration with cursor tracking and presence

import asyncio
import json
import uuid
from typing import Dict, List, Any, Optional, Set, Callable
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum
import logging
from collections import defaultdict

import websockets
from websockets.server import WebSocketServerProtocol

from .operational_transforms import Operation, CollaborativeEditor, OperationType
from .crdt_models import CollaborativeDocument, CRDTFactory


class MessageType(Enum):
    """Types of real-time collaboration messages"""

    # Operation messages
    OPERATION = "operation"
    OPERATION_ACK = "operation_ack"
    OPERATION_REJECT = "operation_reject"

    # Cursor and selection messages
    CURSOR_MOVE = "cursor_move"
    SELECTION_CHANGE = "selection_change"

    # Presence messages
    USER_JOIN = "user_join"
    USER_LEAVE = "user_leave"
    USER_UPDATE = "user_update"
    PRESENCE_UPDATE = "presence_update"

    # Document messages
    DOCUMENT_STATE = "document_state"
    DOCUMENT_UPDATE = "document_update"

    # Annotation messages
    ANNOTATION_ADD = "annotation_add"
    ANNOTATION_UPDATE = "annotation_update"
    ANNOTATION_REMOVE = "annotation_remove"

    # Action item messages
    ACTION_ITEM_ADD = "action_item_add"
    ACTION_ITEM_UPDATE = "action_item_update"
    ACTION_ITEM_REMOVE = "action_item_remove"

    # System messages
    PING = "ping"
    PONG = "pong"
    ERROR = "error"


@dataclass
class UserCursor:
    """User cursor information"""

    user_id: str
    position: int
    timestamp: datetime = field(default_factory=datetime.utcnow)
    color: str = "#000000"

    def to_dict(self) -> Dict[str, Any]:
        return {
            "user_id": self.user_id,
            "position": self.position,
            "timestamp": self.timestamp.isoformat(),
            "color": self.color,
        }


@dataclass
class UserSelection:
    """User text selection information"""

    user_id: str
    start: int
    end: int
    timestamp: datetime = field(default_factory=datetime.utcnow)
    color: str = "#000000"

    def to_dict(self) -> Dict[str, Any]:
        return {
            "user_id": self.user_id,
            "start": self.start,
            "end": self.end,
            "timestamp": self.timestamp.isoformat(),
            "color": self.color,
        }


@dataclass
class UserPresence:
    """User presence information"""

    user_id: str
    name: str
    avatar_url: Optional[str] = None
    status: str = "active"  # active, idle, away
    last_seen: datetime = field(default_factory=datetime.utcnow)
    cursor: Optional[UserCursor] = None
    selection: Optional[UserSelection] = None
    color: str = "#000000"

    def to_dict(self) -> Dict[str, Any]:
        return {
            "user_id": self.user_id,
            "name": self.name,
            "avatar_url": self.avatar_url,
            "status": self.status,
            "last_seen": self.last_seen.isoformat(),
            "cursor": self.cursor.to_dict() if self.cursor else None,
            "selection": self.selection.to_dict() if self.selection else None,
            "color": self.color,
        }


@dataclass
class CollaborationMessage:
    """Real-time collaboration message"""

    message_type: MessageType
    data: Dict[str, Any]
    user_id: Optional[str] = None
    document_id: Optional[str] = None
    timestamp: datetime = field(default_factory=datetime.utcnow)
    message_id: str = field(default_factory=lambda: str(uuid.uuid4()))

    def to_json(self) -> str:
        """Serialize message to JSON"""
        return json.dumps(
            {
                "type": self.message_type.value,
                "data": self.data,
                "user_id": self.user_id,
                "document_id": self.document_id,
                "timestamp": self.timestamp.isoformat(),
                "message_id": self.message_id,
            }
        )

    @classmethod
    def from_json(cls, json_str: str) -> "CollaborationMessage":
        """Deserialize message from JSON"""
        data = json.loads(json_str)
        return cls(
            message_type=MessageType(data["type"]),
            data=data["data"],
            user_id=data.get("user_id"),
            document_id=data.get("document_id"),
            timestamp=(
                datetime.fromisoformat(data["timestamp"])
                if data.get("timestamp")
                else datetime.utcnow()
            ),
            message_id=data.get("message_id", str(uuid.uuid4())),
        )


class CollaborationSession:
    """Manages a collaborative session for a document"""

    def __init__(self, document_id: str):
        self.document_id = document_id
        self.users: Dict[str, UserPresence] = {}
        self.connections: Dict[str, WebSocketServerProtocol] = {}
        self.document = CollaborativeDocument(document_id, "server")
        self.operation_queue: List[Operation] = []
        self.cursors: Dict[str, UserCursor] = {}
        self.selections: Dict[str, UserSelection] = {}
        self.last_activity = datetime.utcnow()

        # User color assignment
        self.user_colors = [
            "#FF6B6B",
            "#4ECDC4",
            "#45B7D1",
            "#96CEB4",
            "#FFEAA7",
            "#DDA0DD",
            "#98D8C8",
            "#F7DC6F",
            "#BB8FCE",
            "#85C1E9",
            "#F8C471",
            "#82E0AA",
        ]
        self.color_index = 0

    async def add_user(
        self,
        user_id: str,
        user_name: str,
        websocket: WebSocketServerProtocol,
        avatar_url: str = None,
    ):
        """Add a user to the collaboration session"""
        # Assign color to user
        color = self.user_colors[self.color_index % len(self.user_colors)]
        self.color_index += 1

        # Create user presence
        presence = UserPresence(
            user_id=user_id, name=user_name, avatar_url=avatar_url, color=color
        )

        self.users[user_id] = presence
        self.connections[user_id] = websocket
        self.last_activity = datetime.utcnow()

        # Send current document state to new user
        await self._send_document_state(user_id)

        # Notify other users
        await self._broadcast_message(
            MessageType.USER_JOIN, {"user": presence.to_dict()}, exclude_user=user_id
        )

        # Send current presence to new user
        await self._send_presence_update(user_id)

    async def remove_user(self, user_id: str):
        """Remove a user from the collaboration session"""
        if user_id in self.users:
            # Clean up user data
            del self.users[user_id]
            if user_id in self.connections:
                del self.connections[user_id]
            if user_id in self.cursors:
                del self.cursors[user_id]
            if user_id in self.selections:
                del self.selections[user_id]

            # Remove user presence from document
            self.document.remove_user_presence(user_id)

            # Notify other users
            await self._broadcast_message(MessageType.USER_LEAVE, {"user_id": user_id})

    async def handle_message(self, user_id: str, message: CollaborationMessage):
        """Handle incoming collaboration message"""
        self.last_activity = datetime.utcnow()

        if message.message_type == MessageType.OPERATION:
            await self._handle_operation(user_id, message)
        elif message.message_type == MessageType.CURSOR_MOVE:
            await self._handle_cursor_move(user_id, message)
        elif message.message_type == MessageType.SELECTION_CHANGE:
            await self._handle_selection_change(user_id, message)
        elif message.message_type == MessageType.ANNOTATION_ADD:
            await self._handle_annotation_add(user_id, message)
        elif message.message_type == MessageType.ANNOTATION_UPDATE:
            await self._handle_annotation_update(user_id, message)
        elif message.message_type == MessageType.ANNOTATION_REMOVE:
            await self._handle_annotation_remove(user_id, message)
        elif message.message_type == MessageType.ACTION_ITEM_ADD:
            await self._handle_action_item_add(user_id, message)
        elif message.message_type == MessageType.ACTION_ITEM_UPDATE:
            await self._handle_action_item_update(user_id, message)
        elif message.message_type == MessageType.ACTION_ITEM_REMOVE:
            await self._handle_action_item_remove(user_id, message)
        elif message.message_type == MessageType.USER_UPDATE:
            await self._handle_user_update(user_id, message)
        elif message.message_type == MessageType.PING:
            await self._handle_ping(user_id, message)

    async def _handle_operation(self, user_id: str, message: CollaborationMessage):
        """Handle text operation"""
        try:
            operation_data = message.data
            operation = Operation.from_dict(operation_data)
            operation.author = user_id

            # Apply operation to document
            if operation.op_type == OperationType.INSERT:
                node_id = self.document.insert_text(
                    operation.position, operation.content
                )
                operation.metadata = {"node_id": node_id}
            elif operation.op_type == OperationType.DELETE:
                # For CRDT, we need the node ID to delete
                node_id = operation.metadata.get("node_id")
                if node_id:
                    self.document.delete_text(node_id)

            # Broadcast operation to other users
            await self._broadcast_message(
                MessageType.OPERATION, operation.to_dict(), exclude_user=user_id
            )

            # Send acknowledgment to sender
            await self._send_message(
                user_id,
                MessageType.OPERATION_ACK,
                {"operation_id": operation.operation_id},
            )

        except Exception as e:
            # Send rejection to sender
            await self._send_message(
                user_id,
                MessageType.OPERATION_REJECT,
                {"operation_id": message.data.get("operation_id"), "error": str(e)},
            )

    async def _handle_cursor_move(self, user_id: str, message: CollaborationMessage):
        """Handle cursor movement"""
        position = message.data.get("position", 0)

        if user_id in self.users:
            cursor = UserCursor(
                user_id=user_id, position=position, color=self.users[user_id].color
            )

            self.cursors[user_id] = cursor
            self.users[user_id].cursor = cursor

            # Update document presence
            self.document.update_user_presence(
                user_id,
                {
                    "cursor": cursor.to_dict(),
                    "last_activity": datetime.utcnow().isoformat(),
                },
            )

            # Broadcast to other users
            await self._broadcast_message(
                MessageType.CURSOR_MOVE, cursor.to_dict(), exclude_user=user_id
            )

    async def _handle_selection_change(
        self, user_id: str, message: CollaborationMessage
    ):
        """Handle text selection change"""
        start = message.data.get("start", 0)
        end = message.data.get("end", 0)

        if user_id in self.users:
            selection = UserSelection(
                user_id=user_id, start=start, end=end, color=self.users[user_id].color
            )

            self.selections[user_id] = selection
            self.users[user_id].selection = selection

            # Update document presence
            self.document.update_user_presence(
                user_id,
                {
                    "selection": selection.to_dict(),
                    "last_activity": datetime.utcnow().isoformat(),
                },
            )

            # Broadcast to other users
            await self._broadcast_message(
                MessageType.SELECTION_CHANGE, selection.to_dict(), exclude_user=user_id
            )

    async def _handle_annotation_add(self, user_id: str, message: CollaborationMessage):
        """Handle annotation addition"""
        annotation_data = message.data
        annotation_id = annotation_data.get("annotation_id", str(uuid.uuid4()))

        # Add author information
        annotation_data["author"] = user_id
        annotation_data["created_at"] = datetime.utcnow().isoformat()

        # Add to document
        self.document.add_annotation(annotation_id, annotation_data)

        # Broadcast to all users
        await self._broadcast_message(
            MessageType.ANNOTATION_ADD,
            {"annotation_id": annotation_id, "annotation": annotation_data},
        )

    async def _handle_annotation_update(
        self, user_id: str, message: CollaborationMessage
    ):
        """Handle annotation update"""
        annotation_id = message.data.get("annotation_id")
        annotation_data = message.data.get("annotation", {})

        if annotation_id:
            # Add update metadata
            annotation_data["updated_by"] = user_id
            annotation_data["updated_at"] = datetime.utcnow().isoformat()

            # Update in document
            self.document.update_annotation(annotation_id, annotation_data)

            # Broadcast to all users
            await self._broadcast_message(
                MessageType.ANNOTATION_UPDATE,
                {"annotation_id": annotation_id, "annotation": annotation_data},
            )

    async def _handle_annotation_remove(
        self, user_id: str, message: CollaborationMessage
    ):
        """Handle annotation removal"""
        annotation_id = message.data.get("annotation_id")

        if annotation_id:
            # Remove from document
            self.document.remove_annotation(annotation_id)

            # Broadcast to all users
            await self._broadcast_message(
                MessageType.ANNOTATION_REMOVE, {"annotation_id": annotation_id}
            )

    async def _handle_action_item_add(
        self, user_id: str, message: CollaborationMessage
    ):
        """Handle action item addition"""
        item_data = message.data
        item_id = item_data.get("item_id", str(uuid.uuid4()))

        # Add author information
        item_data["author"] = user_id
        item_data["created_at"] = datetime.utcnow().isoformat()
        item_data["status"] = item_data.get("status", "open")

        # Add to document
        self.document.add_action_item(item_id, item_data)

        # Broadcast to all users
        await self._broadcast_message(
            MessageType.ACTION_ITEM_ADD, {"item_id": item_id, "item": item_data}
        )

    async def _handle_action_item_update(
        self, user_id: str, message: CollaborationMessage
    ):
        """Handle action item update"""
        item_id = message.data.get("item_id")
        item_data = message.data.get("item", {})

        if item_id:
            # Add update metadata
            item_data["updated_by"] = user_id
            item_data["updated_at"] = datetime.utcnow().isoformat()

            # Update in document
            self.document.update_action_item(item_id, item_data)

            # Broadcast to all users
            await self._broadcast_message(
                MessageType.ACTION_ITEM_UPDATE, {"item_id": item_id, "item": item_data}
            )

    async def _handle_action_item_remove(
        self, user_id: str, message: CollaborationMessage
    ):
        """Handle action item removal"""
        item_id = message.data.get("item_id")

        if item_id:
            # Remove from document
            self.document.remove_action_item(item_id)

            # Broadcast to all users
            await self._broadcast_message(
                MessageType.ACTION_ITEM_REMOVE, {"item_id": item_id}
            )

    async def _handle_user_update(self, user_id: str, message: CollaborationMessage):
        """Handle user information update"""
        if user_id in self.users:
            user_data = message.data

            # Update user presence
            if "name" in user_data:
                self.users[user_id].name = user_data["name"]
            if "avatar_url" in user_data:
                self.users[user_id].avatar_url = user_data["avatar_url"]
            if "status" in user_data:
                self.users[user_id].status = user_data["status"]

            self.users[user_id].last_seen = datetime.utcnow()

            # Broadcast update to other users
            await self._broadcast_message(
                MessageType.USER_UPDATE,
                {"user": self.users[user_id].to_dict()},
                exclude_user=user_id,
            )

    async def _handle_ping(self, user_id: str, message: CollaborationMessage):
        """Handle ping message"""
        await self._send_message(
            user_id, MessageType.PONG, {"timestamp": datetime.utcnow().isoformat()}
        )

    async def _send_document_state(self, user_id: str):
        """Send complete document state to user"""
        state = {
            "content": self.document.get_text_content(),
            "annotations": self.document.get_annotations(),
            "action_items": self.document.get_action_items(),
            "metadata": {
                "title": (
                    self.document.metadata.get("title").get()
                    if self.document.metadata.get("title")
                    else None
                ),
                "created_at": (
                    self.document.metadata.get("created_at").get()
                    if self.document.metadata.get("created_at")
                    else None
                ),
                "last_modified": (
                    self.document.metadata.get("last_modified").get()
                    if self.document.metadata.get("last_modified")
                    else None
                ),
            },
        }

        await self._send_message(user_id, MessageType.DOCUMENT_STATE, state)

    async def _send_presence_update(self, user_id: str):
        """Send presence information to user"""
        presence_data = {
            "users": [user.to_dict() for user in self.users.values()],
            "cursors": [cursor.to_dict() for cursor in self.cursors.values()],
            "selections": [
                selection.to_dict() for selection in self.selections.values()
            ],
        }

        await self._send_message(user_id, MessageType.PRESENCE_UPDATE, presence_data)

    async def _send_message(
        self, user_id: str, message_type: MessageType, data: Dict[str, Any]
    ):
        """Send message to specific user"""
        if user_id in self.connections:
            message = CollaborationMessage(
                message_type=message_type, data=data, document_id=self.document_id
            )

            try:
                await self.connections[user_id].send(message.to_json())
            except websockets.exceptions.ConnectionClosed:
                # Clean up disconnected user
                await self.remove_user(user_id)

    async def _broadcast_message(
        self, message_type: MessageType, data: Dict[str, Any], exclude_user: str = None
    ):
        """Broadcast message to all users except excluded"""
        message = CollaborationMessage(
            message_type=message_type, data=data, document_id=self.document_id
        )

        disconnected_users = []

        for user_id, connection in self.connections.items():
            if user_id != exclude_user:
                try:
                    await connection.send(message.to_json())
                except websockets.exceptions.ConnectionClosed:
                    disconnected_users.append(user_id)

        # Clean up disconnected users
        for user_id in disconnected_users:
            await self.remove_user(user_id)

    def is_empty(self) -> bool:
        """Check if session has no users"""
        return len(self.users) == 0

    def is_idle(self, idle_timeout_minutes: int = 30) -> bool:
        """Check if session has been idle"""
        return datetime.utcnow() - self.last_activity > timedelta(
            minutes=idle_timeout_minutes
        )


class CollaborationServer:
    """WebSocket server for real-time collaboration"""

    def __init__(self, host: str = "localhost", port: int = 8765):
        self.host = host
        self.port = port
        self.sessions: Dict[str, CollaborationSession] = {}
        self.user_sessions: Dict[str, str] = {}  # user_id -> document_id
        self.cleanup_task: Optional[asyncio.Task] = None
        self.logger = logging.getLogger("CollaborationServer")

    async def start(self):
        """Start the collaboration server"""
        self.logger.info(f"Starting collaboration server on {self.host}:{self.port}")

        # Start cleanup task
        self.cleanup_task = asyncio.create_task(self._cleanup_idle_sessions())

        # Start WebSocket server
        async with websockets.serve(self.handle_connection, self.host, self.port):
            self.logger.info("Collaboration server started")
            await asyncio.Future()  # Run forever

    async def stop(self):
        """Stop the collaboration server"""
        if self.cleanup_task:
            self.cleanup_task.cancel()

        # Close all sessions
        for session in self.sessions.values():
            for user_id in list(session.users.keys()):
                await session.remove_user(user_id)

        self.logger.info("Collaboration server stopped")

    async def handle_connection(self, websocket: WebSocketServerProtocol, path: str):
        """Handle new WebSocket connection"""
        user_id = None
        document_id = None

        try:
            # Wait for initial join message
            initial_message = await websocket.recv()
            message = CollaborationMessage.from_json(initial_message)

            if message.message_type != MessageType.USER_JOIN:
                await websocket.send(
                    json.dumps(
                        {"type": "error", "message": "First message must be USER_JOIN"}
                    )
                )
                return

            # Extract user and document information
            user_id = message.data.get("user_id")
            user_name = message.data.get("user_name")
            document_id = message.data.get("document_id")
            avatar_url = message.data.get("avatar_url")

            if not user_id or not user_name or not document_id:
                await websocket.send(
                    json.dumps(
                        {
                            "type": "error",
                            "message": "Missing required fields: user_id, user_name, document_id",
                        }
                    )
                )
                return

            # Get or create session
            session = await self._get_or_create_session(document_id)

            # Add user to session
            await session.add_user(user_id, user_name, websocket, avatar_url)
            self.user_sessions[user_id] = document_id

            self.logger.info(f"User {user_id} joined document {document_id}")

            # Handle subsequent messages
            async for raw_message in websocket:
                try:
                    message = CollaborationMessage.from_json(raw_message)
                    await session.handle_message(user_id, message)
                except Exception as e:
                    self.logger.error(f"Error handling message from {user_id}: {e}")
                    await websocket.send(
                        json.dumps({"type": "error", "message": str(e)})
                    )

        except websockets.exceptions.ConnectionClosed:
            self.logger.info(f"Connection closed for user {user_id}")
        except Exception as e:
            self.logger.error(f"Error in connection handler: {e}")
        finally:
            # Clean up user
            if user_id and document_id:
                session = self.sessions.get(document_id)
                if session:
                    await session.remove_user(user_id)

                if user_id in self.user_sessions:
                    del self.user_sessions[user_id]

                self.logger.info(
                    f"User {user_id} disconnected from document {document_id}"
                )

    async def _get_or_create_session(self, document_id: str) -> CollaborationSession:
        """Get existing session or create new one"""
        if document_id not in self.sessions:
            self.sessions[document_id] = CollaborationSession(document_id)
            self.logger.info(
                f"Created new collaboration session for document {document_id}"
            )

        return self.sessions[document_id]

    async def _cleanup_idle_sessions(self):
        """Periodically clean up idle sessions"""
        while True:
            try:
                await asyncio.sleep(300)  # Check every 5 minutes

                idle_sessions = []
                for document_id, session in self.sessions.items():
                    if session.is_empty() or session.is_idle():
                        idle_sessions.append(document_id)

                for document_id in idle_sessions:
                    session = self.sessions[document_id]

                    # Remove all users
                    for user_id in list(session.users.keys()):
                        await session.remove_user(user_id)

                    # Remove session
                    del self.sessions[document_id]
                    self.logger.info(
                        f"Cleaned up idle session for document {document_id}"
                    )

            except asyncio.CancelledError:
                break
            except Exception as e:
                self.logger.error(f"Error in cleanup task: {e}")

    def get_session_stats(self) -> Dict[str, Any]:
        """Get collaboration server statistics"""
        return {
            "active_sessions": len(self.sessions),
            "total_users": len(self.user_sessions),
            "sessions": {
                doc_id: {
                    "users": len(session.users),
                    "last_activity": session.last_activity.isoformat(),
                }
                for doc_id, session in self.sessions.items()
            },
        }
