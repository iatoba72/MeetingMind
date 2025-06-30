# Internationalization API Endpoints
# FastAPI endpoints for multi-language transcription, translation, and cultural adaptation

from fastapi import APIRouter, HTTPException, Depends, Query, Body
from sqlalchemy.orm import Session
from typing import List, Optional, Dict, Any
from datetime import datetime
import json

from database import get_db
from i18n_models import LanguageCode, TranslationQuality, CulturalContext
from multi_language_transcription_service import MultiLanguageTranscriptionService
from real_time_translation_service import RealTimeTranslationService, TranslationStream
from language_specific_insights_service import LanguageSpecificInsightsService
from translation_memory_system import (
    TranslationMemorySystem,
    MemorySearchRequest,
    MemoryUpdateRequest,
)
from cultural_adaptation_service import CulturalAdaptationService
from language_lab_service import LanguageLabService

router = APIRouter(prefix="/i18n", tags=["internationalization"])


# Dependency functions
def get_transcription_service(
    db: Session = Depends(get_db),
) -> MultiLanguageTranscriptionService:
    return MultiLanguageTranscriptionService(db)


def get_translation_service(
    db: Session = Depends(get_db),
) -> RealTimeTranslationService:
    return RealTimeTranslationService(db)


def get_insights_service(
    db: Session = Depends(get_db),
) -> LanguageSpecificInsightsService:
    return LanguageSpecificInsightsService(db)


def get_memory_service(db: Session = Depends(get_db)) -> TranslationMemorySystem:
    return TranslationMemorySystem(db)


def get_cultural_service(db: Session = Depends(get_db)) -> CulturalAdaptationService:
    return CulturalAdaptationService(db)


def get_language_lab_service(db: Session = Depends(get_db)) -> LanguageLabService:
    return LanguageLabService(db)


# Multi-Language Transcription Endpoints
@router.post("/transcription/analyze")
async def analyze_multilingual_audio(
    audio_data: Dict[str, Any],
    meeting_id: str,
    participant_id: Optional[str] = None,
    expected_languages: Optional[List[str]] = None,
    service: MultiLanguageTranscriptionService = Depends(get_transcription_service),
):
    """Analyze audio for multi-language transcription"""
    try:
        # Convert string language codes to enums
        lang_codes = []
        if expected_languages:
            for lang in expected_languages:
                try:
                    lang_codes.append(LanguageCode(lang))
                except ValueError:
                    continue

        # Simulate audio data (in production would handle actual audio bytes)
        simulated_audio = b"audio_data_placeholder"

        result = await service.transcribe_multilingual_audio(
            simulated_audio,
            meeting_id,
            participant_id,
            lang_codes if lang_codes else None,
        )

        return {
            "segments": [
                {
                    "text": seg.text,
                    "start_time": seg.start_time,
                    "end_time": seg.end_time,
                    "language": seg.language.value,
                    "confidence": seg.confidence,
                    "is_code_switched": seg.is_code_switched,
                }
                for seg in result.segments
            ],
            "primary_language": result.primary_language.value,
            "languages_detected": [lang.value for lang in result.languages_detected],
            "code_switching_points": result.code_switching_points,
            "overall_confidence": result.overall_confidence,
            "processing_metadata": result.processing_metadata,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/transcription/language-stats/{meeting_id}")
async def get_language_statistics(
    meeting_id: str,
    service: MultiLanguageTranscriptionService = Depends(get_transcription_service),
):
    """Get language usage statistics for a meeting"""
    try:
        stats = await service.get_language_statistics(meeting_id)
        return stats
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/transcription/validate")
async def validate_language_detection(
    transcript_id: str,
    correct_language: str,
    user_id: str,
    correction_reason: Optional[str] = None,
    service: MultiLanguageTranscriptionService = Depends(get_transcription_service),
):
    """Validate/correct language detection"""
    try:
        correct_lang = LanguageCode(correct_language)
        success = await service.validate_language_detection(
            transcript_id, correct_lang, user_id, correction_reason
        )
        return {"success": success}
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid language code")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# Real-Time Translation Endpoints
@router.post("/translation/translate")
async def translate_text(
    source_text: str,
    source_language: str,
    target_language: str,
    quality_level: str = "standard",
    meeting_id: Optional[str] = None,
    participant_id: Optional[str] = None,
    context: Optional[Dict[str, Any]] = None,
    service: RealTimeTranslationService = Depends(get_translation_service),
):
    """Translate text with optimal performance and quality"""
    try:
        source_lang = LanguageCode(source_language)
        target_lang = LanguageCode(target_language)
        quality = TranslationQuality(quality_level)

        result = await service.translate_text(
            source_text,
            source_lang,
            target_lang,
            quality,
            context,
            meeting_id,
            participant_id,
        )

        return {
            "translated_text": result.translated_text,
            "confidence_score": result.confidence_score,
            "provider": result.provider.value,
            "processing_time_ms": result.processing_time_ms,
            "quality_score": result.quality_score,
            "cached": result.cached,
            "alternative_translations": result.alternative_translations,
            "cultural_adaptations": result.cultural_adaptations,
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/translation/stream/start")
async def start_translation_stream(
    meeting_id: str,
    source_language: str,
    target_languages: List[str],
    quality_level: str = "standard",
    buffer_size: int = 100,
    max_delay_ms: int = 500,
    enable_cultural_adaptation: bool = True,
    service: RealTimeTranslationService = Depends(get_translation_service),
):
    """Start a real-time translation stream"""
    try:
        source_lang = LanguageCode(source_language)
        target_langs = [LanguageCode(lang) for lang in target_languages]
        quality = TranslationQuality(quality_level)

        stream_config = TranslationStream(
            meeting_id=meeting_id,
            source_language=source_lang,
            target_languages=target_langs,
            quality_level=quality,
            enable_cultural_adaptation=enable_cultural_adaptation,
            buffer_size=buffer_size,
            max_delay_ms=max_delay_ms,
        )

        stream_id = await service.start_translation_stream(stream_config)
        return {"stream_id": stream_id}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/translation/stream/{stream_id}/add")
async def add_to_translation_stream(
    stream_id: str,
    text_chunk: str,
    source_language: str,
    speaker_id: Optional[str] = None,
    service: RealTimeTranslationService = Depends(get_translation_service),
):
    """Add text to translation stream"""
    try:
        source_lang = LanguageCode(source_language)

        results = await service.add_to_translation_stream(
            stream_id, text_chunk, source_lang, speaker_id
        )

        return {
            "translations": [
                {
                    "target_language": result.translated_text,
                    "translated_text": result.translated_text,
                    "confidence": result.confidence_score,
                    "provider": result.provider.value,
                    "processing_time_ms": result.processing_time_ms,
                }
                for result in results
            ]
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/translation/stream/{stream_id}")
async def stop_translation_stream(
    stream_id: str,
    service: RealTimeTranslationService = Depends(get_translation_service),
):
    """Stop a translation stream"""
    try:
        await service.stop_translation_stream(stream_id)
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/translation/stats/{meeting_id}")
async def get_translation_statistics(
    meeting_id: str,
    start_time: Optional[str] = None,
    end_time: Optional[str] = None,
    service: RealTimeTranslationService = Depends(get_translation_service),
):
    """Get translation statistics for a meeting"""
    try:
        time_range = None
        if start_time and end_time:
            time_range = (
                datetime.fromisoformat(start_time),
                datetime.fromisoformat(end_time),
            )

        stats = await service.get_translation_statistics(meeting_id, time_range)
        return stats
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# Language-Specific Insights Endpoints
@router.post("/insights/generate/{meeting_id}")
async def generate_multilingual_insights(
    meeting_id: str,
    service: LanguageSpecificInsightsService = Depends(get_insights_service),
):
    """Generate comprehensive multilingual insights for a meeting"""
    try:
        insights = await service.generate_multilingual_insights(meeting_id)

        return {
            "meeting_id": insights.meeting_id,
            "languages_analyzed": [lang.value for lang in insights.languages_analyzed],
            "cultural_insights": [
                {
                    "type": insight.insight_type,
                    "title": insight.title,
                    "description": insight.description,
                    "language": insight.language.value,
                    "cultural_context": (
                        insight.cultural_context.value
                        if insight.cultural_context
                        else None
                    ),
                    "confidence": insight.confidence,
                    "evidence": insight.evidence,
                    "recommendations": insight.recommendations,
                    "cultural_notes": insight.cultural_notes,
                }
                for insight in insights.cultural_insights
            ],
            "language_patterns": {
                lang.value: {
                    "formality_level": patterns.formality_level,
                    "communication_style": patterns.communication_style,
                    "sentence_complexity": patterns.sentence_complexity,
                    "key_phrases": patterns.key_phrases,
                    "technical_terms": patterns.technical_terms,
                    "emotional_markers": patterns.emotional_markers,
                    "cultural_references": patterns.cultural_references,
                }
                for lang, patterns in insights.language_patterns.items()
            },
            "cross_cultural_observations": insights.cross_cultural_observations,
            "communication_effectiveness": insights.communication_effectiveness,
            "recommendations": insights.recommendations,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# Translation Memory Endpoints
@router.post("/memory/search")
async def search_translation_memory(
    source_text: str,
    source_language: str,
    target_language: str,
    domain: Optional[str] = None,
    context_tags: Optional[List[str]] = None,
    min_similarity: float = 0.7,
    max_results: int = 10,
    organization_id: Optional[str] = None,
    service: TranslationMemorySystem = Depends(get_memory_service),
):
    """Search translation memory for matching entries"""
    try:
        source_lang = LanguageCode(source_language)
        target_lang = LanguageCode(target_language)

        request = MemorySearchRequest(
            source_text=source_text,
            source_language=source_lang,
            target_language=target_lang,
            domain=domain,
            context_tags=context_tags,
            min_similarity=min_similarity,
            max_results=max_results,
            organization_id=organization_id,
        )

        matches = await service.search_memory(request)

        return {
            "matches": [
                {
                    "source_text": match.source_text,
                    "target_text": match.target_text,
                    "similarity_score": match.similarity_score,
                    "quality_score": match.quality_score,
                    "usage_frequency": match.usage_frequency,
                    "last_used": match.last_used.isoformat(),
                    "context_match": match.context_match,
                    "domain_match": match.domain_match,
                }
                for match in matches
            ]
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/memory/add")
async def add_to_translation_memory(
    source_text: str,
    target_text: str,
    source_language: str,
    target_language: str,
    quality_score: float,
    domain: str = "general",
    context_tags: Optional[List[str]] = None,
    created_by: str = "system",
    organization_id: Optional[str] = None,
    force_update: bool = False,
    service: TranslationMemorySystem = Depends(get_memory_service),
):
    """Add translation to memory"""
    try:
        source_lang = LanguageCode(source_language)
        target_lang = LanguageCode(target_language)

        request = MemoryUpdateRequest(
            source_text=source_text,
            target_text=target_text,
            source_language=source_lang,
            target_language=target_lang,
            quality_score=quality_score,
            domain=domain,
            context_tags=context_tags,
            created_by=created_by,
            organization_id=organization_id,
            force_update=force_update,
        )

        memory_id = await service.add_to_memory(request)
        return {"memory_id": memory_id}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/memory/stats")
async def get_memory_statistics(
    source_language: Optional[str] = None,
    target_language: Optional[str] = None,
    domain: Optional[str] = None,
    organization_id: Optional[str] = None,
    service: TranslationMemorySystem = Depends(get_memory_service),
):
    """Get translation memory statistics"""
    try:
        language_pair = None
        if source_language and target_language:
            language_pair = (
                LanguageCode(source_language),
                LanguageCode(target_language),
            )

        stats = await service.get_memory_statistics(
            language_pair, domain, organization_id
        )
        return stats
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# Cultural Adaptation Endpoints
@router.post("/cultural/analyze/{meeting_id}")
async def analyze_cultural_context(
    meeting_id: str, service: CulturalAdaptationService = Depends(get_cultural_service)
):
    """Analyze cultural context for a meeting"""
    try:
        analysis = await service.analyze_meeting_cultural_context(meeting_id)
        return analysis
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# Language Lab Endpoints
@router.post("/lab/test/comprehensive")
async def run_comprehensive_test(
    include_translation_quality: bool = True,
    include_cultural_adaptation: bool = True,
    include_memory_effectiveness: bool = True,
    language_pairs: Optional[List[str]] = None,
    providers: Optional[List[str]] = None,
    service: LanguageLabService = Depends(get_language_lab_service),
):
    """Run comprehensive language lab test"""
    try:
        # Parse language pairs
        parsed_pairs = []
        if language_pairs:
            for pair in language_pairs:
                if "->" in pair:
                    source, target = pair.split("->")
                    parsed_pairs.append((LanguageCode(source), LanguageCode(target)))

        # Parse providers
        from i18n_models import TranslationProvider

        parsed_providers = []
        if providers:
            for provider in providers:
                try:
                    parsed_providers.append(TranslationProvider(provider))
                except ValueError:
                    continue

        results = await service.run_comprehensive_test(
            include_translation_quality=include_translation_quality,
            include_cultural_adaptation=include_cultural_adaptation,
            include_memory_effectiveness=include_memory_effectiveness,
            language_pairs=parsed_pairs if parsed_pairs else None,
            providers=parsed_providers if parsed_providers else None,
        )

        return results
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/lab/test/history")
async def get_test_history(
    limit: int = 10,
    test_type: Optional[str] = None,
    service: LanguageLabService = Depends(get_language_lab_service),
):
    """Get test execution history"""
    try:
        from language_lab_service import TestType

        test_type_enum = None
        if test_type:
            try:
                test_type_enum = TestType(test_type)
            except ValueError:
                pass

        history = await service.get_test_history(limit, test_type_enum)
        return {"test_history": history}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/lab/test/{test_id}/export")
async def export_test_results(
    test_id: str,
    format_type: str = "json",
    service: LanguageLabService = Depends(get_language_lab_service),
):
    """Export test results"""
    try:
        exported_data = await service.export_test_results(test_id, format_type)

        if format_type.lower() == "json":
            return {"data": exported_data}
        else:
            return {"data": exported_data, "format": format_type}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# Language Detection Test Endpoint
@router.post("/lab/test/language-detection")
async def test_language_detection(
    test_texts: List[str],
    expected_languages: Optional[List[str]] = None,
    service: MultiLanguageTranscriptionService = Depends(get_transcription_service),
):
    """Test language detection accuracy"""
    try:
        results = []

        for i, text in enumerate(test_texts):
            detection_result = await service.language_detector.detect_language(text)

            expected = None
            if expected_languages and i < len(expected_languages):
                try:
                    expected = LanguageCode(expected_languages[i])
                except ValueError:
                    pass

            is_correct = (
                expected == detection_result.detected_language if expected else None
            )

            results.append(
                {
                    "text": text,
                    "detected_language": detection_result.detected_language.value,
                    "confidence": detection_result.confidence,
                    "alternative_languages": detection_result.alternative_languages,
                    "algorithm_used": detection_result.algorithm_used,
                    "processing_time_ms": detection_result.processing_time_ms,
                    "expected_language": expected.value if expected else None,
                    "is_correct": is_correct,
                    "text_features": detection_result.text_features,
                }
            )

        # Calculate accuracy if expected languages provided
        accuracy = None
        if expected_languages:
            correct_predictions = sum(1 for r in results if r.get("is_correct") is True)
            accuracy = correct_predictions / len(results) if results else 0.0

        return {"results": results, "accuracy": accuracy, "total_tests": len(results)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# Health check endpoint
@router.get("/health")
async def health_check():
    """Health check for internationalization services"""
    return {
        "status": "healthy",
        "services": {
            "transcription": "available",
            "translation": "available",
            "insights": "available",
            "memory": "available",
            "cultural": "available",
            "language_lab": "available",
        },
        "timestamp": datetime.utcnow().isoformat(),
    }
