# Advanced Summarization Engine
# Multi-technique summarization system with extractive and abstractive approaches

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
from collections import defaultdict, Counter
import statistics
import numpy as np

# NLP libraries
import nltk
from nltk.corpus import stopwords
from nltk.tokenize import sent_tokenize, word_tokenize
from nltk.stem import WordNetLemmatizer
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
from sklearn.cluster import KMeans
from textstat import flesch_reading_ease, flesch_kincaid_grade

# Download required NLTK data
try:
    nltk.data.find('tokenizers/punkt')
except LookupError:
    nltk.download('punkt')

try:
    nltk.data.find('corpora/stopwords')
except LookupError:
    nltk.download('stopwords')

try:
    nltk.data.find('corpora/wordnet')
except LookupError:
    nltk.download('wordnet')

class SummaryType(Enum):
    """Types of summaries"""
    SHORT = "short"                    # 2-3 sentences
    DETAILED = "detailed"              # 1-2 paragraphs
    EXECUTIVE = "executive"            # Executive summary format
    BULLET_POINTS = "bullet_points"    # Key points as bullets
    ACTION_FOCUSED = "action_focused"  # Focus on action items
    DECISION_FOCUSED = "decision_focused"  # Focus on decisions
    TECHNICAL = "technical"            # Technical summary
    NARRATIVE = "narrative"            # Story-like summary

class SummarizationTechnique(Enum):
    """Available summarization techniques"""
    EXTRACTIVE_TFIDF = "extractive_tfidf"        # TF-IDF based extraction
    EXTRACTIVE_TEXTRANK = "extractive_textrank"  # TextRank algorithm
    EXTRACTIVE_CLUSTERING = "extractive_clustering"  # Sentence clustering
    ABSTRACTIVE_AI = "abstractive_ai"            # AI-generated summary
    HYBRID = "hybrid"                            # Combination approach
    TEMPLATE_BASED = "template_based"            # Custom template approach

class MeetingType(Enum):
    """Types of meetings for template selection"""
    STANDUP = "standup"
    PLANNING = "planning"
    RETROSPECTIVE = "retrospective"
    REVIEW = "review"
    BRAINSTORMING = "brainstorming"
    DECISION_MAKING = "decision_making"
    STATUS_UPDATE = "status_update"
    TRAINING = "training"
    INTERVIEW = "interview"
    GENERAL = "general"

class QualityMetric(Enum):
    """Quality metrics for summary evaluation"""
    COHERENCE = "coherence"
    COMPLETENESS = "completeness"
    CONCISENESS = "conciseness"
    ACCURACY = "accuracy"
    RELEVANCE = "relevance"
    READABILITY = "readability"

@dataclass
class SentenceScore:
    """Score for a sentence in extractive summarization"""
    sentence: str
    position: int
    tfidf_score: float
    position_score: float
    length_score: float
    keyword_score: float
    similarity_score: float
    final_score: float
    metadata: Dict[str, Any]

@dataclass
class ExtractiveKeyPoint:
    """Extracted key point from text"""
    text: str
    score: float
    category: str
    speaker: Optional[str]
    timestamp: Optional[float]
    supporting_evidence: List[str]
    confidence: float

@dataclass
class SummaryResult:
    """Result of summarization process"""
    id: str
    summary_type: SummaryType
    technique: SummarizationTechnique
    content: str
    key_points: List[ExtractiveKeyPoint]
    word_count: int
    reading_time_minutes: float
    confidence_score: float
    quality_metrics: Dict[QualityMetric, float]
    metadata: Dict[str, Any]
    generated_at: datetime
    processing_time_ms: float

@dataclass
class SummarizationRequest:
    """Request for summarization"""
    text: str
    summary_type: SummaryType
    technique: SummarizationTechnique
    meeting_type: Optional[MeetingType]
    custom_template: Optional[str]
    target_length: Optional[int]
    focus_keywords: List[str]
    speaker_context: Dict[str, Any]
    meeting_metadata: Dict[str, Any]
    quality_requirements: Dict[QualityMetric, float]

class SummarizationEngine:
    """
    Advanced summarization engine with multiple techniques
    
    Features:
    - Multiple summarization techniques (extractive, abstractive, hybrid)
    - Multi-level summaries (short, detailed, executive)
    - Extractive key points detection
    - Quality scoring and metrics
    - Custom template support
    - Meeting-type specific optimization
    
    Technical Approach:
    
    1. Extractive Summarization:
       - TF-IDF scoring for sentence importance
       - TextRank algorithm for sentence ranking
       - Sentence clustering for diversity
       - Position and length scoring
    
    2. Abstractive Summarization:
       - AI-powered content generation
       - Template-based generation
       - Context-aware summarization
    
    3. Quality Assessment:
       - Coherence scoring
       - Completeness evaluation
       - Readability analysis
       - Relevance scoring
    """
    
    def __init__(self):
        """Initialize the summarization engine"""
        self.stop_words = set(stopwords.words('english'))
        self.lemmatizer = WordNetLemmatizer()
        
        # TF-IDF vectorizer for extractive summarization
        self.tfidf_vectorizer = TfidfVectorizer(
            max_features=1000,
            stop_words='english',
            ngram_range=(1, 2),
            max_df=0.8,
            min_df=0.1
        )
        
        # Cache for processed documents
        self.processing_cache: Dict[str, Any] = {}
        
        # Statistics tracking
        self.stats = {
            'total_summaries': 0,
            'summaries_by_type': Counter(),
            'summaries_by_technique': Counter(),
            'avg_processing_time': 0.0,
            'quality_scores': defaultdict(list)
        }
        
        self.logger = logging.getLogger(__name__)
    
    async def generate_summary(self, request: SummarizationRequest) -> SummaryResult:
        """
        Generate summary based on the request parameters
        """
        start_time = time.time()
        
        try:
            # Preprocess text
            processed_text = self._preprocess_text(request.text)
            
            # Extract sentences
            sentences = sent_tokenize(processed_text)
            
            if len(sentences) == 0:
                raise ValueError("No sentences found in input text")
            
            # Generate summary based on technique
            if request.technique == SummarizationTechnique.EXTRACTIVE_TFIDF:
                summary_content = await self._extractive_tfidf_summary(
                    sentences, request
                )
            elif request.technique == SummarizationTechnique.EXTRACTIVE_TEXTRANK:
                summary_content = await self._extractive_textrank_summary(
                    sentences, request
                )
            elif request.technique == SummarizationTechnique.EXTRACTIVE_CLUSTERING:
                summary_content = await self._extractive_clustering_summary(
                    sentences, request
                )
            elif request.technique == SummarizationTechnique.ABSTRACTIVE_AI:
                summary_content = await self._abstractive_ai_summary(
                    processed_text, request
                )
            elif request.technique == SummarizationTechnique.HYBRID:
                summary_content = await self._hybrid_summary(
                    sentences, processed_text, request
                )
            elif request.technique == SummarizationTechnique.TEMPLATE_BASED:
                summary_content = await self._template_based_summary(
                    processed_text, request
                )
            else:
                # Default to TF-IDF extractive
                summary_content = await self._extractive_tfidf_summary(
                    sentences, request
                )
            
            # Extract key points
            key_points = await self._extract_key_points(
                processed_text, request
            )
            
            # Calculate quality metrics
            quality_metrics = await self._calculate_quality_metrics(
                summary_content, processed_text, request
            )
            
            # Calculate additional metrics
            word_count = len(summary_content.split())
            reading_time = word_count / 200  # Average reading speed
            confidence_score = self._calculate_confidence_score(
                quality_metrics, request
            )
            
            # Create result
            result = SummaryResult(
                id=f"summary_{uuid.uuid4().hex[:8]}",
                summary_type=request.summary_type,
                technique=request.technique,
                content=summary_content,
                key_points=key_points,
                word_count=word_count,
                reading_time_minutes=reading_time,
                confidence_score=confidence_score,
                quality_metrics=quality_metrics,
                metadata={
                    'meeting_type': request.meeting_type.value if request.meeting_type else None,
                    'original_length': len(request.text.split()),
                    'compression_ratio': word_count / len(request.text.split()),
                    'focus_keywords': request.focus_keywords,
                    'speaker_context': request.speaker_context
                },
                generated_at=datetime.now(),
                processing_time_ms=(time.time() - start_time) * 1000
            )
            
            # Update statistics
            self._update_stats(result)
            
            return result
            
        except Exception as e:
            self.logger.error(f"Summarization failed: {e}")
            raise
    
    def _preprocess_text(self, text: str) -> str:
        """Preprocess text for summarization"""
        # Remove extra whitespace
        text = re.sub(r'\s+', ' ', text)
        
        # Remove speaker labels like "Speaker 1: " if present
        text = re.sub(r'^\w+\s*\d*:\s*', '', text, flags=re.MULTILINE)
        
        # Fix common transcription errors
        text = re.sub(r'\b(um|uh|er|ah)\b', '', text, flags=re.IGNORECASE)
        text = re.sub(r'\[inaudible\]', '', text, flags=re.IGNORECASE)
        
        # Normalize punctuation
        text = re.sub(r'[.]{2,}', '.', text)
        text = re.sub(r'[?]{2,}', '?', text)
        text = re.sub(r'[!]{2,}', '!', text)
        
        return text.strip()
    
    async def _extractive_tfidf_summary(
        self, 
        sentences: List[str], 
        request: SummarizationRequest
    ) -> str:
        """Generate extractive summary using TF-IDF scoring"""
        
        if len(sentences) <= 3:
            return ' '.join(sentences)
        
        # Calculate TF-IDF scores
        tfidf_matrix = self.tfidf_vectorizer.fit_transform(sentences)
        sentence_scores = []
        
        for i, sentence in enumerate(sentences):
            # TF-IDF score (sum of word scores)
            tfidf_score = np.sum(tfidf_matrix[i].toarray())
            
            # Position score (earlier sentences get higher scores)
            position_score = 1.0 / (i + 1) * 0.5
            
            # Length score (prefer medium-length sentences)
            words = len(sentence.split())
            if 10 <= words <= 30:
                length_score = 1.0
            elif words < 10:
                length_score = words / 10
            else:
                length_score = 30 / words
            
            # Keyword score
            keyword_score = self._calculate_keyword_score(
                sentence, request.focus_keywords
            )
            
            # Similarity to other sentences (for diversity)
            similarity_scores = cosine_similarity(
                tfidf_matrix[i], tfidf_matrix
            ).flatten()
            similarity_score = 1.0 - np.mean(similarity_scores)  # Prefer unique sentences
            
            # Combine scores
            final_score = (
                tfidf_score * 0.4 +
                position_score * 0.2 +
                length_score * 0.2 +
                keyword_score * 0.1 +
                similarity_score * 0.1
            )
            
            sentence_scores.append(SentenceScore(
                sentence=sentence,
                position=i,
                tfidf_score=tfidf_score,
                position_score=position_score,
                length_score=length_score,
                keyword_score=keyword_score,
                similarity_score=similarity_score,
                final_score=final_score,
                metadata={}
            ))
        
        # Sort by score and select top sentences
        sentence_scores.sort(key=lambda x: x.final_score, reverse=True)
        
        # Determine number of sentences based on summary type
        num_sentences = self._get_target_sentences(request.summary_type, len(sentences))
        
        # Select top sentences and sort by original position
        selected_scores = sentence_scores[:num_sentences]
        selected_scores.sort(key=lambda x: x.position)
        
        # Create summary
        summary_sentences = [score.sentence for score in selected_scores]
        return ' '.join(summary_sentences)
    
    async def _extractive_textrank_summary(
        self, 
        sentences: List[str], 
        request: SummarizationRequest
    ) -> str:
        """Generate extractive summary using TextRank algorithm"""
        
        if len(sentences) <= 3:
            return ' '.join(sentences)
        
        # Create similarity matrix
        tfidf_matrix = self.tfidf_vectorizer.fit_transform(sentences)
        similarity_matrix = cosine_similarity(tfidf_matrix)
        
        # Apply TextRank algorithm
        scores = np.ones(len(sentences))
        damping = 0.85
        iterations = 50
        
        for _ in range(iterations):
            new_scores = np.ones(len(sentences)) * (1 - damping)
            
            for i in range(len(sentences)):
                for j in range(len(sentences)):
                    if i != j and similarity_matrix[i][j] > 0:
                        new_scores[i] += damping * similarity_matrix[i][j] * scores[j] / np.sum(similarity_matrix[j])
            
            scores = new_scores
        
        # Rank sentences
        ranked_indices = np.argsort(scores)[::-1]
        
        # Select top sentences
        num_sentences = self._get_target_sentences(request.summary_type, len(sentences))
        selected_indices = sorted(ranked_indices[:num_sentences])
        
        # Create summary
        summary_sentences = [sentences[i] for i in selected_indices]
        return ' '.join(summary_sentences)
    
    async def _extractive_clustering_summary(
        self, 
        sentences: List[str], 
        request: SummarizationRequest
    ) -> str:
        """Generate extractive summary using sentence clustering"""
        
        if len(sentences) <= 3:
            return ' '.join(sentences)
        
        # Create TF-IDF matrix
        tfidf_matrix = self.tfidf_vectorizer.fit_transform(sentences)
        
        # Determine number of clusters
        num_clusters = min(5, max(2, len(sentences) // 3))
        
        # Perform clustering
        kmeans = KMeans(n_clusters=num_clusters, random_state=42)
        clusters = kmeans.fit_predict(tfidf_matrix.toarray())
        
        # Select representative sentence from each cluster
        selected_sentences = []
        
        for cluster_id in range(num_clusters):
            cluster_sentences = [
                (i, sentences[i]) for i, c in enumerate(clusters) if c == cluster_id
            ]
            
            if cluster_sentences:
                # Find sentence closest to cluster centroid
                cluster_indices = [i for i, c in enumerate(clusters) if c == cluster_id]
                cluster_tfidf = tfidf_matrix[cluster_indices]
                centroid = np.mean(cluster_tfidf.toarray(), axis=0)
                
                # Calculate distances to centroid
                distances = []
                for idx in cluster_indices:
                    distance = np.linalg.norm(
                        tfidf_matrix[idx].toarray().flatten() - centroid
                    )
                    distances.append((distance, idx, sentences[idx]))
                
                # Select sentence closest to centroid
                distances.sort()
                selected_sentences.append((distances[0][1], distances[0][2]))
        
        # Sort by original position
        selected_sentences.sort(key=lambda x: x[0])
        
        # Create summary
        summary_sentences = [sentence for _, sentence in selected_sentences]
        return ' '.join(summary_sentences)
    
    async def _abstractive_ai_summary(
        self, 
        text: str, 
        request: SummarizationRequest
    ) -> str:
        """Generate abstractive summary using AI"""
        # This would integrate with AI orchestration service
        # For now, provide a template-based approach as fallback
        
        # Simulate AI processing delay
        await asyncio.sleep(0.1)
        
        # Extract key information
        sentences = sent_tokenize(text)
        key_topics = self._extract_topics(text)
        
        # Generate abstractive summary based on type
        if request.summary_type == SummaryType.EXECUTIVE:
            return self._generate_executive_summary(sentences, key_topics, request)
        elif request.summary_type == SummaryType.ACTION_FOCUSED:
            return self._generate_action_summary(sentences, request)
        elif request.summary_type == SummaryType.DECISION_FOCUSED:
            return self._generate_decision_summary(sentences, request)
        else:
            return self._generate_general_summary(sentences, key_topics, request)
    
    async def _hybrid_summary(
        self, 
        sentences: List[str], 
        text: str, 
        request: SummarizationRequest
    ) -> str:
        """Generate hybrid summary combining extractive and abstractive approaches"""
        
        # First, get extractive summary
        extractive_summary = await self._extractive_tfidf_summary(sentences, request)
        
        # Then enhance with abstractive elements
        enhanced_request = SummarizationRequest(
            text=extractive_summary,
            summary_type=request.summary_type,
            technique=SummarizationTechnique.ABSTRACTIVE_AI,
            meeting_type=request.meeting_type,
            custom_template=request.custom_template,
            target_length=request.target_length,
            focus_keywords=request.focus_keywords,
            speaker_context=request.speaker_context,
            meeting_metadata=request.meeting_metadata,
            quality_requirements=request.quality_requirements
        )
        
        abstractive_summary = await self._abstractive_ai_summary(
            extractive_summary, enhanced_request
        )
        
        return abstractive_summary
    
    async def _template_based_summary(
        self, 
        text: str, 
        request: SummarizationRequest
    ) -> str:
        """Generate summary using custom templates"""
        
        if request.custom_template:
            return self._apply_custom_template(text, request.custom_template, request)
        elif request.meeting_type:
            return self._apply_meeting_type_template(text, request.meeting_type, request)
        else:
            # Fall back to extractive summary
            sentences = sent_tokenize(text)
            return await self._extractive_tfidf_summary(sentences, request)
    
    def _apply_custom_template(self, text: str, template: str, request: SummarizationRequest) -> str:
        """Apply custom template to generate summary"""
        # Extract information based on template placeholders
        placeholders = re.findall(r'\{([^}]+)\}', template)
        
        substitutions = {}
        for placeholder in placeholders:
            if placeholder == 'key_points':
                key_points = self._extract_simple_key_points(text)
                substitutions[placeholder] = '\n'.join([f"• {point}" for point in key_points[:5]])
            elif placeholder == 'action_items':
                actions = self._extract_action_items(text)
                substitutions[placeholder] = '\n'.join([f"• {action}" for action in actions[:3]])
            elif placeholder == 'decisions':
                decisions = self._extract_decisions(text)
                substitutions[placeholder] = '\n'.join([f"• {decision}" for decision in decisions[:3]])
            elif placeholder == 'participants':
                participants = request.speaker_context.get('speakers', [])
                substitutions[placeholder] = ', '.join(participants)
            elif placeholder == 'meeting_date':
                date = request.meeting_metadata.get('date', datetime.now().strftime('%Y-%m-%d'))
                substitutions[placeholder] = date
            elif placeholder == 'duration':
                duration = request.meeting_metadata.get('duration', 'Unknown')
                substitutions[placeholder] = str(duration)
            else:
                substitutions[placeholder] = '[Not Available]'
        
        # Apply substitutions
        result = template
        for placeholder, value in substitutions.items():
            result = result.replace(f'{{{placeholder}}}', value)
        
        return result
    
    def _apply_meeting_type_template(self, text: str, meeting_type: MeetingType, request: SummarizationRequest) -> str:
        """Apply predefined template based on meeting type"""
        
        if meeting_type == MeetingType.STANDUP:
            return self._generate_standup_summary(text, request)
        elif meeting_type == MeetingType.RETROSPECTIVE:
            return self._generate_retrospective_summary(text, request)
        elif meeting_type == MeetingType.PLANNING:
            return self._generate_planning_summary(text, request)
        elif meeting_type == MeetingType.REVIEW:
            return self._generate_review_summary(text, request)
        else:
            return self._generate_general_meeting_summary(text, request)
    
    async def _extract_key_points(self, text: str, request: SummarizationRequest) -> List[ExtractiveKeyPoint]:
        """Extract key points from text using multiple techniques"""
        
        key_points = []
        sentences = sent_tokenize(text)
        
        # TF-IDF based key points
        tfidf_points = self._extract_tfidf_key_points(sentences)
        key_points.extend(tfidf_points)
        
        # Pattern-based key points
        pattern_points = self._extract_pattern_based_points(text)
        key_points.extend(pattern_points)
        
        # Keyword-focused points
        if request.focus_keywords:
            keyword_points = self._extract_keyword_focused_points(sentences, request.focus_keywords)
            key_points.extend(keyword_points)
        
        # Sort by score and remove duplicates
        key_points.sort(key=lambda x: x.score, reverse=True)
        unique_points = self._remove_duplicate_points(key_points)
        
        return unique_points[:10]  # Return top 10 key points
    
    def _extract_tfidf_key_points(self, sentences: List[str]) -> List[ExtractiveKeyPoint]:
        """Extract key points using TF-IDF scoring"""
        
        if len(sentences) == 0:
            return []
        
        # Calculate TF-IDF scores
        tfidf_matrix = self.tfidf_vectorizer.fit_transform(sentences)
        
        key_points = []
        for i, sentence in enumerate(sentences):
            score = np.sum(tfidf_matrix[i].toarray())
            
            key_points.append(ExtractiveKeyPoint(
                text=sentence,
                score=score,
                category='general',
                speaker=None,
                timestamp=None,
                supporting_evidence=[],
                confidence=min(1.0, score / 10.0)  # Normalize score
            ))
        
        return key_points
    
    def _extract_pattern_based_points(self, text: str) -> List[ExtractiveKeyPoint]:
        """Extract key points using pattern matching"""
        
        key_points = []
        
        # Action item patterns
        action_patterns = [
            r'action item[s]?[:\s]+([^.]+)',
            r'(\w+\s+(?:will|should|needs to|must)\s+[^.]+)',
            r'(we need to [^.]+)',
            r'(let\'s [^.]+)'
        ]
        
        for pattern in action_patterns:
            matches = re.finditer(pattern, text, re.IGNORECASE)
            for match in matches:
                key_points.append(ExtractiveKeyPoint(
                    text=match.group(1).strip(),
                    score=0.8,
                    category='action_item',
                    speaker=None,
                    timestamp=None,
                    supporting_evidence=[],
                    confidence=0.8
                ))
        
        # Decision patterns
        decision_patterns = [
            r'(we (?:decided|agreed|concluded) [^.]+)',
            r'(the decision is [^.]+)',
            r'(it was decided that [^.]+)'
        ]
        
        for pattern in decision_patterns:
            matches = re.finditer(pattern, text, re.IGNORECASE)
            for match in matches:
                key_points.append(ExtractiveKeyPoint(
                    text=match.group(1).strip(),
                    score=0.9,
                    category='decision',
                    speaker=None,
                    timestamp=None,
                    supporting_evidence=[],
                    confidence=0.9
                ))
        
        return key_points
    
    def _extract_keyword_focused_points(self, sentences: List[str], keywords: List[str]) -> List[ExtractiveKeyPoint]:
        """Extract key points that mention focus keywords"""
        
        key_points = []
        
        for sentence in sentences:
            keyword_count = sum(
                1 for keyword in keywords 
                if keyword.lower() in sentence.lower()
            )
            
            if keyword_count > 0:
                score = keyword_count / len(keywords)
                key_points.append(ExtractiveKeyPoint(
                    text=sentence,
                    score=score,
                    category='keyword_focused',
                    speaker=None,
                    timestamp=None,
                    supporting_evidence=[
                        keyword for keyword in keywords 
                        if keyword.lower() in sentence.lower()
                    ],
                    confidence=score
                ))
        
        return key_points
    
    def _remove_duplicate_points(self, key_points: List[ExtractiveKeyPoint]) -> List[ExtractiveKeyPoint]:
        """Remove duplicate or very similar key points"""
        
        if len(key_points) <= 1:
            return key_points
        
        unique_points = []
        seen_texts = set()
        
        for point in key_points:
            # Simple deduplication based on text similarity
            is_duplicate = False
            
            for seen_text in seen_texts:
                # Calculate simple similarity
                common_words = set(point.text.lower().split()) & set(seen_text.lower().split())
                similarity = len(common_words) / max(len(point.text.split()), len(seen_text.split()))
                
                if similarity > 0.7:  # 70% similarity threshold
                    is_duplicate = True
                    break
            
            if not is_duplicate:
                unique_points.append(point)
                seen_texts.add(point.text)
        
        return unique_points
    
    async def _calculate_quality_metrics(
        self, 
        summary: str, 
        original_text: str, 
        request: SummarizationRequest
    ) -> Dict[QualityMetric, float]:
        """Calculate quality metrics for the summary"""
        
        metrics = {}
        
        # Coherence (simplified - based on sentence flow)
        metrics[QualityMetric.COHERENCE] = self._calculate_coherence(summary)
        
        # Completeness (coverage of key topics)
        metrics[QualityMetric.COMPLETENESS] = self._calculate_completeness(
            summary, original_text
        )
        
        # Conciseness (compression ratio)
        original_words = len(original_text.split())
        summary_words = len(summary.split())
        compression_ratio = summary_words / original_words if original_words > 0 else 0
        metrics[QualityMetric.CONCISENESS] = 1.0 - min(1.0, compression_ratio)
        
        # Accuracy (keyword preservation)
        metrics[QualityMetric.ACCURACY] = self._calculate_accuracy(
            summary, original_text, request.focus_keywords
        )
        
        # Relevance (focus keyword coverage)
        metrics[QualityMetric.RELEVANCE] = self._calculate_relevance(
            summary, request.focus_keywords
        )
        
        # Readability
        metrics[QualityMetric.READABILITY] = self._calculate_readability(summary)
        
        return metrics
    
    def _calculate_coherence(self, text: str) -> float:
        """Calculate coherence score based on sentence connectivity"""
        sentences = sent_tokenize(text)
        
        if len(sentences) <= 1:
            return 1.0
        
        # Simple coherence based on common words between adjacent sentences
        coherence_scores = []
        
        for i in range(len(sentences) - 1):
            words1 = set(word.lower() for word in word_tokenize(sentences[i]) if word.isalpha())
            words2 = set(word.lower() for word in word_tokenize(sentences[i + 1]) if word.isalpha())
            
            if len(words1) > 0 and len(words2) > 0:
                overlap = len(words1 & words2)
                total = len(words1 | words2)
                coherence_scores.append(overlap / total if total > 0 else 0)
        
        return statistics.mean(coherence_scores) if coherence_scores else 0.5
    
    def _calculate_completeness(self, summary: str, original_text: str) -> float:
        """Calculate completeness based on topic coverage"""
        
        # Extract key topics from original text
        original_topics = self._extract_topics(original_text)
        summary_topics = self._extract_topics(summary)
        
        if len(original_topics) == 0:
            return 1.0
        
        # Calculate coverage
        covered_topics = sum(
            1 for topic in original_topics 
            if any(word in summary.lower() for word in topic.split())
        )
        
        return covered_topics / len(original_topics)
    
    def _calculate_accuracy(self, summary: str, original_text: str, focus_keywords: List[str]) -> float:
        """Calculate accuracy based on information preservation"""
        
        # Simple accuracy based on important word preservation
        original_words = set(word.lower() for word in word_tokenize(original_text) if word.isalpha())
        summary_words = set(word.lower() for word in word_tokenize(summary) if word.isalpha())
        
        # Remove stop words
        original_words -= self.stop_words
        summary_words -= self.stop_words
        
        if len(original_words) == 0:
            return 1.0
        
        # Calculate preservation ratio
        preserved_words = len(summary_words & original_words)
        important_words = max(10, len(original_words) // 10)  # Consider top 10% as important
        
        return min(1.0, preserved_words / important_words)
    
    def _calculate_relevance(self, summary: str, focus_keywords: List[str]) -> float:
        """Calculate relevance based on focus keyword coverage"""
        
        if not focus_keywords:
            return 1.0
        
        summary_lower = summary.lower()
        covered_keywords = sum(
            1 for keyword in focus_keywords 
            if keyword.lower() in summary_lower
        )
        
        return covered_keywords / len(focus_keywords)
    
    def _calculate_readability(self, text: str) -> float:
        """Calculate readability score"""
        try:
            # Use Flesch Reading Ease score
            flesch_score = flesch_reading_ease(text)
            # Convert to 0-1 scale (higher is better)
            return min(1.0, max(0.0, flesch_score / 100.0))
        except:
            return 0.5  # Default if calculation fails
    
    def _calculate_confidence_score(self, quality_metrics: Dict[QualityMetric, float], request: SummarizationRequest) -> float:
        """Calculate overall confidence score"""
        
        # Weight different metrics based on requirements
        weights = {
            QualityMetric.COHERENCE: 0.2,
            QualityMetric.COMPLETENESS: 0.2,
            QualityMetric.CONCISENESS: 0.15,
            QualityMetric.ACCURACY: 0.2,
            QualityMetric.RELEVANCE: 0.15,
            QualityMetric.READABILITY: 0.1
        }
        
        # Apply custom weights if specified in requirements
        if request.quality_requirements:
            for metric, required_score in request.quality_requirements.items():
                if metric in weights:
                    weights[metric] *= 1.2  # Boost weight for required metrics
        
        # Calculate weighted average
        total_score = sum(
            quality_metrics.get(metric, 0.5) * weight 
            for metric, weight in weights.items()
        )
        
        return min(1.0, total_score)
    
    def _get_target_sentences(self, summary_type: SummaryType, total_sentences: int) -> int:
        """Determine target number of sentences based on summary type"""
        
        if summary_type == SummaryType.SHORT:
            return min(3, max(1, total_sentences // 4))
        elif summary_type == SummaryType.DETAILED:
            return min(8, max(3, total_sentences // 2))
        elif summary_type == SummaryType.EXECUTIVE:
            return min(5, max(2, total_sentences // 3))
        else:
            return min(5, max(2, total_sentences // 3))
    
    def _calculate_keyword_score(self, sentence: str, keywords: List[str]) -> float:
        """Calculate keyword relevance score for a sentence"""
        
        if not keywords:
            return 0.0
        
        sentence_lower = sentence.lower()
        keyword_matches = sum(
            1 for keyword in keywords 
            if keyword.lower() in sentence_lower
        )
        
        return keyword_matches / len(keywords)
    
    def _extract_topics(self, text: str) -> List[str]:
        """Extract key topics from text using simple frequency analysis"""
        
        words = word_tokenize(text.lower())
        words = [word for word in words if word.isalpha() and word not in self.stop_words]
        
        # Count word frequencies
        word_freq = Counter(words)
        
        # Return top topics
        return [word for word, count in word_freq.most_common(10)]
    
    def _extract_simple_key_points(self, text: str) -> List[str]:
        """Extract simple key points for template substitution"""
        sentences = sent_tokenize(text)
        
        # Use basic TF-IDF to find important sentences
        if len(sentences) <= 3:
            return sentences
        
        try:
            tfidf_matrix = self.tfidf_vectorizer.fit_transform(sentences)
            scores = np.sum(tfidf_matrix.toarray(), axis=1)
            
            # Get top 5 sentences
            top_indices = np.argsort(scores)[-5:][::-1]
            return [sentences[i] for i in top_indices]
        except:
            # Fallback to first few sentences
            return sentences[:5]
    
    def _extract_action_items(self, text: str) -> List[str]:
        """Extract action items from text"""
        
        action_patterns = [
            r'action item[s]?[:\s]+([^.]+)',
            r'(\w+\s+(?:will|should|needs to|must)\s+[^.]+)',
            r'(we need to [^.]+)'
        ]
        
        actions = []
        for pattern in action_patterns:
            matches = re.finditer(pattern, text, re.IGNORECASE)
            for match in matches:
                actions.append(match.group(1).strip())
        
        return actions[:5]  # Return top 5
    
    def _extract_decisions(self, text: str) -> List[str]:
        """Extract decisions from text"""
        
        decision_patterns = [
            r'(we (?:decided|agreed|concluded) [^.]+)',
            r'(the decision is [^.]+)',
            r'(it was decided that [^.]+)'
        ]
        
        decisions = []
        for pattern in decision_patterns:
            matches = re.finditer(pattern, text, re.IGNORECASE)
            for match in matches:
                decisions.append(match.group(1).strip())
        
        return decisions[:5]  # Return top 5
    
    # Meeting type specific summary generators
    
    def _generate_standup_summary(self, text: str, request: SummarizationRequest) -> str:
        """Generate standup-specific summary"""
        template = """Daily Standup Summary:

Completed:
{completed_work}

Planned:
{planned_work}

Blockers:
{blockers}

Next Steps:
{next_steps}"""
        
        # Extract standup-specific information
        completed = self._extract_completed_work(text)
        planned = self._extract_planned_work(text)
        blockers = self._extract_blockers(text)
        next_steps = self._extract_next_steps(text)
        
        return template.format(
            completed_work='\n'.join([f"• {item}" for item in completed[:3]]),
            planned_work='\n'.join([f"• {item}" for item in planned[:3]]),
            blockers='\n'.join([f"• {item}" for item in blockers[:3]]) if blockers else "• None reported",
            next_steps='\n'.join([f"• {item}" for item in next_steps[:3]])
        )
    
    def _generate_retrospective_summary(self, text: str, request: SummarizationRequest) -> str:
        """Generate retrospective-specific summary"""
        template = """Retrospective Summary:

What Went Well:
{went_well}

What Could Be Improved:
{improvements}

Action Items:
{action_items}

Key Insights:
{insights}"""
        
        went_well = self._extract_positive_feedback(text)
        improvements = self._extract_improvement_areas(text)
        actions = self._extract_action_items(text)
        insights = self._extract_simple_key_points(text)
        
        return template.format(
            went_well='\n'.join([f"• {item}" for item in went_well[:3]]),
            improvements='\n'.join([f"• {item}" for item in improvements[:3]]),
            action_items='\n'.join([f"• {item}" for item in actions[:3]]),
            insights='\n'.join([f"• {item}" for item in insights[:3]])
        )
    
    def _generate_planning_summary(self, text: str, request: SummarizationRequest) -> str:
        """Generate planning meeting summary"""
        template = """Planning Meeting Summary:

Objectives Discussed:
{objectives}

Key Decisions:
{decisions}

Resource Allocation:
{resources}

Timeline & Milestones:
{timeline}

Next Actions:
{actions}"""
        
        objectives = self._extract_objectives(text)
        decisions = self._extract_decisions(text)
        resources = self._extract_resources(text)
        timeline = self._extract_timeline(text)
        actions = self._extract_action_items(text)
        
        return template.format(
            objectives='\n'.join([f"• {item}" for item in objectives[:3]]),
            decisions='\n'.join([f"• {item}" for item in decisions[:3]]),
            resources='\n'.join([f"• {item}" for item in resources[:3]]),
            timeline='\n'.join([f"• {item}" for item in timeline[:3]]),
            actions='\n'.join([f"• {item}" for item in actions[:3]])
        )
    
    def _generate_review_summary(self, text: str, request: SummarizationRequest) -> str:
        """Generate review meeting summary"""
        template = """Review Meeting Summary:

Items Reviewed:
{reviewed_items}

Feedback & Comments:
{feedback}

Approval Status:
{approvals}

Required Changes:
{changes}

Next Steps:
{next_steps}"""
        
        reviewed = self._extract_reviewed_items(text)
        feedback = self._extract_feedback(text)
        approvals = self._extract_approvals(text)
        changes = self._extract_required_changes(text)
        next_steps = self._extract_next_steps(text)
        
        return template.format(
            reviewed_items='\n'.join([f"• {item}" for item in reviewed[:3]]),
            feedback='\n'.join([f"• {item}" for item in feedback[:3]]),
            approvals='\n'.join([f"• {item}" for item in approvals[:3]]),
            changes='\n'.join([f"• {item}" for item in changes[:3]]),
            next_steps='\n'.join([f"• {item}" for item in next_steps[:3]])
        )
    
    def _generate_general_meeting_summary(self, text: str, request: SummarizationRequest) -> str:
        """Generate general meeting summary"""
        # Fall back to extractive summary for general meetings
        sentences = sent_tokenize(text)
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            return loop.run_until_complete(self._extractive_tfidf_summary(sentences, request))
        finally:
            loop.close()
    
    # Helper methods for extracting specific types of information
    
    def _extract_completed_work(self, text: str) -> List[str]:
        """Extract completed work items"""
        patterns = [
            r'(completed [^.]+)',
            r'(finished [^.]+)',
            r'(done [^.]+)',
            r'(delivered [^.]+)'
        ]
        
        items = []
        for pattern in patterns:
            matches = re.finditer(pattern, text, re.IGNORECASE)
            for match in matches:
                items.append(match.group(1).strip())
        
        return items
    
    def _extract_planned_work(self, text: str) -> List[str]:
        """Extract planned work items"""
        patterns = [
            r'(planning to [^.]+)',
            r'(will work on [^.]+)',
            r'(next [^.]+)',
            r'(upcoming [^.]+)'
        ]
        
        items = []
        for pattern in patterns:
            matches = re.finditer(pattern, text, re.IGNORECASE)
            for match in matches:
                items.append(match.group(1).strip())
        
        return items
    
    def _extract_blockers(self, text: str) -> List[str]:
        """Extract blocker items"""
        patterns = [
            r'(blocked by [^.]+)',
            r'(blocker[s]?[:\s]+[^.]+)',
            r'(waiting for [^.]+)',
            r'(issue with [^.]+)'
        ]
        
        items = []
        for pattern in patterns:
            matches = re.finditer(pattern, text, re.IGNORECASE)
            for match in matches:
                items.append(match.group(1).strip())
        
        return items
    
    def _extract_next_steps(self, text: str) -> List[str]:
        """Extract next steps"""
        patterns = [
            r'(next step[s]?[:\s]+[^.]+)',
            r'(will [^.]+)',
            r'(plan to [^.]+)',
            r'(going to [^.]+)'
        ]
        
        items = []
        for pattern in patterns:
            matches = re.finditer(pattern, text, re.IGNORECASE)
            for match in matches:
                items.append(match.group(1).strip())
        
        return items
    
    def _extract_positive_feedback(self, text: str) -> List[str]:
        """Extract positive feedback"""
        patterns = [
            r'(went well[^.]+)',
            r'(good [^.]+)',
            r'(successful[^.]+)',
            r'(positive [^.]+)'
        ]
        
        items = []
        for pattern in patterns:
            matches = re.finditer(pattern, text, re.IGNORECASE)
            for match in matches:
                items.append(match.group(1).strip())
        
        return items
    
    def _extract_improvement_areas(self, text: str) -> List[str]:
        """Extract improvement areas"""
        patterns = [
            r'(could improve [^.]+)',
            r'(need to improve [^.]+)',
            r'(better [^.]+)',
            r'(challenge [^.]+)'
        ]
        
        items = []
        for pattern in patterns:
            matches = re.finditer(pattern, text, re.IGNORECASE)
            for match in matches:
                items.append(match.group(1).strip())
        
        return items
    
    def _extract_objectives(self, text: str) -> List[str]:
        """Extract objectives"""
        patterns = [
            r'(objective[s]?[:\s]+[^.]+)',
            r'(goal[s]?[:\s]+[^.]+)',
            r'(aim to [^.]+)',
            r'(target [^.]+)'
        ]
        
        items = []
        for pattern in patterns:
            matches = re.finditer(pattern, text, re.IGNORECASE)
            for match in matches:
                items.append(match.group(1).strip())
        
        return items
    
    def _extract_resources(self, text: str) -> List[str]:
        """Extract resource mentions"""
        patterns = [
            r'(resource[s]?[:\s]+[^.]+)',
            r'(budget [^.]+)',
            r'(team [^.]+)',
            r'(staff [^.]+)'
        ]
        
        items = []
        for pattern in patterns:
            matches = re.finditer(pattern, text, re.IGNORECASE)
            for match in matches:
                items.append(match.group(1).strip())
        
        return items
    
    def _extract_timeline(self, text: str) -> List[str]:
        """Extract timeline mentions"""
        patterns = [
            r'(timeline[s]?[:\s]+[^.]+)',
            r'(milestone[s]?[:\s]+[^.]+)',
            r'(deadline [^.]+)',
            r'(due [^.]+)'
        ]
        
        items = []
        for pattern in patterns:
            matches = re.finditer(pattern, text, re.IGNORECASE)
            for match in matches:
                items.append(match.group(1).strip())
        
        return items
    
    def _extract_reviewed_items(self, text: str) -> List[str]:
        """Extract reviewed items"""
        patterns = [
            r'(reviewed [^.]+)',
            r'(review of [^.]+)',
            r'(examined [^.]+)',
            r'(evaluated [^.]+)'
        ]
        
        items = []
        for pattern in patterns:
            matches = re.finditer(pattern, text, re.IGNORECASE)
            for match in matches:
                items.append(match.group(1).strip())
        
        return items
    
    def _extract_feedback(self, text: str) -> List[str]:
        """Extract feedback"""
        patterns = [
            r'(feedback[:\s]+[^.]+)',
            r'(comment[s]?[:\s]+[^.]+)',
            r'(suggestion[s]?[:\s]+[^.]+)',
            r'(recommend [^.]+)'
        ]
        
        items = []
        for pattern in patterns:
            matches = re.finditer(pattern, text, re.IGNORECASE)
            for match in matches:
                items.append(match.group(1).strip())
        
        return items
    
    def _extract_approvals(self, text: str) -> List[str]:
        """Extract approval status"""
        patterns = [
            r'(approved [^.]+)',
            r'(approval [^.]+)',
            r'(accepted [^.]+)',
            r'(rejected [^.]+)'
        ]
        
        items = []
        for pattern in patterns:
            matches = re.finditer(pattern, text, re.IGNORECASE)
            for match in matches:
                items.append(match.group(1).strip())
        
        return items
    
    def _extract_required_changes(self, text: str) -> List[str]:
        """Extract required changes"""
        patterns = [
            r'(change[s]?[:\s]+[^.]+)',
            r'(modify [^.]+)',
            r'(update [^.]+)',
            r'(revise [^.]+)'
        ]
        
        items = []
        for pattern in patterns:
            matches = re.finditer(pattern, text, re.IGNORECASE)
            for match in matches:
                items.append(match.group(1).strip())
        
        return items
    
    # Additional helper methods for abstractive summaries
    
    def _generate_executive_summary(self, sentences: List[str], topics: List[str], request: SummarizationRequest) -> str:
        """Generate executive-style summary"""
        
        # Executive summary structure
        key_points = self._extract_simple_key_points(' '.join(sentences))
        decisions = self._extract_decisions(' '.join(sentences))
        actions = self._extract_action_items(' '.join(sentences))
        
        summary_parts = []
        
        # Opening statement
        if key_points:
            summary_parts.append(f"This meeting focused on {', '.join(topics[:3])} with key discussions around {key_points[0].lower()}.")
        
        # Key decisions
        if decisions:
            summary_parts.append(f"Major decisions included: {decisions[0].lower()}.")
        
        # Action items
        if actions:
            summary_parts.append(f"Action items were identified: {actions[0].lower()}.")
        
        # Fallback to extractive if no structured content
        if not summary_parts:
            return ' '.join(sentences[:3])
        
        return ' '.join(summary_parts)
    
    def _generate_action_summary(self, sentences: List[str], request: SummarizationRequest) -> str:
        """Generate action-focused summary"""
        
        text = ' '.join(sentences)
        actions = self._extract_action_items(text)
        
        if actions:
            summary = "Key action items from this meeting: "
            summary += "; ".join(actions[:5]) + "."
            return summary
        else:
            # Fall back to extractive
            return ' '.join(sentences[:3])
    
    def _generate_decision_summary(self, sentences: List[str], request: SummarizationRequest) -> str:
        """Generate decision-focused summary"""
        
        text = ' '.join(sentences)
        decisions = self._extract_decisions(text)
        
        if decisions:
            summary = "Key decisions made in this meeting: "
            summary += "; ".join(decisions[:5]) + "."
            return summary
        else:
            # Fall back to extractive
            return ' '.join(sentences[:3])
    
    def _generate_general_summary(self, sentences: List[str], topics: List[str], request: SummarizationRequest) -> str:
        """Generate general abstractive summary"""
        
        if not sentences:
            return "No content available for summarization."
        
        # Create a general summary structure
        summary_parts = []
        
        # Main topic
        if topics:
            summary_parts.append(f"The discussion covered {', '.join(topics[:3])}.")
        
        # Key points
        key_points = self._extract_simple_key_points(' '.join(sentences))
        if key_points:
            summary_parts.append(key_points[0])
        
        # Actions or next steps
        actions = self._extract_action_items(' '.join(sentences))
        if actions:
            summary_parts.append(f"Next steps include {actions[0].lower()}.")
        
        if summary_parts:
            return ' '.join(summary_parts)
        else:
            # Final fallback
            return ' '.join(sentences[:3])
    
    def _update_stats(self, result: SummaryResult):
        """Update processing statistics"""
        self.stats['total_summaries'] += 1
        self.stats['summaries_by_type'][result.summary_type.value] += 1
        self.stats['summaries_by_technique'][result.technique.value] += 1
        
        # Update average processing time
        total_time = self.stats['avg_processing_time'] * (self.stats['total_summaries'] - 1)
        self.stats['avg_processing_time'] = (total_time + result.processing_time_ms) / self.stats['total_summaries']
        
        # Track quality scores
        for metric, score in result.quality_metrics.items():
            self.stats['quality_scores'][metric.value].append(score)
    
    async def get_statistics(self) -> Dict[str, Any]:
        """Get summarization engine statistics"""
        
        # Calculate average quality scores
        avg_quality_scores = {}
        for metric, scores in self.stats['quality_scores'].items():
            if scores:
                avg_quality_scores[metric] = statistics.mean(scores)
        
        return {
            'total_summaries': self.stats['total_summaries'],
            'summaries_by_type': dict(self.stats['summaries_by_type']),
            'summaries_by_technique': dict(self.stats['summaries_by_technique']),
            'avg_processing_time_ms': self.stats['avg_processing_time'],
            'avg_quality_scores': avg_quality_scores,
            'cache_size': len(self.processing_cache)
        }

# Global summarization engine instance
summarization_engine = None

async def get_summarization_engine() -> SummarizationEngine:
    """Get the global summarization engine instance"""
    global summarization_engine
    if summarization_engine is None:
        summarization_engine = SummarizationEngine()
    return summarization_engine