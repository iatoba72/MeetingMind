"""
OBS Setup Guide API Endpoints
Provides REST API for OBS streaming setup instructions
"""

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import Dict, List, Optional, Any
import logging

from obs_setup_guide import (
    get_obs_guide_generator,
    generate_obs_setup_guide,
    StreamingProtocol,
    StreamingQuality,
    OBSVersion,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/obs-setup", tags=["OBS Setup Guide"])


class OBSSetupResponse(BaseModel):
    success: bool
    message: str
    data: Optional[Dict[str, Any]] = None


class CustomSettingsRequest(BaseModel):
    video_bitrate: Optional[int] = None
    audio_bitrate: Optional[int] = None
    video_resolution: Optional[str] = None
    video_fps: Optional[int] = None
    encoder: Optional[str] = None
    server_url: Optional[str] = None
    stream_key: Optional[str] = None


@router.get("/guide/{protocol}", response_model=OBSSetupResponse)
async def get_obs_setup_guide(
    protocol: str,
    quality: str = Query(
        "medium", description="Quality preset: low, medium, high, ultra"
    ),
    obs_version: str = Query("30.x", description="OBS version: 28.x, 29.x, 30.x"),
    custom_settings: Optional[CustomSettingsRequest] = None,
):
    """Get comprehensive OBS setup guide for a specific protocol"""
    try:
        # Validate protocol
        if protocol.lower() not in ["rtmp", "srt"]:
            raise HTTPException(
                status_code=400, detail="Protocol must be 'rtmp' or 'srt'"
            )

        # Validate quality
        if quality.lower() not in ["low", "medium", "high", "ultra"]:
            raise HTTPException(
                status_code=400,
                detail="Quality must be 'low', 'medium', 'high', or 'ultra'",
            )

        # Convert custom settings to dict if provided
        custom_dict = None
        if custom_settings:
            custom_dict = {
                k: v for k, v in custom_settings.dict().items() if v is not None
            }

        # Generate guide
        guide = generate_obs_setup_guide(protocol, quality, custom_dict)

        # Convert to serializable format
        guide_data = {
            "protocol": guide.protocol.value,
            "version": guide.version.value,
            "quality": guide.quality.value,
            "settings": {
                "protocol": guide.settings.protocol.value,
                "server_url": guide.settings.server_url,
                "stream_key": guide.settings.stream_key,
                "video_bitrate": guide.settings.video_bitrate,
                "audio_bitrate": guide.settings.audio_bitrate,
                "video_resolution": guide.settings.video_resolution,
                "video_fps": guide.settings.video_fps,
                "encoder": guide.settings.encoder,
                "rate_control": guide.settings.rate_control,
                "keyframe_interval": guide.settings.keyframe_interval,
                "audio_sample_rate": guide.settings.audio_sample_rate,
                "audio_channels": guide.settings.audio_channels,
                "advanced_settings": guide.settings.advanced_settings,
            },
            "setup_steps": guide.setup_steps,
            "troubleshooting": guide.troubleshooting,
            "performance_tips": guide.performance_tips,
            "advanced_configuration": guide.advanced_configuration,
            "scene_setup": guide.scene_setup,
            "audio_setup": guide.audio_setup,
            "plugin_recommendations": guide.plugin_recommendations,
        }

        return OBSSetupResponse(
            success=True,
            message=f"OBS setup guide generated for {protocol.upper()} protocol",
            data={"guide": guide_data},
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating OBS setup guide: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/quick-start/{protocol}", response_model=OBSSetupResponse)
async def get_quick_start_guide(protocol: str):
    """Get quick start guide for OBS setup"""
    try:
        # Validate protocol
        if protocol.lower() not in ["rtmp", "srt"]:
            raise HTTPException(
                status_code=400, detail="Protocol must be 'rtmp' or 'srt'"
            )

        generator = get_obs_guide_generator()
        protocol_enum = (
            StreamingProtocol.RTMP
            if protocol.lower() == "rtmp"
            else StreamingProtocol.SRT
        )

        quick_guide = generator.generate_quick_start_guide(protocol_enum)

        return OBSSetupResponse(
            success=True,
            message=f"Quick start guide generated for {protocol.upper()}",
            data={"quick_guide": quick_guide},
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating quick start guide: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/protocols", response_model=OBSSetupResponse)
async def get_supported_protocols():
    """Get list of supported streaming protocols"""
    try:
        generator = get_obs_guide_generator()
        protocols = generator.get_supported_protocols()

        return OBSSetupResponse(
            success=True,
            message="Supported protocols retrieved",
            data={"protocols": protocols},
        )

    except Exception as e:
        logger.error(f"Error getting supported protocols: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/quality-presets", response_model=OBSSetupResponse)
async def get_quality_presets():
    """Get information about quality presets"""
    try:
        generator = get_obs_guide_generator()
        presets = generator.get_quality_presets_info()

        return OBSSetupResponse(
            success=True,
            message="Quality presets information retrieved",
            data={"quality_presets": presets},
        )

    except Exception as e:
        logger.error(f"Error getting quality presets: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/encoders", response_model=OBSSetupResponse)
async def get_encoder_information():
    """Get information about available encoders"""
    try:
        encoder_info = {
            "x264": {
                "name": "x264 (Software)",
                "description": "CPU-based encoding with excellent quality",
                "pros": [
                    "Best quality",
                    "Universal compatibility",
                    "Highly configurable",
                ],
                "cons": ["High CPU usage", "May impact game performance"],
                "recommended_for": [
                    "High-end CPUs",
                    "Quality-focused streaming",
                    "Non-gaming content",
                ],
                "presets": [
                    "ultrafast",
                    "superfast",
                    "veryfast",
                    "faster",
                    "fast",
                    "medium",
                    "slow",
                    "slower",
                    "veryslow",
                ],
                "cpu_usage": "High",
            },
            "nvenc": {
                "name": "NVIDIA NVENC",
                "description": "Hardware encoding using NVIDIA graphics cards",
                "pros": ["Low CPU usage", "Good quality", "Stable performance"],
                "cons": ["Requires NVIDIA GPU", "Quality slightly below x264"],
                "recommended_for": [
                    "NVIDIA GPU owners",
                    "Gaming streams",
                    "CPU-intensive applications",
                ],
                "presets": ["default", "hq", "bd", "ll", "llhq", "llhp"],
                "cpu_usage": "Low",
            },
            "amd": {
                "name": "AMD AMF",
                "description": "Hardware encoding using AMD graphics cards",
                "pros": ["Low CPU usage", "Good compatibility", "Improving quality"],
                "cons": ["Requires AMD GPU", "Quality varies by generation"],
                "recommended_for": [
                    "AMD GPU owners",
                    "Gaming streams",
                    "CPU-intensive applications",
                ],
                "presets": ["speed", "balanced", "quality"],
                "cpu_usage": "Low",
            },
            "quicksync": {
                "name": "Intel QuickSync",
                "description": "Hardware encoding using Intel integrated graphics",
                "pros": [
                    "Very low CPU usage",
                    "Available on most Intel CPUs",
                    "Good efficiency",
                ],
                "cons": ["Quality varies", "May conflict with dedicated GPU"],
                "recommended_for": [
                    "Intel CPU users",
                    "Low-power systems",
                    "Multi-stream setups",
                ],
                "presets": ["speed", "balanced", "quality"],
                "cpu_usage": "Very Low",
            },
        }

        return OBSSetupResponse(
            success=True,
            message="Encoder information retrieved",
            data={"encoders": encoder_info},
        )

    except Exception as e:
        logger.error(f"Error getting encoder information: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/system-requirements", response_model=OBSSetupResponse)
async def get_system_requirements():
    """Get system requirements for different streaming qualities"""
    try:
        requirements = {
            "minimum": {
                "quality": "Low (720p30)",
                "cpu": "Intel i5-4000 series or AMD equivalent",
                "ram": "8 GB",
                "gpu": "DirectX 10.1 compatible",
                "upload_speed": "5 Mbps",
                "recommended_for": "Basic streaming, older hardware",
            },
            "recommended": {
                "quality": "Medium (1080p30)",
                "cpu": "Intel i5-8000 series or AMD Ryzen 5 2600",
                "ram": "16 GB",
                "gpu": "NVIDIA GTX 1060 or AMD RX 580",
                "upload_speed": "10 Mbps",
                "recommended_for": "Most streaming scenarios",
            },
            "high_end": {
                "quality": "High (1080p60)",
                "cpu": "Intel i7-9000 series or AMD Ryzen 7 3700X",
                "ram": "32 GB",
                "gpu": "NVIDIA RTX 2070 or AMD RX 6700 XT",
                "upload_speed": "15 Mbps",
                "recommended_for": "Professional streaming, gaming",
            },
            "enthusiast": {
                "quality": "Ultra (1440p60+)",
                "cpu": "Intel i9-10000 series or AMD Ryzen 9 5900X",
                "ram": "32+ GB",
                "gpu": "NVIDIA RTX 3080 or AMD RX 6900 XT",
                "upload_speed": "25+ Mbps",
                "recommended_for": "Professional content creation",
            },
        }

        return OBSSetupResponse(
            success=True,
            message="System requirements retrieved",
            data={"system_requirements": requirements},
        )

    except Exception as e:
        logger.error(f"Error getting system requirements: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/troubleshooting", response_model=OBSSetupResponse)
async def get_troubleshooting_guide():
    """Get comprehensive troubleshooting guide"""
    try:
        troubleshooting = {
            "performance_issues": {
                "high_cpu_usage": {
                    "symptoms": [
                        "CPU usage above 80%",
                        "Dropped frames",
                        "Encoding lag",
                    ],
                    "solutions": [
                        "Lower video resolution or frame rate",
                        "Switch to hardware encoder (NVENC/AMF/QuickSync)",
                        "Increase x264 preset speed",
                        "Close unnecessary applications",
                        "Lower game settings if streaming games",
                    ],
                },
                "dropped_frames": {
                    "symptoms": ["Network dropped frames", "Rendering lag"],
                    "solutions": [
                        "Check internet connection stability",
                        "Lower bitrate settings",
                        "Use wired ethernet connection",
                        "Change streaming server location",
                        "Check for background downloads/uploads",
                    ],
                },
                "encoding_overload": {
                    "symptoms": ["Encoding overloaded warning", "Skipped frames"],
                    "solutions": [
                        "Lower video quality settings",
                        "Use hardware encoder",
                        "Increase CPU preset speed",
                        "Reduce video filters and effects",
                    ],
                },
            },
            "connection_issues": {
                "cant_connect": {
                    "symptoms": ["Failed to connect to server", "Connection timeout"],
                    "solutions": [
                        "Verify server URL and port",
                        "Check firewall settings",
                        "Test with different network",
                        "Verify MeetingMind server is running",
                        "Check antivirus/security software",
                    ],
                },
                "frequent_disconnects": {
                    "symptoms": ["Stream keeps stopping", "Unstable connection"],
                    "solutions": [
                        "Check network stability",
                        "Lower bitrate",
                        "Increase keyframe interval",
                        "Use different DNS servers",
                        "Contact ISP if issues persist",
                    ],
                },
            },
            "audio_video_issues": {
                "no_audio": {
                    "symptoms": ["Stream has no audio", "Microphone not working"],
                    "solutions": [
                        "Check audio device selection",
                        "Verify audio sources are not muted",
                        "Set monitoring to 'Monitor and Output'",
                        "Check Windows audio permissions",
                        "Update audio drivers",
                    ],
                },
                "audio_sync": {
                    "symptoms": ["Audio out of sync with video"],
                    "solutions": [
                        "Add audio delay/offset",
                        "Match audio sample rates",
                        "Check audio buffer settings",
                        "Reduce audio filters",
                        "Use consistent frame rate",
                    ],
                },
                "poor_quality": {
                    "symptoms": ["Blurry video", "Pixelated stream", "Low quality"],
                    "solutions": [
                        "Increase bitrate",
                        "Check encoder settings",
                        "Verify resolution settings",
                        "Update graphics drivers",
                        "Use better encoder preset",
                    ],
                },
            },
        }

        return OBSSetupResponse(
            success=True,
            message="Troubleshooting guide retrieved",
            data={"troubleshooting": troubleshooting},
        )

    except Exception as e:
        logger.error(f"Error getting troubleshooting guide: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/advanced-tips", response_model=OBSSetupResponse)
async def get_advanced_tips():
    """Get advanced tips and optimization techniques"""
    try:
        advanced_tips = {
            "performance_optimization": [
                "Enable GPU scheduling in Windows (Windows 10 2004+)",
                "Set OBS to high priority in Task Manager",
                "Use Process Lasso for CPU thread management",
                "Disable Windows Game Mode if causing issues",
                "Use dedicated capture cards for multi-PC setups",
                "Configure NVENC lookahead and psycho visual tuning",
                "Use scene collections for different stream types",
            ],
            "quality_optimization": [
                "Use 2-pass encoding for recording",
                "Enable psycho visual tuning for better quality",
                "Set appropriate keyframe intervals (2 seconds max)",
                "Use CBR rate control for streaming",
                "Configure proper color space and range",
                "Use deinterlacing filters for interlaced sources",
                "Apply sharpening filters carefully",
            ],
            "audio_optimization": [
                "Use audio compressors to even out levels",
                "Apply noise gates to reduce background noise",
                "Use noise suppression filters (RNNoise)",
                "Set proper gain staging",
                "Use multiple audio tracks for flexibility",
                "Monitor audio levels during stream",
                "Use dedicated audio interfaces for better quality",
            ],
            "workflow_optimization": [
                "Create hotkeys for common actions",
                "Use scene transitions for smooth changes",
                "Set up multiple scene collections",
                "Use source groups for organization",
                "Create reusable source templates",
                "Use advanced audio properties",
                "Set up automatic recording/streaming",
            ],
            "monitoring_tips": [
                "Use multiview for scene preview",
                "Monitor encoding performance stats",
                "Set up stream preview on second monitor",
                "Use audio level meters",
                "Monitor CPU and GPU usage",
                "Check stream health indicators",
                "Use chat integration for audience feedback",
            ],
        }

        return OBSSetupResponse(
            success=True,
            message="Advanced tips retrieved",
            data={"advanced_tips": advanced_tips},
        )

    except Exception as e:
        logger.error(f"Error getting advanced tips: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/plugins", response_model=OBSSetupResponse)
async def get_plugin_recommendations():
    """Get detailed plugin recommendations"""
    try:
        generator = get_obs_guide_generator()
        base_plugins = generator._generate_plugin_recommendations()

        # Add more detailed plugin information
        detailed_plugins = {
            "essential": [
                {
                    "name": "StreamFX",
                    "description": "Advanced effects and filters including blur, shadow, and 3D transform",
                    "url": "https://github.com/Xaymar/obs-StreamFX",
                    "category": "Effects",
                    "difficulty": "Intermediate",
                    "features": [
                        "Advanced blur",
                        "3D transform",
                        "Color correction",
                        "Source mirror",
                    ],
                },
                {
                    "name": "Advanced Scene Switcher",
                    "description": "Automated scene switching based on windows, time, audio, and more",
                    "url": "https://github.com/WarmUpTill/SceneSwitcher",
                    "category": "Automation",
                    "difficulty": "Advanced",
                    "features": [
                        "Window detection",
                        "Audio triggers",
                        "Time-based switching",
                        "Hotkey automation",
                    ],
                },
            ],
            "audio": [
                {
                    "name": "Background Music",
                    "description": "Add background music with automatic ducking",
                    "url": "https://github.com/cg2121/obs-backgroundmusic",
                    "category": "Audio",
                    "difficulty": "Beginner",
                    "features": ["Music library", "Auto-ducking", "Fade controls"],
                },
                {
                    "name": "Virtual Audio Cable",
                    "description": "Route audio between applications",
                    "url": "https://vb-audio.com/Cable/",
                    "category": "Audio",
                    "difficulty": "Intermediate",
                    "features": ["Audio routing", "Multiple cables", "Low latency"],
                },
            ],
            "visual": [
                {
                    "name": "Move Transition",
                    "description": "Smooth movement animations for sources",
                    "url": "https://github.com/exeldro/obs-move-transition",
                    "category": "Transitions",
                    "difficulty": "Beginner",
                    "features": [
                        "Smooth animations",
                        "Custom paths",
                        "Easing functions",
                    ],
                },
                {
                    "name": "3D Effect",
                    "description": "Add 3D perspective effects to sources",
                    "url": "https://github.com/exeldro/obs-3d-effect",
                    "category": "Effects",
                    "difficulty": "Intermediate",
                    "features": ["3D rotation", "Perspective", "Depth effects"],
                },
            ],
            "utility": [
                {
                    "name": "Source Record",
                    "description": "Record individual sources separately",
                    "url": "https://github.com/exeldro/obs-source-record",
                    "category": "Recording",
                    "difficulty": "Beginner",
                    "features": [
                        "Individual recording",
                        "Custom formats",
                        "Automatic start/stop",
                    ],
                },
                {
                    "name": "Replay Source",
                    "description": "Add instant replay functionality",
                    "url": "https://github.com/exeldro/obs-replay-source",
                    "category": "Recording",
                    "difficulty": "Intermediate",
                    "features": [
                        "Instant replay",
                        "Configurable length",
                        "Hotkey control",
                    ],
                },
            ],
        }

        return OBSSetupResponse(
            success=True,
            message="Plugin recommendations retrieved",
            data={"plugins": detailed_plugins},
        )

    except Exception as e:
        logger.error(f"Error getting plugin recommendations: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/bandwidth-calculator", response_model=OBSSetupResponse)
async def calculate_bandwidth_requirements(
    video_bitrate: int = Query(..., description="Video bitrate in kbps"),
    audio_bitrate: int = Query(..., description="Audio bitrate in kbps"),
    overhead_percent: float = Query(20.0, description="Network overhead percentage"),
):
    """Calculate bandwidth requirements for streaming"""
    try:
        total_bitrate = video_bitrate + audio_bitrate
        overhead = total_bitrate * (overhead_percent / 100)
        required_upload = total_bitrate + overhead

        # Convert to different units
        mbps = required_upload / 1000

        # Estimate data usage
        hourly_mb = (required_upload * 3600) / 8 / 1024  # Convert to MB per hour
        hourly_gb = hourly_mb / 1024

        calculation = {
            "input": {
                "video_bitrate_kbps": video_bitrate,
                "audio_bitrate_kbps": audio_bitrate,
                "overhead_percent": overhead_percent,
            },
            "results": {
                "total_stream_bitrate_kbps": total_bitrate,
                "overhead_kbps": overhead,
                "required_upload_speed_kbps": required_upload,
                "required_upload_speed_mbps": round(mbps, 2),
                "recommended_upload_speed_mbps": round(mbps * 1.5, 2),  # 50% buffer
                "data_usage": {
                    "per_hour_mb": round(hourly_mb, 1),
                    "per_hour_gb": round(hourly_gb, 2),
                    "per_day_gb": round(hourly_gb * 24, 1),
                    "per_month_gb": round(hourly_gb * 24 * 30, 1),
                },
            },
            "recommendations": [],
        }

        # Add recommendations based on requirements
        if mbps < 3:
            calculation["recommendations"].append(
                "Good for most home internet connections"
            )
        elif mbps < 6:
            calculation["recommendations"].append(
                "Requires stable broadband connection"
            )
        elif mbps < 10:
            calculation["recommendations"].append(
                "Requires high-speed internet, consider fiber"
            )
        else:
            calculation["recommendations"].append(
                "Requires very high-speed internet connection"
            )

        if hourly_gb > 1:
            calculation["recommendations"].append(
                "High data usage - monitor if on limited plan"
            )

        return OBSSetupResponse(
            success=True,
            message="Bandwidth requirements calculated",
            data={"bandwidth_calculation": calculation},
        )

    except Exception as e:
        logger.error(f"Error calculating bandwidth: {e}")
        raise HTTPException(status_code=500, detail=str(e))
