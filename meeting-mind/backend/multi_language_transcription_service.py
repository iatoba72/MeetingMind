# Multi-Language Transcription Service
# Advanced transcription service with language detection and multi-language support

from typing import List, Dict, Optional, Tuple, Any
from sqlalchemy.orm import Session
from datetime import datetime
import asyncio
import json
import hashlib
import re
from dataclasses import dataclass

from i18n_models import (
    Language, MultiLanguageTranscript, LanguageDetectionLog, 
    LanguageCode, TranslationProvider
)
from models import Meeting, Participant
from database import get_db

# Language detection libraries (would need to install)
try:
    import langdetect
    from langdetect import detect, detect_langs, DetectorFactory
    DetectorFactory.seed = 0  # For consistent results
except ImportError:
    langdetect = None

try:
    import polyglot
    from polyglot.detect import Detector
except ImportError:
    polyglot = None

@dataclass
class LanguageDetectionResult:
    """Language detection result with confidence scores"""
    detected_language: LanguageCode
    confidence: float
    alternative_languages: List[Dict[str, float]]
    algorithm_used: str
    processing_time_ms: int
    text_features: Dict[str, Any]

@dataclass
class TranscriptionSegment:
    """Individual transcription segment with timing and language info"""
    text: str
    start_time: float
    end_time: float
    speaker_id: Optional[str]
    language: LanguageCode
    confidence: float
    is_code_switched: bool = False

@dataclass
class MultiLanguageTranscriptionResult:
    """Complete multi-language transcription result"""
    segments: List[TranscriptionSegment]
    primary_language: LanguageCode
    languages_detected: List[LanguageCode]
    code_switching_points: List[float]
    overall_confidence: float
    processing_metadata: Dict[str, Any]

class LanguageDetector:
    """
    Advanced language detection using multiple algorithms
    
    Design Decision: Uses ensemble of detection methods for improved accuracy
    across different text types and languages.
    """
    
    def __init__(self):
        self.supported_algorithms = []
        if langdetect:
            self.supported_algorithms.append('langdetect')
        if polyglot:
            self.supported_algorithms.append('polyglot')
        self.supported_algorithms.append('statistical')  # Our basic implementation
    
    async def detect_language(self, text: str, context: Optional[Dict] = None) -> LanguageDetectionResult:
        """
        Detect language using ensemble of algorithms
        
        Args:
            text: Text to analyze
            context: Additional context (speaker info, meeting metadata)
        
        Returns:
            LanguageDetectionResult with detection details
        """
        start_time = datetime.now()
        
        # Clean and prepare text
        cleaned_text = self._clean_text(text)
        if len(cleaned_text.strip()) < 3:
            return self._create_default_result('en', 0.1, 'text_too_short')
        
        # Run multiple detection algorithms
        results = []
        
        # LangDetect algorithm
        if 'langdetect' in self.supported_algorithms:
            try:
                langdetect_result = await self._detect_with_langdetect(cleaned_text)
                results.append(langdetect_result)
            except Exception as e:
                print(f"LangDetect failed: {e}")
        
        # Polyglot algorithm
        if 'polyglot' in self.supported_algorithms:
            try:
                polyglot_result = await self._detect_with_polyglot(cleaned_text)
                results.append(polyglot_result)
            except Exception as e:
                print(f"Polyglot failed: {e}")
        
        # Statistical algorithm (fallback)
        statistical_result = await self._detect_with_statistical(cleaned_text)
        results.append(statistical_result)
        
        # Ensemble decision
        final_result = self._ensemble_decision(results, context)
        
        # Calculate processing time
        processing_time = int((datetime.now() - start_time).total_seconds() * 1000)
        final_result.processing_time_ms = processing_time
        
        # Extract text features for analysis
        final_result.text_features = self._extract_text_features(cleaned_text)
        
        return final_result
    
    def _clean_text(self, text: str) -> str:
        """Clean text for language detection"""
        # Remove URLs, email addresses, numbers
        text = re.sub(r'http[s]?://(?:[a-zA-Z]|[0-9]|[$-_@.&+]|[!*\(\),]|(?:%[0-9a-fA-F][0-9a-fA-F]))+', '', text)
        text = re.sub(r'\S+@\S+', '', text)
        text = re.sub(r'\b\d+\b', '', text)
        
        # Remove excessive whitespace
        text = re.sub(r'\s+', ' ', text).strip()
        
        return text
    
    async def _detect_with_langdetect(self, text: str) -> Dict[str, Any]:
        """Detect language using langdetect library"""
        detected_langs = detect_langs(text)
        primary = detected_langs[0]
        
        alternatives = []
        for lang in detected_langs[1:5]:  # Top 5 alternatives
            alternatives.append({
                'language': lang.lang,
                'confidence': lang.prob
            })
        
        return {
            'language': primary.lang,
            'confidence': primary.prob,
            'alternatives': alternatives,
            'algorithm': 'langdetect'
        }
    
    async def _detect_with_polyglot(self, text: str) -> Dict[str, Any]:
        """Detect language using polyglot library"""
        detector = Detector(text)
        
        alternatives = []
        for lang in detector.languages[1:5]:  # Top 5 alternatives
            alternatives.append({
                'language': lang.code,
                'confidence': lang.confidence
            })
        
        return {
            'language': detector.language.code,
            'confidence': detector.language.confidence,
            'alternatives': alternatives,
            'algorithm': 'polyglot'
        }
    
    async def _detect_with_statistical(self, text: str) -> Dict[str, Any]:
        """Basic statistical language detection"""
        # Simple character frequency analysis
        char_frequencies = self._analyze_character_frequencies(text)
        
        # Language scoring based on character patterns
        language_scores = {
            'en': self._score_english(char_frequencies),
            'es': self._score_spanish(char_frequencies),
            'fr': self._score_french(char_frequencies),
            'de': self._score_german(char_frequencies),
            'zh': self._score_chinese(text),
            'ja': self._score_japanese(text),
            'ar': self._score_arabic(text)
        }
        
        # Sort by score
        sorted_scores = sorted(language_scores.items(), key=lambda x: x[1], reverse=True)
        
        alternatives = []
        for lang, score in sorted_scores[1:5]:
            alternatives.append({
                'language': lang,
                'confidence': score
            })
        
        return {
            'language': sorted_scores[0][0],
            'confidence': sorted_scores[0][1],
            'alternatives': alternatives,
            'algorithm': 'statistical'
        }
    
    def _analyze_character_frequencies(self, text: str) -> Dict[str, float]:
        """Analyze character frequency distribution"""
        total_chars = len(text)
        if total_chars == 0:
            return {}
        
        char_counts = {}
        for char in text.lower():
            if char.isalpha():
                char_counts[char] = char_counts.get(char, 0) + 1
        
        # Convert to frequencies
        char_frequencies = {}
        for char, count in char_counts.items():
            char_frequencies[char] = count / total_chars
        
        return char_frequencies
    
    def _score_english(self, char_freq: Dict[str, float]) -> float:
        """Score text as English based on character frequencies"""
        english_freq = {
            'e': 0.12, 't': 0.09, 'a': 0.08, 'o': 0.075, 'i': 0.07,
            'n': 0.067, 's': 0.063, 'h': 0.061, 'r': 0.06
        }
        
        score = 0.0
        for char, expected_freq in english_freq.items():
            actual_freq = char_freq.get(char, 0)
            # Score based on how close actual frequency is to expected
            score += 1.0 - abs(actual_freq - expected_freq)
        
        return score / len(english_freq)
    
    def _score_spanish(self, char_freq: Dict[str, float]) -> float:
        """Score text as Spanish based on character frequencies"""
        spanish_freq = {
            'a': 0.125, 'e': 0.124, 'o': 0.087, 's': 0.072, 'n': 0.071,
            'r': 0.069, 'i': 0.063, 'l': 0.050, 'd': 0.058
        }
        
        score = 0.0
        for char, expected_freq in spanish_freq.items():
            actual_freq = char_freq.get(char, 0)
            score += 1.0 - abs(actual_freq - expected_freq)
        
        return score / len(spanish_freq)
    
    def _score_french(self, char_freq: Dict[str, float]) -> float:
        """Score text as French based on character frequencies"""
        french_freq = {
            'e': 0.147, 's': 0.081, 'a': 0.076, 'n': 0.073, 't': 0.072,
            'i': 0.072, 'r': 0.066, 'u': 0.064, 'l': 0.057
        }
        
        score = 0.0
        for char, expected_freq in french_freq.items():
            actual_freq = char_freq.get(char, 0)
            score += 1.0 - abs(actual_freq - expected_freq)
        
        return score / len(french_freq)
    
    def _score_german(self, char_freq: Dict[str, float]) -> float:
        """Score text as German based on character frequencies"""
        german_freq = {
            'e': 0.174, 'n': 0.098, 'i': 0.075, 'r': 0.070, 's': 0.070,
            'a': 0.065, 't': 0.061, 'd': 0.051, 'h': 0.048
        }
        
        score = 0.0
        for char, expected_freq in german_freq.items():
            actual_freq = char_freq.get(char, 0)
            score += 1.0 - abs(actual_freq - expected_freq)
        
        return score / len(german_freq)
    
    def _score_chinese(self, text: str) -> float:
        """Score text as Chinese based on character patterns"""
        # Look for Chinese characters (CJK Unified Ideographs)
        chinese_chars = sum(1 for char in text if '\u4e00' <= char <= '\u9fff')
        total_chars = len([c for c in text if c.isalnum()])
        
        if total_chars == 0:
            return 0.0
        
        return chinese_chars / total_chars
    
    def _score_japanese(self, text: str) -> float:
        """Score text as Japanese based on character patterns"""
        # Look for Hiragana, Katakana, and Kanji
        hiragana = sum(1 for char in text if '\u3040' <= char <= '\u309f')
        katakana = sum(1 for char in text if '\u30a0' <= char <= '\u30ff')
        kanji = sum(1 for char in text if '\u4e00' <= char <= '\u9fff')
        
        japanese_chars = hiragana + katakana + kanji
        total_chars = len([c for c in text if c.isalnum()])
        
        if total_chars == 0:
            return 0.0
        
        return japanese_chars / total_chars
    
    def _score_arabic(self, text: str) -> float:
        """Score text as Arabic based on character patterns"""
        # Look for Arabic characters
        arabic_chars = sum(1 for char in text if '\u0600' <= char <= '\u06ff')
        total_chars = len([c for c in text if c.isalnum()])
        
        if total_chars == 0:
            return 0.0
        
        return arabic_chars / total_chars
    
    def _ensemble_decision(self, results: List[Dict], context: Optional[Dict] = None) -> LanguageDetectionResult:
        """Make final language decision using ensemble of results"""
        if not results:
            return self._create_default_result('en', 0.1, 'no_results')
        
        # Weight algorithms by reliability
        algorithm_weights = {
            'langdetect': 0.4,
            'polyglot': 0.35,
            'statistical': 0.25
        }
        
        # Aggregate scores by language
        language_scores = {}
        for result in results:
            lang = result['language']
            confidence = result['confidence']
            algorithm = result['algorithm']
            weight = algorithm_weights.get(algorithm, 0.1)
            
            if lang not in language_scores:
                language_scores[lang] = 0.0
            language_scores[lang] += confidence * weight
        
        # Find best language
        if not language_scores:
            return self._create_default_result('en', 0.1, 'no_scores')
        
        best_lang = max(language_scores, key=language_scores.get)
        best_score = language_scores[best_lang]
        
        # Create alternatives list
        alternatives = []
        sorted_langs = sorted(language_scores.items(), key=lambda x: x[1], reverse=True)
        for lang, score in sorted_langs[1:5]:
            alternatives.append({'language': lang, 'confidence': score})
        
        try:
            detected_language = LanguageCode(best_lang)
        except ValueError:
            # Fallback to English if language code not supported
            detected_language = LanguageCode.EN
            best_score = 0.5
        
        return LanguageDetectionResult(
            detected_language=detected_language,
            confidence=best_score,
            alternative_languages=alternatives,
            algorithm_used='ensemble',
            processing_time_ms=0,  # Will be set by caller
            text_features={}
        )
    
    def _create_default_result(self, lang: str, confidence: float, reason: str) -> LanguageDetectionResult:
        """Create default detection result"""
        try:
            detected_language = LanguageCode(lang)
        except ValueError:
            detected_language = LanguageCode.EN
        
        return LanguageDetectionResult(
            detected_language=detected_language,
            confidence=confidence,
            alternative_languages=[],
            algorithm_used=f'default_{reason}',
            processing_time_ms=0,
            text_features={}
        )
    
    def _extract_text_features(self, text: str) -> Dict[str, Any]:
        """Extract features from text for analysis"""
        return {
            'length': len(text),
            'word_count': len(text.split()),
            'avg_word_length': sum(len(word) for word in text.split()) / max(len(text.split()), 1),
            'punctuation_ratio': len([c for c in text if not c.isalnum()]) / max(len(text), 1),
            'uppercase_ratio': len([c for c in text if c.isupper()]) / max(len(text), 1)
        }

class CodeSwitchingDetector:
    """
    Detect code-switching (language changes) within transcripts
    
    Design Decision: Code-switching is common in multilingual meetings
    and requires special handling for accurate transcription.
    """
    
    def __init__(self, language_detector: LanguageDetector):
        self.language_detector = language_detector
        self.min_segment_length = 10  # Minimum characters for language detection
    
    async def detect_code_switching(self, text: str, window_size: int = 50) -> List[Dict[str, Any]]:
        """
        Detect language switches in text using sliding window
        
        Args:
            text: Text to analyze
            window_size: Size of sliding window in characters
        
        Returns:
            List of code-switching points with positions and languages
        """
        if len(text) < window_size * 2:
            return []  # Text too short for meaningful analysis
        
        switches = []
        words = text.split()
        
        # Analyze overlapping segments
        for i in range(0, len(words) - 5, 3):  # Step by 3 words
            segment = ' '.join(words[i:i+10])  # 10-word window
            
            if len(segment) < self.min_segment_length:
                continue
            
            detection_result = await self.language_detector.detect_language(segment)
            
            # Check if this is a language switch
            if i > 0 and switches:
                prev_lang = switches[-1]['language']
                if detection_result.detected_language != prev_lang and detection_result.confidence > 0.7:
                    # Calculate approximate character position
                    char_pos = len(' '.join(words[:i]))
                    
                    switches.append({
                        'position': char_pos,
                        'word_index': i,
                        'language': detection_result.detected_language,
                        'confidence': detection_result.confidence,
                        'segment': segment[:50] + '...' if len(segment) > 50 else segment
                    })
            elif not switches:  # First segment
                switches.append({
                    'position': 0,
                    'word_index': 0,
                    'language': detection_result.detected_language,
                    'confidence': detection_result.confidence,
                    'segment': segment[:50] + '...' if len(segment) > 50 else segment
                })
        
        return switches

class MultiLanguageTranscriptionService:
    """
    Advanced transcription service with multi-language support
    
    Design Decision: Extends existing transcription capabilities with
    language detection, code-switching detection, and cultural awareness.
    
    Key Features:
    - Automatic language detection
    - Multi-language transcription
    - Code-switching detection
    - Quality assessment
    - Cultural context annotation
    """
    
    def __init__(self, db: Session):
        self.db = db
        self.language_detector = LanguageDetector()
        self.code_switching_detector = CodeSwitchingDetector(self.language_detector)
    
    async def transcribe_multilingual_audio(
        self,
        audio_data: bytes,
        meeting_id: str,
        participant_id: Optional[str] = None,
        expected_languages: Optional[List[LanguageCode]] = None
    ) -> MultiLanguageTranscriptionResult:
        """
        Transcribe audio with multi-language support
        
        Args:
            audio_data: Audio data to transcribe
            meeting_id: Meeting ID
            participant_id: Participant who spoke (if known)
            expected_languages: Languages expected in the audio
        
        Returns:
            MultiLanguageTranscriptionResult with detailed language information
        """
        # For now, simulate transcription result
        # In production, this would integrate with actual speech-to-text services
        simulated_transcript = "Hello everyone, let's begin the meeting. Hola, ¿cómo están todos?"
        
        # Detect primary language
        primary_detection = await self.language_detector.detect_language(simulated_transcript)
        
        # Detect code-switching
        code_switches = await self.code_switching_detector.detect_code_switching(simulated_transcript)
        
        # Create segments based on code-switching points
        segments = await self._create_language_segments(
            simulated_transcript, 
            code_switches,
            participant_id
        )
        
        # Determine all languages present
        languages_detected = list(set(segment.language for segment in segments))
        
        # Calculate overall confidence
        overall_confidence = sum(segment.confidence for segment in segments) / len(segments) if segments else 0.0
        
        return MultiLanguageTranscriptionResult(
            segments=segments,
            primary_language=primary_detection.detected_language,
            languages_detected=languages_detected,
            code_switching_points=[switch['position'] for switch in code_switches],
            overall_confidence=overall_confidence,
            processing_metadata={
                'detection_algorithm': primary_detection.algorithm_used,
                'processing_time_ms': primary_detection.processing_time_ms,
                'text_features': primary_detection.text_features
            }
        )
    
    async def _create_language_segments(
        self,
        text: str,
        code_switches: List[Dict],
        participant_id: Optional[str]
    ) -> List[TranscriptionSegment]:
        """Create transcription segments based on language switches"""
        segments = []
        
        if not code_switches:
            # Single language - create one segment
            detection = await self.language_detector.detect_language(text)
            segments.append(TranscriptionSegment(
                text=text,
                start_time=0.0,
                end_time=len(text) * 0.1,  # Rough estimate: 0.1s per character
                speaker_id=participant_id,
                language=detection.detected_language,
                confidence=detection.confidence,
                is_code_switched=False
            ))
        else:
            # Multiple languages - create segments for each switch
            prev_pos = 0
            for i, switch in enumerate(code_switches):
                if i == 0:
                    continue  # Skip first switch (it's the starting language)
                
                # Extract text segment
                segment_text = text[prev_pos:switch['position']].strip()
                if segment_text:
                    segments.append(TranscriptionSegment(
                        text=segment_text,
                        start_time=prev_pos * 0.1,
                        end_time=switch['position'] * 0.1,
                        speaker_id=participant_id,
                        language=code_switches[i-1]['language'],
                        confidence=code_switches[i-1]['confidence'],
                        is_code_switched=True
                    ))
                
                prev_pos = switch['position']
            
            # Add final segment
            final_text = text[prev_pos:].strip()
            if final_text:
                segments.append(TranscriptionSegment(
                    text=final_text,
                    start_time=prev_pos * 0.1,
                    end_time=len(text) * 0.1,
                    speaker_id=participant_id,
                    language=code_switches[-1]['language'],
                    confidence=code_switches[-1]['confidence'],
                    is_code_switched=True
                ))
        
        return segments
    
    async def save_multilingual_transcript(
        self,
        result: MultiLanguageTranscriptionResult,
        meeting_id: str,
        participant_id: Optional[str] = None
    ) -> List[str]:
        """
        Save multi-language transcription result to database
        
        Args:
            result: Transcription result
            meeting_id: Meeting ID
            participant_id: Participant ID (if known)
        
        Returns:
            List of transcript IDs created
        """
        transcript_ids = []
        
        for segment in result.segments:
            # Get or create language record
            language = self.db.query(Language).filter(
                Language.code == segment.language
            ).first()
            
            if not language:
                language = Language(
                    code=segment.language,
                    name=segment.language.value,
                    native_name=segment.language.value,
                    is_active=True
                )
                self.db.add(language)
                self.db.flush()  # Get ID
            
            # Create multi-language transcript
            transcript = MultiLanguageTranscript(
                meeting_id=meeting_id,
                participant_id=participant_id,
                language_id=language.id,
                original_text=segment.text,
                detected_language=segment.language,
                detection_confidence=segment.confidence,
                is_code_switched=segment.is_code_switched,
                start_time_seconds=segment.start_time,
                end_time_seconds=segment.end_time,
                duration_seconds=segment.end_time - segment.start_time,
                transcription_confidence=segment.confidence
            )
            
            self.db.add(transcript)
            self.db.flush()
            transcript_ids.append(str(transcript.id))
            
            # Log language detection
            detection_log = LanguageDetectionLog(
                transcript_id=transcript.id,
                detected_language=segment.language,
                confidence_score=segment.confidence,
                detection_algorithm=result.processing_metadata.get('detection_algorithm', 'unknown'),
                processing_time_ms=result.processing_metadata.get('processing_time_ms', 0),
                text_length=len(segment.text)
            )
            
            self.db.add(detection_log)
        
        self.db.commit()
        return transcript_ids
    
    async def get_language_statistics(self, meeting_id: str) -> Dict[str, Any]:
        """
        Get language usage statistics for a meeting
        
        Args:
            meeting_id: Meeting ID
        
        Returns:
            Dictionary with language statistics
        """
        transcripts = self.db.query(MultiLanguageTranscript).filter(
            MultiLanguageTranscript.meeting_id == meeting_id
        ).all()
        
        if not transcripts:
            return {'languages': [], 'code_switching_events': 0, 'multilingual': False}
        
        # Calculate language distribution
        language_stats = {}
        total_duration = 0
        code_switching_count = 0
        
        for transcript in transcripts:
            lang_code = transcript.detected_language.value
            duration = transcript.duration_seconds or 0
            
            if lang_code not in language_stats:
                language_stats[lang_code] = {
                    'code': lang_code,
                    'name': transcript.language.name,
                    'duration': 0,
                    'percentage': 0,
                    'segments': 0,
                    'confidence': 0
                }
            
            language_stats[lang_code]['duration'] += duration
            language_stats[lang_code]['segments'] += 1
            language_stats[lang_code]['confidence'] += transcript.detection_confidence
            total_duration += duration
            
            if transcript.is_code_switched:
                code_switching_count += 1
        
        # Calculate percentages and averages
        for lang_code, stats in language_stats.items():
            if total_duration > 0:
                stats['percentage'] = (stats['duration'] / total_duration) * 100
            if stats['segments'] > 0:
                stats['confidence'] = stats['confidence'] / stats['segments']
        
        # Sort by usage
        sorted_languages = sorted(
            language_stats.values(),
            key=lambda x: x['duration'],
            reverse=True
        )
        
        return {
            'languages': sorted_languages,
            'total_languages': len(sorted_languages),
            'code_switching_events': code_switching_count,
            'multilingual': len(sorted_languages) > 1,
            'primary_language': sorted_languages[0]['code'] if sorted_languages else None,
            'total_duration': total_duration
        }
    
    async def validate_language_detection(
        self,
        transcript_id: str,
        correct_language: LanguageCode,
        user_id: str,
        correction_reason: Optional[str] = None
    ) -> bool:
        """
        Validate/correct language detection for continuous improvement
        
        Args:
            transcript_id: Transcript ID to validate
            correct_language: Correct language
            user_id: User making the correction
            correction_reason: Reason for correction
        
        Returns:
            True if validation successful
        """
        # Update detection log
        detection_log = self.db.query(LanguageDetectionLog).filter(
            LanguageDetectionLog.transcript_id == transcript_id
        ).first()
        
        if detection_log:
            detection_log.human_verified = True
            detection_log.correct_language = correct_language
            detection_log.correction_reason = correction_reason
            
            # Update transcript if needed
            transcript = self.db.query(MultiLanguageTranscript).filter(
                MultiLanguageTranscript.id == transcript_id
            ).first()
            
            if transcript and transcript.detected_language != correct_language:
                transcript.detected_language = correct_language
                # Optionally trigger re-processing or translation updates
            
            self.db.commit()
            return True
        
        return False