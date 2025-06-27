# Insight Trigger Detection Engine
# Advanced pattern recognition for automatic meeting insight generation

import asyncio
import json
import re
import time
import uuid
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any, Tuple, Set, Callable
from dataclasses import dataclass, asdict
from enum import Enum
import logging
from collections import Counter, defaultdict, deque
import statistics

import numpy as np
from scipy.signal import find_peaks
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

from topic_detection_service import (
    TopicDetectionService, get_topic_detection_service,
    TopicChangeType, DetectedTopic, TopicTransition
)

class TriggerType(Enum):
    """Types of insight triggers that can be detected"""
    SPEAKER_CHANGE = "speaker_change"
    TOPIC_SHIFT = "topic_shift"
    QUESTION_ASKED = "question_asked"
    DECISION_POINT = "decision_point"
    ACTION_ITEM = "action_item"
    DISAGREEMENT = "disagreement"
    AGREEMENT = "agreement"
    CONCERN_RAISED = "concern_raised"
    DEADLINE_MENTIONED = "deadline_mentioned"
    PRIORITY_CHANGE = "priority_change"
    STAKEHOLDER_MENTIONED = "stakeholder_mentioned"
    TECHNICAL_ISSUE = "technical_issue"
    BUSINESS_IMPACT = "business_impact"
    FOLLOWUP_NEEDED = "followup_needed"
    MEETING_CONCLUSION = "meeting_conclusion"

class TriggerPriority(Enum):
    """Priority levels for triggers"""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"

class TriggerContext(Enum):
    """Context in which the trigger occurred"""
    DISCUSSION = "discussion"
    PRESENTATION = "presentation"
    BRAINSTORMING = "brainstorming"
    DECISION_MAKING = "decision_making"
    PLANNING = "planning"
    REVIEW = "review"
    PROBLEM_SOLVING = "problem_solving"

@dataclass
class TriggerPattern:
    """Pattern definition for detecting specific triggers"""
    trigger_type: TriggerType
    keywords: List[str]
    phrases: List[str]
    regex_patterns: List[str]
    context_requirements: List[str]
    speaker_requirements: Optional[Dict[str, Any]]
    timing_requirements: Optional[Dict[str, Any]]
    confidence_threshold: float
    priority: TriggerPriority
    enabled: bool = True

@dataclass
class DetectedTrigger:
    """A detected insight trigger with context"""
    id: str
    trigger_type: TriggerType
    priority: TriggerPriority
    confidence: float
    timestamp: float
    speaker: Optional[str]
    trigger_text: str
    context_window: List[str]
    matched_patterns: List[str]
    topic_context: Optional[str]
    previous_triggers: List[str]
    metadata: Dict[str, Any]
    should_generate_insight: bool
    insight_type_suggestion: Optional[str]

@dataclass
class TriggerStatistics:
    """Statistics about trigger detection"""
    total_triggers: int
    triggers_by_type: Dict[str, int]
    triggers_by_speaker: Dict[str, int]
    triggers_by_priority: Dict[str, int]
    average_confidence: float
    trigger_density: float  # Triggers per minute
    most_active_periods: List[Tuple[float, float, int]]  # (start, end, count)
    pattern_effectiveness: Dict[str, float]

class InsightTriggerEngine:
    """
    Advanced pattern recognition engine for detecting insight-worthy moments in meetings
    
    Features:
    - Multi-pattern trigger detection
    - Speaker behavior analysis
    - Topic-aware triggering
    - Temporal pattern recognition
    - Confidence scoring
    - Custom rule support
    - Real-time processing
    """
    
    def __init__(self, topic_service: TopicDetectionService = None):
        """Initialize the insight trigger engine"""
        self.topic_service = topic_service
        self.active_sessions: Dict[str, Dict] = {}
        
        # Initialize trigger patterns
        self.trigger_patterns = self._initialize_default_patterns()
        self.custom_patterns: Dict[str, TriggerPattern] = {}
        
        # Trigger detection windows
        self.context_window_size = 5  # Number of segments to consider for context
        self.speaker_change_threshold = 2  # Minimum segments between speaker changes
        self.topic_stability_threshold = 30.0  # Seconds of topic stability before new triggers
        
        # Performance tracking
        self.detection_stats: Dict[str, TriggerStatistics] = {}
        
        self.logger = logging.getLogger(__name__)
    
    def _initialize_default_patterns(self) -> Dict[TriggerType, List[TriggerPattern]]:
        """Initialize default trigger patterns"""
        patterns = {}
        
        # Speaker Change Triggers
        patterns[TriggerType.SPEAKER_CHANGE] = [
            TriggerPattern(
                trigger_type=TriggerType.SPEAKER_CHANGE,
                keywords=[],
                phrases=[],
                regex_patterns=[],
                context_requirements=['speaker_changed'],
                speaker_requirements={'min_previous_silence': 2.0},
                timing_requirements=None,
                confidence_threshold=0.8,
                priority=TriggerPriority.LOW
            )
        ]
        
        # Question Asked Triggers
        patterns[TriggerType.QUESTION_ASKED] = [
            TriggerPattern(
                trigger_type=TriggerType.QUESTION_ASKED,
                keywords=['what', 'when', 'where', 'why', 'how', 'who', 'which'],
                phrases=[
                    'what do you think', 'how should we', 'what if we', 'should we',
                    'can we', 'could we', 'would you', 'do you think', 'any thoughts',
                    'any ideas', 'what about', 'how about'
                ],
                regex_patterns=[
                    r'\b(what|when|where|why|how|who|which)\s+\w+.*\?',
                    r'\b(should|could|would|can)\s+we\b',
                    r'\bdo\s+you\s+think\b'
                ],
                context_requirements=[],
                speaker_requirements=None,
                timing_requirements=None,
                confidence_threshold=0.6,
                priority=TriggerPriority.MEDIUM
            )
        ]
        
        # Decision Point Triggers
        patterns[TriggerType.DECISION_POINT] = [
            TriggerPattern(
                trigger_type=TriggerType.DECISION_POINT,
                keywords=['decide', 'decision', 'choose', 'select', 'pick', 'approve', 'reject'],
                phrases=[
                    'let\'s decide', 'we need to decide', 'final decision', 'make a decision',
                    'what\'s the decision', 'decision time', 'vote on', 'choose between',
                    'go with', 'approve this', 'reject this', 'sign off'
                ],
                regex_patterns=[
                    r'\b(decide|decision|choose|select)\b',
                    r'\b(approve|reject|accept|deny)\b',
                    r'\bfinal\s+(decision|choice)\b'
                ],
                context_requirements=[],
                speaker_requirements=None,
                timing_requirements=None,
                confidence_threshold=0.7,
                priority=TriggerPriority.HIGH
            )
        ]
        
        # Action Item Triggers
        patterns[TriggerType.ACTION_ITEM] = [
            TriggerPattern(
                trigger_type=TriggerType.ACTION_ITEM,
                keywords=['action', 'task', 'todo', 'assign', 'responsible', 'owner', 'deliverable'],
                phrases=[
                    'action item', 'to do', 'follow up', 'next steps', 'assign to',
                    'responsible for', 'take ownership', 'deliver by', 'complete by',
                    'work on', 'handle this', 'look into', 'investigate'
                ],
                regex_patterns=[
                    r'\baction\s+item\b',
                    r'\b(assign|responsible|owner)\b',
                    r'\b(follow\s+up|next\s+steps)\b',
                    r'\b(complete|deliver|finish)\s+by\b'
                ],
                context_requirements=[],
                speaker_requirements=None,
                timing_requirements=None,
                confidence_threshold=0.6,
                priority=TriggerPriority.HIGH
            )
        ]
        
        # Disagreement Triggers
        patterns[TriggerType.DISAGREEMENT] = [
            TriggerPattern(
                trigger_type=TriggerType.DISAGREEMENT,
                keywords=['disagree', 'no', 'wrong', 'incorrect', 'oppose', 'against', 'but'],
                phrases=[
                    'i disagree', 'i don\'t think', 'that\'s not right', 'i\'m not sure',
                    'but what about', 'however', 'on the other hand', 'i think differently',
                    'not convinced', 'have concerns', 'not comfortable'
                ],
                regex_patterns=[
                    r'\b(disagree|oppose|against)\b',
                    r'\b(but|however|although)\b',
                    r'\bnot\s+(right|correct|sure|convinced)\b'
                ],
                context_requirements=[],
                speaker_requirements=None,
                timing_requirements=None,
                confidence_threshold=0.5,
                priority=TriggerPriority.MEDIUM
            )
        ]
        
        # Concern Raised Triggers
        patterns[TriggerType.CONCERN_RAISED] = [
            TriggerPattern(
                trigger_type=TriggerType.CONCERN_RAISED,
                keywords=['concern', 'worry', 'problem', 'issue', 'risk', 'challenge'],
                phrases=[
                    'i\'m concerned', 'i\'m worried', 'that\'s a problem', 'major issue',
                    'potential risk', 'red flag', 'warning sign', 'be careful',
                    'watch out', 'might cause problems', 'could be an issue'
                ],
                regex_patterns=[
                    r'\b(concern|worry|worried|problem|issue|risk)\b',
                    r'\b(red\s+flag|warning)\b',
                    r'\bmight\s+(cause|create|lead)\b'
                ],
                context_requirements=[],
                speaker_requirements=None,
                timing_requirements=None,
                confidence_threshold=0.6,
                priority=TriggerPriority.HIGH
            )
        ]
        
        # Deadline Mentioned Triggers
        patterns[TriggerType.DEADLINE_MENTIONED] = [
            TriggerPattern(
                trigger_type=TriggerType.DEADLINE_MENTIONED,
                keywords=['deadline', 'due', 'by', 'before', 'urgent', 'asap', 'immediately'],
                phrases=[
                    'by friday', 'end of week', 'end of month', 'next week',
                    'due date', 'deadline is', 'must be done', 'need this by',
                    'asap', 'as soon as possible', 'immediately', 'urgent'
                ],
                regex_patterns=[
                    r'\b(deadline|due|by)\s+\w+',
                    r'\b(urgent|asap|immediately)\b',
                    r'\bby\s+(friday|monday|tuesday|wednesday|thursday|saturday|sunday)\b',
                    r'\bend\s+of\s+(week|month|quarter|year)\b'
                ],
                context_requirements=[],
                speaker_requirements=None,
                timing_requirements=None,
                confidence_threshold=0.7,
                priority=TriggerPriority.HIGH
            )
        ]
        
        return patterns
    
    async def create_session(self, meeting_id: str, session_config: Dict[str, Any] = None) -> str:
        """Create a new insight trigger session"""
        session_id = f"trigger_session_{uuid.uuid4().hex}"
        
        config = session_config or {}
        
        session_data = {
            'session_id': session_id,
            'meeting_id': meeting_id,
            'created_at': datetime.now(),
            'config': {
                'enabled_triggers': config.get('enabled_triggers', list(TriggerType)),
                'custom_patterns': config.get('custom_patterns', []),
                'confidence_threshold': config.get('confidence_threshold', 0.5),
                'max_triggers_per_minute': config.get('max_triggers_per_minute', 5),
                'speaker_sensitivity': config.get('speaker_sensitivity', 0.7),
                'topic_integration': config.get('topic_integration', True)
            },
            'text_segments': deque(maxlen=100),  # Keep last 100 segments
            'detected_triggers': [],
            'speaker_timeline': [],
            'trigger_queue': deque(maxlen=50),  # Queue for trigger processing
            'last_trigger_time': 0.0,
            'speaker_states': {},  # Track speaker behavior
            'topic_context': None,
            'processing_stats': {
                'total_segments_processed': 0,
                'total_triggers_detected': 0,
                'triggers_by_type': Counter(),
                'processing_time_total': 0.0,
                'false_positive_rate': 0.0
            }
        }
        
        self.active_sessions[session_id] = session_data
        self.logger.info(f"Created insight trigger session {session_id} for meeting {meeting_id}")
        
        return session_id
    
    async def process_segment(self,
                            session_id: str,
                            text: str,
                            timestamp: float,
                            speaker: Optional[str] = None,
                            topic_context: Optional[Dict] = None,
                            metadata: Dict[str, Any] = None) -> List[DetectedTrigger]:
        """
        Process a text segment and detect insight triggers
        
        Args:
            session_id: Active trigger session ID
            text: Transcribed text segment
            timestamp: Timestamp of the segment
            speaker: Speaker identifier
            topic_context: Current topic information from topic detection
            metadata: Additional metadata
            
        Returns:
            List of detected triggers
        """
        start_time = time.time()
        
        if session_id not in self.active_sessions:
            raise ValueError(f"Session {session_id} not found")
        
        session = self.active_sessions[session_id]
        
        # Create segment object
        segment = {
            'id': str(uuid.uuid4()),
            'text': text,
            'timestamp': timestamp,
            'speaker': speaker,
            'topic_context': topic_context,
            'metadata': metadata or {}
        }
        
        session['text_segments'].append(segment)
        session['speaker_timeline'].append((timestamp, speaker))
        
        # Update speaker states
        self._update_speaker_states(session, segment)
        
        # Detect triggers
        triggers = await self._detect_triggers(session, segment)
        
        # Filter and prioritize triggers
        filtered_triggers = self._filter_triggers(session, triggers)
        
        # Add to session
        session['detected_triggers'].extend(filtered_triggers)
        session['trigger_queue'].extend(filtered_triggers)
        
        # Update statistics
        processing_time = (time.time() - start_time) * 1000
        session['processing_stats']['total_segments_processed'] += 1
        session['processing_stats']['total_triggers_detected'] += len(filtered_triggers)
        session['processing_stats']['processing_time_total'] += processing_time
        
        for trigger in filtered_triggers:
            session['processing_stats']['triggers_by_type'][trigger.trigger_type.value] += 1
        
        self.logger.debug(f"Processed segment for session {session_id}: {len(filtered_triggers)} triggers detected")
        
        return filtered_triggers
    
    def _update_speaker_states(self, session: Dict, segment: Dict):
        """Update speaker behavior tracking"""
        speaker = segment.get('speaker')
        timestamp = segment['timestamp']
        
        if not speaker:
            return
        
        if speaker not in session['speaker_states']:
            session['speaker_states'][speaker] = {
                'first_appearance': timestamp,
                'last_appearance': timestamp,
                'speaking_time': 0.0,
                'segment_count': 0,
                'avg_segment_length': 0.0,
                'question_count': 0,
                'statement_count': 0,
                'silence_periods': []
            }
        
        speaker_state = session['speaker_states'][speaker]
        
        # Update speaking statistics
        if speaker_state['last_appearance'] > 0:
            gap = timestamp - speaker_state['last_appearance']
            if gap > 5.0:  # Consider gaps > 5 seconds as silence
                speaker_state['silence_periods'].append(gap)
        
        speaker_state['last_appearance'] = timestamp
        speaker_state['segment_count'] += 1
        
        # Estimate segment length (rough approximation)
        segment_length = len(segment['text']) / 150.0  # Assume 150 words per minute
        speaker_state['speaking_time'] += segment_length
        speaker_state['avg_segment_length'] = speaker_state['speaking_time'] / speaker_state['segment_count']
        
        # Count questions vs statements
        if '?' in segment['text']:
            speaker_state['question_count'] += 1
        else:
            speaker_state['statement_count'] += 1
    
    async def _detect_triggers(self, session: Dict, segment: Dict) -> List[DetectedTrigger]:
        """Detect triggers in the current segment"""
        triggers = []
        text = segment['text'].lower()
        
        # Get context window
        context_segments = list(session['text_segments'])[-self.context_window_size:]
        context_window = [seg['text'] for seg in context_segments]
        
        # Check each enabled trigger type
        enabled_triggers = session['config']['enabled_triggers']
        
        for trigger_type in enabled_triggers:
            if trigger_type in self.trigger_patterns:
                patterns = self.trigger_patterns[trigger_type]
                
                for pattern in patterns:
                    if not pattern.enabled:
                        continue
                    
                    # Check pattern match
                    match_result = self._check_pattern_match(pattern, segment, context_segments)
                    
                    if match_result['matches'] and match_result['confidence'] >= pattern.confidence_threshold:
                        # Create trigger
                        trigger = DetectedTrigger(
                            id=f"trigger_{uuid.uuid4().hex[:8]}",
                            trigger_type=trigger_type,
                            priority=pattern.priority,
                            confidence=match_result['confidence'],
                            timestamp=segment['timestamp'],
                            speaker=segment.get('speaker'),
                            trigger_text=segment['text'],
                            context_window=context_window,
                            matched_patterns=match_result['matched_patterns'],
                            topic_context=segment.get('topic_context', {}).get('id') if segment.get('topic_context') else None,
                            previous_triggers=[t.id for t in session['detected_triggers'][-3:]],
                            metadata={
                                'pattern_id': f"{trigger_type.value}_{hash(str(pattern))}",
                                'match_details': match_result,
                                'speaker_context': self._get_speaker_context(session, segment),
                                'temporal_context': self._get_temporal_context(session, segment)
                            },
                            should_generate_insight=self._should_generate_insight(trigger_type, match_result['confidence']),
                            insight_type_suggestion=self._suggest_insight_type(trigger_type, segment)
                        )
                        
                        triggers.append(trigger)
        
        # Check for special composite triggers
        composite_triggers = await self._detect_composite_triggers(session, segment, context_segments)
        triggers.extend(composite_triggers)
        
        return triggers
    
    def _check_pattern_match(self, pattern: TriggerPattern, segment: Dict, context_segments: List[Dict]) -> Dict[str, Any]:
        """Check if a pattern matches the current segment"""
        text = segment['text'].lower()
        confidence = 0.0
        matched_patterns = []
        
        # Keyword matching
        keyword_matches = sum(1 for keyword in pattern.keywords if keyword.lower() in text)
        if pattern.keywords:
            keyword_confidence = keyword_matches / len(pattern.keywords)
            confidence += keyword_confidence * 0.3
            if keyword_matches > 0:
                matched_patterns.append(f"keywords: {keyword_matches}/{len(pattern.keywords)}")
        
        # Phrase matching
        phrase_matches = sum(1 for phrase in pattern.phrases if phrase.lower() in text)
        if pattern.phrases:
            phrase_confidence = phrase_matches / len(pattern.phrases)
            confidence += phrase_confidence * 0.4
            if phrase_matches > 0:
                matched_patterns.append(f"phrases: {phrase_matches}/{len(pattern.phrases)}")
        
        # Regex matching
        regex_matches = 0
        for regex_pattern in pattern.regex_patterns:
            if re.search(regex_pattern, text, re.IGNORECASE):
                regex_matches += 1
        
        if pattern.regex_patterns:
            regex_confidence = regex_matches / len(pattern.regex_patterns)
            confidence += regex_confidence * 0.3
            if regex_matches > 0:
                matched_patterns.append(f"regex: {regex_matches}/{len(pattern.regex_patterns)}")
        
        # Context requirements
        context_met = True
        if pattern.context_requirements:
            for requirement in pattern.context_requirements:
                if requirement == 'speaker_changed':
                    # Check if speaker changed recently
                    if len(context_segments) >= 2:
                        last_speaker = context_segments[-2].get('speaker')
                        current_speaker = segment.get('speaker')
                        if last_speaker == current_speaker:
                            context_met = False
                            break
                # Add more context requirements as needed
        
        if not context_met:
            confidence *= 0.5  # Reduce confidence if context not met
        
        # Speaker requirements
        if pattern.speaker_requirements:
            # Check speaker-specific requirements
            # This could include things like speaker role, speaking patterns, etc.
            pass
        
        # Timing requirements
        if pattern.timing_requirements:
            # Check timing-specific requirements
            # This could include meeting phase, time since last trigger, etc.
            pass
        
        return {
            'matches': confidence > 0,
            'confidence': min(1.0, confidence),
            'matched_patterns': matched_patterns,
            'keyword_matches': keyword_matches,
            'phrase_matches': phrase_matches,
            'regex_matches': regex_matches
        }
    
    async def _detect_composite_triggers(self, session: Dict, segment: Dict, context_segments: List[Dict]) -> List[DetectedTrigger]:
        """Detect complex triggers that require multiple patterns or conditions"""
        triggers = []
        
        # Speaker change with topic shift (high-priority trigger)
        speaker_changed = self._detect_speaker_change(context_segments)
        topic_shifted = segment.get('topic_context', {}).get('topic_change', False)
        
        if speaker_changed and topic_shifted:
            trigger = DetectedTrigger(
                id=f"trigger_{uuid.uuid4().hex[:8]}",
                trigger_type=TriggerType.TOPIC_SHIFT,
                priority=TriggerPriority.HIGH,
                confidence=0.8,
                timestamp=segment['timestamp'],
                speaker=segment.get('speaker'),
                trigger_text=segment['text'],
                context_window=[seg['text'] for seg in context_segments],
                matched_patterns=['speaker_change + topic_shift'],
                topic_context=segment.get('topic_context', {}).get('id'),
                previous_triggers=[],
                metadata={'composite_type': 'speaker_topic_shift'},
                should_generate_insight=True,
                insight_type_suggestion='transition_summary'
            )
            triggers.append(trigger)
        
        # Question followed by silence (potential decision point)
        if self._detect_question_silence_pattern(context_segments):
            trigger = DetectedTrigger(
                id=f"trigger_{uuid.uuid4().hex[:8]}",
                trigger_type=TriggerType.DECISION_POINT,
                priority=TriggerPriority.MEDIUM,
                confidence=0.6,
                timestamp=segment['timestamp'],
                speaker=segment.get('speaker'),
                trigger_text=segment['text'],
                context_window=[seg['text'] for seg in context_segments],
                matched_patterns=['question + silence'],
                topic_context=segment.get('topic_context', {}).get('id'),
                previous_triggers=[],
                metadata={'composite_type': 'question_silence'},
                should_generate_insight=True,
                insight_type_suggestion='decision_needed'
            )
            triggers.append(trigger)
        
        return triggers
    
    def _detect_speaker_change(self, context_segments: List[Dict]) -> bool:
        """Detect if speaker changed recently"""
        if len(context_segments) < 2:
            return False
        
        last_speaker = context_segments[-2].get('speaker')
        current_speaker = context_segments[-1].get('speaker')
        
        return last_speaker != current_speaker and last_speaker is not None and current_speaker is not None
    
    def _detect_question_silence_pattern(self, context_segments: List[Dict]) -> bool:
        """Detect pattern of question followed by silence or hesitation"""
        if len(context_segments) < 3:
            return False
        
        # Look for question in recent segments
        for i, segment in enumerate(context_segments[-3:]):
            if '?' in segment['text']:
                # Check if followed by short responses or silence indicators
                following_segments = context_segments[-(3-i):]
                for follow_seg in following_segments:
                    text = follow_seg['text'].lower()
                    if any(word in text for word in ['um', 'uh', 'well', 'hmm', 'let me think']):
                        return True
                    if len(text.split()) < 5:  # Very short response
                        return True
        
        return False
    
    def _get_speaker_context(self, session: Dict, segment: Dict) -> Dict[str, Any]:
        """Get context about the current speaker"""
        speaker = segment.get('speaker')
        if not speaker or speaker not in session['speaker_states']:
            return {}
        
        speaker_state = session['speaker_states'][speaker]
        
        return {
            'speaking_time': speaker_state['speaking_time'],
            'segment_count': speaker_state['segment_count'],
            'question_ratio': speaker_state['question_count'] / max(speaker_state['segment_count'], 1),
            'avg_silence': np.mean(speaker_state['silence_periods']) if speaker_state['silence_periods'] else 0.0,
            'is_frequent_speaker': speaker_state['segment_count'] > 5
        }
    
    def _get_temporal_context(self, session: Dict, segment: Dict) -> Dict[str, Any]:
        """Get temporal context for the segment"""
        timestamp = segment['timestamp']
        
        # Time since last trigger
        time_since_last_trigger = 0.0
        if session['detected_triggers']:
            last_trigger_time = session['detected_triggers'][-1].timestamp
            time_since_last_trigger = timestamp - last_trigger_time
        
        # Meeting phase (beginning, middle, end)
        meeting_duration = timestamp - session['created_at'].timestamp()
        if meeting_duration < 300:  # First 5 minutes
            phase = 'beginning'
        elif meeting_duration > 3600:  # After 1 hour
            phase = 'end'
        else:
            phase = 'middle'
        
        return {
            'meeting_duration': meeting_duration,
            'meeting_phase': phase,
            'time_since_last_trigger': time_since_last_trigger,
            'triggers_in_last_minute': len([t for t in session['detected_triggers'] 
                                          if timestamp - t.timestamp <= 60])
        }
    
    def _should_generate_insight(self, trigger_type: TriggerType, confidence: float) -> bool:
        """Determine if this trigger should generate an insight"""
        # High-priority triggers almost always generate insights
        if trigger_type in [TriggerType.DECISION_POINT, TriggerType.ACTION_ITEM, TriggerType.CONCERN_RAISED]:
            return confidence > 0.4
        
        # Medium-priority triggers need higher confidence
        if trigger_type in [TriggerType.QUESTION_ASKED, TriggerType.DISAGREEMENT, TriggerType.DEADLINE_MENTIONED]:
            return confidence > 0.6
        
        # Low-priority triggers need very high confidence
        return confidence > 0.8
    
    def _suggest_insight_type(self, trigger_type: TriggerType, segment: Dict) -> Optional[str]:
        """Suggest what type of insight should be generated"""
        mapping = {
            TriggerType.DECISION_POINT: 'decision',
            TriggerType.ACTION_ITEM: 'action_item',
            TriggerType.CONCERN_RAISED: 'concern',
            TriggerType.QUESTION_ASKED: 'question',
            TriggerType.DEADLINE_MENTIONED: 'deadline',
            TriggerType.TOPIC_SHIFT: 'topic_summary',
            TriggerType.DISAGREEMENT: 'conflict_resolution',
            TriggerType.AGREEMENT: 'consensus',
            TriggerType.TECHNICAL_ISSUE: 'technical_note',
            TriggerType.BUSINESS_IMPACT: 'business_insight'
        }
        
        return mapping.get(trigger_type)
    
    def _filter_triggers(self, session: Dict, triggers: List[DetectedTrigger]) -> List[DetectedTrigger]:
        """Filter and prioritize triggers to avoid spam"""
        if not triggers:
            return []
        
        # Sort by confidence and priority
        triggers.sort(key=lambda t: (t.priority.value, t.confidence), reverse=True)
        
        # Remove duplicates based on type and timing
        filtered = []
        seen_types = set()
        
        for trigger in triggers:
            # Check for recent similar triggers
            recent_similar = any(
                t.trigger_type == trigger.trigger_type and 
                abs(t.timestamp - trigger.timestamp) < 30  # Within 30 seconds
                for t in session['detected_triggers'][-10:]
            )
            
            if not recent_similar:
                filtered.append(trigger)
                seen_types.add(trigger.trigger_type)
        
        # Limit triggers per processing cycle
        max_triggers = session['config']['max_triggers_per_minute']
        return filtered[:max_triggers]
    
    async def get_session_statistics(self, session_id: str) -> Optional[TriggerStatistics]:
        """Get comprehensive statistics for a trigger session"""
        if session_id not in self.active_sessions:
            return None
        
        session = self.active_sessions[session_id]
        triggers = session['detected_triggers']
        
        if not triggers:
            return TriggerStatistics(
                total_triggers=0,
                triggers_by_type={},
                triggers_by_speaker={},
                triggers_by_priority={},
                average_confidence=0.0,
                trigger_density=0.0,
                most_active_periods=[],
                pattern_effectiveness={}
            )
        
        # Calculate statistics
        total_triggers = len(triggers)
        
        triggers_by_type = Counter(t.trigger_type.value for t in triggers)
        triggers_by_speaker = Counter(t.speaker for t in triggers if t.speaker)
        triggers_by_priority = Counter(t.priority.value for t in triggers)
        
        average_confidence = np.mean([t.confidence for t in triggers])
        
        # Calculate trigger density (triggers per minute)
        if triggers:
            time_span = triggers[-1].timestamp - triggers[0].timestamp
            trigger_density = total_triggers / max(time_span / 60, 1)  # per minute
        else:
            trigger_density = 0.0
        
        # Find most active periods (5-minute windows)
        most_active_periods = self._find_active_periods(triggers)
        
        # Calculate pattern effectiveness
        pattern_effectiveness = self._calculate_pattern_effectiveness(session)
        
        return TriggerStatistics(
            total_triggers=total_triggers,
            triggers_by_type=dict(triggers_by_type),
            triggers_by_speaker=dict(triggers_by_speaker),
            triggers_by_priority=dict(triggers_by_priority),
            average_confidence=average_confidence,
            trigger_density=trigger_density,
            most_active_periods=most_active_periods,
            pattern_effectiveness=pattern_effectiveness
        )
    
    def _find_active_periods(self, triggers: List[DetectedTrigger], window_minutes: int = 5) -> List[Tuple[float, float, int]]:
        """Find periods with high trigger activity"""
        if not triggers:
            return []
        
        window_seconds = window_minutes * 60
        periods = []
        
        start_time = triggers[0].timestamp
        end_time = triggers[-1].timestamp
        
        current_time = start_time
        while current_time <= end_time:
            window_end = current_time + window_seconds
            
            # Count triggers in this window
            window_triggers = [t for t in triggers 
                             if current_time <= t.timestamp < window_end]
            
            if len(window_triggers) >= 3:  # Minimum for "active" period
                periods.append((current_time, window_end, len(window_triggers)))
            
            current_time += window_seconds / 2  # 50% overlap
        
        # Sort by trigger count and return top periods
        periods.sort(key=lambda x: x[2], reverse=True)
        return periods[:5]
    
    def _calculate_pattern_effectiveness(self, session: Dict) -> Dict[str, float]:
        """Calculate how effective each pattern type is"""
        triggers = session['detected_triggers']
        
        if not triggers:
            return {}
        
        pattern_stats = defaultdict(list)
        
        for trigger in triggers:
            pattern_id = trigger.metadata.get('pattern_id', 'unknown')
            pattern_stats[pattern_id].append(trigger.confidence)
        
        # Calculate average confidence per pattern
        effectiveness = {}
        for pattern_id, confidences in pattern_stats.items():
            effectiveness[pattern_id] = {
                'avg_confidence': np.mean(confidences),
                'trigger_count': len(confidences),
                'effectiveness_score': np.mean(confidences) * len(confidences)
            }
        
        return effectiveness
    
    def add_custom_pattern(self, pattern: TriggerPattern) -> str:
        """Add a custom trigger pattern"""
        pattern_id = f"custom_{uuid.uuid4().hex[:8]}"
        self.custom_patterns[pattern_id] = pattern
        
        # Add to appropriate trigger type patterns
        if pattern.trigger_type not in self.trigger_patterns:
            self.trigger_patterns[pattern.trigger_type] = []
        
        self.trigger_patterns[pattern.trigger_type].append(pattern)
        
        self.logger.info(f"Added custom pattern {pattern_id} for trigger type {pattern.trigger_type.value}")
        
        return pattern_id
    
    def remove_custom_pattern(self, pattern_id: str) -> bool:
        """Remove a custom trigger pattern"""
        if pattern_id not in self.custom_patterns:
            return False
        
        pattern = self.custom_patterns[pattern_id]
        
        # Remove from trigger patterns
        if pattern.trigger_type in self.trigger_patterns:
            self.trigger_patterns[pattern.trigger_type] = [
                p for p in self.trigger_patterns[pattern.trigger_type] 
                if p != pattern
            ]
        
        del self.custom_patterns[pattern_id]
        
        self.logger.info(f"Removed custom pattern {pattern_id}")
        
        return True
    
    async def close_session(self, session_id: str) -> Optional[TriggerStatistics]:
        """Close a trigger session and return final statistics"""
        if session_id not in self.active_sessions:
            return None
        
        # Get final statistics
        stats = await self.get_session_statistics(session_id)
        
        # Store in global statistics
        if stats:
            self.detection_stats[session_id] = stats
        
        # Clean up session
        del self.active_sessions[session_id]
        
        self.logger.info(f"Closed insight trigger session {session_id}")
        
        return stats

# Global insight trigger engine instance
insight_trigger_engine = InsightTriggerEngine()

async def get_insight_trigger_engine() -> InsightTriggerEngine:
    """Get the global insight trigger engine instance"""
    return insight_trigger_engine

async def initialize_trigger_engine():
    """Initialize the trigger engine with topic detection service"""
    topic_service = await get_topic_detection_service()
    insight_trigger_engine.topic_service = topic_service
    return insight_trigger_engine