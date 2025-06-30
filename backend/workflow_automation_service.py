# Meeting Workflow Automation Service
# State machine-based workflow automation for meeting lifecycle management

import asyncio
import logging
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional, Any, Callable
from dataclasses import dataclass
from enum import Enum
import json

from sqlalchemy.orm import Session
from sqlalchemy import and_, or_, func

from models import (
    Meeting,
    MeetingWorkflow,
    WorkflowNotification,
    MeetingTemplate,
    WorkflowState,
    NotificationType,
    MeetingStatus,
    Participant,
)
from email_generation_service import EmailGenerationService

logger = logging.getLogger(__name__)


@dataclass
class StateTransition:
    """Represents a workflow state transition"""

    from_state: WorkflowState
    to_state: WorkflowState
    trigger: str
    condition: Optional[Callable] = None
    action: Optional[Callable] = None


@dataclass
class WorkflowAction:
    """Represents an action to be executed during workflow"""

    name: str
    function: Callable
    delay_minutes: int = 0
    retry_count: int = 3


class WorkflowAutomationService:
    """
    Service for managing meeting workflow state machines and automation

    Key Features:
    - State machine workflow management
    - Automated agenda distribution
    - Pre-meeting reminders and notifications
    - Post-meeting follow-up automation
    - Action item assignment and tracking
    """

    def __init__(self, db: Session, email_service: EmailGenerationService):
        self.db = db
        self.email_service = email_service
        self.state_transitions = self._define_state_transitions()
        self.workflow_actions = self._define_workflow_actions()

    def _define_state_transitions(self) -> List[StateTransition]:
        """Define valid state transitions for meeting workflows"""
        return [
            StateTransition(
                from_state=WorkflowState.TEMPLATE_SELECTED,
                to_state=WorkflowState.SCHEDULED,
                trigger="meeting_scheduled",
                action=self._schedule_agenda_distribution,
            ),
            StateTransition(
                from_state=WorkflowState.SCHEDULED,
                to_state=WorkflowState.AGENDA_DISTRIBUTED,
                trigger="agenda_sent",
                action=self._schedule_reminders,
            ),
            StateTransition(
                from_state=WorkflowState.AGENDA_DISTRIBUTED,
                to_state=WorkflowState.REMINDERS_SENT,
                trigger="reminders_sent",
            ),
            StateTransition(
                from_state=WorkflowState.REMINDERS_SENT,
                to_state=WorkflowState.IN_PROGRESS,
                trigger="meeting_started",
                condition=lambda w: w.meeting.status == MeetingStatus.ACTIVE,
            ),
            StateTransition(
                from_state=WorkflowState.IN_PROGRESS,
                to_state=WorkflowState.RECORDING,
                trigger="recording_started",
                condition=lambda w: w.meeting.is_recording,
            ),
            StateTransition(
                from_state=WorkflowState.RECORDING,
                to_state=WorkflowState.TRANSCRIBING,
                trigger="meeting_ended",
                action=self._start_transcription,
            ),
            StateTransition(
                from_state=WorkflowState.TRANSCRIBING,
                to_state=WorkflowState.ANALYZING,
                trigger="transcription_complete",
                action=self._start_ai_analysis,
            ),
            StateTransition(
                from_state=WorkflowState.ANALYZING,
                to_state=WorkflowState.INSIGHTS_GENERATED,
                trigger="insights_complete",
                action=self._extract_action_items,
            ),
            StateTransition(
                from_state=WorkflowState.INSIGHTS_GENERATED,
                to_state=WorkflowState.FOLLOW_UP_SENT,
                trigger="follow_up_sent",
                action=self._send_follow_up,
            ),
            StateTransition(
                from_state=WorkflowState.FOLLOW_UP_SENT,
                to_state=WorkflowState.COMPLETED,
                trigger="workflow_complete",
            ),
        ]

    def _define_workflow_actions(self) -> Dict[str, WorkflowAction]:
        """Define automated workflow actions"""
        return {
            "send_agenda": WorkflowAction(
                name="Send Meeting Agenda",
                function=self._send_agenda_email,
                delay_minutes=0,
            ),
            "send_24h_reminder": WorkflowAction(
                name="Send 24h Reminder",
                function=self._send_24h_reminder,
                delay_minutes=0,
            ),
            "send_1h_reminder": WorkflowAction(
                name="Send 1h Reminder",
                function=self._send_1h_reminder,
                delay_minutes=0,
            ),
            "start_meeting": WorkflowAction(
                name="Start Meeting", function=self._auto_start_meeting, delay_minutes=0
            ),
            "generate_insights": WorkflowAction(
                name="Generate Meeting Insights",
                function=self._generate_meeting_insights,
                delay_minutes=5,
            ),
            "send_summary": WorkflowAction(
                name="Send Meeting Summary",
                function=self._send_meeting_summary,
                delay_minutes=30,
            ),
            "assign_action_items": WorkflowAction(
                name="Assign Action Items",
                function=self._assign_action_items,
                delay_minutes=10,
            ),
        }

    async def create_workflow(
        self,
        meeting_id: str,
        workflow_name: str = "standard_meeting",
        automation_config: Optional[Dict] = None,
    ) -> MeetingWorkflow:
        """Create a new workflow for a meeting"""
        try:
            # Get meeting
            meeting = self.db.query(Meeting).filter(Meeting.id == meeting_id).first()
            if not meeting:
                raise ValueError(f"Meeting {meeting_id} not found")

            # Default automation config
            default_config = {
                "auto_send_agenda": True,
                "agenda_advance_hours": 24,
                "send_reminders": True,
                "reminder_24h": True,
                "reminder_1h": True,
                "auto_start_recording": True,
                "generate_insights": True,
                "auto_extract_action_items": True,
                "send_follow_up": True,
                "follow_up_delay_hours": 2,
            }

            if automation_config:
                default_config.update(automation_config)

            # Create workflow
            workflow = MeetingWorkflow(
                meeting_id=meeting_id,
                current_state=WorkflowState.TEMPLATE_SELECTED,
                workflow_name=workflow_name,
                automation_config=default_config,
                state_history=[
                    {
                        "state": WorkflowState.TEMPLATE_SELECTED.value,
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                        "trigger": "workflow_created",
                    }
                ],
            )

            self.db.add(workflow)
            self.db.commit()
            self.db.refresh(workflow)

            # Schedule initial actions if meeting is scheduled
            if meeting.scheduled_start:
                await self.advance_workflow(workflow.id, "meeting_scheduled")

            return workflow

        except Exception as e:
            self.db.rollback()
            logger.error(f"Error creating workflow: {str(e)}")
            raise

    async def advance_workflow(
        self, workflow_id: str, trigger: str, context: Optional[Dict] = None
    ) -> bool:
        """Advance workflow to next state based on trigger"""
        try:
            workflow = (
                self.db.query(MeetingWorkflow)
                .filter(MeetingWorkflow.id == workflow_id)
                .first()
            )

            if not workflow:
                raise ValueError(f"Workflow {workflow_id} not found")

            if workflow.paused:
                logger.info(f"Workflow {workflow_id} is paused, skipping advancement")
                return False

            # Find valid transition
            valid_transition = None
            for transition in self.state_transitions:
                if (
                    transition.from_state == workflow.current_state
                    and transition.trigger == trigger
                ):

                    # Check condition if present
                    if transition.condition and not transition.condition(workflow):
                        continue

                    valid_transition = transition
                    break

            if not valid_transition:
                logger.warning(
                    f"No valid transition for workflow {workflow_id} "
                    f"from {workflow.current_state} with trigger {trigger}"
                )
                return False

            # Update workflow state
            previous_state = workflow.current_state
            workflow.previous_state = previous_state
            workflow.current_state = valid_transition.to_state
            workflow.last_action_executed = datetime.now(timezone.utc)

            # Update state history
            state_history = workflow.state_history or []
            state_history.append(
                {
                    "state": valid_transition.to_state.value,
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "trigger": trigger,
                    "context": context,
                }
            )
            workflow.state_history = state_history

            # Execute transition action
            if valid_transition.action:
                try:
                    await valid_transition.action(workflow)
                except Exception as e:
                    logger.error(f"Error executing transition action: {str(e)}")
                    workflow.error_state = str(e)

            self.db.commit()

            logger.info(
                f"Workflow {workflow_id} advanced from {previous_state} "
                f"to {workflow.current_state} via {trigger}"
            )

            return True

        except Exception as e:
            self.db.rollback()
            logger.error(f"Error advancing workflow: {str(e)}")
            return False

    async def _schedule_agenda_distribution(self, workflow: MeetingWorkflow):
        """Schedule agenda distribution"""
        if not workflow.automation_config.get("auto_send_agenda", True):
            return

        # Calculate when to send agenda
        advance_hours = workflow.automation_config.get("agenda_advance_hours", 24)
        send_time = workflow.meeting.scheduled_start - timedelta(hours=advance_hours)

        # Don't schedule if it's in the past
        if send_time <= datetime.now(timezone.utc):
            send_time = datetime.now(timezone.utc) + timedelta(minutes=5)

        # Create notification
        notification = WorkflowNotification(
            workflow_id=workflow.id,
            notification_type=NotificationType.AGENDA_DISTRIBUTED,
            trigger_state=WorkflowState.SCHEDULED,
            recipient_type="participants",
            subject_template="Meeting Agenda: {meeting_title}",
            body_template=self._get_agenda_email_template(),
            scheduled_for=send_time,
            notification_data={
                "meeting_id": str(workflow.meeting_id),
                "meeting_title": workflow.meeting.title,
                "agenda": workflow.meeting.agenda,
            },
        )

        self.db.add(notification)

    async def _schedule_reminders(self, workflow: MeetingWorkflow):
        """Schedule meeting reminders"""
        if not workflow.automation_config.get("send_reminders", True):
            return

        meeting_start = workflow.meeting.scheduled_start

        # 24-hour reminder
        if workflow.automation_config.get("reminder_24h", True):
            reminder_24h = meeting_start - timedelta(hours=24)
            if reminder_24h > datetime.now(timezone.utc):
                notification = WorkflowNotification(
                    workflow_id=workflow.id,
                    notification_type=NotificationType.REMINDER_24H,
                    trigger_state=WorkflowState.AGENDA_DISTRIBUTED,
                    recipient_type="participants",
                    subject_template="Reminder: {meeting_title} in 24 hours",
                    body_template=self._get_reminder_email_template(),
                    scheduled_for=reminder_24h,
                    notification_data={
                        "meeting_id": str(workflow.meeting_id),
                        "meeting_title": workflow.meeting.title,
                        "time_until": "24 hours",
                    },
                )
                self.db.add(notification)

        # 1-hour reminder
        if workflow.automation_config.get("reminder_1h", True):
            reminder_1h = meeting_start - timedelta(hours=1)
            if reminder_1h > datetime.now(timezone.utc):
                notification = WorkflowNotification(
                    workflow_id=workflow.id,
                    notification_type=NotificationType.REMINDER_1H,
                    trigger_state=WorkflowState.AGENDA_DISTRIBUTED,
                    recipient_type="participants",
                    subject_template="Reminder: {meeting_title} in 1 hour",
                    body_template=self._get_reminder_email_template(),
                    scheduled_for=reminder_1h,
                    notification_data={
                        "meeting_id": str(workflow.meeting_id),
                        "meeting_title": workflow.meeting.title,
                        "time_until": "1 hour",
                    },
                )
                self.db.add(notification)

    async def _start_transcription(self, workflow: MeetingWorkflow):
        """Start meeting transcription"""
        # This would integrate with transcription service
        logger.info(f"Starting transcription for meeting {workflow.meeting_id}")

        # Schedule next state advancement
        workflow.next_scheduled_action = datetime.now(timezone.utc) + timedelta(
            minutes=2
        )

    async def _start_ai_analysis(self, workflow: MeetingWorkflow):
        """Start AI analysis of meeting"""
        # This would integrate with AI insight generation
        logger.info(f"Starting AI analysis for meeting {workflow.meeting_id}")

        # Schedule next state advancement
        workflow.next_scheduled_action = datetime.now(timezone.utc) + timedelta(
            minutes=5
        )

    async def _extract_action_items(self, workflow: MeetingWorkflow):
        """Extract and create action items"""
        # This would integrate with action item extraction service
        logger.info(f"Extracting action items for meeting {workflow.meeting_id}")

    async def _send_follow_up(self, workflow: MeetingWorkflow):
        """Send follow-up email with summary and action items"""
        delay_hours = workflow.automation_config.get("follow_up_delay_hours", 2)
        send_time = datetime.now(timezone.utc) + timedelta(hours=delay_hours)

        notification = WorkflowNotification(
            workflow_id=workflow.id,
            notification_type=NotificationType.MEETING_SUMMARY,
            trigger_state=WorkflowState.INSIGHTS_GENERATED,
            recipient_type="participants",
            subject_template="Meeting Summary: {meeting_title}",
            body_template=self._get_summary_email_template(),
            scheduled_for=send_time,
            notification_data={
                "meeting_id": str(workflow.meeting_id),
                "meeting_title": workflow.meeting.title,
            },
        )

        self.db.add(notification)

    async def process_scheduled_notifications(self):
        """Process notifications that are scheduled to be sent"""
        try:
            # Get pending notifications
            now = datetime.now(timezone.utc)
            pending_notifications = (
                self.db.query(WorkflowNotification)
                .filter(
                    and_(
                        WorkflowNotification.scheduled_for <= now,
                        WorkflowNotification.delivery_status == "pending",
                        WorkflowNotification.is_enabled == True,
                    )
                )
                .all()
            )

            for notification in pending_notifications:
                try:
                    await self._send_notification(notification)
                except Exception as e:
                    logger.error(
                        f"Error sending notification {notification.id}: {str(e)}"
                    )
                    notification.delivery_status = "failed"
                    notification.error_message = str(e)
                    notification.retry_count += 1

                    # Retry logic
                    if notification.retry_count < notification.max_retries:
                        notification.scheduled_for = now + timedelta(
                            minutes=5 * notification.retry_count
                        )
                        notification.delivery_status = "pending"

            self.db.commit()

        except Exception as e:
            logger.error(f"Error processing scheduled notifications: {str(e)}")

    async def _send_notification(self, notification: WorkflowNotification):
        """Send a specific notification"""
        try:
            # Get workflow and meeting
            workflow = notification.workflow
            meeting = workflow.meeting

            # Get recipients
            recipients = await self._get_notification_recipients(notification, meeting)

            if not recipients:
                logger.warning(f"No recipients for notification {notification.id}")
                notification.delivery_status = "failed"
                notification.error_message = "No recipients found"
                return

            # Prepare email content
            subject = self._format_template(
                notification.subject_template, notification.notification_data
            )
            body = self._format_template(
                notification.body_template, notification.notification_data
            )

            # Send emails
            for recipient in recipients:
                try:
                    await self.email_service.send_email(
                        to_email=recipient["email"],
                        to_name=recipient["name"],
                        subject=subject,
                        body=body,
                        email_type=notification.notification_type.value,
                    )
                except Exception as e:
                    logger.error(
                        f"Error sending email to {recipient['email']}: {str(e)}"
                    )

            # Mark as sent
            notification.delivery_status = "sent"
            notification.sent_at = datetime.now(timezone.utc)

            # Advance workflow if needed
            if notification.notification_type == NotificationType.AGENDA_DISTRIBUTED:
                await self.advance_workflow(workflow.id, "agenda_sent")
            elif notification.notification_type in [
                NotificationType.REMINDER_24H,
                NotificationType.REMINDER_1H,
            ]:
                await self.advance_workflow(workflow.id, "reminders_sent")
            elif notification.notification_type == NotificationType.MEETING_SUMMARY:
                await self.advance_workflow(workflow.id, "follow_up_sent")

        except Exception as e:
            logger.error(f"Error sending notification: {str(e)}")
            raise

    async def _get_notification_recipients(
        self, notification: WorkflowNotification, meeting: Meeting
    ) -> List[Dict[str, str]]:
        """Get recipients for notification based on type"""
        recipients = []

        if notification.recipient_type == "participants":
            # Get all meeting participants
            participants = (
                self.db.query(Participant)
                .filter(Participant.meeting_id == meeting.id)
                .all()
            )

            for participant in participants:
                recipients.append(
                    {"email": participant.email, "name": participant.display_name}
                )

        elif notification.recipient_type == "host":
            # Get meeting host
            host = (
                self.db.query(Participant)
                .filter(
                    and_(
                        Participant.meeting_id == meeting.id, Participant.role == "host"
                    )
                )
                .first()
            )

            if host:
                recipients.append({"email": host.email, "name": host.display_name})

        elif notification.recipient_type == "specific":
            # Use specified recipients from notification.recipients
            if notification.recipients:
                recipients = notification.recipients

        return recipients

    def _format_template(self, template: str, data: Dict[str, Any]) -> str:
        """Format email template with data"""
        if not template:
            return ""

        formatted = template
        for key, value in data.items():
            formatted = formatted.replace(f"{{{key}}}", str(value))

        return formatted

    def _get_agenda_email_template(self) -> str:
        """Get agenda distribution email template"""
        return """
        Dear Participant,

        You're invited to attend: {meeting_title}

        AGENDA:
        {agenda}

        Please review the agenda and come prepared to discuss these topics.

        Best regards,
        MeetingMind Team
        """

    def _get_reminder_email_template(self) -> str:
        """Get reminder email template"""
        return """
        Dear Participant,

        This is a reminder that you have a meeting scheduled in {time_until}:

        Meeting: {meeting_title}

        Please make sure you're prepared and have the meeting link ready.

        Best regards,
        MeetingMind Team
        """

    def _get_summary_email_template(self) -> str:
        """Get summary email template"""
        return """
        Dear Participant,

        Thank you for attending: {meeting_title}

        The meeting summary and action items have been generated and are available in your dashboard.

        Best regards,
        MeetingMind Team
        """

    async def pause_workflow(self, workflow_id: str, reason: str = None) -> bool:
        """Pause workflow execution"""
        try:
            workflow = (
                self.db.query(MeetingWorkflow)
                .filter(MeetingWorkflow.id == workflow_id)
                .first()
            )

            if workflow:
                workflow.paused = True
                if reason:
                    workflow.state_data = workflow.state_data or {}
                    workflow.state_data["pause_reason"] = reason

                self.db.commit()
                return True

            return False

        except Exception as e:
            logger.error(f"Error pausing workflow: {str(e)}")
            return False

    async def resume_workflow(self, workflow_id: str) -> bool:
        """Resume paused workflow"""
        try:
            workflow = (
                self.db.query(MeetingWorkflow)
                .filter(MeetingWorkflow.id == workflow_id)
                .first()
            )

            if workflow:
                workflow.paused = False
                if workflow.state_data and "pause_reason" in workflow.state_data:
                    del workflow.state_data["pause_reason"]

                self.db.commit()
                return True

            return False

        except Exception as e:
            logger.error(f"Error resuming workflow: {str(e)}")
            return False

    async def get_workflow_status(self, workflow_id: str) -> Optional[Dict[str, Any]]:
        """Get current workflow status and progress"""
        try:
            workflow = (
                self.db.query(MeetingWorkflow)
                .filter(MeetingWorkflow.id == workflow_id)
                .first()
            )

            if not workflow:
                return None

            # Calculate progress percentage
            state_order = [state for state in WorkflowState]
            current_index = state_order.index(workflow.current_state)
            progress_percentage = (current_index / len(state_order)) * 100

            return {
                "workflow_id": str(workflow.id),
                "meeting_id": str(workflow.meeting_id),
                "current_state": workflow.current_state.value,
                "previous_state": (
                    workflow.previous_state.value if workflow.previous_state else None
                ),
                "progress_percentage": progress_percentage,
                "paused": workflow.paused,
                "error_state": workflow.error_state,
                "state_history": workflow.state_history,
                "next_scheduled_action": (
                    workflow.next_scheduled_action.isoformat()
                    if workflow.next_scheduled_action
                    else None
                ),
                "automation_config": workflow.automation_config,
            }

        except Exception as e:
            logger.error(f"Error getting workflow status: {str(e)}")
            return None

    # Email action implementations
    async def _send_agenda_email(self, workflow: MeetingWorkflow):
        """Send agenda distribution email"""
        try:
            email_service = EmailGenerationService()

            # Get meeting participants
            participants = workflow.meeting.participants
            if not participants:
                logger.warning(
                    f"No participants found for meeting {workflow.meeting.id}"
                )
                return

            # Generate agenda email content
            email_content = await email_service.generate_agenda_email(
                meeting=workflow.meeting,
                template=(
                    workflow.meeting.template
                    if hasattr(workflow.meeting, "template")
                    else None
                ),
            )

            # Send to all participants
            for participant in participants:
                if participant.email:
                    await email_service.send_email(
                        to_email=participant.email,
                        subject=f"Meeting Agenda: {workflow.meeting.title}",
                        content=email_content,
                        meeting_id=workflow.meeting.id,
                    )

            logger.info(
                f"Agenda email sent for meeting {workflow.meeting.id} to {len(participants)} participants"
            )

        except Exception as e:
            logger.error(
                f"Failed to send agenda email for meeting {workflow.meeting.id}: {e}"
            )

    async def _send_24h_reminder(self, workflow: MeetingWorkflow):
        """Send 24-hour reminder"""
        try:
            email_service = EmailGenerationService()

            participants = workflow.meeting.participants
            if not participants:
                logger.warning(
                    f"No participants found for meeting {workflow.meeting.id}"
                )
                return

            # Generate reminder email content
            email_content = await email_service.generate_reminder_email(
                meeting=workflow.meeting, reminder_type="24_hour"
            )

            # Send to all participants
            for participant in participants:
                if participant.email:
                    await email_service.send_email(
                        to_email=participant.email,
                        subject=f"Reminder: Meeting tomorrow - {workflow.meeting.title}",
                        content=email_content,
                        meeting_id=workflow.meeting.id,
                    )

            logger.info(f"24-hour reminder sent for meeting {workflow.meeting.id}")

        except Exception as e:
            logger.error(
                f"Failed to send 24-hour reminder for meeting {workflow.meeting.id}: {e}"
            )

    async def _send_1h_reminder(self, workflow: MeetingWorkflow):
        """Send 1-hour reminder"""
        try:
            email_service = EmailGenerationService()

            participants = workflow.meeting.participants
            if not participants:
                logger.warning(
                    f"No participants found for meeting {workflow.meeting.id}"
                )
                return

            # Generate urgent reminder email content
            email_content = await email_service.generate_reminder_email(
                meeting=workflow.meeting, reminder_type="1_hour"
            )

            # Send to all participants
            for participant in participants:
                if participant.email:
                    await email_service.send_email(
                        to_email=participant.email,
                        subject=f"URGENT: Meeting in 1 hour - {workflow.meeting.title}",
                        content=email_content,
                        meeting_id=workflow.meeting.id,
                    )

            logger.info(f"1-hour reminder sent for meeting {workflow.meeting.id}")

        except Exception as e:
            logger.error(
                f"Failed to send 1-hour reminder for meeting {workflow.meeting.id}: {e}"
            )

    async def _auto_start_meeting(self, workflow: MeetingWorkflow):
        """Auto-start meeting if configured"""
        if workflow.automation_config.get("auto_start_recording"):
            workflow.meeting.status = MeetingStatus.ACTIVE
            workflow.meeting.actual_start = datetime.now(timezone.utc)

    async def _generate_meeting_insights(self, workflow: MeetingWorkflow):
        """Generate meeting insights"""
        try:
            from insight_generation_service import InsightGenerationService

            insight_service = InsightGenerationService()

            # Check if meeting has recording or transcript data
            if (
                not hasattr(workflow.meeting, "transcript")
                or not workflow.meeting.transcript
            ):
                logger.warning(
                    f"No transcript available for meeting {workflow.meeting.id}, skipping insight generation"
                )
                return

            # Generate insights from meeting transcript
            insights = await insight_service.generate_insights(
                meeting_id=workflow.meeting.id,
                transcript_data=workflow.meeting.transcript,
                participants=workflow.meeting.participants,
            )

            # Store insights in database
            if insights:
                for insight in insights:
                    # Save insight to database (would use database session)
                    logger.info(
                        f"Generated insight: {insight.get('title', 'Untitled')}"
                    )

                logger.info(
                    f"Generated {len(insights)} insights for meeting {workflow.meeting.id}"
                )
            else:
                logger.info(f"No insights generated for meeting {workflow.meeting.id}")

        except ImportError:
            logger.warning("InsightGenerationService not available")
        except Exception as e:
            logger.error(
                f"Failed to generate insights for meeting {workflow.meeting.id}: {e}"
            )

    async def _send_meeting_summary(self, workflow: MeetingWorkflow):
        """Send meeting summary"""
        try:
            email_service = EmailGenerationService()

            participants = workflow.meeting.participants
            if not participants:
                logger.warning(
                    f"No participants found for meeting {workflow.meeting.id}"
                )
                return

            # Generate meeting summary email content
            email_content = await email_service.generate_summary_email(
                meeting=workflow.meeting,
                include_transcript=workflow.automation_config.get(
                    "include_transcript", False
                ),
                include_insights=workflow.automation_config.get(
                    "include_insights", True
                ),
                include_action_items=workflow.automation_config.get(
                    "include_action_items", True
                ),
            )

            # Send to all participants
            for participant in participants:
                if participant.email:
                    await email_service.send_email(
                        to_email=participant.email,
                        subject=f"Meeting Summary: {workflow.meeting.title}",
                        content=email_content,
                        meeting_id=workflow.meeting.id,
                    )

            logger.info(f"Meeting summary sent for meeting {workflow.meeting.id}")

        except Exception as e:
            logger.error(
                f"Failed to send meeting summary for meeting {workflow.meeting.id}: {e}"
            )

    async def _assign_action_items(self, workflow: MeetingWorkflow):
        """Assign action items to participants"""
        try:
            from action_item_service import ActionItemService

            action_service = ActionItemService()

            # Check if meeting has insights or action items extracted
            if (
                not hasattr(workflow.meeting, "insights")
                or not workflow.meeting.insights
            ):
                logger.warning(
                    f"No insights available for meeting {workflow.meeting.id}, cannot extract action items"
                )
                return

            # Extract action items from meeting insights
            action_items = await action_service.extract_action_items(
                meeting_id=workflow.meeting.id,
                insights=workflow.meeting.insights,
                participants=workflow.meeting.participants,
            )

            if not action_items:
                logger.info(f"No action items found for meeting {workflow.meeting.id}")
                return

            # Auto-assign action items to participants
            for action_item in action_items:
                # Try to assign to mentioned participant or default assignee
                assignee = None

                # Look for participant mentions in action item
                for participant in workflow.meeting.participants:
                    if (
                        participant.name.lower()
                        in action_item.get("description", "").lower()
                    ):
                        assignee = participant
                        break

                # If no specific mention, assign to meeting organizer or first participant
                if not assignee and workflow.meeting.participants:
                    assignee = workflow.meeting.participants[
                        0
                    ]  # Default to first participant

                if assignee:
                    # Create action item assignment
                    await action_service.create_action_item(
                        meeting_id=workflow.meeting.id,
                        title=action_item.get("title", "Action Item"),
                        description=action_item.get("description", ""),
                        assignee_id=assignee.id,
                        due_date=action_item.get("due_date"),
                        priority=action_item.get("priority", "medium"),
                    )

                    # Send notification email to assignee
                    if assignee.email and workflow.automation_config.get(
                        "notify_action_items", True
                    ):
                        email_service = EmailGenerationService()
                        await email_service.send_action_item_notification(
                            assignee_email=assignee.email,
                            action_item=action_item,
                            meeting=workflow.meeting,
                        )

            logger.info(
                f"Assigned {len(action_items)} action items for meeting {workflow.meeting.id}"
            )

        except ImportError:
            logger.warning("ActionItemService not available")
        except Exception as e:
            logger.error(
                f"Failed to assign action items for meeting {workflow.meeting.id}: {e}"
            )
