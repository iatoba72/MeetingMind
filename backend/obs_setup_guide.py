"""
OBS Streaming Setup Guide Generator for MeetingMind
Provides comprehensive setup instructions for OBS Studio integration
"""

import logging
import json
from typing import Dict, List, Optional, Any
from dataclasses import dataclass, asdict
from enum import Enum
import platform
import os

logger = logging.getLogger(__name__)


class StreamingProtocol(Enum):
    RTMP = "rtmp"
    SRT = "srt"


class OBSVersion(Enum):
    OBS_28 = "28.x"
    OBS_29 = "29.x"
    OBS_30 = "30.x"


class StreamingQuality(Enum):
    LOW = "low"  # 720p30, 2500 kbps
    MEDIUM = "medium"  # 1080p30, 4000 kbps
    HIGH = "high"  # 1080p60, 6000 kbps
    ULTRA = "ultra"  # 1440p60, 8000 kbps


@dataclass
class StreamingSettings:
    """Streaming configuration settings"""

    protocol: StreamingProtocol
    server_url: str
    stream_key: str
    video_bitrate: int
    audio_bitrate: int
    video_resolution: str
    video_fps: int
    encoder: str
    rate_control: str
    keyframe_interval: int
    audio_sample_rate: int
    audio_channels: int
    advanced_settings: Dict[str, Any]


@dataclass
class OBSSetupGuide:
    """Complete OBS setup guide"""

    protocol: StreamingProtocol
    version: OBSVersion
    quality: StreamingQuality
    settings: StreamingSettings
    setup_steps: List[str]
    troubleshooting: Dict[str, str]
    performance_tips: List[str]
    advanced_configuration: Dict[str, Any]
    scene_setup: List[str]
    audio_setup: List[str]
    plugin_recommendations: List[Dict[str, str]]


class OBSSetupGuideGenerator:
    """
    OBS Setup Guide Generator

    Features:
    - Protocol-specific setup (RTMP/SRT)
    - Quality preset configurations
    - Platform-specific instructions
    - Performance optimization tips
    - Troubleshooting guides
    - Advanced configuration options
    - Plugin recommendations
    - Scene and audio setup guides
    """

    def __init__(self):
        self.rtmp_port = 1935
        self.srt_port = 9998
        self.server_host = "localhost"

        # Quality presets
        self.quality_presets = {
            StreamingQuality.LOW: {
                "video_bitrate": 2500,
                "audio_bitrate": 128,
                "video_resolution": "1280x720",
                "video_fps": 30,
                "encoder": "x264",
                "description": "Good for slower computers and limited bandwidth",
            },
            StreamingQuality.MEDIUM: {
                "video_bitrate": 4000,
                "audio_bitrate": 160,
                "video_resolution": "1920x1080",
                "video_fps": 30,
                "encoder": "x264",
                "description": "Balanced quality for most use cases",
            },
            StreamingQuality.HIGH: {
                "video_bitrate": 6000,
                "audio_bitrate": 320,
                "video_resolution": "1920x1080",
                "video_fps": 60,
                "encoder": "hardware",
                "description": "High quality for powerful computers",
            },
            StreamingQuality.ULTRA: {
                "video_bitrate": 8000,
                "audio_bitrate": 320,
                "video_resolution": "2560x1440",
                "video_fps": 60,
                "encoder": "hardware",
                "description": "Ultra quality for high-end systems",
            },
        }

    def generate_setup_guide(
        self,
        protocol: StreamingProtocol,
        quality: StreamingQuality = StreamingQuality.MEDIUM,
        obs_version: OBSVersion = OBSVersion.OBS_30,
        custom_settings: Optional[Dict[str, Any]] = None,
    ) -> OBSSetupGuide:
        """Generate a complete OBS setup guide"""
        try:
            # Get quality preset
            preset = self.quality_presets[quality]

            # Create streaming settings
            settings = self._create_streaming_settings(
                protocol, preset, custom_settings
            )

            # Generate setup steps
            setup_steps = self._generate_setup_steps(protocol, settings, obs_version)

            # Generate troubleshooting guide
            troubleshooting = self._generate_troubleshooting_guide(protocol)

            # Generate performance tips
            performance_tips = self._generate_performance_tips(quality, preset)

            # Generate advanced configuration
            advanced_config = self._generate_advanced_configuration(protocol, settings)

            # Generate scene setup guide
            scene_setup = self._generate_scene_setup_guide()

            # Generate audio setup guide
            audio_setup = self._generate_audio_setup_guide(settings)

            # Generate plugin recommendations
            plugin_recommendations = self._generate_plugin_recommendations()

            return OBSSetupGuide(
                protocol=protocol,
                version=obs_version,
                quality=quality,
                settings=settings,
                setup_steps=setup_steps,
                troubleshooting=troubleshooting,
                performance_tips=performance_tips,
                advanced_configuration=advanced_config,
                scene_setup=scene_setup,
                audio_setup=audio_setup,
                plugin_recommendations=plugin_recommendations,
            )

        except Exception as e:
            logger.error(f"Error generating OBS setup guide: {e}")
            raise

    def _create_streaming_settings(
        self,
        protocol: StreamingProtocol,
        preset: Dict[str, Any],
        custom_settings: Optional[Dict[str, Any]] = None,
    ) -> StreamingSettings:
        """Create streaming settings based on protocol and quality preset"""

        # Base settings
        if protocol == StreamingProtocol.RTMP:
            server_url = f"rtmp://{self.server_host}:{self.rtmp_port}/live"
            stream_key = "meetingmind-stream"
        else:  # SRT
            server_url = f"srt://{self.server_host}:{self.srt_port}"
            stream_key = "meetingmind-srt"

        # Advanced settings based on protocol
        advanced_settings = {}
        if protocol == StreamingProtocol.SRT:
            advanced_settings.update(
                {
                    "latency": 200,
                    "maxbw": -1,
                    "pbkeylen": 0,
                    "passphrase": "",
                    "streamid": stream_key,
                }
            )
        elif protocol == StreamingProtocol.RTMP:
            advanced_settings.update(
                {"use_auth": False, "username": "", "password": ""}
            )

        # Create settings object
        settings = StreamingSettings(
            protocol=protocol,
            server_url=server_url,
            stream_key=stream_key,
            video_bitrate=preset["video_bitrate"],
            audio_bitrate=preset["audio_bitrate"],
            video_resolution=preset["video_resolution"],
            video_fps=preset["video_fps"],
            encoder=preset["encoder"],
            rate_control="CBR",
            keyframe_interval=2,
            audio_sample_rate=48000,
            audio_channels=2,
            advanced_settings=advanced_settings,
        )

        # Apply custom settings if provided
        if custom_settings:
            for key, value in custom_settings.items():
                if hasattr(settings, key):
                    setattr(settings, key, value)

        return settings

    def _generate_setup_steps(
        self,
        protocol: StreamingProtocol,
        settings: StreamingSettings,
        obs_version: OBSVersion,
    ) -> List[str]:
        """Generate step-by-step setup instructions"""

        steps = [
            "Download and install OBS Studio from https://obsproject.com/",
            "Launch OBS Studio",
            "Run the Auto-Configuration Wizard (recommended for first-time users)",
        ]

        if protocol == StreamingProtocol.RTMP:
            steps.extend(
                [
                    "Go to Settings → Stream",
                    "Set Service to 'Custom'",
                    f"Set Server to '{settings.server_url}'",
                    f"Set Stream Key to '{settings.stream_key}'",
                    "Click 'Apply' to save stream settings",
                ]
            )
        else:  # SRT
            steps.extend(
                [
                    "Go to Settings → Stream",
                    "Set Service to 'Custom'",
                    f"Set Server to '{settings.server_url}'",
                    f"Set Stream Key to '{settings.stream_key}'",
                    f"Configure latency to {settings.advanced_settings.get('latency', 200)}ms",
                    "Click 'Apply' to save stream settings",
                ]
            )

        # Video settings
        steps.extend(
            [
                "Go to Settings → Video",
                f"Set Base (Canvas) Resolution to {settings.video_resolution}",
                f"Set Output (Scaled) Resolution to {settings.video_resolution}",
                f"Set Common FPS Values to {settings.video_fps}",
                "Click 'Apply' to save video settings",
            ]
        )

        # Output settings
        if settings.encoder == "hardware":
            encoder_name = self._get_hardware_encoder_name()
            steps.extend(
                [
                    "Go to Settings → Output",
                    "Set Output Mode to 'Advanced'",
                    "Select the 'Streaming' tab",
                    f"Set Encoder to '{encoder_name}'",
                    f"Set Bitrate to {settings.video_bitrate} Kbps",
                    f"Set Keyframe Interval to {settings.keyframe_interval} seconds",
                    "Set Rate Control to 'CBR'",
                ]
            )
        else:  # x264
            steps.extend(
                [
                    "Go to Settings → Output",
                    "Set Output Mode to 'Advanced'",
                    "Select the 'Streaming' tab",
                    "Set Encoder to 'x264'",
                    f"Set Bitrate to {settings.video_bitrate} Kbps",
                    f"Set Keyframe Interval to {settings.keyframe_interval} seconds",
                    "Set Rate Control to 'CBR'",
                    "Set CPU Usage Preset to 'veryfast' (adjust based on CPU performance)",
                ]
            )

        # Audio settings
        steps.extend(
            [
                "Go to Settings → Audio",
                f"Set Sample Rate to {settings.audio_sample_rate} Hz",
                f"Set Channels to {'Stereo' if settings.audio_channels == 2 else 'Mono'}",
                "Go to Settings → Output → Audio",
                f"Set Audio Bitrate to {settings.audio_bitrate} Kbps",
                "Click 'Apply' then 'OK' to save all settings",
            ]
        )

        # Final steps
        steps.extend(
            [
                "Set up your scenes and sources (see Scene Setup Guide)",
                "Configure audio sources (see Audio Setup Guide)",
                "Click 'Start Streaming' to begin",
                "Monitor stream status in MeetingMind dashboard",
            ]
        )

        return steps

    def _generate_troubleshooting_guide(
        self, protocol: StreamingProtocol
    ) -> Dict[str, str]:
        """Generate troubleshooting guide"""

        common_issues = {
            "Connection Failed": "Ensure MeetingMind server is running and the correct port is open. Check firewall settings.",
            "High CPU Usage": "Lower video quality, use hardware encoder (NVENC/AMF/QuickSync), or reduce frame rate.",
            "Dropped Frames": "Reduce bitrate, check network connection, or use wired ethernet instead of WiFi.",
            "Audio Sync Issues": "Ensure audio sample rate matches between OBS and MeetingMind (48kHz recommended).",
            "Poor Video Quality": "Increase bitrate, check encoder settings, or upgrade hardware.",
            "Stream Keeps Disconnecting": "Check network stability, reduce bitrate, or increase keyframe interval.",
            "No Audio in Stream": "Check audio device selection, ensure 'Monitor and Output' is selected for audio sources.",
            "Black Screen": "Check display capture settings, run OBS as administrator, or update graphics drivers.",
        }

        if protocol == StreamingProtocol.SRT:
            common_issues.update(
                {
                    "SRT Connection Timeout": "Increase latency setting, check SRT server status, or verify port configuration.",
                    "High Latency": "Reduce SRT latency setting, check network conditions, or use wired connection.",
                    "Packet Loss": "Increase SRT latency, check network quality, or reduce bitrate.",
                }
            )
        elif protocol == StreamingProtocol.RTMP:
            common_issues.update(
                {
                    "RTMP Handshake Failed": "Verify RTMP server is running and stream key is correct.",
                    "Authentication Error": "Check if authentication is enabled and credentials are correct.",
                    "Stream Key Rejected": "Ensure stream key format is correct and server accepts the key.",
                }
            )

        return common_issues

    def _generate_performance_tips(
        self, quality: StreamingQuality, preset: Dict[str, Any]
    ) -> List[str]:
        """Generate performance optimization tips"""

        tips = [
            "Close unnecessary applications while streaming",
            "Use a wired ethernet connection instead of WiFi when possible",
            "Ensure adequate CPU and GPU cooling",
            "Update graphics drivers regularly",
            "Use Game Mode on Windows for better performance",
            "Monitor CPU and GPU usage during streaming",
        ]

        if preset["encoder"] == "hardware":
            tips.extend(
                [
                    "Hardware encoding reduces CPU usage significantly",
                    "NVENC (NVIDIA), AMF (AMD), or QuickSync (Intel) provide good quality",
                    "Monitor GPU usage to ensure hardware encoder is working",
                ]
            )
        else:
            tips.extend(
                [
                    "x264 encoder provides excellent quality but uses more CPU",
                    "Adjust CPU preset based on available processing power",
                    "Consider upgrading to hardware encoding for better performance",
                ]
            )

        if quality in [StreamingQuality.HIGH, StreamingQuality.ULTRA]:
            tips.extend(
                [
                    "High quality streaming requires powerful hardware",
                    "Monitor temperature and performance during extended streaming",
                    "Consider reducing quality if experiencing performance issues",
                ]
            )

        return tips

    def _generate_advanced_configuration(
        self, protocol: StreamingProtocol, settings: StreamingSettings
    ) -> Dict[str, Any]:
        """Generate advanced configuration options"""

        config = {
            "video_advanced": {
                "color_format": "NV12",
                "color_space": "709",
                "color_range": "Partial",
                "scaling_filter": "Lanczos",
            },
            "audio_advanced": {
                "sample_rate": settings.audio_sample_rate,
                "bit_depth": "Float 32bit",
                "channels": "Stereo" if settings.audio_channels == 2 else "Mono",
            },
            "streaming_advanced": {
                "bind_ip": "default",
                "enable_new_networking_code": True,
                "low_latency_mode": protocol == StreamingProtocol.SRT,
            },
        }

        if protocol == StreamingProtocol.SRT:
            config["srt_advanced"] = {
                "latency_ms": settings.advanced_settings.get("latency", 200),
                "recv_buffer_size": "12MB",
                "max_bandwidth": "Unlimited",
                "encryption": "None",
                "congestion_control": "Live",
            }
        elif protocol == StreamingProtocol.RTMP:
            config["rtmp_advanced"] = {
                "chunk_size": "4096",
                "tcp_pacing": True,
                "nagle_algorithm": False,
            }

        return config

    def _generate_scene_setup_guide(self) -> List[str]:
        """Generate scene setup guide"""

        return [
            "Create a new scene by clicking the '+' button in Scenes",
            "Add a Display Capture source for screen sharing",
            "Add a Video Capture Device for webcam input",
            "Add an Audio Input Capture for microphone",
            "Add a Text (GDI+) source for titles or information",
            "Arrange sources using drag and drop",
            "Resize sources by dragging corners",
            "Use filters for effects (right-click source → Filters)",
            "Create multiple scenes for different streaming scenarios",
            "Use Scene Transitions for smooth changes between scenes",
        ]

    def _generate_audio_setup_guide(self, settings: StreamingSettings) -> List[str]:
        """Generate audio setup guide"""

        return [
            "Go to Settings → Audio",
            "Set Desktop Audio Device to your main audio output",
            "Set Mic/Auxiliary Audio Device to your microphone",
            f"Ensure Sample Rate is set to {settings.audio_sample_rate} Hz",
            "Add Audio Input Capture for additional microphones",
            "Add Audio Output Capture for application audio",
            "Use Audio Filters for noise suppression and gain",
            "Set audio monitoring to 'Monitor and Output' for streamed sources",
            "Adjust audio levels using the Audio Mixer",
            "Test audio before streaming to ensure proper levels",
            "Use Compressor filter to even out audio levels",
            "Apply Noise Gate to reduce background noise",
        ]

    def _generate_plugin_recommendations(self) -> List[Dict[str, str]]:
        """Generate plugin recommendations"""

        return [
            {
                "name": "StreamFX",
                "description": "Advanced effects and filters for professional streaming",
                "url": "https://github.com/Xaymar/obs-StreamFX",
                "category": "Effects",
            },
            {
                "name": "Advanced Scene Switcher",
                "description": "Automated scene switching based on various conditions",
                "url": "https://github.com/WarmUpTill/SceneSwitcher",
                "category": "Automation",
            },
            {
                "name": "Input Overlay",
                "description": "Display keyboard and mouse inputs on stream",
                "url": "https://github.com/univrsal/input-overlay",
                "category": "Overlay",
            },
            {
                "name": "Source Record",
                "description": "Record individual sources separately",
                "url": "https://github.com/exeldro/obs-source-record",
                "category": "Recording",
            },
            {
                "name": "Move Transition",
                "description": "Smooth movement transitions for sources",
                "url": "https://github.com/exeldro/obs-move-transition",
                "category": "Transitions",
            },
            {
                "name": "Browser Source",
                "description": "Built-in browser for web overlays",
                "url": "Built-in",
                "category": "Sources",
            },
        ]

    def _get_hardware_encoder_name(self) -> str:
        """Get the appropriate hardware encoder name based on system"""
        # This is a simplified implementation
        # In practice, you'd detect the available hardware
        return "NVIDIA NVENC H.264 (new)"

    def generate_quick_start_guide(self, protocol: StreamingProtocol) -> Dict[str, Any]:
        """Generate a condensed quick start guide"""

        port = self.rtmp_port if protocol == StreamingProtocol.RTMP else self.srt_port
        protocol_name = protocol.value.upper()

        return {
            "title": f"Quick Start - {protocol_name} Streaming to MeetingMind",
            "steps": [
                "Open OBS Studio",
                "Settings → Stream → Service: Custom",
                f"Server: {protocol.value}://{self.server_host}:{port}{'live' if protocol == StreamingProtocol.RTMP else ''}",
                "Stream Key: your-stream-name",
                "Settings → Video → Resolution: 1920x1080, FPS: 30",
                "Settings → Output → Bitrate: 4000 Kbps",
                "Add your sources and start streaming!",
            ],
            "minimal_settings": {
                "video_bitrate": 4000,
                "audio_bitrate": 160,
                "resolution": "1920x1080",
                "fps": 30,
                "encoder": "x264",
            },
        }

    def get_supported_protocols(self) -> List[Dict[str, Any]]:
        """Get list of supported streaming protocols"""

        return [
            {
                "protocol": "RTMP",
                "port": self.rtmp_port,
                "description": "Real-Time Messaging Protocol - widely supported",
                "advantages": [
                    "Universal compatibility",
                    "Low setup complexity",
                    "Stable connection",
                ],
                "disadvantages": ["Higher latency", "Less error resilience"],
            },
            {
                "protocol": "SRT",
                "port": self.srt_port,
                "description": "Secure Reliable Transport - low latency with error correction",
                "advantages": [
                    "Ultra-low latency",
                    "Error correction",
                    "Network resilience",
                ],
                "disadvantages": ["Newer protocol", "Requires SRT-enabled OBS"],
            },
        ]

    def get_quality_presets_info(self) -> Dict[str, Any]:
        """Get information about quality presets"""

        presets_info = {}
        for quality, preset in self.quality_presets.items():
            presets_info[quality.value] = {
                **preset,
                "estimated_bandwidth": preset["video_bitrate"]
                + preset["audio_bitrate"],
                "recommended_upload": (
                    preset["video_bitrate"] + preset["audio_bitrate"]
                )
                * 1.2,  # 20% overhead
            }

        return presets_info


# Global guide generator instance
obs_guide_generator = OBSSetupGuideGenerator()


def get_obs_guide_generator() -> OBSSetupGuideGenerator:
    """Get the global OBS guide generator"""
    return obs_guide_generator


def generate_obs_setup_guide(
    protocol: str,
    quality: str = "medium",
    custom_settings: Optional[Dict[str, Any]] = None,
) -> OBSSetupGuide:
    """Generate an OBS setup guide"""
    generator = get_obs_guide_generator()

    # Convert string parameters to enums
    protocol_enum = (
        StreamingProtocol.RTMP if protocol.lower() == "rtmp" else StreamingProtocol.SRT
    )
    quality_enum = StreamingQuality(quality.lower())

    return generator.generate_setup_guide(
        protocol_enum, quality_enum, custom_settings=custom_settings
    )
