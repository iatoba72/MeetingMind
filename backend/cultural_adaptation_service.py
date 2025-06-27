# Cultural Adaptation Service
# Intelligent cultural context awareness and communication adaptation

from typing import List, Dict, Optional, Any, Tuple
from sqlalchemy.orm import Session
from datetime import datetime
import json
from dataclasses import dataclass
from enum import Enum

from i18n_models import (
    CulturalContextRule, LanguageCode, CulturalContext,
    MultiLanguageTranscript, Translation
)
from models import Meeting, Participant
from database import get_db

@dataclass
class CulturalProfile:
    """Cultural profile for a participant or organization"""
    participant_id: Optional[str]
    organization_id: Optional[str]
    primary_culture: str  # ISO country code or culture identifier
    secondary_cultures: List[str]
    communication_style: str  # direct, indirect, high_context, low_context
    hierarchy_preference: str  # high, low, moderate
    decision_making_style: str  # consensus, authoritative, collaborative
    formality_preference: str  # formal, informal, situational
    time_orientation: str  # monochronic, polychronic
    relationship_focus: str  # task_oriented, relationship_oriented, balanced

@dataclass
class AdaptationRule:
    """Rule for cultural adaptation"""
    rule_id: str
    name: str
    source_culture: str
    target_culture: str
    context_type: CulturalContext
    trigger_patterns: List[str]
    adaptation_strategy: str
    replacement_patterns: Dict[str, str]
    confidence_threshold: float
    examples: List[Dict[str, str]]

@dataclass
class AdaptationSuggestion:
    """Suggestion for cultural adaptation"""
    original_text: str
    adapted_text: str
    adaptation_type: str
    confidence: float
    reasoning: str
    cultural_notes: str
    target_culture: str
    context: CulturalContext

@dataclass
class CulturalMismatchAlert:
    """Alert for potential cultural mismatches"""
    alert_type: str
    description: str
    participants_affected: List[str]
    potential_impact: str  # low, medium, high
    suggested_actions: List[str]
    cultural_explanation: str

class CulturalProfileManager:
    """
    Manages cultural profiles for participants and organizations
    
    Design Decision: Comprehensive cultural profiling enables
    personalized adaptation strategies for each participant.
    """
    
    def __init__(self, db: Session):
        self.db = db
        
        # Default cultural characteristics by country/region
        self.cultural_defaults = {
            'us': {
                'communication_style': 'direct',
                'hierarchy_preference': 'low',
                'decision_making_style': 'collaborative',
                'formality_preference': 'informal',
                'time_orientation': 'monochronic',
                'relationship_focus': 'task_oriented'
            },
            'jp': {
                'communication_style': 'high_context',
                'hierarchy_preference': 'high',
                'decision_making_style': 'consensus',
                'formality_preference': 'formal',
                'time_orientation': 'monochronic',
                'relationship_focus': 'relationship_oriented'
            },
            'de': {
                'communication_style': 'direct',
                'hierarchy_preference': 'moderate',
                'decision_making_style': 'authoritative',
                'formality_preference': 'formal',
                'time_orientation': 'monochronic',
                'relationship_focus': 'task_oriented'
            },
            'br': {
                'communication_style': 'indirect',
                'hierarchy_preference': 'high',
                'decision_making_style': 'collaborative',
                'formality_preference': 'situational',
                'time_orientation': 'polychronic',
                'relationship_focus': 'relationship_oriented'
            },
            'in': {
                'communication_style': 'high_context',
                'hierarchy_preference': 'high',
                'decision_making_style': 'consensus',
                'formality_preference': 'formal',
                'time_orientation': 'polychronic',
                'relationship_focus': 'relationship_oriented'
            },
            'se': {
                'communication_style': 'direct',
                'hierarchy_preference': 'low',
                'decision_making_style': 'consensus',
                'formality_preference': 'informal',
                'time_orientation': 'monochronic',
                'relationship_focus': 'balanced'
            }
        }
    
    async def create_cultural_profile(
        self,
        participant_id: Optional[str] = None,
        organization_id: Optional[str] = None,
        culture_code: str = 'us',
        custom_preferences: Optional[Dict[str, str]] = None
    ) -> CulturalProfile:
        """
        Create a cultural profile for a participant or organization
        
        Args:
            participant_id: Participant ID
            organization_id: Organization ID
            culture_code: Primary culture code
            custom_preferences: Custom cultural preferences
        
        Returns:
            Cultural profile
        """
        # Get default characteristics
        defaults = self.cultural_defaults.get(culture_code.lower(), self.cultural_defaults['us'])
        
        # Apply custom preferences
        if custom_preferences:
            defaults.update(custom_preferences)
        
        profile = CulturalProfile(
            participant_id=participant_id,
            organization_id=organization_id,
            primary_culture=culture_code.lower(),
            secondary_cultures=[],
            **defaults
        )
        
        return profile
    
    async def infer_cultural_profile(
        self,
        communication_samples: List[str],
        language_code: LanguageCode,
        participant_info: Optional[Dict] = None
    ) -> CulturalProfile:
        """
        Infer cultural profile from communication patterns
        
        Args:
            communication_samples: Sample texts from participant
            language_code: Language of communication
            participant_info: Additional participant information
        
        Returns:
            Inferred cultural profile
        """
        # Analyze communication style
        comm_style = self._analyze_communication_style(communication_samples)
        hierarchy = self._analyze_hierarchy_preference(communication_samples)
        formality = self._analyze_formality_preference(communication_samples)
        
        # Start with language-based defaults
        culture_code = self._map_language_to_culture(language_code)
        defaults = self.cultural_defaults.get(culture_code, self.cultural_defaults['us'])
        
        # Override with inferred characteristics
        profile = CulturalProfile(
            participant_id=participant_info.get('id') if participant_info else None,
            organization_id=participant_info.get('organization_id') if participant_info else None,
            primary_culture=culture_code,
            secondary_cultures=[],
            communication_style=comm_style,
            hierarchy_preference=hierarchy,
            formality_preference=formality,
            decision_making_style=defaults['decision_making_style'],
            time_orientation=defaults['time_orientation'],
            relationship_focus=defaults['relationship_focus']
        )
        
        return profile
    
    def _analyze_communication_style(self, samples: List[str]) -> str:
        """Analyze communication style from text samples"""
        combined_text = ' '.join(samples).lower()
        
        # Direct communication markers
        direct_markers = ['clearly', 'obviously', 'simply', 'definitely', 'must', 'will']
        direct_score = sum(combined_text.count(marker) for marker in direct_markers)
        
        # Indirect communication markers
        indirect_markers = ['perhaps', 'maybe', 'possibly', 'might', 'could', 'consider']
        indirect_score = sum(combined_text.count(marker) for marker in indirect_markers)
        
        # High-context markers
        context_markers = ['understand', 'appreciate', 'feel', 'sense', 'experience']
        context_score = sum(combined_text.count(marker) for marker in context_markers)
        
        # Determine style based on scores
        total_score = direct_score + indirect_score + context_score
        if total_score == 0:
            return 'balanced'
        
        if context_score / total_score > 0.4:
            return 'high_context'
        elif direct_score > indirect_score:
            return 'direct'
        else:
            return 'indirect'
    
    def _analyze_hierarchy_preference(self, samples: List[str]) -> str:
        """Analyze hierarchy preference from text samples"""
        combined_text = ' '.join(samples).lower()
        
        # High hierarchy markers
        high_markers = ['sir', 'madam', 'please', 'respectfully', 'humbly', 'honor']
        high_score = sum(combined_text.count(marker) for marker in high_markers)
        
        # Low hierarchy markers
        low_markers = ['disagree', 'challenge', 'question', 'alternative', 'different view']
        low_score = sum(combined_text.count(marker) for marker in low_markers)
        
        if high_score > low_score * 2:
            return 'high'
        elif low_score > high_score:
            return 'low'
        else:
            return 'moderate'
    
    def _analyze_formality_preference(self, samples: List[str]) -> str:
        """Analyze formality preference from text samples"""
        combined_text = ' '.join(samples).lower()
        
        # Formal markers
        formal_markers = ['shall', 'would', 'kindly', 'cordially', 'sincerely']
        formal_score = sum(combined_text.count(marker) for marker in formal_markers)
        
        # Informal markers
        informal_markers = ['gonna', 'wanna', 'yeah', 'ok', 'cool', 'awesome']
        informal_score = sum(combined_text.count(marker) for marker in informal_markers)
        
        total_markers = formal_score + informal_score
        if total_markers == 0:
            return 'situational'
        
        if formal_score > informal_score:
            return 'formal'
        elif informal_score > formal_score:
            return 'informal'
        else:
            return 'situational'
    
    def _map_language_to_culture(self, language_code: LanguageCode) -> str:
        """Map language code to primary culture"""
        language_culture_map = {
            LanguageCode.EN: 'us',
            LanguageCode.JA: 'jp',
            LanguageCode.DE: 'de',
            LanguageCode.PT: 'br',
            LanguageCode.HI: 'in',
            LanguageCode.SV: 'se',
            LanguageCode.ES: 'es',
            LanguageCode.FR: 'fr',
            LanguageCode.ZH: 'cn',
            LanguageCode.KO: 'kr',
            LanguageCode.AR: 'sa'
        }
        
        return language_culture_map.get(language_code, 'us')

class CulturalAdaptationEngine:
    """
    Engine for applying cultural adaptations to communications
    
    Design Decision: Rule-based adaptation system with machine learning
    enhancement provides reliable and explainable cultural adjustments.
    """
    
    def __init__(self, db: Session):
        self.db = db
        self.adaptation_rules = {}
        self._load_adaptation_rules()
    
    def _load_adaptation_rules(self):
        """Load cultural adaptation rules from database"""
        rules = self.db.query(CulturalContextRule).filter(
            CulturalContextRule.is_active == True
        ).all()
        
        for rule in rules:
            key = f"{rule.source_culture}_{rule.target_culture}_{rule.business_context.value if rule.business_context else 'general'}"
            
            adaptation_rule = AdaptationRule(
                rule_id=str(rule.id),
                name=rule.name,
                source_culture=rule.source_culture,
                target_culture=rule.target_culture,
                context_type=rule.business_context or CulturalContext.BUSINESS_CASUAL,
                trigger_patterns=rule.trigger_patterns or [],
                adaptation_strategy=rule.formality_adjustment or 'maintain',
                replacement_patterns=rule.replacement_patterns or {},
                confidence_threshold=rule.confidence_threshold,
                examples=rule.example_transformations or []
            )
            
            if key not in self.adaptation_rules:
                self.adaptation_rules[key] = []
            self.adaptation_rules[key].append(adaptation_rule)
    
    async def adapt_text(
        self,
        text: str,
        source_profile: CulturalProfile,
        target_profiles: List[CulturalProfile],
        context: CulturalContext = CulturalContext.BUSINESS_CASUAL
    ) -> List[AdaptationSuggestion]:
        """
        Adapt text for different cultural contexts
        
        Args:
            text: Original text
            source_profile: Cultural profile of the speaker
            target_profiles: Cultural profiles of the audience
            context: Business context
        
        Returns:
            List of adaptation suggestions for each target culture
        """
        suggestions = []
        
        for target_profile in target_profiles:
            if source_profile.primary_culture == target_profile.primary_culture:
                continue  # No adaptation needed for same culture
            
            # Find applicable rules
            rule_key = f"{source_profile.primary_culture}_{target_profile.primary_culture}_{context.value}"
            rules = self.adaptation_rules.get(rule_key, [])
            
            if not rules:
                # Try general rules
                rule_key = f"{source_profile.primary_culture}_{target_profile.primary_culture}_general"
                rules = self.adaptation_rules.get(rule_key, [])
            
            # Apply rules
            adapted_text = text
            adaptations_applied = []
            
            for rule in rules:
                adaptation_result = self._apply_adaptation_rule(
                    adapted_text, rule, source_profile, target_profile
                )
                
                if adaptation_result:
                    adapted_text = adaptation_result['adapted_text']
                    adaptations_applied.append(adaptation_result)
            
            # Create suggestion if adaptations were made
            if adaptations_applied:
                reasoning = '; '.join([a['reasoning'] for a in adaptations_applied])
                adaptation_types = ', '.join([a['type'] for a in adaptations_applied])
                
                suggestion = AdaptationSuggestion(
                    original_text=text,
                    adapted_text=adapted_text,
                    adaptation_type=adaptation_types,
                    confidence=min([a['confidence'] for a in adaptations_applied]),
                    reasoning=reasoning,
                    cultural_notes=self._generate_cultural_notes(source_profile, target_profile),
                    target_culture=target_profile.primary_culture,
                    context=context
                )
                
                suggestions.append(suggestion)
        
        return suggestions
    
    def _apply_adaptation_rule(
        self,
        text: str,
        rule: AdaptationRule,
        source_profile: CulturalProfile,
        target_profile: CulturalProfile
    ) -> Optional[Dict[str, Any]]:
        """
        Apply a specific adaptation rule to text
        
        Args:
            text: Text to adapt
            rule: Adaptation rule
            source_profile: Source cultural profile
            target_profile: Target cultural profile
        
        Returns:
            Adaptation result or None if rule doesn't apply
        """
        # Check if rule triggers apply
        text_lower = text.lower()
        triggered = False
        
        for pattern in rule.trigger_patterns:
            if pattern.lower() in text_lower:
                triggered = True
                break
        
        if not triggered:
            return None
        
        # Apply adaptations based on rule strategy
        adapted_text = text
        adaptation_type = []
        reasoning = []
        
        # Formality adaptation
        if rule.adaptation_strategy == 'increase_formality':
            adapted_text = self._increase_formality(adapted_text)
            adaptation_type.append('formality_increase')
            reasoning.append('Increased formality for high-hierarchy culture')
        
        elif rule.adaptation_strategy == 'decrease_formality':
            adapted_text = self._decrease_formality(adapted_text)
            adaptation_type.append('formality_decrease')
            reasoning.append('Decreased formality for low-hierarchy culture')
        
        # Directness adaptation
        if target_profile.communication_style == 'indirect' and source_profile.communication_style == 'direct':
            adapted_text = self._soften_directness(adapted_text)
            adaptation_type.append('directness_softening')
            reasoning.append('Softened direct communication for indirect culture')
        
        elif target_profile.communication_style == 'direct' and source_profile.communication_style == 'indirect':
            adapted_text = self._increase_directness(adapted_text)
            adaptation_type.append('directness_increase')
            reasoning.append('Increased directness for direct culture')
        
        # Apply replacement patterns
        for pattern, replacement in rule.replacement_patterns.items():
            adapted_text = adapted_text.replace(pattern, replacement)
        
        if adapted_text != text:
            return {
                'adapted_text': adapted_text,
                'type': ', '.join(adaptation_type),
                'reasoning': '; '.join(reasoning),
                'confidence': 0.8  # Default confidence
            }
        
        return None
    
    def _increase_formality(self, text: str) -> str:
        """Increase formality of text"""
        replacements = {
            'hi': 'hello',
            'hey': 'hello',
            'thanks': 'thank you',
            'ok': 'very well',
            'yeah': 'yes',
            'nope': 'no',
            'gonna': 'going to',
            'wanna': 'would like to'
        }
        
        adapted = text
        for informal, formal in replacements.items():
            adapted = adapted.replace(informal, formal)
        
        return adapted
    
    def _decrease_formality(self, text: str) -> str:
        """Decrease formality of text"""
        replacements = {
            'shall we': 'should we',
            'would you be so kind': 'could you',
            'i would be grateful': 'i\'d appreciate',
            'at your earliest convenience': 'when you can',
            'please do not hesitate': 'please'
        }
        
        adapted = text
        for formal, informal in replacements.items():
            adapted = adapted.replace(formal, informal)
        
        return adapted
    
    def _soften_directness(self, text: str) -> str:
        """Soften direct communication"""
        # Add softening phrases
        if text.startswith(('You must', 'You should', 'You need to')):
            text = 'Perhaps ' + text.lower()
        
        # Replace direct commands with suggestions
        replacements = {
            'you must': 'you might consider',
            'you should': 'you could',
            'do this': 'perhaps we could do this',
            'this is wrong': 'this might need adjustment',
            'fix this': 'perhaps we could improve this'
        }
        
        adapted = text
        for direct, softened in replacements.items():
            adapted = adapted.replace(direct, softened)
        
        return adapted
    
    def _increase_directness(self, text: str) -> str:
        """Increase directness of communication"""
        replacements = {
            'perhaps we could': 'we should',
            'might consider': 'should',
            'possibly': '',
            'maybe we should': 'we need to',
            'it would be nice if': 'please',
            'i was wondering if': 'please'
        }
        
        adapted = text
        for indirect, direct in replacements.items():
            adapted = adapted.replace(indirect, direct)
        
        return adapted
    
    def _generate_cultural_notes(self, source_profile: CulturalProfile, target_profile: CulturalProfile) -> str:
        """Generate cultural notes explaining the adaptation"""
        notes = []
        
        if source_profile.communication_style != target_profile.communication_style:
            notes.append(
                f"Communication style adapted from {source_profile.communication_style} "
                f"to {target_profile.communication_style}"
            )
        
        if source_profile.hierarchy_preference != target_profile.hierarchy_preference:
            notes.append(
                f"Formality adjusted for {target_profile.hierarchy_preference} hierarchy preference"
            )
        
        if source_profile.relationship_focus != target_profile.relationship_focus:
            notes.append(
                f"Approach adapted for {target_profile.relationship_focus} orientation"
            )
        
        return '; '.join(notes) if notes else 'Minor cultural adjustments applied'

class CulturalMismatchDetector:
    """
    Detects potential cultural mismatches in meeting communications
    
    Design Decision: Proactive mismatch detection prevents
    communication issues before they escalate.
    """
    
    def __init__(self):
        self.mismatch_patterns = {
            'hierarchy_clash': {
                'description': 'Different hierarchy expectations detected',
                'triggers': ['direct challenge to authority', 'informal address to senior'],
                'impact': 'medium'
            },
            'time_orientation_conflict': {
                'description': 'Different time orientations may cause friction',
                'triggers': ['strict deadline emphasis', 'relationship building focus'],
                'impact': 'low'
            },
            'communication_style_mismatch': {
                'description': 'Incompatible communication styles',
                'triggers': ['very direct vs very indirect', 'high context vs low context'],
                'impact': 'high'
            },
            'decision_making_conflict': {
                'description': 'Different decision-making preferences',
                'triggers': ['quick individual decision', 'consensus requirement'],
                'impact': 'medium'
            }
        }
    
    async def detect_mismatches(
        self,
        meeting_profiles: List[CulturalProfile],
        meeting_transcripts: List[str],
        context: CulturalContext
    ) -> List[CulturalMismatchAlert]:
        """
        Detect potential cultural mismatches in meeting
        
        Args:
            meeting_profiles: Cultural profiles of participants
            meeting_transcripts: Meeting transcripts
            context: Meeting context
        
        Returns:
            List of cultural mismatch alerts
        """
        alerts = []
        
        # Check for hierarchy mismatches
        hierarchy_alert = self._check_hierarchy_mismatch(meeting_profiles, meeting_transcripts)
        if hierarchy_alert:
            alerts.append(hierarchy_alert)
        
        # Check for communication style mismatches
        comm_alert = self._check_communication_mismatch(meeting_profiles, meeting_transcripts)
        if comm_alert:
            alerts.append(comm_alert)
        
        # Check for decision-making mismatches
        decision_alert = self._check_decision_making_mismatch(meeting_profiles, meeting_transcripts)
        if decision_alert:
            alerts.append(decision_alert)
        
        # Check for time orientation conflicts
        time_alert = self._check_time_orientation_mismatch(meeting_profiles, meeting_transcripts)
        if time_alert:
            alerts.append(time_alert)
        
        return alerts
    
    def _check_hierarchy_mismatch(
        self,
        profiles: List[CulturalProfile],
        transcripts: List[str]
    ) -> Optional[CulturalMismatchAlert]:
        """Check for hierarchy-related mismatches"""
        hierarchy_levels = [p.hierarchy_preference for p in profiles]
        
        if 'high' in hierarchy_levels and 'low' in hierarchy_levels:
            # Check transcripts for potential conflicts
            combined_text = ' '.join(transcripts).lower()
            
            conflict_indicators = [
                'disagree', 'challenge', 'question your decision',
                'i think you\'re wrong', 'that\'s not right'
            ]
            
            conflicts_found = [indicator for indicator in conflict_indicators if indicator in combined_text]
            
            if conflicts_found:
                affected = [p.participant_id for p in profiles if p.hierarchy_preference == 'high']
                
                return CulturalMismatchAlert(
                    alert_type='hierarchy_clash',
                    description='Direct challenges detected in mixed hierarchy meeting',
                    participants_affected=affected,
                    potential_impact='medium',
                    suggested_actions=[
                        'Use more deferential language when addressing senior participants',
                        'Frame disagreements as questions or alternative perspectives',
                        'Allow senior participants to speak first on key topics'
                    ],
                    cultural_explanation='High hierarchy cultures expect respectful deference to authority'
                )
        
        return None
    
    def _check_communication_mismatch(
        self,
        profiles: List[CulturalProfile],
        transcripts: List[str]
    ) -> Optional[CulturalMismatchAlert]:
        """Check for communication style mismatches"""
        styles = [p.communication_style for p in profiles]
        
        if ('direct' in styles and 'high_context' in styles) or ('direct' in styles and 'indirect' in styles):
            # Check for potential misunderstandings
            combined_text = ' '.join(transcripts).lower()
            
            direct_indicators = ['clearly', 'obviously', 'simply', 'must', 'will', 'definitely']
            indirect_indicators = ['perhaps', 'maybe', 'consider', 'might', 'possibly']
            
            direct_count = sum(combined_text.count(indicator) for indicator in direct_indicators)
            indirect_count = sum(combined_text.count(indicator) for indicator in indirect_indicators)
            
            if direct_count > indirect_count * 3:  # Very direct communication
                affected = [p.participant_id for p in profiles if p.communication_style in ['indirect', 'high_context']]
                
                return CulturalMismatchAlert(
                    alert_type='communication_style_mismatch',
                    description='Very direct communication may be uncomfortable for some participants',
                    participants_affected=affected,
                    potential_impact='high',
                    suggested_actions=[
                        'Use softer language when making statements',
                        'Allow time for indirect participants to process and respond',
                        'Check for understanding more frequently'
                    ],
                    cultural_explanation='Indirect cultures prefer nuanced, context-rich communication'
                )
        
        return None
    
    def _check_decision_making_mismatch(
        self,
        profiles: List[CulturalProfile],
        transcripts: List[str]
    ) -> Optional[CulturalMismatchAlert]:
        """Check for decision-making style mismatches"""
        decision_styles = [p.decision_making_style for p in profiles]
        
        if 'consensus' in decision_styles and 'authoritative' in decision_styles:
            combined_text = ' '.join(transcripts).lower()
            
            authoritative_indicators = ['i decide', 'we will', 'the decision is', 'final decision']
            consensus_indicators = ['what do you think', 'consensus', 'everyone agree', 'input']
            
            auth_count = sum(combined_text.count(indicator) for indicator in authoritative_indicators)
            consensus_count = sum(combined_text.count(indicator) for indicator in consensus_indicators)
            
            if auth_count > consensus_count and consensus_count == 0:
                affected = [p.participant_id for p in profiles if p.decision_making_style == 'consensus']
                
                return CulturalMismatchAlert(
                    alert_type='decision_making_conflict',
                    description='Authoritative decisions without consensus input',
                    participants_affected=affected,
                    potential_impact='medium',
                    suggested_actions=[
                        'Ask for input before making final decisions',
                        'Explain the reasoning behind decisions',
                        'Allow time for discussion and feedback'
                    ],
                    cultural_explanation='Consensus cultures expect collaborative decision-making'
                )
        
        return None
    
    def _check_time_orientation_mismatch(
        self,
        profiles: List[CulturalProfile],
        transcripts: List[str]
    ) -> Optional[CulturalMismatchAlert]:
        """Check for time orientation conflicts"""
        time_orientations = [p.time_orientation for p in profiles]
        
        if 'monochronic' in time_orientations and 'polychronic' in time_orientations:
            combined_text = ' '.join(transcripts).lower()
            
            time_pressure_indicators = ['deadline', 'urgent', 'immediately', 'asap', 'time pressure']
            relationship_indicators = ['relationship', 'get to know', 'background', 'personal']
            
            time_pressure = sum(combined_text.count(indicator) for indicator in time_pressure_indicators)
            relationship_focus = sum(combined_text.count(indicator) for indicator in relationship_indicators)
            
            if time_pressure > relationship_focus * 2:
                affected = [p.participant_id for p in profiles if p.time_orientation == 'polychronic']
                
                return CulturalMismatchAlert(
                    alert_type='time_orientation_conflict',
                    description='High time pressure may conflict with relationship-building needs',
                    participants_affected=affected,
                    potential_impact='low',
                    suggested_actions=[
                        'Allow brief relationship-building time at meeting start',
                        'Explain time constraints clearly',
                        'Schedule follow-up for relationship building if needed'
                    ],
                    cultural_explanation='Polychronic cultures value relationships alongside task completion'
                )
        
        return None

class CulturalAdaptationService:
    """
    Main service for cultural context awareness and adaptation
    
    Design Decision: Integrated service combining profiling, adaptation,
    and mismatch detection for comprehensive cultural intelligence.
    
    Key Features:
    - Automatic cultural profiling
    - Real-time adaptation suggestions
    - Proactive mismatch detection
    - Cultural rule management
    - Analytics and improvement tracking
    """
    
    def __init__(self, db: Session):
        self.db = db
        self.profile_manager = CulturalProfileManager(db)
        self.adaptation_engine = CulturalAdaptationEngine(db)
        self.mismatch_detector = CulturalMismatchDetector()
    
    async def analyze_meeting_cultural_context(
        self,
        meeting_id: str
    ) -> Dict[str, Any]:
        """
        Comprehensive cultural analysis for a meeting
        
        Args:
            meeting_id: Meeting ID
        
        Returns:
            Cultural analysis results
        """
        # Get meeting transcripts
        transcripts = self.db.query(MultiLanguageTranscript).filter(
            MultiLanguageTranscript.meeting_id == meeting_id
        ).all()
        
        if not transcripts:
            return {'error': 'No transcripts found for meeting'}
        
        # Get participants
        participants = self.db.query(Participant).filter(
            Participant.meeting_id == meeting_id
        ).all()
        
        # Create cultural profiles
        cultural_profiles = []
        for participant in participants:
            # Get participant's transcripts
            participant_transcripts = [
                t.original_text for t in transcripts 
                if t.participant_id == participant.id
            ]
            
            if participant_transcripts:
                # Infer cultural profile
                primary_language = transcripts[0].detected_language  # Simplified
                profile = await self.profile_manager.infer_cultural_profile(
                    participant_transcripts,
                    primary_language,
                    {'id': str(participant.id), 'name': participant.name}
                )
                cultural_profiles.append(profile)
        
        # Detect cultural mismatches
        all_transcript_texts = [t.original_text for t in transcripts]
        mismatches = await self.mismatch_detector.detect_mismatches(
            cultural_profiles,
            all_transcript_texts,
            CulturalContext.BUSINESS_CASUAL
        )
        
        # Generate adaptation suggestions for key communications
        adaptations = []
        if len(cultural_profiles) > 1:
            # Find key statements (simplified - would use more sophisticated selection)
            key_statements = [t for t in all_transcript_texts if len(t) > 50][:5]
            
            for statement in key_statements:
                # Assume first profile is speaker, others are audience
                if cultural_profiles:
                    speaker_profile = cultural_profiles[0]
                    audience_profiles = cultural_profiles[1:]
                    
                    suggestions = await self.adaptation_engine.adapt_text(
                        statement,
                        speaker_profile,
                        audience_profiles,
                        CulturalContext.BUSINESS_CASUAL
                    )
                    
                    adaptations.extend(suggestions)
        
        # Calculate cultural diversity score
        diversity_score = self._calculate_cultural_diversity(cultural_profiles)
        
        return {
            'meeting_id': meeting_id,
            'cultural_profiles': [
                {
                    'participant_id': p.participant_id,
                    'primary_culture': p.primary_culture,
                    'communication_style': p.communication_style,
                    'hierarchy_preference': p.hierarchy_preference,
                    'formality_preference': p.formality_preference
                }
                for p in cultural_profiles
            ],
            'cultural_mismatches': [
                {
                    'type': m.alert_type,
                    'description': m.description,
                    'impact': m.potential_impact,
                    'suggestions': m.suggested_actions,
                    'explanation': m.cultural_explanation
                }
                for m in mismatches
            ],
            'adaptation_suggestions': [
                {
                    'original_text': a.original_text,
                    'adapted_text': a.adapted_text,
                    'target_culture': a.target_culture,
                    'reasoning': a.reasoning,
                    'confidence': a.confidence
                }
                for a in adaptations
            ],
            'cultural_diversity_score': diversity_score,
            'recommendations': self._generate_overall_recommendations(
                cultural_profiles, mismatches, adaptations
            )
        }
    
    def _calculate_cultural_diversity(self, profiles: List[CulturalProfile]) -> float:
        """Calculate cultural diversity score for the meeting"""
        if len(profiles) <= 1:
            return 0.0
        
        # Count unique values for each cultural dimension
        unique_cultures = len(set(p.primary_culture for p in profiles))
        unique_comm_styles = len(set(p.communication_style for p in profiles))
        unique_hierarchy = len(set(p.hierarchy_preference for p in profiles))
        unique_formality = len(set(p.formality_preference for p in profiles))
        
        # Calculate diversity score (0-1)
        max_diversity = len(profiles)
        actual_diversity = (unique_cultures + unique_comm_styles + unique_hierarchy + unique_formality) / 4
        
        return min(actual_diversity / max_diversity, 1.0)
    
    def _generate_overall_recommendations(
        self,
        profiles: List[CulturalProfile],
        mismatches: List[CulturalMismatchAlert],
        adaptations: List[AdaptationSuggestion]
    ) -> List[str]:
        """Generate overall recommendations for the meeting"""
        recommendations = []
        
        # Base recommendations on cultural diversity
        if len(set(p.primary_culture for p in profiles)) > 2:
            recommendations.append(
                "High cultural diversity detected. Allow extra time for clarification and understanding."
            )
        
        # Recommendations based on mismatches
        if any(m.potential_impact == 'high' for m in mismatches):
            recommendations.append(
                "High-impact cultural mismatches detected. Consider cultural mediation or adaptation strategies."
            )
        
        # Recommendations based on adaptations
        if len(adaptations) > 3:
            recommendations.append(
                "Multiple cultural adaptations suggested. Consider providing summaries in multiple styles."
            )
        
        # Communication style recommendations
        comm_styles = [p.communication_style for p in profiles]
        if 'direct' in comm_styles and 'indirect' in comm_styles:
            recommendations.append(
                "Mix of direct and indirect communicators. Balance explicit information with context."
            )
        
        return recommendations if recommendations else [
            "Meeting shows good cultural alignment. Continue with current communication approach."
        ]