"""
Stream-Specific Voice Activity Detection (VAD)
Optimized VAD for network audio streams with quality adaptation
"""

import asyncio
import logging
import numpy as np
import torch
import webrtcvad
import collections
from typing import Dict, List, Optional, Tuple, Any, AsyncGenerator
from dataclasses import dataclass, asdict
from datetime import datetime, timedelta
import threading
import queue
import time

try:
    import torch
    from silero_vad import load_silero_vad, get_speech_timestamps
    SILERO_AVAILABLE = True
except ImportError:
    SILERO_AVAILABLE = False
    logging.warning("Silero VAD not available - falling back to WebRTC VAD only")

logger = logging.getLogger(__name__)

@dataclass
class VADResult:
    """Voice Activity Detection result"""
    is_speech: bool
    confidence: float
    start_time: float
    end_time: float
    audio_quality: float
    stream_id: str
    method: str  # "silero", "webrtc", "hybrid"

@dataclass
class StreamVADConfig:
    """Configuration for stream VAD"""
    vad_method: str = "hybrid"  # "silero", "webrtc", "hybrid"
    aggressiveness: int = 2  # WebRTC VAD aggressiveness (0-3)
    chunk_duration_ms: int = 30  # Chunk duration in milliseconds
    padding_duration_ms: int = 300  # Padding around speech segments
    min_speech_duration_ms: int = 250  # Minimum speech segment duration
    min_silence_duration_ms: int = 100  # Minimum silence between segments
    quality_threshold: float = 0.5  # Minimum audio quality for reliable VAD
    
    # Network-specific settings
    buffer_size_ms: int = 1000  # Buffer size for network streams
    resync_threshold_ms: int = 500  # Threshold for stream resync
    adaptive_quality: bool = True  # Adapt VAD based on audio quality
    multi_stream_mode: bool = False  # Enable multi-stream processing

@dataclass
class AudioQualityMetrics:
    """Audio quality metrics affecting VAD accuracy"""
    snr_db: float  # Signal-to-noise ratio
    thd_percent: float  # Total harmonic distortion
    packet_loss_percent: float  # Network packet loss
    jitter_ms: float  # Network jitter
    bitrate_kbps: float  # Audio bitrate
    sample_rate: int  # Sample rate
    overall_quality: float  # Combined quality score (0-1)

class NetworkAudioBuffer:
    """Buffer management for network audio streams"""
    
    def __init__(self, buffer_size_ms: int = 1000, sample_rate: int = 16000):
        self.buffer_size_ms = buffer_size_ms
        self.sample_rate = sample_rate
        self.buffer_size_samples = int(sample_rate * buffer_size_ms / 1000)
        
        self.buffer = collections.deque(maxlen=self.buffer_size_samples)
        self.timestamps = collections.deque(maxlen=self.buffer_size_samples)
        self.quality_buffer = collections.deque(maxlen=100)  # Quality history
        
        self.last_timestamp = 0
        self.expected_interval = 1.0 / sample_rate
        self.gap_threshold = self.expected_interval * 2  # 2x expected interval
        
        self._lock = threading.Lock()
        
    def add_audio_chunk(self, audio_data: np.ndarray, timestamp: float, 
                       quality_metrics: Optional[AudioQualityMetrics] = None):
        """Add audio chunk to buffer with timestamp and quality info"""
        with self._lock:
            # Detect gaps in audio stream
            if self.last_timestamp > 0:
                gap = timestamp - self.last_timestamp
                if gap > self.gap_threshold:
                    logger.warning(f"Audio gap detected: {gap*1000:.1f}ms")
                    # Fill gap with silence
                    gap_samples = int(gap * self.sample_rate)
                    silence = np.zeros(min(gap_samples, self.buffer_size_samples // 4))
                    self._add_samples(silence, self.last_timestamp + self.expected_interval)
            
            self._add_samples(audio_data, timestamp)
            
            if quality_metrics:
                self.quality_buffer.append(quality_metrics.overall_quality)
            
            self.last_timestamp = timestamp
    
    def _add_samples(self, samples: np.ndarray, start_timestamp: float):
        """Add samples to buffer with timestamps"""
        for i, sample in enumerate(samples):
            self.buffer.append(sample)
            sample_timestamp = start_timestamp + (i * self.expected_interval)
            self.timestamps.append(sample_timestamp)
    
    def get_chunk(self, duration_ms: int) -> Tuple[np.ndarray, List[float]]:
        """Get audio chunk of specified duration"""
        with self._lock:
            chunk_samples = int(self.sample_rate * duration_ms / 1000)
            
            if len(self.buffer) < chunk_samples:
                return np.array([]), []
            
            # Get samples and timestamps
            audio_chunk = np.array(list(self.buffer)[-chunk_samples:])
            chunk_timestamps = list(self.timestamps)[-chunk_samples:]
            
            return audio_chunk, chunk_timestamps
    
    def get_average_quality(self, window_size: int = 50) -> float:
        """Get average audio quality over recent samples"""
        with self._lock:
            if not self.quality_buffer:
                return 1.0
            
            recent_quality = list(self.quality_buffer)[-window_size:]
            return sum(recent_quality) / len(recent_quality)
    
    def clear_old_data(self, keep_duration_ms: int):
        """Clear audio data older than specified duration"""
        with self._lock:
            keep_samples = int(self.sample_rate * keep_duration_ms / 1000)
            
            while len(self.buffer) > keep_samples:
                self.buffer.popleft()
                self.timestamps.popleft()

class StreamVAD:
    """
    Stream-Aware Voice Activity Detection
    
    Features:
    - Multiple VAD algorithms (Silero, WebRTC, Hybrid)
    - Network stream optimization
    - Audio quality adaptation
    - Buffer management for network streams
    - Resync capabilities for dropped packets
    - Multi-stream support
    """
    
    def __init__(self, config: StreamVADConfig = None, sample_rate: int = 16000):
        self.config = config or StreamVADConfig()
        self.sample_rate = sample_rate
        
        # Initialize VAD models
        self.webrtc_vad = webrtcvad.Vad(self.config.aggressiveness)
        
        self.silero_model = None
        if SILERO_AVAILABLE and self.config.vad_method in ["silero", "hybrid"]:
            try:
                self.silero_model = load_silero_vad()
                logger.info("Silero VAD model loaded successfully")
            except Exception as e:
                logger.error(f"Failed to load Silero VAD: {e}")
                SILERO_AVAILABLE = False
        
        # Stream buffers - one per stream
        self.stream_buffers: Dict[str, NetworkAudioBuffer] = {}
        
        # VAD state tracking
        self.vad_states: Dict[str, Dict[str, Any]] = {}
        
        # Quality adaptation
        self.quality_thresholds = {
            "high": 0.8,    # Use full VAD capabilities
            "medium": 0.6,  # Use conservative settings
            "low": 0.3      # Use aggressive noise filtering
        }
        
        self.is_running = False
        self._processing_tasks: Dict[str, asyncio.Task] = {}
    
    async def start(self):
        """Start VAD processing"""
        self.is_running = True
        logger.info("Stream VAD started")
    
    async def stop(self):
        """Stop VAD processing"""
        self.is_running = False
        
        # Cancel all processing tasks
        for task in self._processing_tasks.values():
            task.cancel()
        
        await asyncio.gather(*self._processing_tasks.values(), return_exceptions=True)
        self._processing_tasks.clear()
        
        logger.info("Stream VAD stopped")
    
    def create_stream_buffer(self, stream_id: str) -> NetworkAudioBuffer:
        """Create audio buffer for a new stream"""
        buffer = NetworkAudioBuffer(
            buffer_size_ms=self.config.buffer_size_ms,
            sample_rate=self.sample_rate
        )
        self.stream_buffers[stream_id] = buffer
        
        # Initialize VAD state for stream
        self.vad_states[stream_id] = {
            "current_speech": False,
            "speech_start": None,
            "last_speech_end": None,
            "speech_segments": [],
            "quality_history": []
        }
        
        return buffer
    
    def remove_stream_buffer(self, stream_id: str):
        """Remove stream buffer and state"""
        if stream_id in self.stream_buffers:
            del self.stream_buffers[stream_id]
        
        if stream_id in self.vad_states:
            del self.vad_states[stream_id]
        
        # Cancel processing task if exists
        if stream_id in self._processing_tasks:
            self._processing_tasks[stream_id].cancel()
            del self._processing_tasks[stream_id]
    
    async def process_audio_chunk(self, stream_id: str, audio_data: np.ndarray, 
                                timestamp: float, quality_metrics: Optional[AudioQualityMetrics] = None) -> Optional[VADResult]:
        """Process audio chunk for VAD"""
        
        # Get or create stream buffer
        if stream_id not in self.stream_buffers:
            self.create_stream_buffer(stream_id)
        
        buffer = self.stream_buffers[stream_id]
        
        # Add audio to buffer
        buffer.add_audio_chunk(audio_data, timestamp, quality_metrics)
        
        # Get chunk for VAD processing
        chunk_audio, chunk_timestamps = buffer.get_chunk(self.config.chunk_duration_ms)
        
        if len(chunk_audio) == 0:
            return None
        
        # Determine VAD method based on quality
        avg_quality = buffer.get_average_quality()
        vad_method = self._select_vad_method(avg_quality)
        
        # Perform VAD
        is_speech, confidence = await self._perform_vad(chunk_audio, vad_method)
        
        # Update VAD state
        result = self._update_vad_state(
            stream_id, is_speech, confidence, timestamp, avg_quality, vad_method
        )
        
        return result
    
    def _select_vad_method(self, quality: float) -> str:
        """Select VAD method based on audio quality"""
        if not self.config.adaptive_quality:
            return self.config.vad_method
        
        if quality >= self.quality_thresholds["high"]:
            return "silero" if SILERO_AVAILABLE else "webrtc"
        elif quality >= self.quality_thresholds["medium"]:
            return "hybrid" if SILERO_AVAILABLE else "webrtc"
        else:
            return "webrtc"  # Most robust for low quality
    
    async def _perform_vad(self, audio: np.ndarray, method: str) -> Tuple[bool, float]:
        """Perform voice activity detection"""
        
        # Ensure audio is in correct format
        if audio.dtype != np.int16:
            audio = (audio * 32767).astype(np.int16)
        
        if method == "webrtc":
            return self._webrtc_vad(audio)
        elif method == "silero" and self.silero_model:
            return await self._silero_vad(audio)
        elif method == "hybrid" and self.silero_model:
            return await self._hybrid_vad(audio)
        else:
            # Fallback to WebRTC
            return self._webrtc_vad(audio)
    
    def _webrtc_vad(self, audio: np.ndarray) -> Tuple[bool, float]:
        """WebRTC VAD processing"""
        try:
            # WebRTC VAD requires specific frame sizes
            frame_size = int(self.sample_rate * 0.01)  # 10ms frames
            
            if len(audio) < frame_size:
                audio = np.pad(audio, (0, frame_size - len(audio)))
            
            # Process in 10ms frames
            speech_frames = 0
            total_frames = 0
            
            for i in range(0, len(audio) - frame_size + 1, frame_size):
                frame = audio[i:i + frame_size]
                
                if len(frame) == frame_size:
                    try:
                        is_speech = self.webrtc_vad.is_speech(frame.tobytes(), self.sample_rate)
                        if is_speech:
                            speech_frames += 1
                        total_frames += 1
                    except:
                        continue
            
            if total_frames == 0:
                return False, 0.0
            
            confidence = speech_frames / total_frames
            is_speech = confidence > 0.5
            
            return is_speech, confidence
            
        except Exception as e:
            logger.warning(f"WebRTC VAD error: {e}")
            return False, 0.0
    
    async def _silero_vad(self, audio: np.ndarray) -> Tuple[bool, float]:
        """Silero VAD processing"""
        try:
            # Convert to float32 for Silero
            if audio.dtype != np.float32:
                audio_float = audio.astype(np.float32) / 32767.0
            else:
                audio_float = audio
            
            # Silero expects tensor
            audio_tensor = torch.from_numpy(audio_float)
            
            # Get speech probability
            speech_prob = self.silero_model(audio_tensor, self.sample_rate).item()
            
            is_speech = speech_prob > 0.5
            confidence = speech_prob
            
            return is_speech, confidence
            
        except Exception as e:
            logger.warning(f"Silero VAD error: {e}")
            return False, 0.0
    
    async def _hybrid_vad(self, audio: np.ndarray) -> Tuple[bool, float]:
        """Hybrid VAD using both WebRTC and Silero"""
        try:
            # Get results from both VADs
            webrtc_speech, webrtc_conf = self._webrtc_vad(audio)
            silero_speech, silero_conf = await self._silero_vad(audio)
            
            # Weighted combination (Silero is generally more accurate)
            combined_confidence = (silero_conf * 0.7) + (webrtc_conf * 0.3)
            
            # Agreement increases confidence
            if webrtc_speech == silero_speech:
                combined_confidence *= 1.2
            
            combined_confidence = min(combined_confidence, 1.0)
            is_speech = combined_confidence > 0.5
            
            return is_speech, combined_confidence
            
        except Exception as e:
            logger.warning(f"Hybrid VAD error: {e}")
            return await self._silero_vad(audio)
    
    def _update_vad_state(self, stream_id: str, is_speech: bool, confidence: float,
                         timestamp: float, quality: float, method: str) -> Optional[VADResult]:
        """Update VAD state and return result if speech segment detected"""
        
        state = self.vad_states[stream_id]
        current_time = timestamp
        
        # Update quality history
        state["quality_history"].append(quality)
        if len(state["quality_history"]) > 100:
            state["quality_history"].pop(0)
        
        result = None
        
        if is_speech:
            if not state["current_speech"]:
                # Speech started
                state["current_speech"] = True
                state["speech_start"] = current_time
                logger.debug(f"Speech started for stream {stream_id} at {current_time}")
            
        else:
            if state["current_speech"]:
                # Speech ended
                speech_duration = current_time - state["speech_start"]
                
                # Check minimum speech duration
                if speech_duration * 1000 >= self.config.min_speech_duration_ms:
                    # Valid speech segment
                    result = VADResult(
                        is_speech=True,
                        confidence=confidence,
                        start_time=state["speech_start"],
                        end_time=current_time,
                        audio_quality=quality,
                        stream_id=stream_id,
                        method=method
                    )
                    
                    state["speech_segments"].append({
                        "start": state["speech_start"],
                        "end": current_time,
                        "duration": speech_duration,
                        "quality": quality,
                        "confidence": confidence
                    })
                    
                    logger.debug(f"Speech segment detected for stream {stream_id}: "
                               f"{speech_duration:.2f}s, quality: {quality:.2f}")
                
                state["current_speech"] = False
                state["last_speech_end"] = current_time
                state["speech_start"] = None
        
        return result
    
    def get_stream_statistics(self, stream_id: str) -> Dict[str, Any]:
        """Get statistics for a stream"""
        if stream_id not in self.vad_states:
            return {}
        
        state = self.vad_states[stream_id]
        buffer = self.stream_buffers.get(stream_id)
        
        stats = {
            "stream_id": stream_id,
            "current_speech": state["current_speech"],
            "speech_segments_count": len(state["speech_segments"]),
            "average_quality": sum(state["quality_history"]) / len(state["quality_history"]) if state["quality_history"] else 0,
            "buffer_size_ms": buffer.buffer_size_ms if buffer else 0,
            "buffer_fill_level": len(buffer.buffer) / buffer.buffer_size_samples if buffer else 0
        }
        
        # Calculate total speech time
        total_speech_time = sum(seg["duration"] for seg in state["speech_segments"])
        stats["total_speech_time_seconds"] = total_speech_time
        
        # Calculate average confidence
        if state["speech_segments"]:
            avg_confidence = sum(seg["confidence"] for seg in state["speech_segments"]) / len(state["speech_segments"])
            stats["average_confidence"] = avg_confidence
        
        return stats
    
    async def resync_stream(self, stream_id: str, reference_timestamp: float):
        """Resync stream buffer with reference timestamp"""
        if stream_id not in self.stream_buffers:
            return
        
        buffer = self.stream_buffers[stream_id]
        
        # Clear buffer if timestamp difference is too large
        if buffer.last_timestamp > 0:
            time_diff = abs(reference_timestamp - buffer.last_timestamp)
            if time_diff * 1000 > self.config.resync_threshold_ms:
                logger.info(f"Resyncing stream {stream_id}, time diff: {time_diff*1000:.1f}ms")
                buffer.buffer.clear()
                buffer.timestamps.clear()
                buffer.last_timestamp = reference_timestamp
    
    def adapt_to_quality(self, stream_id: str, quality_metrics: AudioQualityMetrics):
        """Adapt VAD settings based on audio quality"""
        if not self.config.adaptive_quality:
            return
        
        # Adjust aggressiveness based on quality
        if quality_metrics.overall_quality < 0.3:
            # Poor quality - use more aggressive filtering
            self.webrtc_vad.set_mode(3)
        elif quality_metrics.overall_quality < 0.6:
            # Medium quality - balanced approach
            self.webrtc_vad.set_mode(2)
        else:
            # Good quality - sensitive detection
            self.webrtc_vad.set_mode(1)

# Global VAD instance
stream_vad = StreamVAD()

async def get_stream_vad(config: Optional[StreamVADConfig] = None) -> StreamVAD:
    """Get the global stream VAD instance"""
    global stream_vad
    
    if config and not stream_vad.is_running:
        stream_vad = StreamVAD(config)
    
    if not stream_vad.is_running:
        await stream_vad.start()
    
    return stream_vad

def calculate_audio_quality_metrics(audio_data: np.ndarray, 
                                  sample_rate: int = 16000,
                                  packet_loss: float = 0.0,
                                  jitter_ms: float = 0.0,
                                  bitrate_kbps: float = 128) -> AudioQualityMetrics:
    """Calculate audio quality metrics"""
    
    # Signal-to-noise ratio estimation
    signal_power = np.mean(audio_data ** 2)
    if signal_power > 0:
        # Estimate noise from quieter samples
        sorted_samples = np.sort(np.abs(audio_data))
        noise_threshold = sorted_samples[int(len(sorted_samples) * 0.1)]
        noise_power = np.mean((audio_data[np.abs(audio_data) <= noise_threshold]) ** 2)
        
        if noise_power > 0:
            snr_db = 10 * np.log10(signal_power / noise_power)
        else:
            snr_db = 60.0  # Very clean signal
    else:
        snr_db = 0.0
    
    # Total harmonic distortion (simplified estimation)
    fft = np.fft.fft(audio_data)
    freq_domain = np.abs(fft[:len(fft)//2])
    
    if len(freq_domain) > 10:
        fundamental_power = np.max(freq_domain)
        harmonic_power = np.sum(freq_domain) - fundamental_power
        
        if fundamental_power > 0:
            thd_percent = (harmonic_power / fundamental_power) * 100
        else:
            thd_percent = 0.0
    else:
        thd_percent = 0.0
    
    # Overall quality score
    snr_score = min(max(snr_db / 40.0, 0), 1)  # Normalize SNR (0-40dB)
    thd_score = max(1 - (thd_percent / 10.0), 0)  # Penalize high THD
    network_score = max(1 - (packet_loss / 10.0) - (jitter_ms / 100.0), 0)
    bitrate_score = min(bitrate_kbps / 128.0, 1)  # Normalize to 128kbps reference
    
    overall_quality = (snr_score * 0.4 + thd_score * 0.3 + network_score * 0.2 + bitrate_score * 0.1)
    
    return AudioQualityMetrics(
        snr_db=snr_db,
        thd_percent=thd_percent,
        packet_loss_percent=packet_loss,
        jitter_ms=jitter_ms,
        bitrate_kbps=bitrate_kbps,
        sample_rate=sample_rate,
        overall_quality=overall_quality
    )