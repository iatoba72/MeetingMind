# ML-Based Topic Detection Service for Meeting Insights
# Advanced topic modeling and change detection for automatic insight generation

import asyncio
import json
import re
import time
import uuid
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any, Tuple, Set
from dataclasses import dataclass, asdict
from enum import Enum
import logging
from collections import Counter, defaultdict
import hashlib

import numpy as np
from scipy.spatial.distance import cosine
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.cluster import KMeans
from sklearn.decomposition import LatentDirichletAllocation
from sklearn.metrics.pairwise import cosine_similarity
import nltk
from nltk.corpus import stopwords
from nltk.tokenize import word_tokenize, sent_tokenize
from nltk.stem import WordNetLemmatizer
from nltk.tag import pos_tag
from nltk.chunk import ne_chunk
from nltk.tree import Tree

# Download required NLTK data
try:
    nltk.data.find("tokenizers/punkt")
except LookupError:
    nltk.download("punkt")

try:
    nltk.data.find("corpora/stopwords")
except LookupError:
    nltk.download("stopwords")

try:
    nltk.data.find("corpora/wordnet")
except LookupError:
    nltk.download("wordnet")

try:
    nltk.data.find("taggers/averaged_perceptron_tagger")
except LookupError:
    nltk.download("averaged_perceptron_tagger")

try:
    nltk.data.find("chunkers/maxent_ne_chunker")
except LookupError:
    nltk.download("maxent_ne_chunker")

try:
    nltk.data.find("corpora/words")
except LookupError:
    nltk.download("words")


class TopicChangeType(Enum):
    """Types of topic changes detected in meetings"""

    GRADUAL_SHIFT = "gradual_shift"  # Topic slowly evolves
    ABRUPT_CHANGE = "abrupt_change"  # Sudden topic change
    TANGENT = "tangent"  # Brief off-topic discussion
    RETURN = "return"  # Return to previous topic
    SUBTOPIC = "subtopic"  # Deep dive into subtopic
    NEW_TOPIC = "new_topic"  # Completely new topic introduced


class TopicConfidence(Enum):
    """Confidence levels for topic detection"""

    LOW = "low"  # 0.0 - 0.4
    MEDIUM = "medium"  # 0.4 - 0.7
    HIGH = "high"  # 0.7 - 0.9
    VERY_HIGH = "very_high"  # 0.9 - 1.0


@dataclass
class TopicKeywords:
    """Keywords and phrases associated with a topic"""

    primary_keywords: List[str]  # Main topic keywords
    secondary_keywords: List[str]  # Supporting keywords
    entities: List[str]  # Named entities
    phrases: List[str]  # Key phrases
    sentiment_words: List[str]  # Emotional/sentiment words


@dataclass
class DetectedTopic:
    """A detected topic with metadata"""

    id: str
    label: str  # Human-readable topic name
    keywords: TopicKeywords
    confidence: float  # 0.0 - 1.0
    confidence_level: TopicConfidence
    start_time: float  # Start time in meeting
    end_time: Optional[float]  # End time (if topic has ended)
    duration: Optional[float]  # Duration in seconds
    speaker_distribution: Dict[str, float]  # Speaking time per speaker
    segment_count: int  # Number of text segments
    coherence_score: float  # Topic coherence measure
    importance_score: float  # Topic importance in meeting context
    context_similarity: float  # Similarity to meeting context
    related_topics: List[str]  # IDs of related topics


@dataclass
class TopicTransition:
    """Information about a topic change"""

    id: str
    from_topic_id: Optional[str]
    to_topic_id: str
    transition_type: TopicChangeType
    transition_time: float
    confidence: float
    trigger_text: str  # Text that triggered the transition
    speaker: Optional[str]  # Speaker who caused transition
    context_window: List[str]  # Surrounding text segments
    semantic_distance: float  # Distance between topics
    transition_markers: List[str]  # Phrases that indicate transition


@dataclass
class MeetingTopicAnalysis:
    """Complete topic analysis for a meeting"""

    meeting_id: str
    session_id: str
    topics: List[DetectedTopic]
    transitions: List[TopicTransition]
    topic_timeline: List[Tuple[float, str]]  # (time, topic_id)
    dominant_topics: List[str]  # Most important topics
    topic_coherence: float  # Overall coherence score
    topic_diversity: float  # How diverse the topics are
    focus_score: float  # How focused the meeting was
    analysis_timestamp: datetime
    processing_time_ms: float


class TopicDetectionService:
    """
    Advanced ML-based topic detection service for meeting insights

    Features:
    - Real-time topic detection and tracking
    - Topic change detection with multiple algorithms
    - Semantic similarity analysis
    - Named entity recognition
    - Topic coherence scoring
    - Speaker-topic correlation
    - Context-aware topic labeling
    """

    def __init__(
        self,
        similarity_threshold: float = 0.3,
        change_threshold: float = 0.5,
        min_topic_duration: float = 30.0,
        max_topics: int = 10,
    ):
        """
        Initialize the topic detection service

        Args:
            similarity_threshold: Minimum similarity for topic continuity
            change_threshold: Threshold for detecting topic changes
            min_topic_duration: Minimum duration for a valid topic (seconds)
            max_topics: Maximum number of topics to track simultaneously
        """
        self.similarity_threshold = similarity_threshold
        self.change_threshold = change_threshold
        self.min_topic_duration = min_topic_duration
        self.max_topics = max_topics

        # Initialize NLP components
        self.lemmatizer = WordNetLemmatizer()
        self.stop_words = set(stopwords.words("english"))

        # Add meeting-specific stop words
        self.stop_words.update(
            [
                "meeting",
                "discussion",
                "talk",
                "discuss",
                "say",
                "said",
                "think",
                "thought",
                "know",
                "see",
                "look",
                "well",
                "okay",
                "alright",
                "yeah",
                "yes",
                "sure",
                "right",
                "like",
                "um",
                "uh",
            ]
        )

        # Initialize vectorizers
        self.tfidf_vectorizer = TfidfVectorizer(
            max_features=1000,
            stop_words="english",
            ngram_range=(1, 3),
            min_df=1,
            max_df=0.8,
        )

        # Topic models
        self.lda_model = None
        self.kmeans_model = None

        # Active sessions
        self.active_sessions: Dict[str, Dict] = {}

        # Predefined topic categories for better labeling
        self.topic_categories = {
            "technical": [
                "system",
                "software",
                "code",
                "development",
                "bug",
                "feature",
                "api",
                "database",
            ],
            "business": [
                "revenue",
                "sales",
                "customer",
                "market",
                "strategy",
                "budget",
                "profit",
                "growth",
            ],
            "project": [
                "deadline",
                "milestone",
                "task",
                "sprint",
                "release",
                "delivery",
                "timeline",
            ],
            "team": [
                "hire",
                "team",
                "staff",
                "resource",
                "role",
                "responsibility",
                "collaboration",
            ],
            "product": [
                "feature",
                "design",
                "user",
                "interface",
                "experience",
                "feedback",
                "requirement",
            ],
            "finance": [
                "cost",
                "budget",
                "expense",
                "investment",
                "funding",
                "price",
                "financial",
            ],
            "operations": [
                "process",
                "workflow",
                "efficiency",
                "automation",
                "infrastructure",
                "scaling",
            ],
            "legal": [
                "contract",
                "compliance",
                "regulation",
                "policy",
                "agreement",
                "legal",
                "terms",
            ],
        }

        self.logger = logging.getLogger(__name__)

    async def create_session(
        self, meeting_id: str, session_config: Dict[str, Any] = None
    ) -> str:
        """Create a new topic detection session for a meeting"""
        session_id = f"topic_session_{uuid.uuid4().hex}"

        config = session_config or {}

        session_data = {
            "session_id": session_id,
            "meeting_id": meeting_id,
            "created_at": datetime.now(),
            "config": {
                "similarity_threshold": config.get(
                    "similarity_threshold", self.similarity_threshold
                ),
                "change_threshold": config.get(
                    "change_threshold", self.change_threshold
                ),
                "min_topic_duration": config.get(
                    "min_topic_duration", self.min_topic_duration
                ),
                "enable_entity_recognition": config.get(
                    "enable_entity_recognition", True
                ),
                "enable_sentiment_analysis": config.get(
                    "enable_sentiment_analysis", True
                ),
                "topic_labeling_mode": config.get(
                    "topic_labeling_mode", "automatic"
                ),  # automatic, manual, hybrid
            },
            "text_segments": [],
            "detected_topics": [],
            "topic_transitions": [],
            "current_topic": None,
            "topic_history": [],
            "speaker_timeline": [],
            "processing_stats": {
                "total_segments": 0,
                "total_processing_time": 0.0,
                "topic_changes_detected": 0,
                "confidence_scores": [],
            },
        }

        self.active_sessions[session_id] = session_data
        self.logger.info(
            f"Created topic detection session {session_id} for meeting {meeting_id}"
        )

        return session_id

    async def process_text_segment(
        self,
        session_id: str,
        text: str,
        timestamp: float,
        speaker: Optional[str] = None,
        metadata: Dict[str, Any] = None,
    ) -> Dict[str, Any]:
        """
        Process a new text segment and update topic detection

        Args:
            session_id: Topic detection session ID
            text: Transcribed text segment
            timestamp: Timestamp of the segment
            speaker: Speaker identifier
            metadata: Additional metadata

        Returns:
            Dict containing topic detection results and any detected changes
        """
        start_time = time.time()

        if session_id not in self.active_sessions:
            raise ValueError(f"Session {session_id} not found")

        session = self.active_sessions[session_id]

        # Preprocess text
        processed_text = self._preprocess_text(text)

        if len(processed_text.strip()) < 10:  # Skip very short segments
            return {
                "topic_change": False,
                "current_topic": session.get("current_topic"),
            }

        # Create segment data
        segment = {
            "id": str(uuid.uuid4()),
            "text": text,
            "processed_text": processed_text,
            "timestamp": timestamp,
            "speaker": speaker,
            "metadata": metadata or {},
            "keywords": self._extract_keywords(processed_text),
            "entities": self._extract_entities(text),
            "sentiment": self._analyze_sentiment(text),
        }

        session["text_segments"].append(segment)
        session["speaker_timeline"].append((timestamp, speaker))

        # Analyze topic change
        topic_analysis = await self._analyze_topic_change(session, segment)

        # Update processing stats
        processing_time = (time.time() - start_time) * 1000
        session["processing_stats"]["total_segments"] += 1
        session["processing_stats"]["total_processing_time"] += processing_time
        session["processing_stats"]["confidence_scores"].append(
            topic_analysis.get("confidence", 0.0)
        )

        if topic_analysis.get("topic_change", False):
            session["processing_stats"]["topic_changes_detected"] += 1

        self.logger.debug(
            f"Processed text segment for session {session_id} in {processing_time:.1f}ms"
        )

        return topic_analysis

    async def _analyze_topic_change(
        self, session: Dict, segment: Dict
    ) -> Dict[str, Any]:
        """Analyze if the new segment represents a topic change"""

        current_topic = session.get("current_topic")
        segments = session["text_segments"]

        if len(segments) < 2:
            # First segment or insufficient data
            if current_topic is None:
                topic = await self._create_new_topic(session, segment)
                session["current_topic"] = topic
                session["detected_topics"].append(topic)
                return {
                    "topic_change": True,
                    "change_type": TopicChangeType.NEW_TOPIC.value,
                    "current_topic": topic,
                    "confidence": topic["confidence"],
                }
            return {"topic_change": False, "current_topic": current_topic}

        # Get recent segments for context (last 5 segments)
        recent_segments = segments[-5:]

        # Calculate semantic similarity with current topic
        similarity = self._calculate_topic_similarity(
            current_topic, segment, recent_segments
        )

        # Detect topic change patterns
        change_indicators = self._detect_change_indicators(segment, recent_segments)

        # Calculate confidence for topic change
        change_confidence = self._calculate_change_confidence(
            similarity, change_indicators, segment, recent_segments
        )

        # Determine if topic change occurred
        topic_changed = False
        change_type = None
        new_topic = None

        if change_confidence > session["config"]["change_threshold"]:
            # Check for different types of topic changes
            if self._is_abrupt_change(segment, recent_segments):
                change_type = TopicChangeType.ABRUPT_CHANGE
            elif self._is_topic_return(session, segment):
                change_type = TopicChangeType.RETURN
            elif similarity < 0.2:
                change_type = TopicChangeType.NEW_TOPIC
            elif similarity < 0.5:
                change_type = TopicChangeType.GRADUAL_SHIFT
            else:
                change_type = TopicChangeType.SUBTOPIC

            # End current topic
            if current_topic:
                current_topic["end_time"] = segment["timestamp"]
                current_topic["duration"] = (
                    current_topic["end_time"] - current_topic["start_time"]
                )

            # Create new topic or return to existing one
            if change_type == TopicChangeType.RETURN:
                new_topic = self._find_returning_topic(session, segment)
            else:
                new_topic = await self._create_new_topic(session, segment)
                session["detected_topics"].append(new_topic)

            # Record transition
            transition = self._create_transition(
                current_topic, new_topic, change_type, segment, change_confidence
            )
            session["topic_transitions"].append(transition)
            session["current_topic"] = new_topic

            topic_changed = True
        else:
            # Update current topic with new information
            if current_topic:
                self._update_current_topic(current_topic, segment)

        return {
            "topic_change": topic_changed,
            "change_type": change_type.value if change_type else None,
            "current_topic": new_topic if new_topic else current_topic,
            "confidence": change_confidence,
            "similarity": similarity,
            "change_indicators": change_indicators,
        }

    def _preprocess_text(self, text: str) -> str:
        """Preprocess text for topic analysis"""
        # Convert to lowercase
        text = text.lower()

        # Remove extra whitespace
        text = re.sub(r"\s+", " ", text).strip()

        # Remove filler words and sounds
        filler_pattern = (
            r"\b(um|uh|ah|er|hmm|well|you know|i mean|like|sort of|kind of)\b"
        )
        text = re.sub(filler_pattern, "", text)

        # Remove punctuation except sentence endings
        text = re.sub(r"[^\w\s\.\!\?]", "", text)

        return text

    def _extract_keywords(self, text: str) -> List[str]:
        """Extract important keywords from text"""
        # Tokenize and get POS tags
        tokens = word_tokenize(text)
        pos_tags = pos_tag(tokens)

        # Keep nouns, verbs, and adjectives
        important_pos = [
            "NN",
            "NNS",
            "NNP",
            "NNPS",
            "VB",
            "VBG",
            "VBN",
            "VBP",
            "VBZ",
            "JJ",
            "JJR",
            "JJS",
        ]
        keywords = []

        for word, pos in pos_tags:
            if (
                pos in important_pos
                and word.lower() not in self.stop_words
                and len(word) > 2
                and word.isalpha()
            ):
                keywords.append(self.lemmatizer.lemmatize(word.lower()))

        # Return most frequent keywords
        keyword_counts = Counter(keywords)
        return [word for word, count in keyword_counts.most_common(10)]

    def _extract_entities(self, text: str) -> List[str]:
        """Extract named entities from text"""
        try:
            tokens = word_tokenize(text)
            pos_tags = pos_tag(tokens)
            chunks = ne_chunk(pos_tags)

            entities = []
            for chunk in chunks:
                if isinstance(chunk, Tree):
                    entity = " ".join([token for token, pos in chunk.leaves()])
                    entities.append(entity)

            return entities
        except Exception as e:
            self.logger.warning(f"Entity extraction failed: {e}")
            return []

    def _analyze_sentiment(self, text: str) -> Dict[str, Any]:
        """Basic sentiment analysis"""
        # Simple keyword-based sentiment analysis
        positive_words = [
            "good",
            "great",
            "excellent",
            "amazing",
            "wonderful",
            "fantastic",
            "positive",
            "agree",
            "yes",
            "success",
        ]
        negative_words = [
            "bad",
            "terrible",
            "awful",
            "horrible",
            "negative",
            "disagree",
            "no",
            "problem",
            "issue",
            "concern",
        ]
        question_words = [
            "what",
            "when",
            "where",
            "why",
            "how",
            "who",
            "which",
            "could",
            "would",
            "should",
        ]

        words = text.lower().split()

        positive_count = sum(1 for word in words if word in positive_words)
        negative_count = sum(1 for word in words if word in negative_words)
        question_count = sum(1 for word in words if word in question_words)

        total_words = len(words)

        return {
            "positive_score": positive_count / max(total_words, 1),
            "negative_score": negative_count / max(total_words, 1),
            "question_score": question_count / max(total_words, 1),
            "sentiment_words": [
                word
                for word in words
                if word in positive_words or word in negative_words
            ],
        }

    def _calculate_topic_similarity(
        self, current_topic: Dict, segment: Dict, recent_segments: List[Dict]
    ) -> float:
        """Calculate semantic similarity between segment and current topic"""
        if not current_topic:
            return 0.0

        try:
            # Combine recent text for context
            recent_text = " ".join(
                [seg["processed_text"] for seg in recent_segments[-3:]]
            )

            # Get topic keywords
            topic_keywords = (
                current_topic["keywords"]["primary_keywords"]
                + current_topic["keywords"]["secondary_keywords"]
            )
            topic_text = " ".join(topic_keywords)

            # Use TF-IDF similarity
            documents = [topic_text, recent_text, segment["processed_text"]]

            if len(set(documents)) < 2:  # All documents are identical
                return 1.0

            tfidf_matrix = self.tfidf_vectorizer.fit_transform(documents)

            # Calculate similarity between topic and segment
            topic_vector = tfidf_matrix[0]
            segment_vector = tfidf_matrix[2]

            similarity = cosine_similarity(topic_vector, segment_vector)[0][0]

            return max(0.0, similarity)  # Ensure non-negative

        except Exception as e:
            self.logger.warning(f"Similarity calculation failed: {e}")
            return 0.0

    def _detect_change_indicators(
        self, segment: Dict, recent_segments: List[Dict]
    ) -> Dict[str, Any]:
        """Detect linguistic indicators of topic change"""
        text = segment["text"].lower()

        # Transition phrases
        transition_phrases = [
            "moving on",
            "next topic",
            "speaking of",
            "by the way",
            "on another note",
            "changing subjects",
            "let's talk about",
            "now let's discuss",
            "shifting gears",
            "different topic",
            "new subject",
            "anyway",
            "meanwhile",
            "also",
            "additionally",
            "furthermore",
            "however",
            "but",
            "wait",
            "actually",
            "oh",
            "so",
        ]

        # Question indicators
        question_starters = [
            "what about",
            "how about",
            "what if",
            "why don't we",
            "should we",
            "can we",
            "could we",
            "would you",
            "do you think",
            "what do you",
        ]

        # Decision/action indicators
        decision_phrases = [
            "let's decide",
            "we need to",
            "action item",
            "to do",
            "follow up",
            "next steps",
            "assign",
            "responsible",
            "deadline",
            "due date",
        ]

        indicators = {
            "has_transition_phrase": any(
                phrase in text for phrase in transition_phrases
            ),
            "starts_with_question": any(
                text.startswith(phrase) for phrase in question_starters
            ),
            "has_decision_language": any(phrase in text for phrase in decision_phrases),
            "speaker_change": False,
            "long_pause": False,
            "keyword_shift": False,
        }

        # Check for speaker change
        if len(recent_segments) > 0:
            last_speaker = recent_segments[-1].get("speaker")
            current_speaker = segment.get("speaker")
            indicators["speaker_change"] = (
                last_speaker != current_speaker and last_speaker is not None
            )

        # Check for keyword shift
        if len(recent_segments) >= 2:
            recent_keywords = set()
            for seg in recent_segments[-2:]:
                recent_keywords.update(seg.get("keywords", []))

            current_keywords = set(segment.get("keywords", []))

            if recent_keywords:
                overlap = len(recent_keywords.intersection(current_keywords))
                total = len(recent_keywords.union(current_keywords))
                keyword_similarity = overlap / max(total, 1)
                indicators["keyword_shift"] = keyword_similarity < 0.3

        return indicators

    def _calculate_change_confidence(
        self,
        similarity: float,
        indicators: Dict,
        segment: Dict,
        recent_segments: List[Dict],
    ) -> float:
        """Calculate confidence score for topic change"""
        # Base confidence from similarity (inverse relationship)
        base_confidence = max(0.0, 1.0 - similarity)

        # Boost from change indicators
        indicator_boost = 0.0

        if indicators["has_transition_phrase"]:
            indicator_boost += 0.3

        if indicators["starts_with_question"]:
            indicator_boost += 0.2

        if indicators["has_decision_language"]:
            indicator_boost += 0.25

        if indicators["speaker_change"]:
            indicator_boost += 0.15

        if indicators["keyword_shift"]:
            indicator_boost += 0.2

        # Text length factor (longer segments are more reliable)
        length_factor = min(1.0, len(segment["text"].split()) / 20.0)

        # Combine factors
        confidence = (base_confidence * 0.6 + indicator_boost * 0.4) * length_factor

        return min(1.0, confidence)

    def _is_abrupt_change(self, segment: Dict, recent_segments: List[Dict]) -> bool:
        """Detect if this is an abrupt topic change"""
        text = segment["text"].lower()

        abrupt_indicators = [
            "wait",
            "stop",
            "hold on",
            "actually",
            "by the way",
            "oh",
            "speaking of",
            "that reminds me",
        ]

        return any(text.startswith(indicator) for indicator in abrupt_indicators)

    def _is_topic_return(self, session: Dict, segment: Dict) -> bool:
        """Check if this segment returns to a previous topic"""
        if len(session["detected_topics"]) < 2:
            return False

        # Compare with previous topics (excluding current one)
        previous_topics = session["detected_topics"][:-1]

        for topic in previous_topics:
            similarity = self._calculate_topic_similarity(topic, segment, [segment])
            if similarity > 0.7:  # High similarity to previous topic
                return True

        return False

    def _find_returning_topic(self, session: Dict, segment: Dict) -> Dict:
        """Find which previous topic this segment returns to"""
        best_topic = None
        best_similarity = 0.0

        previous_topics = session["detected_topics"][:-1]

        for topic in previous_topics:
            similarity = self._calculate_topic_similarity(topic, segment, [segment])
            if similarity > best_similarity:
                best_similarity = similarity
                best_topic = topic

        if best_topic:
            # Update topic with new information
            best_topic["end_time"] = None  # Topic is active again
            self._update_current_topic(best_topic, segment)

        return best_topic

    async def _create_new_topic(self, session: Dict, segment: Dict) -> Dict[str, Any]:
        """Create a new topic from the current segment"""
        topic_id = f"topic_{uuid.uuid4().hex[:8]}"

        keywords = TopicKeywords(
            primary_keywords=segment["keywords"][:5],
            secondary_keywords=segment["keywords"][5:],
            entities=segment["entities"],
            phrases=self._extract_key_phrases(segment["text"]),
            sentiment_words=segment["sentiment"]["sentiment_words"],
        )

        # Generate topic label
        label = self._generate_topic_label(keywords, segment)

        topic = {
            "id": topic_id,
            "label": label,
            "keywords": asdict(keywords),
            "confidence": self._calculate_topic_confidence(segment, [segment]),
            "confidence_level": self._get_confidence_level(0.5),  # Initial confidence
            "start_time": segment["timestamp"],
            "end_time": None,
            "duration": None,
            "speaker_distribution": {segment.get("speaker", "unknown"): 1.0},
            "segment_count": 1,
            "coherence_score": 1.0,  # Single segment is perfectly coherent
            "importance_score": self._calculate_importance_score(keywords, segment),
            "context_similarity": 0.0,  # No context yet
            "related_topics": [],
        }

        return topic

    def _extract_key_phrases(self, text: str) -> List[str]:
        """Extract key phrases from text"""
        # Simple n-gram extraction
        words = text.lower().split()
        phrases = []

        # Extract 2-3 word phrases
        for i in range(len(words) - 1):
            if i < len(words) - 2:
                phrase = " ".join(words[i : i + 3])
                if not any(stop in phrase for stop in self.stop_words):
                    phrases.append(phrase)

            phrase = " ".join(words[i : i + 2])
            if not any(stop in phrase for stop in self.stop_words):
                phrases.append(phrase)

        # Return most common phrases
        phrase_counts = Counter(phrases)
        return [phrase for phrase, count in phrase_counts.most_common(5)]

    def _generate_topic_label(self, keywords: TopicKeywords, segment: Dict) -> str:
        """Generate a human-readable label for the topic"""
        # Try to categorize based on predefined categories
        for category, category_keywords in self.topic_categories.items():
            overlap = len(set(keywords.primary_keywords) & set(category_keywords))
            if overlap > 0:
                # Use most relevant primary keyword with category
                top_keyword = (
                    keywords.primary_keywords[0]
                    if keywords.primary_keywords
                    else category
                )
                return f"{category.title()}: {top_keyword.title()}"

        # Use top keywords if no category match
        if keywords.primary_keywords:
            if len(keywords.primary_keywords) >= 2:
                return f"{keywords.primary_keywords[0].title()} & {keywords.primary_keywords[1].title()}"
            else:
                return keywords.primary_keywords[0].title()

        # Fallback to entities or generic label
        if keywords.entities:
            return f"Discussion: {keywords.entities[0]}"

        return "General Discussion"

    def _calculate_topic_confidence(self, segment: Dict, segments: List[Dict]) -> float:
        """Calculate confidence score for a topic"""
        # Factors that increase confidence:
        # - Number of relevant keywords
        # - Presence of entities
        # - Text length
        # - Coherence across segments

        keyword_score = min(1.0, len(segment["keywords"]) / 10.0)
        entity_score = min(1.0, len(segment["entities"]) / 5.0)
        length_score = min(1.0, len(segment["text"].split()) / 30.0)

        confidence = keyword_score * 0.4 + entity_score * 0.3 + length_score * 0.3

        return max(0.1, confidence)  # Minimum confidence

    def _get_confidence_level(self, confidence: float) -> TopicConfidence:
        """Convert numeric confidence to confidence level enum"""
        if confidence >= 0.9:
            return TopicConfidence.VERY_HIGH
        elif confidence >= 0.7:
            return TopicConfidence.HIGH
        elif confidence >= 0.4:
            return TopicConfidence.MEDIUM
        else:
            return TopicConfidence.LOW

    def _calculate_importance_score(
        self, keywords: TopicKeywords, segment: Dict
    ) -> float:
        """Calculate how important this topic is in the meeting context"""
        # Factors:
        # - Business/technical keywords
        # - Decision language
        # - Action items
        # - Frequency of keywords

        important_domains = ["business", "technical", "project", "finance"]

        importance = 0.0

        for domain in important_domains:
            domain_keywords = self.topic_categories.get(domain, [])
            overlap = len(set(keywords.primary_keywords) & set(domain_keywords))
            importance += overlap * 0.25

        # Boost for action/decision language
        decision_words = [
            "decide",
            "action",
            "assign",
            "deadline",
            "priority",
            "important",
        ]
        decision_overlap = len(set(keywords.primary_keywords) & set(decision_words))
        importance += decision_overlap * 0.3

        return min(1.0, importance)

    def _update_current_topic(self, topic: Dict, segment: Dict):
        """Update current topic with new segment information"""
        # Update speaker distribution
        speaker = segment.get("speaker", "unknown")
        if speaker not in topic["speaker_distribution"]:
            topic["speaker_distribution"][speaker] = 0

        total_segments = topic["segment_count"] + 1
        topic["speaker_distribution"][speaker] += 1.0 / total_segments

        # Normalize speaker distribution
        total_speaking = sum(topic["speaker_distribution"].values())
        for spk in topic["speaker_distribution"]:
            topic["speaker_distribution"][spk] /= total_speaking

        # Update segment count
        topic["segment_count"] += 1

        # Update keywords with new information
        new_keywords = segment["keywords"]
        current_keywords = topic["keywords"]["primary_keywords"]

        # Merge keywords (keeping most frequent)
        combined_keywords = current_keywords + new_keywords
        keyword_counts = Counter(combined_keywords)
        topic["keywords"]["primary_keywords"] = [
            k for k, c in keyword_counts.most_common(10)
        ]

        # Update entities
        if segment["entities"]:
            current_entities = topic["keywords"]["entities"]
            combined_entities = list(set(current_entities + segment["entities"]))
            topic["keywords"]["entities"] = combined_entities[:10]

    def _create_transition(
        self,
        from_topic: Optional[Dict],
        to_topic: Dict,
        change_type: TopicChangeType,
        segment: Dict,
        confidence: float,
    ) -> Dict[str, Any]:
        """Create a topic transition record"""
        return {
            "id": f"transition_{uuid.uuid4().hex[:8]}",
            "from_topic_id": from_topic["id"] if from_topic else None,
            "to_topic_id": to_topic["id"],
            "transition_type": change_type.value,
            "transition_time": segment["timestamp"],
            "confidence": confidence,
            "trigger_text": (
                segment["text"][:200] + "..."
                if len(segment["text"]) > 200
                else segment["text"]
            ),
            "speaker": segment.get("speaker"),
            "context_window": [segment["text"]],  # Could include more context
            "semantic_distance": 1.0 - confidence,  # Inverse relationship
            "transition_markers": self._find_transition_markers(segment["text"]),
        }

    def _find_transition_markers(self, text: str) -> List[str]:
        """Find phrases that indicate topic transitions"""
        transition_markers = [
            "moving on",
            "next topic",
            "speaking of",
            "by the way",
            "on another note",
            "changing subjects",
            "let's talk about",
            "now let's discuss",
            "shifting gears",
            "different topic",
            "new subject",
            "anyway",
            "meanwhile",
            "also",
        ]

        found_markers = []
        text_lower = text.lower()

        for marker in transition_markers:
            if marker in text_lower:
                found_markers.append(marker)

        return found_markers

    async def get_session_analysis(
        self, session_id: str
    ) -> Optional[MeetingTopicAnalysis]:
        """Get complete topic analysis for a session"""
        if session_id not in self.active_sessions:
            return None

        session = self.active_sessions[session_id]

        # Calculate overall metrics
        topics = session["detected_topics"]
        transitions = session["topic_transitions"]

        # Create topic timeline
        timeline = []
        for topic in topics:
            timeline.append((topic["start_time"], topic["id"]))
        timeline.sort(key=lambda x: x[0])

        # Identify dominant topics
        dominant_topics = sorted(
            topics,
            key=lambda t: t["importance_score"] * t["segment_count"],
            reverse=True,
        )[:3]

        # Calculate coherence and focus scores
        topic_coherence = (
            np.mean([t["coherence_score"] for t in topics]) if topics else 0.0
        )
        topic_diversity = len(topics) / max(len(session["text_segments"]), 1)
        focus_score = 1.0 - min(1.0, len(topics) / 10.0)  # Fewer topics = more focused

        return MeetingTopicAnalysis(
            meeting_id=session["meeting_id"],
            session_id=session_id,
            topics=[
                DetectedTopic(
                    **{k: v for k, v in topic.items() if k != "keywords"}
                    | {
                        "keywords": TopicKeywords(**topic["keywords"]),
                        "confidence_level": self._get_confidence_level(
                            topic["confidence"]
                        ),
                    }
                )
                for topic in topics
            ],
            transitions=[TopicTransition(**transition) for transition in transitions],
            topic_timeline=timeline,
            dominant_topics=[t["id"] for t in dominant_topics],
            topic_coherence=topic_coherence,
            topic_diversity=topic_diversity,
            focus_score=focus_score,
            analysis_timestamp=datetime.now(),
            processing_time_ms=session["processing_stats"]["total_processing_time"],
        )

    async def close_session(self, session_id: str) -> Optional[MeetingTopicAnalysis]:
        """Close a topic detection session and return final analysis"""
        if session_id not in self.active_sessions:
            return None

        # Get final analysis
        analysis = await self.get_session_analysis(session_id)

        # Clean up session
        del self.active_sessions[session_id]

        self.logger.info(f"Closed topic detection session {session_id}")

        return analysis


# Global topic detection service instance
topic_detection_service = TopicDetectionService()


async def get_topic_detection_service() -> TopicDetectionService:
    """Get the global topic detection service instance"""
    return topic_detection_service
