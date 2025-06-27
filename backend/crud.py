# CRUD Operations for MeetingMind Database
# Comprehensive data access layer with optimized queries, validation, and error handling
# Supports complex filtering, pagination, and relationship management

from typing import List, Optional, Dict, Any, Union
from datetime import datetime, timedelta
from sqlalchemy.orm import Session, selectinload, joinedload
from sqlalchemy import and_, or_, func, text, desc, asc
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
import uuid
import logging

from models import (
    Meeting, MeetingTemplate, Participant, Transcript, AIInsight, Tag,
    MeetingStatus, ParticipantRole, ParticipantStatus, TranscriptType, 
    InsightType, meeting_tags
)
from pydantic import BaseModel, Field
from enum import Enum

# Configure logging
logger = logging.getLogger(__name__)

# Pydantic models for request/response validation
class MeetingCreate(BaseModel):
    """Schema for creating a new meeting"""
    title: str = Field(..., min_length=1, max_length=500)
    description: Optional[str] = None
    scheduled_start: datetime
    scheduled_end: datetime
    timezone: str = "UTC"
    max_participants: int = Field(default=100, ge=1, le=1000)
    is_recording: bool = True
    is_transcription_enabled: bool = True
    is_ai_insights_enabled: bool = True
    meeting_url: Optional[str] = None
    meeting_password: Optional[str] = None
    is_public: bool = False
    requires_approval: bool = False
    created_by: str
    organization_id: Optional[str] = None
    template_id: Optional[str] = None
    agenda: Optional[str] = None
    meeting_notes: Optional[str] = None
    tag_ids: List[str] = []

class MeetingUpdate(BaseModel):
    """Schema for updating an existing meeting"""
    title: Optional[str] = Field(None, min_length=1, max_length=500)
    description: Optional[str] = None
    scheduled_start: Optional[datetime] = None
    scheduled_end: Optional[datetime] = None
    status: Optional[MeetingStatus] = None
    agenda: Optional[str] = None
    meeting_notes: Optional[str] = None
    tag_ids: Optional[List[str]] = None

class ParticipantCreate(BaseModel):
    """Schema for adding a participant to a meeting"""
    meeting_id: str
    email: str = Field(..., regex=r'^[^@]+@[^@]+\.[^@]+$')
    display_name: str = Field(..., min_length=1, max_length=255)
    user_id: Optional[str] = None
    role: ParticipantRole = ParticipantRole.PARTICIPANT
    avatar_url: Optional[str] = None

class TranscriptCreate(BaseModel):
    """Schema for creating transcript entries"""
    meeting_id: str
    participant_id: Optional[str] = None
    content: str = Field(..., min_length=1)
    transcript_type: TranscriptType = TranscriptType.SPEECH
    language: str = "en"
    start_time_seconds: float = Field(..., ge=0)
    end_time_seconds: float = Field(..., ge=0)
    sequence_number: int = Field(..., ge=1)
    confidence_score: Optional[float] = Field(None, ge=0, le=1)
    transcription_engine: Optional[str] = None

class AIInsightCreate(BaseModel):
    """Schema for creating AI insights"""
    meeting_id: str
    insight_type: InsightType
    title: str = Field(..., min_length=1, max_length=500)
    content: str = Field(..., min_length=1)
    structured_data: Dict[str, Any] = {}
    confidence_score: float = Field(..., ge=0, le=1)
    ai_model: str
    processing_version: Optional[str] = None
    source_transcript_ids: List[str] = []

class PaginationParams(BaseModel):
    """Pagination parameters for list endpoints"""
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=20, ge=1, le=100)
    sort_by: str = "created_at"
    sort_order: str = Field(default="desc", regex="^(asc|desc)$")

class MeetingFilters(BaseModel):
    """Filtering parameters for meeting queries"""
    status: Optional[List[MeetingStatus]] = None
    created_by: Optional[str] = None
    organization_id: Optional[str] = None
    template_id: Optional[str] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    is_public: Optional[bool] = None
    search: Optional[str] = None
    tag_ids: Optional[List[str]] = None

# Exception classes for better error handling
class CRUDError(Exception):
    """Base exception for CRUD operations"""
    pass

class NotFoundError(CRUDError):
    """Raised when a requested resource is not found"""
    pass

class ValidationError(CRUDError):
    """Raised when data validation fails"""
    pass

class ConflictError(CRUDError):
    """Raised when a resource conflict occurs"""
    pass

class DatabaseConnectionError(CRUDError):
    """Raised when database connection fails"""
    pass

class DatabaseTimeoutError(CRUDError):
    """Raised when database operations timeout"""
    pass

class ForeignKeyError(ValidationError):
    """Raised when foreign key constraints are violated"""
    pass

class UniqueConstraintError(ConflictError):
    """Raised when unique constraints are violated"""
    pass

# CRUD Base Class with Common Operations
class BaseCRUD:
    """Base class providing common CRUD operations"""
    
    def __init__(self, model):
        self.model = model
    
    def get_by_id(self, db: Session, id: Union[str, uuid.UUID]) -> Optional[Any]:
        """Get a single record by ID"""
        try:
            if isinstance(id, str):
                id = uuid.UUID(id)
            return db.query(self.model).filter(self.model.id == id).first()
        except (ValueError, SQLAlchemyError) as e:
            logger.error(f"Error getting {self.model.__name__} by ID {id}: {e}")
            return None
    
    def get_multi(
        self, 
        db: Session, 
        skip: int = 0, 
        limit: int = 100,
        filters: Dict[str, Any] = None
    ) -> List[Any]:
        """Get multiple records with optional filtering"""
        try:
            query = db.query(self.model)
            
            if filters:
                for key, value in filters.items():
                    if hasattr(self.model, key) and value is not None:
                        query = query.filter(getattr(self.model, key) == value)
            
            return query.offset(skip).limit(limit).all()
        except SQLAlchemyError as e:
            logger.error(f"Error getting multiple {self.model.__name__}: {e}")
            return []
    
    def create(self, db: Session, *, obj_in: BaseModel) -> Any:
        """Create a new record"""
        try:
            obj_data = obj_in.dict(exclude_unset=True)
            obj_data['id'] = uuid.uuid4()
            db_obj = self.model(**obj_data)
            db.add(db_obj)
            db.commit()
            db.refresh(db_obj)
            return db_obj
        except IntegrityError as e:
            db.rollback()
            logger.error(f"Integrity error creating {self.model.__name__}: {e}")
            raise ConflictError(f"Resource conflict: {str(e)}")
        except SQLAlchemyError as e:
            db.rollback()
            logger.error(f"Error creating {self.model.__name__}: {e}")
            # Re-raise with more specific context based on error type
            if "unique constraint" in str(e).lower() or "duplicate" in str(e).lower():
                raise UniqueConstraintError(f"Resource already exists: {str(e)}")
            elif "foreign key" in str(e).lower():
                raise ForeignKeyError(f"Referenced entity not found: {str(e)}")
            elif "not null" in str(e).lower() or "check constraint" in str(e).lower():
                raise ValidationError(f"Invalid data provided: {str(e)}")
            elif "connection" in str(e).lower():
                raise DatabaseConnectionError(f"Database connection failed: {str(e)}")
            elif "timeout" in str(e).lower():
                raise DatabaseTimeoutError(f"Database operation timed out: {str(e)}")
            else:
                raise CRUDError(f"Database error: {str(e)}")
    
    def update(
        self, 
        db: Session, 
        *, 
        db_obj: Any, 
        obj_in: Union[BaseModel, Dict[str, Any]]
    ) -> Any:
        """Update an existing record"""
        try:
            if isinstance(obj_in, dict):
                update_data = obj_in
            else:
                update_data = obj_in.dict(exclude_unset=True)
            
            for field, value in update_data.items():
                if hasattr(db_obj, field):
                    setattr(db_obj, field, value)
            
            db.commit()
            db.refresh(db_obj)
            return db_obj
        except SQLAlchemyError as e:
            db.rollback()
            logger.error(f"Error updating {self.model.__name__}: {e}")
            # Re-raise with more specific context based on error type
            if "unique constraint" in str(e).lower() or "duplicate" in str(e).lower():
                raise UniqueConstraintError(f"Update conflicts with existing data: {str(e)}")
            elif "foreign key" in str(e).lower():
                raise ForeignKeyError(f"Referenced entity not found: {str(e)}")
            elif "not null" in str(e).lower() or "check constraint" in str(e).lower():
                raise ValidationError(f"Invalid update data: {str(e)}")
            elif "connection" in str(e).lower():
                raise DatabaseConnectionError(f"Database connection failed: {str(e)}")
            elif "timeout" in str(e).lower():
                raise DatabaseTimeoutError(f"Database operation timed out: {str(e)}")
            else:
                raise CRUDError(f"Database error: {str(e)}")
    
    def delete(self, db: Session, *, id: Union[str, uuid.UUID]) -> bool:
        """Delete a record by ID"""
        try:
            obj = self.get_by_id(db, id)
            if obj:
                db.delete(obj)
                db.commit()
                return True
            return False
        except SQLAlchemyError as e:
            db.rollback()
            logger.error(f"Error deleting {self.model.__name__}: {e}")
            # Re-raise with more specific context based on error type
            if "foreign key" in str(e).lower():
                raise ConflictError(f"Cannot delete: Resource is referenced by other entities: {str(e)}")
            else:
                raise CRUDError(f"Database error: {str(e)}")

# Meeting CRUD Operations
class MeetingCRUD(BaseCRUD):
    """CRUD operations for Meeting model with advanced querying"""
    
    def __init__(self):
        super().__init__(Meeting)
    
    def get_with_relationships(self, db: Session, id: Union[str, uuid.UUID]) -> Optional[Meeting]:
        """Get meeting with all related data loaded"""
        try:
            if isinstance(id, str):
                id = uuid.UUID(id)
            
            return db.query(Meeting).options(
                selectinload(Meeting.participants),
                selectinload(Meeting.transcripts),
                selectinload(Meeting.insights),
                selectinload(Meeting.tags),
                joinedload(Meeting.template)
            ).filter(Meeting.id == id).first()
        except (ValueError, SQLAlchemyError) as e:
            logger.error(f"Error getting meeting with relationships {id}: {e}")
            return None
    
    def get_filtered(
        self, 
        db: Session, 
        filters: MeetingFilters,
        pagination: PaginationParams
    ) -> Dict[str, Any]:
        """Get meetings with advanced filtering and pagination"""
        try:
            query = db.query(Meeting)
            
            # Apply filters
            if filters.status:
                query = query.filter(Meeting.status.in_([s.value for s in filters.status]))
            
            if filters.created_by:
                query = query.filter(Meeting.created_by == filters.created_by)
            
            if filters.organization_id:
                query = query.filter(Meeting.organization_id == filters.organization_id)
            
            if filters.template_id:
                query = query.filter(Meeting.template_id == uuid.UUID(filters.template_id))
            
            if filters.start_date:
                query = query.filter(Meeting.scheduled_start >= filters.start_date)
            
            if filters.end_date:
                query = query.filter(Meeting.scheduled_end <= filters.end_date)
            
            if filters.is_public is not None:
                query = query.filter(Meeting.is_public == filters.is_public)
            
            if filters.search:
                search_term = f"%{filters.search}%"
                query = query.filter(
                    or_(
                        Meeting.title.ilike(search_term),
                        Meeting.description.ilike(search_term),
                        Meeting.agenda.ilike(search_term)
                    )
                )
            
            if filters.tag_ids:
                tag_uuids = [uuid.UUID(tag_id) for tag_id in filters.tag_ids]
                query = query.join(meeting_tags).filter(meeting_tags.c.tag_id.in_(tag_uuids))
            
            # Get total count before pagination
            total_count = query.count()
            
            # Apply sorting
            sort_column = getattr(Meeting, pagination.sort_by, Meeting.created_at)
            if pagination.sort_order == "desc":
                query = query.order_by(desc(sort_column))
            else:
                query = query.order_by(asc(sort_column))
            
            # Apply pagination
            skip = (pagination.page - 1) * pagination.page_size
            meetings = query.offset(skip).limit(pagination.page_size).all()
            
            # Calculate pagination metadata
            total_pages = (total_count + pagination.page_size - 1) // pagination.page_size
            
            return {
                "meetings": meetings,
                "total_count": total_count,
                "total_pages": total_pages,
                "current_page": pagination.page,
                "page_size": pagination.page_size,
                "has_next": pagination.page < total_pages,
                "has_prev": pagination.page > 1
            }
            
        except ValueError as e:
            logger.error(f"Invalid filter parameters: {e}")
            raise ValidationError(f"Invalid filter parameters: {str(e)}")
        except SQLAlchemyError as e:
            logger.error(f"Error getting filtered meetings: {e}")
            # Check for specific database issues
            if "timeout" in str(e).lower():
                raise DatabaseTimeoutError(f"Database query timeout: {str(e)}")
            elif "connection" in str(e).lower():
                raise DatabaseConnectionError(f"Database connection error: {str(e)}")
            else:
                raise CRUDError(f"Database error: {str(e)}")
    
    def create_with_participants(
        self, 
        db: Session, 
        meeting_data: MeetingCreate, 
        participants: List[ParticipantCreate] = None
    ) -> Meeting:
        """Create meeting with participants in a single transaction"""
        try:
            # Validate meeting times
            if meeting_data.scheduled_end <= meeting_data.scheduled_start:
                raise ValidationError("Meeting end time must be after start time")
            
            # Generate unique meeting number
            meeting_number = self._generate_meeting_number(db)
            
            # Create meeting
            meeting_dict = meeting_data.dict(exclude={'tag_ids'})
            meeting_dict['meeting_number'] = meeting_number
            meeting_dict['id'] = uuid.uuid4()
            
            meeting = Meeting(**meeting_dict)
            db.add(meeting)
            db.flush()  # Flush to get the ID
            
            # Add tags if provided
            if meeting_data.tag_ids:
                tag_uuids = [uuid.UUID(tag_id) for tag_id in meeting_data.tag_ids]
                tags = db.query(Tag).filter(Tag.id.in_(tag_uuids)).all()
                meeting.tags.extend(tags)
            
            # Add participants if provided
            if participants:
                for participant_data in participants:
                    participant_dict = participant_data.dict()
                    participant_dict['meeting_id'] = meeting.id
                    participant_dict['id'] = uuid.uuid4()
                    participant = Participant(**participant_dict)
                    db.add(participant)
            
            db.commit()
            db.refresh(meeting)
            return meeting
            
        except (ValidationError, ConflictError):
            db.rollback()
            raise
        except SQLAlchemyError as e:
            db.rollback()
            logger.error(f"Error creating meeting with participants: {e}")
            # Re-raise with more specific context
            if "unique constraint" in str(e).lower() and "meeting_number" in str(e).lower():
                raise UniqueConstraintError(f"Meeting number conflict - please retry: {str(e)}")
            elif "foreign key" in str(e).lower() and "tag" in str(e).lower():
                raise ForeignKeyError(f"One or more specified tags do not exist: {str(e)}")
            elif "foreign key" in str(e).lower() and "template" in str(e).lower():
                raise ForeignKeyError(f"Specified meeting template does not exist: {str(e)}")
            elif "foreign key" in str(e).lower():
                raise ForeignKeyError(f"Referenced entity not found: {str(e)}")
            elif "check constraint" in str(e).lower():
                raise ValidationError(f"Meeting data validation failed: {str(e)}")
            elif "connection" in str(e).lower():
                raise DatabaseConnectionError(f"Database connection failed: {str(e)}")
            elif "timeout" in str(e).lower():
                raise DatabaseTimeoutError(f"Database operation timed out: {str(e)}")
            else:
                raise CRUDError(f"Database error: {str(e)}")
    
    def update_status(
        self, 
        db: Session, 
        meeting_id: Union[str, uuid.UUID], 
        new_status: MeetingStatus
    ) -> Optional[Meeting]:
        """Update meeting status with validation"""
        try:
            meeting = self.get_by_id(db, meeting_id)
            if not meeting:
                raise NotFoundError(f"Meeting {meeting_id} not found")
            
            # Validate status transition (this is also done in the model)
            old_status = meeting.status
            meeting.status = new_status
            
            # Update timing fields based on status
            now = datetime.utcnow()
            if new_status == MeetingStatus.ACTIVE and not meeting.actual_start:
                meeting.actual_start = now
            elif new_status == MeetingStatus.ENDED and not meeting.actual_end:
                meeting.actual_end = now
            
            db.commit()
            db.refresh(meeting)
            
            logger.info(f"Meeting {meeting_id} status changed from {old_status} to {new_status}")
            return meeting
            
        except ValidationError:
            db.rollback()
            raise
        except SQLAlchemyError as e:
            db.rollback()
            logger.error(f"Error updating meeting status: {e}")
            # Re-raise with specific context for status updates
            if "check constraint" in str(e).lower():
                raise ValidationError(f"Invalid status transition: {str(e)}")
            else:
                raise CRUDError(f"Database error: {str(e)}")
    
    def get_upcoming_meetings(
        self, 
        db: Session, 
        user_id: str, 
        hours_ahead: int = 24
    ) -> List[Meeting]:
        """Get upcoming meetings for a user"""
        try:
            cutoff_time = datetime.utcnow() + timedelta(hours=hours_ahead)
            
            return db.query(Meeting).join(Participant).filter(
                and_(
                    Participant.user_id == user_id,
                    Meeting.scheduled_start <= cutoff_time,
                    Meeting.scheduled_start >= datetime.utcnow(),
                    Meeting.status == MeetingStatus.NOT_STARTED
                )
            ).order_by(Meeting.scheduled_start).all()
            
        except SQLAlchemyError as e:
            logger.error(f"Error getting upcoming meetings: {e}")
            return []
    
    def get_meeting_statistics(self, db: Session, meeting_id: Union[str, uuid.UUID]) -> Dict[str, Any]:
        """Get comprehensive meeting statistics"""
        try:
            meeting = self.get_with_relationships(db, meeting_id)
            if not meeting:
                raise NotFoundError(f"Meeting {meeting_id} not found")
            
            # Calculate basic statistics
            total_participants = len(meeting.participants)
            active_participants = len([p for p in meeting.participants if p.status == ParticipantStatus.JOINED])
            
            # Calculate speaking time distribution
            speaking_times = [(p.display_name, p.speaking_time_seconds) for p in meeting.participants]
            speaking_times.sort(key=lambda x: x[1], reverse=True)
            
            # Calculate engagement metrics
            avg_engagement = sum(p.engagement_score for p in meeting.participants) / max(total_participants, 1)
            
            # Count insights by type
            insight_counts = {}
            for insight_type in InsightType:
                count = len([i for i in meeting.insights if i.insight_type == insight_type])
                insight_counts[insight_type.value] = count
            
            return {
                "meeting_id": str(meeting.id),
                "status": meeting.status.value,
                "duration_minutes": meeting.duration_minutes,
                "participants": {
                    "total": total_participants,
                    "active": active_participants,
                    "speaking_times": speaking_times[:10],  # Top 10 speakers
                    "average_engagement": round(avg_engagement, 2)
                },
                "content": {
                    "transcript_count": len(meeting.transcripts),
                    "total_words": sum(t.word_count for t in meeting.transcripts),
                    "insights_by_type": insight_counts
                },
                "timing": {
                    "scheduled_start": meeting.scheduled_start.isoformat() if meeting.scheduled_start else None,
                    "actual_start": meeting.actual_start.isoformat() if meeting.actual_start else None,
                    "actual_end": meeting.actual_end.isoformat() if meeting.actual_end else None,
                    "is_overdue": meeting.is_overdue
                }
            }
            
        except NotFoundError:
            raise
        except SQLAlchemyError as e:
            logger.error(f"Error getting meeting statistics: {e}")
            # Check for specific issues with statistics calculation
            if "timeout" in str(e).lower():
                raise DatabaseTimeoutError(f"Statistics calculation timeout - meeting may have too much data: {str(e)}")
            elif "connection" in str(e).lower():
                raise DatabaseConnectionError(f"Database connection failed: {str(e)}")
            else:
                raise CRUDError(f"Database error: {str(e)}")
    
    def _generate_meeting_number(self, db: Session) -> str:
        """Generate a unique meeting number"""
        today = datetime.now().strftime("%Y%m%d")
        
        # Find the highest meeting number for today
        pattern = f"{today}-%"
        result = db.query(func.max(Meeting.meeting_number)).filter(
            Meeting.meeting_number.like(pattern)
        ).scalar()
        
        if result:
            # Extract the sequence number and increment
            try:
                sequence = int(result.split('-')[1]) + 1
            except (IndexError, ValueError):
                sequence = 1
        else:
            sequence = 1
        
        return f"{today}-{sequence:04d}"

# Participant CRUD Operations
class ParticipantCRUD(BaseCRUD):
    """CRUD operations for Participant model"""
    
    def __init__(self):
        super().__init__(Participant)
    
    def get_by_meeting_and_email(
        self, 
        db: Session, 
        meeting_id: Union[str, uuid.UUID], 
        email: str
    ) -> Optional[Participant]:
        """Get participant by meeting and email"""
        try:
            if isinstance(meeting_id, str):
                meeting_id = uuid.UUID(meeting_id)
            
            return db.query(Participant).filter(
                and_(
                    Participant.meeting_id == meeting_id,
                    Participant.email == email
                )
            ).first()
        except (ValueError, SQLAlchemyError) as e:
            logger.error(f"Error getting participant by meeting and email: {e}")
            return None
    
    def update_engagement_metrics(
        self,
        db: Session,
        participant_id: Union[str, uuid.UUID],
        metrics: Dict[str, Union[int, float]]
    ) -> Optional[Participant]:
        """Update participant engagement metrics"""
        try:
            participant = self.get_by_id(db, participant_id)
            if not participant:
                raise NotFoundError(f"Participant {participant_id} not found")
            
            # Update engagement fields
            for field, value in metrics.items():
                if hasattr(participant, field):
                    setattr(participant, field, value)
            
            db.commit()
            db.refresh(participant)
            return participant
            
        except NotFoundError:
            raise
        except SQLAlchemyError as e:
            db.rollback()
            logger.error(f"Error updating participant engagement: {e}")
            # Re-raise with specific context for engagement updates
            if "check constraint" in str(e).lower():
                raise ValidationError(f"Invalid engagement metric values: {str(e)}")
            else:
                raise CRUDError(f"Database error: {str(e)}")

# Transcript CRUD Operations
class TranscriptCRUD(BaseCRUD):
    """CRUD operations for Transcript model"""
    
    def __init__(self):
        super().__init__(Transcript)
    
    def create_bulk(self, db: Session, transcripts: List[TranscriptCreate]) -> List[Transcript]:
        """Create multiple transcript entries efficiently"""
        try:
            db_transcripts = []
            for transcript_data in transcripts:
                transcript_dict = transcript_data.dict()
                transcript_dict['id'] = uuid.uuid4()
                db_transcript = Transcript(**transcript_dict)
                db_transcripts.append(db_transcript)
            
            db.add_all(db_transcripts)
            db.commit()
            
            for transcript in db_transcripts:
                db.refresh(transcript)
            
            return db_transcripts
            
        except SQLAlchemyError as e:
            db.rollback()
            logger.error(f"Error creating bulk transcripts: {e}")
            # Re-raise with specific context for bulk operations
            if "unique constraint" in str(e).lower():
                raise UniqueConstraintError(f"Duplicate transcript entries detected: {str(e)}")
            elif "foreign key" in str(e).lower() and "meeting" in str(e).lower():
                raise ForeignKeyError(f"Invalid meeting ID in transcript data: {str(e)}")
            elif "foreign key" in str(e).lower() and "participant" in str(e).lower():
                raise ForeignKeyError(f"Invalid participant ID in transcript data: {str(e)}")
            elif "foreign key" in str(e).lower():
                raise ForeignKeyError(f"Referenced entity not found: {str(e)}")
            elif "check constraint" in str(e).lower():
                raise ValidationError(f"Invalid transcript data: {str(e)}")
            elif "connection" in str(e).lower():
                raise DatabaseConnectionError(f"Database connection failed: {str(e)}")
            elif "timeout" in str(e).lower():
                raise DatabaseTimeoutError(f"Database operation timed out: {str(e)}")
            else:
                raise CRUDError(f"Database error: {str(e)}")
    
    def get_by_meeting_time_range(
        self,
        db: Session,
        meeting_id: Union[str, uuid.UUID],
        start_time: float,
        end_time: float
    ) -> List[Transcript]:
        """Get transcripts within a specific time range"""
        try:
            if isinstance(meeting_id, str):
                meeting_id = uuid.UUID(meeting_id)
            
            return db.query(Transcript).filter(
                and_(
                    Transcript.meeting_id == meeting_id,
                    Transcript.start_time_seconds >= start_time,
                    Transcript.end_time_seconds <= end_time
                )
            ).order_by(Transcript.start_time_seconds).all()
            
        except (ValueError, SQLAlchemyError) as e:
            logger.error(f"Error getting transcripts by time range: {e}")
            return []

# AI Insight CRUD Operations
class AIInsightCRUD(BaseCRUD):
    """CRUD operations for AI Insight model"""
    
    def __init__(self):
        super().__init__(AIInsight)
    
    def get_by_meeting_and_type(
        self,
        db: Session,
        meeting_id: Union[str, uuid.UUID],
        insight_type: InsightType
    ) -> List[AIInsight]:
        """Get insights by meeting and type"""
        try:
            if isinstance(meeting_id, str):
                meeting_id = uuid.UUID(meeting_id)
            
            return db.query(AIInsight).filter(
                and_(
                    AIInsight.meeting_id == meeting_id,
                    AIInsight.insight_type == insight_type
                )
            ).order_by(desc(AIInsight.confidence_score)).all()
            
        except (ValueError, SQLAlchemyError) as e:
            logger.error(f"Error getting insights by meeting and type: {e}")
            return []

# Initialize CRUD instances
meeting_crud = MeetingCRUD()
participant_crud = ParticipantCRUD()
transcript_crud = TranscriptCRUD()
ai_insight_crud = AIInsightCRUD()

# Export CRUD instances
__all__ = [
    "meeting_crud",
    "participant_crud", 
    "transcript_crud",
    "ai_insight_crud",
    "MeetingCreate",
    "MeetingUpdate",
    "ParticipantCreate",
    "TranscriptCreate",
    "AIInsightCreate",
    "PaginationParams",
    "MeetingFilters",
    "NotFoundError",
    "ValidationError",
    "ConflictError",
    "CRUDError",
    "DatabaseConnectionError",
    "DatabaseTimeoutError",
    "ForeignKeyError",
    "UniqueConstraintError"
]