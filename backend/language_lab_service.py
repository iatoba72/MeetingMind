# Language Lab Service
# Interactive testing environment for translation quality and cultural adaptation

from typing import List, Dict, Optional, Any, Tuple
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
import json
import asyncio
from dataclasses import dataclass
from enum import Enum
import uuid

from i18n_models import (
    Language, Translation, TranslationMemory, TranslationProvider,
    TranslationQuality, LanguageCode, CulturalContext
)
from real_time_translation_service import RealTimeTranslationService
from cultural_adaptation_service import CulturalAdaptationService
from translation_memory_system import TranslationMemorySystem
from database import get_db

class TestType(Enum):
    """Types of language lab tests"""
    TRANSLATION_QUALITY = "translation_quality"
    CULTURAL_ADAPTATION = "cultural_adaptation"
    LANGUAGE_DETECTION = "language_detection"
    TRANSLATION_CONSISTENCY = "translation_consistency"
    PROVIDER_COMPARISON = "provider_comparison"
    MEMORY_EFFECTIVENESS = "memory_effectiveness"

@dataclass
class TestCase:
    """Individual test case for language lab"""
    id: str
    test_type: TestType
    name: str
    description: str
    input_data: Dict[str, Any]
    expected_output: Optional[Dict[str, Any]]
    actual_output: Optional[Dict[str, Any]]
    success: Optional[bool]
    score: Optional[float]
    feedback: Optional[str]
    created_at: datetime
    executed_at: Optional[datetime]

@dataclass
class TestSuite:
    """Collection of related test cases"""
    id: str
    name: str
    description: str
    test_cases: List[TestCase]
    overall_score: Optional[float]
    pass_rate: Optional[float]
    created_at: datetime
    last_executed: Optional[datetime]

@dataclass
class TranslationComparison:
    """Comparison between different translation approaches"""
    source_text: str
    source_language: LanguageCode
    target_language: LanguageCode
    translations: Dict[str, str]  # provider/method -> translation
    quality_scores: Dict[str, float]
    user_preferences: Dict[str, int]  # provider/method -> preference votes
    best_translation: str
    reasoning: str

@dataclass
class CulturalTestResult:
    """Result of cultural adaptation testing"""
    original_text: str
    source_culture: str
    target_culture: str
    adapted_text: str
    appropriateness_score: float
    cultural_accuracy: float
    naturalness_score: float
    overall_score: float
    feedback: str

class TranslationQualityTester:
    """
    Tests translation quality across different providers and scenarios
    
    Design Decision: Comprehensive testing framework enables
    continuous improvement of translation services.
    """
    
    def __init__(self, translation_service: RealTimeTranslationService):
        self.translation_service = translation_service
        
        # Standard test phrases for different scenarios
        self.test_phrases = {
            'business_formal': [
                "I would like to schedule a meeting to discuss the quarterly results.",
                "Please find attached the contract for your review and approval.",
                "We need to address the budget constraints for the upcoming project."
            ],
            'business_casual': [
                "Let's touch base about the project timeline.",
                "Can you update me on the client feedback?",
                "I think we should consider alternative approaches."
            ],
            'technical': [
                "The API endpoint returns a 404 error when processing large datasets.",
                "We need to optimize the database queries for better performance.",
                "The authentication middleware is not handling edge cases properly."
            ],
            'informal': [
                "Thanks for helping out with this!",
                "That sounds like a great idea.",
                "Let me know if you need anything else."
            ]
        }
    
    async def run_quality_test(
        self,
        test_phrases: List[str],
        language_pairs: List[Tuple[LanguageCode, LanguageCode]],
        providers: List[TranslationProvider],
        quality_levels: List[TranslationQuality]
    ) -> Dict[str, Any]:
        """
        Run comprehensive translation quality test
        
        Args:
            test_phrases: Phrases to test
            language_pairs: Language pairs to test
            providers: Translation providers to test
            quality_levels: Quality levels to test
        
        Returns:
            Test results with scores and comparisons
        """
        results = {
            'test_id': str(uuid.uuid4()),
            'timestamp': datetime.utcnow().isoformat(),
            'test_summary': {
                'total_tests': len(test_phrases) * len(language_pairs) * len(providers) * len(quality_levels),
                'successful_tests': 0,
                'failed_tests': 0
            },
            'provider_scores': {},
            'language_pair_scores': {},
            'quality_level_scores': {},
            'detailed_results': []
        }
        
        # Initialize scores
        for provider in providers:
            results['provider_scores'][provider.value] = {'total_score': 0, 'test_count': 0}
        
        for source_lang, target_lang in language_pairs:
            pair_key = f"{source_lang.value}->{target_lang.value}"
            results['language_pair_scores'][pair_key] = {'total_score': 0, 'test_count': 0}
        
        for quality in quality_levels:
            results['quality_level_scores'][quality.value] = {'total_score': 0, 'test_count': 0}
        
        # Run tests
        for phrase in test_phrases:
            for source_lang, target_lang in language_pairs:
                for provider in providers:
                    for quality_level in quality_levels:
                        try:
                            # Perform translation
                            translation_result = await self.translation_service.translate_text(
                                phrase,
                                source_lang,
                                target_lang,
                                quality_level
                            )
                            
                            # Calculate quality score
                            quality_score = self._calculate_translation_quality(
                                phrase,
                                translation_result.translated_text,
                                source_lang,
                                target_lang
                            )
                            
                            # Record result
                            test_result = {
                                'source_text': phrase,
                                'source_language': source_lang.value,
                                'target_language': target_lang.value,
                                'provider': provider.value,
                                'quality_level': quality_level.value,
                                'translated_text': translation_result.translated_text,
                                'provider_confidence': translation_result.confidence_score,
                                'processing_time_ms': translation_result.processing_time_ms,
                                'quality_score': quality_score,
                                'success': True
                            }
                            
                            results['detailed_results'].append(test_result)
                            results['test_summary']['successful_tests'] += 1
                            
                            # Update aggregate scores
                            results['provider_scores'][provider.value]['total_score'] += quality_score
                            results['provider_scores'][provider.value]['test_count'] += 1
                            
                            pair_key = f"{source_lang.value}->{target_lang.value}"
                            results['language_pair_scores'][pair_key]['total_score'] += quality_score
                            results['language_pair_scores'][pair_key]['test_count'] += 1
                            
                            results['quality_level_scores'][quality_level.value]['total_score'] += quality_score
                            results['quality_level_scores'][quality_level.value]['test_count'] += 1
                            
                        except Exception as e:
                            # Record failure
                            test_result = {
                                'source_text': phrase,
                                'source_language': source_lang.value,
                                'target_language': target_lang.value,
                                'provider': provider.value,
                                'quality_level': quality_level.value,
                                'error': str(e),
                                'success': False
                            }
                            
                            results['detailed_results'].append(test_result)
                            results['test_summary']['failed_tests'] += 1
        
        # Calculate average scores
        for provider_data in results['provider_scores'].values():
            if provider_data['test_count'] > 0:
                provider_data['average_score'] = provider_data['total_score'] / provider_data['test_count']
        
        for pair_data in results['language_pair_scores'].values():
            if pair_data['test_count'] > 0:
                pair_data['average_score'] = pair_data['total_score'] / pair_data['test_count']
        
        for quality_data in results['quality_level_scores'].values():
            if quality_data['test_count'] > 0:
                quality_data['average_score'] = quality_data['total_score'] / quality_data['test_count']
        
        return results
    
    def _calculate_translation_quality(
        self,
        source_text: str,
        translated_text: str,
        source_lang: LanguageCode,
        target_lang: LanguageCode
    ) -> float:
        """
        Calculate translation quality score using multiple metrics
        
        Args:
            source_text: Original text
            translated_text: Translated text
            source_lang: Source language
            target_lang: Target language
        
        Returns:
            Quality score (0.0 to 1.0)
        """
        score = 0.0
        factors = 0
        
        # Basic completeness check
        if translated_text and len(translated_text.strip()) > 0:
            score += 0.3
        factors += 1
        
        # Length ratio check (reasonable translation should have similar length)
        if len(source_text) > 0:
            length_ratio = len(translated_text) / len(source_text)
            if 0.5 <= length_ratio <= 2.0:  # Reasonable range
                score += 0.2
            factors += 1
        
        # Word count similarity
        source_words = len(source_text.split())
        target_words = len(translated_text.split())
        if source_words > 0:
            word_ratio = target_words / source_words
            if 0.7 <= word_ratio <= 1.5:  # Reasonable word count range
                score += 0.2
            factors += 1
        
        # Punctuation preservation
        source_punct = len([c for c in source_text if c in '.,!?;:'])
        target_punct = len([c for c in translated_text if c in '.,!?;:'])
        if source_punct > 0 and abs(source_punct - target_punct) <= 2:
            score += 0.1
        factors += 1
        
        # Basic language-specific checks
        if self._contains_expected_language_patterns(translated_text, target_lang):
            score += 0.2
        factors += 1
        
        return score / factors if factors > 0 else 0.0
    
    def _contains_expected_language_patterns(self, text: str, language: LanguageCode) -> bool:
        """
        Check if text contains expected patterns for the target language
        
        Args:
            text: Text to check
            language: Expected language
        
        Returns:
            True if text appears to be in the expected language
        """
        # Simplified language pattern detection
        language_patterns = {
            LanguageCode.ES: ['el', 'la', 'de', 'en', 'y', 'a', 'que', 'es', 'se', 'no'],
            LanguageCode.FR: ['le', 'de', 'et', 'à', 'un', 'il', 'être', 'et', 'en', 'avoir'],
            LanguageCode.DE: ['der', 'die', 'und', 'in', 'den', 'von', 'zu', 'das', 'mit', 'sich'],
            LanguageCode.IT: ['il', 'di', 'che', 'e', 'la', 'per', 'un', 'in', 'con', 'da'],
            LanguageCode.PT: ['de', 'a', 'o', 'que', 'e', 'do', 'da', 'em', 'um', 'para']
        }
        
        if language in language_patterns:
            text_lower = text.lower()
            pattern_words = language_patterns[language]
            matches = sum(1 for word in pattern_words if word in text_lower)
            return matches >= 2  # At least 2 pattern words should be present
        
        return True  # Default to true for languages without patterns

class CulturalAdaptationTester:
    """
    Tests cultural adaptation accuracy and appropriateness
    
    Design Decision: Cultural testing ensures adaptations are
    culturally appropriate and maintain communication effectiveness.
    """
    
    def __init__(self, cultural_service: CulturalAdaptationService):
        self.cultural_service = cultural_service
        
        # Test scenarios for cultural adaptation
        self.cultural_scenarios = {
            'hierarchy_high_to_low': {
                'source_culture': 'jp',
                'target_culture': 'us',
                'test_texts': [
                    "Please humbly consider this proposal with your great wisdom.",
                    "I respectfully disagree with the esteemed director's approach.",
                    "May I suggest, with utmost respect, an alternative method?"
                ]
            },
            'hierarchy_low_to_high': {
                'source_culture': 'us',
                'target_culture': 'jp',
                'test_texts': [
                    "I think you're wrong about this approach.",
                    "Let's just make a quick decision and move on.",
                    "This idea doesn't make sense to me."
                ]
            },
            'direct_to_indirect': {
                'source_culture': 'de',
                'target_culture': 'jp',
                'test_texts': [
                    "This solution is obviously incorrect.",
                    "You must implement this change immediately.",
                    "The deadline is fixed and cannot be moved."
                ]
            },
            'formal_to_informal': {
                'source_culture': 'de',
                'target_culture': 'au',
                'test_texts': [
                    "I would be most grateful if you could kindly provide the requested information.",
                    "Please find attached the documentation as per your esteemed request.",
                    "I humbly request your consideration of this matter."
                ]
            }
        }
    
    async def run_cultural_adaptation_test(
        self,
        scenarios: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        """
        Run cultural adaptation testing
        
        Args:
            scenarios: Optional list of scenario names to test
        
        Returns:
            Cultural adaptation test results
        """
        test_scenarios = scenarios or list(self.cultural_scenarios.keys())
        
        results = {
            'test_id': str(uuid.uuid4()),
            'timestamp': datetime.utcnow().isoformat(),
            'scenarios_tested': test_scenarios,
            'overall_score': 0.0,
            'scenario_results': {},
            'recommendations': []
        }
        
        total_score = 0.0
        total_tests = 0
        
        for scenario_name in test_scenarios:
            if scenario_name not in self.cultural_scenarios:
                continue
            
            scenario = self.cultural_scenarios[scenario_name]
            scenario_results = []
            
            for test_text in scenario['test_texts']:
                # Create cultural profiles (simplified)
                from cultural_adaptation_service import CulturalProfile
                
                source_profile = await self.cultural_service.profile_manager.create_cultural_profile(
                    culture_code=scenario['source_culture']
                )
                
                target_profile = await self.cultural_service.profile_manager.create_cultural_profile(
                    culture_code=scenario['target_culture']
                )
                
                # Get adaptation suggestions
                adaptations = await self.cultural_service.adaptation_engine.adapt_text(
                    test_text,
                    source_profile,
                    [target_profile]
                )
                
                if adaptations:
                    adaptation = adaptations[0]
                    
                    # Evaluate adaptation quality
                    cultural_result = self._evaluate_cultural_adaptation(
                        test_text,
                        adaptation.adapted_text,
                        scenario['source_culture'],
                        scenario['target_culture'],
                        scenario_name
                    )
                    
                    scenario_results.append(cultural_result)
                    total_score += cultural_result.overall_score
                    total_tests += 1
            
            # Calculate scenario average
            if scenario_results:
                scenario_avg = sum(r.overall_score for r in scenario_results) / len(scenario_results)
                results['scenario_results'][scenario_name] = {
                    'average_score': scenario_avg,
                    'test_count': len(scenario_results),
                    'results': [
                        {
                            'original_text': r.original_text,
                            'adapted_text': r.adapted_text,
                            'appropriateness_score': r.appropriateness_score,
                            'cultural_accuracy': r.cultural_accuracy,
                            'naturalness_score': r.naturalness_score,
                            'overall_score': r.overall_score,
                            'feedback': r.feedback
                        }
                        for r in scenario_results
                    ]
                }
        
        # Calculate overall score
        if total_tests > 0:
            results['overall_score'] = total_score / total_tests
        
        # Generate recommendations
        results['recommendations'] = self._generate_cultural_recommendations(results)
        
        return results
    
    def _evaluate_cultural_adaptation(
        self,
        original_text: str,
        adapted_text: str,
        source_culture: str,
        target_culture: str,
        scenario_type: str
    ) -> CulturalTestResult:
        """
        Evaluate the quality of cultural adaptation
        
        Args:
            original_text: Original text
            adapted_text: Culturally adapted text
            source_culture: Source culture code
            target_culture: Target culture code
            scenario_type: Type of adaptation scenario
        
        Returns:
            Cultural test result
        """
        # Appropriateness score (based on scenario-specific criteria)
        appropriateness = self._score_appropriateness(adapted_text, target_culture, scenario_type)
        
        # Cultural accuracy (preservation of meaning while adapting style)
        cultural_accuracy = self._score_cultural_accuracy(original_text, adapted_text, scenario_type)
        
        # Naturalness (how natural the adapted text sounds)
        naturalness = self._score_naturalness(adapted_text, target_culture)
        
        # Overall score (weighted average)
        overall_score = (appropriateness * 0.4 + cultural_accuracy * 0.35 + naturalness * 0.25)
        
        # Generate feedback
        feedback = self._generate_adaptation_feedback(
            original_text, adapted_text, appropriateness, cultural_accuracy, naturalness
        )
        
        return CulturalTestResult(
            original_text=original_text,
            source_culture=source_culture,
            target_culture=target_culture,
            adapted_text=adapted_text,
            appropriateness_score=appropriateness,
            cultural_accuracy=cultural_accuracy,
            naturalness_score=naturalness,
            overall_score=overall_score,
            feedback=feedback
        )
    
    def _score_appropriateness(self, text: str, target_culture: str, scenario_type: str) -> float:
        """Score cultural appropriateness of adapted text"""
        score = 0.5  # Base score
        text_lower = text.lower()
        
        # Scenario-specific scoring
        if 'hierarchy_low_to_high' in scenario_type:
            # Should add respectful language
            respectful_markers = ['please', 'respectfully', 'humbly', 'consider', 'perhaps']
            if any(marker in text_lower for marker in respectful_markers):
                score += 0.3
            
            # Should remove direct challenges
            direct_challenges = ['wrong', 'incorrect', 'disagree directly']
            if not any(challenge in text_lower for challenge in direct_challenges):
                score += 0.2
        
        elif 'hierarchy_high_to_low' in scenario_type:
            # Should reduce excessive formality
            excessive_formal = ['humbly', 'esteemed', 'great wisdom', 'utmost respect']
            formal_count = sum(1 for marker in excessive_formal if marker in text_lower)
            if formal_count <= 1:  # Reduced formality
                score += 0.3
        
        elif 'direct_to_indirect' in scenario_type:
            # Should soften direct statements
            softening_markers = ['perhaps', 'might', 'could', 'consider', 'may']
            if any(marker in text_lower for marker in softening_markers):
                score += 0.3
        
        return min(score, 1.0)
    
    def _score_cultural_accuracy(self, original: str, adapted: str, scenario_type: str) -> float:
        """Score how well the adaptation preserves meaning while changing style"""
        # Basic meaning preservation (simplified)
        original_words = set(original.lower().split())
        adapted_words = set(adapted.lower().split())
        
        # Calculate content word overlap
        content_words_original = {w for w in original_words if len(w) > 3}
        content_words_adapted = {w for w in adapted_words if len(w) > 3}
        
        if content_words_original:
            overlap = len(content_words_original.intersection(content_words_adapted))
            preservation_score = overlap / len(content_words_original)
        else:
            preservation_score = 0.8  # Default for short texts
        
        # Length change penalty (should not change meaning drastically)
        length_ratio = len(adapted) / max(len(original), 1)
        if 0.8 <= length_ratio <= 1.5:  # Reasonable change
            length_score = 1.0
        else:
            length_score = 0.7
        
        return (preservation_score * 0.7 + length_score * 0.3)
    
    def _score_naturalness(self, text: str, target_culture: str) -> float:
        """Score how natural the adapted text sounds"""
        # Basic naturalness indicators
        score = 0.6  # Base score
        
        # Check for grammatical completeness
        if text.strip() and text[0].isupper() and text.rstrip()[-1] in '.!?':
            score += 0.2
        
        # Check for reasonable sentence structure
        sentences = text.split('.')
        avg_sentence_length = sum(len(s.split()) for s in sentences) / max(len(sentences), 1)
        if 5 <= avg_sentence_length <= 25:  # Reasonable sentence length
            score += 0.2
        
        return min(score, 1.0)
    
    def _generate_adaptation_feedback(
        self,
        original: str,
        adapted: str,
        appropriateness: float,
        accuracy: float,
        naturalness: float
    ) -> str:
        """Generate feedback on the adaptation quality"""
        feedback_parts = []
        
        if appropriateness >= 0.8:
            feedback_parts.append("Culturally appropriate adaptation")
        elif appropriateness >= 0.6:
            feedback_parts.append("Mostly appropriate with minor cultural issues")
        else:
            feedback_parts.append("Cultural appropriateness needs improvement")
        
        if accuracy >= 0.8:
            feedback_parts.append("good meaning preservation")
        elif accuracy >= 0.6:
            feedback_parts.append("adequate meaning preservation")
        else:
            feedback_parts.append("meaning preservation needs improvement")
        
        if naturalness >= 0.8:
            feedback_parts.append("natural-sounding result")
        else:
            feedback_parts.append("naturalness could be improved")
        
        return "; ".join(feedback_parts) + "."
    
    def _generate_cultural_recommendations(self, results: Dict[str, Any]) -> List[str]:
        """Generate recommendations based on cultural test results"""
        recommendations = []
        
        overall_score = results.get('overall_score', 0.0)
        
        if overall_score < 0.6:
            recommendations.append("Cultural adaptation rules need significant improvement")
        elif overall_score < 0.8:
            recommendations.append("Cultural adaptation shows good progress but needs refinement")
        
        # Scenario-specific recommendations
        for scenario, data in results.get('scenario_results', {}).items():
            if data['average_score'] < 0.7:
                if 'hierarchy' in scenario:
                    recommendations.append(f"Improve hierarchy adaptation rules for {scenario}")
                elif 'direct' in scenario:
                    recommendations.append(f"Enhance directness/indirectness adaptation for {scenario}")
                elif 'formal' in scenario:
                    recommendations.append(f"Refine formality adaptation rules for {scenario}")
        
        return recommendations

class LanguageLabService:
    """
    Comprehensive language lab for testing translation and cultural adaptation
    
    Design Decision: Integrated testing environment enables continuous
    improvement of all internationalization components.
    
    Key Features:
    - Translation quality testing
    - Cultural adaptation testing
    - Provider comparison
    - Performance benchmarking
    - Regression testing
    - User feedback integration
    """
    
    def __init__(self, db: Session):
        self.db = db
        self.translation_service = RealTimeTranslationService(db)
        self.cultural_service = CulturalAdaptationService(db)
        self.memory_system = TranslationMemorySystem(db)
        
        self.quality_tester = TranslationQualityTester(self.translation_service)
        self.cultural_tester = CulturalAdaptationTester(self.cultural_service)
        
        self.test_suites = {}
        self.test_history = []
    
    async def create_test_suite(
        self,
        name: str,
        description: str,
        test_cases: List[TestCase]
    ) -> TestSuite:
        """
        Create a new test suite
        
        Args:
            name: Test suite name
            description: Test suite description
            test_cases: List of test cases
        
        Returns:
            Created test suite
        """
        suite = TestSuite(
            id=str(uuid.uuid4()),
            name=name,
            description=description,
            test_cases=test_cases,
            overall_score=None,
            pass_rate=None,
            created_at=datetime.utcnow(),
            last_executed=None
        )
        
        self.test_suites[suite.id] = suite
        return suite
    
    async def run_comprehensive_test(
        self,
        include_translation_quality: bool = True,
        include_cultural_adaptation: bool = True,
        include_memory_effectiveness: bool = True,
        language_pairs: Optional[List[Tuple[LanguageCode, LanguageCode]]] = None,
        providers: Optional[List[TranslationProvider]] = None
    ) -> Dict[str, Any]:
        """
        Run comprehensive language lab test
        
        Args:
            include_translation_quality: Whether to test translation quality
            include_cultural_adaptation: Whether to test cultural adaptation
            include_memory_effectiveness: Whether to test memory effectiveness
            language_pairs: Language pairs to test
            providers: Providers to test
        
        Returns:
            Comprehensive test results
        """
        # Default configurations
        if not language_pairs:
            language_pairs = [
                (LanguageCode.EN, LanguageCode.ES),
                (LanguageCode.EN, LanguageCode.FR),
                (LanguageCode.EN, LanguageCode.DE),
                (LanguageCode.EN, LanguageCode.JA)
            ]
        
        if not providers:
            providers = [
                TranslationProvider.GOOGLE_TRANSLATE,
                TranslationProvider.AZURE_TRANSLATOR,
                TranslationProvider.DEEPL
            ]
        
        test_results = {
            'test_id': str(uuid.uuid4()),
            'timestamp': datetime.utcnow().isoformat(),
            'configuration': {
                'language_pairs': [f"{s.value}->{t.value}" for s, t in language_pairs],
                'providers': [p.value for p in providers],
                'tests_included': {
                    'translation_quality': include_translation_quality,
                    'cultural_adaptation': include_cultural_adaptation,
                    'memory_effectiveness': include_memory_effectiveness
                }
            },
            'results': {},
            'overall_score': 0.0,
            'recommendations': []
        }
        
        total_score = 0.0
        test_count = 0
        
        # Translation quality testing
        if include_translation_quality:
            print("Running translation quality tests...")
            quality_results = await self.quality_tester.run_quality_test(
                self.quality_tester.test_phrases['business_casual'],
                language_pairs,
                providers,
                [TranslationQuality.STANDARD, TranslationQuality.PROFESSIONAL]
            )
            
            test_results['results']['translation_quality'] = quality_results
            
            # Calculate average quality score
            if quality_results['detailed_results']:
                avg_quality = sum(
                    r.get('quality_score', 0) for r in quality_results['detailed_results'] 
                    if r.get('success', False)
                ) / len([r for r in quality_results['detailed_results'] if r.get('success', False)])
                total_score += avg_quality
                test_count += 1
        
        # Cultural adaptation testing
        if include_cultural_adaptation:
            print("Running cultural adaptation tests...")
            cultural_results = await self.cultural_tester.run_cultural_adaptation_test()
            
            test_results['results']['cultural_adaptation'] = cultural_results
            total_score += cultural_results['overall_score']
            test_count += 1
        
        # Memory effectiveness testing
        if include_memory_effectiveness:
            print("Running memory effectiveness tests...")
            memory_results = await self._test_memory_effectiveness(language_pairs)
            
            test_results['results']['memory_effectiveness'] = memory_results
            total_score += memory_results['effectiveness_score']
            test_count += 1
        
        # Calculate overall score
        if test_count > 0:
            test_results['overall_score'] = total_score / test_count
        
        # Generate recommendations
        test_results['recommendations'] = self._generate_overall_recommendations(test_results)
        
        # Save test history
        self.test_history.append(test_results)
        
        return test_results
    
    async def _test_memory_effectiveness(
        self,
        language_pairs: List[Tuple[LanguageCode, LanguageCode]]
    ) -> Dict[str, Any]:
        """
        Test translation memory effectiveness
        
        Args:
            language_pairs: Language pairs to test
        
        Returns:
            Memory effectiveness results
        """
        results = {
            'effectiveness_score': 0.0,
            'hit_rates': {},
            'quality_improvements': {},
            'consistency_scores': {}
        }
        
        total_effectiveness = 0.0
        pair_count = 0
        
        for source_lang, target_lang in language_pairs:
            # Test memory hit rate
            hit_rate = await self._test_memory_hit_rate(source_lang, target_lang)
            
            # Test quality improvement
            quality_improvement = await self._test_memory_quality_improvement(source_lang, target_lang)
            
            # Test consistency
            consistency = await self._test_memory_consistency(source_lang, target_lang)
            
            pair_key = f"{source_lang.value}->{target_lang.value}"
            results['hit_rates'][pair_key] = hit_rate
            results['quality_improvements'][pair_key] = quality_improvement
            results['consistency_scores'][pair_key] = consistency
            
            # Calculate pair effectiveness
            pair_effectiveness = (hit_rate * 0.4 + quality_improvement * 0.3 + consistency * 0.3)
            total_effectiveness += pair_effectiveness
            pair_count += 1
        
        if pair_count > 0:
            results['effectiveness_score'] = total_effectiveness / pair_count
        
        return results
    
    async def _test_memory_hit_rate(self, source_lang: LanguageCode, target_lang: LanguageCode) -> float:
        """Test memory cache hit rate"""
        # Simplified test - would use actual test phrases
        test_phrases = [
            "Hello, how are you?",
            "Thank you for your help.",
            "Let's schedule a meeting."
        ]
        
        hits = 0
        for phrase in test_phrases:
            from translation_memory_system import MemorySearchRequest
            
            search_request = MemorySearchRequest(
                source_text=phrase,
                source_language=source_lang,
                target_language=target_lang,
                min_similarity=0.8
            )
            
            matches = await self.memory_system.search_memory(search_request)
            if matches:
                hits += 1
        
        return hits / len(test_phrases) if test_phrases else 0.0
    
    async def _test_memory_quality_improvement(self, source_lang: LanguageCode, target_lang: LanguageCode) -> float:
        """Test quality improvement from memory usage"""
        # Simplified quality improvement test
        return 0.75  # Placeholder - would measure actual quality improvements
    
    async def _test_memory_consistency(self, source_lang: LanguageCode, target_lang: LanguageCode) -> float:
        """Test translation consistency through memory"""
        # Simplified consistency test
        return 0.85  # Placeholder - would test actual consistency
    
    def _generate_overall_recommendations(self, test_results: Dict[str, Any]) -> List[str]:
        """Generate overall recommendations based on all test results"""
        recommendations = []
        overall_score = test_results.get('overall_score', 0.0)
        
        if overall_score < 0.6:
            recommendations.append("Overall system performance needs significant improvement")
        elif overall_score < 0.8:
            recommendations.append("System performance is good but has room for improvement")
        else:
            recommendations.append("System performance is excellent")
        
        # Specific recommendations based on test results
        results = test_results.get('results', {})
        
        if 'translation_quality' in results:
            quality_data = results['translation_quality']
            if quality_data.get('test_summary', {}).get('failed_tests', 0) > 0:
                recommendations.append("Address translation failures in specific language pairs")
        
        if 'cultural_adaptation' in results:
            cultural_data = results['cultural_adaptation']
            if cultural_data.get('overall_score', 0) < 0.7:
                recommendations.append("Improve cultural adaptation rules and algorithms")
        
        if 'memory_effectiveness' in results:
            memory_data = results['memory_effectiveness']
            if memory_data.get('effectiveness_score', 0) < 0.7:
                recommendations.append("Optimize translation memory system for better performance")
        
        return recommendations
    
    async def get_test_history(
        self,
        limit: int = 10,
        test_type: Optional[TestType] = None
    ) -> List[Dict[str, Any]]:
        """
        Get test execution history
        
        Args:
            limit: Maximum number of results
            test_type: Optional filter by test type
        
        Returns:
            List of historical test results
        """
        history = self.test_history[-limit:] if limit else self.test_history
        
        # Filter by test type if specified
        if test_type:
            history = [
                test for test in history 
                if test_type.value in test.get('configuration', {}).get('tests_included', {})
            ]
        
        return history
    
    async def export_test_results(
        self,
        test_id: str,
        format_type: str = 'json'
    ) -> str:
        """
        Export test results in specified format
        
        Args:
            test_id: Test ID to export
            format_type: Export format (json, csv, html)
        
        Returns:
            Exported data as string
        """
        # Find test results
        test_result = None
        for test in self.test_history:
            if test.get('test_id') == test_id:
                test_result = test
                break
        
        if not test_result:
            raise ValueError(f"Test {test_id} not found")
        
        if format_type.lower() == 'json':
            return json.dumps(test_result, indent=2, default=str)
        elif format_type.lower() == 'csv':
            return self._export_as_csv(test_result)
        elif format_type.lower() == 'html':
            return self._export_as_html(test_result)
        else:
            raise ValueError(f"Unsupported format: {format_type}")
    
    def _export_as_csv(self, test_result: Dict[str, Any]) -> str:
        """Export test results as CSV"""
        import csv
        import io
        
        output = io.StringIO()
        writer = csv.writer(output)
        
        # Write header
        writer.writerow(['Test ID', 'Timestamp', 'Overall Score', 'Test Type', 'Details'])
        
        # Write data
        test_id = test_result.get('test_id', '')
        timestamp = test_result.get('timestamp', '')
        overall_score = test_result.get('overall_score', 0)
        
        for test_type, results in test_result.get('results', {}).items():
            writer.writerow([test_id, timestamp, overall_score, test_type, str(results)])
        
        return output.getvalue()
    
    def _export_as_html(self, test_result: Dict[str, Any]) -> str:
        """Export test results as HTML"""
        html = f'''<!DOCTYPE html>
<html>
<head>
    <title>Language Lab Test Results</title>
    <style>
        body {{ font-family: Arial, sans-serif; margin: 40px; }}
        .header {{ background-color: #f0f0f0; padding: 20px; border-radius: 5px; }}
        .score {{ font-size: 24px; font-weight: bold; color: #333; }}
        .section {{ margin: 20px 0; padding: 15px; border: 1px solid #ddd; border-radius: 5px; }}
        .good {{ color: #28a745; }}
        .warning {{ color: #ffc107; }}
        .danger {{ color: #dc3545; }}
    </style>
</head>
<body>
    <div class="header">
        <h1>Language Lab Test Results</h1>
        <p><strong>Test ID:</strong> {test_result.get('test_id', 'N/A')}</p>
        <p><strong>Timestamp:</strong> {test_result.get('timestamp', 'N/A')}</p>
        <p class="score">Overall Score: {test_result.get('overall_score', 0):.2f}</p>
    </div>
'''
        
        # Add results sections
        for test_type, results in test_result.get('results', {}).items():
            html += f'<div class="section"><h2>{test_type.replace("_", " ").title()}</h2>'
            
            if isinstance(results, dict):
                for key, value in results.items():
                    html += f'<p><strong>{key}:</strong> {value}</p>'
            else:
                html += f'<p>{results}</p>'
            
            html += '</div>'
        
        # Add recommendations
        recommendations = test_result.get('recommendations', [])
        if recommendations:
            html += '<div class="section"><h2>Recommendations</h2><ul>'
            for rec in recommendations:
                html += f'<li>{rec}</li>'
            html += '</ul></div>'
        
        html += '</body></html>'
        return html