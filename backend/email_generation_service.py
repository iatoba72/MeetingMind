# Email Generation Service
# Service for generating follow-up emails and communications from meeting content

import asyncio
import json
import re
import time
import uuid
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any, Tuple, Union
from dataclasses import dataclass, asdict
from enum import Enum
import logging
from collections import defaultdict

from multi_level_summary_service import (
    get_multi_level_summary_service, MultiLevelSummaryService,
    SummaryConfiguration, SummaryLevel, SummaryFormat, SummaryType
)
from summarization_engine import SummarizationTechnique, MeetingType, QualityMetric

class EmailType(Enum):
    """Types of emails that can be generated"""
    FOLLOW_UP = "follow_up"                    # General follow-up email
    ACTION_ITEMS = "action_items"              # Action items summary
    DECISIONS = "decisions"                    # Decisions made email
    MEETING_RECAP = "meeting_recap"            # Complete meeting recap
    THANK_YOU = "thank_you"                    # Thank you email
    NEXT_STEPS = "next_steps"                  # Next steps communication
    STATUS_UPDATE = "status_update"            # Status update email
    STAKEHOLDER_UPDATE = "stakeholder_update"  # Executive stakeholder update
    TEAM_SUMMARY = "team_summary"              # Team summary email
    CLIENT_SUMMARY = "client_summary"          # Client-facing summary

class EmailTone(Enum):
    """Tone styles for email generation"""
    PROFESSIONAL = "professional"              # Formal business tone
    FRIENDLY = "friendly"                      # Warm and approachable
    CASUAL = "casual"                          # Informal tone
    FORMAL = "formal"                          # Very formal tone
    ENTHUSIASTIC = "enthusiastic"              # Upbeat and positive
    CONCISE = "concise"                        # Brief and to-the-point
    DETAILED = "detailed"                      # Comprehensive and thorough

class EmailAudience(Enum):
    """Target audience for email"""
    TEAM_MEMBERS = "team_members"              # Internal team
    EXECUTIVES = "executives"                  # Senior leadership
    STAKEHOLDERS = "stakeholders"              # Project stakeholders
    CLIENTS = "clients"                        # External clients
    VENDORS = "vendors"                        # External vendors
    GENERAL = "general"                        # General audience

@dataclass
class EmailConfiguration:
    """Configuration for email generation"""
    email_type: EmailType
    tone: EmailTone
    audience: EmailAudience
    include_action_items: bool
    include_decisions: bool
    include_next_meeting: bool
    include_attachments_note: bool
    sender_name: str
    sender_title: str
    company_name: str
    custom_signature: Optional[str]
    priority_level: str  # 'low', 'normal', 'high'
    request_feedback: bool
    include_calendar_invite: bool
    cc_recipients: List[str]
    bcc_recipients: List[str]

@dataclass
class EmailContent:
    """Generated email content"""
    subject: str
    body: str
    greeting: str
    main_content: str
    closing: str
    signature: str
    metadata: Dict[str, Any]

@dataclass
class EmailTemplate:
    """Email template definition"""
    id: str
    name: str
    description: str
    email_type: EmailType
    audience: EmailAudience
    tone: EmailTone
    subject_template: str
    body_template: str
    placeholders: List[str]
    example_output: str
    usage_count: int
    rating: float
    created_by: str
    created_at: datetime
    is_public: bool

@dataclass
class EmailGenerationResult:
    """Result of email generation"""
    id: str
    email_content: EmailContent
    configuration: EmailConfiguration
    word_count: int
    estimated_read_time: float
    confidence_score: float
    quality_metrics: Dict[str, float]
    generated_at: datetime
    processing_time_ms: float
    meeting_id: Optional[str]
    related_action_items: List[str]
    related_decisions: List[str]

class EmailGenerationService:
    """
    Service for generating follow-up emails and communications from meeting content
    
    Features:
    - Multiple email types (follow-up, action items, decisions, etc.)
    - Tone and audience customization
    - Template-based generation
    - Action item and decision extraction
    - Quality scoring and optimization
    - Personalization and branding
    
    Architecture:
    
    1. Content Analysis:
       - Extract key information from meeting content
       - Identify action items, decisions, and next steps
       - Analyze participant roles and responsibilities
    
    2. Email Composition:
       - Generate appropriate subject lines
       - Structure email body with clear sections
       - Apply tone and audience customization
       - Include relevant attachments and links
    
    3. Quality Assurance:
       - Check for clarity and completeness
       - Validate professional tone
       - Ensure action items are clear
       - Verify contact information
    
    4. Personalization:
       - Custom signatures and branding
       - Audience-appropriate language
       - Company-specific formatting
       - Cultural and regional considerations
    """
    
    def __init__(self):
        """Initialize the email generation service"""
        self.summary_service: Optional[MultiLevelSummaryService] = None
        
        # Email templates
        self.templates: Dict[str, EmailTemplate] = {}
        self._initialize_default_templates()
        
        # Performance tracking
        self.stats = {
            'total_emails': 0,
            'emails_by_type': defaultdict(int),
            'emails_by_tone': defaultdict(int),
            'emails_by_audience': defaultdict(int),
            'avg_processing_time': 0.0,
            'template_usage': defaultdict(int)
        }
        
        # Cache for recent generations
        self.generation_cache: Dict[str, EmailGenerationResult] = {}
        self.cache_ttl = 300  # 5 minutes
        
        self.logger = logging.getLogger(__name__)
    
    async def initialize(self):
        """Initialize the service and dependencies"""
        self.summary_service = await get_multi_level_summary_service()
        self.logger.info("Email generation service initialized")
    
    def _initialize_default_templates(self):
        """Initialize default email templates"""
        
        templates = [
            # Follow-up Email Template
            EmailTemplate(
                id="follow_up_professional",
                name="Professional Follow-up",
                description="Professional follow-up email with action items",
                email_type=EmailType.FOLLOW_UP,
                audience=EmailAudience.TEAM_MEMBERS,
                tone=EmailTone.PROFESSIONAL,
                subject_template="Follow-up: {meeting_title} - {meeting_date}",
                body_template="""Hi {recipient_name},

Thank you for attending our {meeting_title} meeting on {meeting_date}. I wanted to follow up with a summary of our discussion and next steps.

{meeting_summary}

Action Items:
{action_items}

Decisions Made:
{decisions}

Next Meeting: {next_meeting}

Please let me know if you have any questions or if I missed anything important.

Best regards,
{sender_name}""",
                placeholders=["recipient_name", "meeting_title", "meeting_date", "meeting_summary", "action_items", "decisions", "next_meeting", "sender_name"],
                example_output="Professional follow-up email with clear structure",
                usage_count=0,
                rating=4.8,
                created_by="system",
                created_at=datetime.now(),
                is_public=True
            ),
            
            # Action Items Email Template
            EmailTemplate(
                id="action_items_focused",
                name="Action Items Focus",
                description="Email focused on action items and responsibilities",
                email_type=EmailType.ACTION_ITEMS,
                audience=EmailAudience.TEAM_MEMBERS,
                tone=EmailTone.CONCISE,
                subject_template="Action Items from {meeting_title} - Due {due_date}",
                body_template="""Team,

Here are the action items from our {meeting_title} meeting:

{action_items_detailed}

Please confirm receipt and let me know if you have any questions about your assignments.

Deadlines are approaching - please prioritize accordingly.

Thanks,
{sender_name}""",
                placeholders=["meeting_title", "due_date", "action_items_detailed", "sender_name"],
                example_output="Focused email highlighting action items and deadlines",
                usage_count=0,
                rating=4.9,
                created_by="system",
                created_at=datetime.now(),
                is_public=True
            ),
            
            # Executive Summary Template
            EmailTemplate(
                id="executive_summary",
                name="Executive Summary",
                description="High-level summary for executives and stakeholders",
                email_type=EmailType.STAKEHOLDER_UPDATE,
                audience=EmailAudience.EXECUTIVES,
                tone=EmailTone.FORMAL,
                subject_template="Executive Summary: {meeting_title} - {meeting_date}",
                body_template="""Dear {recipient_name},

Please find below an executive summary of the {meeting_title} meeting held on {meeting_date}.

KEY OUTCOMES:
{key_outcomes}

STRATEGIC DECISIONS:
{strategic_decisions}

BUSINESS IMPACT:
{business_impact}

NEXT STEPS:
{executive_next_steps}

I am available to discuss any of these items in more detail at your convenience.

Respectfully,
{sender_name}
{sender_title}""",
                placeholders=["recipient_name", "meeting_title", "meeting_date", "key_outcomes", "strategic_decisions", "business_impact", "executive_next_steps", "sender_name", "sender_title"],
                example_output="Executive-level summary with strategic focus",
                usage_count=0,
                rating=5.0,
                created_by="system",
                created_at=datetime.now(),
                is_public=True
            ),
            
            # Client Summary Template
            EmailTemplate(
                id="client_summary",
                name="Client Summary",
                description="Client-facing meeting summary",
                email_type=EmailType.CLIENT_SUMMARY,
                audience=EmailAudience.CLIENTS,
                tone=EmailTone.FRIENDLY,
                subject_template="Meeting Summary: {project_name} Progress Update",
                body_template="""Dear {client_name},

I hope this email finds you well. I wanted to share a summary of our recent meeting regarding {project_name}.

Progress Update:
{progress_summary}

Key Achievements:
{achievements}

Upcoming Milestones:
{milestones}

Next Steps:
{client_next_steps}

We appreciate your continued partnership and look forward to our next meeting on {next_meeting_date}.

Warm regards,
{sender_name}
{company_name}""",
                placeholders=["client_name", "project_name", "progress_summary", "achievements", "milestones", "client_next_steps", "next_meeting_date", "sender_name", "company_name"],
                example_output="Client-friendly summary with positive tone",
                usage_count=0,
                rating=4.7,
                created_by="system",
                created_at=datetime.now(),
                is_public=True
            ),
            
            # Thank You Email Template
            EmailTemplate(
                id="thank_you_email",
                name="Thank You Email",
                description="Appreciation email after successful meeting",
                email_type=EmailType.THANK_YOU,
                audience=EmailAudience.GENERAL,
                tone=EmailTone.ENTHUSIASTIC,
                subject_template="Thank you for a productive {meeting_title}!",
                body_template="""Hi everyone,

I wanted to take a moment to thank you all for the excellent {meeting_title} meeting today. Your insights and contributions were invaluable.

Key Highlights:
{meeting_highlights}

Your Action Items:
{action_items}

I'm excited about our progress and looking forward to implementing these initiatives.

Next meeting: {next_meeting}

Thank you again for your time and dedication!

Best,
{sender_name}""",
                placeholders=["meeting_title", "meeting_highlights", "action_items", "next_meeting", "sender_name"],
                example_output="Positive and appreciative email",
                usage_count=0,
                rating=4.6,
                created_by="system",
                created_at=datetime.now(),
                is_public=True
            )
        ]
        
        for template in templates:
            self.templates[template.id] = template
    
    async def generate_email(
        self,
        meeting_content: str,
        meeting_metadata: Dict[str, Any],
        configuration: EmailConfiguration,
        template_id: Optional[str] = None
    ) -> EmailGenerationResult:
        """Generate email from meeting content"""
        
        start_time = time.time()
        
        try:
            # Extract key information from meeting content
            extracted_info = await self._extract_meeting_information(
                meeting_content, meeting_metadata, configuration
            )
            
            # Generate email content
            if template_id and template_id in self.templates:
                email_content = await self._generate_from_template(
                    template_id, extracted_info, configuration
                )
            else:
                email_content = await self._generate_structured_email(
                    extracted_info, configuration
                )
            
            # Calculate quality metrics
            quality_metrics = await self._calculate_email_quality(
                email_content, configuration
            )
            
            # Create result
            result = EmailGenerationResult(
                id=f"email_{uuid.uuid4().hex[:8]}",
                email_content=email_content,
                configuration=configuration,
                word_count=len(email_content.body.split()),
                estimated_read_time=len(email_content.body.split()) / 200,  # 200 WPM
                confidence_score=self._calculate_confidence_score(quality_metrics),
                quality_metrics=quality_metrics,
                generated_at=datetime.now(),
                processing_time_ms=(time.time() - start_time) * 1000,
                meeting_id=meeting_metadata.get('meeting_id'),
                related_action_items=extracted_info.get('action_items', []),
                related_decisions=extracted_info.get('decisions', [])
            )
            
            # Update statistics
            self._update_stats(configuration, template_id)
            
            return result
            
        except Exception as e:
            self.logger.error(f"Email generation failed: {e}")
            raise
    
    async def _extract_meeting_information(
        self,
        meeting_content: str,
        meeting_metadata: Dict[str, Any],
        configuration: EmailConfiguration
    ) -> Dict[str, Any]:
        """Extract key information from meeting content"""
        
        # Generate summary using the summary service
        summary_config = SummaryConfiguration(
            level=SummaryLevel.SHORT,
            format=SummaryFormat.PARAGRAPH,
            summary_type=SummaryType.SHORT,
            technique=SummarizationTechnique.EXTRACTIVE_TFIDF,
            meeting_type=MeetingType(meeting_metadata.get('meeting_type', 'general')),
            focus_areas=['key_points', 'decisions', 'action_items'],
            include_speakers=False,
            include_timestamps=False,
            include_confidence=False,
            custom_template=None,
            target_audience=configuration.audience.value,
            quality_requirements={QualityMetric.COHERENCE: 0.8}
        )
        
        summary_result = await self.summary_service.generate_single_summary(
            meeting_content,
            meeting_metadata.get('meeting_id', 'unknown'),
            summary_config,
            meeting_metadata
        )
        
        # Extract specific information
        extracted_info = {
            'meeting_summary': summary_result.content,
            'action_items': self._extract_action_items(meeting_content),
            'decisions': self._extract_decisions(meeting_content),
            'next_steps': self._extract_next_steps(meeting_content),
            'key_points': self._extract_key_points(meeting_content),
            'participants': meeting_metadata.get('participants', []),
            'meeting_title': meeting_metadata.get('title', 'Team Meeting'),
            'meeting_date': meeting_metadata.get('date', datetime.now().strftime('%Y-%m-%d')),
            'meeting_duration': meeting_metadata.get('duration', 'Unknown'),
            'next_meeting': meeting_metadata.get('next_meeting', 'TBD'),
            'project_name': meeting_metadata.get('project_name', ''),
            'company_name': configuration.company_name
        }
        
        return extracted_info
    
    async def _generate_from_template(
        self,
        template_id: str,
        extracted_info: Dict[str, Any],
        configuration: EmailConfiguration
    ) -> EmailContent:
        """Generate email using a specific template"""
        
        template = self.templates[template_id]
        
        # Update template usage
        template.usage_count += 1
        self.stats['template_usage'][template_id] += 1
        
        # Generate subject
        subject = self._apply_template_substitutions(
            template.subject_template, extracted_info, configuration
        )
        
        # Generate body
        body = self._apply_template_substitutions(
            template.body_template, extracted_info, configuration
        )
        
        # Extract components
        greeting, main_content, closing = self._parse_email_body(body)
        
        # Generate signature
        signature = self._generate_signature(configuration)
        
        return EmailContent(
            subject=subject,
            body=body + "\n\n" + signature,
            greeting=greeting,
            main_content=main_content,
            closing=closing,
            signature=signature,
            metadata={
                'template_id': template_id,
                'template_name': template.name,
                'tone': template.tone.value,
                'audience': template.audience.value
            }
        )
    
    async def _generate_structured_email(
        self,
        extracted_info: Dict[str, Any],
        configuration: EmailConfiguration
    ) -> EmailContent:
        """Generate structured email without template"""
        
        # Generate subject based on email type
        subject = self._generate_subject(extracted_info, configuration)
        
        # Generate greeting
        greeting = self._generate_greeting(configuration)
        
        # Generate main content based on email type
        main_content = self._generate_main_content(
            extracted_info, configuration
        )
        
        # Generate closing
        closing = self._generate_closing(configuration)
        
        # Generate signature
        signature = self._generate_signature(configuration)
        
        # Combine all parts
        body = f"{greeting}\n\n{main_content}\n\n{closing}"
        full_body = f"{body}\n\n{signature}"
        
        return EmailContent(
            subject=subject,
            body=full_body,
            greeting=greeting,
            main_content=main_content,
            closing=closing,
            signature=signature,
            metadata={
                'generated_type': 'structured',
                'tone': configuration.tone.value,
                'audience': configuration.audience.value
            }
        )
    
    def _apply_template_substitutions(
        self,
        template_text: str,
        extracted_info: Dict[str, Any],
        configuration: EmailConfiguration
    ) -> str:
        """Apply substitutions to template text"""
        
        result = template_text
        
        # Basic substitutions
        substitutions = {
            'recipient_name': 'Team',  # Default if not specified
            'sender_name': configuration.sender_name,
            'sender_title': configuration.sender_title,
            'company_name': configuration.company_name,
            **extracted_info
        }
        
        # Format action items and decisions
        if 'action_items' in substitutions:
            action_items = substitutions['action_items']
            if isinstance(action_items, list):
                if action_items:
                    formatted_actions = '\n'.join([f"• {item}" for item in action_items])
                else:
                    formatted_actions = "• No action items identified"
                substitutions['action_items'] = formatted_actions
                substitutions['action_items_detailed'] = formatted_actions
        
        if 'decisions' in substitutions:
            decisions = substitutions['decisions']
            if isinstance(decisions, list):
                if decisions:
                    formatted_decisions = '\n'.join([f"• {item}" for item in decisions])
                else:
                    formatted_decisions = "• No major decisions made"
                substitutions['decisions'] = formatted_decisions
        
        # Apply substitutions
        for key, value in substitutions.items():
            placeholder = f'{{{key}}}'
            if placeholder in result:
                result = result.replace(placeholder, str(value))
        
        # Clean up any remaining placeholders
        import re
        remaining_placeholders = re.findall(r'\{([^}]+)\}', result)
        for placeholder in remaining_placeholders:
            result = result.replace(
                f'{{{placeholder}}}', 
                f'[{placeholder.replace("_", " ").title()}]'
            )
        
        return result
    
    def _parse_email_body(self, body: str) -> Tuple[str, str, str]:
        """Parse email body into greeting, main content, and closing"""
        
        lines = body.split('\n')
        
        # Find greeting (usually first line with "Hi", "Dear", etc.)
        greeting = ""
        main_start = 0
        
        for i, line in enumerate(lines):
            if any(word in line.lower() for word in ['hi ', 'dear ', 'hello ', 'greetings']):
                greeting = line.strip()
                main_start = i + 1
                break
        
        # Find closing (usually lines with "Best", "Regards", etc.)
        closing = ""
        main_end = len(lines)
        
        for i in range(len(lines) - 1, -1, -1):
            line = lines[i].strip()
            if any(word in line.lower() for word in ['best', 'regards', 'sincerely', 'thanks']):
                closing = line
                main_end = i
                break
        
        # Extract main content
        main_lines = lines[main_start:main_end]
        main_content = '\n'.join(main_lines).strip()
        
        return greeting, main_content, closing
    
    def _generate_subject(self, extracted_info: Dict[str, Any], configuration: EmailConfiguration) -> str:
        """Generate appropriate subject line"""
        
        meeting_title = extracted_info.get('meeting_title', 'Meeting')
        meeting_date = extracted_info.get('meeting_date', '')
        
        if configuration.email_type == EmailType.FOLLOW_UP:
            return f"Follow-up: {meeting_title}"
        elif configuration.email_type == EmailType.ACTION_ITEMS:
            return f"Action Items from {meeting_title}"
        elif configuration.email_type == EmailType.DECISIONS:
            return f"Decisions from {meeting_title}"
        elif configuration.email_type == EmailType.MEETING_RECAP:
            return f"Meeting Recap: {meeting_title} - {meeting_date}"
        elif configuration.email_type == EmailType.THANK_YOU:
            return f"Thank you for attending {meeting_title}"
        elif configuration.email_type == EmailType.NEXT_STEPS:
            return f"Next Steps: {meeting_title}"
        elif configuration.email_type == EmailType.STATUS_UPDATE:
            return f"Status Update: {meeting_title}"
        elif configuration.email_type == EmailType.STAKEHOLDER_UPDATE:
            return f"Executive Summary: {meeting_title}"
        elif configuration.email_type == EmailType.TEAM_SUMMARY:
            return f"Team Summary: {meeting_title}"
        elif configuration.email_type == EmailType.CLIENT_SUMMARY:
            project_name = extracted_info.get('project_name', 'Project')
            return f"Meeting Summary: {project_name} Update"
        else:
            return f"Meeting Summary: {meeting_title}"
    
    def _generate_greeting(self, configuration: EmailConfiguration) -> str:
        """Generate appropriate greeting"""
        
        if configuration.tone == EmailTone.FORMAL:
            if configuration.audience == EmailAudience.EXECUTIVES:
                return "Dear Executive Team,"
            elif configuration.audience == EmailAudience.CLIENTS:
                return "Dear Valued Client,"
            else:
                return "Dear Team,"
        elif configuration.tone == EmailTone.FRIENDLY:
            return "Hi everyone,"
        elif configuration.tone == EmailTone.CASUAL:
            return "Hey team,"
        elif configuration.tone == EmailTone.PROFESSIONAL:
            if configuration.audience == EmailAudience.CLIENTS:
                return "Dear Client,"
            else:
                return "Hello team,"
        else:
            return "Hi team,"
    
    def _generate_main_content(
        self,
        extracted_info: Dict[str, Any],
        configuration: EmailConfiguration
    ) -> str:
        """Generate main email content"""
        
        content_parts = []
        
        # Opening statement
        meeting_title = extracted_info.get('meeting_title', 'our meeting')
        meeting_date = extracted_info.get('meeting_date', 'today')
        
        if configuration.email_type == EmailType.FOLLOW_UP:
            content_parts.append(
                f"Thank you for attending {meeting_title} on {meeting_date}. "
                f"Here's a summary of our discussion and next steps."
            )
        elif configuration.email_type == EmailType.ACTION_ITEMS:
            content_parts.append(
                f"Here are the action items from our {meeting_title} meeting:"
            )
        elif configuration.email_type == EmailType.THANK_YOU:
            content_parts.append(
                f"I wanted to thank everyone for the productive {meeting_title} meeting. "
                f"Your contributions were valuable and appreciated."
            )
        
        # Meeting summary
        if configuration.email_type in [EmailType.FOLLOW_UP, EmailType.MEETING_RECAP, EmailType.TEAM_SUMMARY]:
            summary = extracted_info.get('meeting_summary', '')
            if summary:
                content_parts.append(f"Meeting Summary:\n{summary}")
        
        # Action items
        if configuration.include_action_items:
            action_items = extracted_info.get('action_items', [])
            if action_items:
                content_parts.append("Action Items:")
                for item in action_items:
                    content_parts.append(f"• {item}")
            else:
                content_parts.append("Action Items:\n• No action items identified")
        
        # Decisions
        if configuration.include_decisions:
            decisions = extracted_info.get('decisions', [])
            if decisions:
                content_parts.append("Decisions Made:")
                for decision in decisions:
                    content_parts.append(f"• {decision}")
            else:
                content_parts.append("Decisions Made:\n• No major decisions made")
        
        # Next steps
        next_steps = extracted_info.get('next_steps', [])
        if next_steps and configuration.email_type in [EmailType.FOLLOW_UP, EmailType.NEXT_STEPS]:
            content_parts.append("Next Steps:")
            for step in next_steps:
                content_parts.append(f"• {step}")
        
        # Next meeting
        if configuration.include_next_meeting:
            next_meeting = extracted_info.get('next_meeting', 'TBD')
            content_parts.append(f"Next Meeting: {next_meeting}")
        
        # Feedback request
        if configuration.request_feedback:
            content_parts.append(
                "Please let me know if you have any questions or if I missed anything important."
            )
        
        return '\n\n'.join(content_parts)
    
    def _generate_closing(self, configuration: EmailConfiguration) -> str:
        """Generate appropriate closing"""
        
        if configuration.tone == EmailTone.FORMAL:
            return "Respectfully,"
        elif configuration.tone == EmailTone.FRIENDLY:
            return "Best regards,"
        elif configuration.tone == EmailTone.CASUAL:
            return "Thanks,"
        elif configuration.tone == EmailTone.PROFESSIONAL:
            return "Best regards,"
        elif configuration.tone == EmailTone.ENTHUSIASTIC:
            return "Excited to move forward,"
        elif configuration.tone == EmailTone.CONCISE:
            return "Thanks,"
        else:
            return "Best regards,"
    
    def _generate_signature(self, configuration: EmailConfiguration) -> str:
        """Generate email signature"""
        
        if configuration.custom_signature:
            return configuration.custom_signature
        
        signature_parts = [configuration.sender_name]
        
        if configuration.sender_title:
            signature_parts.append(configuration.sender_title)
        
        if configuration.company_name:
            signature_parts.append(configuration.company_name)
        
        return '\n'.join(signature_parts)
    
    def _extract_action_items(self, text: str) -> List[str]:
        """Extract action items from meeting text"""
        
        action_patterns = [
            r'action item[s]?[:\s]+([^.]+)',
            r'(\w+\s+(?:will|should|needs to|must)\s+[^.]+)',
            r'(we need to [^.]+)',
            r'(assign\w*\s+[^.]+)',
            r'(take ownership\s+[^.]+)'
        ]
        
        actions = []
        for pattern in action_patterns:
            matches = re.finditer(pattern, text, re.IGNORECASE)
            for match in matches:
                action = match.group(1).strip()
                if len(action) > 10:  # Filter out very short matches
                    actions.append(action)
        
        return list(set(actions))[:10]  # Return unique actions, max 10
    
    def _extract_decisions(self, text: str) -> List[str]:
        """Extract decisions from meeting text"""
        
        decision_patterns = [
            r'(we (?:decided|agreed|concluded) [^.]+)',
            r'(the decision is [^.]+)',
            r'(it was decided that [^.]+)',
            r'(approved [^.]+)',
            r'(rejected [^.]+)'
        ]
        
        decisions = []
        for pattern in decision_patterns:
            matches = re.finditer(pattern, text, re.IGNORECASE)
            for match in matches:
                decision = match.group(1).strip()
                if len(decision) > 10:
                    decisions.append(decision)
        
        return list(set(decisions))[:10]  # Return unique decisions, max 10
    
    def _extract_next_steps(self, text: str) -> List[str]:
        """Extract next steps from meeting text"""
        
        next_step_patterns = [
            r'(next step[s]?[:\s]+[^.]+)',
            r'(will [^.]+)',
            r'(plan to [^.]+)',
            r'(going to [^.]+)',
            r'(follow up [^.]+)'
        ]
        
        steps = []
        for pattern in next_step_patterns:
            matches = re.finditer(pattern, text, re.IGNORECASE)
            for match in matches:
                step = match.group(1).strip()
                if len(step) > 10:
                    steps.append(step)
        
        return list(set(steps))[:10]  # Return unique steps, max 10
    
    def _extract_key_points(self, text: str) -> List[str]:
        """Extract key points from meeting text"""
        
        # Simple extraction based on sentence importance
        sentences = text.split('. ')
        
        # Score sentences based on length and keywords
        scored_sentences = []
        important_keywords = ['important', 'key', 'critical', 'major', 'significant', 'priority']
        
        for sentence in sentences:
            score = 0
            words = sentence.lower().split()
            
            # Length score (prefer medium-length sentences)
            if 10 <= len(words) <= 25:
                score += 2
            elif len(words) < 10:
                score += 1
            
            # Keyword score
            for keyword in important_keywords:
                if keyword in sentence.lower():
                    score += 3
            
            if score > 0:
                scored_sentences.append((score, sentence.strip()))
        
        # Sort by score and return top points
        scored_sentences.sort(key=lambda x: x[0], reverse=True)
        return [sentence for score, sentence in scored_sentences[:5]]
    
    async def _calculate_email_quality(self, email_content: EmailContent, configuration: EmailConfiguration) -> Dict[str, float]:
        """Calculate quality metrics for generated email"""
        
        metrics = {}
        
        # Clarity score (based on sentence length and structure)
        metrics['clarity'] = self._calculate_clarity_score(email_content.body)
        
        # Completeness score (has all required elements)
        metrics['completeness'] = self._calculate_completeness_score(
            email_content, configuration
        )
        
        # Professionalism score (appropriate tone and language)
        metrics['professionalism'] = self._calculate_professionalism_score(
            email_content.body, configuration.tone
        )
        
        # Actionability score (clear action items and next steps)
        metrics['actionability'] = self._calculate_actionability_score(
            email_content.body
        )
        
        # Conciseness score (appropriate length)
        metrics['conciseness'] = self._calculate_conciseness_score(
            email_content.body, configuration.email_type
        )
        
        return metrics
    
    def _calculate_clarity_score(self, text: str) -> float:
        """Calculate clarity score based on readability"""
        
        sentences = text.split('.')
        if not sentences:
            return 0.0
        
        # Average sentence length
        avg_sentence_length = sum(len(s.split()) for s in sentences) / len(sentences)
        
        # Optimal sentence length is 15-20 words
        if 15 <= avg_sentence_length <= 20:
            length_score = 1.0
        elif avg_sentence_length < 15:
            length_score = avg_sentence_length / 15
        else:
            length_score = 20 / avg_sentence_length
        
        return min(1.0, length_score)
    
    def _calculate_completeness_score(self, email_content: EmailContent, configuration: EmailConfiguration) -> float:
        """Calculate completeness score"""
        
        score = 0.0
        total_checks = 5
        
        # Has subject
        if email_content.subject.strip():
            score += 1
        
        # Has greeting
        if email_content.greeting.strip():
            score += 1
        
        # Has main content
        if email_content.main_content.strip():
            score += 1
        
        # Has closing
        if email_content.closing.strip():
            score += 1
        
        # Has signature
        if email_content.signature.strip():
            score += 1
        
        return score / total_checks
    
    def _calculate_professionalism_score(self, text: str, tone: EmailTone) -> float:
        """Calculate professionalism score"""
        
        # Simple scoring based on tone appropriateness
        unprofessional_words = ['hey', 'guys', 'whatever', 'stuff', 'things']
        formal_words = ['please', 'thank you', 'regards', 'respectfully']
        
        text_lower = text.lower()
        
        unprofessional_count = sum(1 for word in unprofessional_words if word in text_lower)
        formal_count = sum(1 for word in formal_words if word in text_lower)
        
        # Base score
        base_score = 0.8
        
        # Adjust based on content
        if tone in [EmailTone.FORMAL, EmailTone.PROFESSIONAL]:
            base_score += formal_count * 0.05
            base_score -= unprofessional_count * 0.1
        elif tone == EmailTone.CASUAL:
            # Casual tone allows some informal language
            base_score -= unprofessional_count * 0.05
        
        return min(1.0, max(0.0, base_score))
    
    def _calculate_actionability_score(self, text: str) -> float:
        """Calculate actionability score"""
        
        action_indicators = [
            'action item', 'next step', 'will do', 'responsible for',
            'deadline', 'due date', 'follow up', 'complete by'
        ]
        
        text_lower = text.lower()
        action_count = sum(1 for indicator in action_indicators if indicator in text_lower)
        
        # Normalize score
        return min(1.0, action_count / 3.0)  # 3 action indicators = perfect score
    
    def _calculate_conciseness_score(self, text: str, email_type: EmailType) -> float:
        """Calculate conciseness score based on email type"""
        
        word_count = len(text.split())
        
        # Optimal word counts by email type
        optimal_ranges = {
            EmailType.FOLLOW_UP: (150, 300),
            EmailType.ACTION_ITEMS: (100, 200),
            EmailType.DECISIONS: (100, 200),
            EmailType.MEETING_RECAP: (200, 400),
            EmailType.THANK_YOU: (50, 150),
            EmailType.NEXT_STEPS: (100, 200),
            EmailType.STATUS_UPDATE: (150, 300),
            EmailType.STAKEHOLDER_UPDATE: (200, 400),
            EmailType.TEAM_SUMMARY: (150, 300),
            EmailType.CLIENT_SUMMARY: (200, 350)
        }
        
        min_words, max_words = optimal_ranges.get(email_type, (150, 300))
        
        if min_words <= word_count <= max_words:
            return 1.0
        elif word_count < min_words:
            return word_count / min_words
        else:
            return max_words / word_count
    
    def _calculate_confidence_score(self, quality_metrics: Dict[str, float]) -> float:
        """Calculate overall confidence score"""
        
        if not quality_metrics:
            return 0.5
        
        # Weight different metrics
        weights = {
            'clarity': 0.25,
            'completeness': 0.25,
            'professionalism': 0.2,
            'actionability': 0.15,
            'conciseness': 0.15
        }
        
        weighted_score = sum(
            quality_metrics.get(metric, 0.5) * weight
            for metric, weight in weights.items()
        )
        
        return min(1.0, weighted_score)
    
    def _update_stats(self, configuration: EmailConfiguration, template_id: Optional[str]):
        """Update service statistics"""
        
        self.stats['total_emails'] += 1
        self.stats['emails_by_type'][configuration.email_type.value] += 1
        self.stats['emails_by_tone'][configuration.tone.value] += 1
        self.stats['emails_by_audience'][configuration.audience.value] += 1
        
        if template_id:
            self.stats['template_usage'][template_id] += 1
    
    async def get_available_templates(
        self,
        email_type: Optional[EmailType] = None,
        audience: Optional[EmailAudience] = None,
        tone: Optional[EmailTone] = None
    ) -> List[EmailTemplate]:
        """Get available email templates with filtering"""
        
        templates = list(self.templates.values())
        
        # Apply filters
        if email_type:
            templates = [t for t in templates if t.email_type == email_type]
        
        if audience:
            templates = [t for t in templates if t.audience == audience]
        
        if tone:
            templates = [t for t in templates if t.tone == tone]
        
        # Sort by rating and usage
        templates.sort(key=lambda t: (t.rating, t.usage_count), reverse=True)
        
        return templates
    
    def create_custom_template(
        self,
        template_data: Dict[str, Any],
        user_id: str
    ) -> str:
        """Create a custom email template"""
        
        template_id = f"custom_email_{uuid.uuid4().hex[:8]}"
        
        template = EmailTemplate(
            id=template_id,
            name=template_data['name'],
            description=template_data['description'],
            email_type=EmailType(template_data['email_type']),
            audience=EmailAudience(template_data['audience']),
            tone=EmailTone(template_data['tone']),
            subject_template=template_data['subject_template'],
            body_template=template_data['body_template'],
            placeholders=template_data.get('placeholders', []),
            example_output=template_data.get('example_output', ''),
            usage_count=0,
            rating=0.0,
            created_by=user_id,
            created_at=datetime.now(),
            is_public=template_data.get('is_public', False)
        )
        
        self.templates[template_id] = template
        
        return template_id
    
    async def get_service_statistics(self) -> Dict[str, Any]:
        """Get service statistics"""
        
        return {
            'total_emails': self.stats['total_emails'],
            'emails_by_type': dict(self.stats['emails_by_type']),
            'emails_by_tone': dict(self.stats['emails_by_tone']),
            'emails_by_audience': dict(self.stats['emails_by_audience']),
            'template_count': len(self.templates),
            'template_usage': dict(self.stats['template_usage']),
            'cache_size': len(self.generation_cache)
        }

# Global service instance
email_generation_service = None

async def get_email_generation_service() -> EmailGenerationService:
    """Get the global email generation service instance"""
    global email_generation_service
    if email_generation_service is None:
        email_generation_service = EmailGenerationService()
        await email_generation_service.initialize()
    return email_generation_service