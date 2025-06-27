# Multi-Level Summary Service
# Service for generating different types and levels of summaries

import asyncio
import json
import time
import uuid
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any, Tuple
from dataclasses import dataclass, asdict
from enum import Enum
import logging
from collections import defaultdict

from summarization_engine import (
    get_summarization_engine, SummarizationEngine,
    SummaryType, SummarizationTechnique, MeetingType, QualityMetric,
    SummarizationRequest, SummaryResult
)

class SummaryLevel(Enum):
    """Different levels of summary detail"""
    BRIEF = "brief"                    # 1-2 sentences
    SHORT = "short"                   # 2-3 sentences
    MEDIUM = "medium"                 # 1 paragraph
    DETAILED = "detailed"             # 2-3 paragraphs
    COMPREHENSIVE = "comprehensive"   # Full detailed summary

class SummaryFormat(Enum):
    """Different summary formats"""
    PARAGRAPH = "paragraph"           # Continuous text
    BULLET_POINTS = "bullet_points"   # Bulleted list
    NUMBERED_LIST = "numbered_list"   # Numbered list
    EXECUTIVE = "executive"           # Executive summary format
    REPORT = "report"                 # Formal report format
    EMAIL = "email"                   # Email-friendly format

@dataclass
class SummaryConfiguration:
    """Configuration for summary generation"""
    level: SummaryLevel
    format: SummaryFormat
    summary_type: SummaryType
    technique: SummarizationTechnique
    meeting_type: Optional[MeetingType]
    focus_areas: List[str]  # e.g., ['decisions', 'action_items', 'key_points']
    include_speakers: bool
    include_timestamps: bool
    include_confidence: bool
    custom_template: Optional[str]
    target_audience: str  # e.g., 'executives', 'team_members', 'external'
    quality_requirements: Dict[QualityMetric, float]

@dataclass
class MultiLevelSummaryResult:
    """Result containing multiple summary levels"""
    meeting_id: str
    summaries: Dict[SummaryLevel, SummaryResult]
    key_insights: List[str]
    action_items: List[str]
    decisions: List[str]
    participants: List[str]
    meeting_metadata: Dict[str, Any]
    generated_at: datetime
    total_processing_time_ms: float

@dataclass
class SummaryTemplate:
    """Template for generating structured summaries"""
    id: str
    name: str
    description: str
    meeting_type: MeetingType
    template_content: str
    placeholders: List[str]
    format: SummaryFormat
    example_output: str
    created_by: str
    created_at: datetime
    usage_count: int
    rating: float
    is_public: bool

class MultiLevelSummaryService:
    """
    Service for generating multiple levels and types of summaries
    
    Features:
    - Multi-level summary generation (brief to comprehensive)
    - Multiple format support (paragraph, bullets, executive, etc.)
    - Template-based customization
    - Quality-aware generation
    - Audience-specific optimization
    - Performance tracking
    
    Architecture:
    
    1. Configuration Management:
       - Summary level and format selection
       - Quality requirement specification
       - Template management
    
    2. Multi-Level Generation:
       - Parallel generation of different levels
       - Consistency across levels
       - Progressive detail enhancement
    
    3. Format Adaptation:
       - Content restructuring for different formats
       - Audience-appropriate language
       - Template application
    
    4. Quality Assurance:
       - Cross-level consistency checking
       - Quality metric evaluation
       - Confidence scoring
    """
    
    def __init__(self):
        """Initialize the multi-level summary service"""
        self.summarization_engine: Optional[SummarizationEngine] = None
        
        # Template storage
        self.templates: Dict[str, SummaryTemplate] = {}
        self._initialize_default_templates()
        
        # Performance tracking
        self.stats = {
            'total_requests': 0,
            'requests_by_level': defaultdict(int),
            'requests_by_format': defaultdict(int),
            'avg_processing_time': 0.0,
            'template_usage': defaultdict(int)
        }
        
        # Cache for frequently requested summaries
        self.summary_cache: Dict[str, MultiLevelSummaryResult] = {}
        self.cache_ttl = 300  # 5 minutes
        
        self.logger = logging.getLogger(__name__)
    
    async def initialize(self):
        """Initialize the service and dependencies"""
        self.summarization_engine = await get_summarization_engine()
        self.logger.info("Multi-level summary service initialized")
    
    def _initialize_default_templates(self):
        """Initialize default summary templates"""
        
        templates = [
            # Executive Summary Template
            SummaryTemplate(
                id="executive_summary",
                name="Executive Summary",
                description="High-level summary for executives and stakeholders",
                meeting_type=MeetingType.GENERAL,
                template_content="""EXECUTIVE SUMMARY

Meeting: {meeting_title}
Date: {meeting_date}
Participants: {participants}

KEY OUTCOMES:
{key_decisions}

ACTION ITEMS:
{action_items}

IMPACT & NEXT STEPS:
{next_steps}

RISKS & CONCERNS:
{risks}""",
                placeholders=["meeting_title", "meeting_date", "participants", "key_decisions", "action_items", "next_steps", "risks"],
                format=SummaryFormat.EXECUTIVE,
                example_output="Executive summary focusing on business impact and strategic decisions",
                created_by="system",
                created_at=datetime.now(),
                usage_count=0,
                rating=5.0,
                is_public=True
            ),
            
            # Team Meeting Template
            SummaryTemplate(
                id="team_meeting",
                name="Team Meeting Summary",
                description="Standard team meeting summary with action items",
                meeting_type=MeetingType.GENERAL,
                template_content="""TEAM MEETING SUMMARY

Date: {meeting_date}
Attendees: {participants}
Duration: {duration}

DISCUSSION HIGHLIGHTS:
{key_points}

DECISIONS MADE:
{decisions}

ACTION ITEMS:
{action_items}

NEXT MEETING: {next_meeting}""",
                placeholders=["meeting_date", "participants", "duration", "key_points", "decisions", "action_items", "next_meeting"],
                format=SummaryFormat.REPORT,
                example_output="Structured team meeting summary with clear action items",
                created_by="system",
                created_at=datetime.now(),
                usage_count=0,
                rating=4.8,
                is_public=True
            ),
            
            # Email Summary Template
            SummaryTemplate(
                id="email_summary",
                name="Email Summary",
                description="Email-friendly summary for sharing",
                meeting_type=MeetingType.GENERAL,
                template_content="""Hi team,

Here's a quick summary of our meeting on {meeting_date}:

KEY POINTS:
{key_points}

ACTION ITEMS:
{action_items}

NEXT STEPS:
{next_steps}

Please let me know if I missed anything important.

Best regards""",
                placeholders=["meeting_date", "key_points", "action_items", "next_steps"],
                format=SummaryFormat.EMAIL,
                example_output="Friendly email summary ready for sharing",
                created_by="system",
                created_at=datetime.now(),
                usage_count=0,
                rating=4.9,
                is_public=True
            ),
            
            # Standup Summary Template
            SummaryTemplate(
                id="standup_summary",
                name="Daily Standup Summary",
                description="Quick standup meeting summary",
                meeting_type=MeetingType.STANDUP,
                template_content="""DAILY STANDUP - {meeting_date}

COMPLETED YESTERDAY:
{completed_work}

PLANNED TODAY:
{planned_work}

BLOCKERS:
{blockers}

TEAM UPDATES:
{team_updates}""",
                placeholders=["meeting_date", "completed_work", "planned_work", "blockers", "team_updates"],
                format=SummaryFormat.BULLET_POINTS,
                example_output="Structured standup summary with progress tracking",
                created_by="system",
                created_at=datetime.now(),
                usage_count=0,
                rating=4.7,
                is_public=True
            ),
            
            # Retrospective Summary Template
            SummaryTemplate(
                id="retrospective_summary",
                name="Retrospective Summary",
                description="Retrospective meeting summary with improvements",
                meeting_type=MeetingType.RETROSPECTIVE,
                template_content="""RETROSPECTIVE SUMMARY - {meeting_date}

WHAT WENT WELL:
{went_well}

WHAT COULD BE IMPROVED:
{improvements}

ACTION ITEMS FOR NEXT SPRINT:
{action_items}

TEAM FEEDBACK:
{feedback}

KEY INSIGHTS:
{insights}""",
                placeholders=["meeting_date", "went_well", "improvements", "action_items", "feedback", "insights"],
                format=SummaryFormat.REPORT,
                example_output="Comprehensive retrospective summary with actionable insights",
                created_by="system",
                created_at=datetime.now(),
                usage_count=0,
                rating=4.9,
                is_public=True
            )
        ]
        
        for template in templates:
            self.templates[template.id] = template
    
    async def generate_multi_level_summary(
        self,
        text: str,
        meeting_id: str,
        levels: List[SummaryLevel],
        configuration: SummaryConfiguration,
        meeting_metadata: Dict[str, Any] = None
    ) -> MultiLevelSummaryResult:
        """
        Generate summaries at multiple levels of detail
        """
        start_time = time.time()
        
        # Check cache
        cache_key = f"{meeting_id}_{hash(text[:100])}_{hash(str(levels))}"
        if cache_key in self.summary_cache:
            cached_result = self.summary_cache[cache_key]
            if (datetime.now() - cached_result.generated_at).total_seconds() < self.cache_ttl:
                return cached_result
        
        try:
            # Generate summaries for each level in parallel
            summary_tasks = []
            
            for level in levels:
                # Create configuration for this level
                level_config = self._create_level_configuration(level, configuration)
                
                # Create summarization request
                request = SummarizationRequest(
                    text=text,
                    summary_type=level_config.summary_type,
                    technique=level_config.technique,
                    meeting_type=level_config.meeting_type,
                    custom_template=level_config.custom_template,
                    target_length=self._get_target_length(level),
                    focus_keywords=level_config.focus_areas,
                    speaker_context=meeting_metadata.get('speakers', {}) if meeting_metadata else {},
                    meeting_metadata=meeting_metadata or {},
                    quality_requirements=level_config.quality_requirements
                )
                
                # Create task for parallel execution
                task = self._generate_level_summary(request, level, configuration)
                summary_tasks.append(task)
            
            # Execute all tasks in parallel
            level_results = await asyncio.gather(*summary_tasks)
            
            # Create summary dictionary
            summaries = {}
            for level, result in zip(levels, level_results):
                # Apply format transformation
                formatted_result = await self._apply_format_transformation(
                    result, configuration.format, configuration
                )
                summaries[level] = formatted_result
            
            # Extract consolidated insights
            key_insights = await self._extract_consolidated_insights(text, summaries)
            action_items = await self._extract_consolidated_actions(text, summaries)
            decisions = await self._extract_consolidated_decisions(text, summaries)
            
            # Extract participants
            participants = self._extract_participants(meeting_metadata) if meeting_metadata else []
            
            # Create result
            result = MultiLevelSummaryResult(
                meeting_id=meeting_id,
                summaries=summaries,
                key_insights=key_insights,
                action_items=action_items,
                decisions=decisions,
                participants=participants,
                meeting_metadata=meeting_metadata or {},
                generated_at=datetime.now(),
                total_processing_time_ms=(time.time() - start_time) * 1000
            )
            
            # Cache result
            self.summary_cache[cache_key] = result
            
            # Update statistics
            self._update_stats(levels, configuration)
            
            return result
            
        except Exception as e:
            self.logger.error(f"Multi-level summary generation failed: {e}")
            raise
    
    async def _generate_level_summary(
        self,
        request: SummarizationRequest,
        level: SummaryLevel,
        configuration: SummaryConfiguration
    ) -> SummaryResult:
        """Generate summary for a specific level"""
        
        # Adjust request parameters based on level
        if level == SummaryLevel.BRIEF:
            request.target_length = 50  # ~50 words
        elif level == SummaryLevel.SHORT:
            request.target_length = 100  # ~100 words
        elif level == SummaryLevel.MEDIUM:
            request.target_length = 200  # ~200 words
        elif level == SummaryLevel.DETAILED:
            request.target_length = 400  # ~400 words
        elif level == SummaryLevel.COMPREHENSIVE:
            request.target_length = 800  # ~800 words
        
        # Generate summary using the engine
        result = await self.summarization_engine.generate_summary(request)
        
        return result
    
    def _create_level_configuration(
        self,
        level: SummaryLevel,
        base_config: SummaryConfiguration
    ) -> SummaryConfiguration:
        """Create configuration specific to a summary level"""
        
        # Copy base configuration
        level_config = SummaryConfiguration(
            level=level,
            format=base_config.format,
            summary_type=base_config.summary_type,
            technique=base_config.technique,
            meeting_type=base_config.meeting_type,
            focus_areas=base_config.focus_areas.copy(),
            include_speakers=base_config.include_speakers,
            include_timestamps=base_config.include_timestamps,
            include_confidence=base_config.include_confidence,
            custom_template=base_config.custom_template,
            target_audience=base_config.target_audience,
            quality_requirements=base_config.quality_requirements.copy()
        )
        
        # Adjust based on level
        if level == SummaryLevel.BRIEF:
            # Brief summaries focus on key points only
            level_config.focus_areas = ['key_points']
            level_config.include_speakers = False
            level_config.include_timestamps = False
            level_config.summary_type = SummaryType.SHORT
            
        elif level == SummaryLevel.SHORT:
            # Short summaries include decisions and actions
            level_config.focus_areas = ['key_points', 'decisions', 'action_items']
            level_config.include_speakers = False
            level_config.summary_type = SummaryType.SHORT
            
        elif level == SummaryLevel.MEDIUM:
            # Medium summaries include more context
            level_config.summary_type = SummaryType.DETAILED
            
        elif level == SummaryLevel.DETAILED:
            # Detailed summaries include all elements
            level_config.summary_type = SummaryType.DETAILED
            
        elif level == SummaryLevel.COMPREHENSIVE:
            # Comprehensive summaries include everything
            level_config.summary_type = SummaryType.DETAILED
            level_config.include_speakers = True
            level_config.include_timestamps = True
            level_config.include_confidence = True
        
        return level_config
    
    def _get_target_length(self, level: SummaryLevel) -> int:
        """Get target length in words for a summary level"""
        
        length_map = {
            SummaryLevel.BRIEF: 50,
            SummaryLevel.SHORT: 100,
            SummaryLevel.MEDIUM: 200,
            SummaryLevel.DETAILED: 400,
            SummaryLevel.COMPREHENSIVE: 800
        }
        
        return length_map.get(level, 200)
    
    async def _apply_format_transformation(
        self,
        summary_result: SummaryResult,
        target_format: SummaryFormat,
        configuration: SummaryConfiguration
    ) -> SummaryResult:
        """Transform summary content to match target format"""
        
        original_content = summary_result.content
        
        if target_format == SummaryFormat.BULLET_POINTS:
            formatted_content = self._format_as_bullets(original_content, summary_result.key_points)
        elif target_format == SummaryFormat.NUMBERED_LIST:
            formatted_content = self._format_as_numbered_list(original_content, summary_result.key_points)
        elif target_format == SummaryFormat.EXECUTIVE:
            formatted_content = self._format_as_executive(original_content, summary_result)
        elif target_format == SummaryFormat.REPORT:
            formatted_content = self._format_as_report(original_content, summary_result, configuration)
        elif target_format == SummaryFormat.EMAIL:
            formatted_content = self._format_as_email(original_content, summary_result)
        else:
            # Keep as paragraph format
            formatted_content = original_content
        
        # Update the result with formatted content
        summary_result.content = formatted_content
        
        return summary_result
    
    def _format_as_bullets(self, content: str, key_points: List) -> str:
        """Format content as bullet points"""
        
        # Split content into sentences and convert to bullets
        sentences = content.split('. ')
        bullets = []
        
        for sentence in sentences:
            if sentence.strip():
                cleaned = sentence.strip().rstrip('.')
                if cleaned:
                    bullets.append(f"• {cleaned}")
        
        # Add key points if available
        if key_points:
            bullets.extend([f"• {point.text}" for point in key_points[:3]])
        
        return '\n'.join(bullets)
    
    def _format_as_numbered_list(self, content: str, key_points: List) -> str:
        """Format content as numbered list"""
        
        sentences = content.split('. ')
        numbered_items = []
        
        for i, sentence in enumerate(sentences, 1):
            if sentence.strip():
                cleaned = sentence.strip().rstrip('.')
                if cleaned:
                    numbered_items.append(f"{i}. {cleaned}")
        
        return '\n'.join(numbered_items)
    
    def _format_as_executive(self, content: str, summary_result: SummaryResult) -> str:
        """Format content as executive summary"""
        
        executive_format = f"""EXECUTIVE SUMMARY

Overview:
{content}

Key Points:
{self._extract_top_points(summary_result.key_points, 3)}

Confidence Level: {int(summary_result.confidence_score * 100)}%

Processing Time: {summary_result.processing_time_ms:.0f}ms"""
        
        return executive_format
    
    def _format_as_report(self, content: str, summary_result: SummaryResult, configuration: SummaryConfiguration) -> str:
        """Format content as formal report"""
        
        report_sections = []
        
        # Header
        report_sections.append("MEETING SUMMARY REPORT")
        report_sections.append("=" * 25)
        report_sections.append("")
        
        # Summary section
        report_sections.append("SUMMARY:")
        report_sections.append(content)
        report_sections.append("")
        
        # Key points section
        if summary_result.key_points:
            report_sections.append("KEY POINTS:")
            for i, point in enumerate(summary_result.key_points[:5], 1):
                report_sections.append(f"{i}. {point.text}")
            report_sections.append("")
        
        # Quality metrics section
        if configuration.include_confidence:
            report_sections.append("QUALITY METRICS:")
            for metric, score in summary_result.quality_metrics.items():
                report_sections.append(f"- {metric.value.title()}: {int(score * 100)}%")
            report_sections.append("")
        
        # Metadata section
        report_sections.append(f"Generated: {summary_result.generated_at.strftime('%Y-%m-%d %H:%M:%S')}")
        report_sections.append(f"Technique: {summary_result.technique.value.replace('_', ' ').title()}")
        
        return '\n'.join(report_sections)
    
    def _format_as_email(self, content: str, summary_result: SummaryResult) -> str:
        """Format content as email-friendly text"""
        
        email_format = f"""Hi team,

Here's a summary of our recent meeting:

{content}

Key takeaways:
{self._extract_top_points(summary_result.key_points, 3)}

Please let me know if you have any questions or if I missed anything important.

Best regards"""
        
        return email_format
    
    def _extract_top_points(self, key_points: List, limit: int) -> str:
        """Extract top key points as formatted text"""
        
        if not key_points:
            return "No key points identified"
        
        points = []
        for point in key_points[:limit]:
            points.append(f"• {point.text}")
        
        return '\n'.join(points)
    
    async def _extract_consolidated_insights(self, text: str, summaries: Dict[SummaryLevel, SummaryResult]) -> List[str]:
        """Extract consolidated insights across all summary levels"""
        
        all_insights = set()
        
        # Collect insights from all levels
        for level, summary in summaries.items():
            for point in summary.key_points:
                if point.category in ['insight', 'key_point', 'general']:
                    all_insights.add(point.text)
        
        # Sort by frequency across levels
        insight_counts = {}
        for insight in all_insights:
            count = sum(
                1 for summary in summaries.values()
                for point in summary.key_points
                if point.text == insight
            )
            insight_counts[insight] = count
        
        # Return top insights
        sorted_insights = sorted(insight_counts.items(), key=lambda x: x[1], reverse=True)
        return [insight for insight, count in sorted_insights[:10]]
    
    async def _extract_consolidated_actions(self, text: str, summaries: Dict[SummaryLevel, SummaryResult]) -> List[str]:
        """Extract consolidated action items across all summary levels"""
        
        all_actions = set()
        
        # Collect action items from all levels
        for level, summary in summaries.items():
            for point in summary.key_points:
                if point.category == 'action_item':
                    all_actions.add(point.text)
        
        return list(all_actions)[:10]  # Return top 10
    
    async def _extract_consolidated_decisions(self, text: str, summaries: Dict[SummaryLevel, SummaryResult]) -> List[str]:
        """Extract consolidated decisions across all summary levels"""
        
        all_decisions = set()
        
        # Collect decisions from all levels
        for level, summary in summaries.items():
            for point in summary.key_points:
                if point.category == 'decision':
                    all_decisions.add(point.text)
        
        return list(all_decisions)[:10]  # Return top 10
    
    def _extract_participants(self, meeting_metadata: Dict[str, Any]) -> List[str]:
        """Extract participant list from meeting metadata"""
        
        participants = []
        
        if 'participants' in meeting_metadata:
            participants = meeting_metadata['participants']
        elif 'speakers' in meeting_metadata:
            participants = list(meeting_metadata['speakers'].keys())
        elif 'attendees' in meeting_metadata:
            participants = meeting_metadata['attendees']
        
        return participants
    
    async def generate_single_summary(
        self,
        text: str,
        meeting_id: str,
        configuration: SummaryConfiguration,
        meeting_metadata: Dict[str, Any] = None
    ) -> SummaryResult:
        """Generate a single summary with specified configuration"""
        
        # Create summarization request
        request = SummarizationRequest(
            text=text,
            summary_type=configuration.summary_type,
            technique=configuration.technique,
            meeting_type=configuration.meeting_type,
            custom_template=configuration.custom_template,
            target_length=self._get_target_length(configuration.level),
            focus_keywords=configuration.focus_areas,
            speaker_context=meeting_metadata.get('speakers', {}) if meeting_metadata else {},
            meeting_metadata=meeting_metadata or {},
            quality_requirements=configuration.quality_requirements
        )
        
        # Generate summary
        result = await self.summarization_engine.generate_summary(request)
        
        # Apply format transformation
        formatted_result = await self._apply_format_transformation(
            result, configuration.format, configuration
        )
        
        return formatted_result
    
    async def get_available_templates(self, meeting_type: Optional[MeetingType] = None) -> List[SummaryTemplate]:
        """Get available summary templates"""
        
        templates = list(self.templates.values())
        
        if meeting_type:
            templates = [
                template for template in templates
                if template.meeting_type == meeting_type or template.meeting_type == MeetingType.GENERAL
            ]
        
        # Sort by rating and usage
        templates.sort(key=lambda t: (t.rating, t.usage_count), reverse=True)
        
        return templates
    
    async def apply_template(
        self,
        text: str,
        template_id: str,
        substitutions: Dict[str, str] = None
    ) -> str:
        """Apply a template to generate formatted summary"""
        
        if template_id not in self.templates:
            raise ValueError(f"Template {template_id} not found")
        
        template = self.templates[template_id]
        
        # Update usage count
        template.usage_count += 1
        self.stats['template_usage'][template_id] += 1
        
        # Create substitutions dictionary
        subs = substitutions or {}
        
        # Auto-extract common placeholders if not provided
        if 'meeting_date' not in subs:
            subs['meeting_date'] = datetime.now().strftime('%Y-%m-%d')
        
        if 'participants' not in subs:
            subs['participants'] = 'Meeting participants'
        
        # Apply template
        result = template.template_content
        for placeholder, value in subs.items():
            result = result.replace(f'{{{placeholder}}}', value)
        
        # Replace any remaining placeholders with default text
        import re
        remaining_placeholders = re.findall(r'\{([^}]+)\}', result)
        for placeholder in remaining_placeholders:
            result = result.replace(f'{{{placeholder}}}', f'[{placeholder.replace("_", " ").title()}]')
        
        return result
    
    def create_custom_template(
        self,
        template_data: Dict[str, Any],
        user_id: str
    ) -> str:
        """Create a custom summary template"""
        
        template_id = f"custom_{uuid.uuid4().hex[:8]}"
        
        template = SummaryTemplate(
            id=template_id,
            name=template_data['name'],
            description=template_data['description'],
            meeting_type=MeetingType(template_data.get('meeting_type', 'general')),
            template_content=template_data['template_content'],
            placeholders=template_data.get('placeholders', []),
            format=SummaryFormat(template_data.get('format', 'paragraph')),
            example_output=template_data.get('example_output', ''),
            created_by=user_id,
            created_at=datetime.now(),
            usage_count=0,
            rating=0.0,
            is_public=template_data.get('is_public', False)
        )
        
        self.templates[template_id] = template
        
        return template_id
    
    def _update_stats(self, levels: List[SummaryLevel], configuration: SummaryConfiguration):
        """Update service statistics"""
        
        self.stats['total_requests'] += 1
        
        for level in levels:
            self.stats['requests_by_level'][level.value] += 1
        
        self.stats['requests_by_format'][configuration.format.value] += 1
    
    async def get_service_statistics(self) -> Dict[str, Any]:
        """Get service statistics"""
        
        # Get engine statistics
        engine_stats = await self.summarization_engine.get_statistics() if self.summarization_engine else {}
        
        return {
            'service_stats': dict(self.stats),
            'engine_stats': engine_stats,
            'template_count': len(self.templates),
            'cache_size': len(self.summary_cache)
        }

# Global service instance
multi_level_summary_service = None

async def get_multi_level_summary_service() -> MultiLevelSummaryService:
    """Get the global multi-level summary service instance"""
    global multi_level_summary_service
    if multi_level_summary_service is None:
        multi_level_summary_service = MultiLevelSummaryService()
        await multi_level_summary_service.initialize()
    return multi_level_summary_service