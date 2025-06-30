# AI-Powered Insight Generation Service
# Generates different types of meeting insights based on triggers and context

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
from collections import Counter, defaultdict
import statistics

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

from ai_orchestration import (
    TaskRequest,
    TaskComplexity,
    RoutingStrategy,
    get_orchestrator,
)
from insight_trigger_engine import DetectedTrigger, TriggerType, TriggerPriority
from topic_detection_service import DetectedTopic, TopicTransition


class InsightType(Enum):
    """Types of insights that can be generated"""

    ACTION_ITEM = "action_item"
    DECISION = "decision"
    CONCERN = "concern"
    QUESTION = "question"
    SUMMARY = "summary"
    TOPIC_TRANSITION = "topic_transition"
    CONFLICT_RESOLUTION = "conflict_resolution"
    CONSENSUS = "consensus"
    TECHNICAL_NOTE = "technical_note"
    BUSINESS_INSIGHT = "business_insight"
    DEADLINE = "deadline"
    FOLLOWUP = "followup"
    KEY_QUOTE = "key_quote"
    SENTIMENT_SHIFT = "sentiment_shift"
    SPEAKER_HIGHLIGHT = "speaker_highlight"


class InsightPriority(Enum):
    """Priority levels for insights"""

    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class InsightStatus(Enum):
    """Status of insight processing"""

    PENDING = "pending"
    GENERATING = "generating"
    COMPLETED = "completed"
    FAILED = "failed"
    REVIEWED = "reviewed"
    DISMISSED = "dismissed"


class ConfidenceSource(Enum):
    """Sources that contribute to insight confidence"""

    TRIGGER_CONFIDENCE = "trigger_confidence"
    AI_CONFIDENCE = "ai_confidence"
    CONTEXT_RELEVANCE = "context_relevance"
    PATTERN_MATCH = "pattern_match"
    SPEAKER_AUTHORITY = "speaker_authority"
    TOPIC_COHERENCE = "topic_coherence"


@dataclass
class InsightTemplate:
    """Template for generating specific types of insights"""

    insight_type: InsightType
    prompt_template: str
    context_requirements: List[str]
    min_confidence: float
    max_tokens: int
    temperature: float
    model_preference: str
    post_processing_rules: List[str]


@dataclass
class ConfidenceBreakdown:
    """Detailed breakdown of confidence scoring"""

    overall_confidence: float
    confidence_sources: Dict[ConfidenceSource, float]
    contributing_factors: List[str]
    uncertainty_factors: List[str]
    confidence_level: str  # "very_low", "low", "medium", "high", "very_high"


@dataclass
class GeneratedInsight:
    """A generated meeting insight with full metadata"""

    id: str
    insight_type: InsightType
    priority: InsightPriority
    status: InsightStatus
    title: str
    content: str
    summary: str
    confidence: ConfidenceBreakdown
    timestamp: float
    meeting_timestamp: float
    speaker: Optional[str]
    topic_context: Optional[str]
    related_triggers: List[str]
    context_window: List[str]
    keywords: List[str]
    entities: List[str]
    action_items: List[str]
    deadlines: List[str]
    stakeholders: List[str]
    metadata: Dict[str, Any]
    ai_model_used: str
    generation_time_ms: float
    review_notes: Optional[str]
    user_feedback: Optional[Dict[str, Any]]


@dataclass
class InsightGenerationRequest:
    """Request for insight generation"""

    trigger: DetectedTrigger
    context: Dict[str, Any]
    preferred_type: Optional[InsightType]
    custom_template: Optional[str]
    urgency_override: Optional[InsightPriority]


class InsightGenerationService:
    """
    AI-powered service for generating meeting insights

    Features:
    - Multiple insight types with specialized templates
    - AI-powered content generation using Claude/GPT
    - Confidence scoring and quality assessment
    - Context-aware generation
    - Template customization
    - Real-time processing
    - Quality control and review
    """

    def __init__(self, orchestrator=None):
        """Initialize the insight generation service"""
        self.orchestrator = orchestrator
        self.insight_templates = self._initialize_templates()
        self.active_sessions: Dict[str, Dict] = {}
        self.insight_history: Dict[str, List[GeneratedInsight]] = {}

        # Quality control settings
        self.min_content_length = 50
        self.max_content_length = 1000
        self.confidence_threshold = 0.4

        # Performance tracking
        self.generation_stats = {
            "total_insights": 0,
            "insights_by_type": Counter(),
            "average_generation_time": 0.0,
            "confidence_distribution": [],
            "success_rate": 0.0,
        }

        self.logger = logging.getLogger(__name__)

    def _initialize_templates(self) -> Dict[InsightType, InsightTemplate]:
        """Initialize default insight generation templates"""
        templates = {}

        # Action Item Template
        templates[InsightType.ACTION_ITEM] = InsightTemplate(
            insight_type=InsightType.ACTION_ITEM,
            prompt_template="""
            Based on this meeting discussion, identify and create a clear action item:

            Context: {context}
            Speaker: {speaker}
            Discussion: {trigger_text}

            Create a specific, actionable task that includes:
            1. What needs to be done
            2. Who should do it (if mentioned)
            3. When it should be completed (if mentioned)
            4. Why it's important

            Format as a concise action item with clear next steps.
            """,
            context_requirements=["trigger_text", "speaker"],
            min_confidence=0.5,
            max_tokens=300,
            temperature=0.3,
            model_preference="claude-3-5-sonnet-20241022",
            post_processing_rules=["extract_deadlines", "identify_assignees"],
        )

        # Decision Template
        templates[InsightType.DECISION] = InsightTemplate(
            insight_type=InsightType.DECISION,
            prompt_template="""
            Analyze this meeting discussion to identify and summarize a decision:

            Context: {context}
            Discussion: {trigger_text}
            Topic: {topic_context}

            Summarize:
            1. What decision was made or needs to be made
            2. Key options discussed
            3. Rationale behind the decision
            4. Impact and implications
            5. Next steps

            Be clear and factual, focusing on the decision outcome.
            """,
            context_requirements=["trigger_text", "context"],
            min_confidence=0.6,
            max_tokens=400,
            temperature=0.2,
            model_preference="claude-3-5-sonnet-20241022",
            post_processing_rules=[
                "highlight_decision_outcome",
                "extract_implications",
            ],
        )

        # Concern Template
        templates[InsightType.CONCERN] = InsightTemplate(
            insight_type=InsightType.CONCERN,
            prompt_template="""
            Identify and analyze the concern raised in this discussion:

            Context: {context}
            Speaker: {speaker}
            Discussion: {trigger_text}

            Summarize:
            1. What is the specific concern
            2. Why is it important
            3. Potential impact if not addressed
            4. Suggested mitigation or resolution
            5. Urgency level

            Focus on the core issue and constructive resolution paths.
            """,
            context_requirements=["trigger_text", "speaker"],
            min_confidence=0.5,
            max_tokens=350,
            temperature=0.4,
            model_preference="claude-3-5-sonnet-20241022",
            post_processing_rules=["assess_risk_level", "suggest_mitigations"],
        )

        # Question Template
        templates[InsightType.QUESTION] = InsightTemplate(
            insight_type=InsightType.QUESTION,
            prompt_template="""
            Analyze this question from the meeting discussion:

            Context: {context}
            Speaker: {speaker}
            Question: {trigger_text}

            Provide:
            1. Summary of the question asked
            2. Why this question is important
            3. What it reveals about the discussion
            4. Suggested approach to finding an answer
            5. Who might best answer this question

            Focus on the strategic importance of the question.
            """,
            context_requirements=["trigger_text", "speaker"],
            min_confidence=0.4,
            max_tokens=300,
            temperature=0.5,
            model_preference="claude-3-5-sonnet-20241022",
            post_processing_rules=["categorize_question_type", "identify_experts"],
        )

        # Summary Template
        templates[InsightType.SUMMARY] = InsightTemplate(
            insight_type=InsightType.SUMMARY,
            prompt_template="""
            Create a concise summary of this meeting discussion:

            Context: {context}
            Topic: {topic_context}
            Discussion: {full_context}

            Provide:
            1. Main points discussed
            2. Key participants and their contributions
            3. Important decisions or outcomes
            4. Outstanding questions or issues
            5. Next steps identified

            Keep it concise but comprehensive.
            """,
            context_requirements=["full_context", "topic_context"],
            min_confidence=0.3,
            max_tokens=500,
            temperature=0.3,
            model_preference="claude-3-5-sonnet-20241022",
            post_processing_rules=["extract_key_points", "identify_participants"],
        )

        # Topic Transition Template
        templates[InsightType.TOPIC_TRANSITION] = InsightTemplate(
            insight_type=InsightType.TOPIC_TRANSITION,
            prompt_template="""
            Analyze this topic transition in the meeting:

            Previous Topic: {previous_topic}
            New Topic: {current_topic}
            Transition Context: {trigger_text}
            Speaker: {speaker}

            Describe:
            1. How the transition occurred
            2. Connection between topics (if any)
            3. Why the transition happened
            4. Impact on meeting flow
            5. Key takeaways from the previous topic

            Focus on understanding the meeting dynamics.
            """,
            context_requirements=["trigger_text", "topic_context"],
            min_confidence=0.4,
            max_tokens=350,
            temperature=0.4,
            model_preference="claude-3-5-sonnet-20241022",
            post_processing_rules=[
                "map_topic_relationships",
                "assess_transition_quality",
            ],
        )

        # Business Insight Template
        templates[InsightType.BUSINESS_INSIGHT] = InsightTemplate(
            insight_type=InsightType.BUSINESS_INSIGHT,
            prompt_template="""
            Extract business insights from this discussion:

            Context: {context}
            Discussion: {trigger_text}
            Topic: {topic_context}

            Analyze:
            1. Business implications discussed
            2. Impact on objectives or strategy
            3. Opportunities identified
            4. Risks or challenges mentioned
            5. Strategic recommendations

            Focus on actionable business intelligence.
            """,
            context_requirements=["trigger_text", "context"],
            min_confidence=0.6,
            max_tokens=400,
            temperature=0.3,
            model_preference="claude-3-5-sonnet-20241022",
            post_processing_rules=["quantify_impact", "prioritize_recommendations"],
        )

        return templates

    async def create_session(
        self, meeting_id: str, session_config: Dict[str, Any] = None
    ) -> str:
        """Create a new insight generation session"""
        session_id = f"insight_session_{uuid.uuid4().hex}"

        config = session_config or {}

        session_data = {
            "session_id": session_id,
            "meeting_id": meeting_id,
            "created_at": datetime.now(),
            "config": {
                "enabled_insight_types": config.get(
                    "enabled_insight_types", list(InsightType)
                ),
                "confidence_threshold": config.get(
                    "confidence_threshold", self.confidence_threshold
                ),
                "max_insights_per_minute": config.get("max_insights_per_minute", 3),
                "ai_model_preference": config.get(
                    "ai_model_preference", "claude-3-5-sonnet-20241022"
                ),
                "quality_control_enabled": config.get("quality_control_enabled", True),
                "auto_review_enabled": config.get("auto_review_enabled", True),
            },
            "generated_insights": [],
            "pending_requests": [],
            "processing_queue": asyncio.Queue(),
            "context_cache": {},
            "processing_stats": {
                "total_requests": 0,
                "successful_generations": 0,
                "failed_generations": 0,
                "average_generation_time": 0.0,
                "quality_scores": [],
            },
        }

        self.active_sessions[session_id] = session_data
        self.insight_history[session_id] = []

        # Start processing task
        asyncio.create_task(self._process_insight_queue(session_id))

        self.logger.info(
            f"Created insight generation session {session_id} for meeting {meeting_id}"
        )

        return session_id

    async def generate_insight(
        self, session_id: str, request: InsightGenerationRequest
    ) -> Optional[GeneratedInsight]:
        """
        Generate an insight from a trigger

        Args:
            session_id: Active insight session ID
            request: Insight generation request with trigger and context

        Returns:
            Generated insight or None if generation failed
        """
        if session_id not in self.active_sessions:
            raise ValueError(f"Session {session_id} not found")

        session = self.active_sessions[session_id]

        # Add to processing queue
        await session["processing_queue"].put(request)

        return None  # Actual processing happens asynchronously

    async def _process_insight_queue(self, session_id: str):
        """Process insight generation requests asynchronously"""
        session = self.active_sessions[session_id]
        queue = session["processing_queue"]

        while session_id in self.active_sessions:
            try:
                # Wait for request with timeout
                request = await asyncio.wait_for(queue.get(), timeout=1.0)

                # Process the request
                insight = await self._generate_insight_internal(session_id, request)

                if insight:
                    session["generated_insights"].append(insight)
                    self.insight_history[session_id].append(insight)

                    # Update statistics
                    session["processing_stats"]["successful_generations"] += 1
                else:
                    session["processing_stats"]["failed_generations"] += 1

                session["processing_stats"]["total_requests"] += 1

            except asyncio.TimeoutError:
                # No requests in queue, continue waiting
                continue
            except Exception as e:
                self.logger.error(f"Error processing insight request: {e}")
                session["processing_stats"]["failed_generations"] += 1

    async def _generate_insight_internal(
        self, session_id: str, request: InsightGenerationRequest
    ) -> Optional[GeneratedInsight]:
        """Internal method to generate a single insight"""
        start_time = time.time()

        try:
            session = self.active_sessions[session_id]
            trigger = request.trigger

            # Determine insight type
            insight_type = request.preferred_type or self._determine_insight_type(
                trigger
            )

            if insight_type not in self.insight_templates:
                self.logger.warning(
                    f"No template found for insight type: {insight_type}"
                )
                return None

            template = self.insight_templates[insight_type]

            # Check if we should generate this insight
            if not self._should_generate_insight(session, trigger, insight_type):
                return None

            # Prepare context for generation
            context = self._prepare_generation_context(session, request)

            # Generate content using AI
            content = await self._generate_content(template, context)

            if not content:
                return None

            # Post-process content
            processed_content = await self._post_process_content(
                content, template, context
            )

            # Calculate confidence
            confidence = self._calculate_insight_confidence(trigger, content, context)

            # Create insight object
            insight = GeneratedInsight(
                id=f"insight_{uuid.uuid4().hex[:8]}",
                insight_type=insight_type,
                priority=self._determine_priority(trigger, insight_type, confidence),
                status=InsightStatus.COMPLETED,
                title=self._generate_title(processed_content, insight_type),
                content=processed_content["content"],
                summary=processed_content["summary"],
                confidence=confidence,
                timestamp=time.time(),
                meeting_timestamp=trigger.timestamp,
                speaker=trigger.speaker,
                topic_context=trigger.topic_context,
                related_triggers=[trigger.id],
                context_window=trigger.context_window,
                keywords=processed_content.get("keywords", []),
                entities=processed_content.get("entities", []),
                action_items=processed_content.get("action_items", []),
                deadlines=processed_content.get("deadlines", []),
                stakeholders=processed_content.get("stakeholders", []),
                metadata={
                    "trigger_type": trigger.trigger_type.value,
                    "trigger_confidence": trigger.confidence,
                    "generation_template": template.insight_type.value,
                    "context_size": len(str(context)),
                },
                ai_model_used=template.model_preference,
                generation_time_ms=(time.time() - start_time) * 1000,
                review_notes=None,
                user_feedback=None,
            )

            # Quality control
            if session["config"]["quality_control_enabled"]:
                quality_passed = await self._quality_control_check(insight)
                if not quality_passed:
                    insight.status = InsightStatus.FAILED
                    return None

            self.logger.info(
                f"Generated insight {insight.id} of type {insight_type.value}"
            )

            return insight

        except Exception as e:
            self.logger.error(f"Failed to generate insight: {e}")
            return None

    def _determine_insight_type(self, trigger: DetectedTrigger) -> InsightType:
        """Determine the best insight type for a trigger"""
        # Use the trigger's suggestion if available
        if trigger.insight_type_suggestion:
            suggestion_mapping = {
                "action_item": InsightType.ACTION_ITEM,
                "decision": InsightType.DECISION,
                "concern": InsightType.CONCERN,
                "question": InsightType.QUESTION,
                "topic_summary": InsightType.TOPIC_TRANSITION,
                "conflict_resolution": InsightType.CONFLICT_RESOLUTION,
                "consensus": InsightType.CONSENSUS,
                "technical_note": InsightType.TECHNICAL_NOTE,
                "business_insight": InsightType.BUSINESS_INSIGHT,
                "deadline": InsightType.DEADLINE,
            }

            mapped_type = suggestion_mapping.get(trigger.insight_type_suggestion)
            if mapped_type:
                return mapped_type

        # Fallback based on trigger type
        trigger_to_insight_mapping = {
            TriggerType.ACTION_ITEM: InsightType.ACTION_ITEM,
            TriggerType.DECISION_POINT: InsightType.DECISION,
            TriggerType.CONCERN_RAISED: InsightType.CONCERN,
            TriggerType.QUESTION_ASKED: InsightType.QUESTION,
            TriggerType.TOPIC_SHIFT: InsightType.TOPIC_TRANSITION,
            TriggerType.DISAGREEMENT: InsightType.CONFLICT_RESOLUTION,
            TriggerType.AGREEMENT: InsightType.CONSENSUS,
            TriggerType.TECHNICAL_ISSUE: InsightType.TECHNICAL_NOTE,
            TriggerType.BUSINESS_IMPACT: InsightType.BUSINESS_INSIGHT,
            TriggerType.DEADLINE_MENTIONED: InsightType.DEADLINE,
        }

        return trigger_to_insight_mapping.get(trigger.trigger_type, InsightType.SUMMARY)

    def _should_generate_insight(
        self, session: Dict, trigger: DetectedTrigger, insight_type: InsightType
    ) -> bool:
        """Determine if an insight should be generated"""
        # Check confidence threshold
        if trigger.confidence < session["config"]["confidence_threshold"]:
            return False

        # Check rate limiting
        recent_insights = [
            i
            for i in session["generated_insights"]
            if time.time() - i.timestamp < 60  # Last minute
        ]

        if len(recent_insights) >= session["config"]["max_insights_per_minute"]:
            return False

        # Check for duplicate insights
        similar_insights = [
            i
            for i in recent_insights
            if (
                i.insight_type == insight_type
                and i.speaker == trigger.speaker
                and abs(i.meeting_timestamp - trigger.timestamp) < 30
            )
        ]

        if similar_insights:
            return False

        # Check if insight type is enabled
        if insight_type not in session["config"]["enabled_insight_types"]:
            return False

        return True

    def _prepare_generation_context(
        self, session: Dict, request: InsightGenerationRequest
    ) -> Dict[str, Any]:
        """Prepare context for AI generation"""
        trigger = request.trigger

        context = {
            "trigger_text": trigger.trigger_text,
            "speaker": trigger.speaker or "Unknown Speaker",
            "topic_context": trigger.topic_context or "General Discussion",
            "context": " ".join(trigger.context_window),
            "full_context": " ".join(trigger.context_window),
            "meeting_phase": self._determine_meeting_phase(trigger.timestamp),
            "trigger_confidence": trigger.confidence,
            "matched_patterns": ", ".join(trigger.matched_patterns),
        }

        # Add additional context from request
        if request.context:
            context.update(request.context)

        # Add previous topic context if available
        if "previous_topic" in request.context:
            context["previous_topic"] = request.context["previous_topic"]

        if "current_topic" in request.context:
            context["current_topic"] = request.context["current_topic"]

        return context

    def _determine_meeting_phase(self, timestamp: float) -> str:
        """Determine what phase of the meeting this is"""
        # This is a simplified implementation
        # In practice, you'd track meeting start time
        return "middle"  # Could be "beginning", "middle", "end"

    async def _generate_content(
        self, template: InsightTemplate, context: Dict[str, Any]
    ) -> Optional[str]:
        """Generate content using AI orchestration"""
        if not self.orchestrator:
            self.logger.error("No orchestrator available for content generation")
            return None

        try:
            # Format the prompt with context
            prompt = template.prompt_template.format(**context)

            # Create orchestration request
            task_request = TaskRequest(
                id=f"insight_gen_{uuid.uuid4().hex[:8]}",
                task_type="insight_generation",
                prompt=prompt,
                context=context,
                complexity=TaskComplexity.MODERATE,
                routing_strategy=RoutingStrategy.COMPLEXITY_BASED,
                max_tokens=template.max_tokens,
                temperature=template.temperature,
                cache_enabled=True,
            )

            # Execute with orchestrator
            result = await self.orchestrator.orchestrate(task_request)

            if result.error:
                self.logger.error(f"AI generation failed: {result.error}")
                return None

            return result.response

        except Exception as e:
            self.logger.error(f"Content generation failed: {e}")
            return None

    async def _post_process_content(
        self, content: str, template: InsightTemplate, context: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Post-process generated content"""
        processed = {
            "content": content.strip(),
            "summary": self._generate_summary(content),
            "keywords": self._extract_keywords(content),
            "entities": self._extract_entities(content),
            "action_items": [],
            "deadlines": [],
            "stakeholders": [],
        }

        # Apply post-processing rules
        for rule in template.post_processing_rules:
            if rule == "extract_deadlines":
                processed["deadlines"] = self._extract_deadlines(content)
            elif rule == "identify_assignees":
                processed["stakeholders"] = self._identify_assignees(content)
            elif rule == "extract_key_points":
                processed["keywords"].extend(self._extract_key_points(content))
            elif rule == "assess_risk_level":
                processed["risk_level"] = self._assess_risk_level(content)

        return processed

    def _generate_summary(self, content: str) -> str:
        """Generate a brief summary of the content"""
        sentences = content.split(".")
        if len(sentences) <= 2:
            return content

        # Take first sentence or first two sentences if very short
        summary = sentences[0].strip()
        if len(summary) < 50 and len(sentences) > 1:
            summary += ". " + sentences[1].strip()

        return summary + "." if not summary.endswith(".") else summary

    def _extract_keywords(self, content: str) -> List[str]:
        """Extract keywords from content"""
        # Simple keyword extraction
        words = re.findall(r"\b[a-zA-Z]{4,}\b", content.lower())

        # Filter common words
        common_words = {
            "this",
            "that",
            "with",
            "have",
            "will",
            "been",
            "from",
            "they",
            "know",
            "want",
            "been",
            "good",
            "much",
            "some",
            "time",
            "very",
            "when",
            "come",
            "here",
            "just",
            "like",
            "long",
            "make",
            "many",
            "over",
            "such",
            "take",
            "than",
            "them",
            "well",
            "were",
        }

        keywords = [word for word in words if word not in common_words]

        # Return most frequent keywords
        keyword_counts = Counter(keywords)
        return [word for word, count in keyword_counts.most_common(10)]

    def _extract_entities(self, content: str) -> List[str]:
        """Extract named entities from content"""
        # Simple entity extraction (proper nouns)
        entities = re.findall(r"\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b", content)
        return list(set(entities))[:10]

    def _extract_deadlines(self, content: str) -> List[str]:
        """Extract deadline mentions from content"""
        deadline_patterns = [
            r"\bby\s+(\w+day|\w+\s+\d+|\d+/\d+)",
            r"\bdue\s+(\w+day|\w+\s+\d+|\d+/\d+)",
            r"\bdeadline[:\s]+(\w+day|\w+\s+\d+|\d+/\d+)",
            r"\b(next\s+week|end\s+of\s+week|end\s+of\s+month)",
            r"\b(asap|immediately|urgent)",
        ]

        deadlines = []
        for pattern in deadline_patterns:
            matches = re.findall(pattern, content, re.IGNORECASE)
            deadlines.extend(matches)

        return list(set(deadlines))

    def _identify_assignees(self, content: str) -> List[str]:
        """Identify people assigned to tasks"""
        assignee_patterns = [
            r"\bassign(?:ed)?\s+to\s+(\w+)",
            r"\b(\w+)\s+will\s+(?:handle|take|do|work)",
            r"\b(\w+)\s+(?:is|are)\s+responsible",
            r"\b(\w+)\s+should\s+(?:handle|take|do)",
        ]

        assignees = []
        for pattern in assignee_patterns:
            matches = re.findall(pattern, content, re.IGNORECASE)
            assignees.extend(matches)

        return list(set(assignees))

    def _extract_key_points(self, content: str) -> List[str]:
        """Extract key points from content"""
        # Look for numbered points or bullet points
        points = []

        # Numbered points
        numbered_points = re.findall(r"\d+\.\s+([^.]+)", content)
        points.extend(numbered_points)

        # Bullet points
        bullet_points = re.findall(r"[•\-\*]\s+([^.]+)", content)
        points.extend(bullet_points)

        return [point.strip() for point in points if len(point.strip()) > 10]

    def _assess_risk_level(self, content: str) -> str:
        """Assess risk level from content"""
        high_risk_words = ["critical", "urgent", "blocker", "emergency", "crisis"]
        medium_risk_words = ["concern", "issue", "problem", "risk", "challenge"]

        content_lower = content.lower()

        if any(word in content_lower for word in high_risk_words):
            return "high"
        elif any(word in content_lower for word in medium_risk_words):
            return "medium"
        else:
            return "low"

    def _calculate_insight_confidence(
        self, trigger: DetectedTrigger, content: str, context: Dict[str, Any]
    ) -> ConfidenceBreakdown:
        """Calculate comprehensive confidence score for the insight"""

        confidence_sources = {}

        # Trigger confidence (30% weight)
        confidence_sources[ConfidenceSource.TRIGGER_CONFIDENCE] = (
            trigger.confidence * 0.3
        )

        # AI confidence based on content quality (25% weight)
        ai_confidence = self._assess_ai_content_quality(content)
        confidence_sources[ConfidenceSource.AI_CONFIDENCE] = ai_confidence * 0.25

        # Context relevance (20% weight)
        context_relevance = self._assess_context_relevance(trigger, context)
        confidence_sources[ConfidenceSource.CONTEXT_RELEVANCE] = context_relevance * 0.2

        # Pattern match strength (15% weight)
        pattern_strength = len(trigger.matched_patterns) / max(
            3, len(trigger.matched_patterns)
        )
        confidence_sources[ConfidenceSource.PATTERN_MATCH] = (
            min(1.0, pattern_strength) * 0.15
        )

        # Speaker authority (10% weight) - simplified
        speaker_authority = 0.8 if trigger.speaker else 0.5
        confidence_sources[ConfidenceSource.SPEAKER_AUTHORITY] = speaker_authority * 0.1

        # Calculate overall confidence
        overall_confidence = sum(confidence_sources.values())

        # Determine confidence level
        if overall_confidence >= 0.8:
            level = "very_high"
        elif overall_confidence >= 0.6:
            level = "high"
        elif overall_confidence >= 0.4:
            level = "medium"
        elif overall_confidence >= 0.2:
            level = "low"
        else:
            level = "very_low"

        # Contributing factors
        contributing_factors = []
        if trigger.confidence > 0.7:
            contributing_factors.append("Strong trigger detection")
        if len(content) > 100:
            contributing_factors.append("Detailed content generated")
        if len(trigger.matched_patterns) > 1:
            contributing_factors.append("Multiple pattern matches")

        # Uncertainty factors
        uncertainty_factors = []
        if trigger.confidence < 0.5:
            uncertainty_factors.append("Low trigger confidence")
        if len(content) < 50:
            uncertainty_factors.append("Brief content")
        if not trigger.speaker:
            uncertainty_factors.append("Unknown speaker")

        return ConfidenceBreakdown(
            overall_confidence=overall_confidence,
            confidence_sources=confidence_sources,
            contributing_factors=contributing_factors,
            uncertainty_factors=uncertainty_factors,
            confidence_level=level,
        )

    def _assess_ai_content_quality(self, content: str) -> float:
        """Assess the quality of AI-generated content"""
        quality_score = 0.0

        # Length check
        if self.min_content_length <= len(content) <= self.max_content_length:
            quality_score += 0.3

        # Structure check (sentences, punctuation)
        sentences = content.split(".")
        if len(sentences) >= 2:
            quality_score += 0.2

        # Coherence check (simple word repetition analysis)
        words = content.lower().split()
        unique_words = len(set(words))
        if len(words) > 0 and unique_words / len(words) > 0.5:
            quality_score += 0.3

        # Specific content check
        if any(
            word in content.lower()
            for word in ["action", "decision", "next", "steps", "important"]
        ):
            quality_score += 0.2

        return min(1.0, quality_score)

    def _assess_context_relevance(
        self, trigger: DetectedTrigger, context: Dict[str, Any]
    ) -> float:
        """Assess how relevant the context is to the insight"""
        relevance = 0.5  # Base relevance

        # Topic context available
        if trigger.topic_context:
            relevance += 0.2

        # Context window has sufficient content
        if len(trigger.context_window) >= 3:
            relevance += 0.2

        # Speaker information available
        if trigger.speaker:
            relevance += 0.1

        return min(1.0, relevance)

    def _determine_priority(
        self,
        trigger: DetectedTrigger,
        insight_type: InsightType,
        confidence: ConfidenceBreakdown,
    ) -> InsightPriority:
        """Determine the priority of the insight"""

        # High priority insight types
        if insight_type in [
            InsightType.DECISION,
            InsightType.ACTION_ITEM,
            InsightType.CONCERN,
        ]:
            if confidence.overall_confidence > 0.7:
                return InsightPriority.CRITICAL
            elif confidence.overall_confidence > 0.5:
                return InsightPriority.HIGH

        # Medium priority types
        if insight_type in [
            InsightType.QUESTION,
            InsightType.DEADLINE,
            InsightType.BUSINESS_INSIGHT,
        ]:
            if confidence.overall_confidence > 0.6:
                return InsightPriority.HIGH
            elif confidence.overall_confidence > 0.4:
                return InsightPriority.MEDIUM

        # Default based on confidence
        if confidence.overall_confidence > 0.8:
            return InsightPriority.HIGH
        elif confidence.overall_confidence > 0.5:
            return InsightPriority.MEDIUM
        else:
            return InsightPriority.LOW

    def _generate_title(
        self, processed_content: Dict[str, Any], insight_type: InsightType
    ) -> str:
        """Generate a title for the insight"""
        content = processed_content["content"]

        # Extract first meaningful sentence
        sentences = content.split(".")
        if sentences:
            title = sentences[0].strip()

            # Limit length
            if len(title) > 80:
                title = title[:77] + "..."

            return title

        # Fallback based on insight type
        fallback_titles = {
            InsightType.ACTION_ITEM: "Action Item Identified",
            InsightType.DECISION: "Decision Point",
            InsightType.CONCERN: "Concern Raised",
            InsightType.QUESTION: "Question Asked",
            InsightType.SUMMARY: "Discussion Summary",
            InsightType.TOPIC_TRANSITION: "Topic Change",
            InsightType.BUSINESS_INSIGHT: "Business Insight",
        }

        return fallback_titles.get(insight_type, "Meeting Insight")

    async def _quality_control_check(self, insight: GeneratedInsight) -> bool:
        """Perform quality control checks on generated insight"""

        # Check minimum content length
        if len(insight.content) < self.min_content_length:
            self.logger.warning(f"Insight {insight.id} failed length check")
            return False

        # Check confidence threshold
        if insight.confidence.overall_confidence < self.confidence_threshold:
            self.logger.warning(f"Insight {insight.id} failed confidence check")
            return False

        # Check for generic/meaningless content
        generic_phrases = [
            "this is important",
            "we should discuss",
            "needs attention",
            "requires follow-up",
        ]

        content_lower = insight.content.lower()
        if (
            any(phrase in content_lower for phrase in generic_phrases)
            and len(insight.content) < 100
        ):
            self.logger.warning(f"Insight {insight.id} appears generic")
            return False

        return True

    async def get_session_insights(
        self, session_id: str, limit: int = 50
    ) -> List[GeneratedInsight]:
        """Get insights for a session"""
        if session_id not in self.insight_history:
            return []

        insights = self.insight_history[session_id]

        # Sort by timestamp (most recent first)
        insights.sort(key=lambda i: i.timestamp, reverse=True)

        return insights[:limit]

    async def close_session(self, session_id: str) -> Dict[str, Any]:
        """Close an insight generation session and return statistics"""
        if session_id not in self.active_sessions:
            return {}

        session = self.active_sessions[session_id]
        stats = session["processing_stats"].copy()

        # Calculate final statistics
        insights = self.insight_history.get(session_id, [])
        stats["total_insights_generated"] = len(insights)
        stats["insights_by_type"] = Counter(i.insight_type.value for i in insights)
        stats["insights_by_priority"] = Counter(i.priority.value for i in insights)
        stats["average_confidence"] = (
            np.mean([i.confidence.overall_confidence for i in insights])
            if insights
            else 0.0
        )

        # Clean up session
        del self.active_sessions[session_id]

        self.logger.info(f"Closed insight generation session {session_id}")

        return stats


# Global insight generation service instance
insight_generation_service = InsightGenerationService()


async def get_insight_generation_service() -> InsightGenerationService:
    """Get the global insight generation service instance"""
    return insight_generation_service


async def initialize_insight_generation():
    """Initialize the insight generation service with orchestrator"""
    from ai_orchestration import get_orchestrator

    orchestrator = await get_orchestrator()
    insight_generation_service.orchestrator = orchestrator
    return insight_generation_service
