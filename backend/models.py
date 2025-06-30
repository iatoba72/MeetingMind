# SQLAlchemy Database Models for MeetingMind
# Comprehensive schema design with relationships, indexes, and constraints
# Supports enterprise-grade meeting management with AI insights and analytics

from sqlalchemy import (
    Column,
    Integer,
    String,
    Text,
    DateTime,
    Boolean,
    Float,
    ForeignKey,
    Enum,
    Index,
    UniqueConstraint,
    CheckConstraint,
    Table,
)
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship, validates
from sqlalchemy.sql import func
from sqlalchemy.dialects.postgresql import UUID, JSONB
from enum import Enum as PyEnum
import uuid
from datetime import datetime, timedelta
from typing import List, Optional

# Base class for all models
Base = declarative_base()


# Enums for type safety and data integrity
class MeetingStatus(PyEnum):
    """
    Meeting lifecycle states with clear transitions

    Design Decision: Using enum for type safety and preventing invalid states.
    This ensures data integrity and makes state transitions explicit.
    """

    NOT_STARTED = "not_started"  # Meeting created but not yet started
    ACTIVE = "active"  # Meeting currently in progress
    PAUSED = "paused"  # Meeting temporarily paused
    ENDED = "ended"  # Meeting completed normally
    CANCELLED = "cancelled"  # Meeting cancelled before completion


class ParticipantRole(PyEnum):
    """
    Participant roles with hierarchical permissions

    Design Decision: Explicit roles for access control and meeting management.
    Supports different permission levels and meeting governance.
    """

    HOST = "host"  # Meeting organizer with full control
    CO_HOST = "co_host"  # Secondary host with most permissions
    PRESENTER = "presenter"  # Can share screen and present
    PARTICIPANT = "participant"  # Standard attendee
    OBSERVER = "observer"  # Read-only access


class ParticipantStatus(PyEnum):
    """
    Participant connection and engagement states

    Design Decision: Track participant engagement for analytics and billing.
    Useful for understanding meeting effectiveness and attendance patterns.
    """

    INVITED = "invited"  # Invited but not yet joined
    JOINED = "joined"  # Currently in meeting
    LEFT = "left"  # Left the meeting
    REMOVED = "removed"  # Removed by host
    NO_SHOW = "no_show"  # Invited but never joined


class TranscriptType(PyEnum):
    """
    Different types of transcript content for organization

    Design Decision: Categorize transcript content for better searchability
    and AI processing. Enables targeted analysis and summarization.
    """

    SPEECH = "speech"  # Spoken words transcription
    SYSTEM = "system"  # System messages (join/leave, etc.)
    CHAT = "chat"  # Text chat messages
    ACTION_ITEM = "action_item"  # AI-identified action items
    SUMMARY = "summary"  # Meeting summary content


class InsightType(PyEnum):
    """
    AI-generated insight categories for structured analysis

    Design Decision: Structured insight types enable targeted AI processing
    and make insights more actionable and searchable.
    """

    SUMMARY = "summary"  # Overall meeting summary
    ACTION_ITEMS = "action_items"  # Extracted action items
    DECISIONS = "decisions"  # Key decisions made
    SENTIMENT = "sentiment"  # Sentiment analysis
    TOPICS = "topics"  # Main discussion topics
    PARTICIPANTS_ANALYSIS = "participants_analysis"  # Speaking time, engagement
    FOLLOW_UP = "follow_up"  # Recommended follow-up actions


class RecurrenceType(PyEnum):
    """
    Meeting recurrence patterns for automated scheduling

    Design Decision: Support common recurrence patterns for automated
    meeting creation and template application.
    """

    NONE = "none"  # No recurrence
    DAILY = "daily"  # Daily meetings
    WEEKLY = "weekly"  # Weekly meetings
    MONTHLY = "monthly"  # Monthly meetings
    QUARTERLY = "quarterly"  # Quarterly meetings
    YEARLY = "yearly"  # Yearly meetings
    CUSTOM = "custom"  # Custom pattern


class ActionItemStatus(PyEnum):
    """
    Action item lifecycle states for tracking completion

    Design Decision: Clear status progression for action item management
    and accountability tracking.
    """

    PENDING = "pending"  # Created but not assigned
    ASSIGNED = "assigned"  # Assigned to someone
    IN_PROGRESS = "in_progress"  # Being worked on
    COMPLETED = "completed"  # Finished
    CANCELLED = "cancelled"  # Cancelled/no longer needed
    OVERDUE = "overdue"  # Past due date


class WorkflowState(PyEnum):
    """
    Meeting workflow states for automation and state machine management

    Design Decision: Enable complex workflow automation with clear
    state transitions and triggers.
    """

    TEMPLATE_SELECTED = "template_selected"  # Template chosen
    SCHEDULED = "scheduled"  # Meeting scheduled
    AGENDA_DISTRIBUTED = "agenda_distributed"  # Agenda sent to participants
    REMINDERS_SENT = "reminders_sent"  # Pre-meeting reminders sent
    IN_PROGRESS = "in_progress"  # Meeting active
    RECORDING = "recording"  # Being recorded
    TRANSCRIBING = "transcribing"  # Being transcribed
    ANALYZING = "analyzing"  # AI analysis in progress
    INSIGHTS_GENERATED = "insights_generated"  # Insights ready
    FOLLOW_UP_SENT = "follow_up_sent"  # Follow-up actions sent
    COMPLETED = "completed"  # Workflow complete


class NotificationType(PyEnum):
    """
    Types of automated notifications for meeting workflows

    Design Decision: Structured notification types for automated
    communication and workflow management.
    """

    MEETING_SCHEDULED = "meeting_scheduled"
    AGENDA_DISTRIBUTED = "agenda_distributed"
    REMINDER_24H = "reminder_24h"
    REMINDER_1H = "reminder_1h"
    MEETING_STARTED = "meeting_started"
    ACTION_ITEMS_ASSIGNED = "action_items_assigned"
    FOLLOW_UP_REQUIRED = "follow_up_required"
    MEETING_SUMMARY = "meeting_summary"


# Association table for many-to-many relationship between meetings and tags
meeting_tags = Table(
    "meeting_tags",
    Base.metadata,
    Column(
        "meeting_id",
        UUID(as_uuid=True),
        ForeignKey("meetings.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    Column(
        "tag_id",
        UUID(as_uuid=True),
        ForeignKey("tags.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    Index("idx_meeting_tags_meeting_id", "meeting_id"),
    Index("idx_meeting_tags_tag_id", "tag_id"),
)


class MeetingTemplate(Base):
    """
    Meeting templates for recurring meetings and standardization

    Design Decision: Templates enable consistent meeting structure and reduce
    setup time. Supports organizational standards and best practices.

    Key Features:
    - Reusable meeting configurations
    - Default participants and settings
    - Agenda templates and time allocations
    - Integration with calendar systems
    """

    __tablename__ = "meeting_templates"

    # Primary key with UUID for global uniqueness
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)

    # Template identification and metadata
    name = Column(String(255), nullable=False, index=True)
    description = Column(Text)
    category = Column(
        String(100), index=True
    )  # e.g., "weekly-standup", "quarterly-review"

    # Template configuration (stored as JSON for flexibility)
    default_duration_minutes = Column(Integer, default=60)
    default_settings = Column(JSONB, default=dict)  # Recording, transcription, etc.
    agenda_template = Column(Text)  # Structured agenda template

    # Access control and sharing
    created_by = Column(String(255), nullable=False, index=True)  # User ID
    is_public = Column(Boolean, default=False, index=True)
    organization_id = Column(String(255), index=True)  # For multi-tenant support

    # Audit fields
    created_at = Column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at = Column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    meetings = relationship("Meeting", back_populates="template")

    # Indexes for performance
    __table_args__ = (
        Index("idx_meeting_templates_created_by_category", "created_by", "category"),
        Index(
            "idx_meeting_templates_organization_public", "organization_id", "is_public"
        ),
    )


class Meeting(Base):
    """
    Core meeting entity with comprehensive metadata and state management

    Design Decision: Central entity that orchestrates all meeting-related data.
    Includes both scheduled and ad-hoc meetings with flexible configuration.

    Key Features:
    - Flexible scheduling with timezone support
    - State management for meeting lifecycle
    - Integration with external calendar systems
    - Rich metadata for analytics and reporting
    """

    __tablename__ = "meetings"

    # Primary key with UUID for global uniqueness and security
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)

    # Meeting identification and metadata
    title = Column(String(500), nullable=False, index=True)
    description = Column(Text)
    meeting_number = Column(
        String(50), unique=True, index=True
    )  # Human-readable meeting ID

    # Scheduling and timing
    scheduled_start = Column(DateTime(timezone=True), nullable=False, index=True)
    scheduled_end = Column(DateTime(timezone=True), nullable=False, index=True)
    actual_start = Column(DateTime(timezone=True), index=True)
    actual_end = Column(DateTime(timezone=True), index=True)
    timezone = Column(String(50), default="UTC")

    # Meeting configuration and settings
    status = Column(
        Enum(MeetingStatus),
        default=MeetingStatus.NOT_STARTED,
        nullable=False,
        index=True,
    )
    max_participants = Column(Integer, default=100)
    is_recording = Column(Boolean, default=True)
    is_transcription_enabled = Column(Boolean, default=True)
    is_ai_insights_enabled = Column(Boolean, default=True)

    # Meeting access and security
    meeting_url = Column(String(500))  # Video conference URL
    meeting_password = Column(String(100))
    is_public = Column(Boolean, default=False, index=True)
    requires_approval = Column(Boolean, default=False)

    # Organizational context
    created_by = Column(String(255), nullable=False, index=True)  # User ID
    organization_id = Column(String(255), index=True)  # For multi-tenant support
    template_id = Column(
        UUID(as_uuid=True), ForeignKey("meeting_templates.id", ondelete="SET NULL")
    )

    # External integrations
    calendar_event_id = Column(String(255), index=True)  # External calendar integration
    external_meeting_id = Column(String(255), index=True)  # Zoom, Teams, etc.

    # Meeting content and agenda
    agenda = Column(Text)
    meeting_notes = Column(Text)
    recording_url = Column(String(500))

    # Analytics and metrics
    participant_count = Column(Integer, default=0)
    total_speaking_time_seconds = Column(Integer, default=0)

    # Audit fields
    created_at = Column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at = Column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    template = relationship("MeetingTemplate", back_populates="meetings")
    participants = relationship(
        "Participant", back_populates="meeting", cascade="all, delete-orphan"
    )
    transcripts = relationship(
        "Transcript", back_populates="meeting", cascade="all, delete-orphan"
    )
    insights = relationship(
        "AIInsight", back_populates="meeting", cascade="all, delete-orphan"
    )
    tags = relationship("Tag", secondary=meeting_tags, back_populates="meetings")

    # Constraints and indexes for data integrity and performance
    __table_args__ = (
        # Ensure scheduled end is after scheduled start
        CheckConstraint(
            "scheduled_end > scheduled_start", name="check_meeting_schedule_order"
        ),
        # Ensure actual end is after actual start when both are set
        CheckConstraint(
            "actual_end IS NULL OR actual_start IS NULL OR actual_end >= actual_start",
            name="check_meeting_actual_times",
        ),
        # Performance indexes
        Index("idx_meetings_status_scheduled_start", "status", "scheduled_start"),
        Index("idx_meetings_created_by_status", "created_by", "status"),
        Index("idx_meetings_organization_status", "organization_id", "status"),
        Index("idx_meetings_template_created_at", "template_id", "created_at"),
    )

    @validates("status")
    def validate_status_transition(self, key, value):
        """Validate meeting status transitions to prevent invalid state changes"""
        if hasattr(self, "status") and self.status:
            valid_transitions = {
                MeetingStatus.NOT_STARTED: [
                    MeetingStatus.ACTIVE,
                    MeetingStatus.CANCELLED,
                ],
                MeetingStatus.ACTIVE: [MeetingStatus.PAUSED, MeetingStatus.ENDED],
                MeetingStatus.PAUSED: [MeetingStatus.ACTIVE, MeetingStatus.ENDED],
                MeetingStatus.ENDED: [],  # Terminal state
                MeetingStatus.CANCELLED: [],  # Terminal state
            }

            if value not in valid_transitions.get(self.status, []):
                raise ValueError(
                    f"Invalid status transition from {self.status} to {value}"
                )

        return value

    @property
    def duration_minutes(self) -> Optional[int]:
        """Calculate actual or scheduled meeting duration"""
        if self.actual_start and self.actual_end:
            return int((self.actual_end - self.actual_start).total_seconds() / 60)
        elif self.scheduled_start and self.scheduled_end:
            return int((self.scheduled_end - self.scheduled_start).total_seconds() / 60)
        return None

    @property
    def is_overdue(self) -> bool:
        """Check if meeting has exceeded scheduled end time"""
        if self.status == MeetingStatus.ACTIVE and self.scheduled_end:
            return datetime.utcnow() > self.scheduled_end.replace(tzinfo=None)
        return False


class Participant(Base):
    """
    Meeting participants with roles, engagement tracking, and analytics

    Design Decision: Detailed participant tracking enables engagement analytics,
    billing, and meeting effectiveness measurement. Supports both internal and
    external participants.

    Key Features:
    - Role-based access control
    - Engagement and participation tracking
    - Integration with user management systems
    - Analytics for meeting effectiveness
    """

    __tablename__ = "participants"

    # Primary key
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)

    # Foreign key to meeting
    meeting_id = Column(
        UUID(as_uuid=True),
        ForeignKey("meetings.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Participant identification
    user_id = Column(
        String(255), index=True
    )  # Internal user ID (nullable for external participants)
    email = Column(String(255), nullable=False, index=True)
    display_name = Column(String(255), nullable=False)
    avatar_url = Column(String(500))

    # Participant role and permissions
    role = Column(
        Enum(ParticipantRole),
        default=ParticipantRole.PARTICIPANT,
        nullable=False,
        index=True,
    )
    status = Column(
        Enum(ParticipantStatus),
        default=ParticipantStatus.INVITED,
        nullable=False,
        index=True,
    )

    # Participation tracking
    invited_at = Column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    joined_at = Column(DateTime(timezone=True))
    left_at = Column(DateTime(timezone=True))

    # Engagement metrics
    speaking_time_seconds = Column(Integer, default=0)
    microphone_on_duration_seconds = Column(Integer, default=0)
    camera_on_duration_seconds = Column(Integer, default=0)
    chat_messages_count = Column(Integer, default=0)
    screen_share_duration_seconds = Column(Integer, default=0)

    # Technical details
    connection_quality_score = Column(Float)  # 0.0 to 1.0
    device_info = Column(JSONB, default=dict)  # Browser, OS, device details
    ip_address = Column(String(45))  # IPv4 or IPv6

    # Access control
    can_speak = Column(Boolean, default=True)
    can_share_screen = Column(Boolean, default=True)
    can_use_chat = Column(Boolean, default=True)

    # Audit fields
    created_at = Column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at = Column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    meeting = relationship("Meeting", back_populates="participants")
    transcripts = relationship("Transcript", back_populates="participant")

    # Constraints and indexes
    __table_args__ = (
        # Ensure unique email per meeting
        UniqueConstraint("meeting_id", "email", name="uq_participant_meeting_email"),
        # Performance indexes
        Index("idx_participants_meeting_role", "meeting_id", "role"),
        Index("idx_participants_meeting_status", "meeting_id", "status"),
        Index("idx_participants_user_id_status", "user_id", "status"),
        Index("idx_participants_email_status", "email", "status"),
    )

    @property
    def participation_duration_minutes(self) -> Optional[int]:
        """Calculate how long participant was in the meeting"""
        if self.joined_at and self.left_at:
            return int((self.left_at - self.joined_at).total_seconds() / 60)
        elif self.joined_at and self.status == ParticipantStatus.JOINED:
            return int(
                (
                    datetime.utcnow() - self.joined_at.replace(tzinfo=None)
                ).total_seconds()
                / 60
            )
        return None

    @property
    def engagement_score(self) -> float:
        """Calculate participant engagement score (0.0 to 1.0)"""
        if (
            not self.participation_duration_minutes
            or self.participation_duration_minutes == 0
        ):
            return 0.0

        duration_seconds = self.participation_duration_minutes * 60

        # Weighted engagement factors
        speaking_ratio = min(self.speaking_time_seconds / duration_seconds, 1.0) * 0.4
        microphone_ratio = (
            min(self.microphone_on_duration_seconds / duration_seconds, 1.0) * 0.2
        )
        camera_ratio = (
            min(self.camera_on_duration_seconds / duration_seconds, 1.0) * 0.2
        )
        chat_participation = (
            min(self.chat_messages_count / 10, 1.0) * 0.2
        )  # Normalize to 10 messages

        return speaking_ratio + microphone_ratio + camera_ratio + chat_participation


class Transcript(Base):
    """
    Meeting transcripts with speaker identification and content analysis

    Design Decision: Granular transcript storage enables precise search,
    analysis, and AI processing. Supports real-time transcription and
    post-processing for accuracy improvement.

    Key Features:
    - Real-time and batch transcription support
    - Speaker identification and diarization
    - Confidence scoring for quality assessment
    - Integration with AI analysis pipeline
    """

    __tablename__ = "transcripts"

    # Primary key
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)

    # Foreign keys
    meeting_id = Column(
        UUID(as_uuid=True),
        ForeignKey("meetings.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    participant_id = Column(
        UUID(as_uuid=True),
        ForeignKey("participants.id", ondelete="SET NULL"),
        index=True,
    )

    # Transcript content and metadata
    content = Column(Text, nullable=False)
    transcript_type = Column(
        Enum(TranscriptType), default=TranscriptType.SPEECH, nullable=False, index=True
    )
    language = Column(String(10), default="en")  # ISO language code

    # Timing information for precise playback sync
    start_time_seconds = Column(Float, nullable=False, index=True)
    end_time_seconds = Column(Float, nullable=False, index=True)
    sequence_number = Column(Integer, nullable=False)  # Order within meeting

    # Quality and confidence metrics
    confidence_score = Column(Float)  # 0.0 to 1.0
    word_count = Column(Integer, default=0)
    is_final = Column(Boolean, default=False)  # False for real-time interim results

    # Speaker identification
    speaker_id = Column(String(100))  # External speaker diarization ID
    is_speaker_identified = Column(Boolean, default=False)

    # Processing metadata
    transcription_engine = Column(String(100))  # e.g., "whisper", "google", "assembly"
    processing_metadata = Column(JSONB, default=dict)  # Engine-specific data

    # AI processing flags
    is_processed_for_insights = Column(Boolean, default=False, index=True)
    contains_action_items = Column(Boolean, default=False, index=True)
    sentiment_score = Column(Float)  # -1.0 (negative) to 1.0 (positive)

    # Audit fields
    created_at = Column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at = Column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    meeting = relationship("Meeting", back_populates="transcripts")
    participant = relationship("Participant", back_populates="transcripts")

    # Constraints and indexes
    __table_args__ = (
        # Ensure end time is after start time
        CheckConstraint(
            "end_time_seconds >= start_time_seconds", name="check_transcript_time_order"
        ),
        # Ensure sequence number is unique within meeting
        UniqueConstraint(
            "meeting_id", "sequence_number", name="uq_transcript_meeting_sequence"
        ),
        # Performance indexes for common queries
        Index("idx_transcripts_meeting_time", "meeting_id", "start_time_seconds"),
        Index("idx_transcripts_meeting_type", "meeting_id", "transcript_type"),
        Index(
            "idx_transcripts_participant_time", "participant_id", "start_time_seconds"
        ),
        Index(
            "idx_transcripts_processing_flags",
            "is_processed_for_insights",
            "contains_action_items",
        ),
        # Full-text search index on content (PostgreSQL specific)
        Index(
            "idx_transcripts_content_fts",
            "content",
            postgresql_using="gin",
            postgresql_ops={"content": "gin_trgm_ops"},
        ),
    )


class AIInsight(Base):
    """
    AI-generated insights and analysis from meeting content

    Design Decision: Structured storage of AI insights enables sophisticated
    analytics, search, and follow-up automation. Supports multiple AI models
    and insight types for comprehensive meeting analysis.

    Key Features:
    - Multi-type insight categorization
    - Confidence scoring and quality metrics
    - Version tracking for insight improvements
    - Integration with external AI services
    """

    __tablename__ = "ai_insights"

    # Primary key
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)

    # Foreign key to meeting
    meeting_id = Column(
        UUID(as_uuid=True),
        ForeignKey("meetings.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Insight classification and content
    insight_type = Column(Enum(InsightType), nullable=False, index=True)
    title = Column(String(500), nullable=False)
    content = Column(Text, nullable=False)
    structured_data = Column(JSONB, default=dict)  # Parsed/structured insight data

    # Quality and confidence metrics
    confidence_score = Column(Float, nullable=False)  # 0.0 to 1.0
    accuracy_rating = Column(Float)  # User feedback on accuracy
    usefulness_rating = Column(Float)  # User feedback on usefulness

    # Processing metadata
    ai_model = Column(String(100), nullable=False)  # e.g., "gpt-4", "claude-3"
    processing_version = Column(String(50))  # Track insight generation versions
    processing_duration_seconds = Column(Float)
    input_token_count = Column(Integer)
    output_token_count = Column(Integer)
    processing_cost_cents = Column(Float)

    # Source and context
    source_transcript_ids = Column(JSONB, default=list)  # List of transcript IDs used
    source_time_range = Column(
        JSONB, default=dict
    )  # Start/end times for time-based insights

    # User interaction and feedback
    is_user_validated = Column(Boolean, default=False, index=True)
    user_feedback = Column(Text)
    is_action_required = Column(Boolean, default=False, index=True)
    action_assignee = Column(String(255))
    action_due_date = Column(DateTime(timezone=True))

    # Visibility and sharing
    is_public = Column(Boolean, default=False, index=True)
    shared_with = Column(JSONB, default=list)  # List of user IDs with access

    # Audit fields
    created_at = Column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at = Column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    meeting = relationship("Meeting", back_populates="insights")

    # Constraints and indexes
    __table_args__ = (
        # Performance indexes
        Index("idx_ai_insights_meeting_type", "meeting_id", "insight_type"),
        Index("idx_ai_insights_type_confidence", "insight_type", "confidence_score"),
        Index(
            "idx_ai_insights_action_required", "is_action_required", "action_due_date"
        ),
        Index("idx_ai_insights_user_validated", "is_user_validated", "created_at"),
        # Full-text search on content and title
        Index(
            "idx_ai_insights_content_fts",
            "content",
            "title",
            postgresql_using="gin",
            postgresql_ops={"content": "gin_trgm_ops", "title": "gin_trgm_ops"},
        ),
    )


class Tag(Base):
    """
    Flexible tagging system for meeting categorization and search

    Design Decision: Hierarchical tagging system enables flexible organization
    and powerful search capabilities. Supports both user-defined and
    system-generated tags.

    Key Features:
    - Hierarchical tag structure (parent/child relationships)
    - Automatic and manual tag assignment
    - Usage analytics and trending
    - Integration with AI-based categorization
    """

    __tablename__ = "tags"

    # Primary key
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)

    # Tag identification and hierarchy
    name = Column(String(100), nullable=False, index=True)
    slug = Column(
        String(100), nullable=False, unique=True, index=True
    )  # URL-friendly version
    description = Column(Text)
    parent_id = Column(
        UUID(as_uuid=True), ForeignKey("tags.id", ondelete="CASCADE"), index=True
    )

    # Tag metadata and configuration
    color = Column(String(7), default="#3B82F6")  # Hex color for UI
    icon = Column(String(50))  # Icon identifier
    is_system = Column(Boolean, default=False, index=True)  # System vs user tags
    is_auto_assigned = Column(Boolean, default=False)  # Automatically assigned by AI

    # Usage analytics
    usage_count = Column(Integer, default=0, index=True)
    last_used = Column(DateTime(timezone=True))

    # Access control
    created_by = Column(String(255), index=True)  # User ID
    organization_id = Column(String(255), index=True)  # For multi-tenant support
    is_public = Column(Boolean, default=True, index=True)

    # Audit fields
    created_at = Column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at = Column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    parent = relationship("Tag", remote_side=[id], back_populates="children")
    children = relationship(
        "Tag", back_populates="parent", cascade="all, delete-orphan"
    )
    meetings = relationship("Meeting", secondary=meeting_tags, back_populates="tags")

    # Constraints and indexes
    __table_args__ = (
        # Unique tag names within organization
        UniqueConstraint("name", "organization_id", name="uq_tag_name_organization"),
        # Performance indexes
        Index("idx_tags_parent_usage", "parent_id", "usage_count"),
        Index("idx_tags_organization_system", "organization_id", "is_system"),
    )

    @property
    def full_path(self) -> str:
        """Get full hierarchical path of the tag"""
        if self.parent:
            return f"{self.parent.full_path} > {self.name}"
        return self.name


# Database indexes for optimal query performance
# These indexes are created separately to handle complex multi-column scenarios

# Composite indexes for common query patterns
Index(
    "idx_meetings_status_date_range",
    Meeting.status,
    Meeting.scheduled_start,
    Meeting.scheduled_end,
)
Index(
    "idx_participants_meeting_engagement",
    Participant.meeting_id,
    Participant.speaking_time_seconds.desc(),
)
Index(
    "idx_transcripts_meeting_speaker_time",
    Transcript.meeting_id,
    Transcript.participant_id,
    Transcript.start_time_seconds,
)
Index(
    "idx_ai_insights_meeting_confidence",
    AIInsight.meeting_id,
    AIInsight.confidence_score.desc(),
)

# Partial indexes for specific use cases (PostgreSQL specific)
Index(
    "idx_active_meetings",
    Meeting.id,
    postgresql_where=Meeting.status == MeetingStatus.ACTIVE,
)
Index(
    "idx_pending_insights",
    AIInsight.meeting_id,
    postgresql_where=AIInsight.is_processed_for_insights == False,
)
Index(
    "idx_actionable_insights",
    AIInsight.id,
    postgresql_where=AIInsight.is_action_required == True,
)


class RecurringMeetingSeries(Base):
    """
    Recurring meeting series for automated scheduling and template application

    Design Decision: Separate model to manage recurring meeting patterns,
    enabling automated creation and consistent template application.

    Key Features:
    - Flexible recurrence patterns with custom rules
    - Automatic template application for consistency
    - Pattern detection for existing meeting series
    - Exception handling for modified instances
    """

    __tablename__ = "recurring_meeting_series"

    # Primary key
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)

    # Series identification
    name = Column(String(255), nullable=False, index=True)
    description = Column(Text)

    # Template association
    template_id = Column(
        UUID(as_uuid=True),
        ForeignKey("meeting_templates.id", ondelete="CASCADE"),
        nullable=False,
    )

    # Recurrence configuration
    recurrence_type = Column(Enum(RecurrenceType), nullable=False, index=True)
    recurrence_interval = Column(Integer, default=1)  # Every N days/weeks/months
    recurrence_rule = Column(JSONB)  # Complex recurrence rules (RRULE format)

    # Time configuration
    start_date = Column(DateTime(timezone=True), nullable=False)
    end_date = Column(DateTime(timezone=True))  # Optional end date
    start_time = Column(String(8))  # HH:MM:SS format
    duration_minutes = Column(Integer, nullable=False)
    timezone = Column(String(50), default="UTC")

    # Series management
    is_active = Column(Boolean, default=True, index=True)
    created_by = Column(String(255), nullable=False, index=True)
    organization_id = Column(String(255), index=True)

    # Pattern detection metadata
    detected_pattern = Column(JSONB)  # Auto-detected pattern info
    confidence_score = Column(Float, default=0.0)  # Pattern detection confidence

    # Audit fields
    created_at = Column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at = Column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    template = relationship("MeetingTemplate")
    meetings = relationship("Meeting", back_populates="recurring_series")
    exceptions = relationship(
        "RecurringMeetingException",
        back_populates="series",
        cascade="all, delete-orphan",
    )

    # Indexes
    __table_args__ = (
        Index("idx_recurring_series_template_active", "template_id", "is_active"),
        Index(
            "idx_recurring_series_organization_type",
            "organization_id",
            "recurrence_type",
        ),
        Index("idx_recurring_series_start_date", "start_date"),
    )


class RecurringMeetingException(Base):
    """
    Exceptions and modifications to recurring meeting series

    Design Decision: Track individual meeting modifications while maintaining
    the series integrity. Enables flexible handling of schedule changes.
    """

    __tablename__ = "recurring_meeting_exceptions"

    # Primary key
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)

    # Foreign keys
    series_id = Column(
        UUID(as_uuid=True),
        ForeignKey("recurring_meeting_series.id", ondelete="CASCADE"),
        nullable=False,
    )
    meeting_id = Column(
        UUID(as_uuid=True), ForeignKey("meetings.id", ondelete="CASCADE")
    )

    # Exception details
    original_date = Column(DateTime(timezone=True), nullable=False)
    exception_type = Column(
        String(50), nullable=False
    )  # 'cancelled', 'rescheduled', 'modified'
    reason = Column(Text)

    # Modified values (if rescheduled/modified)
    new_date = Column(DateTime(timezone=True))
    modifications = Column(JSONB)  # Changed fields and values

    # Audit fields
    created_at = Column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    created_by = Column(String(255), nullable=False)

    # Relationships
    series = relationship("RecurringMeetingSeries", back_populates="exceptions")
    meeting = relationship("Meeting")

    # Indexes
    __table_args__ = (
        Index("idx_recurring_exceptions_series_date", "series_id", "original_date"),
    )


class ActionItem(Base):
    """
    Action items with assignment, tracking, and follow-up automation

    Design Decision: Dedicated model for action item lifecycle management,
    enabling accountability, progress tracking, and automated follow-ups.

    Key Features:
    - Automatic extraction from meeting content
    - Assignment and delegation workflow
    - Progress tracking with status updates
    - Automated reminders and escalation
    """

    __tablename__ = "action_items"

    # Primary key
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)

    # Foreign keys
    meeting_id = Column(
        UUID(as_uuid=True),
        ForeignKey("meetings.id", ondelete="CASCADE"),
        nullable=False,
    )
    insight_id = Column(
        UUID(as_uuid=True), ForeignKey("ai_insights.id", ondelete="SET NULL")
    )

    # Action item content
    title = Column(String(500), nullable=False, index=True)
    description = Column(Text)
    priority = Column(
        String(20), default="medium", index=True
    )  # low, medium, high, urgent
    category = Column(String(100), index=True)  # Type of action item

    # Assignment and responsibility
    assigned_to = Column(String(255), index=True)  # User ID
    assigned_by = Column(String(255), index=True)  # User ID
    assigned_at = Column(DateTime(timezone=True))

    # Status and progress
    status = Column(
        Enum(ActionItemStatus),
        default=ActionItemStatus.PENDING,
        nullable=False,
        index=True,
    )
    progress_percentage = Column(Integer, default=0)  # 0-100
    completion_notes = Column(Text)

    # Timing and deadlines
    due_date = Column(DateTime(timezone=True), index=True)
    estimated_hours = Column(Float)
    actual_hours = Column(Float)

    # Automation and tracking
    auto_extracted = Column(Boolean, default=False, index=True)
    extraction_confidence = Column(Float, default=0.0)
    reminder_count = Column(Integer, default=0)
    last_reminder_sent = Column(DateTime(timezone=True))

    # Context and metadata
    context = Column(JSONB)  # Additional context and metadata
    dependencies = Column(JSONB)  # Dependent action items or tasks
    tags = Column(JSONB)  # Action item tags

    # Audit fields
    created_at = Column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at = Column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    completed_at = Column(DateTime(timezone=True))

    # Relationships
    meeting = relationship("Meeting")
    insight = relationship("AIInsight")
    updates = relationship(
        "ActionItemUpdate", back_populates="action_item", cascade="all, delete-orphan"
    )

    # Constraints and indexes
    __table_args__ = (
        Index("idx_action_items_meeting_status", "meeting_id", "status"),
        Index("idx_action_items_assigned_status", "assigned_to", "status"),
        Index("idx_action_items_due_date_status", "due_date", "status"),
        Index("idx_action_items_priority_status", "priority", "status"),
    )

    @property
    def is_overdue(self) -> bool:
        """Check if action item is past due date"""
        if self.due_date and self.status not in [
            ActionItemStatus.COMPLETED,
            ActionItemStatus.CANCELLED,
        ]:
            return datetime.utcnow() > self.due_date.replace(tzinfo=None)
        return False


class ActionItemUpdate(Base):
    """
    Progress updates and status changes for action items

    Design Decision: Track action item progress with detailed updates
    for accountability and progress monitoring.
    """

    __tablename__ = "action_item_updates"

    # Primary key
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)

    # Foreign key
    action_item_id = Column(
        UUID(as_uuid=True),
        ForeignKey("action_items.id", ondelete="CASCADE"),
        nullable=False,
    )

    # Update content
    update_text = Column(Text, nullable=False)
    status_change = Column(String(100))  # Previous -> New status
    progress_change = Column(Integer)  # Progress percentage change

    # Update metadata
    updated_by = Column(String(255), nullable=False, index=True)
    update_type = Column(String(50))  # 'progress', 'status', 'comment', 'assignment'

    # Audit fields
    created_at = Column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    # Relationships
    action_item = relationship("ActionItem", back_populates="updates")

    # Indexes
    __table_args__ = (
        Index("idx_action_item_updates_item_created", "action_item_id", "created_at"),
    )


class MeetingWorkflow(Base):
    """
    Meeting workflow state machine for automation and process management

    Design Decision: State machine approach for meeting workflow automation,
    enabling consistent process execution and automation triggers.

    Key Features:
    - State machine workflow management
    - Automated state transitions and triggers
    - Customizable workflow steps and conditions
    - Integration with notification and automation systems
    """

    __tablename__ = "meeting_workflows"

    # Primary key
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)

    # Foreign key
    meeting_id = Column(
        UUID(as_uuid=True),
        ForeignKey("meetings.id", ondelete="CASCADE"),
        nullable=False,
    )

    # Workflow state management
    current_state = Column(
        Enum(WorkflowState),
        default=WorkflowState.TEMPLATE_SELECTED,
        nullable=False,
        index=True,
    )
    previous_state = Column(Enum(WorkflowState))
    workflow_name = Column(String(100), default="standard_meeting", index=True)

    # State transition tracking
    state_history = Column(JSONB, default=list)  # State transition history
    state_data = Column(JSONB, default=dict)  # State-specific data
    automation_config = Column(JSONB, default=dict)  # Automation configuration

    # Workflow execution
    auto_advance = Column(Boolean, default=True)  # Automatic state advancement
    paused = Column(Boolean, default=False, index=True)
    error_state = Column(String(100))  # Current error if any
    retry_count = Column(Integer, default=0)

    # Timing and scheduling
    next_scheduled_action = Column(DateTime(timezone=True))
    last_action_executed = Column(DateTime(timezone=True))
    estimated_completion = Column(DateTime(timezone=True))

    # Audit fields
    created_at = Column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at = Column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    meeting = relationship("Meeting")
    notifications = relationship(
        "WorkflowNotification", back_populates="workflow", cascade="all, delete-orphan"
    )

    # Indexes
    __table_args__ = (
        Index(
            "idx_meeting_workflows_state_scheduled",
            "current_state",
            "next_scheduled_action",
        ),
        Index("idx_meeting_workflows_meeting_state", "meeting_id", "current_state"),
    )


class WorkflowNotification(Base):
    """
    Automated notifications for meeting workflows

    Design Decision: Centralized notification management for workflow automation,
    enabling consistent communication and participant engagement.
    """

    __tablename__ = "workflow_notifications"

    # Primary key
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)

    # Foreign key
    workflow_id = Column(
        UUID(as_uuid=True),
        ForeignKey("meeting_workflows.id", ondelete="CASCADE"),
        nullable=False,
    )

    # Notification configuration
    notification_type = Column(Enum(NotificationType), nullable=False, index=True)
    trigger_state = Column(Enum(WorkflowState))  # State that triggers this notification
    recipient_type = Column(
        String(50), nullable=False
    )  # 'participants', 'host', 'specific', 'external'
    recipients = Column(JSONB)  # List of recipient identifiers

    # Notification content
    subject_template = Column(String(500))
    body_template = Column(Text)
    notification_data = Column(JSONB)  # Template variables and data

    # Scheduling and delivery
    scheduled_for = Column(DateTime(timezone=True), index=True)
    sent_at = Column(DateTime(timezone=True))
    delivery_status = Column(
        String(50), default="pending", index=True
    )  # pending, sent, failed, cancelled
    error_message = Column(Text)

    # Configuration
    is_enabled = Column(Boolean, default=True, index=True)
    retry_count = Column(Integer, default=0)
    max_retries = Column(Integer, default=3)

    # Audit fields
    created_at = Column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at = Column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    workflow = relationship("MeetingWorkflow", back_populates="notifications")

    # Indexes
    __table_args__ = (
        Index(
            "idx_workflow_notifications_scheduled", "scheduled_for", "delivery_status"
        ),
        Index(
            "idx_workflow_notifications_workflow_type",
            "workflow_id",
            "notification_type",
        ),
    )


class TemplateRating(Base):
    """
    Community ratings and reviews for meeting templates

    Design Decision: Enable community-driven template improvement and
    discovery through ratings and feedback.
    """

    __tablename__ = "template_ratings"

    # Primary key
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)

    # Foreign key
    template_id = Column(
        UUID(as_uuid=True),
        ForeignKey("meeting_templates.id", ondelete="CASCADE"),
        nullable=False,
    )

    # Rating details
    rated_by = Column(String(255), nullable=False, index=True)
    rating = Column(Integer, nullable=False)  # 1-5 stars
    review = Column(Text)

    # Usage context
    organization_id = Column(String(255), index=True)
    usage_count = Column(Integer, default=1)  # How many times they've used it

    # Helpful votes
    helpful_votes = Column(Integer, default=0)
    total_votes = Column(Integer, default=0)

    # Audit fields
    created_at = Column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at = Column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    template = relationship("MeetingTemplate")

    # Constraints and indexes
    __table_args__ = (
        # One rating per user per template
        UniqueConstraint("template_id", "rated_by", name="uq_template_rating_user"),
        Index("idx_template_ratings_template_rating", "template_id", "rating"),
    )


# Add foreign key relationships to existing models
Meeting.recurring_series_id = Column(
    UUID(as_uuid=True), ForeignKey("recurring_meeting_series.id", ondelete="SET NULL")
)
Meeting.recurring_series = relationship(
    "RecurringMeetingSeries", back_populates="meetings"
)
Meeting.workflow = relationship(
    "MeetingWorkflow",
    uselist=False,
    back_populates="meeting",
    cascade="all, delete-orphan",
)
Meeting.action_items = relationship(
    "ActionItem", back_populates="meeting", cascade="all, delete-orphan"
)

# Update existing AIInsight model to support action items
AIInsight.action_items = relationship(
    "ActionItem", back_populates="insight", cascade="all, delete-orphan"
)

# Additional indexes for new automation features
Index(
    "idx_recurring_series_next_occurrence",
    RecurringMeetingSeries.start_date,
    RecurringMeetingSeries.is_active,
)
Index(
    "idx_action_items_overdue",
    ActionItem.due_date,
    ActionItem.status,
    postgresql_where=ActionItem.due_date < func.now(),
)
Index(
    "idx_workflow_notifications_pending",
    WorkflowNotification.scheduled_for,
    postgresql_where=WorkflowNotification.delivery_status == "pending",
)
