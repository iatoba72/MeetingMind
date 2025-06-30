# Transcription Accuracy Analysis and Comparison Tool
# Analyzes and compares transcription results from different providers

import asyncio
import logging
import re
import string
from datetime import datetime
from typing import Dict, List, Optional, Any, Tuple
from dataclasses import dataclass, asdict
from enum import Enum
import json
import difflib
import nltk
from nltk.translate.bleu_score import sentence_bleu, SmoothingFunction
from nltk.metrics import edit_distance
import numpy as np
from jiwer import (
    wer,
    cer,
    mer,
)  # Word Error Rate, Character Error Rate, Match Error Rate
from collections import Counter
import statistics

# Download required NLTK data
try:
    nltk.data.find("tokenizers/punkt")
except LookupError:
    nltk.download("punkt")

try:
    nltk.data.find("corpora/stopwords")
except LookupError:
    nltk.download("stopwords")

from nltk.corpus import stopwords
from nltk.tokenize import word_tokenize, sent_tokenize

from cloud_transcription_service import (
    TranscriptionJob,
    TranscriptionAttempt,
    TranscriptionProvider,
)
from transcription_service import TranscriptionResult

logger = logging.getLogger(__name__)


class AccuracyMetric(Enum):
    """Available accuracy metrics"""

    WORD_ERROR_RATE = "wer"  # Word Error Rate
    CHARACTER_ERROR_RATE = "cer"  # Character Error Rate
    MATCH_ERROR_RATE = "mer"  # Match Error Rate
    BLEU_SCORE = "bleu"  # BLEU score
    SEMANTIC_SIMILARITY = "semantic"  # Semantic similarity
    READABILITY_SCORE = "readability"  # Text readability
    SPEAKER_ACCURACY = "speaker"  # Speaker identification accuracy
    TIMESTAMP_ACCURACY = "timestamp"  # Timestamp accuracy


@dataclass
class WordAlignment:
    """Alignment between reference and hypothesis words"""

    reference_word: str
    hypothesis_word: str
    alignment_type: str  # 'match', 'substitution', 'insertion', 'deletion'
    position: int
    confidence: float = 0.0


@dataclass
class AccuracyMetrics:
    """Comprehensive accuracy metrics for transcription"""

    # Basic error rates
    word_error_rate: float
    character_error_rate: float
    match_error_rate: float

    # Similarity scores
    bleu_score: float
    semantic_similarity: float

    # Detailed breakdown
    word_accuracy: float
    sentence_accuracy: float

    # Error analysis
    substitution_errors: int
    insertion_errors: int
    deletion_errors: int
    total_words: int

    # Quality metrics
    readability_score: float
    confidence_score: float

    # Timing metrics
    timestamp_accuracy: float
    processing_speed: float  # Real-time factor

    # Speaker metrics (if applicable)
    speaker_accuracy: Optional[float] = None
    speaker_confusion_matrix: Optional[Dict[str, Dict[str, int]]] = None


@dataclass
class ComparisonResult:
    """Result of comparing multiple transcription providers"""

    job_id: str
    reference_text: Optional[str]
    provider_results: Dict[TranscriptionProvider, AccuracyMetrics]
    rankings: List[Tuple[TranscriptionProvider, float]]  # Provider and overall score
    best_provider: TranscriptionProvider
    cost_effectiveness: Dict[TranscriptionProvider, float]  # Score per dollar
    detailed_analysis: Dict[str, Any]
    timestamp: datetime


class TranscriptionAccuracyAnalyzer:
    """Analyzes and compares transcription accuracy across providers"""

    def __init__(self):
        self.stop_words = set(stopwords.words("english"))
        self.smoothing = SmoothingFunction()

        # Reference texts for benchmark testing
        self.benchmark_texts = self._load_benchmark_texts()

    def _load_benchmark_texts(self) -> Dict[str, str]:
        """Load or define benchmark texts for testing"""
        return {
            "simple": "Hello, this is a simple test sentence for transcription accuracy.",
            "complex": "The quick brown fox jumps over the lazy dog while the sophisticated artificial intelligence algorithms process natural language with remarkable precision.",
            "technical": "Machine learning models utilize gradient descent optimization to minimize loss functions across neural network architectures.",
            "conversational": "Hey, um, so I was thinking we could maybe, you know, meet up later? Like around three-ish if that works for you.",
            "numbers": "The meeting is scheduled for January 15th, 2024 at 3:45 PM in room 201B with approximately 25 attendees.",
        }

    async def analyze_transcription_job(
        self, job: TranscriptionJob, reference_text: Optional[str] = None
    ) -> ComparisonResult:
        """Analyze accuracy of all attempts in a transcription job"""

        provider_results = {}
        cost_effectiveness = {}

        for attempt in job.attempts:
            if not attempt.success or not attempt.result:
                continue

            # Calculate accuracy metrics
            metrics = await self.calculate_accuracy_metrics(
                hypothesis=attempt.result.full_text,
                reference=reference_text,
                result=attempt.result,
            )

            provider_results[attempt.provider] = metrics

            # Calculate cost effectiveness (accuracy per dollar)
            if attempt.cost > 0:
                cost_effectiveness[attempt.provider] = (
                    metrics.word_accuracy / attempt.cost
                )
            else:
                cost_effectiveness[attempt.provider] = (
                    metrics.word_accuracy
                )  # Free service

        # Calculate rankings
        rankings = self._calculate_provider_rankings(provider_results)

        # Determine best provider
        best_provider = rankings[0][0] if rankings else None

        # Detailed analysis
        detailed_analysis = await self._perform_detailed_analysis(
            job, provider_results, reference_text
        )

        return ComparisonResult(
            job_id=job.id,
            reference_text=reference_text,
            provider_results=provider_results,
            rankings=rankings,
            best_provider=best_provider,
            cost_effectiveness=cost_effectiveness,
            detailed_analysis=detailed_analysis,
            timestamp=datetime.utcnow(),
        )

    async def calculate_accuracy_metrics(
        self,
        hypothesis: str,
        reference: Optional[str] = None,
        result: Optional[TranscriptionResult] = None,
    ) -> AccuracyMetrics:
        """Calculate comprehensive accuracy metrics"""

        # Clean and normalize texts
        hypothesis_clean = self._normalize_text(hypothesis)

        if reference:
            reference_clean = self._normalize_text(reference)

            # Calculate error rates using jiwer
            word_error_rate = wer(reference_clean, hypothesis_clean)
            character_error_rate = cer(reference_clean, hypothesis_clean)
            match_error_rate = mer(reference_clean, hypothesis_clean)

            # Calculate BLEU score
            bleu_score = self._calculate_bleu_score(reference_clean, hypothesis_clean)

            # Calculate semantic similarity
            semantic_similarity = await self._calculate_semantic_similarity(
                reference_clean, hypothesis_clean
            )

            # Detailed error analysis
            substitutions, insertions, deletions, total_words = self._analyze_errors(
                reference_clean, hypothesis_clean
            )

            # Word and sentence accuracy
            word_accuracy = 1.0 - word_error_rate
            sentence_accuracy = self._calculate_sentence_accuracy(
                reference_clean, hypothesis_clean
            )

            # Timestamp accuracy
            timestamp_accuracy = (
                self._calculate_timestamp_accuracy(reference, result) if result else 0.0
            )

        else:
            # No reference text - can only calculate intrinsic metrics
            word_error_rate = 0.0
            character_error_rate = 0.0
            match_error_rate = 0.0
            bleu_score = 0.0
            semantic_similarity = 0.0
            substitutions = insertions = deletions = 0
            total_words = len(hypothesis_clean.split())
            word_accuracy = 0.0
            sentence_accuracy = 0.0
            timestamp_accuracy = 0.0

        # Quality metrics that don't require reference
        readability_score = self._calculate_readability_score(hypothesis_clean)
        confidence_score = self._extract_confidence_score(result) if result else 0.0
        processing_speed = result.metrics.real_time_factor if result else 0.0

        # Speaker accuracy (if available)
        speaker_accuracy = None
        speaker_confusion_matrix = None
        if result and reference:
            speaker_accuracy, speaker_confusion_matrix = (
                self._calculate_speaker_accuracy(result, reference)
            )

        return AccuracyMetrics(
            word_error_rate=word_error_rate,
            character_error_rate=character_error_rate,
            match_error_rate=match_error_rate,
            bleu_score=bleu_score,
            semantic_similarity=semantic_similarity,
            word_accuracy=word_accuracy,
            sentence_accuracy=sentence_accuracy,
            substitution_errors=substitutions,
            insertion_errors=insertions,
            deletion_errors=deletions,
            total_words=total_words,
            readability_score=readability_score,
            confidence_score=confidence_score,
            timestamp_accuracy=timestamp_accuracy,
            processing_speed=processing_speed,
            speaker_accuracy=speaker_accuracy,
            speaker_confusion_matrix=speaker_confusion_matrix,
        )

    def _normalize_text(self, text: str) -> str:
        """Normalize text for comparison"""
        if not text:
            return ""

        # Convert to lowercase
        text = text.lower()

        # Remove extra whitespace
        text = re.sub(r"\s+", " ", text).strip()

        # Remove punctuation for word-level comparison
        text = text.translate(str.maketrans("", "", string.punctuation))

        return text

    def _calculate_bleu_score(self, reference: str, hypothesis: str) -> float:
        """Calculate BLEU score"""
        try:
            reference_tokens = word_tokenize(reference)
            hypothesis_tokens = word_tokenize(hypothesis)

            # BLEU score expects list of reference sentences
            return sentence_bleu(
                [reference_tokens],
                hypothesis_tokens,
                smoothing_function=self.smoothing.method1,
            )
        except Exception as e:
            logger.error(f"BLEU score calculation failed: {e}")
            return 0.0

    async def _calculate_semantic_similarity(
        self, reference: str, hypothesis: str
    ) -> float:
        """Calculate semantic similarity using simple word overlap"""
        # This is a simplified implementation
        # In production, you might use sentence transformers or other models

        ref_words = set(word_tokenize(reference.lower())) - self.stop_words
        hyp_words = set(word_tokenize(hypothesis.lower())) - self.stop_words

        if not ref_words and not hyp_words:
            return 1.0
        if not ref_words or not hyp_words:
            return 0.0

        intersection = ref_words.intersection(hyp_words)
        union = ref_words.union(hyp_words)

        return len(intersection) / len(union)

    def _analyze_errors(
        self, reference: str, hypothesis: str
    ) -> Tuple[int, int, int, int]:
        """Analyze substitution, insertion, and deletion errors"""
        ref_words = reference.split()
        hyp_words = hypothesis.split()

        # Use difflib to get detailed differences
        matcher = difflib.SequenceMatcher(None, ref_words, hyp_words)
        opcodes = matcher.get_opcodes()

        substitutions = 0
        insertions = 0
        deletions = 0

        for tag, i1, i2, j1, j2 in opcodes:
            if tag == "replace":
                substitutions += max(i2 - i1, j2 - j1)
            elif tag == "insert":
                insertions += j2 - j1
            elif tag == "delete":
                deletions += i2 - i1

        return substitutions, insertions, deletions, len(ref_words)

    def _calculate_sentence_accuracy(self, reference: str, hypothesis: str) -> float:
        """Calculate sentence-level accuracy"""
        ref_sentences = sent_tokenize(reference)
        hyp_sentences = sent_tokenize(hypothesis)

        if not ref_sentences:
            return 0.0

        # Simple sentence matching
        correct_sentences = 0
        for ref_sent in ref_sentences:
            ref_sent_clean = self._normalize_text(ref_sent)
            for hyp_sent in hyp_sentences:
                hyp_sent_clean = self._normalize_text(hyp_sent)
                if ref_sent_clean == hyp_sent_clean:
                    correct_sentences += 1
                    break

        return correct_sentences / len(ref_sentences)

    def _calculate_readability_score(self, text: str) -> float:
        """Calculate text readability score (simplified)"""
        if not text:
            return 0.0

        words = text.split()
        sentences = sent_tokenize(text)

        if not sentences:
            return 0.0

        avg_sentence_length = len(words) / len(sentences)
        avg_word_length = sum(len(word) for word in words) / len(words) if words else 0

        # Simplified readability score (lower is more readable)
        score = (avg_sentence_length * 0.5) + (avg_word_length * 0.5)

        # Normalize to 0-1 scale (higher is better)
        return max(0, 1 - (score / 20))  # 20 is arbitrary normalization factor

    def _extract_confidence_score(self, result: TranscriptionResult) -> float:
        """Extract average confidence score from transcription result"""
        if not result.segments:
            return result.metrics.confidence_score

        confidences = []
        for segment in result.segments:
            # Use inverse of no_speech_prob as confidence
            confidence = 1.0 - segment.no_speech_prob
            confidences.append(confidence)

        return statistics.mean(confidences) if confidences else 0.0

    def _calculate_timestamp_accuracy(
        self, reference: str, result: TranscriptionResult
    ) -> float:
        """Calculate timestamp accuracy (simplified)"""
        # This is a placeholder implementation
        # Real timestamp accuracy would require reference timestamps

        if not result.segments:
            return 0.0

        # Check if timestamps are reasonable (no overlaps, proper ordering)
        valid_timestamps = 0
        total_segments = len(result.segments)

        for i, segment in enumerate(result.segments):
            # Check basic timestamp validity
            if segment.start_time >= 0 and segment.end_time > segment.start_time:
                valid_timestamps += 1

            # Check ordering with previous segment
            if i > 0 and segment.start_time >= result.segments[i - 1].end_time:
                valid_timestamps += 0.5  # Bonus for proper ordering

        return (
            min(1.0, valid_timestamps / total_segments) if total_segments > 0 else 0.0
        )

    def _calculate_speaker_accuracy(
        self, result: TranscriptionResult, reference: str
    ) -> Tuple[float, Dict[str, Dict[str, int]]]:
        """Calculate speaker identification accuracy"""
        # Placeholder implementation - would require reference speaker labels
        # Returns accuracy and confusion matrix

        speaker_accuracy = 0.8  # Placeholder
        confusion_matrix = {
            "Speaker A": {"Speaker A": 10, "Speaker B": 2},
            "Speaker B": {"Speaker A": 1, "Speaker B": 8},
        }

        return speaker_accuracy, confusion_matrix

    def _calculate_provider_rankings(
        self, provider_results: Dict[TranscriptionProvider, AccuracyMetrics]
    ) -> List[Tuple[TranscriptionProvider, float]]:
        """Calculate overall rankings for providers"""

        rankings = []

        for provider, metrics in provider_results.items():
            # Calculate composite score
            score = (
                metrics.word_accuracy * 0.3
                + metrics.bleu_score * 0.2
                + metrics.semantic_similarity * 0.2
                + metrics.confidence_score * 0.1
                + metrics.readability_score * 0.1
                + (1.0 - metrics.character_error_rate) * 0.1
            )

            rankings.append((provider, score))

        # Sort by score (descending)
        rankings.sort(key=lambda x: x[1], reverse=True)

        return rankings

    async def _perform_detailed_analysis(
        self,
        job: TranscriptionJob,
        provider_results: Dict[TranscriptionProvider, AccuracyMetrics],
        reference_text: Optional[str],
    ) -> Dict[str, Any]:
        """Perform detailed analysis of transcription results"""

        analysis = {
            "total_providers": len(provider_results),
            "successful_providers": len([p for p in job.attempts if p.success]),
            "total_cost": job.total_cost,
            "audio_duration": job.audio_duration,
            "processing_times": {},
            "error_patterns": {},
            "quality_distribution": {},
            "recommendations": [],
        }

        # Processing times
        for attempt in job.attempts:
            if attempt.success:
                analysis["processing_times"][
                    attempt.provider.value
                ] = attempt.processing_time

        # Error patterns analysis
        if reference_text:
            analysis["error_patterns"] = await self._analyze_error_patterns(
                job, reference_text
            )

        # Quality distribution
        if provider_results:
            word_accuracies = [m.word_accuracy for m in provider_results.values()]
            analysis["quality_distribution"] = {
                "mean_accuracy": statistics.mean(word_accuracies),
                "std_accuracy": (
                    statistics.stdev(word_accuracies) if len(word_accuracies) > 1 else 0
                ),
                "min_accuracy": min(word_accuracies),
                "max_accuracy": max(word_accuracies),
            }

        # Generate recommendations
        analysis["recommendations"] = self._generate_recommendations(
            provider_results, job
        )

        return analysis

    async def _analyze_error_patterns(
        self, job: TranscriptionJob, reference_text: str
    ) -> Dict[str, Any]:
        """Analyze common error patterns across providers"""

        error_patterns = {
            "common_substitutions": Counter(),
            "common_deletions": Counter(),
            "common_insertions": Counter(),
            "problematic_words": Counter(),
        }

        reference_words = self._normalize_text(reference_text).split()

        for attempt in job.attempts:
            if not attempt.success or not attempt.result:
                continue

            hypothesis_words = self._normalize_text(attempt.result.full_text).split()

            # Analyze word-level differences
            matcher = difflib.SequenceMatcher(None, reference_words, hypothesis_words)
            opcodes = matcher.get_opcodes()

            for tag, i1, i2, j1, j2 in opcodes:
                if tag == "replace":
                    for k in range(min(i2 - i1, j2 - j1)):
                        ref_word = reference_words[i1 + k]
                        hyp_word = hypothesis_words[j1 + k]
                        error_patterns["common_substitutions"][
                            (ref_word, hyp_word)
                        ] += 1
                        error_patterns["problematic_words"][ref_word] += 1

                elif tag == "delete":
                    for k in range(i2 - i1):
                        ref_word = reference_words[i1 + k]
                        error_patterns["common_deletions"][ref_word] += 1
                        error_patterns["problematic_words"][ref_word] += 1

                elif tag == "insert":
                    for k in range(j2 - j1):
                        hyp_word = hypothesis_words[j1 + k]
                        error_patterns["common_insertions"][hyp_word] += 1

        # Convert Counters to regular dicts for JSON serialization
        return {
            key: dict(counter.most_common(10))
            for key, counter in error_patterns.items()
        }

    def _generate_recommendations(
        self,
        provider_results: Dict[TranscriptionProvider, AccuracyMetrics],
        job: TranscriptionJob,
    ) -> List[str]:
        """Generate recommendations based on analysis"""

        recommendations = []

        if not provider_results:
            recommendations.append("No successful transcriptions to analyze")
            return recommendations

        # Best provider recommendation
        best_provider = max(provider_results.items(), key=lambda x: x[1].word_accuracy)
        recommendations.append(
            f"Best accuracy: {best_provider[0].value} ({best_provider[1].word_accuracy:.2%})"
        )

        # Cost effectiveness
        cost_effective = None
        best_ratio = 0
        for attempt in job.attempts:
            if (
                attempt.success
                and attempt.cost > 0
                and attempt.provider in provider_results
            ):
                ratio = provider_results[attempt.provider].word_accuracy / attempt.cost
                if ratio > best_ratio:
                    best_ratio = ratio
                    cost_effective = attempt.provider

        if cost_effective:
            recommendations.append(f"Most cost-effective: {cost_effective.value}")

        # Quality recommendations
        avg_accuracy = statistics.mean(
            [m.word_accuracy for m in provider_results.values()]
        )
        if avg_accuracy < 0.8:
            recommendations.append(
                "Consider using higher-quality models or improving audio quality"
            )

        # Speed recommendations
        if job.audio_duration > 0:
            fast_providers = [
                p.value
                for p, m in provider_results.items()
                if m.processing_speed < 1.0  # Real-time capable
            ]
            if fast_providers:
                recommendations.append(
                    f"For real-time use: {', '.join(fast_providers)}"
                )

        return recommendations

    async def run_benchmark_test(
        self, providers: List[TranscriptionProvider]
    ) -> Dict[str, ComparisonResult]:
        """Run benchmark tests with known reference texts"""

        from cloud_transcription_service import cloud_transcription_service

        benchmark_results = {}

        for test_name, reference_text in self.benchmark_texts.items():
            try:
                # Generate synthetic audio for the reference text
                # This would require a TTS service - for now we'll simulate
                audio_data = self._generate_synthetic_audio(reference_text)

                # Run transcription job in comparison mode
                job = await cloud_transcription_service.transcribe_with_fallback(
                    session_id=f"benchmark_{test_name}",
                    audio_chunk_id=str(uuid.uuid4()),
                    audio_data=audio_data,
                    audio_duration=len(reference_text.split())
                    * 0.5,  # Approximate duration
                    preferred_providers=providers,
                    comparison_mode=True,
                )

                # Analyze results
                comparison_result = await self.analyze_transcription_job(
                    job, reference_text
                )
                benchmark_results[test_name] = comparison_result

            except Exception as e:
                logger.error(f"Benchmark test {test_name} failed: {e}")

        return benchmark_results

    def _generate_synthetic_audio(self, text: str) -> bytes:
        """Generate synthetic audio for testing (placeholder)"""
        # This is a placeholder - in a real implementation, you'd use a TTS service
        # For now, return empty bytes
        return b"placeholder_audio_data"


# Global analyzer instance
accuracy_analyzer = TranscriptionAccuracyAnalyzer()

# Export main components
__all__ = [
    "accuracy_analyzer",
    "TranscriptionAccuracyAnalyzer",
    "AccuracyMetrics",
    "ComparisonResult",
    "AccuracyMetric",
]
