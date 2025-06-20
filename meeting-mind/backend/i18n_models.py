# Internationalization Database Models
# Extended models for multi-language support, translation, and cultural context

from sqlalchemy import (
    Column, Integer, String, Text, DateTime, Boolean, Float, ForeignKey, 
    Enum, Index, UniqueConstraint, CheckConstraint
)
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from sqlalchemy.dialects.postgresql import UUID, JSONB
from enum import Enum as PyEnum
import uuid
from datetime import datetime
from typing import List, Optional, Dict, Any

from models import Base

# Enums for internationalization
class LanguageCode(PyEnum):
    """
    ISO 639-1 language codes for supported languages
    
    Design Decision: Using standard ISO codes for interoperability
    with external translation services and language models.
    """
    # Major Languages
    EN = "en"  # English
    ES = "es"  # Spanish
    FR = "fr"  # French
    DE = "de"  # German
    IT = "it"  # Italian
    PT = "pt"  # Portuguese
    RU = "ru"  # Russian
    ZH = "zh"  # Chinese (Mandarin)
    JA = "ja"  # Japanese
    KO = "ko"  # Korean
    AR = "ar"  # Arabic
    HI = "hi"  # Hindi
    BN = "bn"  # Bengali
    TR = "tr"  # Turkish
    NL = "nl"  # Dutch
    SV = "sv"  # Swedish
    NO = "no"  # Norwegian
    DA = "da"  # Danish
    FI = "fi"  # Finnish
    PL = "pl"  # Polish
    CS = "cs"  # Czech
    HU = "hu"  # Hungarian
    RO = "ro"  # Romanian
    BG = "bg"  # Bulgarian
    HR = "hr"  # Croatian
    SK = "sk"  # Slovak
    SL = "sl"  # Slovenian
    ET = "et"  # Estonian
    LV = "lv"  # Latvian
    LT = "lt"  # Lithuanian
    MT = "mt"  # Maltese
    GA = "ga"  # Irish
    CY = "cy"  # Welsh
    
class TranslationProvider(PyEnum):
    """
    Supported translation service providers
    
    Design Decision: Multiple providers for redundancy and quality comparison.
    Each provider has different strengths for various language pairs.
    """
    GOOGLE_TRANSLATE = "google_translate"
    AZURE_TRANSLATOR = "azure_translator"
    AWS_TRANSLATE = "aws_translate"
    DEEPL = "deepl"
    OPENAI_GPT = "openai_gpt"
    ANTHROPIC_CLAUDE = "anthropic_claude"
    INTERNAL_MODEL = "internal_model"

class TranslationQuality(PyEnum):
    """
    Translation quality levels for different use cases
    
    Design Decision: Tiered quality system allows for cost-performance tradeoffs
    based on meeting importance and budget constraints.
    """
    DRAFT = "draft"          # Fast, lower quality for real-time
    STANDARD = "standard"    # Balanced quality and speed
    PROFESSIONAL = "professional"  # High quality for important meetings
    PREMIUM = "premium"      # Highest quality with human review

class CulturalContext(PyEnum):
    """
    Cultural context categories for localization
    
    Design Decision: Structured cultural awareness enables appropriate
    communication style adaptation across different business cultures.
    """
    BUSINESS_FORMAL = "business_formal"
    BUSINESS_CASUAL = "business_casual"
    ACADEMIC = "academic"
    GOVERNMENT = "government"
    HEALTHCARE = "healthcare"
    LEGAL = "legal"
    TECHNOLOGY = "technology"
    CREATIVE = "creative"
    INTERNATIONAL = "international"

class Language(Base):
    """
    Language configuration and metadata
    
    Design Decision: Centralized language configuration enables
    consistent handling of language-specific features and capabilities.
    
    Key Features:
    - Language metadata and capabilities
    - Regional variants and dialects
    - Script and writing direction support
    - Cultural context associations
    """
    __tablename__ = 'languages'
    
    # Primary key
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    
    # Language identification
    code = Column(Enum(LanguageCode), unique=True, nullable=False, index=True)
    name = Column(String(100), nullable=False)
    native_name = Column(String(100), nullable=False)
    region = Column(String(100))  # e.g., "US", "UK", "BR", "MX"
    
    # Language characteristics
    script = Column(String(50))  # e.g., "Latin", "Cyrillic", "Arabic", "Han"
    direction = Column(String(10), default='ltr')  # ltr, rtl, ttb
    family = Column(String(50))  # Language family classification
    
    # Capabilities
    transcription_supported = Column(Boolean, default=True)
    translation_supported = Column(Boolean, default=True)
    tts_supported = Column(Boolean, default=False)  # Text-to-speech
    sentiment_analysis_supported = Column(Boolean, default=False)
    
    # Quality metrics
    transcription_accuracy = Column(Float, default=0.0)  # 0-1 scale
    translation_quality = Column(Float, default=0.0)     # 0-1 scale
    
    # Cultural context
    primary_cultural_context = Column(Enum(CulturalContext))
    cultural_notes = Column(JSONB)  # Cultural considerations
    
    # Provider preferences
    preferred_transcription_provider = Column(String(50))
    preferred_translation_provider = Column(Enum(TranslationProvider))
    
    # Status and metadata
    is_active = Column(Boolean, default=True, index=True)
    usage_count = Column(Integer, default=0)
    
    # Audit fields
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    # Relationships
    transcripts = relationship("MultiLanguageTranscript", back_populates="language")
    translations = relationship("Translation", foreign_keys="Translation.source_language_id", back_populates="source_language")
    target_translations = relationship("Translation", foreign_keys="Translation.target_language_id", back_populates="target_language")
    
    # Indexes
    __table_args__ = (
        Index('idx_languages_code_active', 'code', 'is_active'),
        Index('idx_languages_script_direction', 'script', 'direction'),
    )

class MultiLanguageTranscript(Base):
    """
    Enhanced transcript with multi-language support
    
    Design Decision: Extends existing transcript model with language detection,
    confidence scoring, and support for mixed-language content.
    
    Key Features:
    - Automatic language detection
    - Confidence scoring for accuracy
    - Code-switching detection
    - Cultural context annotations
    """
    __tablename__ = 'multilanguage_transcripts'
    
    # Primary key
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    
    # Foreign keys
    meeting_id = Column(UUID(as_uuid=True), ForeignKey('meetings.id', ondelete='CASCADE'), nullable=False)
    participant_id = Column(UUID(as_uuid=True), ForeignKey('participants.id', ondelete='SET NULL'))
    language_id = Column(UUID(as_uuid=True), ForeignKey('languages.id'), nullable=False)
    
    # Transcript content
    original_text = Column(Text, nullable=False)
    normalized_text = Column(Text)  # Cleaned and normalized version
    phonetic_text = Column(Text)    # Phonetic representation for pronunciation
    
    # Language detection
    detected_language = Column(Enum(LanguageCode), nullable=False)
    detection_confidence = Column(Float, default=0.0)  # 0-1 scale
    alternative_languages = Column(JSONB)  # Alternative language candidates
    
    # Code-switching detection
    is_code_switched = Column(Boolean, default=False)
    language_segments = Column(JSONB)  # Segments with different languages
    
    # Timing and positioning
    start_time_seconds = Column(Float, nullable=False)
    end_time_seconds = Column(Float, nullable=False)
    duration_seconds = Column(Float)
    
    # Quality metrics
    transcription_confidence = Column(Float, default=0.0)
    audio_quality_score = Column(Float, default=0.0)
    speaker_clarity_score = Column(Float, default=0.0)
    
    # Cultural and linguistic annotations
    cultural_context = Column(Enum(CulturalContext))
    formality_level = Column(String(20))  # formal, informal, colloquial
    regional_dialect = Column(String(50))
    linguistic_features = Column(JSONB)  # Grammar, syntax, vocabulary notes
    
    # Processing metadata
    transcription_provider = Column(String(50))
    model_version = Column(String(50))
    processing_time_ms = Column(Integer)
    
    # Audit fields
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    # Relationships
    meeting = relationship("Meeting")
    participant = relationship("Participant")
    language = relationship("Language", back_populates="transcripts")
    translations = relationship("Translation", back_populates="source_transcript")
    
    # Indexes
    __table_args__ = (
        Index('idx_ml_transcripts_meeting_lang', 'meeting_id', 'language_id'),
        Index('idx_ml_transcripts_time_range', 'meeting_id', 'start_time_seconds', 'end_time_seconds'),
        Index('idx_ml_transcripts_detection_confidence', 'detected_language', 'detection_confidence'),
    )

class Translation(Base):
    """
    Translation records with quality tracking and versioning
    
    Design Decision: Comprehensive translation tracking enables quality
    improvement, consistency management, and translation memory building.
    
    Key Features:
    - Multi-provider translation support
    - Quality scoring and feedback
    - Translation memory integration
    - Cultural adaptation tracking
    """
    __tablename__ = 'translations'
    
    # Primary key
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    
    # Foreign keys
    source_transcript_id = Column(UUID(as_uuid=True), ForeignKey('multilanguage_transcripts.id', ondelete='CASCADE'))
    source_language_id = Column(UUID(as_uuid=True), ForeignKey('languages.id'), nullable=False)
    target_language_id = Column(UUID(as_uuid=True), ForeignKey('languages.id'), nullable=False)
    translation_memory_id = Column(UUID(as_uuid=True), ForeignKey('translation_memory.id'))
    
    # Content
    source_text = Column(Text, nullable=False)
    translated_text = Column(Text, nullable=False)
    alternative_translations = Column(JSONB)  # Alternative translation options
    
    # Translation metadata
    provider = Column(Enum(TranslationProvider), nullable=False)
    quality_level = Column(Enum(TranslationQuality), nullable=False)
    model_version = Column(String(50))
    
    # Quality metrics
    confidence_score = Column(Float, default=0.0)  # Provider confidence
    quality_score = Column(Float, default=0.0)     # Our quality assessment
    fluency_score = Column(Float, default=0.0)     # How natural it sounds
    accuracy_score = Column(Float, default=0.0)    # How accurate it is
    
    # Cultural adaptation
    cultural_adaptation_applied = Column(Boolean, default=False)
    cultural_changes = Column(JSONB)  # What cultural changes were made
    formality_adjustment = Column(String(50))  # Formality level changes
    
    # Usage and feedback
    usage_count = Column(Integer, default=0)
    user_feedback_score = Column(Float)  # User-provided quality rating
    feedback_comments = Column(Text)
    
    # Performance metrics
    translation_time_ms = Column(Integer)
    cache_hit = Column(Boolean, default=False)
    cost = Column(Float)  # Translation cost in credits/currency
    
    # Status and versioning
    is_approved = Column(Boolean, default=False)
    is_human_reviewed = Column(Boolean, default=False)
    version = Column(Integer, default=1)
    parent_translation_id = Column(UUID(as_uuid=True), ForeignKey('translations.id'))
    
    # Audit fields
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    reviewed_at = Column(DateTime(timezone=True))
    reviewed_by = Column(String(255))
    
    # Relationships
    source_transcript = relationship("MultiLanguageTranscript", back_populates="translations")
    source_language = relationship("Language", foreign_keys=[source_language_id], back_populates="translations")
    target_language = relationship("Language", foreign_keys=[target_language_id], back_populates="target_translations")
    translation_memory = relationship("TranslationMemory", back_populates="translations")
    parent_translation = relationship("Translation", remote_side=[id])
    child_translations = relationship("Translation", back_populates="parent_translation")
    
    # Constraints and indexes
    __table_args__ = (
        CheckConstraint('source_language_id != target_language_id', name='check_different_languages'),
        Index('idx_translations_languages', 'source_language_id', 'target_language_id'),
        Index('idx_translations_quality', 'quality_level', 'quality_score'),
        Index('idx_translations_provider_confidence', 'provider', 'confidence_score'),
    )

class TranslationMemory(Base):
    """
    Translation memory system for consistency and reuse
    
    Design Decision: Translation memory improves consistency and reduces
    costs by reusing high-quality translations for repeated content.
    
    Key Features:
    - Fuzzy matching for similar content
    - Context-aware suggestions
    - Quality-based ranking
    - Domain-specific memories
    """
    __tablename__ = 'translation_memory'
    
    # Primary key
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    
    # Content identification
    source_hash = Column(String(64), nullable=False, index=True)  # Hash of source text
    source_text = Column(Text, nullable=False)
    target_text = Column(Text, nullable=False)
    
    # Language information
    source_language = Column(Enum(LanguageCode), nullable=False)
    target_language = Column(Enum(LanguageCode), nullable=False)
    
    # Context and domain
    domain = Column(String(100))  # business, technical, legal, etc.
    context_tags = Column(JSONB)  # Contextual metadata
    meeting_type = Column(String(50))  # standup, review, etc.
    
    # Quality and usage
    quality_score = Column(Float, default=0.0)
    usage_frequency = Column(Integer, default=0)
    last_used = Column(DateTime(timezone=True))
    
    # Matching information
    fuzzy_threshold = Column(Float, default=0.8)  # Minimum similarity for matches
    exact_matches = Column(Integer, default=0)
    fuzzy_matches = Column(Integer, default=0)
    
    # Validation and approval
    is_validated = Column(Boolean, default=False)
    validated_by = Column(String(255))
    validation_notes = Column(Text)
    
    # Organization and scope
    organization_id = Column(String(255), index=True)
    is_global = Column(Boolean, default=False)  # Available to all organizations
    created_by = Column(String(255), nullable=False)
    
    # Audit fields
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    # Relationships
    translations = relationship("Translation", back_populates="translation_memory")
    
    # Constraints and indexes
    __table_args__ = (
        UniqueConstraint('source_hash', 'source_language', 'target_language', 'organization_id', 
                        name='uq_tm_source_target_org'),
        Index('idx_tm_languages_domain', 'source_language', 'target_language', 'domain'),
        Index('idx_tm_quality_usage', 'quality_score', 'usage_frequency'),
        Index('idx_tm_organization_global', 'organization_id', 'is_global'),
    )

class LanguageDetectionLog(Base):
    """
    Language detection algorithm performance tracking
    
    Design Decision: Tracking detection accuracy enables algorithm
    improvement and provides insights into multi-language meeting patterns.
    """
    __tablename__ = 'language_detection_logs'
    
    # Primary key
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    
    # Foreign key
    transcript_id = Column(UUID(as_uuid=True), ForeignKey('multilanguage_transcripts.id', ondelete='CASCADE'))
    
    # Detection results
    detected_language = Column(Enum(LanguageCode), nullable=False)
    confidence_score = Column(Float, nullable=False)
    alternative_candidates = Column(JSONB)  # Other possible languages with scores
    
    # Algorithm information
    detection_algorithm = Column(String(50), nullable=False)
    model_version = Column(String(50))
    processing_time_ms = Column(Integer)
    
    # Validation
    human_verified = Column(Boolean, default=False)
    correct_language = Column(Enum(LanguageCode))  # If human correction was made
    correction_reason = Column(String(200))
    
    # Context
    text_length = Column(Integer)
    audio_duration_seconds = Column(Float)
    speaker_accent = Column(String(50))
    
    # Audit fields
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    
    # Relationships
    transcript = relationship("MultiLanguageTranscript")
    
    # Indexes
    __table_args__ = (
        Index('idx_detection_log_algorithm_confidence', 'detection_algorithm', 'confidence_score'),
        Index('idx_detection_log_language_verified', 'detected_language', 'human_verified'),
    )

class CulturalContextRule(Base):
    """
    Cultural context rules for appropriate communication adaptation
    
    Design Decision: Codified cultural rules enable automatic adaptation
    of communication style based on participant backgrounds and meeting context.
    """
    __tablename__ = 'cultural_context_rules'
    
    # Primary key
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    
    # Rule identification
    name = Column(String(200), nullable=False)
    description = Column(Text)
    category = Column(String(100))  # formality, directness, hierarchy, etc.
    
    # Scope
    source_culture = Column(String(50))  # ISO country code or culture identifier
    target_culture = Column(String(50))
    language_pair = Column(String(10))   # e.g., "en-ja"
    
    # Context conditions
    meeting_type = Column(String(50))
    participant_roles = Column(JSONB)    # Applicable participant roles
    business_context = Column(Enum(CulturalContext))
    
    # Transformation rules
    formality_adjustment = Column(String(50))  # increase, decrease, maintain
    directness_level = Column(String(50))      # direct, indirect, very_indirect
    hierarchy_awareness = Column(Boolean, default=False)
    
    # Rule logic
    trigger_patterns = Column(JSONB)     # Text patterns that trigger this rule
    replacement_patterns = Column(JSONB) # How to transform the text
    example_transformations = Column(JSONB)  # Before/after examples
    
    # Quality and usage
    effectiveness_score = Column(Float, default=0.0)
    usage_count = Column(Integer, default=0)
    user_feedback = Column(Float)  # User satisfaction with rule application
    
    # Status
    is_active = Column(Boolean, default=True)
    confidence_threshold = Column(Float, default=0.7)  # When to apply this rule
    
    # Audit fields
    created_by = Column(String(255), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    # Indexes
    __table_args__ = (
        Index('idx_cultural_rules_cultures', 'source_culture', 'target_culture'),
        Index('idx_cultural_rules_language_context', 'language_pair', 'business_context'),
        Index('idx_cultural_rules_active_effective', 'is_active', 'effectiveness_score'),
    )

class TranslationQualityMetric(Base):
    """
    Translation quality metrics and benchmarking
    
    Design Decision: Comprehensive quality tracking enables provider
    comparison, quality improvement, and cost optimization.
    """
    __tablename__ = 'translation_quality_metrics'
    
    # Primary key
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    
    # Foreign key
    translation_id = Column(UUID(as_uuid=True), ForeignKey('translations.id', ondelete='CASCADE'), nullable=False)
    
    # Metric types
    metric_type = Column(String(50), nullable=False)  # bleu, rouge, bertscore, human, etc.
    metric_value = Column(Float, nullable=False)
    metric_details = Column(JSONB)  # Detailed breakdown of the metric
    
    # Comparison baseline
    baseline_type = Column(String(50))  # reference_human, other_provider, previous_version
    baseline_value = Column(Float)
    improvement_score = Column(Float)  # Relative improvement over baseline
    
    # Evaluation context
    evaluator_type = Column(String(50))  # automatic, human_expert, crowd_sourced
    evaluator_id = Column(String(255))
    evaluation_criteria = Column(JSONB)  # What criteria were used
    
    # Quality dimensions
    fluency_score = Column(Float)      # How natural/fluent
    adequacy_score = Column(Float)     # How complete/accurate
    cultural_score = Column(Float)     # How culturally appropriate
    terminology_score = Column(Float)  # How consistent with terminology
    
    # Audit fields
    evaluated_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    
    # Relationships
    translation = relationship("Translation")
    
    # Indexes
    __table_args__ = (
        Index('idx_quality_metrics_translation_type', 'translation_id', 'metric_type'),
        Index('idx_quality_metrics_type_value', 'metric_type', 'metric_value'),
    )

# Additional indexes for performance optimization
Index('idx_languages_transcription_capability', Language.transcription_supported, Language.transcription_accuracy)
Index('idx_languages_translation_capability', Language.translation_supported, Language.translation_quality)
Index('idx_ml_transcripts_code_switching', MultiLanguageTranscript.is_code_switched, MultiLanguageTranscript.detection_confidence)
Index('idx_translations_real_time', Translation.provider, Translation.translation_time_ms)
Index('idx_tm_exact_fuzzy_ratio', TranslationMemory.exact_matches, TranslationMemory.fuzzy_matches)