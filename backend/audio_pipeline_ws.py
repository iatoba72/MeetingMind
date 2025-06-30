"""
WebSocket handler for unified audio pipeline
Manages communication between frontend AudioPipeline and backend audio processing
"""

import asyncio
import json
import logging
from typing import Dict, List, Optional, Any
from datetime import datetime
import uuid

from fastapi import WebSocket, WebSocketDisconnect
from audio_processor import audio_processor
from network_audio_server import get_network_audio_server, NetworkAudioServer
from audio_pipeline_processor import pipeline_processor, AudioSourceType

logger = logging.getLogger(__name__)


class AudioPipelineManager:
    """Manages audio pipeline WebSocket connections and audio source coordination"""

    def __init__(self):
        self.active_connections: Dict[str, WebSocket] = {}
        self.client_sources: Dict[str, List[str]] = (
            {}
        )  # client_id -> list of source_ids
        self.network_audio_server: Optional[NetworkAudioServer] = None

    async def initialize(self):
        """Initialize the audio pipeline manager"""
        # Get the network audio server instance
        self.network_audio_server = await get_network_audio_server()

        # Register callback for network audio chunks
        self.network_audio_server.add_audio_callback(self._handle_network_audio_chunk)

        # Start the pipeline processor
        await pipeline_processor.start()

        # Set up transcription and metrics callbacks
        pipeline_processor.add_transcription_callback(self._handle_transcription_result)
        pipeline_processor.add_metrics_callback(self._handle_metrics_update)

        logger.info("AudioPipelineManager initialized")

    async def connect(self, websocket: WebSocket, client_id: str):
        """Handle new WebSocket connection"""
        await websocket.accept()
        self.active_connections[client_id] = websocket
        self.client_sources[client_id] = []

        logger.info(f"AudioPipeline client connected: {client_id}")

        # Send initial status
        await self._send_to_client(
            client_id,
            {
                "type": "connection_established",
                "client_id": client_id,
                "server_status": "ready",
            },
        )

    async def disconnect(self, client_id: str):
        """Handle WebSocket disconnection"""
        if client_id in self.active_connections:
            # Stop all sources for this client
            sources_to_stop = self.client_sources.get(client_id, [])
            for source_id in sources_to_stop:
                await self._stop_network_source(source_id)

            # Clean up
            del self.active_connections[client_id]
            if client_id in self.client_sources:
                del self.client_sources[client_id]

            logger.info(f"AudioPipeline client disconnected: {client_id}")

    async def handle_message(self, client_id: str, message: Dict[str, Any]):
        """Handle incoming WebSocket messages"""
        message_type = message.get("type")

        try:
            if message_type == "start_network_source":
                await self._handle_start_network_source(client_id, message)
            elif message_type == "stop_network_source":
                await self._handle_stop_network_source(client_id, message)
            elif message_type == "audio_chunks":
                await self._handle_audio_chunks(client_id, message)
            elif message_type == "get_source_status":
                await self._handle_get_source_status(client_id, message)
            elif message_type == "update_source_config":
                await self._handle_update_source_config(client_id, message)
            elif message_type == "register_local_source":
                await self._handle_register_local_source(client_id, message)
            else:
                logger.warning(f"Unknown message type from {client_id}: {message_type}")

        except Exception as e:
            logger.error(f"Error handling message from {client_id}: {e}")
            await self._send_error_to_client(client_id, str(e))

    async def _handle_start_network_source(
        self, client_id: str, message: Dict[str, Any]
    ):
        """Start a network audio source (RTMP/SRT)"""
        source_id = message.get("sourceId")
        config = message.get("config", {})

        if not source_id:
            raise ValueError("sourceId is required")

        protocol = config.get("protocol", "rtmp").lower()
        url = config.get("url", "")

        logger.info(
            f"Starting network source {source_id} for client {client_id}: {protocol}"
        )

        # Determine source type
        source_type = (
            AudioSourceType.NETWORK_RTMP
            if protocol == "rtmp"
            else AudioSourceType.NETWORK_SRT
        )

        # Add source to pipeline processor
        source_added = await pipeline_processor.add_source(
            source_id=source_id,
            client_id=client_id,
            source_type=source_type,
            config={
                "protocol": protocol,
                "url": url,
                "sample_rate": config.get("sampleRate", 44100),
                "channels": config.get("channels", 2),
            },
        )

        if not source_added:
            raise Exception(f"Failed to add source {source_id} to pipeline processor")

        # Add to client's sources
        if client_id not in self.client_sources:
            self.client_sources[client_id] = []
        self.client_sources[client_id].append(source_id)

        await self._send_to_client(
            client_id,
            {"type": "source_status", "sourceId": source_id, "status": "connecting"},
        )

        # Simulate connection process
        await asyncio.sleep(1)

        await self._send_to_client(
            client_id,
            {"type": "source_status", "sourceId": source_id, "status": "connected"},
        )

    async def _handle_stop_network_source(
        self, client_id: str, message: Dict[str, Any]
    ):
        """Stop a network audio source"""
        source_id = message.get("sourceId")

        if not source_id:
            return

        await self._stop_network_source(source_id)

        # Remove from client's sources
        if client_id in self.client_sources:
            if source_id in self.client_sources[client_id]:
                self.client_sources[client_id].remove(source_id)

        await self._send_to_client(
            client_id,
            {"type": "source_status", "sourceId": source_id, "status": "disconnected"},
        )

    async def _stop_network_source(self, source_id: str):
        """Stop a specific network source"""
        logger.info(f"Stopping network source: {source_id}")

        if not self.network_audio_server:
            logger.warning("Network audio server not available")
            return

        # Remove the stream from active streams
        active_streams = self.network_audio_server.get_active_streams()
        if source_id in active_streams:
            # Get stream info before removal
            stream_info = active_streams[source_id]
            logger.info(f"Stopping stream {source_id} ({stream_info.protocol.value})")

            # Remove from active streams
            if hasattr(self.network_audio_server, "active_streams"):
                self.network_audio_server.active_streams.pop(source_id, None)

            # Stop any recording for this stream
            if (
                hasattr(self.network_audio_server, "recorded_streams")
                and source_id in self.network_audio_server.recorded_streams
            ):
                self.network_audio_server.recorded_streams.pop(source_id, None)

            # Remove from pipeline processor
            await pipeline_processor.remove_source(source_id)

            logger.info(f"Successfully stopped network source: {source_id}")
        else:
            logger.warning(f"Network source {source_id} not found in active streams")

    async def _handle_audio_chunks(self, client_id: str, message: Dict[str, Any]):
        """Handle audio chunks from frontend"""
        chunks = message.get("chunks", [])

        for chunk_data in chunks:
            try:
                # Process through the pipeline processor
                result = await pipeline_processor.process_audio_chunk(chunk_data)

                # Send processing result back to client
                await self._send_to_client(
                    client_id,
                    {
                        "type": "chunk_processed",
                        "source_id": chunk_data.get("sourceId"),
                        "result": result,
                        "timestamp": datetime.now().isoformat(),
                    },
                )

            except Exception as e:
                logger.error(f"Error processing audio chunk from {client_id}: {e}")
                await self._send_error_to_client(
                    client_id, f"Chunk processing failed: {e}"
                )

    async def _handle_transcription_result(self, transcription_data: Dict[str, Any]):
        """Handle transcription results from pipeline processor"""
        try:
            # Broadcast transcription result to all clients
            await self.broadcast_to_all(
                {"type": "transcription_result", "data": transcription_data}
            )

        except Exception as e:
            logger.error(f"Error handling transcription result: {e}")

    async def _handle_metrics_update(self, metrics_data: Dict[str, Any]):
        """Handle metrics updates from pipeline processor"""
        try:
            # Broadcast metrics to all clients
            await self.broadcast_to_all(
                {"type": "metrics_update", "data": metrics_data}
            )

        except Exception as e:
            logger.error(f"Error handling metrics update: {e}")

    async def _handle_get_source_status(self, client_id: str, message: Dict[str, Any]):
        """Get status of network audio sources"""
        if not self.network_audio_server:
            await self._send_to_client(
                client_id,
                {
                    "type": "source_status_response",
                    "sources": [],
                    "server_status": "not_initialized",
                },
            )
            return

        # Get active streams from network audio server
        active_streams = self.network_audio_server.get_active_streams()
        metrics = self.network_audio_server.get_metrics()

        sources_status = []
        for stream_id, stream_info in active_streams.items():
            sources_status.append(
                {
                    "id": stream_id,
                    "protocol": stream_info.protocol.value,
                    "status": stream_info.state.value,
                    "bytes_received": stream_info.bytes_received,
                    "packets_received": stream_info.packets_received,
                    "jitter": stream_info.jitter,
                    "latency": stream_info.latency,
                    "last_packet_at": (
                        stream_info.last_packet_at.isoformat()
                        if stream_info.last_packet_at
                        else None
                    ),
                }
            )

        await self._send_to_client(
            client_id,
            {
                "type": "source_status_response",
                "sources": sources_status,
                "metrics": {
                    "bytes_per_second": metrics.bytes_per_second,
                    "packets_per_second": metrics.packets_per_second,
                    "packet_loss_rate": metrics.packet_loss_rate,
                    "average_jitter": metrics.average_jitter,
                    "average_latency": metrics.average_latency,
                    "active_streams": metrics.active_streams,
                },
                "server_status": "running",
            },
        )

    async def _handle_update_source_config(
        self, client_id: str, message: Dict[str, Any]
    ):
        """Update configuration for a network source"""
        source_id = message.get("sourceId")
        config = message.get("config", {})

        logger.info(f"Updating config for source {source_id}: {config}")

        # Implementation would update network source configuration
        # For now, acknowledge the request
        await self._send_to_client(
            client_id,
            {"type": "source_config_updated", "sourceId": source_id, "config": config},
        )

    async def _handle_register_local_source(
        self, client_id: str, message: Dict[str, Any]
    ):
        """Register a local audio source (microphone/system)"""
        source_id = message.get("sourceId")
        source_type_str = message.get("sourceType")
        config = message.get("config", {})

        if not source_id or not source_type_str:
            raise ValueError("sourceId and sourceType are required")

        # Map source type
        source_type = (
            AudioSourceType.MICROPHONE
            if source_type_str == "microphone"
            else AudioSourceType.SYSTEM
        )

        logger.info(
            f"Registering local source {source_id} ({source_type_str}) for client {client_id}"
        )

        # Add source to pipeline processor
        source_added = await pipeline_processor.add_source(
            source_id=source_id,
            client_id=client_id,
            source_type=source_type,
            config=config,
        )

        if not source_added:
            raise Exception(f"Failed to register source {source_id}")

        # Add to client's sources
        if client_id not in self.client_sources:
            self.client_sources[client_id] = []
        self.client_sources[client_id].append(source_id)

        # Acknowledge registration
        await self._send_to_client(
            client_id,
            {
                "type": "source_registered",
                "sourceId": source_id,
                "sourceType": source_type_str,
                "status": "registered",
            },
        )

    async def _handle_network_audio_chunk(self, chunk, stream_info):
        """Handle audio chunk from network audio server"""
        # Broadcast network audio chunk to all connected clients
        network_audio_data = {
            "type": "network_audio",
            "data": {
                "sourceId": f"network_{stream_info.protocol.value}_{stream_info.source_port}",
                "chunk": {
                    "chunk_id": chunk.chunk_id,
                    "timestamp": chunk.timestamp,
                    "duration_ms": chunk.duration_ms,
                    "rms_level": chunk.rms_level,
                    "has_voice": chunk.has_voice,
                    "sample_rate": chunk.sample_rate,
                    "channels": chunk.channels,
                },
                "streamInfo": {
                    "protocol": stream_info.protocol.value,
                    "state": stream_info.state.value,
                    "bytes_received": stream_info.bytes_received,
                    "packets_received": stream_info.packets_received,
                    "jitter": stream_info.jitter,
                    "latency": stream_info.latency,
                },
            },
        }

        # Send to all connected clients
        for client_id in self.active_connections:
            await self._send_to_client(client_id, network_audio_data)

    async def _send_to_client(self, client_id: str, message: Dict[str, Any]):
        """Send message to specific client"""
        if client_id not in self.active_connections:
            return

        websocket = self.active_connections[client_id]
        try:
            await websocket.send_text(json.dumps(message))
        except Exception as e:
            logger.error(f"Error sending message to client {client_id}: {e}")
            # Remove disconnected client
            await self.disconnect(client_id)

    async def _send_error_to_client(self, client_id: str, error_message: str):
        """Send error message to client"""
        await self._send_to_client(
            client_id,
            {
                "type": "error",
                "message": error_message,
                "timestamp": datetime.now().isoformat(),
            },
        )

    async def broadcast_to_all(self, message: Dict[str, Any]):
        """Broadcast message to all connected clients"""
        for client_id in list(self.active_connections.keys()):
            await self._send_to_client(client_id, message)


# Global instance
audio_pipeline_manager = AudioPipelineManager()


async def handle_audio_pipeline_websocket(websocket: WebSocket, client_id: str = None):
    """WebSocket endpoint handler for audio pipeline"""
    if not client_id:
        client_id = str(uuid.uuid4())

    # Initialize manager if not already done
    if not hasattr(audio_pipeline_manager, "_initialized"):
        await audio_pipeline_manager.initialize()
        audio_pipeline_manager._initialized = True

    await audio_pipeline_manager.connect(websocket, client_id)

    try:
        while True:
            # Receive message from client
            data = await websocket.receive_text()
            message = json.loads(data)

            # Handle the message
            await audio_pipeline_manager.handle_message(client_id, message)

    except WebSocketDisconnect:
        await audio_pipeline_manager.disconnect(client_id)
    except Exception as e:
        logger.error(f"Error in audio pipeline WebSocket handler: {e}")
        await audio_pipeline_manager.disconnect(client_id)
