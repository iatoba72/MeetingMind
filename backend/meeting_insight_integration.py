# Meeting Insight Integration Service
# Integrates automatic insight generation with real-time meeting transcription

import asyncio
import json
import time
import uuid
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any, Callable
from dataclasses import dataclass, asdict
from enum import Enum
import logging
from collections import deque, defaultdict

from topic_detection_service import (
    TopicDetectionService, get_topic_detection_service,
    DetectedTopic, TopicTransition
)
from insight_trigger_engine import (
    InsightTriggerEngine, get_insight_trigger_engine,
    DetectedTrigger, TriggerType
)
from insight_generation_service import (
    InsightGenerationService, get_insight_generation_service,
    InsightGenerationRequest, GeneratedInsight
)
from insight_scheduler import (
    InsightScheduler, get_insight_scheduler,
    SchedulingContext, SchedulingStrategy
)
from insight_studio_service import (
    InsightStudioService, get_insight_studio_service,
    CustomRule
)

class MeetingPhase(Enum):
    """Phases of a meeting"""
    STARTING = "starting"
    DISCUSSION = "discussion"
    DECISION_MAKING = "decision_making"
    WRAP_UP = "wrap_up"
    CONCLUDED = "concluded"

class IntegrationMode(Enum):
    """Integration modes for different use cases"""
    REAL_TIME = "real_time"          # Process everything in real-time
    BATCH_OPTIMIZED = "batch_optimized"  # Optimize for batch processing
    HYBRID = "hybrid"                # Mix of real-time and batch
    ANALYSIS_ONLY = "analysis_only"  # Post-meeting analysis only

@dataclass
class MeetingInsightSession:
    """Complete session for meeting insight generation"""
    session_id: str
    meeting_id: str
    integration_mode: IntegrationMode
    created_at: datetime
    
    # Service session IDs
    topic_session_id: str
    trigger_session_id: str
    insight_session_id: str
    scheduler_session_id: str
    studio_session_id: Optional[str]
    
    # Configuration
    config: Dict[str, Any]
    
    # State tracking
    current_phase: MeetingPhase
    speaker_timeline: List[Tuple[float, str]]
    transcript_segments: deque
    
    # Generated content
    topics: List[DetectedTopic]
    triggers: List[DetectedTrigger]
    insights: List[GeneratedInsight]
    
    # Performance metrics
    processing_stats: Dict[str, Any]

@dataclass
class TranscriptSegment:
    """A segment of meeting transcript"""
    id: str
    text: str
    timestamp: float
    speaker: Optional[str]
    confidence: float
    is_final: bool
    metadata: Dict[str, Any]

@dataclass
class MeetingContext:
    """Current context of the meeting"""
    phase: MeetingPhase
    duration: float
    speaker_count: int
    active_speaker: Optional[str]
    current_topic: Optional[DetectedTopic]
    recent_triggers: List[DetectedTrigger]
    engagement_level: float
    topic_stability: float

class MeetingInsightIntegration:
    """
    Integration service that orchestrates all insight generation components
    for real-time meeting analysis
    
    Features:
    - Real-time transcript processing
    - Coordinated topic detection and trigger analysis
    - Intelligent insight scheduling
    - Meeting phase detection
    - Performance optimization
    - Custom rule integration
    """
    
    def __init__(self):
        """Initialize the meeting insight integration service"""
        self.active_sessions: Dict[str, MeetingInsightSession] = {}
        
        # Service instances (will be injected)
        self.topic_service: Optional[TopicDetectionService] = None
        self.trigger_engine: Optional[InsightTriggerEngine] = None
        self.insight_service: Optional[InsightGenerationService] = None
        self.scheduler: Optional[InsightScheduler] = None
        self.studio_service: Optional[InsightStudioService] = None
        
        # Event handlers
        self.event_handlers: Dict[str, List[Callable]] = defaultdict(list)
        
        # Performance tracking
        self.performance_metrics: Dict[str, Dict] = defaultdict(dict)
        
        self.logger = logging.getLogger(__name__)
    
    async def initialize(self):
        """Initialize all dependent services"""
        self.topic_service = await get_topic_detection_service()
        self.trigger_engine = await get_insight_trigger_engine()
        self.insight_service = await get_insight_generation_service()
        self.scheduler = await get_insight_scheduler()
        self.studio_service = await get_insight_studio_service()
        
        # Start background services
        await self.scheduler.start()
        
        self.logger.info("Meeting insight integration initialized")
    
    async def create_meeting_session(self, 
                                   meeting_id: str,
                                   user_id: str,
                                   session_config: Dict[str, Any] = None) -> str:
        """Create a new integrated meeting insight session"""
        
        session_id = f"meeting_insight_{uuid.uuid4().hex}"
        config = session_config or {}
        
        # Determine integration mode
        integration_mode = IntegrationMode(config.get('integration_mode', IntegrationMode.REAL_TIME.value))
        
        # Create sessions for all services
        topic_session_id = await self.topic_service.create_session(
            meeting_id, 
            config.get('topic_detection', {})
        )
        
        trigger_session_id = await self.trigger_engine.create_session(
            meeting_id,
            config.get('trigger_detection', {})
        )
        
        insight_session_id = await self.insight_service.create_session(
            meeting_id,
            config.get('insight_generation', {})
        )
        
        scheduler_session_id = await self.scheduler.create_session(
            meeting_id,
            config.get('scheduling', {})
        )
        
        # Optional studio session for custom rules
        studio_session_id = None
        if config.get('enable_custom_rules', False):
            studio_session_id = await self.studio_service.create_session(
                user_id,
                config.get('studio', {})
            )
        
        # Create integrated session
        session = MeetingInsightSession(
            session_id=session_id,
            meeting_id=meeting_id,
            integration_mode=integration_mode,
            created_at=datetime.now(),
            
            # Service sessions
            topic_session_id=topic_session_id,
            trigger_session_id=trigger_session_id,
            insight_session_id=insight_session_id,
            scheduler_session_id=scheduler_session_id,
            studio_session_id=studio_session_id,
            
            # Configuration
            config={
                'integration_mode': integration_mode.value,
                'real_time_processing': config.get('real_time_processing', True),
                'batch_size': config.get('batch_size', 5),
                'insight_generation_enabled': config.get('insight_generation_enabled', True),
                'custom_rules_enabled': config.get('enable_custom_rules', False),
                'performance_monitoring': config.get('performance_monitoring', True),
                'quality_thresholds': config.get('quality_thresholds', {
                    'min_confidence': 0.6,
                    'max_insights_per_minute': 3
                })
            },
            
            # Initial state
            current_phase=MeetingPhase.STARTING,
            speaker_timeline=[],
            transcript_segments=deque(maxlen=100),
            
            # Content storage
            topics=[],
            triggers=[],
            insights=[],
            
            # Performance tracking
            processing_stats={
                'segments_processed': 0,
                'topics_detected': 0,
                'triggers_detected': 0,
                'insights_generated': 0,
                'total_processing_time': 0.0,
                'average_latency': 0.0
            }
        )
        
        self.active_sessions[session_id] = session
        
        # Emit session created event
        await self._emit_event('session_created', {
            'session_id': session_id,
            'meeting_id': meeting_id,
            'integration_mode': integration_mode.value
        })
        
        self.logger.info(f"Created meeting insight session {session_id} for meeting {meeting_id}")
        
        return session_id
    
    async def process_transcript_segment(self,
                                       session_id: str,
                                       segment: TranscriptSegment) -> Dict[str, Any]:
        """Process a new transcript segment through the insight pipeline"""
        
        start_time = time.time()
        
        if session_id not in self.active_sessions:
            raise ValueError(f"Session {session_id} not found")
        
        session = self.active_sessions[session_id]
        
        # Add segment to session
        session.transcript_segments.append(segment)
        session.speaker_timeline.append((segment.timestamp, segment.speaker))
        
        # Update meeting phase
        await self._update_meeting_phase(session, segment)
        
        # Process through pipeline
        processing_results = await self._process_segment_pipeline(session, segment)
        
        # Update session state
        session.topics.extend(processing_results.get('new_topics', []))
        session.triggers.extend(processing_results.get('new_triggers', []))
        session.insights.extend(processing_results.get('new_insights', []))
        
        # Update performance metrics
        processing_time = (time.time() - start_time) * 1000
        session.processing_stats['segments_processed'] += 1
        session.processing_stats['total_processing_time'] += processing_time
        session.processing_stats['average_latency'] = (
            session.processing_stats['total_processing_time'] / 
            session.processing_stats['segments_processed']
        )
        
        # Emit processing event
        await self._emit_event('segment_processed', {
            'session_id': session_id,
            'segment_id': segment.id,
            'processing_time_ms': processing_time,
            'results': processing_results
        })
        
        return {
            'session_id': session_id,
            'segment_id': segment.id,
            'processing_time_ms': processing_time,
            'meeting_phase': session.current_phase.value,
            'topics_detected': len(processing_results.get('new_topics', [])),
            'triggers_detected': len(processing_results.get('new_triggers', [])),
            'insights_generated': len(processing_results.get('new_insights', [])),
            'current_context': self._get_meeting_context(session)
        }
    
    async def _process_segment_pipeline(self, 
                                      session: MeetingInsightSession, 
                                      segment: TranscriptSegment) -> Dict[str, Any]:
        """Process segment through the complete insight pipeline"""
        
        results = {
            'new_topics': [],
            'new_triggers': [],
            'new_insights': [],
            'topic_changes': [],
            'scheduling_actions': []
        }
        
        # Step 1: Topic Detection
        topic_analysis = await self.topic_service.process_text_segment(
            session.topic_session_id,
            segment.text,
            segment.timestamp,
            segment.speaker,
            segment.metadata
        )
        
        if topic_analysis.get('topic_change', False):
            results['topic_changes'].append(topic_analysis)
            session.processing_stats['topics_detected'] += 1
        
        # Step 2: Trigger Detection
        detected_triggers = await self.trigger_engine.process_segment(
            session.trigger_session_id,
            segment.text,
            segment.timestamp,
            segment.speaker,
            topic_analysis.get('current_topic'),
            segment.metadata
        )
        
        results['new_triggers'] = detected_triggers
        session.processing_stats['triggers_detected'] += len(detected_triggers)
        
        # Step 3: Process Custom Rules (if enabled)
        if session.config['custom_rules_enabled'] and session.studio_session_id:
            custom_triggers = await self._process_custom_rules(
                session, segment, topic_analysis
            )
            results['new_triggers'].extend(custom_triggers)
        
        # Step 4: Schedule Insight Generation
        if session.config['insight_generation_enabled']:
            scheduling_context = self._create_scheduling_context(session, segment)
            
            for trigger in detected_triggers:
                if trigger.should_generate_insight:
                    insight_request = InsightGenerationRequest(
                        trigger=trigger,
                        context={
                            'meeting_context': scheduling_context,
                            'topic_context': topic_analysis.get('current_topic'),
                            'speaker_context': self._get_speaker_context(session, segment.speaker)
                        },
                        preferred_type=None,  # Let system decide
                        custom_template=None,
                        urgency_override=None
                    )
                    
                    task_id = await self.scheduler.schedule_insight(
                        session.scheduler_session_id,
                        insight_request,
                        scheduling_context
                    )
                    
                    results['scheduling_actions'].append({
                        'action': 'scheduled_insight',
                        'task_id': task_id,
                        'trigger_id': trigger.id
                    })
        
        # Step 5: Real-time Insight Generation (if configured)
        if (session.integration_mode == IntegrationMode.REAL_TIME and 
            session.config['real_time_processing']):
            
            immediate_insights = await self._generate_immediate_insights(
                session, detected_triggers, topic_analysis
            )
            results['new_insights'] = immediate_insights
            session.processing_stats['insights_generated'] += len(immediate_insights)
        
        return results
    
    async def _process_custom_rules(self,
                                  session: MeetingInsightSession,
                                  segment: TranscriptSegment,
                                  topic_analysis: Dict[str, Any]) -> List[DetectedTrigger]:
        """Process segment against custom rules from insight studio"""
        
        custom_triggers = []
        
        # This would integrate with the studio service to get user's custom rules
        # For now, return empty list as placeholder
        
        return custom_triggers
    
    def _create_scheduling_context(self, 
                                 session: MeetingInsightSession,
                                 segment: TranscriptSegment) -> SchedulingContext:
        """Create scheduling context from current meeting state"""
        
        # Calculate meeting metrics
        meeting_duration = segment.timestamp
        
        # Estimate meeting intensity based on speaking frequency
        recent_segments = list(session.transcript_segments)[-10:]
        speaking_frequency = len(set(seg.speaker for seg in recent_segments if seg.speaker))
        meeting_intensity = min(1.0, speaking_frequency / 5.0)  # Normalize to 0-1
        
        # Speaker engagement levels
        speaker_engagement = {}
        for speaker_time, speaker in session.speaker_timeline[-20:]:
            if speaker:
                if speaker not in speaker_engagement:
                    speaker_engagement[speaker] = 0
                speaker_engagement[speaker] += 1
        
        # Normalize engagement
        if speaker_engagement:
            max_engagement = max(speaker_engagement.values())
            speaker_engagement = {
                speaker: count / max_engagement 
                for speaker, count in speaker_engagement.items()
            }
        
        # Topic stability (simplified)
        topic_stability = 0.7  # Would be calculated from topic detection results
        
        # Resource availability (simplified)
        resource_availability = {
            'cpu_usage': 0.3,
            'memory_usage': 0.4,
            'api_rate_limits': 0.2,
            'network_bandwidth': 0.1,
            'processing_queue': 0.3
        }
        
        # Recent insight density
        recent_triggers = [t for t in session.triggers if segment.timestamp - t.timestamp < 60]
        recent_insight_density = len(recent_triggers) / 1.0  # per minute
        
        return SchedulingContext(
            meeting_phase=session.current_phase.value,
            meeting_intensity=meeting_intensity,
            speaker_engagement=speaker_engagement,
            topic_stability=topic_stability,
            resource_availability=resource_availability,
            pending_insights_count=0,  # Would get from scheduler
            recent_insight_density=recent_insight_density,
            user_attention_score=0.8,  # Would be calculated from user interactions
            historical_patterns={}
        )
    
    def _get_speaker_context(self, 
                           session: MeetingInsightSession,
                           speaker: Optional[str]) -> Dict[str, Any]:
        """Get context information about a speaker"""
        
        if not speaker:
            return {}
        
        # Count speaker's segments
        speaker_segments = [
            seg for seg in session.transcript_segments 
            if seg.speaker == speaker
        ]
        
        # Calculate speaking time (rough estimate)
        speaking_time = sum(len(seg.text) / 150.0 for seg in speaker_segments)  # Assume 150 WPM
        
        return {
            'speaker': speaker,
            'segment_count': len(speaker_segments),
            'estimated_speaking_time': speaking_time,
            'recent_activity': len([seg for seg in speaker_segments[-10:]]),
            'is_frequent_speaker': len(speaker_segments) > 5
        }
    
    async def _generate_immediate_insights(self,
                                         session: MeetingInsightSession,
                                         triggers: List[DetectedTrigger],
                                         topic_analysis: Dict[str, Any]) -> List[GeneratedInsight]:
        """Generate insights immediately for real-time mode"""
        
        immediate_insights = []
        
        for trigger in triggers:
            if (trigger.should_generate_insight and 
                trigger.priority in ['high', 'critical'] and
                trigger.confidence > 0.7):
                
                insight_request = InsightGenerationRequest(
                    trigger=trigger,
                    context={
                        'topic_context': topic_analysis.get('current_topic'),
                        'urgent': True
                    },
                    preferred_type=None,
                    custom_template=None,
                    urgency_override=None
                )
                
                # Generate insight immediately
                insight = await self.insight_service.generate_insight(
                    session.insight_session_id,
                    insight_request
                )
                
                if insight:
                    immediate_insights.append(insight)
        
        return immediate_insights
    
    async def _update_meeting_phase(self, 
                                  session: MeetingInsightSession,
                                  segment: TranscriptSegment):
        """Update the current meeting phase based on content and duration"""
        
        meeting_duration = segment.timestamp
        
        # Simple phase detection based on duration and content
        if meeting_duration < 300:  # First 5 minutes
            session.current_phase = MeetingPhase.STARTING
        elif meeting_duration > 3600:  # After 1 hour
            session.current_phase = MeetingPhase.WRAP_UP
        else:
            # Analyze content for decision-making keywords
            decision_keywords = ['decide', 'decision', 'vote', 'choose', 'final', 'conclusion']
            if any(keyword in segment.text.lower() for keyword in decision_keywords):
                session.current_phase = MeetingPhase.DECISION_MAKING
            else:
                session.current_phase = MeetingPhase.DISCUSSION
    
    def _get_meeting_context(self, session: MeetingInsightSession) -> MeetingContext:
        """Get current meeting context"""
        
        recent_segments = list(session.transcript_segments)[-10:]
        
        return MeetingContext(
            phase=session.current_phase,
            duration=recent_segments[-1].timestamp if recent_segments else 0.0,
            speaker_count=len(set(seg.speaker for seg in recent_segments if seg.speaker)),
            active_speaker=recent_segments[-1].speaker if recent_segments else None,
            current_topic=session.topics[-1] if session.topics else None,
            recent_triggers=session.triggers[-5:],
            engagement_level=0.8,  # Would be calculated
            topic_stability=0.7     # Would be calculated
        )
    
    async def get_session_insights(self, 
                                 session_id: str,
                                 filters: Dict[str, Any] = None) -> List[GeneratedInsight]:
        """Get insights for a session with optional filtering"""
        
        if session_id not in self.active_sessions:
            raise ValueError(f"Session {session_id} not found")
        
        session = self.active_sessions[session_id]
        insights = session.insights.copy()
        
        # Apply filters
        if filters:
            if 'min_confidence' in filters:
                insights = [i for i in insights if i.confidence.overall_confidence >= filters['min_confidence']]
            
            if 'insight_types' in filters:
                insights = [i for i in insights if i.insight_type.value in filters['insight_types']]
            
            if 'priorities' in filters:
                insights = [i for i in insights if i.priority.value in filters['priorities']]
            
            if 'time_range' in filters:
                start_time, end_time = filters['time_range']
                insights = [i for i in insights if start_time <= i.meeting_timestamp <= end_time]
        
        # Sort by timestamp (most recent first)
        insights.sort(key=lambda i: i.timestamp, reverse=True)
        
        return insights
    
    async def get_session_analytics(self, session_id: str) -> Dict[str, Any]:
        """Get comprehensive analytics for a meeting session"""
        
        if session_id not in self.active_sessions:
            raise ValueError(f"Session {session_id} not found")
        
        session = self.active_sessions[session_id]
        
        # Get analytics from individual services
        topic_analysis = await self.topic_service.get_session_analysis(session.topic_session_id)
        trigger_stats = await self.trigger_engine.get_session_statistics(session.trigger_session_id)
        scheduler_status = await self.scheduler.get_session_status(session.scheduler_session_id)
        
        # Calculate integrated metrics
        insights_by_type = {}
        insights_by_priority = {}
        confidence_distribution = []
        
        for insight in session.insights:
            insight_type = insight.insight_type.value
            insights_by_type[insight_type] = insights_by_type.get(insight_type, 0) + 1
            
            priority = insight.priority.value
            insights_by_priority[priority] = insights_by_priority.get(priority, 0) + 1
            
            confidence_distribution.append(insight.confidence.overall_confidence)
        
        avg_confidence = (
            sum(confidence_distribution) / len(confidence_distribution)
            if confidence_distribution else 0.0
        )
        
        return {
            'session_id': session_id,
            'meeting_id': session.meeting_id,
            'session_duration': (datetime.now() - session.created_at).total_seconds(),
            'current_phase': session.current_phase.value,
            'integration_mode': session.integration_mode.value,
            
            # Processing statistics
            'processing_stats': session.processing_stats,
            
            # Content analysis
            'content_summary': {
                'total_segments': len(session.transcript_segments),
                'unique_speakers': len(set(seg.speaker for seg in session.transcript_segments if seg.speaker)),
                'topics_detected': len(session.topics),
                'triggers_detected': len(session.triggers),
                'insights_generated': len(session.insights)
            },
            
            # Insight analysis
            'insight_analysis': {
                'insights_by_type': insights_by_type,
                'insights_by_priority': insights_by_priority,
                'average_confidence': avg_confidence,
                'confidence_distribution': confidence_distribution
            },
            
            # Service-specific analytics
            'topic_analysis': asdict(topic_analysis) if topic_analysis else {},
            'trigger_statistics': asdict(trigger_stats) if trigger_stats else {},
            'scheduler_status': scheduler_status,
            
            # Performance metrics
            'performance': {
                'average_latency_ms': session.processing_stats['average_latency'],
                'throughput_segments_per_minute': (
                    session.processing_stats['segments_processed'] / 
                    max((datetime.now() - session.created_at).total_seconds() / 60, 1)
                )
            }
        }
    
    async def add_event_handler(self, event_name: str, handler: Callable):
        """Add an event handler for integration events"""
        self.event_handlers[event_name].append(handler)
    
    async def _emit_event(self, event_name: str, event_data: Dict[str, Any]):
        """Emit an event to all registered handlers"""
        handlers = self.event_handlers.get(event_name, [])
        
        for handler in handlers:
            try:
                if asyncio.iscoroutinefunction(handler):
                    await handler(event_data)
                else:
                    handler(event_data)
            except Exception as e:
                self.logger.error(f"Error in event handler for {event_name}: {e}")
    
    async def close_session(self, session_id: str) -> Dict[str, Any]:
        """Close a meeting insight session and return final analytics"""
        
        if session_id not in self.active_sessions:
            return {}
        
        session = self.active_sessions[session_id]
        
        # Get final analytics
        final_analytics = await self.get_session_analytics(session_id)
        
        # Close all service sessions
        await self.topic_service.close_session(session.topic_session_id)
        await self.trigger_engine.close_session(session.trigger_session_id)
        await self.insight_service.close_session(session.insight_session_id)
        await self.scheduler.close_session(session.scheduler_session_id)
        
        if session.studio_session_id:
            await self.studio_service.close_session(session.studio_session_id)
        
        # Emit session closed event
        await self._emit_event('session_closed', {
            'session_id': session_id,
            'final_analytics': final_analytics
        })
        
        # Clean up session
        del self.active_sessions[session_id]
        
        self.logger.info(f"Closed meeting insight session {session_id}")
        
        return final_analytics

# Global integration service instance
meeting_insight_integration = MeetingInsightIntegration()

async def get_meeting_insight_integration() -> MeetingInsightIntegration:
    """Get the global meeting insight integration service instance"""
    return meeting_insight_integration

async def initialize_meeting_insight_integration():
    """Initialize the meeting insight integration service"""
    await meeting_insight_integration.initialize()
    return meeting_insight_integration