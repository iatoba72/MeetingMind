# Action Item Tracking and Management Service
# Comprehensive action item lifecycle management with automation

import asyncio
import logging
from datetime import datetime, timedelta, timezone
from typing import List, Optional, Dict, Any, Tuple
from dataclasses import dataclass
import re

from sqlalchemy.orm import Session
from sqlalchemy import and_, or_, func, desc

from models import (
    ActionItem, ActionItemUpdate, ActionItemStatus, Meeting, 
    AIInsight, Participant, WorkflowNotification
)
from email_generation_service import EmailGenerationService

logger = logging.getLogger(__name__)

@dataclass
class ActionItemExtractionResult:
    """Result of action item extraction from text"""
    title: str
    description: str
    assigned_to: Optional[str] = None
    priority: str = 'medium'
    category: str = 'general'
    confidence: float = 0.0
    context: str = ''
    due_date: Optional[datetime] = None

class ActionItemService:
    """
    Service for managing action item lifecycle and automation
    
    Key Features:
    - Automatic extraction from meeting transcripts
    - Assignment and delegation workflow
    - Progress tracking with status updates
    - Automated reminders and escalation
    - Integration with email notifications
    """
    
    def __init__(self, db: Session, email_service: EmailGenerationService):
        self.db = db
        self.email_service = email_service
        self.extraction_patterns = self._define_extraction_patterns()
    
    def _define_extraction_patterns(self) -> List[Dict[str, Any]]:
        """Define patterns for extracting action items from text"""
        return [
            {
                'pattern': r'(?i)(action item|task|todo|assignment):\s*(.+?)(?=\.|$|\n)',
                'priority': 'high',
                'confidence': 0.9
            },
            {
                'pattern': r'(?i)([a-zA-Z]+)\s+(will|needs to|should|must)\s+(.+?)(?=\.|$|\n)',
                'priority': 'medium',
                'confidence': 0.8,
                'extract_assignee': True
            },
            {
                'pattern': r'(?i)(follow up|follow-up)\s+(with|on)\s+(.+?)(?=\.|$|\n)',
                'priority': 'medium',
                'confidence': 0.7,
                'category': 'follow_up'
            },
            {
                'pattern': r'(?i)(assign|assigned|responsibility|responsible)\s+(.+?)\s+(to|for)\s+([a-zA-Z]+)',
                'priority': 'high',
                'confidence': 0.85,
                'extract_assignee': True
            },
            {
                'pattern': r'(?i)(next steps?|action points?|deliverables?):?\s*(.+?)(?=\.|$|\n)',
                'priority': 'medium',
                'confidence': 0.75
            },
            {
                'pattern': r'(?i)(deadline|due date|by)\s+(.+?)(?=\.|$|\n)',
                'priority': 'high',
                'confidence': 0.8,
                'extract_deadline': True
            }
        ]
    
    async def extract_action_items_from_text(self, text: str, meeting_id: str,
                                           participants: List[Participant] = None) -> List[ActionItemExtractionResult]:
        """
        Extract action items from meeting text using pattern matching and NLP
        
        Args:
            text: Text to analyze (transcript, notes, etc.)
            meeting_id: Associated meeting ID
            participants: Meeting participants for assignment matching
            
        Returns:
            List of extracted action items
        """
        try:
            extracted_items = []
            participant_names = [p.display_name.lower() for p in participants] if participants else []
            
            # Split text into sentences for better analysis
            sentences = self._split_into_sentences(text)
            
            for sentence in sentences:
                for pattern_config in self.extraction_patterns:
                    matches = re.finditer(pattern_config['pattern'], sentence)
                    
                    for match in matches:
                        action_item = self._process_pattern_match(
                            match, pattern_config, sentence, participant_names
                        )
                        
                        if action_item and action_item.confidence > 0.5:
                            extracted_items.append(action_item)
            
            # Remove duplicates and merge similar items
            filtered_items = self._deduplicate_action_items(extracted_items)
            
            return filtered_items
            
        except Exception as e:
            logger.error(f"Error extracting action items: {str(e)}")
            return []
    
    def _split_into_sentences(self, text: str) -> List[str]:
        """Split text into sentences for analysis"""
        # Simple sentence splitting - could be enhanced with NLP libraries
        sentences = re.split(r'[.!?]+', text)
        return [s.strip() for s in sentences if s.strip()]
    
    def _process_pattern_match(self, match, pattern_config: Dict, sentence: str,
                             participant_names: List[str]) -> Optional[ActionItemExtractionResult]:
        """Process a regex match to create action item"""
        try:
            groups = match.groups()
            
            # Extract main content
            if len(groups) >= 2:
                title = groups[1].strip()
                description = sentence.strip()
            else:
                title = groups[0].strip() if groups else sentence.strip()
                description = sentence.strip()
            
            # Extract assignee if pattern supports it
            assigned_to = None
            if pattern_config.get('extract_assignee') and len(groups) >= 2:
                for group in groups:
                    if group and group.lower() in participant_names:
                        assigned_to = group
                        break
            
            # Extract due date if pattern supports it
            due_date = None
            if pattern_config.get('extract_deadline'):
                due_date = self._extract_due_date(sentence)
            
            return ActionItemExtractionResult(
                title=title[:500],  # Limit title length
                description=description,
                assigned_to=assigned_to,
                priority=pattern_config.get('priority', 'medium'),
                category=pattern_config.get('category', 'general'),
                confidence=pattern_config.get('confidence', 0.5),
                context=sentence,
                due_date=due_date
            )
            
        except Exception as e:
            logger.error(f"Error processing pattern match: {str(e)}")
            return None
    
    def _extract_due_date(self, text: str) -> Optional[datetime]:
        """Extract due date from text"""
        # Simple date extraction - could be enhanced with dateutil or spacy
        date_patterns = [
            r'(?i)(tomorrow)',
            r'(?i)(next week)',
            r'(?i)(next month)',
            r'(?i)(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})',
            r'(?i)(monday|tuesday|wednesday|thursday|friday|saturday|sunday)',
            r'(?i)(by|before|until)\s+(.+?)(?=\.|$|\n)'
        ]
        
        now = datetime.now(timezone.utc)
        
        for pattern in date_patterns:
            match = re.search(pattern, text)
            if match:
                date_text = match.group(1).lower()
                
                if 'tomorrow' in date_text:
                    return now + timedelta(days=1)
                elif 'next week' in date_text:
                    return now + timedelta(weeks=1)
                elif 'next month' in date_text:
                    return now + timedelta(days=30)
                elif any(day in date_text for day in ['monday', 'tuesday', 'wednesday', 'thursday', 'friday']):
                    # Add 7 days for next week occurrence
                    return now + timedelta(days=7)
        
        return None
    
    def _deduplicate_action_items(self, items: List[ActionItemExtractionResult]) -> List[ActionItemExtractionResult]:
        """Remove duplicate and similar action items"""
        if not items:
            return []
        
        # Sort by confidence (highest first)
        items.sort(key=lambda x: x.confidence, reverse=True)
        
        filtered_items = []
        for item in items:
            # Check for similarity with existing items
            is_duplicate = False
            for existing_item in filtered_items:
                if self._is_similar_action_item(item, existing_item):
                    is_duplicate = True
                    break
            
            if not is_duplicate:
                filtered_items.append(item)
        
        return filtered_items
    
    def _is_similar_action_item(self, item1: ActionItemExtractionResult, 
                               item2: ActionItemExtractionResult) -> bool:
        """Check if two action items are similar"""
        # Simple similarity check - could be enhanced with NLP similarity
        title_similarity = self._calculate_string_similarity(item1.title, item2.title)
        return title_similarity > 0.8
    
    def _calculate_string_similarity(self, str1: str, str2: str) -> float:
        """Calculate similarity between two strings"""
        # Simple Jaccard similarity
        set1 = set(str1.lower().split())
        set2 = set(str2.lower().split())
        
        if not set1 and not set2:
            return 1.0
        if not set1 or not set2:
            return 0.0
        
        intersection = set1.intersection(set2)
        union = set1.union(set2)
        
        return len(intersection) / len(union)
    
    async def create_action_item(self, meeting_id: str, title: str, description: str = '',
                               assigned_to: Optional[str] = None, priority: str = 'medium',
                               due_date: Optional[datetime] = None, category: str = 'general',
                               auto_extracted: bool = False, extraction_confidence: float = 0.0,
                               context: Optional[Dict] = None) -> ActionItem:
        """Create a new action item"""
        try:
            action_item = ActionItem(
                meeting_id=meeting_id,
                title=title,
                description=description,
                priority=priority,
                category=category,
                assigned_to=assigned_to,
                due_date=due_date,
                auto_extracted=auto_extracted,
                extraction_confidence=extraction_confidence,
                context=context or {}
            )
            
            # Set assigned status if assignee provided
            if assigned_to:
                action_item.status = ActionItemStatus.ASSIGNED
                action_item.assigned_at = datetime.now(timezone.utc)
            
            self.db.add(action_item)
            self.db.commit()
            self.db.refresh(action_item)
            
            # Send assignment notification if assigned
            if assigned_to:
                await self._send_assignment_notification(action_item)
            
            return action_item
            
        except Exception as e:
            self.db.rollback()
            logger.error(f"Error creating action item: {str(e)}")
            raise
    
    async def assign_action_item(self, action_item_id: str, assigned_to: str,
                               assigned_by: str, due_date: Optional[datetime] = None) -> ActionItem:
        """Assign an action item to a user"""
        try:
            action_item = self.db.query(ActionItem).filter(
                ActionItem.id == action_item_id
            ).first()
            
            if not action_item:
                raise ValueError(f"Action item {action_item_id} not found")
            
            # Update assignment
            action_item.assigned_to = assigned_to
            action_item.assigned_by = assigned_by
            action_item.assigned_at = datetime.now(timezone.utc)
            action_item.status = ActionItemStatus.ASSIGNED
            
            if due_date:
                action_item.due_date = due_date
            
            # Create update record
            update = ActionItemUpdate(
                action_item_id=action_item_id,
                update_text=f"Assigned to {assigned_to}",
                status_change=f"{action_item.status.value} -> {ActionItemStatus.ASSIGNED.value}",
                updated_by=assigned_by,
                update_type='assignment'
            )
            
            self.db.add(update)
            self.db.commit()
            self.db.refresh(action_item)
            
            # Send assignment notification
            await self._send_assignment_notification(action_item)
            
            return action_item
            
        except Exception as e:
            self.db.rollback()
            logger.error(f"Error assigning action item: {str(e)}")
            raise
    
    async def update_action_item_progress(self, action_item_id: str, progress_percentage: int,
                                        update_text: str, updated_by: str,
                                        new_status: Optional[ActionItemStatus] = None) -> ActionItem:
        """Update action item progress"""
        try:
            action_item = self.db.query(ActionItem).filter(
                ActionItem.id == action_item_id
            ).first()
            
            if not action_item:
                raise ValueError(f"Action item {action_item_id} not found")
            
            # Update progress
            old_progress = action_item.progress_percentage
            old_status = action_item.status
            
            action_item.progress_percentage = max(0, min(100, progress_percentage))
            
            # Auto-update status based on progress
            if progress_percentage == 0 and action_item.status == ActionItemStatus.IN_PROGRESS:
                action_item.status = ActionItemStatus.ASSIGNED
            elif progress_percentage > 0 and action_item.status == ActionItemStatus.ASSIGNED:
                action_item.status = ActionItemStatus.IN_PROGRESS
            elif progress_percentage == 100:
                action_item.status = ActionItemStatus.COMPLETED
                action_item.completed_at = datetime.now(timezone.utc)
            
            # Override with explicit status if provided
            if new_status:
                action_item.status = new_status
                if new_status == ActionItemStatus.COMPLETED:
                    action_item.completed_at = datetime.now(timezone.utc)
                    action_item.progress_percentage = 100
            
            # Create update record
            status_change = None
            if old_status != action_item.status:
                status_change = f"{old_status.value} -> {action_item.status.value}"
            
            update = ActionItemUpdate(
                action_item_id=action_item_id,
                update_text=update_text,
                status_change=status_change,
                progress_change=action_item.progress_percentage - old_progress,
                updated_by=updated_by,
                update_type='progress'
            )
            
            self.db.add(update)
            self.db.commit()
            self.db.refresh(action_item)
            
            # Send completion notification if completed
            if action_item.status == ActionItemStatus.COMPLETED:
                await self._send_completion_notification(action_item)
            
            return action_item
            
        except Exception as e:
            self.db.rollback()
            logger.error(f"Error updating action item progress: {str(e)}")
            raise
    
    async def get_action_items_for_user(self, user_id: str, status: Optional[ActionItemStatus] = None,
                                      include_assigned_by: bool = False) -> List[ActionItem]:
        """Get action items for a specific user"""
        try:
            query = self.db.query(ActionItem)
            
            if include_assigned_by:
                query = query.filter(
                    or_(
                        ActionItem.assigned_to == user_id,
                        ActionItem.assigned_by == user_id
                    )
                )
            else:
                query = query.filter(ActionItem.assigned_to == user_id)
            
            if status:
                query = query.filter(ActionItem.status == status)
            
            return query.order_by(desc(ActionItem.created_at)).all()
            
        except Exception as e:
            logger.error(f"Error getting action items for user: {str(e)}")
            return []
    
    async def get_overdue_action_items(self) -> List[ActionItem]:
        """Get all overdue action items"""
        try:
            now = datetime.now(timezone.utc)
            
            return self.db.query(ActionItem).filter(
                and_(
                    ActionItem.due_date < now,
                    ActionItem.status.in_([
                        ActionItemStatus.PENDING,
                        ActionItemStatus.ASSIGNED,
                        ActionItemStatus.IN_PROGRESS
                    ])
                )
            ).all()
            
        except Exception as e:
            logger.error(f"Error getting overdue action items: {str(e)}")
            return []
    
    async def send_reminder_notifications(self):
        """Send reminder notifications for due action items"""
        try:
            # Get action items due within 24 hours
            tomorrow = datetime.now(timezone.utc) + timedelta(hours=24)
            
            due_soon = self.db.query(ActionItem).filter(
                and_(
                    ActionItem.due_date <= tomorrow,
                    ActionItem.due_date > datetime.now(timezone.utc),
                    ActionItem.status.in_([
                        ActionItemStatus.ASSIGNED,
                        ActionItemStatus.IN_PROGRESS
                    ]),
                    or_(
                        ActionItem.last_reminder_sent.is_(None),
                        ActionItem.last_reminder_sent < datetime.now(timezone.utc) - timedelta(hours=24)
                    )
                )
            ).all()
            
            for action_item in due_soon:
                await self._send_reminder_notification(action_item)
                action_item.reminder_count += 1
                action_item.last_reminder_sent = datetime.now(timezone.utc)
            
            self.db.commit()
            
        except Exception as e:
            logger.error(f"Error sending reminder notifications: {str(e)}")
    
    async def process_action_item_automation(self):
        """Process automated action item management tasks"""
        try:
            # Update overdue status
            overdue_items = await self.get_overdue_action_items()
            for item in overdue_items:
                if item.status != ActionItemStatus.OVERDUE:
                    item.status = ActionItemStatus.OVERDUE
            
            # Send reminder notifications
            await self.send_reminder_notifications()
            
            # Auto-escalate severely overdue items
            severely_overdue = self.db.query(ActionItem).filter(
                and_(
                    ActionItem.due_date < datetime.now(timezone.utc) - timedelta(days=7),
                    ActionItem.status == ActionItemStatus.OVERDUE,
                    ActionItem.reminder_count >= 3
                )
            ).all()
            
            for item in severely_overdue:
                await self._escalate_overdue_item(item)
            
            self.db.commit()
            
        except Exception as e:
            logger.error(f"Error processing action item automation: {str(e)}")
    
    async def _send_assignment_notification(self, action_item: ActionItem):
        """Send notification when action item is assigned"""
        try:
            if not action_item.assigned_to:
                return
            
            # Get assignee email (this would need user service integration)
            # For now, we'll create a notification record
            
            await self.email_service.send_email(
                to_email=action_item.assigned_to,  # Would need actual email
                to_name=action_item.assigned_to,
                subject=f"New Action Item Assigned: {action_item.title}",
                body=f"""
                You have been assigned a new action item:
                
                Title: {action_item.title}
                Description: {action_item.description}
                Priority: {action_item.priority}
                Due Date: {action_item.due_date.strftime('%Y-%m-%d') if action_item.due_date else 'Not set'}
                
                Please log into MeetingMind to view details and update progress.
                """,
                email_type='action_item_assignment'
            )
            
        except Exception as e:
            logger.error(f"Error sending assignment notification: {str(e)}")
    
    async def _send_completion_notification(self, action_item: ActionItem):
        """Send notification when action item is completed"""
        try:
            if not action_item.assigned_by:
                return
            
            await self.email_service.send_email(
                to_email=action_item.assigned_by,  # Would need actual email
                to_name=action_item.assigned_by,
                subject=f"Action Item Completed: {action_item.title}",
                body=f"""
                An action item has been completed:
                
                Title: {action_item.title}
                Assigned to: {action_item.assigned_to}
                Completed on: {action_item.completed_at.strftime('%Y-%m-%d %H:%M') if action_item.completed_at else 'Unknown'}
                
                View details in MeetingMind dashboard.
                """,
                email_type='action_item_completion'
            )
            
        except Exception as e:
            logger.error(f"Error sending completion notification: {str(e)}")
    
    async def _send_reminder_notification(self, action_item: ActionItem):
        """Send reminder notification for due action item"""
        try:
            if not action_item.assigned_to:
                return
            
            days_until_due = (action_item.due_date - datetime.now(timezone.utc)).days
            time_text = "today" if days_until_due == 0 else f"in {days_until_due} day(s)"
            
            await self.email_service.send_email(
                to_email=action_item.assigned_to,  # Would need actual email
                to_name=action_item.assigned_to,
                subject=f"Action Item Reminder: {action_item.title}",
                body=f"""
                Reminder: You have an action item due {time_text}:
                
                Title: {action_item.title}
                Due Date: {action_item.due_date.strftime('%Y-%m-%d')}
                Current Progress: {action_item.progress_percentage}%
                
                Please update your progress in MeetingMind.
                """,
                email_type='action_item_reminder'
            )
            
        except Exception as e:
            logger.error(f"Error sending reminder notification: {str(e)}")
    
    async def _escalate_overdue_item(self, action_item: ActionItem):
        """Escalate severely overdue action item"""
        try:
            # Send escalation notification to assigned_by
            if action_item.assigned_by:
                await self.email_service.send_email(
                    to_email=action_item.assigned_by,  # Would need actual email
                    to_name=action_item.assigned_by,
                    subject=f"ESCALATION: Overdue Action Item - {action_item.title}",
                    body=f"""
                    An action item you assigned is severely overdue:
                    
                    Title: {action_item.title}
                    Assigned to: {action_item.assigned_to}
                    Due Date: {action_item.due_date.strftime('%Y-%m-%d')}
                    Days Overdue: {(datetime.now(timezone.utc) - action_item.due_date).days}
                    
                    Please follow up with the assignee or reassign this item.
                    """,
                    email_type='action_item_escalation'
                )
            
        except Exception as e:
            logger.error(f"Error escalating overdue item: {str(e)}")
    
    async def get_action_item_analytics(self, user_id: Optional[str] = None,
                                      date_range: Optional[Tuple[datetime, datetime]] = None) -> Dict[str, Any]:
        """Get action item analytics and metrics"""
        try:
            query = self.db.query(ActionItem)
            
            if user_id:
                query = query.filter(
                    or_(
                        ActionItem.assigned_to == user_id,
                        ActionItem.assigned_by == user_id
                    )
                )
            
            if date_range:
                start_date, end_date = date_range
                query = query.filter(
                    ActionItem.created_at.between(start_date, end_date)
                )
            
            action_items = query.all()
            
            # Calculate metrics
            total_items = len(action_items)
            completed_items = len([item for item in action_items if item.status == ActionItemStatus.COMPLETED])
            overdue_items = len([item for item in action_items if item.is_overdue])
            in_progress_items = len([item for item in action_items if item.status == ActionItemStatus.IN_PROGRESS])
            
            completion_rate = (completed_items / total_items * 100) if total_items > 0 else 0
            
            # Average completion time
            completed_with_times = [
                item for item in action_items 
                if item.status == ActionItemStatus.COMPLETED and item.completed_at and item.created_at
            ]
            
            avg_completion_days = 0
            if completed_with_times:
                total_days = sum([
                    (item.completed_at - item.created_at).days 
                    for item in completed_with_times
                ])
                avg_completion_days = total_days / len(completed_with_times)
            
            # Priority distribution
            priority_counts = {}
            for item in action_items:
                priority_counts[item.priority] = priority_counts.get(item.priority, 0) + 1
            
            return {
                'total_items': total_items,
                'completed_items': completed_items,
                'overdue_items': overdue_items,
                'in_progress_items': in_progress_items,
                'completion_rate': round(completion_rate, 2),
                'avg_completion_days': round(avg_completion_days, 1),
                'priority_distribution': priority_counts,
                'status_distribution': {
                    status.value: len([item for item in action_items if item.status == status])
                    for status in ActionItemStatus
                }
            }
            
        except Exception as e:
            logger.error(f"Error getting action item analytics: {str(e)}")
            return {}