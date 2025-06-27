"""
OBS Configuration Generator for MeetingMind
Generates optimal OBS settings based on system capabilities and use case
"""

import json
import platform
import psutil
import subprocess
import os
from typing import Dict, List, Any, Optional, Tuple
from dataclasses import dataclass, asdict
from enum import Enum
import tempfile
import logging

logger = logging.getLogger(__name__)

class MeetingType(Enum):
    """Different types of meetings requiring different OBS configurations"""
    PRESENTATION = "presentation"
    DISCUSSION = "discussion"
    WEBINAR = "webinar"
    WORKSHOP = "workshop"
    INTERVIEW = "interview"
    TRAINING = "training"

class StreamingPlatform(Enum):
    """Supported streaming platforms"""
    CUSTOM_RTMP = "custom_rtmp"
    YOUTUBE = "youtube"
    TWITCH = "twitch"
    FACEBOOK = "facebook"
    LINKEDIN = "linkedin"
    MEETINGMIND = "meetingmind"

class QualityPreset(Enum):
    """Quality presets for different use cases"""
    ULTRA_LOW_LATENCY = "ultra_low_latency"  # <500ms, lower quality
    LOW_LATENCY = "low_latency"              # <2s, balanced
    HIGH_QUALITY = "high_quality"            # >2s, best quality
    ARCHIVAL = "archival"                    # Recording only, highest quality

@dataclass
class SystemSpecs:
    """System specifications for optimization"""
    cpu_cores: int
    cpu_frequency: float  # GHz
    ram_gb: float
    gpu_name: str
    gpu_memory_gb: float
    has_hardware_encoder: bool
    encoder_type: str  # nvidia, amd, intel, software
    os_type: str
    network_upload_mbps: float
    disk_space_gb: float
    webcam_resolution: Tuple[int, int]
    microphone_quality: str

@dataclass
class OBSVideoSettings:
    """OBS video settings configuration"""
    base_canvas_width: int
    base_canvas_height: int
    output_width: int
    output_height: int
    fps_common: int
    fps_integer: int
    fps_numerator: int
    fps_denominator: int
    downscale_filter: str
    
@dataclass
class OBSAudioSettings:
    """OBS audio settings configuration"""
    sample_rate: int
    channels: str
    meter_decay_rate: float
    peak_meter_type: int
    
@dataclass
class OBSStreamSettings:
    """OBS streaming settings configuration"""
    service: str
    server: str
    key: str
    encoder: str
    bitrate: int
    keyframe_interval: int
    preset: str
    profile: str
    tune: str
    x264_opts: str
    
@dataclass
class OBSRecordSettings:
    """OBS recording settings configuration"""
    type: str
    format: str
    encoder: str
    path: str
    quality: str
    bitrate: int
    crf: int
    
@dataclass
class OBSSceneCollection:
    """OBS scene collection configuration"""
    name: str
    scenes: List[Dict[str, Any]]
    sources: List[Dict[str, Any]]
    transitions: List[Dict[str, Any]]
    filters: List[Dict[str, Any]]

class SystemAnalyzer:
    """Analyzes system capabilities for OBS optimization"""
    
    @staticmethod
    def analyze_system() -> SystemSpecs:
        """Analyze current system specifications"""
        
        # CPU information
        cpu_count = psutil.cpu_count(logical=False)
        cpu_freq = psutil.cpu_freq()
        cpu_frequency = cpu_freq.max / 1000 if cpu_freq else 2.4  # GHz
        
        # Memory information
        memory = psutil.virtual_memory()
        ram_gb = memory.total / (1024**3)
        
        # GPU information
        gpu_name, gpu_memory_gb, has_hw_encoder, encoder_type = SystemAnalyzer._detect_gpu()
        
        # OS information
        os_type = platform.system().lower()
        
        # Disk space
        disk_usage = psutil.disk_usage('/')
        disk_space_gb = disk_usage.free / (1024**3)
        
        # Webcam detection
        webcam_resolution = SystemAnalyzer._detect_webcam_resolution()
        
        # Microphone quality (simplified)
        microphone_quality = "standard"
        
        # Network speed (placeholder - would need actual speed test)
        network_upload_mbps = 10.0  # Default assumption
        
        return SystemSpecs(
            cpu_cores=cpu_count,
            cpu_frequency=cpu_frequency,
            ram_gb=ram_gb,
            gpu_name=gpu_name,
            gpu_memory_gb=gpu_memory_gb,
            has_hardware_encoder=has_hw_encoder,
            encoder_type=encoder_type,
            os_type=os_type,
            network_upload_mbps=network_upload_mbps,
            disk_space_gb=disk_space_gb,
            webcam_resolution=webcam_resolution,
            microphone_quality=microphone_quality
        )
    
    @staticmethod
    def _detect_gpu() -> Tuple[str, float, bool, str]:
        """Detect GPU information and hardware encoding support"""
        try:
            # Try to get GPU info via nvidia-ml-py or other methods
            if platform.system() == "Windows":
                # Windows GPU detection
                try:
                    import wmi
                    c = wmi.WMI()
                    for gpu in c.Win32_VideoController():
                        if gpu.Name:
                            gpu_name = gpu.Name
                            # Estimate memory (simplified)
                            gpu_memory_gb = 4.0  # Default assumption
                            
                            # Check for hardware encoders
                            if "nvidia" in gpu_name.lower():
                                return gpu_name, gpu_memory_gb, True, "nvidia"
                            elif "amd" in gpu_name.lower() or "radeon" in gpu_name.lower():
                                return gpu_name, gpu_memory_gb, True, "amd"
                            elif "intel" in gpu_name.lower():
                                return gpu_name, gpu_memory_gb, True, "intel"
                except ImportError:
                    pass
            
            elif platform.system() == "Linux":
                # Linux GPU detection
                try:
                    # Try nvidia-smi
                    result = subprocess.run(['nvidia-smi', '--query-gpu=name,memory.total', '--format=csv,noheader,nounits'], 
                                          capture_output=True, text=True, timeout=5)
                    if result.returncode == 0:
                        lines = result.stdout.strip().split('\n')
                        if lines:
                            parts = lines[0].split(', ')
                            gpu_name = parts[0]
                            gpu_memory_gb = float(parts[1]) / 1024
                            return gpu_name, gpu_memory_gb, True, "nvidia"
                except (subprocess.SubprocessError, FileNotFoundError):
                    pass
                
                # Try lspci for other GPUs
                try:
                    result = subprocess.run(['lspci'], capture_output=True, text=True, timeout=5)
                    if result.returncode == 0:
                        for line in result.stdout.split('\n'):
                            if 'VGA' in line or 'Display' in line:
                                if 'AMD' in line or 'ATI' in line:
                                    return line.split(': ')[-1], 4.0, True, "amd"
                                elif 'Intel' in line:
                                    return line.split(': ')[-1], 1.0, True, "intel"
                except subprocess.SubprocessError:
                    pass
            
            # Default fallback
            return "Integrated Graphics", 1.0, False, "software"
            
        except Exception as e:
            logger.warning(f"GPU detection failed: {e}")
            return "Unknown GPU", 2.0, False, "software"
    
    @staticmethod
    def _detect_webcam_resolution() -> Tuple[int, int]:
        """Detect maximum webcam resolution"""
        try:
            import cv2
            
            # Try to open default camera
            cap = cv2.VideoCapture(0)
            if cap.isOpened():
                # Try common resolutions to find maximum supported
                resolutions = [(1920, 1080), (1280, 720), (960, 540), (640, 480)]
                
                for width, height in resolutions:
                    cap.set(cv2.CAP_PROP_FRAME_WIDTH, width)
                    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, height)
                    
                    actual_width = cap.get(cv2.CAP_PROP_FRAME_WIDTH)
                    actual_height = cap.get(cv2.CAP_PROP_FRAME_HEIGHT)
                    
                    if actual_width == width and actual_height == height:
                        cap.release()
                        return (int(width), int(height))
                
                cap.release()
            
        except ImportError:
            logger.warning("OpenCV not available for webcam detection")
        except Exception as e:
            logger.warning(f"Webcam detection failed: {e}")
        
        # Default fallback
        return (1280, 720)

class OBSConfigGenerator:
    """Generates optimized OBS configurations"""
    
    def __init__(self, system_specs: SystemSpecs):
        self.system_specs = system_specs
        
    def generate_config(
        self,
        meeting_type: MeetingType,
        quality_preset: QualityPreset,
        streaming_platform: StreamingPlatform,
        custom_settings: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Generate complete OBS configuration"""
        
        # Generate individual setting sections
        video_settings = self._generate_video_settings(meeting_type, quality_preset)
        audio_settings = self._generate_audio_settings(meeting_type)
        stream_settings = self._generate_stream_settings(streaming_platform, quality_preset)
        record_settings = self._generate_record_settings(quality_preset)
        
        # Generate scene collection
        scene_collection = self._generate_scene_collection(meeting_type)
        
        # Combine all settings
        config = {
            "version": "1.0",
            "generator": "MeetingMind OBS Config Generator",
            "meeting_type": meeting_type.value,
            "quality_preset": quality_preset.value,
            "streaming_platform": streaming_platform.value,
            "system_specs": asdict(self.system_specs),
            "video": asdict(video_settings),
            "audio": asdict(audio_settings),
            "stream": asdict(stream_settings),
            "record": asdict(record_settings),
            "scene_collection": asdict(scene_collection),
            "advanced_settings": self._generate_advanced_settings(),
            "hotkeys": self._generate_hotkeys(meeting_type),
            "filters": self._generate_filters(),
            "recommendations": self._generate_recommendations()
        }
        
        # Apply custom overrides
        if custom_settings:
            config.update(custom_settings)
        
        return config
    
    def _generate_video_settings(self, meeting_type: MeetingType, quality_preset: QualityPreset) -> OBSVideoSettings:
        """Generate optimal video settings"""
        
        # Base canvas size (usually matches monitor resolution)
        base_width, base_height = 1920, 1080  # Default to 1080p
        
        # Output resolution based on quality preset and system capabilities
        if quality_preset == QualityPreset.ULTRA_LOW_LATENCY:
            output_width, output_height = 1280, 720
        elif quality_preset == QualityPreset.LOW_LATENCY:
            if self.system_specs.cpu_cores >= 6 and self.system_specs.has_hardware_encoder:
                output_width, output_height = 1920, 1080
            else:
                output_width, output_height = 1280, 720
        elif quality_preset == QualityPreset.HIGH_QUALITY:
            output_width, output_height = 1920, 1080
        else:  # ARCHIVAL
            output_width, output_height = 1920, 1080
        
        # FPS based on meeting type and quality
        if meeting_type in [MeetingType.PRESENTATION, MeetingType.WEBINAR]:
            fps = 24 if quality_preset == QualityPreset.ULTRA_LOW_LATENCY else 30
        else:
            fps = 30
        
        # Downscale filter
        if self.system_specs.has_hardware_encoder:
            downscale_filter = "Bicubic"
        else:
            downscale_filter = "Bilinear"
        
        return OBSVideoSettings(
            base_canvas_width=base_width,
            base_canvas_height=base_height,
            output_width=output_width,
            output_height=output_height,
            fps_common=fps,
            fps_integer=fps,
            fps_numerator=fps,
            fps_denominator=1,
            downscale_filter=downscale_filter
        )
    
    def _generate_audio_settings(self, meeting_type: MeetingType) -> OBSAudioSettings:
        """Generate optimal audio settings"""
        
        # Sample rate - higher for music/training content
        if meeting_type in [MeetingType.TRAINING, MeetingType.WORKSHOP]:
            sample_rate = 48000
        else:
            sample_rate = 44100
        
        return OBSAudioSettings(
            sample_rate=sample_rate,
            channels="Stereo",
            meter_decay_rate=23.53,
            peak_meter_type=0
        )
    
    def _generate_stream_settings(self, platform: StreamingPlatform, quality_preset: QualityPreset) -> OBSStreamSettings:
        """Generate streaming settings"""
        
        # Choose encoder based on hardware
        if self.system_specs.has_hardware_encoder:
            if self.system_specs.encoder_type == "nvidia":
                encoder = "ffmpeg_nvenc"
                preset = "quality" if quality_preset == QualityPreset.HIGH_QUALITY else "performance"
            elif self.system_specs.encoder_type == "amd":
                encoder = "amd_amf_h264"
                preset = "quality" if quality_preset == QualityPreset.HIGH_QUALITY else "speed"
            elif self.system_specs.encoder_type == "intel":
                encoder = "obs_qsv11"
                preset = "quality" if quality_preset == QualityPreset.HIGH_QUALITY else "speed"
            else:
                encoder = "obs_x264"
                preset = "medium"
        else:
            encoder = "obs_x264"
            preset = "veryfast" if quality_preset == QualityPreset.ULTRA_LOW_LATENCY else "medium"
        
        # Bitrate based on quality preset and upload speed
        available_bitrate = int(self.system_specs.network_upload_mbps * 1000 * 0.8)  # 80% of available
        
        if quality_preset == QualityPreset.ULTRA_LOW_LATENCY:
            bitrate = min(available_bitrate, 2500)
        elif quality_preset == QualityPreset.LOW_LATENCY:
            bitrate = min(available_bitrate, 4500)
        elif quality_preset == QualityPreset.HIGH_QUALITY:
            bitrate = min(available_bitrate, 8000)
        else:  # ARCHIVAL
            bitrate = min(available_bitrate, 12000)
        
        # Platform-specific settings
        service_config = self._get_platform_config(platform)
        
        return OBSStreamSettings(
            service=service_config["service"],
            server=service_config["server"],
            key="",  # To be filled by user
            encoder=encoder,
            bitrate=bitrate,
            keyframe_interval=2,
            preset=preset,
            profile="main",
            tune="zerolatency" if quality_preset == QualityPreset.ULTRA_LOW_LATENCY else "",
            x264_opts="bframes=0" if quality_preset == QualityPreset.ULTRA_LOW_LATENCY else ""
        )
    
    def _generate_record_settings(self, quality_preset: QualityPreset) -> OBSRecordSettings:
        """Generate recording settings"""
        
        # Choose format and quality
        if quality_preset == QualityPreset.ARCHIVAL:
            format_type = "mp4"
            encoder = "obs_x264"
            quality = "Indistinguishable"
            crf = 15
            bitrate = 0  # Use CRF
        else:
            format_type = "mp4"
            encoder = self._get_best_encoder()
            quality = "High"
            crf = 20
            bitrate = 8000
        
        # Recording path
        if self.system_specs.os_type == "windows":
            path = os.path.expanduser("~/Documents/OBS Recordings")
        else:
            path = os.path.expanduser("~/Videos/OBS Recordings")
        
        return OBSRecordSettings(
            type="FFmpeg",
            format=format_type,
            encoder=encoder,
            path=path,
            quality=quality,
            bitrate=bitrate,
            crf=crf
        )
    
    def _generate_scene_collection(self, meeting_type: MeetingType) -> OBSSceneCollection:
        """Generate scene collection for meeting type"""
        
        collection_name = f"MeetingMind - {meeting_type.value.title()}"
        
        # Common sources for all meeting types
        common_sources = [
            {
                "name": "Webcam",
                "type": "dshow_input",
                "settings": {
                    "video_device_id": "default",
                    "resolution": f"{self.system_specs.webcam_resolution[0]}x{self.system_specs.webcam_resolution[1]}",
                    "fps": 30,
                    "buffering": False
                }
            },
            {
                "name": "Microphone",
                "type": "wasapi_input_capture",
                "settings": {
                    "device_id": "default"
                }
            },
            {
                "name": "Desktop Audio",
                "type": "wasapi_output_capture",
                "settings": {
                    "device_id": "default"
                }
            },
            {
                "name": "Screen Capture",
                "type": "monitor_capture",
                "settings": {
                    "monitor": 0,
                    "capture_cursor": True
                }
            }
        ]
        
        # Meeting-specific scenes
        scenes = []
        
        if meeting_type == MeetingType.PRESENTATION:
            scenes = [
                {
                    "name": "Pre-Meeting",
                    "sources": ["Webcam", "Microphone", "Welcome Slide"]
                },
                {
                    "name": "Presentation",
                    "sources": ["Screen Capture", "Webcam (Small)", "Microphone", "Desktop Audio"]
                },
                {
                    "name": "Q&A",
                    "sources": ["Webcam", "Screen Capture (Small)", "Microphone", "Desktop Audio"]
                },
                {
                    "name": "Break",
                    "sources": ["Break Slide", "Background Music"]
                }
            ]
        elif meeting_type == MeetingType.DISCUSSION:
            scenes = [
                {
                    "name": "Welcome",
                    "sources": ["Webcam", "Microphone", "Welcome Overlay"]
                },
                {
                    "name": "Discussion",
                    "sources": ["Webcam", "Microphone", "Desktop Audio", "Shared Screen"]
                },
                {
                    "name": "Wrap-up",
                    "sources": ["Webcam", "Microphone", "Summary Slide"]
                }
            ]
        elif meeting_type == MeetingType.WEBINAR:
            scenes = [
                {
                    "name": "Starting Soon",
                    "sources": ["Starting Soon Slide", "Background Music"]
                },
                {
                    "name": "Introduction",
                    "sources": ["Webcam", "Microphone", "Title Slide"]
                },
                {
                    "name": "Content",
                    "sources": ["Screen Capture", "Webcam (Corner)", "Microphone", "Desktop Audio"]
                },
                {
                    "name": "Q&A Session",
                    "sources": ["Webcam", "Q&A Overlay", "Microphone"]
                },
                {
                    "name": "Thank You",
                    "sources": ["Thank You Slide", "Webcam", "Contact Info"]
                }
            ]
        
        # Common transitions
        transitions = [
            {"name": "Fade", "type": "fade_transition", "duration": 300},
            {"name": "Cut", "type": "cut_transition", "duration": 0},
            {"name": "Slide", "type": "slide_transition", "duration": 500}
        ]
        
        # Common filters
        filters = [
            {
                "name": "Noise Suppression",
                "type": "noise_suppress_filter",
                "source": "Microphone",
                "settings": {"method": "speex", "suppress_level": -30}
            },
            {
                "name": "Gain",
                "type": "gain_filter",
                "source": "Microphone",
                "settings": {"db": 5.0}
            },
            {
                "name": "Compressor",
                "type": "compressor_filter",
                "source": "Microphone",
                "settings": {"ratio": 4.0, "threshold": -18.0, "attack_time": 6, "release_time": 60}
            }
        ]
        
        return OBSSceneCollection(
            name=collection_name,
            scenes=scenes,
            sources=common_sources,
            transitions=transitions,
            filters=filters
        )
    
    def _generate_advanced_settings(self) -> Dict[str, Any]:
        """Generate advanced OBS settings"""
        
        settings = {
            "General": {
                "EnableAutoRemux": True,
                "KeepRecordingWhenStreamStops": True,
                "RecordWhenStreaming": False,
                "ReplayBufferWhileStreaming": False
            },
            "Stream1": {
                "Encoder": self._get_best_encoder(),
                "RescaleOutput": True,
                "RescaleFilter": "bicubic",
                "RescaleRes": "1920x1080"
            },
            "Recording": {
                "RecRB": False,
                "RecRBTime": 20,
                "RecFormat": "mp4",
                "RecTracks": 1
            },
            "Audio": {
                "SampleRate": 44100,
                "ChannelSetup": "Stereo",
                "MeterDecayRate": 23.53,
                "PeakMeterType": 0
            },
            "Video": {
                "BaseCX": 1920,
                "BaseCY": 1080,
                "OutputCX": 1920,
                "OutputCY": 1080,
                "FPSType": 0,
                "FPSCommon": 30,
                "ColorFormat": "NV12",
                "ColorSpace": "601",
                "ColorRange": "Partial"
            }
        }
        
        # Optimize based on system specs
        if self.system_specs.cpu_cores <= 4:
            settings["Video"]["FPSCommon"] = 24
            settings["Stream1"]["RescaleRes"] = "1280x720"
        
        if self.system_specs.ram_gb < 8:
            settings["General"]["ReplayBufferWhileStreaming"] = False
        
        return settings
    
    def _generate_hotkeys(self, meeting_type: MeetingType) -> Dict[str, str]:
        """Generate useful hotkeys for meeting control"""
        
        hotkeys = {
            "Start Streaming": "F1",
            "Stop Streaming": "F2",
            "Start Recording": "F3",
            "Stop Recording": "F4",
            "Mute Microphone": "F5",
            "Push-to-Talk": "Space",
            "Scene 1": "1",
            "Scene 2": "2",
            "Scene 3": "3",
            "Scene 4": "4",
            "Toggle Source Visibility": "V"
        }
        
        if meeting_type == MeetingType.PRESENTATION:
            hotkeys.update({
                "Presentation Scene": "P",
                "Q&A Scene": "Q",
                "Break Scene": "B"
            })
        
        return hotkeys
    
    def _generate_filters(self) -> List[Dict[str, Any]]:
        """Generate recommended filters"""
        
        return [
            {
                "name": "Noise Suppression",
                "type": "noise_suppress_filter",
                "description": "Reduces background noise from microphone",
                "recommended_for": ["Microphone"],
                "settings": {
                    "method": "speex",
                    "suppress_level": -30
                }
            },
            {
                "name": "Gain",
                "type": "gain_filter",
                "description": "Adjusts audio volume",
                "recommended_for": ["Microphone"],
                "settings": {
                    "db": 5.0
                }
            },
            {
                "name": "Compressor",
                "type": "compressor_filter",
                "description": "Evens out audio levels",
                "recommended_for": ["Microphone"],
                "settings": {
                    "ratio": 4.0,
                    "threshold": -18.0,
                    "attack_time": 6,
                    "release_time": 60
                }
            },
            {
                "name": "Color Correction",
                "type": "color_filter",
                "description": "Improves webcam video quality",
                "recommended_for": ["Webcam"],
                "settings": {
                    "brightness": 0.1,
                    "contrast": 0.1,
                    "saturation": 0.05
                }
            }
        ]
    
    def _generate_recommendations(self) -> List[str]:
        """Generate optimization recommendations"""
        
        recommendations = []
        
        # CPU-based recommendations
        if self.system_specs.cpu_cores <= 4:
            recommendations.append("Consider upgrading to a CPU with more cores for better streaming performance")
            recommendations.append("Use hardware encoding if available to reduce CPU load")
        
        # RAM recommendations
        if self.system_specs.ram_gb < 8:
            recommendations.append("Upgrade to at least 8GB RAM for optimal OBS performance")
        
        # GPU recommendations
        if not self.system_specs.has_hardware_encoder:
            recommendations.append("Consider a GPU with hardware encoding (NVIDIA RTX, AMD VCE, or Intel QSV)")
        
        # Network recommendations
        if self.system_specs.network_upload_mbps < 5:
            recommendations.append("Upgrade internet connection for higher quality streaming")
        
        # Storage recommendations
        if self.system_specs.disk_space_gb < 50:
            recommendations.append("Free up disk space or add storage for recordings")
        
        # General recommendations
        recommendations.extend([
            "Close unnecessary programs while streaming to free up resources",
            "Use wired ethernet connection instead of WiFi for stable streaming",
            "Test stream settings before important meetings",
            "Set up scene hotkeys for quick switching during meetings",
            "Use push-to-talk to avoid background noise transmission"
        ])
        
        return recommendations
    
    def _get_platform_config(self, platform: StreamingPlatform) -> Dict[str, str]:
        """Get platform-specific configuration"""
        
        configs = {
            StreamingPlatform.MEETINGMIND: {
                "service": "Custom",
                "server": "rtmp://localhost:1935/live"
            },
            StreamingPlatform.YOUTUBE: {
                "service": "YouTube - RTMPS",
                "server": "rtmps://a.rtmp.youtube.com/live2"
            },
            StreamingPlatform.TWITCH: {
                "service": "Twitch",
                "server": "rtmp://live.twitch.tv/app"
            },
            StreamingPlatform.FACEBOOK: {
                "service": "Facebook Live",
                "server": "rtmps://live-api-s.facebook.com:443/rtmp"
            },
            StreamingPlatform.LINKEDIN: {
                "service": "Custom",
                "server": "rtmps://1-faa-lax.livecast.linkedin.com:443/livestreaming"
            },
            StreamingPlatform.CUSTOM_RTMP: {
                "service": "Custom",
                "server": "rtmp://your-server.com/live"
            }
        }
        
        return configs.get(platform, configs[StreamingPlatform.CUSTOM_RTMP])
    
    def _get_best_encoder(self) -> str:
        """Get the best available encoder for this system"""
        
        if self.system_specs.has_hardware_encoder:
            if self.system_specs.encoder_type == "nvidia":
                return "ffmpeg_nvenc"
            elif self.system_specs.encoder_type == "amd":
                return "amd_amf_h264"
            elif self.system_specs.encoder_type == "intel":
                return "obs_qsv11"
        
        return "obs_x264"
    
    def export_to_obs_profile(self, config: Dict[str, Any], profile_name: str) -> str:
        """Export configuration as OBS profile files"""
        
        # Create temporary directory for profile files
        temp_dir = tempfile.mkdtemp(prefix=f"obs_profile_{profile_name}_")
        
        try:
            # Generate basic.ini
            basic_ini = self._generate_basic_ini(config)
            with open(os.path.join(temp_dir, "basic.ini"), 'w') as f:
                f.write(basic_ini)
            
            # Generate service.json
            service_json = self._generate_service_json(config)
            with open(os.path.join(temp_dir, "service.json"), 'w') as f:
                f.write(service_json)
            
            # Generate scenes.json
            scenes_json = self._generate_scenes_json(config)
            with open(os.path.join(temp_dir, "scenes.json"), 'w') as f:
                f.write(scenes_json)
            
            return temp_dir
            
        except Exception as e:
            logger.error(f"Failed to export OBS profile: {e}")
            raise
    
    def _generate_basic_ini(self, config: Dict[str, Any]) -> str:
        """Generate basic.ini content"""
        
        video = config["video"]
        audio = config["audio"]
        stream = config["stream"]
        
        ini_content = f"""[General]
Name={config.get('profile_name', 'MeetingMind Profile')}

[Video]
BaseCX={video['base_canvas_width']}
BaseCY={video['base_canvas_height']}
OutputCX={video['output_width']}
OutputCY={video['output_height']}
FPSCommon={video['fps_common']}
FPSType=0
ScaleType={video['downscale_filter']}

[Audio]
SampleRate={audio['sample_rate']}
ChannelSetup={audio['channels']}

[Stream1]
Encoder={stream['encoder']}
Bitrate={stream['bitrate']}
Preset={stream['preset']}
Profile={stream['profile']}
Tune={stream['tune']}
x264opts={stream['x264_opts']}

[Recording]
Format={config['record']['format']}
Encoder={config['record']['encoder']}
Path={config['record']['path']}
"""
        
        return ini_content
    
    def _generate_service_json(self, config: Dict[str, Any]) -> str:
        """Generate service.json content"""
        
        stream = config["stream"]
        
        service_data = {
            "service": stream["service"],
            "settings": {
                "server": stream["server"],
                "key": stream["key"]
            }
        }
        
        return json.dumps(service_data, indent=2)
    
    def _generate_scenes_json(self, config: Dict[str, Any]) -> str:
        """Generate scenes.json content"""
        
        scenes_data = {
            "name": config["scene_collection"]["name"],
            "scenes": config["scene_collection"]["scenes"],
            "sources": config["scene_collection"]["sources"],
            "transitions": config["scene_collection"]["transitions"]
        }
        
        return json.dumps(scenes_data, indent=2)

# Factory function for easy use
def create_obs_config(
    meeting_type: MeetingType,
    quality_preset: QualityPreset,
    streaming_platform: StreamingPlatform,
    custom_settings: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """Create optimized OBS configuration"""
    
    # Analyze system
    system_specs = SystemAnalyzer.analyze_system()
    
    # Generate configuration
    generator = OBSConfigGenerator(system_specs)
    config = generator.generate_config(
        meeting_type, quality_preset, streaming_platform, custom_settings
    )
    
    return config