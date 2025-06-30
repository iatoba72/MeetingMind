# Cloud Transcription Service Registry
# Manages multiple transcription providers with fallback and cost tracking

import asyncio
import logging
import time
import uuid
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any, Tuple, Union, Callable
from dataclasses import dataclass, asdict, field
from enum import Enum
import json
import hashlib
from pathlib import Path
import aiohttp
import websockets
import base64
from abc import ABC, abstractmethod

# Import specific exceptions for better error handling
import aiohttp.client_exceptions
import websockets.exceptions
import ssl
import socket
import asyncio

# Import existing local transcription components
from transcription_service import (
    TranscriptionConfig,
    TranscriptionResult,
    TranscriptionSegment,
    TranscriptionMetrics,
    WhisperModelSize,
)

logger = logging.getLogger(__name__)


class TranscriptionProvider(Enum):
    """Available transcription providers"""

    LOCAL_WHISPER = "local_whisper"
    OPENAI_WHISPER = "openai_whisper"
    ASSEMBLYAI = "assemblyai"
    AZURE_SPEECH = "azure_speech"
    GOOGLE_SPEECH = "google_speech"


class ProviderStatus(Enum):
    """Provider availability status"""

    AVAILABLE = "available"
    UNAVAILABLE = "unavailable"
    RATE_LIMITED = "rate_limited"
    ERROR = "error"
    DISABLED = "disabled"


@dataclass
class ProviderCostConfig:
    """Cost configuration for a provider"""

    cost_per_minute: float  # USD per minute of audio
    cost_per_request: float = 0.0  # Fixed cost per API request
    free_tier_minutes: float = 0.0  # Free minutes per month
    currency: str = "USD"
    billing_increment: float = 1.0  # Minimum billing increment in seconds


@dataclass
class ProviderConfig:
    """Configuration for a transcription provider"""

    provider: TranscriptionProvider
    api_key: str
    endpoint_url: Optional[str] = None
    model_name: Optional[str] = None
    max_audio_length: int = 300  # seconds
    supported_formats: List[str] = field(default_factory=lambda: ["wav", "mp3", "m4a"])
    real_time_capable: bool = False
    language_detection: bool = True
    speaker_diarization: bool = False
    cost_config: Optional[ProviderCostConfig] = None
    retry_config: Dict[str, Any] = field(
        default_factory=lambda: {
            "max_retries": 3,
            "backoff_factor": 2.0,
            "initial_delay": 1.0,
            "max_delay": 30.0,
        }
    )
    rate_limit: Dict[str, Any] = field(
        default_factory=lambda: {"requests_per_minute": 100, "concurrent_requests": 5}
    )


@dataclass
class TranscriptionAttempt:
    """Single transcription attempt with metadata"""

    id: str
    provider: TranscriptionProvider
    start_time: datetime
    end_time: Optional[datetime] = None
    success: bool = False
    error_message: Optional[str] = None
    cost: float = 0.0
    audio_duration: float = 0.0
    processing_time: float = 0.0
    confidence_score: float = 0.0
    result: Optional[TranscriptionResult] = None


@dataclass
class TranscriptionJob:
    """Complete transcription job with multiple attempts"""

    id: str
    session_id: str
    audio_chunk_id: str
    audio_data: bytes
    audio_duration: float
    created_at: datetime
    attempts: List[TranscriptionAttempt] = field(default_factory=list)
    preferred_providers: List[TranscriptionProvider] = field(default_factory=list)
    fallback_enabled: bool = True
    comparison_mode: bool = False
    completed_at: Optional[datetime] = None
    final_result: Optional[TranscriptionResult] = None
    total_cost: float = 0.0


class BaseTranscriptionProvider(ABC):
    """Abstract base class for transcription providers"""

    def __init__(self, config: ProviderConfig):
        self.config = config
        self.status = ProviderStatus.AVAILABLE
        self.last_request_time = 0.0
        self.request_count = 0
        self.error_count = 0
        self.total_cost = 0.0
        self.total_audio_minutes = 0.0

    @abstractmethod
    async def transcribe_audio(
        self,
        audio_data: bytes,
        audio_format: str = "wav",
        language: Optional[str] = None,
    ) -> TranscriptionResult:
        """Transcribe audio data and return result"""
        raise NotImplementedError("Subclasses must implement transcribe_audio method")

    @abstractmethod
    async def transcribe_realtime(
        self, audio_stream: Any, callback: Callable[[TranscriptionResult], None]
    ) -> None:
        """Real-time transcription with callback for results"""
        raise NotImplementedError(
            "Subclasses must implement transcribe_realtime method"
        )

    def calculate_cost(self, audio_duration: float) -> float:
        """Calculate cost for transcribing audio of given duration"""
        if not self.config.cost_config:
            return 0.0

        cost_config = self.config.cost_config

        # Calculate audio cost
        minutes = audio_duration / 60.0

        # Apply billing increment
        if cost_config.billing_increment > 0:
            increment_seconds = cost_config.billing_increment
            billable_seconds = (
                (audio_duration + increment_seconds - 1) // increment_seconds
            ) * increment_seconds
            minutes = billable_seconds / 60.0

        # Check free tier
        remaining_free = max(
            0, cost_config.free_tier_minutes - self.total_audio_minutes
        )
        billable_minutes = max(0, minutes - remaining_free)

        audio_cost = billable_minutes * cost_config.cost_per_minute
        request_cost = cost_config.cost_per_request

        return audio_cost + request_cost

    def update_usage(self, audio_duration: float, cost: float):
        """Update usage statistics"""
        self.total_audio_minutes += audio_duration / 60.0
        self.total_cost += cost
        self.request_count += 1
        self.last_request_time = time.time()

    def check_rate_limit(self) -> bool:
        """Check if rate limit allows new request"""
        now = time.time()
        window_start = now - 60  # 1 minute window

        # Simple rate limiting - in production, use more sophisticated tracking
        if self.last_request_time > window_start:
            requests_in_window = self.request_count  # Simplified
            return requests_in_window < self.config.rate_limit["requests_per_minute"]

        return True

    async def health_check(self) -> bool:
        """Check if provider is healthy and available"""
        try:
            # Implement provider-specific health check
            return self.status == ProviderStatus.AVAILABLE
        except (
            aiohttp.client_exceptions.ClientError,
            websockets.exceptions.WebSocketException,
            asyncio.TimeoutError,
            ssl.SSLError,
            socket.error,
            ConnectionError,
        ) as e:
            logger.error(f"Health check failed for {self.config.provider.value}: {e}")
            return False
        except Exception as e:
            logger.error(
                f"Unexpected error during health check for {self.config.provider.value}: {e}"
            )
            return False


class AssemblyAIProvider(BaseTranscriptionProvider):
    """AssemblyAI transcription provider"""

    def __init__(self, config: ProviderConfig):
        super().__init__(config)
        self.base_url = "https://api.assemblyai.com/v2"
        self.ws_url = "wss://api.assemblyai.com/v2/realtime/ws"

    async def transcribe_audio(
        self,
        audio_data: bytes,
        audio_format: str = "wav",
        language: Optional[str] = None,
    ) -> TranscriptionResult:
        """Transcribe audio using AssemblyAI API"""
        session = aiohttp.ClientSession()

        try:
            # First, upload the audio file
            upload_response = await session.post(
                f"{self.base_url}/upload",
                headers={"authorization": self.config.api_key},
                data=audio_data,
            )
            upload_response.raise_for_status()
            upload_data = await upload_response.json()
            audio_url = upload_data["upload_url"]

            # Submit transcription request
            transcript_request = {
                "audio_url": audio_url,
                "language_detection": self.config.language_detection,
                "speaker_labels": self.config.speaker_diarization,
                "word_timestamps": True,
                "punctuate": True,
                "format_text": True,
            }

            if language:
                transcript_request["language_code"] = language

            submit_response = await session.post(
                f"{self.base_url}/transcript",
                headers={
                    "authorization": self.config.api_key,
                    "content-type": "application/json",
                },
                json=transcript_request,
            )
            submit_response.raise_for_status()
            submit_data = await submit_response.json()
            transcript_id = submit_data["id"]

            # Poll for completion
            while True:
                status_response = await session.get(
                    f"{self.base_url}/transcript/{transcript_id}",
                    headers={"authorization": self.config.api_key},
                )
                status_response.raise_for_status()
                status_data = await status_response.json()

                if status_data["status"] == "completed":
                    return self._parse_assemblyai_result(status_data)
                elif status_data["status"] == "error":
                    raise aiohttp.client_exceptions.ClientResponseError(
                        request_info=None,
                        history=(),
                        message=f"AssemblyAI transcription failed: {status_data.get('error')}",
                    )

                await asyncio.sleep(1)  # Poll every second

        except aiohttp.client_exceptions.ClientResponseError as e:
            logger.error(f"AssemblyAI HTTP error: {e}")
            raise
        except aiohttp.client_exceptions.ClientConnectionError as e:
            logger.error(f"AssemblyAI connection error: {e}")
            raise
        except asyncio.TimeoutError as e:
            logger.error(f"AssemblyAI request timeout: {e}")
            raise
        except (ssl.SSLError, socket.error) as e:
            logger.error(f"AssemblyAI network error: {e}")
            raise
        except (KeyError, ValueError, TypeError) as e:
            logger.error(f"AssemblyAI data parsing error: {e}")
            raise
        finally:
            await session.close()

    async def transcribe_realtime(
        self, audio_stream: Any, callback: Callable[[TranscriptionResult], None]
    ) -> None:
        """Real-time transcription using AssemblyAI WebSocket"""
        auth_token = self.config.api_key

        # Get temporary token for WebSocket
        try:
            async with aiohttp.ClientSession() as session:
                token_response = await session.post(
                    f"{self.base_url}/realtime/token",
                    headers={"authorization": auth_token},
                    json={"expires_in": 3600},
                )
                token_response.raise_for_status()
                token_data = await token_response.json()
                temp_token = token_data["token"]
        except aiohttp.client_exceptions.ClientError as e:
            logger.error(f"Failed to get AssemblyAI real-time token: {e}")
            raise
        except (KeyError, ValueError) as e:
            logger.error(f"Invalid AssemblyAI token response: {e}")
            raise

        # Connect to WebSocket
        ws_url = f"{self.ws_url}?sample_rate=16000&token={temp_token}"

        try:
            async with websockets.connect(ws_url) as websocket:
                # Send configuration
                await websocket.send(
                    json.dumps(
                        {
                            "word_timestamps": True,
                            "punctuate": True,
                            "format_text": True,
                        }
                    )
                )

                # Handle incoming transcriptions
                async def receive_transcriptions():
                    try:
                        async for message in websocket:
                            data = json.loads(message)
                            if data["message_type"] == "FinalTranscript":
                                result = self._parse_realtime_result(data)
                                callback(result)
                    except websockets.exceptions.ConnectionClosedError as e:
                        logger.error(f"AssemblyAI WebSocket connection closed: {e}")
                    except (KeyError, ValueError, TypeError) as e:
                        logger.error(f"AssemblyAI real-time parsing error: {e}")

                # Start receiving task
                receive_task = asyncio.create_task(receive_transcriptions())

                # Send audio data
                try:
                    async for audio_chunk in audio_stream:
                        if audio_chunk:
                            audio_b64 = base64.b64encode(audio_chunk).decode("utf-8")
                            await websocket.send(json.dumps({"audio_data": audio_b64}))
                except websockets.exceptions.ConnectionClosedError as e:
                    logger.error(
                        f"AssemblyAI WebSocket connection lost during send: {e}"
                    )
                    raise
                finally:
                    receive_task.cancel()
        except websockets.exceptions.WebSocketException as e:
            logger.error(f"AssemblyAI WebSocket error: {e}")
            raise
        except (ssl.SSLError, socket.error, ConnectionError) as e:
            logger.error(f"AssemblyAI WebSocket connection error: {e}")
            raise

    def _parse_assemblyai_result(self, data: Dict[str, Any]) -> TranscriptionResult:
        """Parse AssemblyAI response into TranscriptionResult"""
        segments = []

        if "words" in data and data["words"]:
            # Group words into segments (sentence-like chunks)
            current_segment_words = []
            current_start = 0

            for word_data in data["words"]:
                if not current_segment_words:
                    current_start = word_data["start"] / 1000.0  # Convert ms to seconds

                current_segment_words.append(
                    {
                        "word": word_data["text"],
                        "start": word_data["start"] / 1000.0,
                        "end": word_data["end"] / 1000.0,
                        "probability": word_data["confidence"],
                    }
                )

                # End segment on punctuation or after certain length
                if (
                    word_data["text"].endswith((".", "!", "?"))
                    or len(current_segment_words) >= 20
                ):

                    segment_text = " ".join(w["word"] for w in current_segment_words)
                    segment_end = word_data["end"] / 1000.0

                    segment = TranscriptionSegment(
                        id=str(uuid.uuid4()),
                        start_time=current_start,
                        end_time=segment_end,
                        text=segment_text,
                        words=current_segment_words,
                        no_speech_prob=1
                        - (
                            sum(w["probability"] for w in current_segment_words)
                            / len(current_segment_words)
                        ),
                        avg_logprob=sum(w["probability"] for w in current_segment_words)
                        / len(current_segment_words),
                        compression_ratio=1.0,
                        temperature=0.0,
                        seek=0,
                        tokens=[],
                    )

                    segments.append(segment)
                    current_segment_words = []

        # Calculate metrics
        audio_duration = data.get("audio_duration", 0) * 1000  # Convert to ms
        confidence_score = data.get("confidence", 0.0)

        metrics = TranscriptionMetrics(
            processing_time_ms=0.0,  # Not provided by AssemblyAI
            audio_duration_ms=audio_duration,
            real_time_factor=0.0,
            model_loading_time_ms=0.0,
            inference_time_ms=0.0,
            post_processing_time_ms=0.0,
            memory_used_mb=0.0,
            gpu_memory_used_mb=0.0,
            words_per_second=(
                len(data.get("words", [])) / (audio_duration / 1000)
                if audio_duration > 0
                else 0
            ),
            confidence_score=confidence_score,
            no_speech_probability=0.0,
            compression_ratio=1.0,
            temperature_used=0.0,
        )

        return TranscriptionResult(
            session_id="",  # Will be set by calling code
            audio_chunk_id="",  # Will be set by calling code
            segments=segments,
            language=data.get("language_code", "en"),
            language_probability=1.0,
            full_text=data.get("text", ""),
            metrics=metrics,
            config=TranscriptionConfig(),  # Default config
            timestamp=datetime.utcnow(),
            processing_status="completed",
        )

    def _parse_realtime_result(self, data: Dict[str, Any]) -> TranscriptionResult:
        """Parse real-time AssemblyAI result"""
        # Simplified parsing for real-time results
        text = data.get("text", "")
        confidence = data.get("confidence", 0.0)

        segment = TranscriptionSegment(
            id=str(uuid.uuid4()),
            start_time=0.0,  # Real-time doesn't provide exact timing
            end_time=0.0,
            text=text,
            words=[],
            no_speech_prob=1 - confidence,
            avg_logprob=confidence,
            compression_ratio=1.0,
            temperature=0.0,
            seek=0,
            tokens=[],
        )

        metrics = TranscriptionMetrics(
            processing_time_ms=0.0,
            audio_duration_ms=0.0,
            real_time_factor=1.0,
            model_loading_time_ms=0.0,
            inference_time_ms=0.0,
            post_processing_time_ms=0.0,
            memory_used_mb=0.0,
            gpu_memory_used_mb=0.0,
            words_per_second=0.0,
            confidence_score=confidence,
            no_speech_probability=0.0,
            compression_ratio=1.0,
            temperature_used=0.0,
        )

        return TranscriptionResult(
            session_id="",
            audio_chunk_id="",
            segments=[segment] if text else [],
            language="en",
            language_probability=1.0,
            full_text=text,
            metrics=metrics,
            config=TranscriptionConfig(),
            timestamp=datetime.utcnow(),
            processing_status="completed",
        )


class OpenAIWhisperProvider(BaseTranscriptionProvider):
    """OpenAI Whisper API provider"""

    def __init__(self, config: ProviderConfig):
        super().__init__(config)
        self.base_url = "https://api.openai.com/v1"

    async def transcribe_audio(
        self,
        audio_data: bytes,
        audio_format: str = "wav",
        language: Optional[str] = None,
    ) -> TranscriptionResult:
        """Transcribe audio using OpenAI Whisper API"""
        session = aiohttp.ClientSession()

        try:
            # Create form data for file upload
            data = aiohttp.FormData()
            data.add_field(
                "file",
                audio_data,
                filename=f"audio.{audio_format}",
                content_type=f"audio/{audio_format}",
            )
            data.add_field("model", self.config.model_name or "whisper-1")
            data.add_field("response_format", "verbose_json")
            data.add_field("timestamp_granularities[]", "word")

            if language:
                data.add_field("language", language)

            response = await session.post(
                f"{self.base_url}/audio/transcriptions",
                headers={"Authorization": f"Bearer {self.config.api_key}"},
                data=data,
            )
            response.raise_for_status()
            result_data = await response.json()

            return self._parse_openai_result(result_data)

        except aiohttp.client_exceptions.ClientResponseError as e:
            logger.error(f"OpenAI HTTP error: {e}")
            raise
        except aiohttp.client_exceptions.ClientConnectionError as e:
            logger.error(f"OpenAI connection error: {e}")
            raise
        except asyncio.TimeoutError as e:
            logger.error(f"OpenAI request timeout: {e}")
            raise
        except (ssl.SSLError, socket.error) as e:
            logger.error(f"OpenAI network error: {e}")
            raise
        except (KeyError, ValueError, TypeError) as e:
            logger.error(f"OpenAI data parsing error: {e}")
            raise
        finally:
            await session.close()

    async def transcribe_realtime(
        self, audio_stream: Any, callback: Callable[[TranscriptionResult], None]
    ) -> None:
        """OpenAI doesn't support real-time transcription, so we'll chunk the audio"""
        # Note: OpenAI Whisper API doesn't support real-time streaming
        # This is a simulated real-time by processing chunks

        audio_buffer = bytearray()
        chunk_size = 30 * 16000 * 2  # 30 seconds of 16kHz 16-bit audio

        async for audio_chunk in audio_stream:
            audio_buffer.extend(audio_chunk)

            if len(audio_buffer) >= chunk_size:
                # Process this chunk
                chunk_data = bytes(audio_buffer[:chunk_size])
                audio_buffer = audio_buffer[chunk_size:]

                try:
                    result = await self.transcribe_audio(chunk_data, "wav")
                    callback(result)
                except aiohttp.client_exceptions.ClientError as e:
                    logger.error(f"OpenAI real-time HTTP error: {e}")
                except asyncio.TimeoutError as e:
                    logger.error(f"OpenAI real-time timeout: {e}")
                except (ssl.SSLError, socket.error, ConnectionError) as e:
                    logger.error(f"OpenAI real-time connection error: {e}")
                except (KeyError, ValueError, TypeError) as e:
                    logger.error(f"OpenAI real-time parsing error: {e}")
                except Exception as e:
                    logger.error(f"OpenAI real-time unexpected error: {e}")

    def _parse_openai_result(self, data: Dict[str, Any]) -> TranscriptionResult:
        """Parse OpenAI Whisper response into TranscriptionResult"""
        segments = []

        if "segments" in data:
            for seg_data in data["segments"]:
                words = []
                if "words" in seg_data:
                    words = [
                        {
                            "word": word["word"],
                            "start": word["start"],
                            "end": word["end"],
                            "probability": 1.0,  # OpenAI doesn't provide word-level confidence
                        }
                        for word in seg_data["words"]
                    ]

                segment = TranscriptionSegment(
                    id=str(uuid.uuid4()),
                    start_time=seg_data["start"],
                    end_time=seg_data["end"],
                    text=seg_data["text"],
                    words=words,
                    no_speech_prob=seg_data.get("no_speech_prob", 0.0),
                    avg_logprob=seg_data.get("avg_logprob", 0.0),
                    compression_ratio=seg_data.get("compression_ratio", 1.0),
                    temperature=seg_data.get("temperature", 0.0),
                    seek=seg_data.get("seek", 0),
                    tokens=seg_data.get("tokens", []),
                )

                segments.append(segment)

        # Calculate metrics
        duration = data.get("duration", 0.0) * 1000  # Convert to ms

        metrics = TranscriptionMetrics(
            processing_time_ms=0.0,  # Not provided by OpenAI
            audio_duration_ms=duration,
            real_time_factor=0.0,
            model_loading_time_ms=0.0,
            inference_time_ms=0.0,
            post_processing_time_ms=0.0,
            memory_used_mb=0.0,
            gpu_memory_used_mb=0.0,
            words_per_second=(
                len(data.get("text", "").split()) / (duration / 1000)
                if duration > 0
                else 0
            ),
            confidence_score=0.8,  # OpenAI doesn't provide overall confidence
            no_speech_probability=0.0,
            compression_ratio=1.0,
            temperature_used=0.0,
        )

        return TranscriptionResult(
            session_id="",
            audio_chunk_id="",
            segments=segments,
            language=data.get("language", "en"),
            language_probability=1.0,
            full_text=data.get("text", ""),
            metrics=metrics,
            config=TranscriptionConfig(),
            timestamp=datetime.utcnow(),
            processing_status="completed",
        )


class CloudTranscriptionService:
    """Main service managing multiple transcription providers"""

    def __init__(self):
        self.providers: Dict[TranscriptionProvider, BaseTranscriptionProvider] = {}
        self.provider_configs: Dict[TranscriptionProvider, ProviderConfig] = {}
        self.active_jobs: Dict[str, TranscriptionJob] = {}
        self.completed_jobs: List[TranscriptionJob] = []
        self.cost_tracking: Dict[TranscriptionProvider, float] = {}

        # Load configurations
        self._load_provider_configs()
        self._initialize_providers()

    def _load_provider_configs(self):
        """Load provider configurations from environment or config file"""
        import os

        # AssemblyAI configuration
        if os.getenv("ASSEMBLYAI_API_KEY"):
            self.provider_configs[TranscriptionProvider.ASSEMBLYAI] = ProviderConfig(
                provider=TranscriptionProvider.ASSEMBLYAI,
                api_key=os.getenv("ASSEMBLYAI_API_KEY"),
                real_time_capable=True,
                speaker_diarization=True,
                cost_config=ProviderCostConfig(
                    cost_per_minute=0.00037,  # $0.00037 per minute
                    free_tier_minutes=300,  # 5 hours free per month
                ),
            )

        # OpenAI configuration
        if os.getenv("OPENAI_API_KEY"):
            self.provider_configs[TranscriptionProvider.OPENAI_WHISPER] = (
                ProviderConfig(
                    provider=TranscriptionProvider.OPENAI_WHISPER,
                    api_key=os.getenv("OPENAI_API_KEY"),
                    model_name="whisper-1",
                    real_time_capable=False,
                    cost_config=ProviderCostConfig(
                        cost_per_minute=0.006,  # $0.006 per minute
                        billing_increment=1.0,  # Round up to nearest second
                    ),
                )
            )

        # Local Whisper (free)
        self.provider_configs[TranscriptionProvider.LOCAL_WHISPER] = ProviderConfig(
            provider=TranscriptionProvider.LOCAL_WHISPER,
            api_key="",  # No API key needed
            real_time_capable=True,
            cost_config=ProviderCostConfig(cost_per_minute=0.0),  # Free
        )

    def _initialize_providers(self):
        """Initialize provider instances"""
        for provider_type, config in self.provider_configs.items():
            try:
                if provider_type == TranscriptionProvider.ASSEMBLYAI:
                    self.providers[provider_type] = AssemblyAIProvider(config)
                elif provider_type == TranscriptionProvider.OPENAI_WHISPER:
                    self.providers[provider_type] = OpenAIWhisperProvider(config)
                # Local Whisper provider would be handled separately

                self.cost_tracking[provider_type] = 0.0
                logger.info(f"Initialized {provider_type.value} provider")

            except (ImportError, ModuleNotFoundError) as e:
                logger.error(f"Missing dependencies for {provider_type.value}: {e}")
            except (KeyError, ValueError) as e:
                logger.error(f"Configuration error for {provider_type.value}: {e}")
            except Exception as e:
                logger.error(
                    f"Unexpected error initializing {provider_type.value}: {e}"
                )

    async def transcribe_with_fallback(
        self,
        session_id: str,
        audio_chunk_id: str,
        audio_data: bytes,
        audio_duration: float,
        preferred_providers: Optional[List[TranscriptionProvider]] = None,
        comparison_mode: bool = False,
    ) -> TranscriptionJob:
        """Transcribe audio with automatic fallback between providers"""

        job = TranscriptionJob(
            id=str(uuid.uuid4()),
            session_id=session_id,
            audio_chunk_id=audio_chunk_id,
            audio_data=audio_data,
            audio_duration=audio_duration,
            created_at=datetime.utcnow(),
            preferred_providers=preferred_providers or list(self.providers.keys()),
            comparison_mode=comparison_mode,
        )

        self.active_jobs[job.id] = job

        if comparison_mode:
            # In comparison mode, try all available providers
            return await self._transcribe_comparison_mode(job)
        else:
            # Normal mode with fallback
            return await self._transcribe_with_fallback(job)

    async def _transcribe_with_fallback(
        self, job: TranscriptionJob
    ) -> TranscriptionJob:
        """Execute transcription with fallback logic"""

        for provider_type in job.preferred_providers:
            if provider_type not in self.providers:
                continue

            provider = self.providers[provider_type]

            # Check if provider is available
            if not await provider.health_check():
                logger.warning(
                    f"Provider {provider_type.value} is not available, skipping"
                )
                continue

            # Check rate limits
            if not provider.check_rate_limit():
                logger.warning(f"Provider {provider_type.value} rate limited, skipping")
                continue

            # Create attempt
            attempt = TranscriptionAttempt(
                id=str(uuid.uuid4()),
                provider=provider_type,
                start_time=datetime.utcnow(),
            )

            try:
                # Calculate cost
                cost = provider.calculate_cost(job.audio_duration)
                attempt.cost = cost

                # Perform transcription
                start_time = time.time()
                result = await provider.transcribe_audio(job.audio_data, "wav")
                processing_time = time.time() - start_time

                # Update attempt with success
                attempt.end_time = datetime.utcnow()
                attempt.success = True
                attempt.audio_duration = job.audio_duration
                attempt.processing_time = processing_time
                attempt.confidence_score = result.metrics.confidence_score
                attempt.result = result

                # Update provider usage
                provider.update_usage(job.audio_duration, cost)
                self.cost_tracking[provider_type] += cost

                # Complete job
                job.attempts.append(attempt)
                job.final_result = result
                job.total_cost = cost
                job.completed_at = datetime.utcnow()

                logger.info(
                    f"Transcription successful with {provider_type.value}, cost: ${cost:.4f}"
                )
                return job

            except aiohttp.client_exceptions.ClientError as e:
                # Handle HTTP client errors
                attempt.end_time = datetime.utcnow()
                attempt.success = False
                attempt.error_message = f"HTTP client error: {str(e)}"
                job.attempts.append(attempt)

                provider.error_count += 1
                logger.error(f"HTTP client error with {provider_type.value}: {e}")
                continue

            except websockets.exceptions.WebSocketException as e:
                # Handle WebSocket errors
                attempt.end_time = datetime.utcnow()
                attempt.success = False
                attempt.error_message = f"WebSocket error: {str(e)}"
                job.attempts.append(attempt)

                provider.error_count += 1
                logger.error(f"WebSocket error with {provider_type.value}: {e}")
                continue

            except asyncio.TimeoutError as e:
                # Handle timeout errors
                attempt.end_time = datetime.utcnow()
                attempt.success = False
                attempt.error_message = f"Request timeout: {str(e)}"
                job.attempts.append(attempt)

                provider.error_count += 1
                logger.error(f"Timeout error with {provider_type.value}: {e}")
                continue

            except (ssl.SSLError, socket.error, ConnectionError) as e:
                # Handle connection errors
                attempt.end_time = datetime.utcnow()
                attempt.success = False
                attempt.error_message = f"Connection error: {str(e)}"
                job.attempts.append(attempt)

                provider.error_count += 1
                logger.error(f"Connection error with {provider_type.value}: {e}")
                continue

            except Exception as e:
                # Handle unexpected errors
                attempt.end_time = datetime.utcnow()
                attempt.success = False
                attempt.error_message = f"Unexpected error: {str(e)}"
                job.attempts.append(attempt)

                provider.error_count += 1
                logger.error(
                    f"Unexpected transcription error with {provider_type.value}: {e}"
                )
                continue

        # All providers failed
        job.completed_at = datetime.utcnow()
        logger.error(f"All transcription providers failed for job {job.id}")

        return job

    async def _transcribe_comparison_mode(
        self, job: TranscriptionJob
    ) -> TranscriptionJob:
        """Execute transcription with all providers for comparison"""

        tasks = []

        for provider_type in job.preferred_providers:
            if provider_type not in self.providers:
                continue

            provider = self.providers[provider_type]

            # Check availability
            if not await provider.health_check() or not provider.check_rate_limit():
                continue

            # Create task for this provider
            task = asyncio.create_task(
                self._transcribe_single_provider(job, provider_type, provider)
            )
            tasks.append(task)

        # Wait for all tasks to complete
        if tasks:
            results = await asyncio.gather(*tasks, return_exceptions=True)

            # Process results
            successful_attempts = [
                r for r in results if isinstance(r, TranscriptionAttempt) and r.success
            ]

            if successful_attempts:
                # Choose best result (highest confidence or preferred provider)
                best_attempt = max(
                    successful_attempts, key=lambda a: a.confidence_score
                )
                job.final_result = best_attempt.result

            job.total_cost = sum(attempt.cost for attempt in job.attempts)

        job.completed_at = datetime.utcnow()
        return job

    async def _transcribe_single_provider(
        self,
        job: TranscriptionJob,
        provider_type: TranscriptionProvider,
        provider: BaseTranscriptionProvider,
    ) -> TranscriptionAttempt:
        """Transcribe with a single provider (for comparison mode)"""

        attempt = TranscriptionAttempt(
            id=str(uuid.uuid4()), provider=provider_type, start_time=datetime.utcnow()
        )

        try:
            cost = provider.calculate_cost(job.audio_duration)
            attempt.cost = cost

            start_time = time.time()
            result = await provider.transcribe_audio(job.audio_data, "wav")
            processing_time = time.time() - start_time

            attempt.end_time = datetime.utcnow()
            attempt.success = True
            attempt.audio_duration = job.audio_duration
            attempt.processing_time = processing_time
            attempt.confidence_score = result.metrics.confidence_score
            attempt.result = result

            provider.update_usage(job.audio_duration, cost)
            self.cost_tracking[provider_type] += cost

        except aiohttp.client_exceptions.ClientError as e:
            attempt.end_time = datetime.utcnow()
            attempt.success = False
            attempt.error_message = f"HTTP client error: {str(e)}"
            provider.error_count += 1
            logger.error(
                f"HTTP client error in comparison mode with {provider_type.value}: {e}"
            )

        except websockets.exceptions.WebSocketException as e:
            attempt.end_time = datetime.utcnow()
            attempt.success = False
            attempt.error_message = f"WebSocket error: {str(e)}"
            provider.error_count += 1
            logger.error(
                f"WebSocket error in comparison mode with {provider_type.value}: {e}"
            )

        except asyncio.TimeoutError as e:
            attempt.end_time = datetime.utcnow()
            attempt.success = False
            attempt.error_message = f"Request timeout: {str(e)}"
            provider.error_count += 1
            logger.error(
                f"Timeout error in comparison mode with {provider_type.value}: {e}"
            )

        except (ssl.SSLError, socket.error, ConnectionError) as e:
            attempt.end_time = datetime.utcnow()
            attempt.success = False
            attempt.error_message = f"Connection error: {str(e)}"
            provider.error_count += 1
            logger.error(
                f"Connection error in comparison mode with {provider_type.value}: {e}"
            )

        except Exception as e:
            attempt.end_time = datetime.utcnow()
            attempt.success = False
            attempt.error_message = f"Unexpected error: {str(e)}"
            provider.error_count += 1
            logger.error(
                f"Unexpected error in comparison mode with {provider_type.value}: {e}"
            )

        job.attempts.append(attempt)
        return attempt

    def get_provider_stats(self) -> Dict[str, Any]:
        """Get statistics for all providers"""
        stats = {}

        for provider_type, provider in self.providers.items():
            stats[provider_type.value] = {
                "status": provider.status.value,
                "total_requests": provider.request_count,
                "error_count": provider.error_count,
                "total_cost": provider.total_cost,
                "total_audio_minutes": provider.total_audio_minutes,
                "last_request": provider.last_request_time,
                "config": {
                    "real_time_capable": provider.config.real_time_capable,
                    "speaker_diarization": provider.config.speaker_diarization,
                    "max_audio_length": provider.config.max_audio_length,
                },
            }

        return stats

    def get_cost_summary(self) -> Dict[str, Any]:
        """Get cost summary across all providers"""
        total_cost = sum(self.cost_tracking.values())

        breakdown = {}
        for provider_type, cost in self.cost_tracking.items():
            breakdown[provider_type.value] = {
                "total_cost": cost,
                "percentage": (cost / total_cost * 100) if total_cost > 0 else 0,
            }

        return {
            "total_cost": total_cost,
            "currency": "USD",
            "breakdown": breakdown,
            "period": "lifetime",  # Could be enhanced to support different periods
        }

    async def get_job_status(self, job_id: str) -> Optional[TranscriptionJob]:
        """Get status of a transcription job"""
        if job_id in self.active_jobs:
            return self.active_jobs[job_id]

        # Check completed jobs
        for job in self.completed_jobs:
            if job.id == job_id:
                return job

        return None


# Global service instance
cloud_transcription_service = CloudTranscriptionService()

# Export main components
__all__ = [
    "cloud_transcription_service",
    "CloudTranscriptionService",
    "TranscriptionProvider",
    "ProviderConfig",
    "TranscriptionJob",
    "TranscriptionAttempt",
]
