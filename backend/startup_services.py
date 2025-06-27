"""
Startup Services for MeetingMind
Handles initialization and startup of various services
"""

import asyncio
import logging
from typing import List, Dict, Any

logger = logging.getLogger(__name__)

class StartupService:
    """Base class for startup services"""
    
    def __init__(self, name: str):
        self.name = name
        self.is_running = False
        self.startup_error = None
    
    async def start(self) -> bool:
        """Start the service"""
        try:
            logger.info(f"Starting {self.name}...")
            result = await self._start_implementation()
            if result:
                self.is_running = True
                logger.info(f"{self.name} started successfully")
            else:
                logger.error(f"Failed to start {self.name}")
            return result
        except Exception as e:
            self.startup_error = str(e)
            logger.error(f"Error starting {self.name}: {e}")
            return False
    
    async def stop(self) -> bool:
        """Stop the service"""
        try:
            if self.is_running:
                logger.info(f"Stopping {self.name}...")
                result = await self._stop_implementation()
                if result:
                    self.is_running = False
                    logger.info(f"{self.name} stopped successfully")
                return result
            return True
        except Exception as e:
            logger.error(f"Error stopping {self.name}: {e}")
            return False
    
    async def _start_implementation(self) -> bool:
        """Override this method to implement service startup"""
        raise NotImplementedError
    
    async def _stop_implementation(self) -> bool:
        """Override this method to implement service shutdown"""
        raise NotImplementedError
    
    def get_status(self) -> Dict[str, Any]:
        """Get service status"""
        return {
            "name": self.name,
            "running": self.is_running,
            "error": self.startup_error
        }

class RTMPServerStartupService(StartupService):
    """Startup service for RTMP server"""
    
    def __init__(self):
        super().__init__("RTMP Server")
        self.rtmp_server = None
    
    async def _start_implementation(self) -> bool:
        try:
            from rtmp_server import get_rtmp_server, RTMPServerConfig
            
            # Create RTMP server with default configuration
            config = RTMPServerConfig(
                port=1935,
                max_connections=50,
                timeout_seconds=30,
                recording_enabled=False,
                enable_stats=True
            )
            
            self.rtmp_server = await get_rtmp_server(config)
            return await self.rtmp_server.start()
            
        except ImportError:
            logger.warning("RTMP server not available - FFmpeg may not be installed")
            return False
        except Exception as e:
            logger.error(f"Failed to start RTMP server: {e}")
            return False
    
    async def _stop_implementation(self) -> bool:
        if self.rtmp_server:
            return await self.rtmp_server.stop()
        return True

class NetworkAudioServerStartupService(StartupService):
    """Startup service for Network Audio Server"""
    
    def __init__(self):
        super().__init__("Network Audio Server")
        self.network_server = None
    
    async def _start_implementation(self) -> bool:
        try:
            from network_audio_server import get_network_audio_server
            
            self.network_server = await get_network_audio_server()
            # Network audio server is started automatically
            return True
            
        except Exception as e:
            logger.error(f"Failed to start Network Audio Server: {e}")
            return False
    
    async def _stop_implementation(self) -> bool:
        if self.network_server:
            await self.network_server.stop()
        return True

class AudioPipelineStartupService(StartupService):
    """Startup service for Audio Pipeline Processor"""
    
    def __init__(self):
        super().__init__("Audio Pipeline Processor")
        self.pipeline_processor = None
    
    async def _start_implementation(self) -> bool:
        try:
            from audio_pipeline_processor import pipeline_processor
            
            self.pipeline_processor = pipeline_processor
            await self.pipeline_processor.start()
            return True
            
        except Exception as e:
            logger.error(f"Failed to start Audio Pipeline Processor: {e}")
            return False
    
    async def _stop_implementation(self) -> bool:
        if self.pipeline_processor:
            await self.pipeline_processor.stop()
        return True

class DatabaseStartupService(StartupService):
    """Startup service for Database"""
    
    def __init__(self):
        super().__init__("Database")
    
    async def _start_implementation(self) -> bool:
        try:
            from database import init_database
            
            await asyncio.get_event_loop().run_in_executor(None, init_database)
            return True
            
        except Exception as e:
            logger.error(f"Failed to initialize database: {e}")
            return False
    
    async def _stop_implementation(self) -> bool:
        # Database cleanup if needed
        return True

class AIProviderStartupService(StartupService):
    """Startup service for AI Providers"""
    
    def __init__(self):
        super().__init__("AI Provider Registry")
    
    async def _start_implementation(self) -> bool:
        try:
            from ai_provider_registry import initialize_registry
            
            await initialize_registry()
            return True
            
        except Exception as e:
            logger.error(f"Failed to initialize AI provider registry: {e}")
            return False
    
    async def _stop_implementation(self) -> bool:
        # AI provider cleanup if needed
        return True

class SRTServerStartupService(StartupService):
    """Startup service for SRT server"""
    
    def __init__(self):
        super().__init__("SRT Server")
        self.srt_server = None
    
    async def _start_implementation(self) -> bool:
        try:
            from srt_server import get_srt_server, SRTServerConfig
            
            # Create SRT server with default configuration
            config = SRTServerConfig(
                port=9998,
                max_connections=50,
                latency_ms=200,
                recv_buffer_size=12058624,
                recording_enabled=False,
                enable_stats=True
            )
            
            self.srt_server = await get_srt_server(config)
            return await self.srt_server.start()
            
        except ImportError:
            logger.warning("SRT server not available - FFmpeg with SRT support may not be installed")
            return False
        except Exception as e:
            logger.error(f"Failed to start SRT server: {e}")
            return False
    
    async def _stop_implementation(self) -> bool:
        if self.srt_server:
            return await self.srt_server.stop()
        return True

class SourceSwitcherStartupService(StartupService):
    """Startup service for Source Switcher"""
    
    def __init__(self):
        super().__init__("Source Switcher")
        self.source_switcher = None
    
    async def _start_implementation(self) -> bool:
        try:
            from source_switcher import get_source_switcher, SwitchingConfig
            
            # Create source switcher with default configuration
            config = SwitchingConfig(
                auto_switch_enabled=True,
                fallback_timeout_seconds=5,
                quality_threshold=0.7,
                sticky_switching=True
            )
            
            self.source_switcher = await get_source_switcher(config)
            return await self.source_switcher.start()
            
        except Exception as e:
            logger.error(f"Failed to start source switcher: {e}")
            return False
    
    async def _stop_implementation(self) -> bool:
        if self.source_switcher:
            return await self.source_switcher.stop()
        return True

class JitterBufferStartupService(StartupService):
    """Startup service for Jitter Buffer Manager"""
    
    def __init__(self):
        super().__init__("Jitter Buffer Manager")
        self.jitter_buffer_manager = None
    
    async def _start_implementation(self) -> bool:
        try:
            from jitter_buffer import get_jitter_buffer_manager
            
            # Initialize jitter buffer manager
            self.jitter_buffer_manager = await get_jitter_buffer_manager()
            
            # Jitter buffer manager doesn't need explicit starting
            # It's ready to create buffers on demand
            return True
            
        except Exception as e:
            logger.error(f"Failed to start jitter buffer manager: {e}")
            return False
    
    async def _stop_implementation(self) -> bool:
        if self.jitter_buffer_manager:
            await self.jitter_buffer_manager.stop_all_buffers()
        return True

class RecordingManagerStartupService(StartupService):
    """Startup service for Recording Manager"""
    
    def __init__(self):
        super().__init__("Recording Manager")
        self.recording_manager = None
    
    async def _start_implementation(self) -> bool:
        try:
            from stream_recorder import get_recording_manager
            
            # Initialize recording manager
            self.recording_manager = await get_recording_manager()
            
            # Recording manager doesn't need explicit starting
            # It's ready to create recorders on demand
            return True
            
        except Exception as e:
            logger.error(f"Failed to start recording manager: {e}")
            return False
    
    async def _stop_implementation(self) -> bool:
        if self.recording_manager:
            await self.recording_manager.stop_all_recordings()
        return True

class NetworkTranscriptionStartupService(StartupService):
    """Startup service for Network Transcription"""
    
    def __init__(self):
        super().__init__("Network Transcription Service")
        self.transcription_service = None
        self.sync_service = None
    
    async def _start_implementation(self) -> bool:
        try:
            from network_transcription_service import get_network_transcription_service
            from video_transcription_sync import get_video_transcription_sync_service
            
            # Initialize transcription service
            self.transcription_service = await get_network_transcription_service()
            
            # Initialize video sync service
            self.sync_service = await get_video_transcription_sync_service()
            
            return True
            
        except Exception as e:
            logger.error(f"Failed to start network transcription service: {e}")
            return False
    
    async def _stop_implementation(self) -> bool:
        try:
            if self.transcription_service:
                await self.transcription_service.stop()
            
            if self.sync_service:
                await self.sync_service.stop()
            
            return True
        except Exception as e:
            logger.error(f"Failed to stop network transcription service: {e}")
            return False

class StartupManager:
    """Manages all startup services"""
    
    def __init__(self):
        self.services: List[StartupService] = [
            DatabaseStartupService(),
            AIProviderStartupService(),
            AudioPipelineStartupService(),
            NetworkAudioServerStartupService(),
            RTMPServerStartupService(),
            SRTServerStartupService(),
            SourceSwitcherStartupService(),
            JitterBufferStartupService(),
            RecordingManagerStartupService(),
            NetworkTranscriptionStartupService(),
        ]
        self.started_services: List[StartupService] = []
    
    async def start_all_services(self) -> bool:
        """Start all services in order"""
        logger.info("Starting MeetingMind services...")
        
        success_count = 0
        for service in self.services:
            try:
                if await service.start():
                    self.started_services.append(service)
                    success_count += 1
                else:
                    logger.warning(f"Service {service.name} failed to start but continuing...")
            except Exception as e:
                logger.error(f"Critical error starting {service.name}: {e}")
        
        logger.info(f"Started {success_count}/{len(self.services)} services successfully")
        return success_count > 0  # At least one service must start
    
    async def stop_all_services(self) -> bool:
        """Stop all started services in reverse order"""
        logger.info("Stopping MeetingMind services...")
        
        success_count = 0
        # Stop in reverse order
        for service in reversed(self.started_services):
            try:
                if await service.stop():
                    success_count += 1
            except Exception as e:
                logger.error(f"Error stopping {service.name}: {e}")
        
        self.started_services.clear()
        logger.info(f"Stopped {success_count} services")
        return True
    
    def get_service_status(self) -> List[Dict[str, Any]]:
        """Get status of all services"""
        return [service.get_status() for service in self.services]
    
    def get_running_services(self) -> List[str]:
        """Get list of running service names"""
        return [service.name for service in self.services if service.is_running]
    
    def get_failed_services(self) -> List[Dict[str, str]]:
        """Get list of failed services with error messages"""
        return [
            {"name": service.name, "error": service.startup_error}
            for service in self.services
            if service.startup_error is not None
        ]

# Global startup manager instance
startup_manager = StartupManager()

async def initialize_services() -> bool:
    """Initialize all MeetingMind services"""
    return await startup_manager.start_all_services()

async def shutdown_services() -> bool:
    """Shutdown all MeetingMind services"""
    return await startup_manager.stop_all_services()

def get_services_status() -> Dict[str, Any]:
    """Get status of all services"""
    return {
        "services": startup_manager.get_service_status(),
        "running": startup_manager.get_running_services(),
        "failed": startup_manager.get_failed_services()
    }