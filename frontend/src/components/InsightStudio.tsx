// Insight Studio - Custom Rule Creation Interface
// Advanced interface for creating and managing custom insight rules and triggers

import React, { useState, useEffect } from 'react';
import { 
  PlusIcon, TrashIcon, DocumentDuplicateIcon, PlayIcon, 
  CogIcon, LightBulbIcon, BeakerIcon, CheckCircleIcon,
  ExclamationTriangleIcon
} from '@heroicons/react/24/outline';

// Enums matching backend types
enum TriggerType {
  SPEAKER_CHANGE = 'speaker_change',
  TOPIC_SHIFT = 'topic_shift',
  QUESTION_ASKED = 'question_asked',
  DECISION_POINT = 'decision_point',
  ACTION_ITEM = 'action_item',
  DISAGREEMENT = 'disagreement',
  AGREEMENT = 'agreement',
  CONCERN_RAISED = 'concern_raised',
  DEADLINE_MENTIONED = 'deadline_mentioned',
  PRIORITY_CHANGE = 'priority_change',
  STAKEHOLDER_MENTIONED = 'stakeholder_mentioned',
  TECHNICAL_ISSUE = 'technical_issue',
  BUSINESS_IMPACT = 'business_impact',
  FOLLOWUP_NEEDED = 'followup_needed',
  MEETING_CONCLUSION = 'meeting_conclusion'
}

enum TriggerPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

enum InsightType {
  ACTION_ITEM = 'action_item',
  DECISION = 'decision',
  CONCERN = 'concern',
  QUESTION = 'question',
  SUMMARY = 'summary',
  TOPIC_TRANSITION = 'topic_transition',
  CONFLICT_RESOLUTION = 'conflict_resolution',
  CONSENSUS = 'consensus',
  TECHNICAL_NOTE = 'technical_note',
  BUSINESS_INSIGHT = 'business_insight',
  DEADLINE = 'deadline',
  FOLLOWUP = 'followup',
  KEY_QUOTE = 'key_quote',
  SENTIMENT_SHIFT = 'sentiment_shift',
  SPEAKER_HIGHLIGHT = 'speaker_highlight'
}

interface CustomRule {
  id: string;
  name: string;
  description: string;
  triggerType: TriggerType;
  priority: TriggerPriority;
  enabled: boolean;
  keywords: string[];
  phrases: string[];
  regexPatterns: string[];
  contextRequirements: string[];
  speakerRequirements: Record<string, { minParticipation?: number; role?: string; [key: string]: unknown }>;
  timingRequirements: Record<string, { minDuration?: number; maxDuration?: number; phase?: string; [key: string]: unknown }>;
  confidenceThreshold: number;
  insightTemplate: string;
  insightType: InsightType;
  postProcessingRules: string[];
  testResults?: TestResult[];
  created: Date;
  lastModified: Date;
  author: string;
  tags: string[];
}

interface TestResult {
  id: string;
  timestamp: Date;
  testText: string;
  expectedMatch: boolean;
  actualMatch: boolean;
  confidence: number;
  passed: boolean;
  details: string;
}

interface RuleCategory {
  id: string;
  name: string;
  description: string;
  icon: string;
  rules: CustomRule[];
}

interface InsightStudioProps {
  onRuleCreated?: (rule: CustomRule) => void;
  onRuleUpdated?: (rule: CustomRule) => void;
  onRuleDeleted?: (ruleId: string) => void;
  existingRules?: CustomRule[];
}

export const InsightStudio: React.FC<InsightStudioProps> = ({
  onRuleCreated,
  onRuleUpdated,
  onRuleDeleted,
  existingRules = []
}) => {
  const [rules, setRules] = useState<CustomRule[]>(existingRules);
  const [categories, setCategories] = useState<RuleCategory[]>([]);
  const [selectedRule, setSelectedRule] = useState<CustomRule | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [activeTab, setActiveTab] = useState<'rules' | 'templates' | 'testing' | 'analytics'>('rules');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [testMode, setTestMode] = useState(false);
  // const [testText, setTestText] = useState('');
  const [testResults, setTestResults] = useState<TestResult[]>([]);

  // Initialize with sample rules
  useEffect(() => {
    const sampleRules: CustomRule[] = [
      {
        id: 'rule_1',
        name: 'Budget Discussion Detector',
        description: 'Detects when budget-related topics are discussed',
        triggerType: TriggerType.BUSINESS_IMPACT,
        priority: TriggerPriority.HIGH,
        enabled: true,
        keywords: ['budget', 'cost', 'expense', 'financial', 'money', 'funding'],
        phrases: ['budget allocation', 'cost analysis', 'financial impact', 'funding requirements'],
        regexPatterns: ['\\b(budget|cost|expense)\\s+(analysis|review|discussion)\\b'],
        contextRequirements: [],
        speakerRequirements: {},
        timingRequirements: {},
        confidenceThreshold: 0.7,
        insightTemplate: `Analyze this budget discussion:

Context: {context}
Discussion: {trigger_text}
Speaker: {speaker}

Provide:
1. Budget items mentioned
2. Financial implications
3. Cost concerns or opportunities
4. Recommended budget actions
5. Impact on project timeline

Focus on actionable financial insights.`,
        insightType: InsightType.BUSINESS_INSIGHT,
        postProcessingRules: ['extract_amounts', 'identify_cost_centers'],
        created: new Date(),
        lastModified: new Date(),
        author: 'System',
        tags: ['finance', 'business', 'budget']
      },
      {
        id: 'rule_2',
        name: 'Risk Assessment Trigger',
        description: 'Identifies potential risks and concerns raised in meetings',
        triggerType: TriggerType.CONCERN_RAISED,
        priority: TriggerPriority.CRITICAL,
        enabled: true,
        keywords: ['risk', 'danger', 'threat', 'vulnerable', 'exposed', 'liability'],
        phrases: ['potential risk', 'security concern', 'compliance issue', 'legal exposure'],
        regexPatterns: ['\\b(risk|threat|danger)\\s+(?:of|to|that)\\b'],
        contextRequirements: [],
        speakerRequirements: {},
        timingRequirements: {},
        confidenceThreshold: 0.8,
        insightTemplate: `Risk Assessment Analysis:

Context: {context}
Risk Mentioned: {trigger_text}
Raised By: {speaker}

Analyze:
1. Type and severity of risk
2. Potential impact if realized
3. Current mitigation measures
4. Recommended risk management actions
5. Priority level for addressing

Provide clear risk assessment with actionable recommendations.`,
        insightType: InsightType.CONCERN,
        postProcessingRules: ['assess_risk_level', 'categorize_risk_type'],
        created: new Date(),
        lastModified: new Date(),
        author: 'System',
        tags: ['risk', 'security', 'compliance']
      }
    ];

    setRules(sampleRules);
    organizRulesIntoCategories(sampleRules);
  }, [organizRulesIntoCategories]);

  const organizRulesIntoCategories = useCallback((ruleList: CustomRule[]) => {
    const categoryMap = new Map<string, CustomRule[]>();
    
    ruleList.forEach(rule => {
      const mainTag = rule.tags[0] || 'general';
      if (!categoryMap.has(mainTag)) {
        categoryMap.set(mainTag, []);
      }
      categoryMap.get(mainTag)!.push(rule);
    });

    const categoriesList: RuleCategory[] = Array.from(categoryMap.entries()).map(([key, rules]) => ({
      id: key,
      name: key.charAt(0).toUpperCase() + key.slice(1),
      description: `Rules for ${key} insights`,
      icon: getCategoryIcon(key),
      rules
    }));

    setCategories(categoriesList);
  }, []);

  const getCategoryIcon = (category: string): string => {
    const iconMap: Record<string, string> = {
      'finance': '💰',
      'business': '📊',
      'budget': '💵',
      'risk': '⚠️',
      'security': '🔒',
      'compliance': '📋',
      'technical': '⚙️',
      'project': '📅',
      'team': '👥',
      'general': '💡'
    };
    return iconMap[category] || '💡';
  };

  const createNewRule = () => {
    const newRule: CustomRule = {
      id: `rule_${Date.now()}`,
      name: 'New Custom Rule',
      description: 'Describe what this rule detects',
      triggerType: TriggerType.QUESTION_ASKED,
      priority: TriggerPriority.MEDIUM,
      enabled: true,
      keywords: [],
      phrases: [],
      regexPatterns: [],
      contextRequirements: [],
      speakerRequirements: {},
      timingRequirements: {},
      confidenceThreshold: 0.6,
      insightTemplate: 'Default template for {trigger_type} insights...',
      insightType: InsightType.SUMMARY,
      postProcessingRules: [],
      created: new Date(),
      lastModified: new Date(),
      author: 'User',
      tags: ['custom']
    };

    setSelectedRule(newRule);
    setIsEditing(true);
  };

  const saveRule = (rule: CustomRule) => {
    if (rules.find(r => r.id === rule.id)) {
      // Update existing rule
      setRules(prev => prev.map(r => r.id === rule.id ? { ...rule, lastModified: new Date() } : r));
      onRuleUpdated?.(rule);
    } else {
      // Add new rule
      setRules(prev => [...prev, rule]);
      onRuleCreated?.(rule);
    }
    
    organizRulesIntoCategories(rules);
    setIsEditing(false);
  };

  const deleteRule = (ruleId: string) => {
    setRules(prev => prev.filter(r => r.id !== ruleId));
    onRuleDeleted?.(ruleId);
    if (selectedRule?.id === ruleId) {
      setSelectedRule(null);
    }
    organizRulesIntoCategories(rules);
  };

  const duplicateRule = (rule: CustomRule) => {
    const duplicated: CustomRule = {
      ...rule,
      id: `rule_${Date.now()}`,
      name: `${rule.name} (Copy)`,
      created: new Date(),
      lastModified: new Date()
    };
    setRules(prev => [...prev, duplicated]);
    organizRulesIntoCategories([...rules, duplicated]);
  };

  const testRule = async (rule: CustomRule, text: string) => {
    // Simulate rule testing
    const confidence = Math.random() * 0.4 + 0.6; // Random confidence between 0.6-1.0
    const shouldMatch = rule.keywords.some(keyword => 
      text.toLowerCase().includes(keyword.toLowerCase())
    ) || rule.phrases.some(phrase => 
      text.toLowerCase().includes(phrase.toLowerCase())
    );

    const testResult: TestResult = {
      id: `test_${Date.now()}`,
      timestamp: new Date(),
      testText: text,
      expectedMatch: shouldMatch,
      actualMatch: confidence > rule.confidenceThreshold,
      confidence,
      passed: shouldMatch === (confidence > rule.confidenceThreshold),
      details: `Confidence: ${(confidence * 100).toFixed(1)}%, Threshold: ${(rule.confidenceThreshold * 100).toFixed(1)}%`
    };

    setTestResults(prev => [testResult, ...prev.slice(0, 9)]); // Keep last 10 results
    return testResult;
  };

  const filteredRules = rules.filter(rule => {
    const matchesSearch = rule.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         rule.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         rule.tags.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase()));
    
    const matchesCategory = filterCategory === 'all' || rule.tags.includes(filterCategory);
    
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            <BeakerIcon className="w-8 h-8 text-purple-600" />
            <div>
              <h2 className="text-2xl font-semibold text-gray-900">Insight Studio</h2>
              <p className="text-gray-600 mt-1">
                Create and customize intelligent meeting insight rules
              </p>
            </div>
          </div>
          
          <div className="flex items-center space-x-3">
            <button
              onClick={createNewRule}
              className="flex items-center px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
            >
              <PlusIcon className="w-5 h-5 mr-2" />
              New Rule
            </button>
            
            <button
              onClick={() => setTestMode(!testMode)}
              className={`flex items-center px-4 py-2 rounded-lg ${
                testMode 
                  ? 'bg-green-600 text-white hover:bg-green-700' 
                  : 'bg-gray-600 text-white hover:bg-gray-700'
              }`}
            >
              <PlayIcon className="w-5 h-5 mr-2" />
              {testMode ? 'Exit Test' : 'Test Rules'}
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex space-x-1 bg-gray-100 rounded-lg p-1">
          {(['rules', 'templates', 'testing', 'analytics'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 px-4 py-2 rounded-md text-sm font-medium ${
                activeTab === tab
                  ? 'bg-white text-purple-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Rules List */}
        <div className="lg:col-span-1 space-y-4">
          {/* Search and Filter */}
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="space-y-3">
              <input
                type="text"
                placeholder="Search rules..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              />
              
              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              >
                <option value="all">All Categories</option>
                {categories.map(category => (
                  <option key={category.id} value={category.id}>
                    {category.icon} {category.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Rules List */}
          <div className="bg-white rounded-lg border border-gray-200">
            <div className="p-4 border-b border-gray-200">
              <h3 className="font-semibold text-gray-900">
                Custom Rules ({filteredRules.length})
              </h3>
            </div>
            
            <div className="max-h-96 overflow-y-auto">
              {filteredRules.length === 0 ? (
                <div className="p-6 text-center text-gray-500">
                  <LightBulbIcon className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                  <p>No rules found matching your criteria</p>
                </div>
              ) : (
                <div className="space-y-2 p-4">
                  {filteredRules.map(rule => (
                    <div
                      key={rule.id}
                      className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                        selectedRule?.id === rule.id
                          ? 'border-purple-500 bg-purple-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                      onClick={() => setSelectedRule(rule)}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center space-x-2">
                            <h4 className="font-medium text-sm text-gray-900">{rule.name}</h4>
                            <span className={`inline-flex px-2 py-1 text-xs rounded-full ${
                              rule.enabled 
                                ? 'bg-green-100 text-green-800' 
                                : 'bg-gray-100 text-gray-500'
                            }`}>
                              {rule.enabled ? 'Active' : 'Disabled'}
                            </span>
                          </div>
                          <p className="text-xs text-gray-600 mt-1">{rule.description}</p>
                          <div className="flex items-center justify-between mt-2">
                            <div className="flex items-center space-x-2">
                              <span className={`text-xs px-2 py-1 rounded ${
                                rule.priority === TriggerPriority.CRITICAL ? 'bg-red-100 text-red-800' :
                                rule.priority === TriggerPriority.HIGH ? 'bg-orange-100 text-orange-800' :
                                rule.priority === TriggerPriority.MEDIUM ? 'bg-yellow-100 text-yellow-800' :
                                'bg-gray-100 text-gray-800'
                              }`}>
                                {rule.priority}
                              </span>
                              <span className="text-xs text-gray-500">
                                {rule.triggerType.replace('_', ' ')}
                              </span>
                            </div>
                          </div>
                        </div>
                        
                        <div className="flex space-x-1 ml-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              duplicateRule(rule);
                            }}
                            className="p-1 text-gray-400 hover:text-gray-600"
                          >
                            <DocumentDuplicateIcon className="w-4 h-4" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteRule(rule.id);
                            }}
                            className="p-1 text-gray-400 hover:text-red-600"
                          >
                            <TrashIcon className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Rule Details/Editor */}
        <div className="lg:col-span-2">
          {selectedRule ? (
            <RuleEditor
              rule={selectedRule}
              isEditing={isEditing}
              onEdit={() => setIsEditing(true)}
              onSave={saveRule}
              onCancel={() => setIsEditing(false)}
              onTest={testRule}
              testMode={testMode}
            />
          ) : (
            <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
              <BeakerIcon className="w-16 h-16 mx-auto text-gray-300 mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Select a Rule to Edit
              </h3>
              <p className="text-gray-600">
                Choose a rule from the list to view details and make modifications, or create a new rule to get started.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Test Results Panel */}
      {testMode && testResults.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Test Results</h3>
          <div className="space-y-3">
            {testResults.map(result => (
              <div
                key={result.id}
                className={`p-3 border rounded-lg ${
                  result.passed ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-2 mb-1">
                      {result.passed ? (
                        <CheckCircleIcon className="w-5 h-5 text-green-600" />
                      ) : (
                        <ExclamationTriangleIcon className="w-5 h-5 text-red-600" />
                      )}
                      <span className="font-medium text-sm">
                        {result.passed ? 'Test Passed' : 'Test Failed'}
                      </span>
                      <span className="text-xs text-gray-500">
                        {result.timestamp.toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="text-sm text-gray-700 mb-1">"{result.testText}"</p>
                    <p className="text-xs text-gray-600">{result.details}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Info Panel */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h4 className="font-semibold text-blue-900 mb-2">🎯 Insight Studio Features:</h4>
        <ul className="text-blue-800 text-sm space-y-1">
          <li>• Create custom trigger patterns with keywords, phrases, and regex</li>
          <li>• Design specialized insight templates for different meeting scenarios</li>
          <li>• Test rules against sample text to validate effectiveness</li>
          <li>• Configure confidence thresholds and priority levels</li>
          <li>• Organize rules by categories and tags for easy management</li>
          <li>• Export and import rule sets for sharing across teams</li>
        </ul>
      </div>
    </div>
  );
};

// Rule Editor Component
interface RuleEditorProps {
  rule: CustomRule;
  isEditing: boolean;
  onEdit: () => void;
  onSave: (rule: CustomRule) => void;
  onCancel: () => void;
  onTest: (rule: CustomRule, text: string) => Promise<TestResult>;
  testMode: boolean;
}

const RuleEditor: React.FC<RuleEditorProps> = ({
  rule,
  isEditing,
  onEdit,
  onSave,
  onCancel,
  onTest,
  testMode
}) => {
  const [editedRule, setEditedRule] = useState<CustomRule>(rule);
  const [testText, setTestText] = useState('');
  const [lastTestResult, setLastTestResult] = useState<TestResult | null>(null);

  useEffect(() => {
    setEditedRule(rule);
  }, [rule]);

  const handleTest = async () => {
    if (testText.trim()) {
      const result = await onTest(editedRule, testText);
      setLastTestResult(result);
    }
  };

  const updateRule = (updates: Partial<CustomRule>) => {
    setEditedRule(prev => ({ ...prev, ...updates }));
  };

  if (!isEditing) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h3 className="text-xl font-semibold text-gray-900">{rule.name}</h3>
            <p className="text-gray-600 mt-1">{rule.description}</p>
          </div>
          
          <div className="flex space-x-2">
            <button
              onClick={onEdit}
              className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              <CogIcon className="w-5 h-5 mr-2" />
              Edit Rule
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h4 className="font-medium text-gray-900 mb-3">Configuration</h4>
            <dl className="space-y-2">
              <div>
                <dt className="text-sm font-medium text-gray-600">Trigger Type</dt>
                <dd className="text-sm text-gray-900">{rule.triggerType.replace('_', ' ')}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-600">Priority</dt>
                <dd className="text-sm text-gray-900">{rule.priority}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-600">Confidence Threshold</dt>
                <dd className="text-sm text-gray-900">{(rule.confidenceThreshold * 100).toFixed(0)}%</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-600">Status</dt>
                <dd className={`text-sm ${rule.enabled ? 'text-green-600' : 'text-red-600'}`}>
                  {rule.enabled ? 'Enabled' : 'Disabled'}
                </dd>
              </div>
            </dl>
          </div>

          <div>
            <h4 className="font-medium text-gray-900 mb-3">Detection Patterns</h4>
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium text-gray-600">Keywords</label>
                <div className="flex flex-wrap gap-1 mt-1">
                  {rule.keywords.map((keyword, index) => (
                    <span key={index} className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded">
                      {keyword}
                    </span>
                  ))}
                </div>
              </div>
              
              <div>
                <label className="text-sm font-medium text-gray-600">Phrases</label>
                <div className="flex flex-wrap gap-1 mt-1">
                  {rule.phrases.map((phrase, index) => (
                    <span key={index} className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded">
                      {phrase}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {testMode && (
          <div className="mt-6 p-4 bg-gray-50 rounded-lg">
            <h4 className="font-medium text-gray-900 mb-3">Test This Rule</h4>
            <div className="space-y-3">
              <textarea
                value={testText}
                onChange={(e) => setTestText(e.target.value)}
                placeholder="Enter sample meeting text to test this rule..."
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                rows={3}
              />
              <button
                onClick={handleTest}
                disabled={!testText.trim()}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
              >
                Test Rule
              </button>
              
              {lastTestResult && (
                <div className={`p-3 rounded-lg ${
                  lastTestResult.passed ? 'bg-green-100 border-green-200' : 'bg-red-100 border-red-200'
                } border`}>
                  <div className="flex items-center space-x-2">
                    {lastTestResult.passed ? (
                      <CheckCircleIcon className="w-5 h-5 text-green-600" />
                    ) : (
                      <ExclamationTriangleIcon className="w-5 h-5 text-red-600" />
                    )}
                    <span className="font-medium text-sm">
                      {lastTestResult.passed ? 'Rule Matched' : 'Rule Did Not Match'}
                    </span>
                  </div>
                  <p className="text-sm mt-1">{lastTestResult.details}</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-xl font-semibold text-gray-900">
          {rule.id.startsWith('rule_' + Date.now().toString().slice(0, -3)) ? 'Create New Rule' : 'Edit Rule'}
        </h3>
        
        <div className="flex space-x-2">
          <button
            onClick={() => onSave(editedRule)}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
          >
            Save Rule
          </button>
          <button
            onClick={onCancel}
            className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
          >
            Cancel
          </button>
        </div>
      </div>

      <div className="space-y-6">
        {/* Basic Information */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Rule Name</label>
            <input
              type="text"
              value={editedRule.name}
              onChange={(e) => updateRule({ name: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
            <select
              value={editedRule.priority}
              onChange={(e) => updateRule({ priority: e.target.value as TriggerPriority })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
            >
              {Object.values(TriggerPriority).map(priority => (
                <option key={priority} value={priority}>{priority}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
          <textarea
            value={editedRule.description}
            onChange={(e) => updateRule({ description: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
            rows={2}
          />
        </div>

        {/* Trigger Configuration */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Trigger Type</label>
            <select
              value={editedRule.triggerType}
              onChange={(e) => updateRule({ triggerType: e.target.value as TriggerType })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
            >
              {Object.values(TriggerType).map(type => (
                <option key={type} value={type}>{type.replace('_', ' ')}</option>
              ))}
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Confidence Threshold ({(editedRule.confidenceThreshold * 100).toFixed(0)}%)
            </label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={editedRule.confidenceThreshold}
              onChange={(e) => updateRule({ confidenceThreshold: parseFloat(e.target.value) })}
              className="w-full"
            />
          </div>
        </div>

        {/* Detection Patterns */}
        <div>
          <h4 className="font-medium text-gray-900 mb-3">Detection Patterns</h4>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Keywords (comma-separated)
              </label>
              <input
                type="text"
                value={editedRule.keywords.join(', ')}
                onChange={(e) => updateRule({ 
                  keywords: e.target.value.split(',').map(k => k.trim()).filter(k => k) 
                })}
                placeholder="budget, cost, expense, financial"
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Phrases (comma-separated)
              </label>
              <input
                type="text"
                value={editedRule.phrases.join(', ')}
                onChange={(e) => updateRule({ 
                  phrases: e.target.value.split(',').map(p => p.trim()).filter(p => p) 
                })}
                placeholder="budget allocation, cost analysis, financial impact"
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Regex Patterns (one per line)
              </label>
              <textarea
                value={editedRule.regexPatterns.join('\n')}
                onChange={(e) => updateRule({ 
                  regexPatterns: e.target.value.split('\n').map(p => p.trim()).filter(p => p) 
                })}
                placeholder="\\b(budget|cost|expense)\\s+(analysis|review|discussion)\\b"
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm font-mono"
                rows={3}
              />
            </div>
          </div>
        </div>

        {/* Insight Template */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Insight Template</label>
          <textarea
            value={editedRule.insightTemplate}
            onChange={(e) => updateRule({ insightTemplate: e.target.value })}
            placeholder="Template for generating insights..."
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm font-mono"
            rows={8}
          />
          <p className="text-xs text-gray-500 mt-1">
            Use {'{context}'}, {'{trigger_text}'}, {'{speaker}'} placeholders
          </p>
        </div>

        {/* Settings */}
        <div className="flex items-center space-x-4">
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={editedRule.enabled}
              onChange={(e) => updateRule({ enabled: e.target.checked })}
              className="mr-2"
            />
            <span className="text-sm font-medium text-gray-700">Enable this rule</span>
          </label>
        </div>
      </div>
    </div>
  );
};