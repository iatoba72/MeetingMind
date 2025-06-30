# API Endpoints for Template and Automation System
# FastAPI endpoints for recurring meetings, action items, workflows, and community features

from fastapi import APIRouter, HTTPException, Depends, Query, Body
from sqlalchemy.orm import Session
from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta
import json

from database import get_db
from models import (
    Meeting,
    MeetingTemplate,
    RecurringMeetingSeries,
    ActionItem,
    ActionItemUpdate,
    MeetingWorkflow,
    WorkflowNotification,
    TemplateRating,
    RecurringMeetingException,
    ActionItemStatus,
    WorkflowState,
    NotificationType,
)
from recurring_meeting_service import RecurringMeetingService
from action_item_service import ActionItemService
from workflow_automation_service import WorkflowAutomationService
from email_generation_service import EmailGenerationService

router = APIRouter()


# Dependency to get services
def get_recurring_service(db: Session = Depends(get_db)) -> RecurringMeetingService:
    return RecurringMeetingService(db)


def get_action_service(db: Session = Depends(get_db)) -> ActionItemService:
    email_service = EmailGenerationService()
    return ActionItemService(db, email_service)


def get_workflow_service(db: Session = Depends(get_db)) -> WorkflowAutomationService:
    email_service = EmailGenerationService()
    return WorkflowAutomationService(db, email_service)


# Recurring Meeting Endpoints
@router.get("/recurring-meetings/detect-patterns")
async def detect_meeting_patterns(
    user_id: str,
    organization_id: Optional[str] = None,
    days_back: int = 90,
    service: RecurringMeetingService = Depends(get_recurring_service),
):
    """Detect recurring patterns in user's meeting history"""
    try:
        patterns = await service.detect_patterns(user_id, organization_id, days_back)
        return {
            "patterns": [
                {
                    "pattern_type": p.pattern_type.value,
                    "confidence": p.confidence,
                    "interval": p.interval,
                    "start_date": p.start_date.isoformat(),
                    "suggested_template": p.suggested_template,
                    "pattern_data": p.pattern_data,
                    "meetings_analyzed": p.meetings_analyzed,
                }
                for p in patterns
            ]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/recurring-meetings/series")
async def create_recurring_series(
    series_data: Dict[str, Any],
    service: RecurringMeetingService = Depends(get_recurring_service),
):
    """Create a new recurring meeting series"""
    try:
        series = await service.create_recurring_series(
            template_id=series_data["template_id"],
            recurrence_config=series_data,
            user_id=series_data["created_by"],
            organization_id=series_data.get("organization_id"),
        )

        return {
            "id": str(series.id),
            "name": series.name,
            "description": series.description,
            "template_id": str(series.template_id),
            "template_name": series.template.name,
            "recurrence_type": series.recurrence_type.value,
            "recurrence_interval": series.recurrence_interval,
            "start_date": series.start_date.isoformat(),
            "end_date": series.end_date.isoformat() if series.end_date else None,
            "duration_minutes": series.duration_minutes,
            "is_active": series.is_active,
            "upcoming_count": len(
                await service.get_upcoming_occurrences(str(series.id))
            ),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/recurring-meetings/series")
async def get_recurring_series(
    user_id: str, organization_id: Optional[str] = None, db: Session = Depends(get_db)
):
    """Get all recurring series for a user"""
    try:
        query = db.query(RecurringMeetingSeries).filter(
            RecurringMeetingSeries.created_by == user_id
        )

        if organization_id:
            query = query.filter(
                RecurringMeetingSeries.organization_id == organization_id
            )

        series_list = query.all()

        result = []
        for series in series_list:
            # Get upcoming meetings count
            upcoming = (
                db.query(Meeting)
                .filter(
                    Meeting.recurring_series_id == series.id,
                    Meeting.scheduled_start > datetime.utcnow(),
                )
                .count()
            )

            # Get next occurrence
            next_meeting = (
                db.query(Meeting)
                .filter(
                    Meeting.recurring_series_id == series.id,
                    Meeting.scheduled_start > datetime.utcnow(),
                )
                .order_by(Meeting.scheduled_start)
                .first()
            )

            result.append(
                {
                    "id": str(series.id),
                    "name": series.name,
                    "description": series.description,
                    "template_id": str(series.template_id),
                    "template_name": series.template.name,
                    "recurrence_type": series.recurrence_type.value,
                    "recurrence_interval": series.recurrence_interval,
                    "start_date": series.start_date.isoformat(),
                    "end_date": (
                        series.end_date.isoformat() if series.end_date else None
                    ),
                    "duration_minutes": series.duration_minutes,
                    "is_active": series.is_active,
                    "next_occurrence": (
                        next_meeting.scheduled_start.isoformat()
                        if next_meeting
                        else None
                    ),
                    "upcoming_count": upcoming,
                }
            )

        return {"series": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/recurring-meetings/series/{series_id}/exception")
async def create_series_exception(
    series_id: str,
    exception_data: Dict[str, Any],
    service: RecurringMeetingService = Depends(get_recurring_service),
):
    """Create an exception for a recurring series"""
    try:
        exception = await service.handle_series_exception(
            series_id=series_id,
            original_date=datetime.fromisoformat(exception_data["original_date"]),
            exception_type=exception_data["exception_type"],
            user_id=exception_data["user_id"],
            new_date=(
                datetime.fromisoformat(exception_data["new_date"])
                if exception_data.get("new_date")
                else None
            ),
            modifications=exception_data.get("modifications"),
        )

        return {"exception_id": str(exception.id)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# Action Item Endpoints
@router.get("/action-items")
async def get_action_items(
    user_id: str,
    meeting_id: Optional[str] = None,
    status: Optional[str] = None,
    priority: Optional[str] = None,
    assigned_to: Optional[str] = None,
    category: Optional[str] = None,
    service: ActionItemService = Depends(get_action_service),
):
    """Get action items for a user with optional filters"""
    try:
        # Apply filters based on query parameters
        if meeting_id:
            # Get items for specific meeting
            query = service.db.query(ActionItem).filter(
                ActionItem.meeting_id == meeting_id
            )
        else:
            # Get items for user
            include_assigned_by = True  # Include items assigned by user
            items = await service.get_action_items_for_user(
                user_id, None, include_assigned_by
            )
            query = service.db.query(ActionItem).filter(
                ActionItem.id.in_([item.id for item in items])
            )

        # Apply additional filters
        if status and status != "all":
            query = query.filter(ActionItem.status == ActionItemStatus(status))
        if priority and priority != "all":
            query = query.filter(ActionItem.priority == priority)
        if assigned_to and assigned_to != "all":
            query = query.filter(ActionItem.assigned_to == assigned_to)
        if category and category != "all":
            query = query.filter(ActionItem.category == category)

        action_items = query.order_by(ActionItem.created_at.desc()).all()

        result = []
        for item in action_items:
            # Get meeting title
            meeting = (
                service.db.query(Meeting).filter(Meeting.id == item.meeting_id).first()
            )

            result.append(
                {
                    "id": str(item.id),
                    "meeting_id": str(item.meeting_id),
                    "meeting_title": meeting.title if meeting else "Unknown Meeting",
                    "title": item.title,
                    "description": item.description,
                    "priority": item.priority,
                    "category": item.category,
                    "assigned_to": item.assigned_to,
                    "assigned_to_name": item.assigned_to,  # Would need user service integration
                    "assigned_by": item.assigned_by,
                    "assigned_by_name": item.assigned_by,  # Would need user service integration
                    "status": item.status.value,
                    "progress_percentage": item.progress_percentage,
                    "due_date": item.due_date.isoformat() if item.due_date else None,
                    "estimated_hours": item.estimated_hours,
                    "actual_hours": item.actual_hours,
                    "auto_extracted": item.auto_extracted,
                    "extraction_confidence": item.extraction_confidence,
                    "created_at": item.created_at.isoformat(),
                    "updated_at": item.updated_at.isoformat(),
                    "completed_at": (
                        item.completed_at.isoformat() if item.completed_at else None
                    ),
                    "is_overdue": item.is_overdue,
                    "updates": [
                        {
                            "id": str(update.id),
                            "update_text": update.update_text,
                            "status_change": update.status_change,
                            "progress_change": update.progress_change,
                            "updated_by": update.updated_by,
                            "updated_by_name": update.updated_by,  # Would need user service integration
                            "update_type": update.update_type,
                            "created_at": update.created_at.isoformat(),
                        }
                        for update in item.updates
                    ],
                }
            )

        return {"action_items": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/action-items")
async def create_action_item(
    item_data: Dict[str, Any], service: ActionItemService = Depends(get_action_service)
):
    """Create a new action item"""
    try:
        action_item = await service.create_action_item(
            meeting_id=item_data["meeting_id"],
            title=item_data["title"],
            description=item_data.get("description", ""),
            assigned_to=item_data.get("assigned_to"),
            priority=item_data.get("priority", "medium"),
            due_date=(
                datetime.fromisoformat(item_data["due_date"])
                if item_data.get("due_date")
                else None
            ),
            category=item_data.get("category", "general"),
            auto_extracted=item_data.get("auto_extracted", False),
            extraction_confidence=item_data.get("extraction_confidence", 0.0),
            context=item_data.get("context"),
        )

        return {"action_item_id": str(action_item.id)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/action-items/{item_id}/progress")
async def update_action_item_progress(
    item_id: str,
    update_data: Dict[str, Any],
    service: ActionItemService = Depends(get_action_service),
):
    """Update action item progress"""
    try:
        action_item = await service.update_action_item_progress(
            action_item_id=item_id,
            progress_percentage=update_data["progress_percentage"],
            update_text=update_data["update_text"],
            updated_by=update_data["updated_by"],
            new_status=(
                ActionItemStatus(update_data["new_status"])
                if update_data.get("new_status")
                else None
            ),
        )

        return {"success": True, "progress": action_item.progress_percentage}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/action-items/{item_id}/assign")
async def assign_action_item(
    item_id: str,
    assignment_data: Dict[str, Any],
    service: ActionItemService = Depends(get_action_service),
):
    """Assign an action item to a user"""
    try:
        action_item = await service.assign_action_item(
            action_item_id=item_id,
            assigned_to=assignment_data["assigned_to"],
            assigned_by=assignment_data["assigned_by"],
            due_date=(
                datetime.fromisoformat(assignment_data["due_date"])
                if assignment_data.get("due_date")
                else None
            ),
        )

        return {"success": True, "assigned_to": action_item.assigned_to}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/action-items/analytics")
async def get_action_item_analytics(
    user_id: str,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    service: ActionItemService = Depends(get_action_service),
):
    """Get action item analytics and metrics"""
    try:
        date_range = None
        if start_date and end_date:
            date_range = (
                datetime.fromisoformat(start_date),
                datetime.fromisoformat(end_date),
            )

        analytics = await service.get_action_item_analytics(user_id, date_range)
        return analytics
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/action-items/extract")
async def extract_action_items_from_text(
    extraction_data: Dict[str, Any],
    service: ActionItemService = Depends(get_action_service),
):
    """Extract action items from meeting text using AI"""
    try:
        # Get meeting participants if available
        participants = []
        if extraction_data.get("meeting_id"):
            from models import Participant

            participants = (
                service.db.query(Participant)
                .filter(Participant.meeting_id == extraction_data["meeting_id"])
                .all()
            )

        extracted_items = await service.extract_action_items_from_text(
            text=extraction_data["text"],
            meeting_id=extraction_data["meeting_id"],
            participants=participants,
        )

        result = []
        for item in extracted_items:
            result.append(
                {
                    "title": item.title,
                    "description": item.description,
                    "assigned_to": item.assigned_to,
                    "priority": item.priority,
                    "category": item.category,
                    "confidence": item.confidence,
                    "context": item.context,
                    "due_date": item.due_date.isoformat() if item.due_date else None,
                }
            )

        return {"extracted_items": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# Workflow Endpoints
@router.post("/workflows")
async def create_workflow(
    workflow_data: Dict[str, Any],
    service: WorkflowAutomationService = Depends(get_workflow_service),
):
    """Create a new meeting workflow"""
    try:
        workflow = await service.create_workflow(
            meeting_id=workflow_data["meeting_id"],
            workflow_name=workflow_data.get("workflow_name", "standard_meeting"),
            automation_config=workflow_data.get("automation_config"),
        )

        return {
            "workflow_id": str(workflow.id),
            "current_state": workflow.current_state.value,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/workflows/{workflow_id}")
async def get_workflow(workflow_id: str, db: Session = Depends(get_db)):
    """Get workflow details"""
    try:
        workflow = (
            db.query(MeetingWorkflow).filter(MeetingWorkflow.id == workflow_id).first()
        )
        if not workflow:
            raise HTTPException(status_code=404, detail="Workflow not found")

        return {
            "id": str(workflow.id),
            "name": workflow.workflow_name,
            "description": f"Meeting workflow for {workflow.meeting.title}",
            "states": [
                {
                    "id": state.value,
                    "name": state.value.replace("_", " ").title(),
                    "type": "process",
                    "position": {"x": 100, "y": 100},  # Default positioning
                    "config": {
                        "auto_advance": workflow.auto_advance,
                        "actions": [],
                        "notifications": [],
                    },
                }
                for state in WorkflowState
            ],
            "transitions": [],  # Would need to define transitions
            "is_active": not workflow.paused,
            "created_at": workflow.created_at.isoformat(),
            "updated_at": workflow.updated_at.isoformat(),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/workflows/{workflow_id}/executions")
async def get_workflow_executions(workflow_id: str, db: Session = Depends(get_db)):
    """Get workflow execution history"""
    try:
        workflow = (
            db.query(MeetingWorkflow).filter(MeetingWorkflow.id == workflow_id).first()
        )
        if not workflow:
            raise HTTPException(status_code=404, detail="Workflow not found")

        # Return single execution for this workflow
        executions = [
            {
                "id": str(workflow.id),
                "workflow_id": str(workflow.id),
                "meeting_id": str(workflow.meeting_id),
                "current_state": workflow.current_state.value,
                "state_history": workflow.state_history or [],
                "started_at": workflow.created_at.isoformat(),
                "completed_at": (
                    workflow.updated_at.isoformat()
                    if workflow.current_state == WorkflowState.COMPLETED
                    else None
                ),
                "status": (
                    "completed"
                    if workflow.current_state == WorkflowState.COMPLETED
                    else "paused" if workflow.paused else "running"
                ),
            }
        ]

        return {"executions": executions}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/workflows/{workflow_id}/advance")
async def advance_workflow(
    workflow_id: str,
    advance_data: Dict[str, Any],
    service: WorkflowAutomationService = Depends(get_workflow_service),
):
    """Advance workflow to next state"""
    try:
        success = await service.advance_workflow(
            workflow_id=workflow_id,
            trigger=advance_data["trigger"],
            context=advance_data.get("context"),
        )

        return {"success": success}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/workflows/{workflow_id}/status")
async def get_workflow_status(
    workflow_id: str, service: WorkflowAutomationService = Depends(get_workflow_service)
):
    """Get current workflow status"""
    try:
        status = await service.get_workflow_status(workflow_id)
        return status or {"error": "Workflow not found"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# Community Template Endpoints
@router.get("/community-templates")
async def get_community_templates(
    page: int = Query(1, ge=1),
    limit: int = Query(12, ge=1, le=50),
    search: str = Query(""),
    category: str = Query("all"),
    sort_by: str = Query("popular"),
    min_rating: float = Query(0.0, ge=0, le=5),
    verified_only: bool = Query(False),
    featured_only: bool = Query(False),
    db: Session = Depends(get_db),
):
    """Get community templates with filters and pagination"""
    try:
        query = db.query(MeetingTemplate).filter(MeetingTemplate.is_public == True)

        # Apply filters
        if search:
            query = query.filter(
                MeetingTemplate.name.ilike(f"%{search}%")
                | MeetingTemplate.description.ilike(f"%{search}%")
            )

        if category != "all":
            query = query.filter(MeetingTemplate.category == category)

        # Note: The following filters would require additional fields in the template model
        # For now, we'll include them in the API but they won't filter

        # Apply sorting
        if sort_by == "newest":
            query = query.order_by(MeetingTemplate.created_at.desc())
        elif sort_by == "rating":
            query = query.order_by(MeetingTemplate.created_at.desc())  # Placeholder
        elif sort_by == "downloads":
            query = query.order_by(MeetingTemplate.created_at.desc())  # Placeholder
        else:  # popular
            query = query.order_by(MeetingTemplate.created_at.desc())

        # Pagination
        total_count = query.count()
        total_pages = (total_count + limit - 1) // limit

        templates = query.offset((page - 1) * limit).limit(limit).all()

        result = []
        for template in templates:
            # Get ratings (would need to implement rating system)
            ratings = (
                db.query(TemplateRating)
                .filter(TemplateRating.template_id == template.id)
                .all()
            )
            avg_rating = sum(r.rating for r in ratings) / len(ratings) if ratings else 0

            result.append(
                {
                    "id": str(template.id),
                    "name": template.name,
                    "description": template.description,
                    "category": template.category,
                    "created_by": template.created_by,
                    "creator_name": template.created_by,  # Would need user service
                    "created_at": template.created_at.isoformat(),
                    "updated_at": template.updated_at.isoformat(),
                    "default_duration_minutes": template.default_duration_minutes,
                    "default_settings": template.default_settings,
                    "agenda_template": template.agenda_template,
                    "is_public": template.is_public,
                    "is_featured": False,  # Would need to add field
                    "is_verified": False,  # Would need to add field
                    "download_count": 0,  # Would need to track
                    "view_count": 0,  # Would need to track
                    "favorite_count": 0,  # Would need to track
                    "rating_average": avg_rating,
                    "rating_count": len(ratings),
                    "reviews": [
                        {
                            "id": str(r.id),
                            "template_id": str(r.template_id),
                            "user_id": r.rated_by,
                            "user_name": r.rated_by,  # Would need user service
                            "rating": r.rating,
                            "review": r.review or "",
                            "usage_count": r.usage_count,
                            "helpful_votes": r.helpful_votes,
                            "total_votes": r.total_votes,
                            "created_at": r.created_at.isoformat(),
                        }
                        for r in ratings
                        if r.review
                    ],
                    "user_rating": None,  # Would need to check for current user
                    "user_favorite": False,  # Would need to implement favorites
                }
            )

        return {
            "templates": result,
            "total_count": total_count,
            "total_pages": total_pages,
            "current_page": page,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/community-templates/my")
async def get_my_templates(user_id: str, db: Session = Depends(get_db)):
    """Get templates created by the current user"""
    try:
        templates = (
            db.query(MeetingTemplate)
            .filter(MeetingTemplate.created_by == user_id)
            .order_by(MeetingTemplate.created_at.desc())
            .all()
        )

        result = []
        for template in templates:
            ratings = (
                db.query(TemplateRating)
                .filter(TemplateRating.template_id == template.id)
                .all()
            )
            avg_rating = sum(r.rating for r in ratings) / len(ratings) if ratings else 0

            result.append(
                {
                    "id": str(template.id),
                    "name": template.name,
                    "description": template.description,
                    "category": template.category,
                    "is_public": template.is_public,
                    "rating_average": avg_rating,
                    "rating_count": len(ratings),
                    "created_at": template.created_at.isoformat(),
                }
            )

        return {"templates": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/community-templates/{template_id}/rate")
async def rate_template(
    template_id: str, rating_data: Dict[str, Any], db: Session = Depends(get_db)
):
    """Rate and review a template"""
    try:
        # Check if user already rated this template
        existing_rating = (
            db.query(TemplateRating)
            .filter(
                TemplateRating.template_id == template_id,
                TemplateRating.rated_by == rating_data["user_id"],
            )
            .first()
        )

        if existing_rating:
            # Update existing rating
            existing_rating.rating = rating_data["rating"]
            existing_rating.review = rating_data.get("review", "")
            existing_rating.usage_count = rating_data.get("usage_count", 1)
            existing_rating.updated_at = datetime.utcnow()
        else:
            # Create new rating
            new_rating = TemplateRating(
                template_id=template_id,
                rated_by=rating_data["user_id"],
                rating=rating_data["rating"],
                review=rating_data.get("review", ""),
                usage_count=rating_data.get("usage_count", 1),
            )
            db.add(new_rating)

        db.commit()
        return {"success": True}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/community-templates/{template_id}/{action}")
async def template_action(
    template_id: str,
    action: str,
    action_data: Dict[str, Any],
    db: Session = Depends(get_db),
):
    """Perform actions on templates (favorite, use, share)"""
    try:
        if action == "use":
            # Track template usage (would need usage tracking table)
            pass
        elif action == "favorite":
            # Toggle favorite status (would need favorites table)
            pass
        elif action == "share":
            # Track sharing (would need sharing analytics)
            pass

        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# Background task endpoints
@router.post("/automation/process-scheduled")
async def process_scheduled_tasks(
    workflow_service: WorkflowAutomationService = Depends(get_workflow_service),
    action_service: ActionItemService = Depends(get_action_service),
):
    """Process scheduled automation tasks (called by background job)"""
    try:
        # Process workflow notifications
        await workflow_service.process_scheduled_notifications()

        # Process action item automation
        await action_service.process_action_item_automation()

        return {"success": True, "message": "Scheduled tasks processed"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
