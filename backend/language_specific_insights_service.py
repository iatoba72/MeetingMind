# Language-Specific Insights Service
# Generate culturally-aware and language-specific insights from multilingual meetings

from typing import List, Dict, Optional, Any, Tuple
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
import json
from dataclasses import dataclass
from enum import Enum

from i18n_models import (
    Language,
    MultiLanguageTranscript,
    CulturalContextRule,
    LanguageCode,
    CulturalContext,
)
from models import Meeting, AIInsight, Participant
from database import get_db


@dataclass
class LanguageInsightConfig:
    """Configuration for language-specific insight generation"""

    language: LanguageCode
    cultural_context: CulturalContext
    include_cultural_nuances: bool = True
    include_language_patterns: bool = True
    include_communication_style: bool = True
    formality_analysis: bool = True
    sentiment_by_culture: bool = True


@dataclass
class CulturalInsight:
    """Cultural insight with language-specific analysis"""

    insight_type: str
    title: str
    description: str
    language: LanguageCode
    cultural_context: CulturalContext
    confidence: float
    evidence: List[str]
    recommendations: List[str]
    cultural_notes: Dict[str, Any]


@dataclass
class LanguagePatternAnalysis:
    """Analysis of language patterns in meeting"""

    language: LanguageCode
    formality_level: str
    communication_style: str
    key_phrases: List[str]
    sentence_complexity: float
    technical_terms: List[str]
    emotional_markers: List[str]
    cultural_references: List[str]


@dataclass
class MultilingualInsightSummary:
    """Summary of insights across all languages in meeting"""

    meeting_id: str
    languages_analyzed: List[LanguageCode]
    cultural_insights: List[CulturalInsight]
    language_patterns: Dict[LanguageCode, LanguagePatternAnalysis]
    cross_cultural_observations: List[str]
    communication_effectiveness: float
    recommendations: List[str]


class CulturalAnalyzer:
    """
    Analyzes cultural context and communication patterns

    Design Decision: Deep cultural analysis enables better understanding
    of communication effectiveness across different cultural backgrounds.
    """

    def __init__(self, db: Session):
        self.db = db

        # Cultural communication patterns
        self.communication_styles = {
            "direct": {
                "markers": ["clearly", "obviously", "simply", "definitely"],
                "sentence_patterns": ["imperative", "declarative"],
                "cultures": ["de", "nl", "en-us"],
            },
            "indirect": {
                "markers": ["perhaps", "maybe", "possibly", "might"],
                "sentence_patterns": ["conditional", "subjunctive"],
                "cultures": ["ja", "ko", "th"],
            },
            "high_context": {
                "markers": ["understand", "appreciate", "consider"],
                "sentence_patterns": ["complex", "embedded"],
                "cultures": ["ja", "ar", "zh"],
            },
            "low_context": {
                "markers": ["specifically", "exactly", "precisely"],
                "sentence_patterns": ["simple", "explicit"],
                "cultures": ["en", "de", "sv"],
            },
        }

        # Hierarchy patterns by culture
        self.hierarchy_markers = {
            "high_hierarchy": {
                "honorifics": ["sir", "madam", "sensei", "san"],
                "formal_address": True,
                "deference_language": ["please consider", "with respect", "humbly"],
                "cultures": ["ja", "ko", "th", "in"],
            },
            "low_hierarchy": {
                "first_names": True,
                "direct_questions": True,
                "challenge_language": ["disagree", "question", "alternative"],
                "cultures": ["en-us", "au", "dk", "se"],
            },
        }

    async def analyze_cultural_context(
        self,
        transcript: MultiLanguageTranscript,
        participant_info: Optional[Dict] = None,
    ) -> List[CulturalInsight]:
        """
        Analyze cultural context of a transcript

        Args:
            transcript: Transcript to analyze
            participant_info: Additional participant information

        Returns:
            List of cultural insights
        """
        insights = []

        # Communication style analysis
        comm_style_insight = await self._analyze_communication_style(
            transcript.original_text,
            transcript.detected_language,
            transcript.cultural_context,
        )
        if comm_style_insight:
            insights.append(comm_style_insight)

        # Hierarchy and formality analysis
        hierarchy_insight = await self._analyze_hierarchy_patterns(
            transcript.original_text, transcript.detected_language, participant_info
        )
        if hierarchy_insight:
            insights.append(hierarchy_insight)

        # Emotional expression analysis
        emotion_insight = await self._analyze_emotional_expression(
            transcript.original_text,
            transcript.detected_language,
            transcript.cultural_context,
        )
        if emotion_insight:
            insights.append(emotion_insight)

        # Decision-making style analysis
        decision_insight = await self._analyze_decision_making_style(
            transcript.original_text, transcript.detected_language
        )
        if decision_insight:
            insights.append(decision_insight)

        return insights

    async def _analyze_communication_style(
        self,
        text: str,
        language: LanguageCode,
        cultural_context: Optional[CulturalContext],
    ) -> Optional[CulturalInsight]:
        """Analyze communication style patterns"""
        text_lower = text.lower()

        # Count style markers
        style_scores = {}
        for style, patterns in self.communication_styles.items():
            score = 0
            for marker in patterns["markers"]:
                score += text_lower.count(marker)
            style_scores[style] = score

        if not any(style_scores.values()):
            return None

        # Determine dominant style
        dominant_style = max(style_scores, key=style_scores.get)
        confidence = style_scores[dominant_style] / max(sum(style_scores.values()), 1)

        # Generate insights
        evidence = []
        recommendations = []

        if dominant_style == "direct":
            evidence.append("Uses direct language patterns and clear statements")
            recommendations.append("Continue with clear, explicit communication")
        elif dominant_style == "indirect":
            evidence.append("Uses indirect language and conditional statements")
            recommendations.append("Consider more explicit statements for clarity")

        return CulturalInsight(
            insight_type="communication_style",
            title=f"Communication Style: {dominant_style.replace('_', ' ').title()}",
            description=f"Speaker demonstrates {dominant_style.replace('_', ' ')} communication patterns",
            language=language,
            cultural_context=cultural_context or CulturalContext.BUSINESS_CASUAL,
            confidence=confidence,
            evidence=evidence,
            recommendations=recommendations,
            cultural_notes={
                "style": dominant_style,
                "typical_cultures": self.communication_styles[dominant_style][
                    "cultures"
                ],
            },
        )

    async def _analyze_hierarchy_patterns(
        self, text: str, language: LanguageCode, participant_info: Optional[Dict]
    ) -> Optional[CulturalInsight]:
        """Analyze hierarchy and power distance patterns"""
        text_lower = text.lower()

        # Look for hierarchy markers
        high_hierarchy_score = 0
        low_hierarchy_score = 0

        # Check for honorifics and formal address
        for honorific in self.hierarchy_markers["high_hierarchy"]["honorifics"]:
            high_hierarchy_score += text_lower.count(honorific)

        for deference in self.hierarchy_markers["high_hierarchy"]["deference_language"]:
            high_hierarchy_score += text_lower.count(deference)

        # Check for low hierarchy markers
        if any(
            word in text_lower
            for word in self.hierarchy_markers["low_hierarchy"]["challenge_language"]
        ):
            low_hierarchy_score += 1

        if high_hierarchy_score == 0 and low_hierarchy_score == 0:
            return None

        # Determine hierarchy style
        if high_hierarchy_score > low_hierarchy_score:
            hierarchy_style = "high_hierarchy"
            confidence = high_hierarchy_score / (
                high_hierarchy_score + low_hierarchy_score
            )
        else:
            hierarchy_style = "low_hierarchy"
            confidence = low_hierarchy_score / (
                high_hierarchy_score + low_hierarchy_score
            )

        return CulturalInsight(
            insight_type="hierarchy_awareness",
            title=f"Hierarchy Orientation: {hierarchy_style.replace('_', ' ').title()}",
            description=f"Communication shows {hierarchy_style.replace('_', ' ')} cultural patterns",
            language=language,
            cultural_context=CulturalContext.BUSINESS_FORMAL,
            confidence=confidence,
            evidence=[
                f"Contains {hierarchy_style.replace('_', ' ')} communication markers"
            ],
            recommendations=[
                f"Adapt communication style to match {hierarchy_style.replace('_', ' ')} preferences"
            ],
            cultural_notes={
                "hierarchy_style": hierarchy_style,
                "typical_cultures": self.hierarchy_markers[hierarchy_style]["cultures"],
            },
        )

    async def _analyze_emotional_expression(
        self,
        text: str,
        language: LanguageCode,
        cultural_context: Optional[CulturalContext],
    ) -> Optional[CulturalInsight]:
        """Analyze emotional expression patterns by culture"""
        # Different cultures express emotions differently
        emotion_patterns = {
            "expressive": {
                "markers": ["excited", "amazing", "fantastic", "terrible", "awful"],
                "cultures": ["es", "it", "pt", "ar"],
            },
            "restrained": {
                "markers": ["satisfactory", "adequate", "reasonable", "acceptable"],
                "cultures": ["ja", "fi", "no", "dk"],
            },
            "balanced": {
                "markers": ["good", "fine", "okay", "nice", "pleasant"],
                "cultures": ["en", "fr", "de"],
            },
        }

        text_lower = text.lower()
        emotion_scores = {}

        for style, patterns in emotion_patterns.items():
            score = sum(text_lower.count(marker) for marker in patterns["markers"])
            emotion_scores[style] = score

        if not any(emotion_scores.values()):
            return None

        dominant_style = max(emotion_scores, key=emotion_scores.get)
        confidence = emotion_scores[dominant_style] / sum(emotion_scores.values())

        return CulturalInsight(
            insight_type="emotional_expression",
            title=f"Emotional Expression: {dominant_style.title()}",
            description=f"Speaker uses {dominant_style} emotional expression patterns",
            language=language,
            cultural_context=cultural_context or CulturalContext.BUSINESS_CASUAL,
            confidence=confidence,
            evidence=[f"Uses {dominant_style} emotional language patterns"],
            recommendations=[
                f"Consider cultural expectations for {dominant_style} emotional expression"
            ],
            cultural_notes={
                "expression_style": dominant_style,
                "typical_cultures": emotion_patterns[dominant_style]["cultures"],
            },
        )

    async def _analyze_decision_making_style(
        self, text: str, language: LanguageCode
    ) -> Optional[CulturalInsight]:
        """Analyze decision-making communication patterns"""
        decision_patterns = {
            "consensus_seeking": {
                "markers": ["what do you think", "should we", "consensus", "agreement"],
                "cultures": ["ja", "se", "nl"],
            },
            "authoritative": {
                "markers": ["we will", "i decide", "the decision is", "must"],
                "cultures": ["de", "fr", "ru"],
            },
            "collaborative": {
                "markers": ["let's discuss", "input", "feedback", "together"],
                "cultures": ["en-us", "ca", "au"],
            },
        }

        text_lower = text.lower()
        decision_scores = {}

        for style, patterns in decision_patterns.items():
            score = sum(text_lower.count(marker) for marker in patterns["markers"])
            decision_scores[style] = score

        if not any(decision_scores.values()):
            return None

        dominant_style = max(decision_scores, key=decision_scores.get)
        confidence = decision_scores[dominant_style] / sum(decision_scores.values())

        return CulturalInsight(
            insight_type="decision_making",
            title=f"Decision Making: {dominant_style.replace('_', ' ').title()}",
            description=f"Demonstrates {dominant_style.replace('_', ' ')} decision-making patterns",
            language=language,
            cultural_context=CulturalContext.BUSINESS_FORMAL,
            confidence=confidence,
            evidence=[f"Uses {dominant_style.replace('_', ' ')} language patterns"],
            recommendations=[
                f"Align decision-making process with {dominant_style.replace('_', ' ')} approach"
            ],
            cultural_notes={
                "decision_style": dominant_style,
                "typical_cultures": decision_patterns[dominant_style]["cultures"],
            },
        )


class LanguagePatternAnalyzer:
    """
    Analyzes language-specific patterns and characteristics

    Design Decision: Language-specific analysis provides insights into
    communication effectiveness and style within each language context.
    """

    def __init__(self):
        # Language-specific patterns
        self.formality_markers = {
            "en": {
                "formal": ["shall", "would", "please", "kindly", "respectfully"],
                "informal": ["gonna", "wanna", "yeah", "ok", "cool"],
            },
            "es": {
                "formal": ["usted", "le agradezco", "por favor", "disculpe"],
                "informal": ["tú", "qué tal", "vale", "bueno"],
            },
            "fr": {
                "formal": ["vous", "monsieur", "madame", "veuillez"],
                "informal": ["tu", "salut", "ça va", "ok"],
            },
            "de": {
                "formal": ["sie", "bitte", "danke schön", "entschuldigung"],
                "informal": ["du", "hi", "tschüss", "ok"],
            },
        }

        self.technical_indicators = {
            "business": ["revenue", "profit", "market", "strategy", "objectives"],
            "technical": ["algorithm", "database", "API", "framework", "deployment"],
            "academic": ["research", "study", "hypothesis", "methodology", "analysis"],
            "creative": ["design", "concept", "inspiration", "aesthetic", "vision"],
        }

    async def analyze_language_patterns(
        self, text: str, language: LanguageCode
    ) -> LanguagePatternAnalysis:
        """
        Analyze language-specific patterns in text

        Args:
            text: Text to analyze
            language: Language of the text

        Returns:
            Language pattern analysis
        """
        # Formality analysis
        formality_level = self._analyze_formality(text, language)

        # Communication style
        communication_style = self._analyze_communication_style(text)

        # Key phrases extraction
        key_phrases = self._extract_key_phrases(text, language)

        # Sentence complexity
        complexity = self._calculate_sentence_complexity(text)

        # Technical terms
        technical_terms = self._identify_technical_terms(text)

        # Emotional markers
        emotional_markers = self._identify_emotional_markers(text, language)

        # Cultural references
        cultural_references = self._identify_cultural_references(text, language)

        return LanguagePatternAnalysis(
            language=language,
            formality_level=formality_level,
            communication_style=communication_style,
            key_phrases=key_phrases,
            sentence_complexity=complexity,
            technical_terms=technical_terms,
            emotional_markers=emotional_markers,
            cultural_references=cultural_references,
        )

    def _analyze_formality(self, text: str, language: LanguageCode) -> str:
        """Analyze formality level of text"""
        lang_code = language.value
        if lang_code not in self.formality_markers:
            lang_code = "en"  # Default to English

        text_lower = text.lower()
        markers = self.formality_markers[lang_code]

        formal_count = sum(text_lower.count(marker) for marker in markers["formal"])
        informal_count = sum(text_lower.count(marker) for marker in markers["informal"])

        if formal_count > informal_count:
            return "formal"
        elif informal_count > formal_count:
            return "informal"
        else:
            return "neutral"

    def _analyze_communication_style(self, text: str) -> str:
        """Analyze overall communication style"""
        # Simple heuristics based on sentence structure and word choice
        sentences = text.split(".")
        avg_sentence_length = sum(len(s.split()) for s in sentences) / len(sentences)

        if avg_sentence_length > 20:
            return "elaborate"
        elif avg_sentence_length < 10:
            return "concise"
        else:
            return "balanced"

    def _extract_key_phrases(self, text: str, language: LanguageCode) -> List[str]:
        """Extract key phrases from text"""
        # Simplified key phrase extraction
        words = text.split()

        # Look for repeated important words
        word_freq = {}
        for word in words:
            word_clean = word.lower().strip(".,!?;:")
            if len(word_clean) > 3:  # Skip short words
                word_freq[word_clean] = word_freq.get(word_clean, 0) + 1

        # Return top frequent words as key phrases
        sorted_words = sorted(word_freq.items(), key=lambda x: x[1], reverse=True)
        return [word for word, freq in sorted_words[:5] if freq > 1]

    def _calculate_sentence_complexity(self, text: str) -> float:
        """Calculate sentence complexity score"""
        sentences = [s.strip() for s in text.split(".") if s.strip()]

        if not sentences:
            return 0.0

        total_complexity = 0
        for sentence in sentences:
            words = sentence.split()
            # Simple complexity based on word count and clause indicators
            clause_indicators = (
                sentence.count(",") + sentence.count(";") + sentence.count(":")
            )
            complexity = len(words) + (clause_indicators * 2)
            total_complexity += complexity

        return total_complexity / len(sentences)

    def _identify_technical_terms(self, text: str) -> List[str]:
        """Identify technical terms in text"""
        text_lower = text.lower()
        technical_terms = []

        for category, terms in self.technical_indicators.items():
            for term in terms:
                if term in text_lower:
                    technical_terms.append(f"{term} ({category})")

        return technical_terms

    def _identify_emotional_markers(
        self, text: str, language: LanguageCode
    ) -> List[str]:
        """Identify emotional markers in text"""
        # Basic emotional markers (would be more sophisticated in production)
        positive_markers = ["great", "excellent", "amazing", "wonderful", "fantastic"]
        negative_markers = ["terrible", "awful", "bad", "horrible", "disappointing"]

        text_lower = text.lower()
        emotional_markers = []

        for marker in positive_markers:
            if marker in text_lower:
                emotional_markers.append(f"{marker} (positive)")

        for marker in negative_markers:
            if marker in text_lower:
                emotional_markers.append(f"{marker} (negative)")

        return emotional_markers

    def _identify_cultural_references(
        self, text: str, language: LanguageCode
    ) -> List[str]:
        """Identify cultural references in text"""
        # Simple cultural reference detection
        cultural_indicators = {
            "time_references": ["deadline", "schedule", "punctual", "on time"],
            "relationship_focus": ["team", "collaboration", "relationship", "harmony"],
            "achievement_focus": ["goal", "target", "success", "performance"],
            "process_focus": ["procedure", "method", "systematic", "structured"],
        }

        text_lower = text.lower()
        cultural_refs = []

        for category, indicators in cultural_indicators.items():
            for indicator in indicators:
                if indicator in text_lower:
                    cultural_refs.append(f"{indicator} ({category})")

        return cultural_refs


class LanguageSpecificInsightsService:
    """
    Generate culturally-aware and language-specific insights

    Design Decision: Combines language analysis with cultural awareness
    to provide nuanced insights that respect cultural communication norms.

    Key Features:
    - Cultural context analysis
    - Language pattern recognition
    - Cross-cultural communication insights
    - Culturally-appropriate recommendations
    - Communication effectiveness scoring
    """

    def __init__(self, db: Session):
        self.db = db
        self.cultural_analyzer = CulturalAnalyzer(db)
        self.language_analyzer = LanguagePatternAnalyzer()

    async def generate_multilingual_insights(
        self,
        meeting_id: str,
        language_configs: Optional[List[LanguageInsightConfig]] = None,
    ) -> MultilingualInsightSummary:
        """
        Generate comprehensive multilingual insights for a meeting

        Args:
            meeting_id: Meeting ID
            language_configs: Optional language-specific configurations

        Returns:
            Multilingual insight summary
        """
        # Get all transcripts for the meeting
        transcripts = (
            self.db.query(MultiLanguageTranscript)
            .filter(MultiLanguageTranscript.meeting_id == meeting_id)
            .all()
        )

        if not transcripts:
            return MultilingualInsightSummary(
                meeting_id=meeting_id,
                languages_analyzed=[],
                cultural_insights=[],
                language_patterns={},
                cross_cultural_observations=[],
                communication_effectiveness=0.0,
                recommendations=[],
            )

        # Group transcripts by language
        language_groups = {}
        for transcript in transcripts:
            lang = transcript.detected_language
            if lang not in language_groups:
                language_groups[lang] = []
            language_groups[lang].append(transcript)

        # Analyze each language
        all_cultural_insights = []
        language_patterns = {}

        for language, lang_transcripts in language_groups.items():
            # Combine text for language analysis
            combined_text = " ".join(t.original_text for t in lang_transcripts)

            # Language pattern analysis
            patterns = await self.language_analyzer.analyze_language_patterns(
                combined_text, language
            )
            language_patterns[language] = patterns

            # Cultural insights for each transcript
            for transcript in lang_transcripts:
                insights = await self.cultural_analyzer.analyze_cultural_context(
                    transcript
                )
                all_cultural_insights.extend(insights)

        # Cross-cultural observations
        cross_cultural_obs = await self._generate_cross_cultural_observations(
            language_groups, all_cultural_insights
        )

        # Communication effectiveness
        effectiveness = self._calculate_communication_effectiveness(
            all_cultural_insights, language_patterns
        )

        # Generate recommendations
        recommendations = self._generate_recommendations(
            all_cultural_insights, language_patterns, cross_cultural_obs
        )

        return MultilingualInsightSummary(
            meeting_id=meeting_id,
            languages_analyzed=list(language_groups.keys()),
            cultural_insights=all_cultural_insights,
            language_patterns=language_patterns,
            cross_cultural_observations=cross_cultural_obs,
            communication_effectiveness=effectiveness,
            recommendations=recommendations,
        )

    async def _generate_cross_cultural_observations(
        self,
        language_groups: Dict[LanguageCode, List[MultiLanguageTranscript]],
        cultural_insights: List[CulturalInsight],
    ) -> List[str]:
        """Generate cross-cultural observations"""
        observations = []

        if len(language_groups) > 1:
            observations.append(
                f"Meeting involves {len(language_groups)} languages: "
                f"{', '.join([lang.value for lang in language_groups.keys()])}"
            )

            # Analyze communication style diversity
            styles = set()
            for insight in cultural_insights:
                if insight.insight_type == "communication_style":
                    styles.add(insight.cultural_notes.get("style", "unknown"))

            if len(styles) > 1:
                observations.append(
                    f"Multiple communication styles present: {', '.join(styles)}. "
                    "Consider adapting approach for different participants."
                )

            # Hierarchy awareness
            hierarchy_styles = set()
            for insight in cultural_insights:
                if insight.insight_type == "hierarchy_awareness":
                    hierarchy_styles.add(
                        insight.cultural_notes.get("hierarchy_style", "unknown")
                    )

            if len(hierarchy_styles) > 1:
                observations.append(
                    "Different hierarchy expectations detected. "
                    "Be mindful of varying formality preferences."
                )

        return observations

    def _calculate_communication_effectiveness(
        self,
        cultural_insights: List[CulturalInsight],
        language_patterns: Dict[LanguageCode, LanguagePatternAnalysis],
    ) -> float:
        """Calculate overall communication effectiveness score"""
        if not cultural_insights and not language_patterns:
            return 0.0

        total_score = 0.0
        factors = 0

        # Cultural insight confidence
        if cultural_insights:
            avg_confidence = sum(
                insight.confidence for insight in cultural_insights
            ) / len(cultural_insights)
            total_score += avg_confidence
            factors += 1

        # Language complexity appropriateness
        if language_patterns:
            complexity_scores = []
            for patterns in language_patterns.values():
                # Ideal complexity is moderate (not too simple, not too complex)
                ideal_complexity = 15.0
                complexity_score = (
                    1.0
                    - abs(patterns.sentence_complexity - ideal_complexity)
                    / ideal_complexity
                )
                complexity_scores.append(max(0.0, complexity_score))

            if complexity_scores:
                avg_complexity_score = sum(complexity_scores) / len(complexity_scores)
                total_score += avg_complexity_score
                factors += 1

        return total_score / factors if factors > 0 else 0.0

    def _generate_recommendations(
        self,
        cultural_insights: List[CulturalInsight],
        language_patterns: Dict[LanguageCode, LanguagePatternAnalysis],
        cross_cultural_obs: List[str],
    ) -> List[str]:
        """Generate actionable recommendations"""
        recommendations = []

        # Cultural recommendations
        cultural_recs = set()
        for insight in cultural_insights:
            cultural_recs.update(insight.recommendations)

        recommendations.extend(list(cultural_recs))

        # Language pattern recommendations
        for language, patterns in language_patterns.items():
            if patterns.formality_level == "informal" and any(
                "formal" in obs.lower() for obs in cross_cultural_obs
            ):
                recommendations.append(
                    f"Consider using more formal language when addressing participants "
                    f"from high-hierarchy cultures"
                )

            if patterns.sentence_complexity > 20:
                recommendations.append(
                    f"Simplify sentence structure in {language.value} for better clarity"
                )
            elif patterns.sentence_complexity < 8:
                recommendations.append(
                    f"Consider more detailed explanations in {language.value} when discussing complex topics"
                )

        # Cross-cultural recommendations
        if len(language_patterns) > 1:
            recommendations.append(
                "Provide summaries in multiple languages for key decisions"
            )
            recommendations.append(
                "Allow extra time for clarification across language barriers"
            )

        return list(set(recommendations))  # Remove duplicates

    async def save_insights_to_database(
        self, summary: MultilingualInsightSummary
    ) -> List[str]:
        """
        Save generated insights to database

        Args:
            summary: Multilingual insight summary

        Returns:
            List of created insight IDs
        """
        insight_ids = []

        # Save cultural insights
        for cultural_insight in summary.cultural_insights:
            ai_insight = AIInsight(
                meeting_id=summary.meeting_id,
                insight_type=cultural_insight.insight_type,
                title=cultural_insight.title,
                description=cultural_insight.description,
                confidence_score=cultural_insight.confidence,
                metadata={
                    "language": cultural_insight.language.value,
                    "cultural_context": (
                        cultural_insight.cultural_context.value
                        if cultural_insight.cultural_context
                        else None
                    ),
                    "evidence": cultural_insight.evidence,
                    "recommendations": cultural_insight.recommendations,
                    "cultural_notes": cultural_insight.cultural_notes,
                },
            )

            self.db.add(ai_insight)
            self.db.flush()
            insight_ids.append(str(ai_insight.id))

        # Save language pattern insights
        for language, patterns in summary.language_patterns.items():
            pattern_insight = AIInsight(
                meeting_id=summary.meeting_id,
                insight_type="language_patterns",
                title=f"Language Patterns - {language.value.upper()}",
                description=f"Communication patterns and style analysis for {language.value}",
                confidence_score=0.8,  # High confidence for pattern analysis
                metadata={
                    "language": language.value,
                    "formality_level": patterns.formality_level,
                    "communication_style": patterns.communication_style,
                    "sentence_complexity": patterns.sentence_complexity,
                    "key_phrases": patterns.key_phrases,
                    "technical_terms": patterns.technical_terms,
                    "emotional_markers": patterns.emotional_markers,
                    "cultural_references": patterns.cultural_references,
                },
            )

            self.db.add(pattern_insight)
            self.db.flush()
            insight_ids.append(str(pattern_insight.id))

        # Save cross-cultural summary
        if summary.cross_cultural_observations or summary.recommendations:
            cross_cultural_insight = AIInsight(
                meeting_id=summary.meeting_id,
                insight_type="cross_cultural_analysis",
                title="Cross-Cultural Communication Analysis",
                description="Analysis of communication effectiveness across cultures and languages",
                confidence_score=summary.communication_effectiveness,
                metadata={
                    "languages_analyzed": [
                        lang.value for lang in summary.languages_analyzed
                    ],
                    "cross_cultural_observations": summary.cross_cultural_observations,
                    "recommendations": summary.recommendations,
                    "communication_effectiveness": summary.communication_effectiveness,
                },
            )

            self.db.add(cross_cultural_insight)
            self.db.flush()
            insight_ids.append(str(cross_cultural_insight.id))

        self.db.commit()
        return insight_ids
