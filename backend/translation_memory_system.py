# Translation Memory System
# Advanced translation memory with fuzzy matching, quality scoring, and consistency management

from typing import List, Dict, Optional, Tuple, Any
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
import hashlib
import json
from dataclasses import dataclass
from enum import Enum
import asyncio
from difflib import SequenceMatcher

from i18n_models import (
    TranslationMemory,
    Translation,
    Language,
    LanguageCode,
    TranslationProvider,
    TranslationQuality,
)
from database import get_db


@dataclass
class FuzzyMatch:
    """Fuzzy match result from translation memory"""

    source_text: str
    target_text: str
    similarity_score: float
    translation_memory_id: str
    quality_score: float
    usage_frequency: int
    last_used: datetime
    context_match: bool
    domain_match: bool


@dataclass
class TranslationMemoryEntry:
    """Complete translation memory entry"""

    id: str
    source_text: str
    target_text: str
    source_language: LanguageCode
    target_language: LanguageCode
    domain: str
    context_tags: List[str]
    quality_score: float
    usage_frequency: int
    is_validated: bool
    created_by: str
    organization_id: Optional[str]


@dataclass
class MemorySearchRequest:
    """Request for translation memory search"""

    source_text: str
    source_language: LanguageCode
    target_language: LanguageCode
    domain: Optional[str] = None
    context_tags: Optional[List[str]] = None
    min_similarity: float = 0.7
    max_results: int = 10
    organization_id: Optional[str] = None


@dataclass
class MemoryUpdateRequest:
    """Request to update translation memory"""

    source_text: str
    target_text: str
    source_language: LanguageCode
    target_language: LanguageCode
    quality_score: float
    domain: str = "general"
    context_tags: Optional[List[str]] = None
    created_by: str = "system"
    organization_id: Optional[str] = None
    force_update: bool = False


class FuzzyMatcher:
    """
    Advanced fuzzy matching for translation memory

    Design Decision: Multiple similarity algorithms ensure accurate
    matching across different text types and languages.
    """

    def __init__(self):
        self.min_length_for_fuzzy = 3
        self.max_length_difference = 0.5  # 50% length difference threshold

    def calculate_similarity(self, text1: str, text2: str) -> float:
        """
        Calculate similarity between two texts using multiple algorithms

        Args:
            text1: First text
            text2: Second text

        Returns:
            Similarity score (0.0 to 1.0)
        """
        if not text1 or not text2:
            return 0.0

        # Normalize texts
        text1_norm = self._normalize_text(text1)
        text2_norm = self._normalize_text(text2)

        if text1_norm == text2_norm:
            return 1.0

        # Check length difference
        len_diff = abs(len(text1_norm) - len(text2_norm)) / max(
            len(text1_norm), len(text2_norm)
        )
        if len_diff > self.max_length_difference:
            return 0.0

        # Calculate different similarity scores
        sequence_sim = self._sequence_similarity(text1_norm, text2_norm)
        word_sim = self._word_similarity(text1_norm, text2_norm)
        character_sim = self._character_similarity(text1_norm, text2_norm)

        # Weighted combination
        weights = {"sequence": 0.4, "word": 0.4, "character": 0.2}

        combined_similarity = (
            sequence_sim * weights["sequence"]
            + word_sim * weights["word"]
            + character_sim * weights["character"]
        )

        return combined_similarity

    def _normalize_text(self, text: str) -> str:
        """Normalize text for comparison"""
        # Convert to lowercase
        text = text.lower().strip()

        # Remove extra whitespace
        text = " ".join(text.split())

        # Remove common punctuation that doesn't affect meaning
        import re

        text = re.sub(r'[.,!?;:"\']', "", text)

        return text

    def _sequence_similarity(self, text1: str, text2: str) -> float:
        """Calculate sequence similarity using SequenceMatcher"""
        return SequenceMatcher(None, text1, text2).ratio()

    def _word_similarity(self, text1: str, text2: str) -> float:
        """Calculate word-level similarity (Jaccard similarity)"""
        words1 = set(text1.split())
        words2 = set(text2.split())

        intersection = words1.intersection(words2)
        union = words1.union(words2)

        if not union:
            return 0.0

        return len(intersection) / len(union)

    def _character_similarity(self, text1: str, text2: str) -> float:
        """Calculate character-level similarity"""

        # Character n-gram similarity (simplified)
        def get_bigrams(text):
            return [text[i : i + 2] for i in range(len(text) - 1)]

        bigrams1 = set(get_bigrams(text1))
        bigrams2 = set(get_bigrams(text2))

        if not bigrams1 and not bigrams2:
            return 1.0
        if not bigrams1 or not bigrams2:
            return 0.0

        intersection = bigrams1.intersection(bigrams2)
        union = bigrams1.union(bigrams2)

        return len(intersection) / len(union)

    def calculate_context_similarity(
        self, context1: List[str], context2: List[str]
    ) -> float:
        """Calculate context similarity based on tags"""
        if not context1 and not context2:
            return 1.0
        if not context1 or not context2:
            return 0.0

        set1 = set(context1)
        set2 = set(context2)

        intersection = set1.intersection(set2)
        union = set1.union(set2)

        return len(intersection) / len(union) if union else 0.0


class QualityScorer:
    """
    Scores translation quality for memory entries

    Design Decision: Multi-factor quality scoring helps prioritize
    better translations in memory matches.
    """

    def calculate_quality_score(
        self, translation: Translation, usage_stats: Optional[Dict] = None
    ) -> float:
        """
        Calculate quality score for a translation

        Args:
            translation: Translation to score
            usage_stats: Optional usage statistics

        Returns:
            Quality score (0.0 to 1.0)
        """
        factors = []

        # Provider confidence
        if translation.confidence_score is not None:
            factors.append(("confidence", translation.confidence_score, 0.3))

        # Human review status
        if translation.is_human_reviewed:
            factors.append(("human_reviewed", 1.0, 0.2))

        # User feedback
        if translation.user_feedback_score is not None:
            factors.append(
                ("user_feedback", translation.user_feedback_score / 5.0, 0.2)
            )

        # Quality level
        quality_weights = {
            TranslationQuality.DRAFT: 0.5,
            TranslationQuality.STANDARD: 0.7,
            TranslationQuality.PROFESSIONAL: 0.9,
            TranslationQuality.PREMIUM: 1.0,
        }
        quality_score = quality_weights.get(translation.quality_level, 0.7)
        factors.append(("quality_level", quality_score, 0.15))

        # Usage frequency (if available)
        if usage_stats and "usage_count" in usage_stats:
            # Normalize usage count (assuming max reasonable usage is 100)
            usage_score = min(usage_stats["usage_count"] / 100.0, 1.0)
            factors.append(("usage", usage_score, 0.1))

        # Age factor (newer translations might be better)
        if translation.created_at:
            age_days = (datetime.utcnow() - translation.created_at).days
            # Translations lose 10% quality per year
            age_factor = max(0.5, 1.0 - (age_days / 3650))
            factors.append(("age", age_factor, 0.05))

        # Calculate weighted average
        total_weight = sum(weight for _, _, weight in factors)
        if total_weight == 0:
            return 0.5  # Default score

        weighted_sum = sum(score * weight for _, score, weight in factors)
        return weighted_sum / total_weight


class TranslationMemorySystem:
    """
    Comprehensive translation memory system

    Design Decision: Centralized memory system with advanced matching
    capabilities ensures translation consistency and quality improvement.

    Key Features:
    - Fuzzy matching with multiple algorithms
    - Quality-based ranking
    - Context-aware matching
    - Domain-specific memories
    - Usage analytics and optimization
    - Batch processing capabilities
    """

    def __init__(self, db: Session):
        self.db = db
        self.fuzzy_matcher = FuzzyMatcher()
        self.quality_scorer = QualityScorer()
        self.cache = {}  # Simple in-memory cache
        self.cache_ttl = 300  # 5 minutes

    async def search_memory(self, request: MemorySearchRequest) -> List[FuzzyMatch]:
        """
        Search translation memory for matching entries

        Args:
            request: Search request parameters

        Returns:
            List of fuzzy matches sorted by relevance
        """
        # Create cache key
        cache_key = self._create_cache_key(request)

        # Check cache
        if cache_key in self.cache:
            cached_result = self.cache[cache_key]
            if datetime.now().timestamp() - cached_result["timestamp"] < self.cache_ttl:
                return cached_result["matches"]

        # Query database
        query = self.db.query(TranslationMemory).filter(
            TranslationMemory.source_language == request.source_language,
            TranslationMemory.target_language == request.target_language,
        )

        # Filter by organization if specified
        if request.organization_id:
            query = query.filter(
                (TranslationMemory.organization_id == request.organization_id)
                | (TranslationMemory.is_global == True)
            )

        # Filter by domain if specified
        if request.domain:
            query = query.filter(TranslationMemory.domain == request.domain)

        # Get candidates
        candidates = query.limit(1000).all()  # Limit for performance

        # Calculate similarities
        matches = []
        for candidate in candidates:
            similarity = self.fuzzy_matcher.calculate_similarity(
                request.source_text, candidate.source_text
            )

            if similarity >= request.min_similarity:
                # Check context match
                context_match = False
                if request.context_tags and candidate.context_tags:
                    context_similarity = (
                        self.fuzzy_matcher.calculate_context_similarity(
                            request.context_tags, candidate.context_tags
                        )
                    )
                    context_match = context_similarity > 0.5

                # Check domain match
                domain_match = (
                    request.domain == candidate.domain if request.domain else True
                )

                match = FuzzyMatch(
                    source_text=candidate.source_text,
                    target_text=candidate.target_text,
                    similarity_score=similarity,
                    translation_memory_id=str(candidate.id),
                    quality_score=candidate.quality_score,
                    usage_frequency=candidate.usage_frequency,
                    last_used=candidate.last_used,
                    context_match=context_match,
                    domain_match=domain_match,
                )
                matches.append(match)

        # Sort by relevance (similarity + quality + usage)
        matches.sort(key=self._calculate_match_relevance, reverse=True)

        # Limit results
        matches = matches[: request.max_results]

        # Cache results
        self.cache[cache_key] = {
            "matches": matches,
            "timestamp": datetime.now().timestamp(),
        }

        return matches

    async def add_to_memory(self, request: MemoryUpdateRequest) -> str:
        """
        Add or update translation in memory

        Args:
            request: Update request

        Returns:
            Translation memory ID
        """
        # Calculate source text hash
        source_hash = self._calculate_text_hash(request.source_text)

        # Check if entry already exists
        existing = (
            self.db.query(TranslationMemory)
            .filter(
                TranslationMemory.source_hash == source_hash,
                TranslationMemory.source_language == request.source_language,
                TranslationMemory.target_language == request.target_language,
                TranslationMemory.organization_id == request.organization_id,
            )
            .first()
        )

        if existing and not request.force_update:
            # Update existing entry
            existing.usage_frequency += 1
            existing.last_used = datetime.utcnow()

            # Update quality if new score is better
            if request.quality_score > existing.quality_score:
                existing.target_text = request.target_text
                existing.quality_score = request.quality_score

            self.db.commit()
            return str(existing.id)

        # Create new entry
        tm_entry = TranslationMemory(
            source_hash=source_hash,
            source_text=request.source_text,
            target_text=request.target_text,
            source_language=request.source_language,
            target_language=request.target_language,
            domain=request.domain,
            context_tags=request.context_tags,
            quality_score=request.quality_score,
            usage_frequency=1,
            organization_id=request.organization_id,
            created_by=request.created_by,
            is_validated=False,
        )

        self.db.add(tm_entry)
        self.db.commit()

        # Clear relevant cache entries
        self._clear_cache_for_language_pair(
            request.source_language, request.target_language
        )

        return str(tm_entry.id)

    async def validate_entry(
        self,
        memory_id: str,
        is_valid: bool,
        validator_id: str,
        notes: Optional[str] = None,
    ) -> bool:
        """
        Validate a translation memory entry

        Args:
            memory_id: Memory entry ID
            is_valid: Whether the translation is valid
            validator_id: ID of the validator
            notes: Optional validation notes

        Returns:
            True if validation successful
        """
        entry = (
            self.db.query(TranslationMemory)
            .filter(TranslationMemory.id == memory_id)
            .first()
        )

        if not entry:
            return False

        entry.is_validated = is_valid
        entry.validated_by = validator_id
        entry.validation_notes = notes

        # Adjust quality score based on validation
        if is_valid:
            entry.quality_score = min(1.0, entry.quality_score + 0.1)
        else:
            entry.quality_score = max(0.0, entry.quality_score - 0.2)

        self.db.commit()
        return True

    async def get_memory_statistics(
        self,
        language_pair: Optional[Tuple[LanguageCode, LanguageCode]] = None,
        domain: Optional[str] = None,
        organization_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Get translation memory statistics

        Args:
            language_pair: Optional language pair filter
            domain: Optional domain filter
            organization_id: Optional organization filter

        Returns:
            Dictionary with statistics
        """
        query = self.db.query(TranslationMemory)

        # Apply filters
        if language_pair:
            source_lang, target_lang = language_pair
            query = query.filter(
                TranslationMemory.source_language == source_lang,
                TranslationMemory.target_language == target_lang,
            )

        if domain:
            query = query.filter(TranslationMemory.domain == domain)

        if organization_id:
            query = query.filter(
                (TranslationMemory.organization_id == organization_id)
                | (TranslationMemory.is_global == True)
            )

        entries = query.all()

        if not entries:
            return {"total_entries": 0}

        # Calculate statistics
        stats = {
            "total_entries": len(entries),
            "validated_entries": sum(1 for e in entries if e.is_validated),
            "avg_quality_score": sum(e.quality_score for e in entries) / len(entries),
            "total_usage": sum(e.usage_frequency for e in entries),
            "language_pairs": {},
            "domains": {},
            "quality_distribution": {"high": 0, "medium": 0, "low": 0},
        }

        # Language pair distribution
        for entry in entries:
            pair = f"{entry.source_language.value}->{entry.target_language.value}"
            stats["language_pairs"][pair] = stats["language_pairs"].get(pair, 0) + 1

        # Domain distribution
        for entry in entries:
            domain = entry.domain or "general"
            stats["domains"][domain] = stats["domains"].get(domain, 0) + 1

        # Quality distribution
        for entry in entries:
            if entry.quality_score >= 0.8:
                stats["quality_distribution"]["high"] += 1
            elif entry.quality_score >= 0.6:
                stats["quality_distribution"]["medium"] += 1
            else:
                stats["quality_distribution"]["low"] += 1

        return stats

    async def optimize_memory(
        self,
        organization_id: Optional[str] = None,
        remove_low_quality: bool = True,
        merge_duplicates: bool = True,
    ) -> Dict[str, int]:
        """
        Optimize translation memory by removing low-quality entries and merging duplicates

        Args:
            organization_id: Optional organization filter
            remove_low_quality: Whether to remove low-quality entries
            merge_duplicates: Whether to merge duplicate entries

        Returns:
            Dictionary with optimization results
        """
        results = {"entries_removed": 0, "entries_merged": 0, "quality_improved": 0}

        query = self.db.query(TranslationMemory)
        if organization_id:
            query = query.filter(TranslationMemory.organization_id == organization_id)

        entries = query.all()

        # Remove low-quality entries
        if remove_low_quality:
            low_quality_threshold = 0.3
            low_quality_entries = [
                e
                for e in entries
                if e.quality_score < low_quality_threshold
                and e.usage_frequency < 2
                and not e.is_validated
            ]

            for entry in low_quality_entries:
                self.db.delete(entry)
                results["entries_removed"] += 1

        # Merge duplicates
        if merge_duplicates:
            # Group by source text hash and language pair
            hash_groups = {}
            for entry in entries:
                if entry in [
                    e for e in entries if e.quality_score < 0.3
                ]:  # Skip already removed
                    continue

                key = f"{entry.source_hash}_{entry.source_language.value}_{entry.target_language.value}"
                if key not in hash_groups:
                    hash_groups[key] = []
                hash_groups[key].append(entry)

            # Merge groups with multiple entries
            for group in hash_groups.values():
                if len(group) > 1:
                    # Keep the best quality entry
                    best_entry = max(group, key=lambda e: e.quality_score)

                    # Merge usage statistics
                    total_usage = sum(e.usage_frequency for e in group)
                    best_entry.usage_frequency = total_usage

                    # Remove other entries
                    for entry in group:
                        if entry != best_entry:
                            self.db.delete(entry)
                            results["entries_merged"] += 1

        self.db.commit()

        # Clear cache
        self.cache.clear()

        return results

    async def export_memory(
        self,
        language_pair: Tuple[LanguageCode, LanguageCode],
        domain: Optional[str] = None,
        format_type: str = "tmx",  # TMX, JSON, CSV
    ) -> str:
        """
        Export translation memory in specified format

        Args:
            language_pair: Language pair to export
            domain: Optional domain filter
            format_type: Export format

        Returns:
            Exported data as string
        """
        source_lang, target_lang = language_pair

        query = self.db.query(TranslationMemory).filter(
            TranslationMemory.source_language == source_lang,
            TranslationMemory.target_language == target_lang,
        )

        if domain:
            query = query.filter(TranslationMemory.domain == domain)

        entries = query.order_by(TranslationMemory.quality_score.desc()).all()

        if format_type.lower() == "json":
            return self._export_as_json(entries)
        elif format_type.lower() == "csv":
            return self._export_as_csv(entries)
        else:  # TMX format
            return self._export_as_tmx(entries, source_lang, target_lang)

    def _create_cache_key(self, request: MemorySearchRequest) -> str:
        """Create cache key for search request"""
        key_parts = [
            request.source_text[:50],  # Truncate for cache key
            request.source_language.value,
            request.target_language.value,
            request.domain or "any",
            str(request.min_similarity),
            request.organization_id or "global",
        ]
        return hashlib.md5("|".join(key_parts).encode()).hexdigest()

    def _calculate_text_hash(self, text: str) -> str:
        """Calculate hash for text"""
        normalized = self.fuzzy_matcher._normalize_text(text)
        return hashlib.sha256(normalized.encode("utf-8")).hexdigest()

    def _calculate_match_relevance(self, match: FuzzyMatch) -> float:
        """Calculate relevance score for match ranking"""
        relevance = match.similarity_score * 0.5  # Base similarity weight
        relevance += match.quality_score * 0.3  # Quality weight
        relevance += min(match.usage_frequency / 100.0, 1.0) * 0.1  # Usage weight

        # Bonus for context and domain matches
        if match.context_match:
            relevance += 0.05
        if match.domain_match:
            relevance += 0.05

        return relevance

    def _clear_cache_for_language_pair(
        self, source_lang: LanguageCode, target_lang: LanguageCode
    ) -> None:
        """Clear cache entries for specific language pair"""
        keys_to_remove = []
        for key in self.cache:
            if f"{source_lang.value}|{target_lang.value}" in key:
                keys_to_remove.append(key)

        for key in keys_to_remove:
            del self.cache[key]

    def _export_as_json(self, entries: List[TranslationMemory]) -> str:
        """Export entries as JSON"""
        data = []
        for entry in entries:
            data.append(
                {
                    "source_text": entry.source_text,
                    "target_text": entry.target_text,
                    "source_language": entry.source_language.value,
                    "target_language": entry.target_language.value,
                    "domain": entry.domain,
                    "quality_score": entry.quality_score,
                    "usage_frequency": entry.usage_frequency,
                    "created_at": entry.created_at.isoformat(),
                    "context_tags": entry.context_tags,
                }
            )

        return json.dumps(data, indent=2, ensure_ascii=False)

    def _export_as_csv(self, entries: List[TranslationMemory]) -> str:
        """Export entries as CSV"""
        import csv
        import io

        output = io.StringIO()
        writer = csv.writer(output)

        # Header
        writer.writerow(
            [
                "Source Text",
                "Target Text",
                "Source Language",
                "Target Language",
                "Domain",
                "Quality Score",
                "Usage Frequency",
                "Created At",
            ]
        )

        # Data
        for entry in entries:
            writer.writerow(
                [
                    entry.source_text,
                    entry.target_text,
                    entry.source_language.value,
                    entry.target_language.value,
                    entry.domain,
                    entry.quality_score,
                    entry.usage_frequency,
                    entry.created_at.isoformat(),
                ]
            )

        return output.getvalue()

    def _export_as_tmx(
        self,
        entries: List[TranslationMemory],
        source_lang: LanguageCode,
        target_lang: LanguageCode,
    ) -> str:
        """Export entries as TMX format"""
        # Simplified TMX format
        tmx_content = f"""<?xml version="1.0" encoding="UTF-8"?>
<tmx version="1.4">
  <header>
    <prop type="x-filename">memory_export.tmx</prop>
  </header>
  <body>
"""

        for entry in entries:
            tmx_content += f"""    <tu tuid="{entry.id}">
"""
            tmx_content += f"""      <tuv xml:lang="{source_lang.value}">
"""
            tmx_content += f"""        <seg>{entry.source_text}</seg>
"""
            tmx_content += f"""      </tuv>
"""
            tmx_content += f"""      <tuv xml:lang="{target_lang.value}">
"""
            tmx_content += f"""        <seg>{entry.target_text}</seg>
"""
            tmx_content += f"""      </tuv>
"""
            tmx_content += f"""    </tu>
"""

        tmx_content += """  </body>
</tmx>"""

        return tmx_content
