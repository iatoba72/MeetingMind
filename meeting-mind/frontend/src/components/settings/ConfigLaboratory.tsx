// Config Laboratory
// Testing environment for experimenting with different settings configurations

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Flask,
  Play,
  Square,
  RotateCcw,
  Save,
  Download,
  Upload,
  Copy,
  Beaker,
  Zap,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Clock,
  User,
  Globe,
  Users,
  Building,
  Eye,
  EyeOff,
  Settings,
  Code,
  Terminal,
  Monitor,
  Smartphone,
  Tablet,
  Lightbulb,
  Target,
  Activity
} from 'lucide-react';

interface Experiment {
  id: string;
  name: string;
  description: string;
  settings: Record<string, any>;
  created_at: string;
  created_by: string;
  results?: ExperimentResult[];
  status: 'draft' | 'running' | 'completed' | 'failed';
  duration?: number; // in seconds
  tags: string[];
}

interface ExperimentResult {
  timestamp: string;
  test_name: string;
  status: 'pass' | 'fail' | 'warning';
  message: string;
  metrics?: Record<string, number>;
  screenshot?: string;
}

interface TestSuite {
  id: string;
  name: string;
  description: string;
  tests: Test[];
  enabled: boolean;
}

interface Test {
  id: string;
  name: string;
  description: string;
  function: string;
  expected_outcome: string;
  timeout: number;
  critical: boolean;
}

interface Environment {
  id: string;
  name: string;
  description: string;
  device_type: 'desktop' | 'tablet' | 'mobile';
  screen_size: { width: number; height: number };
  user_agent: string;
  enabled: boolean;
}

const DEFAULT_TEST_SUITES: TestSuite[] = [
  {
    id: 'ui-responsiveness',
    name: 'UI Responsiveness',
    description: 'Test how UI adapts to different settings',
    enabled: true,
    tests: [
      {
        id: 'font-size-test',
        name: 'Font Size Adaptation',
        description: 'Verify UI scales properly with font size changes',
        function: 'testFontSizeScaling',
        expected_outcome: 'UI elements scale proportionally',
        timeout: 5000,
        critical: true
      },
      {
        id: 'theme-switch-test',
        name: 'Theme Switch',
        description: 'Test smooth transition between themes',
        function: 'testThemeTransition',
        expected_outcome: 'No layout shifts or flashing',
        timeout: 3000,
        critical: false
      },
      {
        id: 'compact-mode-test',
        name: 'Compact Mode',
        description: 'Verify compact mode maintains usability',
        function: 'testCompactMode',
        expected_outcome: 'All elements remain accessible',
        timeout: 4000,
        critical: true
      }
    ]
  },
  {
    id: 'performance',
    name: 'Performance Impact',
    description: 'Measure performance impact of settings changes',
    enabled: true,
    tests: [
      {
        id: 'render-time-test',
        name: 'Render Time',
        description: 'Measure component render time with new settings',
        function: 'measureRenderTime',
        expected_outcome: 'Render time < 100ms',
        timeout: 10000,
        critical: true
      },
      {
        id: 'memory-usage-test',
        name: 'Memory Usage',
        description: 'Check memory consumption after settings change',
        function: 'measureMemoryUsage',
        expected_outcome: 'Memory increase < 10MB',
        timeout: 5000,
        critical: false
      }
    ]
  },
  {
    id: 'accessibility',
    name: 'Accessibility',
    description: 'Verify accessibility compliance with settings',
    enabled: true,
    tests: [
      {
        id: 'contrast-ratio-test',
        name: 'Contrast Ratio',
        description: 'Check color contrast meets WCAG standards',
        function: 'testContrastRatio',
        expected_outcome: 'Contrast ratio > 4.5:1',
        timeout: 3000,
        critical: true
      },
      {
        id: 'keyboard-navigation-test',
        name: 'Keyboard Navigation',
        description: 'Verify keyboard navigation works with new settings',
        function: 'testKeyboardNavigation',
        expected_outcome: 'All elements keyboard accessible',
        timeout: 8000,
        critical: true
      }
    ]
  }
];

const DEFAULT_ENVIRONMENTS: Environment[] = [
  {
    id: 'desktop-1080p',
    name: 'Desktop 1080p',
    description: 'Standard desktop environment',
    device_type: 'desktop',
    screen_size: { width: 1920, height: 1080 },
    user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    enabled: true
  },
  {
    id: 'tablet-ipad',
    name: 'iPad Pro',
    description: 'Tablet environment',
    device_type: 'tablet',
    screen_size: { width: 1024, height: 1366 },
    user_agent: 'Mozilla/5.0 (iPad; CPU OS 14_0 like Mac OS X) AppleWebKit/605.1.15',
    enabled: true
  },
  {
    id: 'mobile-iphone',
    name: 'iPhone 12',
    description: 'Mobile environment',
    device_type: 'mobile',
    screen_size: { width: 390, height: 844 },
    user_agent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15',
    enabled: false
  }
];

export const ConfigLaboratory: React.FC = () => {
  // State
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [currentExperiment, setCurrentExperiment] = useState<Experiment | null>(null);
  const [experimentSettings, setExperimentSettings] = useState<Record<string, any>>({});
  const [testSuites, setTestSuites] = useState<TestSuite[]>(DEFAULT_TEST_SUITES);
  const [environments, setEnvironments] = useState<Environment[]>(DEFAULT_ENVIRONMENTS);
  const [selectedTestSuites, setSelectedTestSuites] = useState<string[]>(['ui-responsiveness']);
  const [selectedEnvironments, setSelectedEnvironments] = useState<string[]>(['desktop-1080p']);
  const [isRunning, setIsRunning] = useState(false);
  const [currentTest, setCurrentTest] = useState<string | null>(null);
  const [results, setResults] = useState<ExperimentResult[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);

  // Load saved experiments
  useEffect(() => {
    loadExperiments();
  }, []);

  const loadExperiments = async () => {
    try {
      const response = await fetch('/api/config-lab/experiments');
      const data = await response.json();
      setExperiments(data);
    } catch (error) {
      console.error('Failed to load experiments:', error);
    }
  };

  // Create new experiment
  const createExperiment = useCallback(() => {
    const newExperiment: Experiment = {
      id: `exp_${Date.now()}`,
      name: 'New Experiment',
      description: 'Test configuration changes',
      settings: { ...experimentSettings },
      created_at: new Date().toISOString(),
      created_by: 'config_lab',
      status: 'draft',
      tags: []
    };
    
    setCurrentExperiment(newExperiment);
    setExperiments(prev => [newExperiment, ...prev]);
  }, [experimentSettings]);

  // Save experiment
  const saveExperiment = useCallback(async () => {
    if (!currentExperiment) return;

    try {
      const response = await fetch('/api/config-lab/experiments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(currentExperiment)
      });

      if (response.ok) {
        setExperiments(prev => 
          prev.map(exp => 
            exp.id === currentExperiment.id ? currentExperiment : exp
          )
        );
      }
    } catch (error) {
      console.error('Failed to save experiment:', error);
    }
  }, [currentExperiment]);

  // Run experiment
  const runExperiment = useCallback(async () => {
    if (!currentExperiment || isRunning) return;

    setIsRunning(true);
    setResults([]);
    setCurrentTest(null);

    const experimentResults: ExperimentResult[] = [];
    const startTime = Date.now();

    try {
      // Update experiment status
      const updatedExperiment = { 
        ...currentExperiment, 
        status: 'running' as const
      };
      setCurrentExperiment(updatedExperiment);

      // Apply settings temporarily
      await applyExperimentSettings(currentExperiment.settings);

      // Run tests in each environment
      for (const envId of selectedEnvironments) {
        const environment = environments.find(env => env.id === envId);
        if (!environment) continue;

        // Switch to environment
        await switchToEnvironment(environment);

        // Run selected test suites
        for (const suiteId of selectedTestSuites) {
          const testSuite = testSuites.find(suite => suite.id === suiteId);
          if (!testSuite || !testSuite.enabled) continue;

          for (const test of testSuite.tests) {
            setCurrentTest(`${environment.name} - ${test.name}`);

            try {
              const result = await runTest(test, environment);
              experimentResults.push(result);
              setResults(prev => [...prev, result]);

              // Small delay between tests
              await new Promise(resolve => setTimeout(resolve, 500));
            } catch (error) {
              const errorResult: ExperimentResult = {
                timestamp: new Date().toISOString(),
                test_name: `${environment.name} - ${test.name}`,
                status: 'fail',
                message: `Test failed: ${error.message}`,
              };
              experimentResults.push(errorResult);
              setResults(prev => [...prev, errorResult]);
            }
          }
        }
      }

      // Calculate duration
      const duration = Math.round((Date.now() - startTime) / 1000);

      // Update experiment with results
      const completedExperiment = {
        ...updatedExperiment,
        status: 'completed' as const,
        results: experimentResults,
        duration
      };

      setCurrentExperiment(completedExperiment);
      setExperiments(prev => 
        prev.map(exp => 
          exp.id === completedExperiment.id ? completedExperiment : exp
        )
      );

      setShowResults(true);

    } catch (error) {
      console.error('Experiment failed:', error);
      
      const failedExperiment = {
        ...currentExperiment,
        status: 'failed' as const,
        results: experimentResults
      };
      
      setCurrentExperiment(failedExperiment);
    } finally {
      setIsRunning(false);
      setCurrentTest(null);
      
      // Restore original settings
      await restoreOriginalSettings();
    }
  }, [currentExperiment, isRunning, selectedEnvironments, selectedTestSuites, testSuites, environments]);

  // Apply experiment settings
  const applyExperimentSettings = async (settings: Record<string, any>) => {
    // This would apply settings to a test instance
    console.log('Applying experiment settings:', settings);
  };

  // Switch to environment
  const switchToEnvironment = async (environment: Environment) => {
    // This would configure the test environment
    console.log('Switching to environment:', environment.name);
  };

  // Run individual test
  const runTest = async (test: Test, environment: Environment): Promise<ExperimentResult> => {
    // Simulate test execution
    await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000));
    
    const success = Math.random() > 0.2; // 80% success rate for demo
    
    return {
      timestamp: new Date().toISOString(),
      test_name: `${environment.name} - ${test.name}`,
      status: success ? 'pass' : 'fail',
      message: success ? 'Test passed successfully' : 'Test failed - assertion error',
      metrics: {
        execution_time: Math.round(Math.random() * 1000),
        memory_usage: Math.round(Math.random() * 50)
      }
    };
  };

  // Restore original settings
  const restoreOriginalSettings = async () => {
    console.log('Restoring original settings');
  };

  // Export experiment
  const exportExperiment = useCallback((experiment: Experiment) => {
    const data = JSON.stringify(experiment, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `experiment_${experiment.name.replace(/\s+/g, '_')}.json`;
    a.click();
    
    URL.revokeObjectURL(url);
  }, []);

  // Get experiment stats
  const experimentStats = useMemo(() => {
    if (!currentExperiment?.results) return null;

    const total = currentExperiment.results.length;
    const passed = currentExperiment.results.filter(r => r.status === 'pass').length;
    const failed = currentExperiment.results.filter(r => r.status === 'fail').length;
    const warnings = currentExperiment.results.filter(r => r.status === 'warning').length;

    return { total, passed, failed, warnings };
  }, [currentExperiment]);

  return (
    <div className="config-laboratory h-full flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-100 rounded-lg">
              <Flask className="text-purple-600" size={24} />
            </div>
            <div>
              <h1 className="text-xl font-bold">Config Laboratory</h1>
              <p className="text-sm text-gray-600">Test and validate configuration changes</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={createExperiment}
              className="flex items-center gap-2 px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600"
            >
              <Beaker size={16} />
              New Experiment
            </button>

            {currentExperiment && (
              <>
                <button
                  onClick={saveExperiment}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
                >
                  <Save size={16} />
                  Save
                </button>

                <button
                  onClick={runExperiment}
                  disabled={isRunning || Object.keys(experimentSettings).length === 0}
                  className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50"
                >
                  {isRunning ? <Square size={16} /> : <Play size={16} />}
                  {isRunning ? 'Running...' : 'Run Experiment'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar - Experiment List */}
        <div className="w-80 border-r bg-white">
          <div className="p-4 border-b">
            <h3 className="font-semibold text-gray-900">Experiments</h3>
          </div>
          
          <div className="overflow-y-auto">
            {experiments.map(experiment => (
              <div
                key={experiment.id}
                className={`p-4 border-b cursor-pointer hover:bg-gray-50 ${
                  currentExperiment?.id === experiment.id ? 'bg-blue-50 border-blue-200' : ''
                }`}
                onClick={() => setCurrentExperiment(experiment)}
              >
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-medium">{experiment.name}</h4>
                  <div className="flex items-center gap-1">
                    {experiment.status === 'completed' && <CheckCircle size={16} className="text-green-500" />}
                    {experiment.status === 'failed' && <XCircle size={16} className="text-red-500" />}
                    {experiment.status === 'running' && <Activity size={16} className="text-blue-500 animate-pulse" />}
                    {experiment.status === 'draft' && <Clock size={16} className="text-gray-400" />}
                  </div>
                </div>
                
                <p className="text-sm text-gray-600 mb-2">{experiment.description}</p>
                
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>{new Date(experiment.created_at).toLocaleDateString()}</span>
                  {experiment.results && (
                    <span>{experiment.results.length} tests</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {currentExperiment ? (
            <>
              {/* Experiment Header */}
              <div className="p-4 border-b bg-white">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <input
                      type="text"
                      value={currentExperiment.name}
                      onChange={(e) => setCurrentExperiment({
                        ...currentExperiment,
                        name: e.target.value
                      })}
                      className="text-lg font-semibold bg-transparent border-none outline-none"
                    />
                    <textarea
                      value={currentExperiment.description}
                      onChange={(e) => setCurrentExperiment({
                        ...currentExperiment,
                        description: e.target.value
                      })}
                      className="text-sm text-gray-600 bg-transparent border-none outline-none resize-none w-full"
                      rows={2}
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => exportExperiment(currentExperiment)}
                      className="p-2 text-gray-500 hover:text-gray-700 rounded"
                      title="Export Experiment"
                    >
                      <Download size={16} />
                    </button>
                  </div>
                </div>

                {/* Status and Stats */}
                {experimentStats && (
                  <div className="flex items-center gap-4 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="text-gray-600">Status:</span>
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        currentExperiment.status === 'completed' ? 'bg-green-100 text-green-800' :
                        currentExperiment.status === 'failed' ? 'bg-red-100 text-red-800' :
                        currentExperiment.status === 'running' ? 'bg-blue-100 text-blue-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {currentExperiment.status}
                      </span>
                    </div>
                    
                    <div className="flex items-center gap-4">
                      <span className="text-green-600">{experimentStats.passed} passed</span>
                      <span className="text-red-600">{experimentStats.failed} failed</span>
                      {experimentStats.warnings > 0 && (
                        <span className="text-yellow-600">{experimentStats.warnings} warnings</span>
                      )}
                    </div>

                    {currentExperiment.duration && (
                      <span className="text-gray-600">
                        Duration: {currentExperiment.duration}s
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Tabs */}
              <div className="border-b bg-white">
                <div className="flex">
                  <button
                    onClick={() => setShowResults(false)}
                    className={`px-4 py-2 border-b-2 ${
                      !showResults ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-600'
                    }`}
                  >
                    Configuration
                  </button>
                  <button
                    onClick={() => setShowResults(true)}
                    className={`px-4 py-2 border-b-2 ${
                      showResults ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-600'
                    }`}
                  >
                    Results
                    {results.length > 0 && (
                      <span className="ml-2 px-2 py-0.5 bg-gray-100 text-gray-700 text-xs rounded">
                        {results.length}
                      </span>
                    )}
                  </button>
                </div>
              </div>

              {/* Tab Content */}
              <div className="flex-1 overflow-y-auto">
                {!showResults ? (
                  <div className="p-6 space-y-6">
                    {/* Settings Configuration */}
                    <div className="bg-white rounded-lg border p-6">
                      <h3 className="text-lg font-semibold mb-4">Settings to Test</h3>
                      <div className="space-y-4">
                        {/* Example settings inputs */}
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-medium mb-1">Theme</label>
                            <select
                              value={experimentSettings.theme || 'light'}
                              onChange={(e) => setExperimentSettings({
                                ...experimentSettings,
                                theme: e.target.value
                              })}
                              className="w-full border rounded px-3 py-2"
                            >
                              <option value="light">Light</option>
                              <option value="dark">Dark</option>
                              <option value="auto">Auto</option>
                            </select>
                          </div>
                          
                          <div>
                            <label className="block text-sm font-medium mb-1">Font Size</label>
                            <select
                              value={experimentSettings.font_size || 14}
                              onChange={(e) => setExperimentSettings({
                                ...experimentSettings,
                                font_size: parseInt(e.target.value)
                              })}
                              className="w-full border rounded px-3 py-2"
                            >
                              <option value={12}>12px</option>
                              <option value={14}>14px</option>
                              <option value={16}>16px</option>
                              <option value={18}>18px</option>
                            </select>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Test Suites */}
                    <div className="bg-white rounded-lg border p-6">
                      <h3 className="text-lg font-semibold mb-4">Test Suites</h3>
                      <div className="space-y-3">
                        {testSuites.map(suite => (
                          <label key={suite.id} className="flex items-center gap-3">
                            <input
                              type="checkbox"
                              checked={selectedTestSuites.includes(suite.id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedTestSuites([...selectedTestSuites, suite.id]);
                                } else {
                                  setSelectedTestSuites(selectedTestSuites.filter(id => id !== suite.id));
                                }
                              }}
                            />
                            <div>
                              <div className="font-medium">{suite.name}</div>
                              <div className="text-sm text-gray-600">{suite.description}</div>
                              <div className="text-xs text-gray-500">{suite.tests.length} tests</div>
                            </div>
                          </label>
                        ))}
                      </div>
                    </div>

                    {/* Environments */}
                    <div className="bg-white rounded-lg border p-6">
                      <h3 className="text-lg font-semibold mb-4">Test Environments</h3>
                      <div className="space-y-3">
                        {environments.map(env => (
                          <label key={env.id} className="flex items-center gap-3">
                            <input
                              type="checkbox"
                              checked={selectedEnvironments.includes(env.id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedEnvironments([...selectedEnvironments, env.id]);
                                } else {
                                  setSelectedEnvironments(selectedEnvironments.filter(id => id !== env.id));
                                }
                              }}
                            />
                            <div className="flex items-center gap-2">
                              {env.device_type === 'desktop' && <Monitor size={16} />}
                              {env.device_type === 'tablet' && <Tablet size={16} />}
                              {env.device_type === 'mobile' && <Smartphone size={16} />}
                              <div>
                                <div className="font-medium">{env.name}</div>
                                <div className="text-sm text-gray-600">{env.description}</div>
                                <div className="text-xs text-gray-500">
                                  {env.screen_size.width}×{env.screen_size.height}
                                </div>
                              </div>
                            </div>
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="p-6">
                    {/* Running indicator */}
                    {isRunning && (
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                        <div className="flex items-center gap-3">
                          <Activity className="text-blue-500 animate-pulse" size={20} />
                          <div>
                            <div className="font-medium text-blue-900">Running Experiment</div>
                            {currentTest && (
                              <div className="text-sm text-blue-700">Currently testing: {currentTest}</div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Results */}
                    <div className="space-y-4">
                      {results.map((result, index) => (
                        <div
                          key={index}
                          className={`p-4 rounded-lg border ${
                            result.status === 'pass' ? 'bg-green-50 border-green-200' :
                            result.status === 'fail' ? 'bg-red-50 border-red-200' :
                            'bg-yellow-50 border-yellow-200'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              {result.status === 'pass' && <CheckCircle size={16} className="text-green-500" />}
                              {result.status === 'fail' && <XCircle size={16} className="text-red-500" />}
                              {result.status === 'warning' && <AlertTriangle size={16} className="text-yellow-500" />}
                              <span className="font-medium">{result.test_name}</span>
                            </div>
                            <span className="text-xs text-gray-500">
                              {new Date(result.timestamp).toLocaleTimeString()}
                            </span>
                          </div>
                          
                          <p className="text-sm mb-2">{result.message}</p>
                          
                          {result.metrics && (
                            <div className="flex gap-4 text-xs text-gray-600">
                              {Object.entries(result.metrics).map(([key, value]) => (
                                <span key={key}>
                                  {key.replace(/_/g, ' ')}: {value}
                                  {key.includes('time') ? 'ms' : key.includes('memory') ? 'MB' : ''}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                      
                      {results.length === 0 && !isRunning && (
                        <div className="text-center py-12 text-gray-500">
                          <Target size={48} className="mx-auto mb-4 opacity-50" />
                          <div>No test results yet</div>
                          <div className="text-sm">Configure your experiment and run tests to see results</div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center text-gray-500">
                <Lightbulb size={64} className="mx-auto mb-4 opacity-50" />
                <h3 className="text-lg font-medium mb-2">Welcome to Config Laboratory</h3>
                <p className="text-sm mb-4">Create experiments to test different configuration settings</p>
                <button
                  onClick={createExperiment}
                  className="flex items-center gap-2 px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 mx-auto"
                >
                  <Beaker size={16} />
                  Create Your First Experiment
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};