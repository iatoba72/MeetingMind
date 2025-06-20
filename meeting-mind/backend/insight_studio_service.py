# Insight Studio Service
# Backend service for managing custom insight rules and templates

import asyncio
import json
import re
import time
import uuid
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any, Tuple
from dataclasses import dataclass, asdict
from enum import Enum
import logging
from collections import defaultdict
import hashlib

from insight_trigger_engine import TriggerType, TriggerPriority, TriggerPattern, DetectedTrigger
from insight_generation_service import InsightType, InsightTemplate

class RuleCategory(Enum):
    """Categories for organizing custom rules"""
    BUSINESS = "business"
    TECHNICAL = "technical"
    PROJECT = "project"
    FINANCE = "finance"
    LEGAL = "legal"
    OPERATIONS = "operations"
    TEAM = "team"
    CUSTOM = "custom"

class RuleStatus(Enum):
    """Status of custom rules"""
    ACTIVE = "active"
    INACTIVE = "inactive"
    TESTING = "testing"
    ARCHIVED = "archived"

@dataclass
class CustomRule:
    """A user-defined custom insight rule"""
    id: str
    name: str
    description: str
    category: RuleCategory
    trigger_type: TriggerType
    priority: TriggerPriority
    status: RuleStatus
    
    # Pattern definition
    keywords: List[str]
    phrases: List[str]
    regex_patterns: List[str]
    context_requirements: List[str]
    speaker_requirements: Dict[str, Any]
    timing_requirements: Dict[str, Any]
    confidence_threshold: float
    
    # Insight generation
    insight_template: str
    insight_type: InsightType
    post_processing_rules: List[str]
    
    # Metadata
    created_by: str
    created_at: datetime
    last_modified: datetime
    last_tested: Optional[datetime]
    tags: List[str]
    version: int
    
    # Performance metrics
    usage_count: int
    success_rate: float
    average_confidence: float
    user_feedback_score: float

@dataclass
class RuleTest:
    """Test case for validating rules"""
    id: str
    rule_id: str
    test_name: str
    test_text: str
    expected_match: bool
    expected_confidence: Optional[float]
    actual_match: Optional[bool]
    actual_confidence: Optional[float]
    passed: Optional[bool]
    test_timestamp: datetime
    notes: str

@dataclass
class RuleTemplate:
    """Template for creating rules quickly"""
    id: str
    name: str
    description: str
    category: RuleCategory
    template_data: Dict[str, Any]
    use_count: int
    rating: float
    created_by: str
    is_public: bool

@dataclass
class StudioAnalytics:
    """Analytics for insight studio usage"""
    total_rules: int
    active_rules: int
    rules_by_category: Dict[str, int]
    top_performing_rules: List[str]
    most_used_rules: List[str]
    average_rule_success_rate: float
    total_insights_generated: int
    user_satisfaction_score: float

class InsightStudioService:
    """
    Service for managing custom insight rules and templates
    
    Features:
    - Custom rule creation and management
    - Rule testing and validation
    - Template library
    - Performance analytics
    - Rule sharing and collaboration
    - Version control for rules
    """
    
    def __init__(self):
        """Initialize the insight studio service"""
        self.custom_rules: Dict[str, CustomRule] = {}
        self.rule_templates: Dict[str, RuleTemplate] = {}
        self.rule_tests: Dict[str, List[RuleTest]] = defaultdict(list)
        self.active_sessions: Dict[str, Dict] = {}
        
        # Performance tracking
        self.rule_usage_stats: Dict[str, Dict] = defaultdict(dict)
        self.analytics_cache: Optional[StudioAnalytics] = None
        self.cache_timestamp: Optional[datetime] = None
        
        # Initialize with default templates
        self._initialize_default_templates()
        
        self.logger = logging.getLogger(__name__)
    
    def _initialize_default_templates(self):
        """Initialize default rule templates"""
        templates = [
            # Business Impact Template
            RuleTemplate(
                id="template_business_impact",
                name="Business Impact Detector",
                description="Template for detecting business impact discussions",
                category=RuleCategory.BUSINESS,
                template_data={
                    "trigger_type": TriggerType.BUSINESS_IMPACT.value,
                    "keywords": ["revenue", "profit", "growth", "market", "customer", "sales", "business", "strategy"],
                    "phrases": ["business impact", "revenue impact", "market opportunity", "customer feedback", "growth strategy"],
                    "regex_patterns": ["\\b(revenue|profit|growth)\\s+(impact|opportunity|risk)\\b"],
                    "insight_template": """Analyze this business discussion:

Context: {context}
Discussion: {trigger_text}
Speaker: {speaker}

Provide:
1. Business impact identified
2. Revenue/cost implications
3. Market opportunities or risks
4. Strategic recommendations
5. Success metrics to track

Focus on actionable business insights.""",
                    "post_processing_rules": ["extract_metrics", "identify_kpis", "assess_business_impact"]
                },
                use_count=0,
                rating=5.0,
                created_by="system",
                is_public=True
            ),
            
            # Technical Issue Template
            RuleTemplate(
                id="template_technical_issue",
                name="Technical Issue Tracker",
                description="Template for tracking technical problems and solutions",
                category=RuleCategory.TECHNICAL,
                template_data={
                    "trigger_type": TriggerType.TECHNICAL_ISSUE.value,
                    "keywords": ["bug", "error", "issue", "problem", "failure", "crash", "performance", "system"],
                    "phrases": ["technical issue", "system problem", "performance issue", "bug report", "error message"],
                    "regex_patterns": ["\\b(bug|error|issue|problem)\\s+(in|with|on)\\b"],
                    "insight_template": """Technical Issue Analysis:

Context: {context}
Issue: {trigger_text}
Reported By: {speaker}

Analyze:
1. Nature and severity of the technical issue
2. Potential root causes
3. Impact on system/users
4. Recommended troubleshooting steps
5. Prevention measures

Provide technical assessment with clear next steps.""",
                    "post_processing_rules": ["categorize_issue_type", "assess_severity", "suggest_solutions"]
                },
                use_count=0,
                rating=4.8,
                created_by="system",
                is_public=True
            ),
            
            # Project Milestone Template
            RuleTemplate(
                id="template_project_milestone",
                name="Project Milestone Tracker",
                description="Template for tracking project milestones and deadlines",
                category=RuleCategory.PROJECT,
                template_data={
                    "trigger_type": TriggerType.DEADLINE_MENTIONED.value,
                    "keywords": ["deadline", "milestone", "deliverable", "timeline", "schedule", "sprint", "release"],
                    "phrases": ["project milestone", "delivery date", "sprint goal", "release schedule", "project timeline"],
                    "regex_patterns": ["\\b(deadline|milestone|due)\\s+(by|on|for)\\s+\\w+"],
                    "insight_template": """Project Milestone Analysis:

Context: {context}
Milestone: {trigger_text}
Discussed By: {speaker}

Track:
1. Milestone or deadline mentioned
2. Dependencies and requirements
3. Resource allocation needs
4. Risk factors and mitigation
5. Success criteria and metrics

Provide project management insights with timeline implications.""",
                    "post_processing_rules": ["extract_dates", "identify_dependencies", "assess_feasibility"]
                },
                use_count=0,
                rating=4.9,
                created_by="system",
                is_public=True
            )
        ]
        
        for template in templates:
            self.rule_templates[template.id] = template
    
    async def create_session(self, user_id: str, session_config: Dict[str, Any] = None) -> str:
        """Create a new insight studio session"""
        session_id = f"studio_session_{uuid.uuid4().hex}"
        
        config = session_config or {}
        
        session_data = {
            'session_id': session_id,
            'user_id': user_id,
            'created_at': datetime.now(),
            'config': {
                'auto_save': config.get('auto_save', True),
                'enable_collaboration': config.get('enable_collaboration', False),
                'rule_testing_enabled': config.get('rule_testing_enabled', True),
                'analytics_enabled': config.get('analytics_enabled', True)
            },
            'active_rules': [],
            'draft_rules': {},
            'test_results': [],
            'session_stats': {
                'rules_created': 0,
                'rules_modified': 0,
                'tests_run': 0,
                'session_duration': 0.0
            }
        }
        
        self.active_sessions[session_id] = session_data
        self.logger.info(f"Created insight studio session {session_id} for user {user_id}")
        
        return session_id
    
    async def create_custom_rule(self, 
                               session_id: str,
                               rule_data: Dict[str, Any]) -> str:
        """Create a new custom rule"""
        
        if session_id not in self.active_sessions:
            raise ValueError(f"Session {session_id} not found")
        
        session = self.active_sessions[session_id]
        
        # Generate rule ID
        rule_id = f"custom_rule_{uuid.uuid4().hex[:8]}"
        
        # Create custom rule
        custom_rule = CustomRule(
            id=rule_id,
            name=rule_data.get('name', 'New Custom Rule'),
            description=rule_data.get('description', ''),
            category=RuleCategory(rule_data.get('category', RuleCategory.CUSTOM.value)),
            trigger_type=TriggerType(rule_data.get('trigger_type', TriggerType.QUESTION_ASKED.value)),
            priority=TriggerPriority(rule_data.get('priority', TriggerPriority.MEDIUM.value)),
            status=RuleStatus.TESTING,  # Start in testing mode
            
            # Pattern configuration
            keywords=rule_data.get('keywords', []),
            phrases=rule_data.get('phrases', []),
            regex_patterns=rule_data.get('regex_patterns', []),
            context_requirements=rule_data.get('context_requirements', []),
            speaker_requirements=rule_data.get('speaker_requirements', {}),
            timing_requirements=rule_data.get('timing_requirements', {}),
            confidence_threshold=rule_data.get('confidence_threshold', 0.6),
            
            # Insight generation
            insight_template=rule_data.get('insight_template', 'Default template for {trigger_type} insights...'),
            insight_type=InsightType(rule_data.get('insight_type', InsightType.SUMMARY.value)),
            post_processing_rules=rule_data.get('post_processing_rules', []),
            
            # Metadata
            created_by=session['user_id'],
            created_at=datetime.now(),
            last_modified=datetime.now(),
            last_tested=None,
            tags=rule_data.get('tags', []),
            version=1,
            
            # Initialize performance metrics
            usage_count=0,
            success_rate=0.0,
            average_confidence=0.0,
            user_feedback_score=0.0
        )
        
        # Store rule
        self.custom_rules[rule_id] = custom_rule
        session['active_rules'].append(rule_id)
        session['session_stats']['rules_created'] += 1
        
        self.logger.info(f"Created custom rule {rule_id}: {custom_rule.name}")
        
        return rule_id
    
    async def update_custom_rule(self, 
                               session_id: str,
                               rule_id: str,
                               updates: Dict[str, Any]) -> bool:
        """Update an existing custom rule"""
        
        if session_id not in self.active_sessions:
            raise ValueError(f"Session {session_id} not found")
        
        if rule_id not in self.custom_rules:
            raise ValueError(f"Rule {rule_id} not found")
        
        session = self.active_sessions[session_id]
        rule = self.custom_rules[rule_id]
        
        # Verify ownership or permissions
        if rule.created_by != session['user_id']:
            raise PermissionError(f"User does not have permission to modify rule {rule_id}")
        
        # Update rule fields
        for field, value in updates.items():
            if hasattr(rule, field):
                if field in ['trigger_type']:
                    setattr(rule, field, TriggerType(value))
                elif field in ['priority']:
                    setattr(rule, field, TriggerPriority(value))
                elif field in ['category']:
                    setattr(rule, field, RuleCategory(value))
                elif field in ['insight_type']:
                    setattr(rule, field, InsightType(value))
                elif field in ['status']:
                    setattr(rule, field, RuleStatus(value))
                else:
                    setattr(rule, field, value)
        
        # Update metadata
        rule.last_modified = datetime.now()
        rule.version += 1
        
        session['session_stats']['rules_modified'] += 1
        
        self.logger.info(f"Updated custom rule {rule_id}")
        
        return True
    
    async def test_rule(self, 
                       session_id: str,
                       rule_id: str,
                       test_data: Dict[str, Any]) -> RuleTest:
        """Test a custom rule against sample text"""
        
        if session_id not in self.active_sessions:
            raise ValueError(f"Session {session_id} not found")
        
        if rule_id not in self.custom_rules:
            raise ValueError(f"Rule {rule_id} not found")
        
        session = self.active_sessions[session_id]
        rule = self.custom_rules[rule_id]
        
        # Create test case
        test_id = f"test_{uuid.uuid4().hex[:8]}"
        test_text = test_data.get('test_text', '')
        expected_match = test_data.get('expected_match', True)
        expected_confidence = test_data.get('expected_confidence')
        
        # Run the test
        test_result = await self._execute_rule_test(rule, test_text)
        
        # Create test record
        rule_test = RuleTest(
            id=test_id,
            rule_id=rule_id,
            test_name=test_data.get('test_name', f"Test {len(self.rule_tests[rule_id]) + 1}"),
            test_text=test_text,
            expected_match=expected_match,
            expected_confidence=expected_confidence,
            actual_match=test_result['match'],
            actual_confidence=test_result['confidence'],
            passed=test_result['match'] == expected_match,
            test_timestamp=datetime.now(),
            notes=test_data.get('notes', '')
        )
        
        # Store test result
        self.rule_tests[rule_id].append(rule_test)
        session['test_results'].append(test_id)
        session['session_stats']['tests_run'] += 1
        
        # Update rule metadata
        rule.last_tested = datetime.now()
        
        self.logger.info(f"Tested rule {rule_id}: {'PASSED' if rule_test.passed else 'FAILED'}")
        
        return rule_test
    
    async def _execute_rule_test(self, rule: CustomRule, text: str) -> Dict[str, Any]:
        """Execute a test on a rule and return results"""
        
        confidence = 0.0
        matched_patterns = []
        
        text_lower = text.lower()
        
        # Keyword matching
        keyword_matches = sum(1 for keyword in rule.keywords if keyword.lower() in text_lower)
        if rule.keywords:
            keyword_confidence = keyword_matches / len(rule.keywords)
            confidence += keyword_confidence * 0.3
            if keyword_matches > 0:
                matched_patterns.append(f"keywords: {keyword_matches}/{len(rule.keywords)}")
        
        # Phrase matching
        phrase_matches = sum(1 for phrase in rule.phrases if phrase.lower() in text_lower)
        if rule.phrases:
            phrase_confidence = phrase_matches / len(rule.phrases)
            confidence += phrase_confidence * 0.4
            if phrase_matches > 0:
                matched_patterns.append(f"phrases: {phrase_matches}/{len(rule.phrases)}")
        
        # Regex matching
        regex_matches = 0
        for pattern in rule.regex_patterns:
            try:
                if re.search(pattern, text, re.IGNORECASE):
                    regex_matches += 1
            except re.error:
                self.logger.warning(f"Invalid regex pattern: {pattern}")
        
        if rule.regex_patterns:
            regex_confidence = regex_matches / len(rule.regex_patterns)
            confidence += regex_confidence * 0.3
            if regex_matches > 0:
                matched_patterns.append(f"regex: {regex_matches}/{len(rule.regex_patterns)}")
        
        # Determine if rule matches
        matches = confidence >= rule.confidence_threshold
        
        return {
            'match': matches,
            'confidence': min(1.0, confidence),
            'matched_patterns': matched_patterns,
            'details': {
                'keyword_matches': keyword_matches,
                'phrase_matches': phrase_matches,
                'regex_matches': regex_matches,
                'threshold': rule.confidence_threshold
            }
        }
    
    async def get_rule_templates(self, category: Optional[RuleCategory] = None) -> List[RuleTemplate]:
        """Get available rule templates"""
        templates = list(self.rule_templates.values())
        
        if category:
            templates = [t for t in templates if t.category == category]
        
        # Sort by rating and usage
        templates.sort(key=lambda t: (t.rating, t.use_count), reverse=True)
        
        return templates
    
    async def create_rule_from_template(self, 
                                      session_id: str,
                                      template_id: str,
                                      customizations: Dict[str, Any] = None) -> str:
        """Create a new rule based on a template"""
        
        if template_id not in self.rule_templates:
            raise ValueError(f"Template {template_id} not found")
        
        template = self.rule_templates[template_id]
        customizations = customizations or {}
        
        # Merge template data with customizations
        rule_data = template.template_data.copy()
        rule_data.update(customizations)
        
        # Set template-specific defaults
        rule_data['name'] = customizations.get('name', f"{template.name} Rule")
        rule_data['description'] = customizations.get('description', template.description)
        rule_data['category'] = template.category.value
        rule_data['tags'] = customizations.get('tags', [template.category.value, 'template-based'])
        
        # Create the rule
        rule_id = await self.create_custom_rule(session_id, rule_data)
        
        # Update template usage
        template.use_count += 1
        
        self.logger.info(f"Created rule {rule_id} from template {template_id}")
        
        return rule_id
    
    async def delete_custom_rule(self, session_id: str, rule_id: str) -> bool:
        """Delete a custom rule"""
        
        if session_id not in self.active_sessions:
            raise ValueError(f"Session {session_id} not found")
        
        if rule_id not in self.custom_rules:
            raise ValueError(f"Rule {rule_id} not found")
        
        session = self.active_sessions[session_id]
        rule = self.custom_rules[rule_id]
        
        # Verify ownership
        if rule.created_by != session['user_id']:
            raise PermissionError(f"User does not have permission to delete rule {rule_id}")
        
        # Archive instead of delete if rule has been used
        if rule.usage_count > 0:
            rule.status = RuleStatus.ARCHIVED
            self.logger.info(f"Archived custom rule {rule_id}")
        else:
            # Actually delete if never used
            del self.custom_rules[rule_id]
            if rule_id in self.rule_tests:
                del self.rule_tests[rule_id]
            self.logger.info(f"Deleted custom rule {rule_id}")
        
        # Remove from session
        if rule_id in session['active_rules']:
            session['active_rules'].remove(rule_id)
        
        return True
    
    async def get_rule_analytics(self, rule_id: str) -> Dict[str, Any]:
        """Get analytics for a specific rule"""
        
        if rule_id not in self.custom_rules:
            raise ValueError(f"Rule {rule_id} not found")
        
        rule = self.custom_rules[rule_id]
        tests = self.rule_tests.get(rule_id, [])
        
        # Calculate test statistics
        total_tests = len(tests)
        passed_tests = sum(1 for test in tests if test.passed)
        test_success_rate = (passed_tests / total_tests) if total_tests > 0 else 0.0
        
        # Calculate confidence statistics
        confidences = [test.actual_confidence for test in tests if test.actual_confidence is not None]
        avg_confidence = sum(confidences) / len(confidences) if confidences else 0.0
        
        # Recent performance (last 30 days)
        recent_cutoff = datetime.now() - timedelta(days=30)
        recent_tests = [test for test in tests if test.test_timestamp >= recent_cutoff]
        recent_success_rate = (sum(1 for test in recent_tests if test.passed) / len(recent_tests)) if recent_tests else 0.0
        
        return {
            'rule_id': rule_id,
            'rule_name': rule.name,
            'status': rule.status.value,
            'usage_count': rule.usage_count,
            'success_rate': rule.success_rate,
            'average_confidence': rule.average_confidence,
            'user_feedback_score': rule.user_feedback_score,
            'test_statistics': {
                'total_tests': total_tests,
                'passed_tests': passed_tests,
                'test_success_rate': test_success_rate,
                'average_test_confidence': avg_confidence,
                'recent_success_rate': recent_success_rate
            },
            'performance_trend': self._calculate_performance_trend(tests),
            'usage_history': self._get_usage_history(rule_id)
        }
    
    def _calculate_performance_trend(self, tests: List[RuleTest]) -> str:
        """Calculate performance trend from test history"""
        if len(tests) < 2:
            return "insufficient_data"
        
        # Get success rates for first and second half of tests
        mid_point = len(tests) // 2
        early_tests = tests[:mid_point]
        recent_tests = tests[mid_point:]
        
        early_success = sum(1 for test in early_tests if test.passed) / len(early_tests)
        recent_success = sum(1 for test in recent_tests if test.passed) / len(recent_tests)
        
        if recent_success > early_success + 0.1:
            return "improving"
        elif recent_success < early_success - 0.1:
            return "declining"
        else:
            return "stable"
    
    def _get_usage_history(self, rule_id: str) -> List[Dict[str, Any]]:
        """Get usage history for a rule"""
        # This would typically come from a database
        # For now, return simulated data
        usage_stats = self.rule_usage_stats.get(rule_id, {})
        
        return [
            {
                'date': (datetime.now() - timedelta(days=i)).isoformat(),
                'usage_count': usage_stats.get(f'day_{i}', 0),
                'success_rate': usage_stats.get(f'success_{i}', 0.0)
            }
            for i in range(30, 0, -1)
        ]
    
    async def get_studio_analytics(self, session_id: str) -> StudioAnalytics:
        """Get overall analytics for the insight studio"""
        
        # Use cached analytics if recent
        if (self.analytics_cache and 
            self.cache_timestamp and 
            datetime.now() - self.cache_timestamp < timedelta(minutes=5)):
            return self.analytics_cache
        
        # Calculate fresh analytics
        all_rules = list(self.custom_rules.values())
        active_rules = [rule for rule in all_rules if rule.status == RuleStatus.ACTIVE]
        
        # Rules by category
        rules_by_category = {}
        for category in RuleCategory:
            count = sum(1 for rule in all_rules if rule.category == category)
            if count > 0:
                rules_by_category[category.value] = count
        
        # Top performing rules (by success rate)
        top_performing = sorted(
            all_rules, 
            key=lambda r: r.success_rate, 
            reverse=True
        )[:5]
        
        # Most used rules
        most_used = sorted(
            all_rules,
            key=lambda r: r.usage_count,
            reverse=True
        )[:5]
        
        # Calculate averages
        avg_success_rate = (
            sum(rule.success_rate for rule in all_rules) / len(all_rules)
            if all_rules else 0.0
        )
        
        total_insights = sum(rule.usage_count for rule in all_rules)
        
        avg_user_satisfaction = (
            sum(rule.user_feedback_score for rule in all_rules if rule.user_feedback_score > 0) /
            len([rule for rule in all_rules if rule.user_feedback_score > 0])
            if any(rule.user_feedback_score > 0 for rule in all_rules) else 0.0
        )
        
        analytics = StudioAnalytics(
            total_rules=len(all_rules),
            active_rules=len(active_rules),
            rules_by_category=rules_by_category,
            top_performing_rules=[rule.id for rule in top_performing],
            most_used_rules=[rule.id for rule in most_used],
            average_rule_success_rate=avg_success_rate,
            total_insights_generated=total_insights,
            user_satisfaction_score=avg_user_satisfaction
        )
        
        # Cache the results
        self.analytics_cache = analytics
        self.cache_timestamp = datetime.now()
        
        return analytics
    
    async def export_rules(self, session_id: str, rule_ids: List[str] = None) -> Dict[str, Any]:
        """Export rules for sharing or backup"""
        
        if session_id not in self.active_sessions:
            raise ValueError(f"Session {session_id} not found")
        
        session = self.active_sessions[session_id]
        
        # Get rules to export
        if rule_ids:
            rules_to_export = [self.custom_rules[rid] for rid in rule_ids if rid in self.custom_rules]
        else:
            # Export all user's rules
            user_id = session['user_id']
            rules_to_export = [rule for rule in self.custom_rules.values() if rule.created_by == user_id]
        
        # Create export package
        export_data = {
            'export_timestamp': datetime.now().isoformat(),
            'export_version': '1.0',
            'exported_by': session['user_id'],
            'rules': [asdict(rule) for rule in rules_to_export],
            'rule_count': len(rules_to_export)
        }
        
        self.logger.info(f"Exported {len(rules_to_export)} rules for user {session['user_id']}")
        
        return export_data
    
    async def import_rules(self, session_id: str, import_data: Dict[str, Any]) -> List[str]:
        """Import rules from export data"""
        
        if session_id not in self.active_sessions:
            raise ValueError(f"Session {session_id} not found")
        
        session = self.active_sessions[session_id]
        
        # Validate import data
        if 'rules' not in import_data:
            raise ValueError("Invalid import data: missing 'rules' field")
        
        imported_rule_ids = []
        
        for rule_data in import_data['rules']:
            try:
                # Generate new ID for imported rule
                new_rule_id = f"imported_rule_{uuid.uuid4().hex[:8]}"
                
                # Update metadata for import
                rule_data['id'] = new_rule_id
                rule_data['created_by'] = session['user_id']
                rule_data['created_at'] = datetime.now()
                rule_data['last_modified'] = datetime.now()
                rule_data['version'] = 1
                rule_data['usage_count'] = 0
                rule_data['success_rate'] = 0.0
                rule_data['average_confidence'] = 0.0
                rule_data['user_feedback_score'] = 0.0
                
                # Create CustomRule object
                custom_rule = CustomRule(**rule_data)
                
                # Store imported rule
                self.custom_rules[new_rule_id] = custom_rule
                session['active_rules'].append(new_rule_id)
                imported_rule_ids.append(new_rule_id)
                
            except Exception as e:
                self.logger.error(f"Failed to import rule: {e}")
                continue
        
        self.logger.info(f"Imported {len(imported_rule_ids)} rules for user {session['user_id']}")
        
        return imported_rule_ids
    
    async def get_session_status(self, session_id: str) -> Dict[str, Any]:
        """Get status of an insight studio session"""
        
        if session_id not in self.active_sessions:
            return {}
        
        session = self.active_sessions[session_id]
        
        # Get user's rules
        user_rules = [
            rule for rule in self.custom_rules.values() 
            if rule.created_by == session['user_id']
        ]
        
        return {
            'session_id': session_id,
            'user_id': session['user_id'],
            'session_duration': (datetime.now() - session['created_at']).total_seconds(),
            'total_user_rules': len(user_rules),
            'active_rules': len([r for r in user_rules if r.status == RuleStatus.ACTIVE]),
            'rules_in_testing': len([r for r in user_rules if r.status == RuleStatus.TESTING]),
            'session_stats': session['session_stats'],
            'available_templates': len(self.rule_templates)
        }
    
    async def close_session(self, session_id: str) -> Dict[str, Any]:
        """Close an insight studio session"""
        
        if session_id not in self.active_sessions:
            return {}
        
        session = self.active_sessions[session_id]
        
        # Get final session statistics
        stats = await self.get_session_status(session_id)
        
        # Clean up session
        del self.active_sessions[session_id]
        
        self.logger.info(f"Closed insight studio session {session_id}")
        
        return stats

# Global insight studio service instance
insight_studio_service = InsightStudioService()

async def get_insight_studio_service() -> InsightStudioService:
    """Get the global insight studio service instance"""
    return insight_studio_service