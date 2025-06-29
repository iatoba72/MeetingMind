# Whisper Transcription Service
# Local transcription using faster-whisper with optimized performance
# Supports audio chunk processing, model selection, and real-time transcription

import os
import time
import asyncio
import logging
import tempfile
from datetime import datetime
from typing import Dict, List, Optional, Any, Tuple
from dataclasses import dataclass, asdict
from enum import Enum
import json
import uuid
from pathlib import Path

# Audio processing
import numpy as np
import soundfile as sf
import librosa
from pydub import AudioSegment
import io
import base64

# Whisper transcription
from faster_whisper import WhisperModel
import torch

# Queue management
from celery import Celery
import redis

# Database
from sqlalchemy.orm import Session
from database import get_db
from crud import transcript_crud, TranscriptCreate
from models import TranscriptType

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class WhisperModelSize(Enum):
    """Available Whisper model sizes with their characteristics"""
    TINY = "tiny"
    BASE = "base" 
    SMALL = "small"
    MEDIUM = "medium"
    LARGE = "large"
    LARGE_V2 = "large-v2"
    LARGE_V3 = "large-v3"

@dataclass
class ModelInfo:
    """Information about Whisper model variants"""
    size: str
    parameters: str
    vram_required: str
    relative_speed: str
    multilingual: bool
    accuracy: str
    download_size: str

@dataclass
class TranscriptionConfig:
    """Configuration for transcription processing"""
    model_size: WhisperModelSize = WhisperModelSize.BASE
    language: Optional[str] = None  # Auto-detect if None
    task: str = "transcribe"  # transcribe or translate
    beam_size: int = 5
    best_of: int = 5
    temperature: float = 0.0
    condition_on_previous_text: bool = True
    no_speech_threshold: float = 0.6
    log_prob_threshold: float = -1.0
    compression_ratio_threshold: float = 2.4
    vad_filter: bool = True  # Voice Activity Detection
    vad_parameters: Dict[str, Any] = None
    word_timestamps: bool = True
    prepend_punctuations: str = "\"'¿([{-"
    append_punctuations: str = "\"'.。,，!！?？:：\"】）]}、"

    def __post_init__(self):
        if self.vad_parameters is None:
            self.vad_parameters = {
                "threshold": 0.5,
                "min_speech_duration_ms": 250,
                "max_speech_duration_s": 30,
                "min_silence_duration_ms": 100,
                "window_size_samples": 1024,
                "speech_pad_ms": 400
            }

@dataclass
class TranscriptionMetrics:
    """Performance metrics for transcription processing"""
    processing_time_ms: float
    audio_duration_ms: float
    real_time_factor: float  # processing_time / audio_duration
    model_loading_time_ms: float
    inference_time_ms: float
    post_processing_time_ms: float
    memory_used_mb: float
    gpu_memory_used_mb: float
    words_per_second: float
    confidence_score: float
    no_speech_probability: float
    compression_ratio: float
    temperature_used: float

@dataclass
class TranscriptionSegment:
    """Individual transcription segment with timing and metadata"""
    id: str
    start_time: float
    end_time: float
    text: str
    words: List[Dict[str, Any]]
    no_speech_prob: float
    avg_logprob: float
    compression_ratio: float
    temperature: float
    seek: int
    tokens: List[int]

@dataclass
class TranscriptionResult:
    """Complete transcription result with metadata"""
    session_id: str
    audio_chunk_id: str
    segments: List[TranscriptionSegment]
    language: str
    language_probability: float
    full_text: str
    metrics: TranscriptionMetrics
    config: TranscriptionConfig
    timestamp: datetime
    processing_status: str

class WhisperTranscriptionService:
    """
    Local Whisper transcription service with optimized performance
    
    Features:
    - Multiple model size support (tiny to large-v3)
    - Real-time audio chunk processing
    - GPU acceleration when available
    - Voice Activity Detection (VAD)
    - Word-level timestamps
    - Performance metrics tracking
    - Queue-based processing
    - Speaker identification support
    """
    
    def __init__(self):
        self.models: Dict[str, WhisperModel] = {}
        self.current_model_size: Optional[WhisperModelSize] = None
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self.compute_type = "float16" if self.device == "cuda" else "int8"
        
        # Model information
        self.model_info = {
            WhisperModelSize.TINY: ModelInfo(
                size="tiny", parameters="39M", vram_required="~1GB",
                relative_speed="~32x", multilingual=True, accuracy="Good",
                download_size="39MB"
            ),
            WhisperModelSize.BASE: ModelInfo(
                size="base", parameters="74M", vram_required="~1GB", 
                relative_speed="~16x", multilingual=True, accuracy="Better",
                download_size="74MB"
            ),
            WhisperModelSize.SMALL: ModelInfo(
                size="small", parameters="244M", vram_required="~2GB",
                relative_speed="~6x", multilingual=True, accuracy="Good+",
                download_size="244MB"
            ),
            WhisperModelSize.MEDIUM: ModelInfo(
                size="medium", parameters="769M", vram_required="~5GB",
                relative_speed="~2x", multilingual=True, accuracy="Very Good",
                download_size="769MB"
            ),
            WhisperModelSize.LARGE: ModelInfo(
                size="large", parameters="1550M", vram_required="~10GB",
                relative_speed="~1x", multilingual=True, accuracy="Excellent",
                download_size="1550MB"
            ),
            WhisperModelSize.LARGE_V2: ModelInfo(
                size="large-v2", parameters="1550M", vram_required="~10GB",
                relative_speed="~1x", multilingual=True, accuracy="Excellent+",
                download_size="1550MB"
            ),
            WhisperModelSize.LARGE_V3: ModelInfo(
                size="large-v3", parameters="1550M", vram_required="~10GB",
                relative_speed="~1x", multilingual=True, accuracy="Best",
                download_size="1550MB"
            )
        }
        
        # Performance tracking
        self.session_metrics: Dict[str, List[TranscriptionMetrics]] = {}
        
        # Initialize Redis for queue management
        self.redis_client = redis.Redis(
            host=os.getenv('REDIS_HOST', 'localhost'),
            port=int(os.getenv('REDIS_PORT', 6379)),
            db=0,
            decode_responses=True
        )
        
        # Initialize Celery for distributed processing
        self.celery_app = Celery(
            'transcription_worker',
            broker=os.getenv('CELERY_BROKER', 'redis://localhost:6379/0'),
            backend=os.getenv('CELERY_BACKEND', 'redis://localhost:6379/0')
        )
        
        logger.info(f"Transcription service initialized - Device: {self.device}, Compute: {self.compute_type}")

    async def get_available_models(self) -> Dict[str, ModelInfo]:
        """Get information about available Whisper models"""
        return {size.value: asdict(info) for size, info in self.model_info.items()}

    async def load_model(self, model_size: WhisperModelSize, force_reload: bool = False) -> bool:
        """
        Load a Whisper model for transcription
        
        Args:
            model_size: The size of the model to load
            force_reload: Whether to reload the model if already loaded
            
        Returns:
            True if model loaded successfully, False otherwise
        """
        try:
            model_key = model_size.value
            
            # Check if model is already loaded
            if not force_reload and model_key in self.models and self.current_model_size == model_size:
                logger.info(f"Model {model_key} already loaded")
                return True
            
            logger.info(f"Loading Whisper model: {model_key}")
            start_time = time.time()
            
            # Clear previous models to free memory
            if self.models:
                for model in self.models.values():
                    del model
                self.models.clear()
                if torch.cuda.is_available():
                    torch.cuda.empty_cache()
            
            # Load the new model
            model = WhisperModel(
                model_size.value,
                device=self.device,
                compute_type=self.compute_type,
                download_root=os.getenv('WHISPER_CACHE_DIR', './models'),
                num_workers=1  # Optimize for single-threaded inference
            )
            
            self.models[model_key] = model
            self.current_model_size = model_size
            
            load_time = (time.time() - start_time) * 1000
            logger.info(f"Model {model_key} loaded successfully in {load_time:.2f}ms")
            
            return True
            
        except Exception as e:
            logger.error(f"Failed to load model {model_size.value}: {str(e)}")
            return False

    async def preprocess_audio(self, audio_data: bytes, sample_rate: int = None) -> Tuple[np.ndarray, int]:
        """
        Preprocess audio data for transcription
        
        Args:
            audio_data: Raw audio bytes
            sample_rate: Original sample rate (will be resampled to 16kHz)
            
        Returns:
            Tuple of (audio_array, sample_rate)
        """
        try:
            # Convert bytes to audio array
            if isinstance(audio_data, str):
                # Handle base64 encoded audio
                audio_data = base64.b64decode(audio_data)
            
            # Use pydub for format detection and conversion
            audio_segment = AudioSegment.from_raw(
                io.BytesIO(audio_data),
                sample_width=2,  # 16-bit
                frame_rate=sample_rate or 44100,
                channels=1
            )
            
            # Convert to mono and resample to 16kHz (Whisper's expected format)
            audio_segment = audio_segment.set_channels(1)
            audio_segment = audio_segment.set_frame_rate(16000)
            
            # Convert to numpy array
            audio_array = np.array(audio_segment.get_array_of_samples()).astype(np.float32)
            audio_array = audio_array / 32768.0  # Normalize to [-1, 1]
            
            return audio_array, 16000
            
        except Exception as e:
            logger.error(f"Audio preprocessing failed: {str(e)}")
            raise

    async def transcribe_audio_chunk(
        self,
        session_id: str,
        audio_chunk_id: str,
        audio_data: bytes,
        config: TranscriptionConfig,
        sample_rate: int = None
    ) -> TranscriptionResult:
        """
        Transcribe an audio chunk with performance metrics
        
        Args:
            session_id: Unique session identifier
            audio_chunk_id: Unique chunk identifier
            audio_data: Raw audio bytes
            config: Transcription configuration
            sample_rate: Audio sample rate
            
        Returns:
            TranscriptionResult with segments and metrics
        """
        start_time = time.time()
        
        try:
            # Ensure model is loaded
            if not await self.load_model(config.model_size):
                raise RuntimeError(f"Failed to load model {config.model_size.value}")
            
            model = self.models[config.model_size.value]
            model_load_time = time.time()
            
            # Preprocess audio
            audio_array, final_sample_rate = await self.preprocess_audio(audio_data, sample_rate)
            audio_duration = len(audio_array) / final_sample_rate * 1000  # ms
            
            preprocess_time = time.time()
            
            # Memory tracking
            memory_before = self._get_memory_usage()
            
            # Run transcription
            segments, info = model.transcribe(
                audio_array,
                language=config.language,
                task=config.task,
                beam_size=config.beam_size,
                best_of=config.best_of,
                temperature=config.temperature,
                condition_on_previous_text=config.condition_on_previous_text,
                no_speech_threshold=config.no_speech_threshold,
                log_prob_threshold=config.log_prob_threshold,
                compression_ratio_threshold=config.compression_ratio_threshold,
                vad_filter=config.vad_filter,
                vad_parameters=config.vad_parameters,
                word_timestamps=config.word_timestamps,
                prepend_punctuations=config.prepend_punctuations,
                append_punctuations=config.append_punctuations
            )
            
            inference_time = time.time()
            
            # Process segments
            transcription_segments = []
            full_text_parts = []
            
            for segment in segments:
                segment_id = str(uuid.uuid4())
                
                # Extract words with timestamps
                words = []
                if hasattr(segment, 'words') and segment.words:
                    words = [
                        {
                            "word": word.word,
                            "start": word.start,
                            "end": word.end,
                            "probability": word.probability
                        }
                        for word in segment.words
                    ]
                
                transcription_segment = TranscriptionSegment(
                    id=segment_id,
                    start_time=segment.start,
                    end_time=segment.end,
                    text=segment.text.strip(),
                    words=words,
                    no_speech_prob=segment.no_speech_prob,
                    avg_logprob=segment.avg_logprob,
                    compression_ratio=segment.compression_ratio,
                    temperature=segment.temperature,
                    seek=segment.seek,
                    tokens=segment.tokens if hasattr(segment, 'tokens') else []
                )
                
                transcription_segments.append(transcription_segment)
                full_text_parts.append(segment.text.strip())
            
            # Memory tracking
            memory_after = self._get_memory_usage()
            
            post_process_time = time.time()
            
            # Calculate metrics
            total_processing_time = (post_process_time - start_time) * 1000
            model_loading_time = (model_load_time - start_time) * 1000
            inference_time_ms = (inference_time - preprocess_time) * 1000
            post_processing_time = (post_process_time - inference_time) * 1000
            
            # Calculate additional metrics
            full_text = " ".join(full_text_parts)
            word_count = len(full_text.split())
            words_per_second = word_count / (total_processing_time / 1000) if total_processing_time > 0 else 0
            real_time_factor = total_processing_time / audio_duration if audio_duration > 0 else 0
            
            # Average confidence from segments
            avg_confidence = np.mean([1 - seg.no_speech_prob for seg in transcription_segments]) if transcription_segments else 0
            
            metrics = TranscriptionMetrics(
                processing_time_ms=total_processing_time,
                audio_duration_ms=audio_duration,
                real_time_factor=real_time_factor,
                model_loading_time_ms=model_loading_time,
                inference_time_ms=inference_time_ms,
                post_processing_time_ms=post_processing_time,
                memory_used_mb=memory_after - memory_before,
                gpu_memory_used_mb=self._get_gpu_memory_usage(),
                words_per_second=words_per_second,
                confidence_score=avg_confidence,
                no_speech_probability=info.no_speech_probability if hasattr(info, 'no_speech_probability') else 0,
                compression_ratio=np.mean([seg.compression_ratio for seg in transcription_segments]) if transcription_segments else 0,
                temperature_used=config.temperature
            )
            
            # Store metrics for session
            if session_id not in self.session_metrics:
                self.session_metrics[session_id] = []
            self.session_metrics[session_id].append(metrics)
            
            result = TranscriptionResult(
                session_id=session_id,
                audio_chunk_id=audio_chunk_id,
                segments=transcription_segments,
                language=info.language,
                language_probability=info.language_probability,
                full_text=full_text,
                metrics=metrics,
                config=config,
                timestamp=datetime.utcnow(),
                processing_status="completed"
            )
            
            # Save to database if enabled
            await self._save_transcription_to_db(result)
            
            logger.info(
                f"Transcription completed - Session: {session_id}, "
                f"Duration: {audio_duration:.0f}ms, "
                f"Processing: {total_processing_time:.0f}ms, "
                f"RTF: {real_time_factor:.2f}x, "
                f"Words: {word_count}, "
                f"Confidence: {avg_confidence:.2f}"
            )
            
            return result
            
        except Exception as e:
            logger.error(f"Transcription failed for session {session_id}: {str(e)}")
            error_result = TranscriptionResult(
                session_id=session_id,
                audio_chunk_id=audio_chunk_id,
                segments=[],
                language="",
                language_probability=0.0,
                full_text="",
                metrics=TranscriptionMetrics(
                    processing_time_ms=(time.time() - start_time) * 1000,
                    audio_duration_ms=0,
                    real_time_factor=0,
                    model_loading_time_ms=0,
                    inference_time_ms=0,
                    post_processing_time_ms=0,
                    memory_used_mb=0,
                    gpu_memory_used_mb=0,
                    words_per_second=0,
                    confidence_score=0,
                    no_speech_probability=1.0,
                    compression_ratio=0,
                    temperature_used=0
                ),
                config=config,
                timestamp=datetime.utcnow(),
                processing_status=f"error: {str(e)}"
            )
            return error_result

    async def _save_transcription_to_db(self, result: TranscriptionResult):
        """Save transcription result to database"""
        try:
            # This would integrate with your existing database
            # For now, we'll skip the actual database save
            pass
        except Exception as e:
            logger.error(f"Failed to save transcription to database: {str(e)}")

    def _get_memory_usage(self) -> float:
        """Get current memory usage in MB"""
        try:
            import psutil
            process = psutil.Process()
            return process.memory_info().rss / 1024 / 1024
        except (ImportError, OSError, AttributeError) as e:
            logger.warning(f"Failed to get memory usage: {e}")
            return 0.0

    def _get_gpu_memory_usage(self) -> float:
        """Get current GPU memory usage in MB"""
        try:
            if torch.cuda.is_available():
                return torch.cuda.memory_allocated() / 1024 / 1024
            return 0.0
        except (RuntimeError, AttributeError) as e:
            logger.warning(f"Failed to get GPU memory usage: {e}")
            return 0.0

    async def get_session_metrics(self, session_id: str) -> Dict[str, Any]:
        """Get aggregated metrics for a transcription session"""
        if session_id not in self.session_metrics:
            return {}
        
        metrics_list = self.session_metrics[session_id]
        if not metrics_list:
            return {}
        
        # Aggregate metrics
        total_chunks = len(metrics_list)
        total_audio_duration = sum(m.audio_duration_ms for m in metrics_list)
        total_processing_time = sum(m.processing_time_ms for m in metrics_list)
        avg_rtf = np.mean([m.real_time_factor for m in metrics_list])
        avg_confidence = np.mean([m.confidence_score for m in metrics_list])
        total_words = sum(m.words_per_second * (m.processing_time_ms / 1000) for m in metrics_list)
        
        return {
            "session_id": session_id,
            "total_chunks_processed": total_chunks,
            "total_audio_duration_ms": total_audio_duration,
            "total_processing_time_ms": total_processing_time,
            "average_real_time_factor": avg_rtf,
            "average_confidence_score": avg_confidence,
            "total_words_transcribed": int(total_words),
            "model_used": self.current_model_size.value if self.current_model_size else "none",
            "device_used": self.device,
            "latest_metrics": asdict(metrics_list[-1]) if metrics_list else None
        }

    async def get_system_info(self) -> Dict[str, Any]:
        """Get system information for transcription setup"""
        return {
            "device": self.device,
            "compute_type": self.compute_type,
            "cuda_available": torch.cuda.is_available(),
            "cuda_version": torch.version.cuda if torch.cuda.is_available() else None,
            "gpu_name": torch.cuda.get_device_name(0) if torch.cuda.is_available() else None,
            "gpu_memory_total": torch.cuda.get_device_properties(0).total_memory / 1024**3 if torch.cuda.is_available() else 0,
            "current_model": self.current_model_size.value if self.current_model_size else None,
            "loaded_models": list(self.models.keys()),
            "session_count": len(self.session_metrics)
        }

# Global transcription service instance
transcription_service = WhisperTranscriptionService()

# Celery task for distributed processing
@transcription_service.celery_app.task
def process_audio_chunk_task(session_id: str, audio_chunk_id: str, audio_data: str, config_dict: Dict[str, Any]):
    """Celery task for processing audio chunks in a distributed queue"""
    import asyncio
    
    # Convert config dict back to TranscriptionConfig
    config = TranscriptionConfig(**config_dict)
    
    # Decode audio data
    audio_bytes = base64.b64decode(audio_data)
    
    # Run transcription
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    result = loop.run_until_complete(
        transcription_service.transcribe_audio_chunk(
            session_id, audio_chunk_id, audio_bytes, config
        )
    )
    loop.close()
    
    return asdict(result)

# Export the service instance
__all__ = [
    'transcription_service',
    'WhisperTranscriptionService', 
    'TranscriptionConfig',
    'TranscriptionResult',
    'TranscriptionMetrics',
    'WhisperModelSize'
]