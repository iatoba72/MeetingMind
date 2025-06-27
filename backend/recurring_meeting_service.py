# Recurring Meeting Detection and Automation Service
# Automatically detects meeting patterns and applies templates for consistent meeting management

import asyncio
import logging
from datetime import datetime, timedelta, timezone
from typing import List, Optional, Dict, Any, Tuple
from dataclasses import dataclass
from enum import Enum
import re
from dateutil import rrule
from dateutil.parser import parse as parse_date

from sqlalchemy.orm import Session
from sqlalchemy import and_, or_, func

from models import (
    Meeting, MeetingTemplate, RecurringMeetingSeries, RecurringMeetingException,
    RecurrenceType, MeetingStatus, WorkflowState, MeetingWorkflow
)

logger = logging.getLogger(__name__)

@dataclass
class PatternDetectionResult:
    """Result of pattern detection analysis"""
    pattern_type: RecurrenceType
    confidence: float
    interval: int
    start_date: datetime
    suggested_template: Optional[str] = None
    pattern_data: Dict[str, Any] = None
    meetings_analyzed: int = 0

class RecurringMeetingService:
    """
    Service for detecting and managing recurring meeting patterns
    
    Key Features:
    - Automatic pattern detection from existing meetings
    - Template-based recurring meeting creation
    - Exception handling for modified instances
    - Smart scheduling with conflict detection
    """
    
    def __init__(self, db: Session):
        self.db = db
        self.pattern_detectors = {
            RecurrenceType.DAILY: self._detect_daily_pattern,
            RecurrenceType.WEEKLY: self._detect_weekly_pattern,
            RecurrenceType.MONTHLY: self._detect_monthly_pattern,
            RecurrenceType.QUARTERLY: self._detect_quarterly_pattern,
        }
    
    async def detect_patterns(self, user_id: str, organization_id: Optional[str] = None, 
                            days_back: int = 90) -> List[PatternDetectionResult]:
        """
        Detect recurring patterns in user's meeting history
        
        Args:
            user_id: User to analyze meetings for
            organization_id: Optional organization filter
            days_back: How many days back to analyze
            
        Returns:
            List of detected patterns with confidence scores
        """
        try:
            # Get recent meetings for analysis
            cutoff_date = datetime.now(timezone.utc) - timedelta(days=days_back)
            
            query = self.db.query(Meeting).filter(
                and_(
                    Meeting.created_by == user_id,
                    Meeting.created_at >= cutoff_date,
                    Meeting.status != MeetingStatus.CANCELLED
                )
            )
            
            if organization_id:
                query = query.filter(Meeting.organization_id == organization_id)
            
            meetings = query.order_by(Meeting.scheduled_start).all()
            
            if len(meetings) < 3:
                logger.info(f"Not enough meetings ({len(meetings)}) for pattern detection")
                return []
            
            # Group meetings by title similarity
            meeting_groups = self._group_similar_meetings(meetings)
            
            patterns = []
            for group_name, group_meetings in meeting_groups.items():
                if len(group_meetings) >= 3:  # Need at least 3 meetings for pattern
                    pattern = await self._analyze_meeting_group(group_meetings)
                    if pattern and pattern.confidence > 0.7:  # High confidence threshold
                        patterns.append(pattern)
            
            return sorted(patterns, key=lambda p: p.confidence, reverse=True)
            
        except Exception as e:
            logger.error(f"Error detecting patterns: {str(e)}")
            return []
    
    def _group_similar_meetings(self, meetings: List[Meeting]) -> Dict[str, List[Meeting]]:
        """Group meetings by title similarity and duration"""
        groups = {}
        
        for meeting in meetings:
            # Create a normalized key for grouping
            title_key = self._normalize_meeting_title(meeting.title)
            duration_key = f"{meeting.duration_minutes or 60}min"
            group_key = f"{title_key}_{duration_key}"
            
            if group_key not in groups:
                groups[group_key] = []
            groups[group_key].append(meeting)
        
        return groups
    
    def _normalize_meeting_title(self, title: str) -> str:
        """Normalize meeting title for pattern matching"""
        # Remove dates and numbers
        title = re.sub(r'\d{1,2}[/-]\d{1,2}[/-]\d{2,4}', '', title)
        title = re.sub(r'\d{4}-\d{2}-\d{2}', '', title)
        title = re.sub(r'#\d+', '', title)
        title = re.sub(r'\s+', ' ', title)
        return title.strip().lower()
    
    async def _analyze_meeting_group(self, meetings: List[Meeting]) -> Optional[PatternDetectionResult]:
        """Analyze a group of meetings to detect patterns"""
        if len(meetings) < 3:
            return None
        
        # Sort meetings by start time
        meetings.sort(key=lambda m: m.scheduled_start)
        
        # Try each pattern detector
        best_pattern = None
        best_confidence = 0.0
        
        for pattern_type, detector in self.pattern_detectors.items():
            result = detector(meetings)
            if result and result.confidence > best_confidence:
                best_pattern = result
                best_confidence = result.confidence
        
        return best_pattern
    
    def _detect_daily_pattern(self, meetings: List[Meeting]) -> Optional[PatternDetectionResult]:
        """Detect daily meeting patterns"""
        intervals = []
        
        for i in range(1, len(meetings)):
            delta = meetings[i].scheduled_start - meetings[i-1].scheduled_start
            intervals.append(delta.days)
        
        # Check for consistent daily intervals
        if len(set(intervals)) <= 2:  # Allow some variation
            avg_interval = sum(intervals) / len(intervals)
            if 0.8 <= avg_interval <= 7:  # Daily to weekly range
                confidence = 1.0 - (abs(avg_interval - round(avg_interval)) * 0.5)
                
                return PatternDetectionResult(
                    pattern_type=RecurrenceType.DAILY,
                    confidence=min(confidence, 0.95),
                    interval=round(avg_interval),
                    start_date=meetings[0].scheduled_start,
                    meetings_analyzed=len(meetings),
                    pattern_data={'intervals': intervals, 'avg_interval': avg_interval}
                )
        
        return None
    
    def _detect_weekly_pattern(self, meetings: List[Meeting]) -> Optional[PatternDetectionResult]:
        """Detect weekly meeting patterns"""
        # Check if meetings occur on the same day of week
        days_of_week = [m.scheduled_start.weekday() for m in meetings]
        
        if len(set(days_of_week)) == 1:  # Same day of week
            intervals = []
            for i in range(1, len(meetings)):
                delta = meetings[i].scheduled_start - meetings[i-1].scheduled_start
                week_interval = delta.days / 7
                intervals.append(week_interval)
            
            if intervals and all(0.8 <= interval <= 4.2 for interval in intervals):
                avg_interval = sum(intervals) / len(intervals)
                confidence = 0.9 - (abs(avg_interval - round(avg_interval)) * 0.3)
                
                return PatternDetectionResult(
                    pattern_type=RecurrenceType.WEEKLY,
                    confidence=min(confidence, 0.95),
                    interval=round(avg_interval),
                    start_date=meetings[0].scheduled_start,
                    meetings_analyzed=len(meetings),
                    pattern_data={
                        'day_of_week': days_of_week[0],
                        'intervals': intervals,
                        'avg_interval': avg_interval
                    }
                )
        
        return None
    
    def _detect_monthly_pattern(self, meetings: List[Meeting]) -> Optional[PatternDetectionResult]:
        """Detect monthly meeting patterns"""
        # Check for same day of month or same week/day pattern
        days_of_month = [m.scheduled_start.day for m in meetings]
        
        # Same day of month pattern
        if len(set(days_of_month)) <= 2:  # Allow some variation
            confidence = 0.8 if len(set(days_of_month)) == 1 else 0.6
            
            return PatternDetectionResult(
                pattern_type=RecurrenceType.MONTHLY,
                confidence=confidence,
                interval=1,
                start_date=meetings[0].scheduled_start,
                meetings_analyzed=len(meetings),
                pattern_data={'days_of_month': days_of_month}
            )
        
        return None
    
    def _detect_quarterly_pattern(self, meetings: List[Meeting]) -> Optional[PatternDetectionResult]:
        """Detect quarterly meeting patterns"""
        if len(meetings) < 3:
            return None
        
        # Check for ~3 month intervals
        intervals = []
        for i in range(1, len(meetings)):
            delta = meetings[i].scheduled_start - meetings[i-1].scheduled_start
            month_interval = delta.days / 30.44  # Average days per month
            intervals.append(month_interval)
        
        if intervals and all(2.5 <= interval <= 4.5 for interval in intervals):
            avg_interval = sum(intervals) / len(intervals)
            confidence = 0.8 - (abs(avg_interval - 3) * 0.2)
            
            return PatternDetectionResult(
                pattern_type=RecurrenceType.QUARTERLY,
                confidence=min(confidence, 0.9),
                interval=1,
                start_date=meetings[0].scheduled_start,
                meetings_analyzed=len(meetings),
                pattern_data={'month_intervals': intervals}
            )
        
        return None
    
    async def create_recurring_series(self, template_id: str, recurrence_config: Dict[str, Any],
                                    user_id: str, organization_id: Optional[str] = None) -> RecurringMeetingSeries:
        """
        Create a new recurring meeting series
        
        Args:
            template_id: Template to use for meetings
            recurrence_config: Recurrence configuration
            user_id: User creating the series
            organization_id: Optional organization
            
        Returns:
            Created recurring meeting series
        """
        try:
            # Validate template exists
            template = self.db.query(MeetingTemplate).filter(
                MeetingTemplate.id == template_id
            ).first()
            
            if not template:
                raise ValueError(f"Template {template_id} not found")
            
            # Create recurring series
            series = RecurringMeetingSeries(
                name=recurrence_config.get('name', f"Recurring {template.name}"),
                description=recurrence_config.get('description', ''),
                template_id=template_id,
                recurrence_type=RecurrenceType(recurrence_config['recurrence_type']),
                recurrence_interval=recurrence_config.get('interval', 1),
                recurrence_rule=recurrence_config.get('rule', {}),
                start_date=parse_date(recurrence_config['start_date']),
                end_date=parse_date(recurrence_config['end_date']) if recurrence_config.get('end_date') else None,
                start_time=recurrence_config.get('start_time', '09:00:00'),
                duration_minutes=recurrence_config.get('duration_minutes', template.default_duration_minutes),
                timezone=recurrence_config.get('timezone', 'UTC'),
                created_by=user_id,
                organization_id=organization_id
            )
            
            self.db.add(series)
            self.db.commit()
            self.db.refresh(series)
            
            # Generate initial meetings
            await self._generate_upcoming_meetings(series, look_ahead_days=90)
            
            return series
            
        except Exception as e:
            self.db.rollback()
            logger.error(f"Error creating recurring series: {str(e)}")
            raise
    
    async def _generate_upcoming_meetings(self, series: RecurringMeetingSeries, 
                                        look_ahead_days: int = 90) -> List[Meeting]:
        """Generate upcoming meetings for a recurring series"""
        try:
            # Calculate occurrences using dateutil
            start_date = series.start_date
            end_date = series.end_date or (datetime.now(timezone.utc) + timedelta(days=look_ahead_days))
            
            # Build recurrence rule
            freq_map = {
                RecurrenceType.DAILY: rrule.DAILY,
                RecurrenceType.WEEKLY: rrule.WEEKLY,
                RecurrenceType.MONTHLY: rrule.MONTHLY,
                RecurrenceType.QUARTERLY: rrule.MONTHLY,  # Will multiply interval by 3
            }
            
            interval = series.recurrence_interval
            if series.recurrence_type == RecurrenceType.QUARTERLY:
                interval = interval * 3
            
            # Generate occurrences
            rule = rrule.rrule(
                freq=freq_map[series.recurrence_type],
                interval=interval,
                dtstart=start_date,
                until=end_date,
                count=50  # Limit to prevent infinite generation
            )
            
            meetings = []
            for occurrence_date in rule:
                # Check if this occurrence has an exception
                exception = self.db.query(RecurringMeetingException).filter(
                    and_(
                        RecurringMeetingException.series_id == series.id,
                        RecurringMeetingException.original_date == occurrence_date
                    )
                ).first()
                
                if exception and exception.exception_type == 'cancelled':
                    continue
                
                # Parse start time
                start_time_parts = series.start_time.split(':')
                meeting_start = occurrence_date.replace(
                    hour=int(start_time_parts[0]),
                    minute=int(start_time_parts[1]),
                    second=int(start_time_parts[2]) if len(start_time_parts) > 2 else 0
                )
                
                meeting_end = meeting_start + timedelta(minutes=series.duration_minutes)
                
                # Create meeting from template
                meeting = Meeting(
                    title=f"{series.template.name} - {occurrence_date.strftime('%Y-%m-%d')}",
                    description=series.template.description or series.description,
                    scheduled_start=meeting_start,
                    scheduled_end=meeting_end,
                    timezone=series.timezone,
                    template_id=series.template_id,
                    recurring_series_id=series.id,
                    created_by=series.created_by,
                    organization_id=series.organization_id,
                    agenda=series.template.agenda_template,
                    **series.template.default_settings
                )
                
                # Generate unique meeting number
                meeting.meeting_number = f"REC-{series.id.hex[:8]}-{len(meetings)+1:03d}"
                
                self.db.add(meeting)
                meetings.append(meeting)
            
            self.db.commit()
            
            # Create workflows for each meeting
            for meeting in meetings:
                await self._create_meeting_workflow(meeting)
            
            return meetings
            
        except Exception as e:
            self.db.rollback()
            logger.error(f"Error generating meetings for series {series.id}: {str(e)}")
            raise
    
    async def _create_meeting_workflow(self, meeting: Meeting) -> MeetingWorkflow:
        """Create workflow for a meeting"""
        workflow = MeetingWorkflow(
            meeting_id=meeting.id,
            current_state=WorkflowState.SCHEDULED,
            workflow_name='recurring_meeting',
            automation_config={
                'auto_send_agenda': True,
                'send_reminders': True,
                'generate_insights': True,
                'send_follow_up': True
            }
        )
        
        self.db.add(workflow)
        self.db.commit()
        
        return workflow
    
    async def apply_template_to_pattern(self, pattern: PatternDetectionResult, 
                                      template_id: str, user_id: str,
                                      organization_id: Optional[str] = None) -> RecurringMeetingSeries:
        """Convert detected pattern into a recurring series with template"""
        recurrence_config = {
            'name': f"Auto-detected {pattern.pattern_type.value} series",
            'description': f"Automatically created from detected pattern (confidence: {pattern.confidence:.1%})",
            'recurrence_type': pattern.pattern_type.value,
            'interval': pattern.interval,
            'start_date': pattern.start_date.isoformat(),
            'duration_minutes': 60,  # Default, will be overridden by template
        }
        
        return await self.create_recurring_series(
            template_id=template_id,
            recurrence_config=recurrence_config,
            user_id=user_id,
            organization_id=organization_id
        )
    
    async def suggest_templates_for_pattern(self, pattern: PatternDetectionResult,
                                          user_id: str, organization_id: Optional[str] = None) -> List[MeetingTemplate]:
        """Suggest appropriate templates for a detected pattern"""
        try:
            # Query templates based on pattern characteristics
            query = self.db.query(MeetingTemplate).filter(
                or_(
                    MeetingTemplate.is_public == True,
                    MeetingTemplate.created_by == user_id,
                    MeetingTemplate.organization_id == organization_id
                )
            )
            
            # Filter by category based on pattern type
            category_suggestions = {
                RecurrenceType.DAILY: ['standup', 'team'],
                RecurrenceType.WEEKLY: ['standup', 'planning', 'review'],
                RecurrenceType.MONTHLY: ['planning', 'review', 'retrospective'],
                RecurrenceType.QUARTERLY: ['planning', 'review', 'presentation']
            }
            
            suggested_categories = category_suggestions.get(pattern.pattern_type, [])
            if suggested_categories:
                query = query.filter(MeetingTemplate.category.in_(suggested_categories))
            
            templates = query.order_by(MeetingTemplate.created_at.desc()).limit(5).all()
            
            return templates
            
        except Exception as e:
            logger.error(f"Error suggesting templates: {str(e)}")
            return []
    
    async def handle_series_exception(self, series_id: str, original_date: datetime,
                                    exception_type: str, user_id: str,
                                    new_date: Optional[datetime] = None,
                                    modifications: Optional[Dict] = None) -> RecurringMeetingException:
        """Handle exceptions to recurring series (cancellations, reschedules, modifications)"""
        try:
            # Find the affected meeting
            meeting = self.db.query(Meeting).filter(
                and_(
                    Meeting.recurring_series_id == series_id,
                    func.date(Meeting.scheduled_start) == original_date.date()
                )
            ).first()
            
            # Create exception record
            exception = RecurringMeetingException(
                series_id=series_id,
                meeting_id=meeting.id if meeting else None,
                original_date=original_date,
                exception_type=exception_type,
                new_date=new_date,
                modifications=modifications or {},
                created_by=user_id
            )
            
            self.db.add(exception)
            
            # Handle the meeting based on exception type
            if exception_type == 'cancelled' and meeting:
                meeting.status = MeetingStatus.CANCELLED
            elif exception_type == 'rescheduled' and meeting and new_date:
                meeting.scheduled_start = new_date
                meeting.scheduled_end = new_date + timedelta(minutes=meeting.duration_minutes or 60)
            elif exception_type == 'modified' and meeting and modifications:
                for field, value in modifications.items():
                    if hasattr(meeting, field):
                        setattr(meeting, field, value)
            
            self.db.commit()
            
            return exception
            
        except Exception as e:
            self.db.rollback()
            logger.error(f"Error handling series exception: {str(e)}")
            raise
    
    async def get_upcoming_occurrences(self, series_id: str, days_ahead: int = 30) -> List[Meeting]:
        """Get upcoming meetings for a recurring series"""
        cutoff_date = datetime.now(timezone.utc) + timedelta(days=days_ahead)
        
        return self.db.query(Meeting).filter(
            and_(
                Meeting.recurring_series_id == series_id,
                Meeting.scheduled_start <= cutoff_date,
                Meeting.scheduled_start >= datetime.now(timezone.utc),
                Meeting.status != MeetingStatus.CANCELLED
            )
        ).order_by(Meeting.scheduled_start).all()
    
    async def update_series_template(self, series_id: str, new_template_id: str, 
                                   apply_to_future: bool = True) -> RecurringMeetingSeries:
        """Update template for recurring series"""
        try:
            series = self.db.query(RecurringMeetingSeries).filter(
                RecurringMeetingSeries.id == series_id
            ).first()
            
            if not series:
                raise ValueError(f"Series {series_id} not found")
            
            # Update series template
            series.template_id = new_template_id
            
            if apply_to_future:
                # Update future meetings
                future_meetings = self.db.query(Meeting).filter(
                    and_(
                        Meeting.recurring_series_id == series_id,
                        Meeting.scheduled_start > datetime.now(timezone.utc),
                        Meeting.status == MeetingStatus.NOT_STARTED
                    )
                ).all()
                
                # Get new template
                new_template = self.db.query(MeetingTemplate).filter(
                    MeetingTemplate.id == new_template_id
                ).first()
                
                if new_template:
                    for meeting in future_meetings:
                        meeting.template_id = new_template_id
                        meeting.agenda = new_template.agenda_template
                        # Apply new template settings
                        for key, value in new_template.default_settings.items():
                            if hasattr(meeting, key):
                                setattr(meeting, key, value)
            
            self.db.commit()
            self.db.refresh(series)
            
            return series
            
        except Exception as e:
            self.db.rollback()
            logger.error(f"Error updating series template: {str(e)}")
            raise