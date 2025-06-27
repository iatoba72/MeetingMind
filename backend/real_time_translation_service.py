# Real-Time Translation Service
# Live translation capabilities for meetings with multiple providers and quality optimization

from typing import List, Dict, Optional, Tuple, Any, AsyncGenerator
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
import asyncio
import json
import time
from dataclasses import dataclass
from enum import Enum

from i18n_models import (
    Language, Translation, TranslationMemory, TranslationProvider,
    TranslationQuality, LanguageCode, CulturalContext
)
from models import Meeting, Participant
from database import get_db

@dataclass
class RealTimeTranslationRequest:
    """Request for real-time translation"""
    source_text: str
    source_language: LanguageCode
    target_language: LanguageCode
    quality_level: TranslationQuality
    context: Optional[Dict[str, Any]] = None
    speaker_id: Optional[str] = None
    urgency: str = 'normal'  # normal, high, critical

@dataclass
class RealTimeTranslationResult:
    """Result of real-time translation"""
    translated_text: str
    confidence_score: float
    provider: TranslationProvider
    processing_time_ms: int
    quality_score: float
    cached: bool
    alternative_translations: List[str]
    cultural_adaptations: List[str]

@dataclass
class TranslationStream:
    """Streaming translation configuration"""
    meeting_id: str
    source_language: LanguageCode
    target_languages: List[LanguageCode]
    quality_level: TranslationQuality
    enable_cultural_adaptation: bool
    buffer_size: int = 100  # Characters to buffer before translation
    max_delay_ms: int = 500  # Maximum delay before forcing translation

class TranslationCache:
    """
    High-performance translation cache with fuzzy matching
    
    Design Decision: Aggressive caching for real-time performance
    with fuzzy matching for similar phrases.
    """
    
    def __init__(self, db: Session):
        self.db = db
        self.memory_cache = {}  # In-memory cache for ultra-fast access
        self.cache_ttl = 3600  # 1 hour TTL for memory cache
    
    async def get_cached_translation(
        self,
        source_text: str,
        source_lang: LanguageCode,
        target_lang: LanguageCode,
        fuzzy_threshold: float = 0.8
    ) -> Optional[Translation]:
        """
        Get cached translation with fuzzy matching support
        
        Args:
            source_text: Text to translate
            source_lang: Source language
            target_lang: Target language
            fuzzy_threshold: Minimum similarity for fuzzy matches
        
        Returns:
            Cached translation if found
        """
        # Create cache key
        cache_key = f"{source_lang.value}:{target_lang.value}:{hash(source_text)}"
        
        # Check memory cache first
        if cache_key in self.memory_cache:
            cached_item = self.memory_cache[cache_key]
            if time.time() - cached_item['timestamp'] < self.cache_ttl:
                return cached_item['translation']
            else:
                del self.memory_cache[cache_key]
        
        # Check database cache
        source_hash = self._calculate_text_hash(source_text)
        
        # Exact match
        exact_match = self.db.query(TranslationMemory).filter(
            TranslationMemory.source_hash == source_hash,
            TranslationMemory.source_language == source_lang,
            TranslationMemory.target_language == target_lang
        ).first()
        
        if exact_match:
            # Get the latest translation
            translation = self.db.query(Translation).filter(
                Translation.translation_memory_id == exact_match.id
            ).order_by(Translation.created_at.desc()).first()
            
            if translation:
                # Update memory cache
                self.memory_cache[cache_key] = {
                    'translation': translation,
                    'timestamp': time.time()
                }
                
                # Update usage statistics
                exact_match.usage_frequency += 1
                exact_match.last_used = datetime.utcnow()
                exact_match.exact_matches += 1
                self.db.commit()
                
                return translation
        
        # Fuzzy matching (simplified - would use proper similarity algorithms in production)
        if fuzzy_threshold > 0:
            similar_entries = self.db.query(TranslationMemory).filter(
                TranslationMemory.source_language == source_lang,
                TranslationMemory.target_language == target_lang,
                TranslationMemory.fuzzy_threshold <= fuzzy_threshold
            ).limit(10).all()
            
            for entry in similar_entries:
                similarity = self._calculate_similarity(source_text, entry.source_text)
                if similarity >= fuzzy_threshold:
                    # Get translation
                    translation = self.db.query(Translation).filter(
                        Translation.translation_memory_id == entry.id
                    ).order_by(Translation.created_at.desc()).first()
                    
                    if translation:
                        # Update fuzzy match statistics
                        entry.fuzzy_matches += 1
                        entry.last_used = datetime.utcnow()
                        self.db.commit()
                        
                        return translation
        
        return None
    
    async def cache_translation(
        self,
        translation: Translation,
        source_text: str,
        organization_id: Optional[str] = None
    ) -> None:
        """
        Cache a translation for future use
        
        Args:
            translation: Translation to cache
            source_text: Original source text
            organization_id: Organization ID for scoping
        """
        # Create or update translation memory
        source_hash = self._calculate_text_hash(source_text)
        
        tm_entry = self.db.query(TranslationMemory).filter(
            TranslationMemory.source_hash == source_hash,
            TranslationMemory.source_language == translation.source_language.code,
            TranslationMemory.target_language == translation.target_language.code,
            TranslationMemory.organization_id == organization_id
        ).first()
        
        if not tm_entry:
            tm_entry = TranslationMemory(
                source_hash=source_hash,
                source_text=source_text,
                target_text=translation.translated_text,
                source_language=translation.source_language.code,
                target_language=translation.target_language.code,
                quality_score=translation.quality_score,
                organization_id=organization_id,
                created_by='system'
            )
            self.db.add(tm_entry)
            self.db.flush()
        
        # Update translation memory reference
        translation.translation_memory_id = tm_entry.id
        
        # Update memory cache
        cache_key = f"{translation.source_language.code.value}:{translation.target_language.code.value}:{hash(source_text)}"
        self.memory_cache[cache_key] = {
            'translation': translation,
            'timestamp': time.time()
        }
        
        self.db.commit()
    
    def _calculate_text_hash(self, text: str) -> str:
        """Calculate hash for text"""
        import hashlib
        return hashlib.sha256(text.encode('utf-8')).hexdigest()
    
    def _calculate_similarity(self, text1: str, text2: str) -> float:
        """
        Calculate similarity between two texts
        (Simplified implementation - would use proper algorithms in production)
        """
        # Simple Jaccard similarity
        words1 = set(text1.lower().split())
        words2 = set(text2.lower().split())
        
        intersection = words1.intersection(words2)
        union = words1.union(words2)
        
        if not union:
            return 0.0
        
        return len(intersection) / len(union)

class TranslationProviderManager:
    """
    Manages multiple translation providers with quality optimization
    
    Design Decision: Multi-provider approach ensures reliability and
    allows quality comparison for continuous improvement.
    """
    
    def __init__(self):
        self.providers = {
            TranslationProvider.GOOGLE_TRANSLATE: self._google_translate,
            TranslationProvider.AZURE_TRANSLATOR: self._azure_translate,
            TranslationProvider.DEEPL: self._deepl_translate,
            TranslationProvider.OPENAI_GPT: self._openai_translate,
            TranslationProvider.ANTHROPIC_CLAUDE: self._claude_translate
        }
        
        # Provider performance tracking
        self.provider_stats = {
            provider: {
                'success_rate': 0.95,
                'avg_latency_ms': 200,
                'quality_score': 0.85,
                'cost_per_char': 0.001
            }
            for provider in self.providers.keys()
        }
    
    async def translate(
        self,
        request: RealTimeTranslationRequest
    ) -> RealTimeTranslationResult:
        """
        Translate using optimal provider based on requirements
        
        Args:
            request: Translation request
        
        Returns:
            Translation result
        """
        # Select best provider for this request
        provider = self._select_optimal_provider(request)
        
        start_time = time.time()
        
        try:
            # Perform translation
            translated_text = await self.providers[provider](
                request.source_text,
                request.source_language,
                request.target_language,
                request.context
            )
            
            processing_time = int((time.time() - start_time) * 1000)
            
            # Calculate quality score (simplified)
            quality_score = self._estimate_quality(translated_text, request)
            
            return RealTimeTranslationResult(
                translated_text=translated_text,
                confidence_score=self.provider_stats[provider]['quality_score'],
                provider=provider,
                processing_time_ms=processing_time,
                quality_score=quality_score,
                cached=False,
                alternative_translations=[],
                cultural_adaptations=[]
            )
            
        except Exception as e:
            # Fallback to another provider
            fallback_provider = self._get_fallback_provider(provider)
            if fallback_provider:
                return await self._translate_with_provider(
                    request, fallback_provider
                )
            raise e
    
    def _select_optimal_provider(
        self,
        request: RealTimeTranslationRequest
    ) -> TranslationProvider:
        """
        Select optimal provider based on requirements and performance
        """
        # Language pair support
        supported_providers = []
        
        for provider in self.providers.keys():
            if self._supports_language_pair(
                provider,
                request.source_language,
                request.target_language
            ):
                supported_providers.append(provider)
        
        if not supported_providers:
            return TranslationProvider.GOOGLE_TRANSLATE  # Default fallback
        
        # Score providers based on requirements
        provider_scores = {}
        
        for provider in supported_providers:
            stats = self.provider_stats[provider]
            
            # Base score from quality and reliability
            score = stats['quality_score'] * stats['success_rate']
            
            # Adjust for latency requirements
            if request.urgency == 'critical':
                latency_penalty = stats['avg_latency_ms'] / 1000  # Penalty for high latency
                score -= latency_penalty
            
            # Adjust for quality requirements
            if request.quality_level == TranslationQuality.PREMIUM:
                score += 0.2 if provider in [TranslationProvider.DEEPL, TranslationProvider.OPENAI_GPT] else 0
            elif request.quality_level == TranslationQuality.DRAFT:
                score += 0.1 if stats['avg_latency_ms'] < 300 else 0
            
            provider_scores[provider] = score
        
        # Return best provider
        return max(provider_scores, key=provider_scores.get)
    
    def _supports_language_pair(
        self,
        provider: TranslationProvider,
        source_lang: LanguageCode,
        target_lang: LanguageCode
    ) -> bool:
        """
        Check if provider supports language pair
        """
        # Simplified - in production would check actual provider capabilities
        return True
    
    def _get_fallback_provider(
        self,
        failed_provider: TranslationProvider
    ) -> Optional[TranslationProvider]:
        """
        Get fallback provider when primary fails
        """
        fallback_order = [
            TranslationProvider.GOOGLE_TRANSLATE,
            TranslationProvider.AZURE_TRANSLATOR,
            TranslationProvider.DEEPL
        ]
        
        for provider in fallback_order:
            if provider != failed_provider:
                return provider
        
        return None
    
    def _estimate_quality(
        self,
        translated_text: str,
        request: RealTimeTranslationRequest
    ) -> float:
        """
        Estimate translation quality (simplified heuristic)
        """
        # Basic quality indicators
        score = 0.5  # Base score
        
        # Length ratio check
        source_len = len(request.source_text)
        target_len = len(translated_text)
        
        if source_len > 0:
            length_ratio = target_len / source_len
            if 0.5 <= length_ratio <= 2.0:  # Reasonable length ratio
                score += 0.2
        
        # Basic completeness check
        if translated_text.strip() and len(translated_text) > 3:
            score += 0.2
        
        # Punctuation preservation
        source_punct = len([c for c in request.source_text if c in '.,!?;:'])
        target_punct = len([c for c in translated_text if c in '.,!?;:'])
        
        if source_punct > 0 and abs(source_punct - target_punct) <= 2:
            score += 0.1
        
        return min(score, 1.0)
    
    async def _translate_with_provider(
        self,
        request: RealTimeTranslationRequest,
        provider: TranslationProvider
    ) -> RealTimeTranslationResult:
        """
        Translate using specific provider
        """
        start_time = time.time()
        
        translated_text = await self.providers[provider](
            request.source_text,
            request.source_language,
            request.target_language,
            request.context
        )
        
        processing_time = int((time.time() - start_time) * 1000)
        quality_score = self._estimate_quality(translated_text, request)
        
        return RealTimeTranslationResult(
            translated_text=translated_text,
            confidence_score=self.provider_stats[provider]['quality_score'],
            provider=provider,
            processing_time_ms=processing_time,
            quality_score=quality_score,
            cached=False,
            alternative_translations=[],
            cultural_adaptations=[]
        )
    
    # Provider implementations (simplified - would integrate with actual APIs)
    async def _google_translate(
        self,
        text: str,
        source_lang: LanguageCode,
        target_lang: LanguageCode,
        context: Optional[Dict] = None
    ) -> str:
        """Google Translate implementation"""
        # Simulate translation delay
        await asyncio.sleep(0.1)
        return f"[GT] {text} -> {target_lang.value}"
    
    async def _azure_translate(
        self,
        text: str,
        source_lang: LanguageCode,
        target_lang: LanguageCode,
        context: Optional[Dict] = None
    ) -> str:
        """Azure Translator implementation"""
        await asyncio.sleep(0.15)
        return f"[Azure] {text} -> {target_lang.value}"
    
    async def _deepl_translate(
        self,
        text: str,
        source_lang: LanguageCode,
        target_lang: LanguageCode,
        context: Optional[Dict] = None
    ) -> str:
        """DeepL implementation"""
        await asyncio.sleep(0.2)
        return f"[DeepL] {text} -> {target_lang.value}"
    
    async def _openai_translate(
        self,
        text: str,
        source_lang: LanguageCode,
        target_lang: LanguageCode,
        context: Optional[Dict] = None
    ) -> str:
        """OpenAI GPT implementation"""
        await asyncio.sleep(0.3)
        return f"[OpenAI] {text} -> {target_lang.value}"
    
    async def _claude_translate(
        self,
        text: str,
        source_lang: LanguageCode,
        target_lang: LanguageCode,
        context: Optional[Dict] = None
    ) -> str:
        """Anthropic Claude implementation"""
        await asyncio.sleep(0.25)
        return f"[Claude] {text} -> {target_lang.value}"

class RealTimeTranslationService:
    """
    Real-time translation service for live meetings
    
    Design Decision: Optimized for low-latency, high-quality translation
    with intelligent caching and provider selection.
    
    Key Features:
    - Sub-second translation latency
    - Intelligent provider selection
    - Translation memory and caching
    - Quality optimization
    - Cultural adaptation
    - Streaming translation support
    """
    
    def __init__(self, db: Session):
        self.db = db
        self.cache = TranslationCache(db)
        self.provider_manager = TranslationProviderManager()
        self.active_streams = {}  # Meeting ID -> TranslationStream
        self.text_buffers = {}   # Stream ID -> text buffer
    
    async def translate_text(
        self,
        source_text: str,
        source_language: LanguageCode,
        target_language: LanguageCode,
        quality_level: TranslationQuality = TranslationQuality.STANDARD,
        context: Optional[Dict[str, Any]] = None,
        meeting_id: Optional[str] = None,
        participant_id: Optional[str] = None
    ) -> RealTimeTranslationResult:
        """
        Translate text with optimal performance and quality
        
        Args:
            source_text: Text to translate
            source_language: Source language
            target_language: Target language
            quality_level: Required quality level
            context: Additional context
            meeting_id: Meeting ID for context
            participant_id: Participant ID
        
        Returns:
            Translation result
        """
        # Check cache first
        cached_translation = await self.cache.get_cached_translation(
            source_text, source_language, target_language
        )
        
        if cached_translation:
            return RealTimeTranslationResult(
                translated_text=cached_translation.translated_text,
                confidence_score=cached_translation.confidence_score,
                provider=cached_translation.provider,
                processing_time_ms=5,  # Cache hit is very fast
                quality_score=cached_translation.quality_score,
                cached=True,
                alternative_translations=[],
                cultural_adaptations=[]
            )
        
        # Create translation request
        request = RealTimeTranslationRequest(
            source_text=source_text,
            source_language=source_language,
            target_language=target_language,
            quality_level=quality_level,
            context=context,
            speaker_id=participant_id
        )
        
        # Perform translation
        result = await self.provider_manager.translate(request)
        
        # Save translation to database
        translation_record = await self._save_translation(
            request, result, meeting_id, participant_id
        )
        
        # Cache the translation
        if translation_record:
            await self.cache.cache_translation(
                translation_record, source_text
            )
        
        return result
    
    async def start_translation_stream(
        self,
        stream_config: TranslationStream
    ) -> str:
        """
        Start a real-time translation stream for a meeting
        
        Args:
            stream_config: Stream configuration
        
        Returns:
            Stream ID
        """
        stream_id = f"{stream_config.meeting_id}_{int(time.time())}"
        
        self.active_streams[stream_id] = stream_config
        self.text_buffers[stream_id] = {
            'buffer': '',
            'last_translation': time.time(),
            'pending_translations': []
        }
        
        return stream_id
    
    async def add_to_translation_stream(
        self,
        stream_id: str,
        text_chunk: str,
        source_language: LanguageCode,
        speaker_id: Optional[str] = None
    ) -> List[RealTimeTranslationResult]:
        """
        Add text to translation stream and get translations
        
        Args:
            stream_id: Stream ID
            text_chunk: New text chunk
            source_language: Language of the text
            speaker_id: Speaker ID
        
        Returns:
            List of translation results for all target languages
        """
        if stream_id not in self.active_streams:
            raise ValueError(f"Stream {stream_id} not found")
        
        stream_config = self.active_streams[stream_id]
        buffer_info = self.text_buffers[stream_id]
        
        # Add to buffer
        buffer_info['buffer'] += text_chunk
        
        # Check if we should translate
        should_translate = (
            len(buffer_info['buffer']) >= stream_config.buffer_size or
            (time.time() - buffer_info['last_translation']) * 1000 >= stream_config.max_delay_ms or
            text_chunk.endswith(('.', '!', '?', ';'))  # Sentence ending
        )
        
        if not should_translate:
            return []
        
        # Get text to translate
        text_to_translate = buffer_info['buffer'].strip()
        if not text_to_translate:
            return []
        
        # Clear buffer
        buffer_info['buffer'] = ''
        buffer_info['last_translation'] = time.time()
        
        # Translate to all target languages
        results = []
        for target_language in stream_config.target_languages:
            if target_language != source_language:
                result = await self.translate_text(
                    text_to_translate,
                    source_language,
                    target_language,
                    stream_config.quality_level,
                    {'meeting_id': stream_config.meeting_id, 'speaker_id': speaker_id},
                    stream_config.meeting_id,
                    speaker_id
                )
                results.append(result)
        
        return results
    
    async def stop_translation_stream(self, stream_id: str) -> None:
        """
        Stop a translation stream
        
        Args:
            stream_id: Stream ID to stop
        """
        if stream_id in self.active_streams:
            del self.active_streams[stream_id]
        
        if stream_id in self.text_buffers:
            del self.text_buffers[stream_id]
    
    async def get_translation_statistics(
        self,
        meeting_id: str,
        time_range: Optional[Tuple[datetime, datetime]] = None
    ) -> Dict[str, Any]:
        """
        Get translation statistics for a meeting
        
        Args:
            meeting_id: Meeting ID
            time_range: Optional time range filter
        
        Returns:
            Dictionary with translation statistics
        """
        # Get translations for meeting
        query = self.db.query(Translation).join(
            Translation.source_transcript
        ).filter(
            Translation.source_transcript.has(meeting_id=meeting_id)
        )
        
        if time_range:
            query = query.filter(
                Translation.created_at >= time_range[0],
                Translation.created_at <= time_range[1]
            )
        
        translations = query.all()
        
        if not translations:
            return {'total_translations': 0}
        
        # Calculate statistics
        stats = {
            'total_translations': len(translations),
            'language_pairs': {},
            'providers': {},
            'quality_levels': {},
            'avg_processing_time': 0,
            'avg_confidence': 0,
            'cache_hit_rate': 0
        }
        
        total_processing_time = 0
        total_confidence = 0
        cache_hits = 0
        
        for translation in translations:
            # Language pairs
            lang_pair = f"{translation.source_language.code.value}->{translation.target_language.code.value}"
            stats['language_pairs'][lang_pair] = stats['language_pairs'].get(lang_pair, 0) + 1
            
            # Providers
            provider = translation.provider.value
            stats['providers'][provider] = stats['providers'].get(provider, 0) + 1
            
            # Quality levels
            quality = translation.quality_level.value
            stats['quality_levels'][quality] = stats['quality_levels'].get(quality, 0) + 1
            
            # Metrics
            total_processing_time += translation.translation_time_ms or 0
            total_confidence += translation.confidence_score or 0
            
            if translation.cache_hit:
                cache_hits += 1
        
        # Calculate averages
        stats['avg_processing_time'] = total_processing_time / len(translations)
        stats['avg_confidence'] = total_confidence / len(translations)
        stats['cache_hit_rate'] = cache_hits / len(translations)
        
        return stats
    
    async def _save_translation(
        self,
        request: RealTimeTranslationRequest,
        result: RealTimeTranslationResult,
        meeting_id: Optional[str] = None,
        participant_id: Optional[str] = None
    ) -> Optional[Translation]:
        """
        Save translation to database
        
        Args:
            request: Original request
            result: Translation result
            meeting_id: Meeting ID
            participant_id: Participant ID
        
        Returns:
            Saved translation record
        """
        try:
            # Get language records
            source_language = self.db.query(Language).filter(
                Language.code == request.source_language
            ).first()
            
            target_language = self.db.query(Language).filter(
                Language.code == request.target_language
            ).first()
            
            if not source_language or not target_language:
                return None
            
            # Create translation record
            translation = Translation(
                source_text=request.source_text,
                translated_text=result.translated_text,
                source_language_id=source_language.id,
                target_language_id=target_language.id,
                provider=result.provider,
                quality_level=request.quality_level,
                confidence_score=result.confidence_score,
                quality_score=result.quality_score,
                translation_time_ms=result.processing_time_ms,
                cache_hit=result.cached
            )
            
            self.db.add(translation)
            self.db.commit()
            
            return translation
            
        except Exception as e:
            print(f"Error saving translation: {e}")
            self.db.rollback()
            return None
    
    async def batch_translate(
        self,
        texts: List[str],
        source_language: LanguageCode,
        target_languages: List[LanguageCode],
        quality_level: TranslationQuality = TranslationQuality.STANDARD
    ) -> Dict[LanguageCode, List[RealTimeTranslationResult]]:
        """
        Batch translate multiple texts to multiple languages
        
        Args:
            texts: List of texts to translate
            source_language: Source language
            target_languages: Target languages
            quality_level: Quality level
        
        Returns:
            Dictionary mapping target languages to translation results
        """
        results = {lang: [] for lang in target_languages}
        
        # Process translations concurrently
        tasks = []
        for target_lang in target_languages:
            for text in texts:
                task = self.translate_text(
                    text, source_language, target_lang, quality_level
                )
                tasks.append((target_lang, task))
        
        # Execute all translations
        completed_tasks = await asyncio.gather(
            *[task for _, task in tasks],
            return_exceptions=True
        )
        
        # Organize results
        task_index = 0
        for target_lang in target_languages:
            for _ in texts:
                result = completed_tasks[task_index]
                if not isinstance(result, Exception):
                    results[target_lang].append(result)
                task_index += 1
        
        return results