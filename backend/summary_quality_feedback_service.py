# Summary Quality Feedback Service
# Service for collecting, analyzing, and applying user feedback on summary quality

import asyncio
import json
import time
import uuid
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any, Tuple
from dataclasses import dataclass, asdict
from enum import Enum
import logging
from collections import defaultdict, Counter
import statistics
import numpy as np


class FeedbackType(Enum):
    """Types of feedback"""

    RATING = "rating"  # Numerical rating (1-5)
    THUMBS = "thumbs"  # Thumbs up/down
    DETAILED = "detailed"  # Detailed text feedback
    QUICK_SELECT = "quick_select"  # Pre-defined options
    COMPARISON = "comparison"  # Compare multiple summaries
    CORRECTION = "correction"  # Corrections to content
    SUGGESTION = "suggestion"  # Suggestions for improvement


class FeedbackCategory(Enum):
    """Categories of feedback"""

    ACCURACY = "accuracy"  # Factual accuracy
    COMPLETENESS = "completeness"  # Coverage of key points
    CLARITY = "clarity"  # Readability and understanding
    CONCISENESS = "conciseness"  # Appropriate length
    RELEVANCE = "relevance"  # Focus on important topics
    ACTION_ITEMS = "action_items"  # Action item identification
    DECISIONS = "decisions"  # Decision capture
    TONE = "tone"  # Appropriate tone/style
    FORMATTING = "formatting"  # Structure and format
    OVERALL = "overall"  # General satisfaction


class FeedbackSentiment(Enum):
    """Sentiment of feedback"""

    VERY_POSITIVE = "very_positive"  # 5/5, excellent
    POSITIVE = "positive"  # 4/5, good
    NEUTRAL = "neutral"  # 3/5, acceptable
    NEGATIVE = "negative"  # 2/5, poor
    VERY_NEGATIVE = "very_negative"  # 1/5, very poor


@dataclass
class FeedbackEntry:
    """Individual feedback entry"""

    id: str
    summary_id: str
    meeting_id: str
    user_id: str
    feedback_type: FeedbackType
    category: FeedbackCategory
    sentiment: FeedbackSentiment
    rating: Optional[int]  # 1-5 scale
    text_feedback: Optional[str]
    selected_options: List[str]
    corrections: Dict[str, str]  # original -> corrected
    suggestions: List[str]
    time_to_feedback: float  # seconds from summary generation
    context: Dict[str, Any]
    created_at: datetime
    is_anonymous: bool
    helpful_votes: int


@dataclass
class FeedbackSummary:
    """Aggregated feedback for a summary"""

    summary_id: str
    total_feedback_count: int
    average_rating: float
    sentiment_distribution: Dict[FeedbackSentiment, int]
    category_ratings: Dict[FeedbackCategory, float]
    common_issues: List[str]
    improvement_suggestions: List[str]
    confidence_score: float
    last_updated: datetime


@dataclass
class QualityMetrics:
    """Quality metrics for summarization system"""

    overall_satisfaction: float
    accuracy_score: float
    completeness_score: float
    clarity_score: float
    user_retention: float
    feedback_frequency: float
    improvement_trends: Dict[str, float]
    benchmark_comparison: Dict[str, float]


@dataclass
class FeedbackInsight:
    """Insight derived from feedback analysis"""

    id: str
    insight_type: str
    description: str
    affected_summaries: List[str]
    confidence: float
    recommended_actions: List[str]
    impact_estimate: float
    priority: str  # 'low', 'medium', 'high', 'critical'
    created_at: datetime


class SummaryQualityFeedbackService:
    """
    Service for collecting and analyzing feedback on summary quality

    Features:
    - Multiple feedback types and collection methods
    - Real-time feedback analysis and aggregation
    - Quality trend tracking and alerting
    - Automated insight generation from feedback
    - A/B testing support for summary improvements
    - Feedback-driven model training recommendations

    Architecture:

    1. Feedback Collection:
       - Multiple feedback mechanisms (ratings, text, corrections)
       - Context-aware feedback capture
       - Anonymous and identified feedback support
       - Real-time and batch feedback processing

    2. Analysis and Aggregation:
       - Statistical analysis of feedback trends
       - Sentiment analysis of text feedback
       - Correlation analysis across categories
       - Outlier detection and validation

    3. Insight Generation:
       - Pattern recognition in feedback data
       - Quality degradation detection
       - Improvement opportunity identification
       - Performance benchmark tracking

    4. Action Recommendations:
       - Automated quality alerts
       - Model retraining recommendations
       - Template optimization suggestions
       - Process improvement guidance
    """

    def __init__(self):
        """Initialize the feedback service"""
        # Feedback storage
        self.feedback_entries: Dict[str, FeedbackEntry] = {}
        self.feedback_summaries: Dict[str, FeedbackSummary] = {}

        # Quality tracking
        self.quality_metrics: Optional[QualityMetrics] = None
        self.feedback_insights: List[FeedbackInsight] = []

        # Performance tracking
        self.stats = {
            "total_feedback": 0,
            "feedback_by_type": Counter(),
            "feedback_by_category": Counter(),
            "feedback_by_sentiment": Counter(),
            "avg_rating": 0.0,
            "response_rate": 0.0,
        }

        # Feedback templates and prompts
        self.feedback_prompts = self._initialize_feedback_prompts()

        # Alert thresholds
        self.alert_thresholds = {
            "low_rating": 2.5,
            "high_negative_sentiment": 0.3,
            "low_response_rate": 0.1,
            "quality_degradation": 0.2,
        }

        self.logger = logging.getLogger(__name__)

    def _initialize_feedback_prompts(self) -> Dict[str, Dict[str, Any]]:
        """Initialize feedback collection prompts and options"""

        return {
            "quick_rating": {
                "prompt": "How would you rate this summary?",
                "options": [
                    {"value": 5, "label": "Excellent - Captures everything perfectly"},
                    {"value": 4, "label": "Good - Covers most important points"},
                    {"value": 3, "label": "Okay - Adequate but could be better"},
                    {"value": 2, "label": "Poor - Missing key information"},
                    {"value": 1, "label": "Very Poor - Inaccurate or unhelpful"},
                ],
            },
            "quick_issues": {
                "prompt": "What could be improved? (Select all that apply)",
                "options": [
                    "Missing important action items",
                    "Inaccurate information",
                    "Too long or wordy",
                    "Too short or incomplete",
                    "Unclear or confusing",
                    "Wrong tone or style",
                    "Poor formatting",
                    "Missing key decisions",
                    "Irrelevant information included",
                    "Other",
                ],
            },
            "category_rating": {
                "prompt": "Please rate each aspect of the summary:",
                "categories": [
                    {"category": "accuracy", "label": "Factual Accuracy"},
                    {"category": "completeness", "label": "Completeness"},
                    {"category": "clarity", "label": "Clarity"},
                    {"category": "conciseness", "label": "Conciseness"},
                    {"category": "action_items", "label": "Action Items"},
                    {"category": "decisions", "label": "Key Decisions"},
                ],
            },
            "improvement_suggestions": {
                "prompt": "How can we improve this summary?",
                "placeholder": "Please share specific suggestions for improvement...",
            },
        }

    async def collect_feedback(
        self,
        summary_id: str,
        meeting_id: str,
        user_id: str,
        feedback_data: Dict[str, Any],
        context: Dict[str, Any] = None,
    ) -> str:
        """Collect feedback on a summary"""

        try:
            # Parse feedback data
            feedback_type = FeedbackType(feedback_data.get("type", "rating"))
            category = FeedbackCategory(feedback_data.get("category", "overall"))

            # Determine sentiment
            sentiment = self._determine_sentiment(feedback_data)

            # Create feedback entry
            feedback_id = f"feedback_{uuid.uuid4().hex[:8]}"

            feedback_entry = FeedbackEntry(
                id=feedback_id,
                summary_id=summary_id,
                meeting_id=meeting_id,
                user_id=user_id,
                feedback_type=feedback_type,
                category=category,
                sentiment=sentiment,
                rating=feedback_data.get("rating"),
                text_feedback=feedback_data.get("text"),
                selected_options=feedback_data.get("selected_options", []),
                corrections=feedback_data.get("corrections", {}),
                suggestions=feedback_data.get("suggestions", []),
                time_to_feedback=feedback_data.get("time_to_feedback", 0.0),
                context=context or {},
                created_at=datetime.now(),
                is_anonymous=feedback_data.get("is_anonymous", False),
                helpful_votes=0,
            )

            # Store feedback
            self.feedback_entries[feedback_id] = feedback_entry

            # Update aggregated feedback for the summary
            await self._update_feedback_summary(summary_id)

            # Update global statistics
            self._update_stats(feedback_entry)

            # Check for alerts
            await self._check_quality_alerts(summary_id)

            # Generate insights if enough feedback accumulated
            if len(self.feedback_entries) % 10 == 0:  # Every 10 feedback entries
                await self._generate_insights()

            self.logger.info(
                f"Collected feedback {feedback_id} for summary {summary_id}"
            )

            return feedback_id

        except Exception as e:
            self.logger.error(f"Failed to collect feedback: {e}")
            raise

    def _determine_sentiment(self, feedback_data: Dict[str, Any]) -> FeedbackSentiment:
        """Determine sentiment from feedback data"""

        # Rating-based sentiment
        if "rating" in feedback_data:
            rating = feedback_data["rating"]
            if rating >= 5:
                return FeedbackSentiment.VERY_POSITIVE
            elif rating >= 4:
                return FeedbackSentiment.POSITIVE
            elif rating >= 3:
                return FeedbackSentiment.NEUTRAL
            elif rating >= 2:
                return FeedbackSentiment.NEGATIVE
            else:
                return FeedbackSentiment.VERY_NEGATIVE

        # Thumbs up/down sentiment
        if "thumbs" in feedback_data:
            return (
                FeedbackSentiment.POSITIVE
                if feedback_data["thumbs"]
                else FeedbackSentiment.NEGATIVE
            )

        # Text sentiment analysis (simplified)
        if "text" in feedback_data:
            text = feedback_data["text"].lower()
            positive_words = [
                "good",
                "great",
                "excellent",
                "perfect",
                "accurate",
                "helpful",
                "clear",
            ]
            negative_words = [
                "bad",
                "poor",
                "terrible",
                "inaccurate",
                "confusing",
                "missing",
                "wrong",
            ]

            positive_count = sum(1 for word in positive_words if word in text)
            negative_count = sum(1 for word in negative_words if word in text)

            if positive_count > negative_count:
                return FeedbackSentiment.POSITIVE
            elif negative_count > positive_count:
                return FeedbackSentiment.NEGATIVE
            else:
                return FeedbackSentiment.NEUTRAL

        return FeedbackSentiment.NEUTRAL

    async def _update_feedback_summary(self, summary_id: str):
        """Update aggregated feedback summary for a summary"""

        # Get all feedback for this summary
        summary_feedback = [
            feedback
            for feedback in self.feedback_entries.values()
            if feedback.summary_id == summary_id
        ]

        if not summary_feedback:
            return

        # Calculate metrics
        total_count = len(summary_feedback)

        # Average rating
        ratings = [f.rating for f in summary_feedback if f.rating is not None]
        avg_rating = statistics.mean(ratings) if ratings else 0.0

        # Sentiment distribution
        sentiment_dist = Counter(f.sentiment for f in summary_feedback)

        # Category ratings
        category_ratings = {}
        for category in FeedbackCategory:
            category_feedback = [f for f in summary_feedback if f.category == category]
            if category_feedback:
                category_ratings_list = [
                    f.rating for f in category_feedback if f.rating is not None
                ]
                if category_ratings_list:
                    category_ratings[category] = statistics.mean(category_ratings_list)

        # Common issues
        all_issues = []
        for feedback in summary_feedback:
            all_issues.extend(feedback.selected_options)
        issue_counts = Counter(all_issues)
        common_issues = [issue for issue, count in issue_counts.most_common(5)]

        # Improvement suggestions
        all_suggestions = []
        for feedback in summary_feedback:
            all_suggestions.extend(feedback.suggestions)
            if feedback.text_feedback:
                all_suggestions.append(feedback.text_feedback)

        # Calculate confidence score
        confidence_score = self._calculate_feedback_confidence(summary_feedback)

        # Create or update feedback summary
        feedback_summary = FeedbackSummary(
            summary_id=summary_id,
            total_feedback_count=total_count,
            average_rating=avg_rating,
            sentiment_distribution=dict(sentiment_dist),
            category_ratings=category_ratings,
            common_issues=common_issues,
            improvement_suggestions=all_suggestions[:10],  # Top 10
            confidence_score=confidence_score,
            last_updated=datetime.now(),
        )

        self.feedback_summaries[summary_id] = feedback_summary

    def _calculate_feedback_confidence(
        self, feedback_list: List[FeedbackEntry]
    ) -> float:
        """Calculate confidence score based on feedback consistency"""

        if len(feedback_list) < 2:
            return 0.5  # Low confidence with insufficient data

        # Rating consistency
        ratings = [f.rating for f in feedback_list if f.rating is not None]
        if ratings:
            rating_std = statistics.stdev(ratings) if len(ratings) > 1 else 0
            rating_consistency = max(
                0, 1 - (rating_std / 2)
            )  # Normalize standard deviation
        else:
            rating_consistency = 0.5

        # Sentiment consistency
        sentiments = [f.sentiment.value for f in feedback_list]
        sentiment_counter = Counter(sentiments)
        most_common_sentiment_ratio = sentiment_counter.most_common(1)[0][1] / len(
            sentiments
        )

        # Volume factor (more feedback = higher confidence)
        volume_factor = min(1.0, len(feedback_list) / 10)  # Cap at 10 feedback entries

        # Combined confidence
        confidence = (
            rating_consistency * 0.4
            + most_common_sentiment_ratio * 0.4
            + volume_factor * 0.2
        )

        return min(1.0, confidence)

    def _update_stats(self, feedback_entry: FeedbackEntry):
        """Update global statistics"""

        self.stats["total_feedback"] += 1
        self.stats["feedback_by_type"][feedback_entry.feedback_type.value] += 1
        self.stats["feedback_by_category"][feedback_entry.category.value] += 1
        self.stats["feedback_by_sentiment"][feedback_entry.sentiment.value] += 1

        # Update average rating
        if feedback_entry.rating is not None:
            total_ratings = sum(
                1 for f in self.feedback_entries.values() if f.rating is not None
            )
            total_rating_sum = sum(
                f.rating for f in self.feedback_entries.values() if f.rating is not None
            )
            self.stats["avg_rating"] = (
                total_rating_sum / total_ratings if total_ratings > 0 else 0.0
            )

    async def _check_quality_alerts(self, summary_id: str):
        """Check for quality alerts and trigger notifications"""

        summary_feedback = self.feedback_summaries.get(summary_id)
        if not summary_feedback:
            return

        alerts = []

        # Low rating alert
        if summary_feedback.average_rating < self.alert_thresholds["low_rating"]:
            alerts.append(
                {
                    "type": "low_rating",
                    "severity": "high",
                    "message": f"Summary {summary_id} has low average rating: {summary_feedback.average_rating:.1f}",
                    "summary_id": summary_id,
                }
            )

        # High negative sentiment alert
        negative_sentiments = summary_feedback.sentiment_distribution.get(
            FeedbackSentiment.NEGATIVE, 0
        ) + summary_feedback.sentiment_distribution.get(
            FeedbackSentiment.VERY_NEGATIVE, 0
        )
        negative_ratio = negative_sentiments / summary_feedback.total_feedback_count

        if negative_ratio > self.alert_thresholds["high_negative_sentiment"]:
            alerts.append(
                {
                    "type": "high_negative_sentiment",
                    "severity": "medium",
                    "message": f"Summary {summary_id} has high negative sentiment: {negative_ratio:.1%}",
                    "summary_id": summary_id,
                }
            )

        # Log alerts
        for alert in alerts:
            self.logger.warning(f"Quality alert: {alert['message']}")

    async def _generate_insights(self):
        """Generate insights from accumulated feedback"""

        try:
            insights = []

            # Insight 1: Most common issues across all summaries
            all_issues = []
            for feedback in self.feedback_entries.values():
                all_issues.extend(feedback.selected_options)

            if all_issues:
                issue_counts = Counter(all_issues)
                top_issue = issue_counts.most_common(1)[0]

                if top_issue[1] >= 5:  # At least 5 occurrences
                    insights.append(
                        FeedbackInsight(
                            id=f"insight_common_issue_{uuid.uuid4().hex[:8]}",
                            insight_type="common_issue",
                            description=f"Most frequent issue: '{top_issue[0]}' reported {top_issue[1]} times",
                            affected_summaries=[],
                            confidence=min(1.0, top_issue[1] / 20),
                            recommended_actions=[
                                f"Review summarization logic for: {top_issue[0]}",
                                "Update training data or templates",
                                "Add specific quality checks",
                            ],
                            impact_estimate=top_issue[1] / len(self.feedback_entries),
                            priority="high" if top_issue[1] >= 10 else "medium",
                            created_at=datetime.now(),
                        )
                    )

            # Insight 2: Category performance analysis
            category_ratings = defaultdict(list)
            for feedback in self.feedback_entries.values():
                if feedback.rating is not None:
                    category_ratings[feedback.category.value].append(feedback.rating)

            for category, ratings in category_ratings.items():
                if len(ratings) >= 5:
                    avg_rating = statistics.mean(ratings)
                    if avg_rating < 3.0:
                        insights.append(
                            FeedbackInsight(
                                id=f"insight_low_category_{uuid.uuid4().hex[:8]}",
                                insight_type="low_category_performance",
                                description=f"Category '{category}' has low average rating: {avg_rating:.1f}",
                                affected_summaries=[],
                                confidence=min(1.0, len(ratings) / 20),
                                recommended_actions=[
                                    f"Improve {category} detection/generation",
                                    f"Review {category} quality metrics",
                                    f"Update {category} templates",
                                ],
                                impact_estimate=len(ratings)
                                / len(self.feedback_entries),
                                priority="high" if avg_rating < 2.5 else "medium",
                                created_at=datetime.now(),
                            )
                        )

            # Insight 3: Response time correlation
            quick_feedback = [
                f for f in self.feedback_entries.values() if f.time_to_feedback < 30
            ]
            slow_feedback = [
                f for f in self.feedback_entries.values() if f.time_to_feedback > 120
            ]

            if len(quick_feedback) >= 5 and len(slow_feedback) >= 5:
                quick_ratings = [
                    f.rating for f in quick_feedback if f.rating is not None
                ]
                slow_ratings = [f.rating for f in slow_feedback if f.rating is not None]

                if quick_ratings and slow_ratings:
                    quick_avg = statistics.mean(quick_ratings)
                    slow_avg = statistics.mean(slow_ratings)

                    if abs(quick_avg - slow_avg) > 0.5:
                        insights.append(
                            FeedbackInsight(
                                id=f"insight_response_time_{uuid.uuid4().hex[:8]}",
                                insight_type="response_time_correlation",
                                description=f"Response time affects ratings: Quick feedback avg {quick_avg:.1f}, Slow feedback avg {slow_avg:.1f}",
                                affected_summaries=[],
                                confidence=0.7,
                                recommended_actions=[
                                    "Analyze user engagement patterns",
                                    "Consider summary length optimization",
                                    "Implement engagement tracking",
                                ],
                                impact_estimate=0.3,
                                priority="medium",
                                created_at=datetime.now(),
                            )
                        )

            # Store insights
            self.feedback_insights.extend(insights)

            # Keep only recent insights (last 100)
            self.feedback_insights = sorted(
                self.feedback_insights, key=lambda x: x.created_at, reverse=True
            )[:100]

            if insights:
                self.logger.info(f"Generated {len(insights)} new feedback insights")

        except Exception as e:
            self.logger.error(f"Failed to generate insights: {e}")

    async def get_summary_feedback(self, summary_id: str) -> Optional[FeedbackSummary]:
        """Get aggregated feedback for a specific summary"""

        return self.feedback_summaries.get(summary_id)

    async def get_feedback_entries(
        self,
        summary_id: Optional[str] = None,
        meeting_id: Optional[str] = None,
        user_id: Optional[str] = None,
        category: Optional[FeedbackCategory] = None,
        sentiment: Optional[FeedbackSentiment] = None,
        limit: int = 100,
    ) -> List[FeedbackEntry]:
        """Get feedback entries with optional filtering"""

        entries = list(self.feedback_entries.values())

        # Apply filters
        if summary_id:
            entries = [e for e in entries if e.summary_id == summary_id]

        if meeting_id:
            entries = [e for e in entries if e.meeting_id == meeting_id]

        if user_id:
            entries = [e for e in entries if e.user_id == user_id]

        if category:
            entries = [e for e in entries if e.category == category]

        if sentiment:
            entries = [e for e in entries if e.sentiment == sentiment]

        # Sort by creation date (most recent first)
        entries.sort(key=lambda e: e.created_at, reverse=True)

        return entries[:limit]

    async def get_quality_metrics(self) -> QualityMetrics:
        """Get overall quality metrics"""

        # Calculate metrics from feedback data
        all_feedback = list(self.feedback_entries.values())

        if not all_feedback:
            return QualityMetrics(
                overall_satisfaction=0.0,
                accuracy_score=0.0,
                completeness_score=0.0,
                clarity_score=0.0,
                user_retention=0.0,
                feedback_frequency=0.0,
                improvement_trends={},
                benchmark_comparison={},
            )

        # Overall satisfaction (average rating)
        ratings = [f.rating for f in all_feedback if f.rating is not None]
        overall_satisfaction = statistics.mean(ratings) / 5.0 if ratings else 0.0

        # Category-specific scores
        accuracy_feedback = [
            f for f in all_feedback if f.category == FeedbackCategory.ACCURACY
        ]
        accuracy_ratings = [f.rating for f in accuracy_feedback if f.rating is not None]
        accuracy_score = (
            (statistics.mean(accuracy_ratings) / 5.0) if accuracy_ratings else 0.0
        )

        completeness_feedback = [
            f for f in all_feedback if f.category == FeedbackCategory.COMPLETENESS
        ]
        completeness_ratings = [
            f.rating for f in completeness_feedback if f.rating is not None
        ]
        completeness_score = (
            (statistics.mean(completeness_ratings) / 5.0)
            if completeness_ratings
            else 0.0
        )

        clarity_feedback = [
            f for f in all_feedback if f.category == FeedbackCategory.CLARITY
        ]
        clarity_ratings = [f.rating for f in clarity_feedback if f.rating is not None]
        clarity_score = (
            (statistics.mean(clarity_ratings) / 5.0) if clarity_ratings else 0.0
        )

        # User retention (simplified - users who provide multiple feedback)
        user_feedback_counts = Counter(f.user_id for f in all_feedback)
        repeat_users = sum(1 for count in user_feedback_counts.values() if count > 1)
        user_retention = (
            repeat_users / len(user_feedback_counts) if user_feedback_counts else 0.0
        )

        # Feedback frequency (feedback per day)
        if all_feedback:
            time_span = (datetime.now() - min(f.created_at for f in all_feedback)).days
            feedback_frequency = len(all_feedback) / max(1, time_span)
        else:
            feedback_frequency = 0.0

        # Improvement trends (last 30 days vs previous 30 days)
        thirty_days_ago = datetime.now() - timedelta(days=30)
        sixty_days_ago = datetime.now() - timedelta(days=60)

        recent_feedback = [f for f in all_feedback if f.created_at >= thirty_days_ago]
        previous_feedback = [
            f for f in all_feedback if sixty_days_ago <= f.created_at < thirty_days_ago
        ]

        improvement_trends = {}
        if recent_feedback and previous_feedback:
            recent_ratings = [f.rating for f in recent_feedback if f.rating is not None]
            previous_ratings = [
                f.rating for f in previous_feedback if f.rating is not None
            ]

            if recent_ratings and previous_ratings:
                recent_avg = statistics.mean(recent_ratings)
                previous_avg = statistics.mean(previous_ratings)
                improvement_trends["overall_rating"] = recent_avg - previous_avg

        # Benchmark comparison (placeholder)
        benchmark_comparison = {
            "industry_average": 0.75,  # Placeholder
            "our_performance": overall_satisfaction,
            "relative_performance": overall_satisfaction - 0.75,
        }

        return QualityMetrics(
            overall_satisfaction=overall_satisfaction,
            accuracy_score=accuracy_score,
            completeness_score=completeness_score,
            clarity_score=clarity_score,
            user_retention=user_retention,
            feedback_frequency=feedback_frequency,
            improvement_trends=improvement_trends,
            benchmark_comparison=benchmark_comparison,
        )

    async def get_feedback_insights(self, limit: int = 20) -> List[FeedbackInsight]:
        """Get recent feedback insights"""

        return self.feedback_insights[:limit]

    async def get_improvement_recommendations(
        self, summary_id: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """Get improvement recommendations based on feedback"""

        recommendations = []

        if summary_id:
            # Specific summary recommendations
            summary_feedback = self.feedback_summaries.get(summary_id)
            if summary_feedback:
                if summary_feedback.average_rating < 3.0:
                    recommendations.append(
                        {
                            "type": "quality_improvement",
                            "priority": "high",
                            "description": "Summary has low user satisfaction",
                            "actions": [
                                "Review summarization technique",
                                "Check for accuracy issues",
                                "Validate key point extraction",
                            ],
                            "affected_summaries": [summary_id],
                        }
                    )

                if summary_feedback.common_issues:
                    recommendations.append(
                        {
                            "type": "issue_resolution",
                            "priority": "medium",
                            "description": f"Common issues: {summary_feedback.common_issues[:3]}",
                            "actions": [
                                f"Address issue: {issue}"
                                for issue in summary_feedback.common_issues[:3]
                            ],
                            "affected_summaries": [summary_id],
                        }
                    )
        else:
            # Global recommendations
            quality_metrics = await self.get_quality_metrics()

            if quality_metrics.overall_satisfaction < 0.7:
                recommendations.append(
                    {
                        "type": "system_improvement",
                        "priority": "high",
                        "description": "Overall user satisfaction is below target",
                        "actions": [
                            "Review summarization algorithms",
                            "Update training data",
                            "Improve quality assurance processes",
                        ],
                        "affected_summaries": [],
                    }
                )

            if quality_metrics.accuracy_score < 0.8:
                recommendations.append(
                    {
                        "type": "accuracy_improvement",
                        "priority": "high",
                        "description": "Accuracy scores are below target",
                        "actions": [
                            "Improve fact extraction algorithms",
                            "Add accuracy validation steps",
                            "Review source material processing",
                        ],
                        "affected_summaries": [],
                    }
                )

        return recommendations

    async def get_feedback_prompts(
        self, prompt_type: str, context: Dict[str, Any] = None
    ) -> Dict[str, Any]:
        """Get feedback collection prompts"""

        if prompt_type in self.feedback_prompts:
            prompt_data = self.feedback_prompts[prompt_type].copy()

            # Customize prompts based on context
            if context:
                if "summary_type" in context:
                    summary_type = context["summary_type"]
                    if summary_type == "executive":
                        prompt_data["prompt"] = prompt_data["prompt"].replace(
                            "summary", "executive summary"
                        )
                    elif summary_type == "action_focused":
                        prompt_data["prompt"] = prompt_data["prompt"].replace(
                            "summary", "action items summary"
                        )

            return prompt_data

        return {}

    async def get_service_statistics(self) -> Dict[str, Any]:
        """Get service statistics"""

        quality_metrics = await self.get_quality_metrics()

        return {
            "total_feedback": self.stats["total_feedback"],
            "feedback_by_type": dict(self.stats["feedback_by_type"]),
            "feedback_by_category": dict(self.stats["feedback_by_category"]),
            "feedback_by_sentiment": dict(self.stats["feedback_by_sentiment"]),
            "average_rating": self.stats["avg_rating"],
            "quality_metrics": asdict(quality_metrics),
            "total_insights": len(self.feedback_insights),
            "summaries_with_feedback": len(self.feedback_summaries),
        }

    async def export_feedback_data(
        self,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        include_anonymous: bool = True,
    ) -> Dict[str, Any]:
        """Export feedback data for analysis"""

        # Filter feedback by date range
        feedback_entries = list(self.feedback_entries.values())

        if start_date:
            feedback_entries = [
                f for f in feedback_entries if f.created_at >= start_date
            ]

        if end_date:
            feedback_entries = [f for f in feedback_entries if f.created_at <= end_date]

        if not include_anonymous:
            feedback_entries = [f for f in feedback_entries if not f.is_anonymous]

        # Export data
        export_data = {
            "export_timestamp": datetime.now().isoformat(),
            "total_entries": len(feedback_entries),
            "date_range": {
                "start": start_date.isoformat() if start_date else None,
                "end": end_date.isoformat() if end_date else None,
            },
            "feedback_entries": [asdict(entry) for entry in feedback_entries],
            "feedback_summaries": {
                summary_id: asdict(summary)
                for summary_id, summary in self.feedback_summaries.items()
            },
            "insights": [asdict(insight) for insight in self.feedback_insights],
            "statistics": await self.get_service_statistics(),
        }

        return export_data


# Global service instance
summary_quality_feedback_service = None


async def get_summary_quality_feedback_service() -> SummaryQualityFeedbackService:
    """Get the global summary quality feedback service instance"""
    global summary_quality_feedback_service
    if summary_quality_feedback_service is None:
        summary_quality_feedback_service = SummaryQualityFeedbackService()
    return summary_quality_feedback_service
