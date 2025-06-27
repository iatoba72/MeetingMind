# Speaker Detection and Identification Service
# Implements VAD, speaker diarization, and speaker identification

import asyncio
import logging
import numpy as np
import webrtcvad
import wave
import io
import uuid
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple, Any, Union
from dataclasses import dataclass, asdict, field
from enum import Enum
import json
import pickle
import tempfile
from pathlib import Path
import librosa
import soundfile as sf
from scipy import signal
from scipy.spatial.distance import cosine
from sklearn.cluster import AgglomerativeClustering
from sklearn.metrics.pairwise import cosine_similarity
import matplotlib.pyplot as plt
import seaborn as sns

# Audio processing
import torch
import torchaudio
from resemblyzer import VoiceEncoder, preprocess_wav
from pyannote.audio import Pipeline
from pyannote.core import Segment, Annotation

# Database
from sqlalchemy.orm import Session
from database import get_db
from models import Base
from sqlalchemy import Column, String, Float, Integer, DateTime, Text, Boolean, LargeBinary, ForeignKey, Index
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

logger = logging.getLogger(__name__)

class VADMode(Enum):
    """VAD aggressiveness levels"""
    QUALITY = 0      # Least aggressive, best quality
    LOW_BITRATE = 1  # Moderately aggressive
    AGGRESSIVE = 2   # More aggressive  
    VERY_AGGRESSIVE = 3  # Most aggressive

class SpeakerRole(Enum):
    """Speaker roles in meetings"""
    HOST = "host"
    PRESENTER = "presenter"
    PARTICIPANT = "participant"
    GUEST = "guest"
    UNKNOWN = "unknown"

@dataclass
class VoiceActivitySegment:
    """Voice activity detection result"""
    start_time: float
    end_time: float
    duration: float
    confidence: float
    is_speech: bool
    audio_level: float

@dataclass
class SpeakerEmbedding:
    """Speaker voice embedding"""
    speaker_id: str
    embedding: np.ndarray
    confidence: float
    segment_count: int
    created_at: datetime
    updated_at: datetime

@dataclass
class SpeakerSegment:
    """Speaker diarization segment"""
    speaker_id: str
    start_time: float
    end_time: float
    duration: float
    confidence: float
    embedding: Optional[np.ndarray] = None
    audio_features: Optional[Dict[str, float]] = None

@dataclass
class SpeakerSession:
    """Complete speaker analysis for a session"""
    session_id: str
    total_duration: float
    total_speakers: int
    speaker_segments: List[SpeakerSegment]
    speaker_stats: Dict[str, Dict[str, float]]
    timeline: List[Tuple[float, float, str]]  # (start, end, speaker_id)
    confidence_score: float

# Database Models
class SpeakerProfile(Base):
    """Speaker profile for voice identification"""
    __tablename__ = "speaker_profiles"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(255), nullable=False)
    email = Column(String(255), unique=True, index=True)
    role = Column(String(50), default=SpeakerRole.PARTICIPANT.value)
    
    # Voice characteristics
    embedding_data = Column(LargeBinary)  # Serialized voice embedding
    voice_samples_count = Column(Integer, default=0)
    confidence_threshold = Column(Float, default=0.7)
    
    # Metadata
    organization_id = Column(String(255))
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    is_active = Column(Boolean, default=True)
    
    # Relationships
    training_sessions = relationship("SpeakerTrainingSession", back_populates="speaker")
    meeting_participations = relationship("MeetingSpeakerParticipation", back_populates="speaker")
    
    __table_args__ = (
        Index('idx_speaker_email', 'email'),
        Index('idx_speaker_org', 'organization_id'),
    )

class SpeakerTrainingSession(Base):
    """Training session for building speaker voice profiles"""
    __tablename__ = "speaker_training_sessions"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    speaker_id = Column(UUID(as_uuid=True), ForeignKey('speaker_profiles.id'), nullable=False)
    session_name = Column(String(255), nullable=False)
    
    # Training data
    audio_samples_count = Column(Integer, default=0)
    total_duration = Column(Float, default=0.0)
    quality_score = Column(Float, default=0.0)
    
    # Status
    status = Column(String(50), default='in_progress')  # in_progress, completed, failed
    created_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime)
    
    # Relationships
    speaker = relationship("SpeakerProfile", back_populates="training_sessions")
    audio_samples = relationship("TrainingAudioSample", back_populates="training_session")

class TrainingAudioSample(Base):
    """Individual audio sample for speaker training"""
    __tablename__ = "training_audio_samples"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    training_session_id = Column(UUID(as_uuid=True), ForeignKey('speaker_training_sessions.id'), nullable=False)
    
    # Audio metadata
    duration = Column(Float, nullable=False)
    sample_rate = Column(Integer, nullable=False)
    quality_score = Column(Float, default=0.0)
    
    # Embedding data
    embedding_data = Column(LargeBinary)
    
    # Status
    is_valid = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    training_session = relationship("SpeakerTrainingSession", back_populates="audio_samples")

class MeetingSpeakerParticipation(Base):
    """Speaker participation in meetings"""
    __tablename__ = "meeting_speaker_participations"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    meeting_id = Column(UUID(as_uuid=True), nullable=False)  # Foreign key to meetings table
    speaker_id = Column(UUID(as_uuid=True), ForeignKey('speaker_profiles.id'))
    
    # Participation metrics
    total_speaking_time = Column(Float, default=0.0)
    segment_count = Column(Integer, default=0)
    average_confidence = Column(Float, default=0.0)
    
    # Timing
    first_spoke_at = Column(DateTime)
    last_spoke_at = Column(DateTime)
    
    # Status
    identification_method = Column(String(50))  # automatic, manual, partial
    is_confirmed = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    speaker = relationship("SpeakerProfile", back_populates="meeting_participations")

class SpeakerDetectionService:
    """Main service for speaker detection and identification"""
    
    def __init__(self):
        # Initialize VAD
        self.vad = webrtcvad.Vad()
        self.vad_mode = VADMode.QUALITY
        self.vad.set_mode(self.vad_mode.value)
        
        # Initialize voice encoder for embeddings
        try:
            self.voice_encoder = VoiceEncoder()
            logger.info("Voice encoder loaded successfully")
        except Exception as e:
            logger.error(f"Failed to load voice encoder: {e}")
            self.voice_encoder = None
        
        # Speaker database
        self.known_speakers: Dict[str, SpeakerEmbedding] = {}
        self.speaker_threshold = 0.7  # Similarity threshold for speaker identification
        
        # Configuration
        self.sample_rate = 16000
        self.frame_duration_ms = 30  # VAD frame duration
        self.frame_size = int(self.sample_rate * self.frame_duration_ms / 1000)
        
        # Cache for session data
        self.session_cache: Dict[str, SpeakerSession] = {}
        
        # Load known speakers from database
        asyncio.create_task(self._load_known_speakers())
        
    async def _load_known_speakers(self):
        """Load known speakers from database"""
        try:
            # This would be implemented with actual database session
            # For now, initialize empty
            logger.info("Known speakers loaded from database")
        except Exception as e:
            logger.error(f"Failed to load known speakers: {e}")
    
    def set_vad_aggressiveness(self, mode: VADMode):
        """Set VAD aggressiveness level"""
        self.vad_mode = mode
        self.vad.set_mode(mode.value)
        logger.info(f"VAD mode set to {mode.name}")
    
    async def detect_voice_activity(
        self, 
        audio_data: bytes, 
        sample_rate: int = None
    ) -> List[VoiceActivitySegment]:
        """Detect voice activity in audio data"""
        
        if sample_rate is None:
            sample_rate = self.sample_rate
        
        # Resample audio to 16kHz if needed
        if sample_rate != 16000:
            audio_data = await self._resample_audio(audio_data, sample_rate, 16000)
        
        # Convert to numpy array
        audio_array = np.frombuffer(audio_data, dtype=np.int16)
        
        # Pad audio to ensure complete frames
        frame_size = int(16000 * 0.03)  # 30ms frames
        padding = frame_size - (len(audio_array) % frame_size)
        if padding < frame_size:
            audio_array = np.pad(audio_array, (0, padding), mode='constant')
        
        # Process in frames
        segments = []
        current_segment_start = None
        current_segment_is_speech = False
        
        for i in range(0, len(audio_array), frame_size):
            frame = audio_array[i:i+frame_size]
            if len(frame) < frame_size:
                break
            
            # Convert to bytes for VAD
            frame_bytes = frame.astype(np.int16).tobytes()
            
            # Detect speech
            is_speech = self.vad.is_speech(frame_bytes, 16000)
            frame_time = i / 16000.0
            
            # Calculate audio level
            audio_level = np.sqrt(np.mean(frame.astype(np.float32) ** 2))
            
            # State machine for segment detection
            if is_speech and not current_segment_is_speech:
                # Start of speech segment
                current_segment_start = frame_time
                current_segment_is_speech = True
                
            elif not is_speech and current_segment_is_speech:
                # End of speech segment
                if current_segment_start is not None:
                    duration = frame_time - current_segment_start
                    if duration > 0.1:  # Minimum segment duration
                        segments.append(VoiceActivitySegment(
                            start_time=current_segment_start,
                            end_time=frame_time,
                            duration=duration,
                            confidence=0.8,  # VAD confidence (simplified)
                            is_speech=True,
                            audio_level=audio_level
                        ))
                
                current_segment_is_speech = False
                current_segment_start = None
        
        # Handle final segment
        if current_segment_is_speech and current_segment_start is not None:
            final_time = len(audio_array) / 16000.0
            duration = final_time - current_segment_start
            if duration > 0.1:
                segments.append(VoiceActivitySegment(
                    start_time=current_segment_start,
                    end_time=final_time,
                    duration=duration,
                    confidence=0.8,
                    is_speech=True,
                    audio_level=audio_level
                ))
        
        logger.info(f"Detected {len(segments)} voice activity segments")
        return segments
    
    async def extract_speaker_embeddings(
        self, 
        audio_data: bytes, 
        vad_segments: List[VoiceActivitySegment],
        sample_rate: int = None
    ) -> List[Tuple[VoiceActivitySegment, np.ndarray]]:
        """Extract speaker embeddings from voice segments"""
        
        if not self.voice_encoder:
            logger.error("Voice encoder not available")
            return []
        
        if sample_rate is None:
            sample_rate = self.sample_rate
        
        # Convert audio to numpy array
        audio_array = np.frombuffer(audio_data, dtype=np.int16).astype(np.float32) / 32768.0
        
        embeddings = []
        
        for segment in vad_segments:
            try:
                # Extract audio segment
                start_sample = int(segment.start_time * sample_rate)
                end_sample = int(segment.end_time * sample_rate)
                segment_audio = audio_array[start_sample:end_sample]
                
                # Minimum segment length for reliable embedding
                if len(segment_audio) < sample_rate * 0.5:  # 0.5 seconds minimum
                    continue
                
                # Preprocess for resemblyzer
                processed_audio = preprocess_wav(segment_audio, sample_rate)
                
                # Extract embedding
                embedding = self.voice_encoder.embed_utterance(processed_audio)
                embeddings.append((segment, embedding))
                
            except Exception as e:
                logger.error(f"Failed to extract embedding for segment {segment.start_time}-{segment.end_time}: {e}")
                continue
        
        logger.info(f"Extracted {len(embeddings)} speaker embeddings")
        return embeddings
    
    async def perform_speaker_diarization(
        self, 
        embeddings: List[Tuple[VoiceActivitySegment, np.ndarray]],
        min_speakers: int = 1,
        max_speakers: int = 10
    ) -> List[SpeakerSegment]:
        """Perform speaker diarization using clustering"""
        
        if len(embeddings) < 2:
            # Single or no segments
            segments = []
            for i, (segment, embedding) in enumerate(embeddings):
                segments.append(SpeakerSegment(
                    speaker_id=f"speaker_0",
                    start_time=segment.start_time,
                    end_time=segment.end_time,
                    duration=segment.duration,
                    confidence=0.9,
                    embedding=embedding
                ))
            return segments
        
        # Prepare embeddings matrix
        embedding_matrix = np.array([emb for _, emb in embeddings])
        
        # Determine optimal number of speakers using clustering
        best_n_speakers = await self._estimate_speaker_count(
            embedding_matrix, min_speakers, max_speakers
        )
        
        # Perform clustering
        clustering = AgglomerativeClustering(
            n_clusters=best_n_speakers,
            linkage='ward',
            metric='euclidean'
        )
        
        cluster_labels = clustering.fit_predict(embedding_matrix)
        
        # Create speaker segments
        segments = []
        for i, (segment, embedding) in enumerate(embeddings):
            speaker_id = f"speaker_{cluster_labels[i]}"
            
            segments.append(SpeakerSegment(
                speaker_id=speaker_id,
                start_time=segment.start_time,
                end_time=segment.end_time,
                duration=segment.duration,
                confidence=0.8,  # Clustering confidence (simplified)
                embedding=embedding
            ))
        
        # Sort by start time
        segments.sort(key=lambda x: x.start_time)
        
        logger.info(f"Diarization completed: {best_n_speakers} speakers, {len(segments)} segments")
        return segments
    
    async def _estimate_speaker_count(
        self, 
        embeddings: np.ndarray, 
        min_speakers: int, 
        max_speakers: int
    ) -> int:
        """Estimate optimal number of speakers using silhouette analysis"""
        
        if len(embeddings) < min_speakers:
            return 1
        
        max_test_speakers = min(max_speakers, len(embeddings))
        
        if max_test_speakers <= min_speakers:
            return min_speakers
        
        # Simple heuristic: use distance-based estimation
        # Calculate pairwise distances
        distances = []
        for i in range(len(embeddings)):
            for j in range(i + 1, len(embeddings)):
                dist = cosine(embeddings[i], embeddings[j])
                distances.append(dist)
        
        # Estimate based on distance distribution
        distances = np.array(distances)
        threshold = np.percentile(distances, 30)  # 30th percentile
        
        # Count distinct clusters based on threshold
        estimated_speakers = max(min_speakers, min(max_speakers, int(np.sqrt(len(embeddings)))))
        
        return estimated_speakers
    
    async def identify_speakers(
        self, 
        speaker_segments: List[SpeakerSegment]
    ) -> List[SpeakerSegment]:
        """Identify speakers against known speaker database"""
        
        identified_segments = []
        
        for segment in speaker_segments:
            if segment.embedding is None:
                identified_segments.append(segment)
                continue
            
            # Find best match among known speakers
            best_match_id = None
            best_similarity = 0.0
            
            for speaker_id, known_speaker in self.known_speakers.items():
                similarity = 1 - cosine(segment.embedding, known_speaker.embedding)
                
                if similarity > best_similarity and similarity > self.speaker_threshold:
                    best_similarity = similarity
                    best_match_id = speaker_id
            
            # Update segment with identification
            if best_match_id:
                segment.speaker_id = best_match_id
                segment.confidence = best_similarity
            
            identified_segments.append(segment)
        
        logger.info(f"Speaker identification completed")
        return identified_segments
    
    async def process_audio_session(
        self, 
        session_id: str,
        audio_data: bytes,
        sample_rate: int = None
    ) -> SpeakerSession:
        """Complete speaker processing pipeline"""
        
        start_time = datetime.now()
        
        try:
            # Step 1: Voice Activity Detection
            vad_segments = await self.detect_voice_activity(audio_data, sample_rate)
            
            if not vad_segments:
                return SpeakerSession(
                    session_id=session_id,
                    total_duration=0.0,
                    total_speakers=0,
                    speaker_segments=[],
                    speaker_stats={},
                    timeline=[],
                    confidence_score=0.0
                )
            
            # Step 2: Extract Speaker Embeddings
            embeddings = await self.extract_speaker_embeddings(audio_data, vad_segments, sample_rate)
            
            if not embeddings:
                return SpeakerSession(
                    session_id=session_id,
                    total_duration=sum(s.duration for s in vad_segments),
                    total_speakers=0,
                    speaker_segments=[],
                    speaker_stats={},
                    timeline=[],
                    confidence_score=0.0
                )
            
            # Step 3: Speaker Diarization
            speaker_segments = await self.perform_speaker_diarization(embeddings)
            
            # Step 4: Speaker Identification
            identified_segments = await self.identify_speakers(speaker_segments)
            
            # Step 5: Generate Statistics and Timeline
            session = await self._generate_session_analytics(
                session_id, identified_segments
            )
            
            # Cache results
            self.session_cache[session_id] = session
            
            processing_time = (datetime.now() - start_time).total_seconds()
            logger.info(f"Session {session_id} processed in {processing_time:.2f}s")
            
            return session
            
        except Exception as e:
            logger.error(f"Speaker processing failed for session {session_id}: {e}")
            raise
    
    async def _generate_session_analytics(
        self, 
        session_id: str, 
        segments: List[SpeakerSegment]
    ) -> SpeakerSession:
        """Generate comprehensive analytics for speaker session"""
        
        if not segments:
            return SpeakerSession(
                session_id=session_id,
                total_duration=0.0,
                total_speakers=0,
                speaker_segments=[],
                speaker_stats={},
                timeline=[],
                confidence_score=0.0
            )
        
        # Calculate total duration
        total_duration = max(seg.end_time for seg in segments) if segments else 0.0
        
        # Count unique speakers
        unique_speakers = set(seg.speaker_id for seg in segments)
        total_speakers = len(unique_speakers)
        
        # Generate speaker statistics
        speaker_stats = {}
        for speaker_id in unique_speakers:
            speaker_segments = [seg for seg in segments if seg.speaker_id == speaker_id]
            
            total_speaking_time = sum(seg.duration for seg in speaker_segments)
            avg_confidence = np.mean([seg.confidence for seg in speaker_segments])
            segment_count = len(speaker_segments)
            
            speaker_stats[speaker_id] = {
                "total_speaking_time": total_speaking_time,
                "speaking_percentage": (total_speaking_time / total_duration * 100) if total_duration > 0 else 0,
                "segment_count": segment_count,
                "average_confidence": avg_confidence,
                "average_segment_duration": total_speaking_time / segment_count if segment_count > 0 else 0
            }
        
        # Generate timeline
        timeline = [(seg.start_time, seg.end_time, seg.speaker_id) for seg in segments]
        timeline.sort(key=lambda x: x[0])
        
        # Calculate overall confidence
        overall_confidence = np.mean([seg.confidence for seg in segments]) if segments else 0.0
        
        return SpeakerSession(
            session_id=session_id,
            total_duration=total_duration,
            total_speakers=total_speakers,
            speaker_segments=segments,
            speaker_stats=speaker_stats,
            timeline=timeline,
            confidence_score=overall_confidence
        )
    
    async def _resample_audio(
        self, 
        audio_data: bytes, 
        from_rate: int, 
        to_rate: int
    ) -> bytes:
        """Resample audio data"""
        
        # Convert to numpy array
        audio_array = np.frombuffer(audio_data, dtype=np.int16).astype(np.float32)
        
        # Resample using librosa
        resampled = librosa.resample(audio_array, orig_sr=from_rate, target_sr=to_rate)
        
        # Convert back to int16 bytes
        resampled_int16 = (resampled * 32767).astype(np.int16)
        
        return resampled_int16.tobytes()
    
    def get_session_results(self, session_id: str) -> Optional[SpeakerSession]:
        """Get cached session results"""
        return self.session_cache.get(session_id)
    
    def clear_session_cache(self, session_id: str = None):
        """Clear session cache"""
        if session_id:
            self.session_cache.pop(session_id, None)
        else:
            self.session_cache.clear()

class SpeakerTrainingService:
    """Service for training speaker voice profiles"""
    
    def __init__(self, detection_service: SpeakerDetectionService):
        self.detection_service = detection_service
        self.training_sessions: Dict[str, Dict] = {}
        
    async def start_training_session(
        self, 
        speaker_name: str, 
        speaker_email: str = None,
        organization_id: str = None
    ) -> str:
        """Start a new speaker training session"""
        
        session_id = str(uuid.uuid4())
        
        self.training_sessions[session_id] = {
            "session_id": session_id,
            "speaker_name": speaker_name,
            "speaker_email": speaker_email,
            "organization_id": organization_id,
            "audio_samples": [],
            "embeddings": [],
            "started_at": datetime.now(),
            "status": "active",
            "quality_scores": []
        }
        
        logger.info(f"Started training session {session_id} for {speaker_name}")
        return session_id
    
    async def add_training_sample(
        self, 
        session_id: str, 
        audio_data: bytes, 
        sample_rate: int = 16000
    ) -> Dict[str, Any]:
        """Add an audio sample to training session"""
        
        if session_id not in self.training_sessions:
            raise ValueError(f"Training session {session_id} not found")
        
        session = self.training_sessions[session_id]
        
        try:
            # Detect voice activity
            vad_segments = await self.detection_service.detect_voice_activity(audio_data, sample_rate)
            
            if not vad_segments:
                return {
                    "success": False,
                    "error": "No voice activity detected",
                    "quality_score": 0.0
                }
            
            # Extract embeddings
            embeddings = await self.detection_service.extract_speaker_embeddings(
                audio_data, vad_segments, sample_rate
            )
            
            if not embeddings:
                return {
                    "success": False,
                    "error": "Failed to extract voice embedding",
                    "quality_score": 0.0
                }
            
            # Calculate quality score
            total_speech_duration = sum(seg.duration for seg in vad_segments)
            audio_duration = len(audio_data) / (sample_rate * 2)  # 2 bytes per sample
            speech_ratio = total_speech_duration / audio_duration if audio_duration > 0 else 0
            
            # Average audio level
            avg_audio_level = np.mean([seg.audio_level for seg in vad_segments])
            
            quality_score = min(1.0, speech_ratio * 0.7 + min(avg_audio_level / 1000, 0.3))
            
            # Store sample data
            sample_data = {
                "audio_data": audio_data,
                "sample_rate": sample_rate,
                "duration": total_speech_duration,
                "vad_segments": vad_segments,
                "embeddings": [emb for _, emb in embeddings],
                "quality_score": quality_score,
                "added_at": datetime.now()
            }
            
            session["audio_samples"].append(sample_data)
            session["embeddings"].extend([emb for _, emb in embeddings])
            session["quality_scores"].append(quality_score)
            
            return {
                "success": True,
                "sample_count": len(session["audio_samples"]),
                "quality_score": quality_score,
                "total_duration": sum(s["duration"] for s in session["audio_samples"]),
                "average_quality": np.mean(session["quality_scores"])
            }
            
        except Exception as e:
            logger.error(f"Failed to add training sample: {e}")
            return {
                "success": False,
                "error": str(e),
                "quality_score": 0.0
            }
    
    async def complete_training_session(self, session_id: str) -> Dict[str, Any]:
        """Complete training session and create speaker profile"""
        
        if session_id not in self.training_sessions:
            raise ValueError(f"Training session {session_id} not found")
        
        session = self.training_sessions[session_id]
        
        try:
            if len(session["embeddings"]) < 3:
                return {
                    "success": False,
                    "error": "Insufficient training data (minimum 3 voice samples required)",
                    "sample_count": len(session["audio_samples"])
                }
            
            # Calculate average embedding
            embeddings_matrix = np.array(session["embeddings"])
            average_embedding = np.mean(embeddings_matrix, axis=0)
            
            # Calculate consistency score
            similarities = []
            for embedding in embeddings_matrix:
                similarity = 1 - cosine(average_embedding, embedding)
                similarities.append(similarity)
            
            consistency_score = np.mean(similarities)
            
            if consistency_score < 0.6:
                return {
                    "success": False,
                    "error": "Voice samples are not consistent enough",
                    "consistency_score": consistency_score
                }
            
            # Create speaker profile
            speaker_profile = SpeakerEmbedding(
                speaker_id=str(uuid.uuid4()),
                embedding=average_embedding,
                confidence=consistency_score,
                segment_count=len(session["embeddings"]),
                created_at=datetime.now(),
                updated_at=datetime.now()
            )
            
            # Store in known speakers
            self.detection_service.known_speakers[speaker_profile.speaker_id] = speaker_profile
            
            # Update session status
            session["status"] = "completed"
            session["completed_at"] = datetime.now()
            session["speaker_profile"] = speaker_profile
            
            logger.info(f"Training session {session_id} completed successfully")
            
            return {
                "success": True,
                "speaker_id": speaker_profile.speaker_id,
                "consistency_score": consistency_score,
                "sample_count": len(session["audio_samples"]),
                "total_duration": sum(s["duration"] for s in session["audio_samples"]),
                "average_quality": np.mean(session["quality_scores"])
            }
            
        except Exception as e:
            logger.error(f"Failed to complete training session: {e}")
            session["status"] = "failed"
            return {
                "success": False,
                "error": str(e)
            }
    
    def get_training_session_status(self, session_id: str) -> Optional[Dict[str, Any]]:
        """Get training session status"""
        session = self.training_sessions.get(session_id)
        if not session:
            return None
        
        return {
            "session_id": session_id,
            "speaker_name": session["speaker_name"],
            "status": session["status"],
            "sample_count": len(session["audio_samples"]),
            "total_duration": sum(s["duration"] for s in session["audio_samples"]),
            "average_quality": np.mean(session["quality_scores"]) if session["quality_scores"] else 0.0,
            "started_at": session["started_at"].isoformat(),
            "completed_at": session.get("completed_at").isoformat() if session.get("completed_at") else None
        }

# Global service instances
speaker_detection_service = SpeakerDetectionService()
speaker_training_service = SpeakerTrainingService(speaker_detection_service)

# Export main components
__all__ = [
    'speaker_detection_service',
    'speaker_training_service',
    'SpeakerDetectionService',
    'SpeakerTrainingService',
    'VoiceActivitySegment',
    'SpeakerSegment',
    'SpeakerSession',
    'VADMode',
    'SpeakerRole'
]