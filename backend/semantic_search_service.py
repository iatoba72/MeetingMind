# Semantic Search Service
# Advanced semantic search capabilities with meeting-specific optimizations

import asyncio
import json
import time
import uuid
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any, Tuple, Set
from dataclasses import dataclass, asdict
from enum import Enum
import logging
import re
from collections import defaultdict, Counter
import statistics

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

from vector_storage_service import (
    VectorStorageService,
    get_vector_storage_service,
    DocumentType,
    SearchMode,
    SearchResult,
    VectorDocument,
)


class QueryType(Enum):
    """Types of search queries"""

    KEYWORD = "keyword"  # Traditional keyword search
    NATURAL_LANGUAGE = "natural_language"  # Natural language questions
    SEMANTIC = "semantic"  # Concept-based search
    TEMPORAL = "temporal"  # Time-based search
    SPEAKER = "speaker"  # Speaker-specific search
    ACTION_ITEM = "action_item"  # Search for action items
    DECISION = "decision"  # Search for decisions
    TOPIC = "topic"  # Topic-focused search


class SearchContext(Enum):
    """Context for search to improve relevance"""

    CURRENT_MEETING = "current_meeting"
    RECENT_MEETINGS = "recent_meetings"
    ALL_MEETINGS = "all_meetings"
    SIMILAR_MEETINGS = "similar_meetings"
    SPEAKER_HISTORY = "speaker_history"
    TOPIC_RELATED = "topic_related"


@dataclass
class QueryAnalysis:
    """Analysis of user query to improve search"""

    query_type: QueryType
    intent: str
    entities: List[str]
    keywords: List[str]
    temporal_indicators: List[str]
    speaker_mentions: List[str]
    topic_indicators: List[str]
    confidence: float


@dataclass
class SearchContextInfo:
    """Context information for search refinement"""

    meeting_id: Optional[str]
    speaker_filter: Optional[str]
    time_range: Optional[Tuple[datetime, datetime]]
    topic_filter: Optional[str]
    document_types: List[DocumentType]
    priority_boost: Dict[str, float]


@dataclass
class EnhancedSearchResult:
    """Enhanced search result with additional context"""

    base_result: SearchResult
    context_score: float
    relevance_explanation: str
    related_documents: List[str]
    snippet: str
    highlights: List[str]
    meeting_context: Dict[str, Any]


@dataclass
class SearchSuggestion:
    """Search suggestion for query refinement"""

    suggestion: str
    description: str
    query_type: QueryType
    estimated_results: int


class SemanticSearchService:
    """
    Advanced semantic search service for MeetingMind

    This service provides intelligent search capabilities that understand
    the context and intent behind user queries, going beyond simple keyword matching.

    Key Features:
    - Natural language query understanding
    - Context-aware search refinement
    - Meeting-specific search optimizations
    - Multi-modal search (text, speaker, time, topic)
    - Search result explanation and highlighting
    - Query suggestions and auto-completion

    Technical Approach:

    1. Query Analysis:
       - Parse user intent (looking for action items, decisions, etc.)
       - Extract entities (speakers, dates, topics)
       - Identify query type and context

    2. Semantic Matching:
       - Use embeddings to find conceptually similar content
       - Combine with keyword matching for hybrid search
       - Apply context filters and relevance boosting

    3. Result Enhancement:
       - Generate explanations for why results matched
       - Create relevant snippets and highlights
       - Rank results based on multiple factors
    """

    def __init__(self, vector_service: VectorStorageService = None):
        """Initialize the semantic search service"""
        self.vector_service = vector_service

        # Query analysis patterns
        self.query_patterns = self._initialize_query_patterns()

        # Search statistics
        self.search_stats = {
            "total_searches": 0,
            "queries_by_type": Counter(),
            "avg_response_time": 0.0,
            "popular_queries": Counter(),
            "zero_result_queries": [],
        }

        # Cache for frequent searches
        self.search_cache: Dict[str, List[EnhancedSearchResult]] = {}
        self.cache_ttl = 300  # 5 minutes

        self.logger = logging.getLogger(__name__)

    def _initialize_query_patterns(self) -> Dict[QueryType, List[str]]:
        """Initialize patterns for query type detection"""
        return {
            QueryType.ACTION_ITEM: [
                r"\b(action\s+item|task|todo|assign|follow\s+up)\b",
                r"\bwho\s+(is|should|will)\s+(responsible|handling|doing)\b",
                r"\bwhat\s+(needs|should)\s+to\s+be\s+done\b",
            ],
            QueryType.DECISION: [
                r"\b(decision|decide|chosen|agreed|approved|rejected)\b",
                r"\bwhat\s+(did\s+we|was)\s+(decide|choose|agree)\b",
                r"\b(final|conclusion|outcome|resolution)\b",
            ],
            QueryType.TEMPORAL: [
                r"\b(today|yesterday|last\s+week|this\s+week|recently)\b",
                r"\b(before|after|during|when|timeline)\b",
                r"\d{1,2}[-/]\d{1,2}[-/]\d{2,4}",  # Date patterns
                r"\b(morning|afternoon|evening)\b",
            ],
            QueryType.SPEAKER: [
                r"\b(said|mentioned|talked\s+about|discussed)\b",
                r"\bwhat\s+did\s+\w+\s+say\b",
                r"\b[A-Z][a-z]+\s+[A-Z][a-z]+\b",  # Name patterns
            ],
            QueryType.TOPIC: [
                r"\babout\s+\w+\b",
                r"\btopic|subject|discussion\s+(on|about)\b",
                r"\bregarding|concerning\b",
            ],
        }

    async def initialize(self):
        """Initialize the search service"""
        if not self.vector_service:
            self.vector_service = await get_vector_storage_service()
        self.logger.info("Semantic search service initialized")

    async def analyze_query(
        self, query: str, context: SearchContextInfo = None
    ) -> QueryAnalysis:
        """
        Analyze user query to understand intent and extract relevant information

        This helps improve search results by understanding what the user is really
        looking for, rather than just matching keywords.
        """

        query_lower = query.lower()

        # Detect query type
        query_type = QueryType.NATURAL_LANGUAGE  # Default
        max_matches = 0

        for qtype, patterns in self.query_patterns.items():
            matches = sum(1 for pattern in patterns if re.search(pattern, query_lower))
            if matches > max_matches:
                max_matches = matches
                query_type = qtype

        # Extract entities and keywords
        entities = self._extract_entities(query)
        keywords = self._extract_keywords(query)
        temporal_indicators = self._extract_temporal_indicators(query)
        speaker_mentions = self._extract_speaker_mentions(query)
        topic_indicators = self._extract_topic_indicators(query)

        # Determine intent
        intent = self._determine_intent(query, query_type, entities)

        # Calculate confidence
        confidence = min(1.0, (max_matches + len(entities) + len(keywords)) / 10.0)

        return QueryAnalysis(
            query_type=query_type,
            intent=intent,
            entities=entities,
            keywords=keywords,
            temporal_indicators=temporal_indicators,
            speaker_mentions=speaker_mentions,
            topic_indicators=topic_indicators,
            confidence=confidence,
        )

    def _extract_entities(self, query: str) -> List[str]:
        """Extract named entities from query"""
        # Simple entity extraction (could be enhanced with NER models)
        entities = []

        # Extract potential names (capitalized words)
        names = re.findall(r"\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b", query)
        entities.extend(names)

        # Extract dates
        dates = re.findall(r"\d{1,2}[-/]\d{1,2}[-/]\d{2,4}", query)
        entities.extend(dates)

        # Extract quoted phrases
        quoted = re.findall(r'"([^"]*)"', query)
        entities.extend(quoted)

        return entities

    def _extract_keywords(self, query: str) -> List[str]:
        """Extract important keywords from query"""
        # Remove stop words and extract meaningful terms
        stop_words = {
            "the",
            "a",
            "an",
            "and",
            "or",
            "but",
            "in",
            "on",
            "at",
            "to",
            "for",
            "of",
            "with",
            "by",
            "is",
            "was",
            "are",
            "were",
            "be",
            "been",
            "have",
            "has",
            "had",
            "do",
            "does",
            "did",
            "will",
            "would",
            "could",
            "should",
            "may",
            "might",
            "can",
            "about",
            "what",
            "when",
            "where",
            "why",
            "how",
            "who",
        }

        words = re.findall(r"\b[a-zA-Z]{3,}\b", query.lower())
        keywords = [word for word in words if word not in stop_words]

        return keywords

    def _extract_temporal_indicators(self, query: str) -> List[str]:
        """Extract time-related terms from query"""
        temporal_patterns = [
            r"\b(today|yesterday|tomorrow)\b",
            r"\b(this|last|next)\s+(week|month|year)\b",
            r"\b(morning|afternoon|evening|night)\b",
            r"\b(recently|lately|earlier|before|after)\b",
            r"\d{1,2}[-/]\d{1,2}[-/]\d{2,4}",
            r"\b(january|february|march|april|may|june|july|august|september|october|november|december)\b",
        ]

        indicators = []
        for pattern in temporal_patterns:
            matches = re.findall(pattern, query.lower())
            indicators.extend(matches)

        return indicators

    def _extract_speaker_mentions(self, query: str) -> List[str]:
        """Extract speaker names from query"""
        # Look for patterns that suggest speaker names
        speaker_patterns = [
            r"\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(said|mentioned|talked|discussed)\b",
            r"\bwhat\s+did\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+say\b",
            r"\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(thinks|believes|suggested)\b",
        ]

        speakers = []
        for pattern in speaker_patterns:
            matches = re.findall(pattern, query)
            speakers.extend(
                [match[0] if isinstance(match, tuple) else match for match in matches]
            )

        return speakers

    def _extract_topic_indicators(self, query: str) -> List[str]:
        """Extract topic-related terms from query"""
        topic_patterns = [
            r"\babout\s+(\w+(?:\s+\w+)?)\b",
            r"\btopic\s+of\s+(\w+(?:\s+\w+)?)\b",
            r"\bdiscussion\s+(?:on|about)\s+(\w+(?:\s+\w+)?)\b",
            r"\bregarding\s+(\w+(?:\s+\w+)?)\b",
        ]

        topics = []
        for pattern in topic_patterns:
            matches = re.findall(pattern, query.lower())
            topics.extend(matches)

        return topics

    def _determine_intent(
        self, query: str, query_type: QueryType, entities: List[str]
    ) -> str:
        """Determine the user's search intent"""

        query_lower = query.lower()

        if query_type == QueryType.ACTION_ITEM:
            if "who" in query_lower:
                return "find_assignee"
            elif "what" in query_lower:
                return "find_tasks"
            else:
                return "find_action_items"

        elif query_type == QueryType.DECISION:
            if "what" in query_lower:
                return "find_decisions"
            elif "why" in query_lower:
                return "find_rationale"
            else:
                return "find_outcomes"

        elif query_type == QueryType.TEMPORAL:
            return "find_by_time"

        elif query_type == QueryType.SPEAKER:
            if entities:
                return f"find_speaker_content"
            else:
                return "find_speaker_related"

        elif query_type == QueryType.TOPIC:
            return "find_topic_discussion"

        else:
            # Natural language - try to infer intent
            if any(word in query_lower for word in ["how", "why", "explain"]):
                return "find_explanation"
            elif any(word in query_lower for word in ["when", "timeline"]):
                return "find_timeline"
            elif any(word in query_lower for word in ["who", "participant"]):
                return "find_participants"
            else:
                return "find_general"

    async def search(
        self, query: str, context: SearchContextInfo = None, limit: int = 10
    ) -> List[EnhancedSearchResult]:
        """
        Perform comprehensive semantic search

        This is the main search method that combines query analysis,
        semantic matching, and result enhancement.
        """

        start_time = time.time()

        # Check cache first
        cache_key = f"{query}_{hash(str(context))}"
        if cache_key in self.search_cache:
            cached_results = self.search_cache[cache_key]
            if (
                time.time()
                - cached_results[0].base_result.document.updated_at.timestamp()
                < self.cache_ttl
            ):
                return cached_results[:limit]

        try:
            # Analyze query
            query_analysis = await self.analyze_query(query, context)

            # Prepare search parameters
            search_params = self._prepare_search_parameters(query_analysis, context)

            # Perform base vector search
            base_results = await self.vector_service.semantic_search(
                query=query,
                document_types=search_params["document_types"],
                search_mode=search_params["search_mode"],
                limit=limit * 2,  # Get more results for post-processing
                metadata_filter=search_params["metadata_filter"],
                similarity_threshold=search_params["similarity_threshold"],
            )

            # Enhance results with context
            enhanced_results = []
            for result in base_results:
                enhanced_result = await self._enhance_search_result(
                    result, query, query_analysis, context
                )
                enhanced_results.append(enhanced_result)

            # Re-rank results based on enhanced scores
            enhanced_results.sort(
                key=lambda x: (x.context_score + x.base_result.similarity_score) / 2,
                reverse=True,
            )

            # Apply final limit
            final_results = enhanced_results[:limit]

            # Cache results
            self.search_cache[cache_key] = final_results

            # Update statistics
            search_time = time.time() - start_time
            self._update_search_stats(
                query, query_analysis.query_type, len(final_results), search_time
            )

            self.logger.info(
                f"Search '{query}' returned {len(final_results)} results in {search_time:.2f}s"
            )

            return final_results

        except Exception as e:
            self.logger.error(f"Search failed: {e}")
            return []

    def _prepare_search_parameters(
        self, query_analysis: QueryAnalysis, context: SearchContextInfo
    ) -> Dict[str, Any]:
        """Prepare search parameters based on query analysis and context"""

        # Default parameters
        params = {
            "document_types": [
                DocumentType.TRANSCRIPT_SEGMENT,
                DocumentType.MEETING_SUMMARY,
                DocumentType.INSIGHT,
            ],
            "search_mode": SearchMode.SEMANTIC,
            "metadata_filter": {},
            "similarity_threshold": 0.3,
        }

        # Adjust based on query type
        if query_analysis.query_type == QueryType.ACTION_ITEM:
            params["document_types"] = [DocumentType.INSIGHT, DocumentType.ACTION_ITEM]
            params["metadata_filter"]["insight_type"] = "action_item"
            params["similarity_threshold"] = 0.4

        elif query_analysis.query_type == QueryType.DECISION:
            params["document_types"] = [
                DocumentType.INSIGHT,
                DocumentType.MEETING_SUMMARY,
            ]
            params["metadata_filter"]["insight_type"] = "decision"
            params["similarity_threshold"] = 0.5

        elif query_analysis.query_type == QueryType.SPEAKER:
            if query_analysis.speaker_mentions:
                params["metadata_filter"]["speaker"] = query_analysis.speaker_mentions[
                    0
                ]
            params["search_mode"] = SearchMode.SPEAKER

        elif query_analysis.query_type == QueryType.TEMPORAL:
            params["search_mode"] = SearchMode.TEMPORAL
            # Would add time range filters based on temporal indicators

        elif query_analysis.query_type == QueryType.TOPIC:
            params["document_types"] = [
                DocumentType.TOPIC,
                DocumentType.MEETING_SUMMARY,
            ]
            params["search_mode"] = SearchMode.TOPIC

        # Apply context filters
        if context:
            if context.meeting_id:
                params["metadata_filter"]["meeting_id"] = context.meeting_id

            if context.speaker_filter:
                params["metadata_filter"]["speaker"] = context.speaker_filter

            if context.document_types:
                params["document_types"] = context.document_types

            if context.time_range:
                # Add time range filtering
                start_time, end_time = context.time_range
                params["metadata_filter"]["created_after"] = start_time.isoformat()
                params["metadata_filter"]["created_before"] = end_time.isoformat()

        return params

    async def _enhance_search_result(
        self,
        base_result: SearchResult,
        query: str,
        query_analysis: QueryAnalysis,
        context: SearchContextInfo,
    ) -> EnhancedSearchResult:
        """Enhance search result with additional context and explanations"""

        # Calculate context score
        context_score = await self._calculate_context_score(
            base_result, query_analysis, context
        )

        # Generate relevance explanation
        relevance_explanation = self._generate_relevance_explanation(
            base_result, query, query_analysis
        )

        # Find related documents
        related_documents = await self._find_related_documents(base_result.document.id)

        # Generate snippet
        snippet = self._generate_snippet(base_result.document.content, query)

        # Generate highlights
        highlights = self._generate_highlights(
            base_result.document.content, query_analysis.keywords
        )

        # Get meeting context
        meeting_context = await self._get_meeting_context(base_result.document)

        return EnhancedSearchResult(
            base_result=base_result,
            context_score=context_score,
            relevance_explanation=relevance_explanation,
            related_documents=related_documents,
            snippet=snippet,
            highlights=highlights,
            meeting_context=meeting_context,
        )

    async def _calculate_context_score(
        self,
        result: SearchResult,
        query_analysis: QueryAnalysis,
        context: SearchContextInfo,
    ) -> float:
        """Calculate additional context-based relevance score"""

        score = 0.0

        # Query type alignment
        if (
            query_analysis.query_type == QueryType.ACTION_ITEM
            and result.document.document_type == DocumentType.ACTION_ITEM
        ):
            score += 0.3
        elif (
            query_analysis.query_type == QueryType.DECISION
            and "decision" in result.document.metadata.get("insight_type", "")
        ):
            score += 0.3

        # Speaker match
        if query_analysis.speaker_mentions:
            doc_speaker = result.document.metadata.get("speaker", "")
            if any(
                speaker.lower() in doc_speaker.lower()
                for speaker in query_analysis.speaker_mentions
            ):
                score += 0.2

        # Temporal relevance
        if query_analysis.temporal_indicators:
            # Simple recency boost
            doc_time = result.document.created_at
            days_old = (datetime.now() - doc_time).days
            if days_old < 7:  # Recent documents
                score += 0.1

        # Keyword density
        keyword_matches = sum(
            1
            for keyword in query_analysis.keywords
            if keyword.lower() in result.document.content.lower()
        )
        if query_analysis.keywords:
            keyword_density = keyword_matches / len(query_analysis.keywords)
            score += keyword_density * 0.2

        # Meeting context
        if context and context.meeting_id:
            if result.document.metadata.get("meeting_id") == context.meeting_id:
                score += 0.3

        return min(1.0, score)

    def _generate_relevance_explanation(
        self, result: SearchResult, query: str, query_analysis: QueryAnalysis
    ) -> str:
        """Generate explanation for why this result is relevant"""

        explanations = []

        # Semantic similarity
        if result.similarity_score > 0.8:
            explanations.append("High semantic similarity to query")
        elif result.similarity_score > 0.6:
            explanations.append("Good semantic match")
        else:
            explanations.append("Moderate semantic relevance")

        # Keyword matches
        keyword_matches = [
            keyword
            for keyword in query_analysis.keywords
            if keyword.lower() in result.document.content.lower()
        ]
        if keyword_matches:
            explanations.append(f"Contains keywords: {', '.join(keyword_matches[:3])}")

        # Document type relevance
        if (
            query_analysis.query_type == QueryType.ACTION_ITEM
            and result.document.document_type == DocumentType.ACTION_ITEM
        ):
            explanations.append("Matches action item query type")
        elif (
            query_analysis.query_type == QueryType.DECISION
            and "decision" in result.document.metadata.get("insight_type", "")
        ):
            explanations.append("Matches decision query type")

        # Speaker relevance
        if query_analysis.speaker_mentions:
            doc_speaker = result.document.metadata.get("speaker", "")
            matching_speakers = [
                speaker
                for speaker in query_analysis.speaker_mentions
                if speaker.lower() in doc_speaker.lower()
            ]
            if matching_speakers:
                explanations.append(f"Mentions speaker: {matching_speakers[0]}")

        return ". ".join(explanations) + "."

    async def _find_related_documents(
        self, document_id: str, limit: int = 3
    ) -> List[str]:
        """Find documents related to the given document"""
        try:
            # This would use the vector similarity to find related documents
            # For now, return empty list as placeholder
            return []
        except (AttributeError, ValueError, IndexError) as e:
            logger.warning(f"Error finding related documents: {e}")
            return []

    def _generate_snippet(self, content: str, query: str, max_length: int = 200) -> str:
        """Generate relevant snippet from document content"""

        query_words = set(query.lower().split())
        sentences = content.split(".")

        # Find sentence with most query word matches
        best_sentence = ""
        max_matches = 0

        for sentence in sentences:
            sentence_words = set(sentence.lower().split())
            matches = len(query_words.intersection(sentence_words))
            if matches > max_matches:
                max_matches = matches
                best_sentence = sentence.strip()

        # If no good match, use first sentence
        if not best_sentence and sentences:
            best_sentence = sentences[0].strip()

        # Truncate if too long
        if len(best_sentence) > max_length:
            best_sentence = best_sentence[: max_length - 3] + "..."

        return best_sentence

    def _generate_highlights(self, content: str, keywords: List[str]) -> List[str]:
        """Generate highlighted portions of content"""

        highlights = []
        content_lower = content.lower()

        for keyword in keywords:
            keyword_lower = keyword.lower()
            if keyword_lower in content_lower:
                # Find the keyword in context
                start_idx = content_lower.find(keyword_lower)
                context_start = max(0, start_idx - 50)
                context_end = min(len(content), start_idx + len(keyword) + 50)

                context = content[context_start:context_end]
                if context_start > 0:
                    context = "..." + context
                if context_end < len(content):
                    context = context + "..."

                highlights.append(context)

        return highlights[:3]  # Limit to 3 highlights

    async def _get_meeting_context(self, document: VectorDocument) -> Dict[str, Any]:
        """Get context information about the meeting this document belongs to"""

        meeting_id = document.metadata.get("meeting_id")
        if not meeting_id:
            return {}

        return {
            "meeting_id": meeting_id,
            "meeting_date": document.metadata.get("meeting_date"),
            "participants": document.metadata.get("participants", []),
            "duration": document.metadata.get("duration"),
            "meeting_type": document.metadata.get("meeting_type"),
        }

    def _update_search_stats(
        self, query: str, query_type: QueryType, result_count: int, search_time: float
    ):
        """Update search statistics"""

        self.search_stats["total_searches"] += 1
        self.search_stats["queries_by_type"][query_type.value] += 1

        # Update average response time
        total_time = self.search_stats["avg_response_time"] * (
            self.search_stats["total_searches"] - 1
        )
        self.search_stats["avg_response_time"] = (
            total_time + search_time
        ) / self.search_stats["total_searches"]

        # Track popular queries
        self.search_stats["popular_queries"][query] += 1

        # Track zero result queries
        if result_count == 0:
            self.search_stats["zero_result_queries"].append(query)

    async def get_search_suggestions(
        self, partial_query: str, limit: int = 5
    ) -> List[SearchSuggestion]:
        """Generate search suggestions based on partial query"""

        suggestions = []
        partial_lower = partial_query.lower()

        # Common search patterns
        common_suggestions = [
            (
                "action items from last week",
                "Find recent action items",
                QueryType.ACTION_ITEM,
            ),
            ("decisions made today", "Find decisions from today", QueryType.DECISION),
            (
                "what did John say about budget",
                "Find speaker comments on topic",
                QueryType.SPEAKER,
            ),
            (
                "meeting about project planning",
                "Find meetings by topic",
                QueryType.TOPIC,
            ),
            ("concerns raised yesterday", "Find recent concerns", QueryType.TEMPORAL),
        ]

        # Filter suggestions based on partial query
        for suggestion_text, description, query_type in common_suggestions:
            if any(word in suggestion_text for word in partial_lower.split()):
                suggestions.append(
                    SearchSuggestion(
                        suggestion=suggestion_text,
                        description=description,
                        query_type=query_type,
                        estimated_results=10,  # Placeholder
                    )
                )

        # Add suggestions based on popular queries
        for popular_query, count in self.search_stats["popular_queries"].most_common(
            10
        ):
            if partial_lower in popular_query.lower() and popular_query not in [
                s.suggestion for s in suggestions
            ]:
                suggestions.append(
                    SearchSuggestion(
                        suggestion=popular_query,
                        description=f"Popular search (used {count} times)",
                        query_type=QueryType.NATURAL_LANGUAGE,
                        estimated_results=count,
                    )
                )

        return suggestions[:limit]

    async def get_search_statistics(self) -> Dict[str, Any]:
        """Get comprehensive search statistics"""

        return {
            "total_searches": self.search_stats["total_searches"],
            "queries_by_type": dict(self.search_stats["queries_by_type"]),
            "avg_response_time": self.search_stats["avg_response_time"],
            "popular_queries": dict(
                self.search_stats["popular_queries"].most_common(10)
            ),
            "zero_result_queries": self.search_stats["zero_result_queries"][
                -10:
            ],  # Last 10
            "cache_size": len(self.search_cache),
            "cache_hit_rate": len(self.search_cache)
            / max(1, self.search_stats["total_searches"]),
        }


# Global semantic search service instance
semantic_search_service = None


async def get_semantic_search_service() -> SemanticSearchService:
    """Get the global semantic search service instance"""
    global semantic_search_service
    if semantic_search_service is None:
        semantic_search_service = SemanticSearchService()
        await semantic_search_service.initialize()
    return semantic_search_service
