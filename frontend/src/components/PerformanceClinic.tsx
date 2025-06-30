// Performance Clinic - Shows optimization impacts and provides actionable insights
// Interactive dashboard for performance analysis and improvement tracking

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  TrendingUp,
  Zap,
  Target,
  BarChart3,
  Activity,
  Clock,
  HardDrive,
  Wifi,
  Download,
  PlayCircle,
  StopCircle,
  Filter,
  ArrowRight,
  ArrowUp,
  ArrowDown,
  Lightbulb,
  Gauge,
  Users
} from 'lucide-react';

interface OptimizationImpact {
  id: string;
  name: string;
  category: 'rendering' | 'memory' | 'network' | 'caching' | 'bundling';
  description: string;
  beforeValue: number;
  afterValue: number;
  improvement: number;
  improvementPercent: number;
  unit: string;
  status: 'measured' | 'estimated' | 'theoretical';
  confidence: number;
  implementationEffort: 'low' | 'medium' | 'high';
  businessImpact: 'low' | 'medium' | 'high';
  tags: string[];
  measuredAt: number;
}

interface PerformanceScenario {
  id: string;
  name: string;
  description: string;
  optimizations: OptimizationImpact[];
  totalImprovement: number;
  estimatedUserImpact: string;
  implementation: {
    effort: 'low' | 'medium' | 'high';
    timeline: string;
    resources: string[];
  };
}

interface PerformanceTest {
  id: string;
  name: string;
  type: 'component' | 'page' | 'feature' | 'user-flow';
  baseline: {
    renderTime: number;
    memoryUsage: number;
    bundleSize: number;
    cacheHitRate: number;
    networkRequests: number;
  };
  current: {
    renderTime: number;
    memoryUsage: number;
    bundleSize: number;
    cacheHitRate: number;
    networkRequests: number;
  };
  improvements: OptimizationImpact[];
  isRunning: boolean;
  lastRun: number;
}

export const PerformanceClinic: React.FC<{
  className?: string;
  onOptimizationSelect?: (optimization: OptimizationImpact) => void;
}> = ({
  className = '',
  onOptimizationSelect
}) => {
  // State
  const [activeTab, setActiveTab] = useState<'overview' | 'impacts' | 'scenarios' | 'tests'>('overview');
  const [optimizations, setOptimizations] = useState<OptimizationImpact[]>([]);
  const [scenarios, setScenarios] = useState<PerformanceScenario[]>([]);
  const [tests, setTests] = useState<PerformanceTest[]>([]);
  const [selectedOptimization, setSelectedOptimization] = useState<OptimizationImpact | null>(null);
  const [isRunningTests, setIsRunningTests] = useState(false);
  const [filter, setFilter] = useState<{
    category: string;
    impact: string;
    effort: string;
  }>({
    category: 'all',
    impact: 'all',
    effort: 'all'
  });

  // Load optimization data
  useEffect(() => {
    loadOptimizationData();
    initializeScenarios();
    initializeTests();
  }, []);

  const loadOptimizationData = useCallback(() => {
    // Simulated optimization impacts based on the components we've implemented
    const optimizationData: OptimizationImpact[] = [
      {
        id: 'virtual-scrolling',
        name: 'Virtual Scrolling Implementation',
        category: 'rendering',
        description: 'Implemented react-window for transcript virtualization',
        beforeValue: 150,
        afterValue: 16,
        improvement: 134,
        improvementPercent: 89.3,
        unit: 'ms render time',
        status: 'measured',
        confidence: 95,
        implementationEffort: 'medium',
        businessImpact: 'high',
        tags: ['transcript', 'scrolling', 'virtualization'],
        measuredAt: Date.now() - 86400000 // 1 day ago
      },
      {
        id: 'lazy-loading',
        name: 'Lazy Loading for Meeting History',
        category: 'network',
        description: 'Implemented pagination and intersection observer for meeting list',
        beforeValue: 2.5,
        afterValue: 0.3,
        improvement: 2.2,
        improvementPercent: 88,
        unit: 's initial load time',
        status: 'measured',
        confidence: 92,
        implementationEffort: 'medium',
        businessImpact: 'high',
        tags: ['meetings', 'pagination', 'lazy-loading'],
        measuredAt: Date.now() - 86400000
      },
      {
        id: 'caching-strategy',
        name: 'Multi-level Caching System',
        category: 'caching',
        description: 'Implemented LRU/LFU cache with TTL and compression',
        beforeValue: 45,
        afterValue: 85,
        improvement: 40,
        improvementPercent: 88.9,
        unit: '% cache hit rate',
        status: 'measured',
        confidence: 90,
        implementationEffort: 'high',
        businessImpact: 'high',
        tags: ['cache', 'memory', 'api'],
        measuredAt: Date.now() - 86400000
      },
      {
        id: 'websocket-batching',
        name: 'WebSocket Message Batching',
        category: 'network',
        description: 'Implemented message queuing and batching for real-time updates',
        beforeValue: 250,
        afterValue: 45,
        improvement: 205,
        improvementPercent: 82,
        unit: 'messages/sec processed',
        status: 'measured',
        confidence: 88,
        implementationEffort: 'high',
        businessImpact: 'medium',
        tags: ['websocket', 'batching', 'real-time'],
        measuredAt: Date.now() - 86400000
      },
      {
        id: 'component-memoization',
        name: 'React Component Memoization',
        category: 'rendering',
        description: 'Applied React.memo and useMemo to reduce re-renders',
        beforeValue: 45,
        afterValue: 12,
        improvement: 33,
        improvementPercent: 73.3,
        unit: 'unnecessary re-renders/min',
        status: 'estimated',
        confidence: 80,
        implementationEffort: 'low',
        businessImpact: 'medium',
        tags: ['react', 'memoization', 're-renders'],
        measuredAt: Date.now() - 3600000
      },
      {
        id: 'bundle-splitting',
        name: 'Code Splitting and Bundle Optimization',
        category: 'bundling',
        description: 'Implement dynamic imports and chunk splitting',
        beforeValue: 1.2,
        afterValue: 0.4,
        improvement: 0.8,
        improvementPercent: 66.7,
        unit: 'MB initial bundle size',
        status: 'theoretical',
        confidence: 75,
        implementationEffort: 'medium',
        businessImpact: 'high',
        tags: ['bundling', 'code-splitting', 'loading'],
        measuredAt: Date.now()
      },
      {
        id: 'memory-leaks',
        name: 'Memory Leak Prevention',
        category: 'memory',
        description: 'Fixed event listener cleanup and component unmounting',
        beforeValue: 150,
        afterValue: 45,
        improvement: 105,
        improvementPercent: 70,
        unit: 'MB memory growth over 1 hour',
        status: 'estimated',
        confidence: 85,
        implementationEffort: 'low',
        businessImpact: 'medium',
        tags: ['memory', 'leaks', 'cleanup'],
        measuredAt: Date.now() - 7200000
      },
      {
        id: 'api-optimization',
        name: 'API Response Optimization',
        category: 'network',
        description: 'Implement GraphQL and reduce over-fetching',
        beforeValue: 850,
        afterValue: 320,
        improvement: 530,
        improvementPercent: 62.4,
        unit: 'KB average response size',
        status: 'theoretical',
        confidence: 70,
        implementationEffort: 'high',
        businessImpact: 'medium',
        tags: ['api', 'graphql', 'data-fetching'],
        measuredAt: Date.now()
      }
    ];

    setOptimizations(optimizationData);
  }, []);

  const initializeScenarios = useCallback(() => {
    const scenarioData: PerformanceScenario[] = [
      {
        id: 'quick-wins',
        name: 'Quick Performance Wins',
        description: 'Low-effort optimizations with immediate impact',
        optimizations: [],
        totalImprovement: 45,
        estimatedUserImpact: '2-3x faster perceived performance',
        implementation: {
          effort: 'low',
          timeline: '1-2 weeks',
          resources: ['1 frontend developer']
        }
      },
      {
        id: 'major-overhaul',
        name: 'Major Performance Overhaul',
        description: 'Comprehensive performance improvements',
        optimizations: [],
        totalImprovement: 78,
        estimatedUserImpact: '5-10x performance improvement',
        implementation: {
          effort: 'high',
          timeline: '2-3 months',
          resources: ['2-3 developers', 'DevOps engineer', 'Performance specialist']
        }
      },
      {
        id: 'mobile-optimization',
        name: 'Mobile Performance Focus',
        description: 'Optimizations specifically for mobile devices',
        optimizations: [],
        totalImprovement: 62,
        estimatedUserImpact: '3-5x better mobile experience',
        implementation: {
          effort: 'medium',
          timeline: '4-6 weeks',
          resources: ['2 frontend developers', 'Mobile UX specialist']
        }
      }
    ];

    setScenarios(scenarioData);
  }, []);

  const initializeTests = useCallback(() => {
    const testData: PerformanceTest[] = [
      {
        id: 'transcript-rendering',
        name: 'Transcript Rendering Performance',
        type: 'component',
        baseline: {
          renderTime: 150,
          memoryUsage: 85,
          bundleSize: 45,
          cacheHitRate: 45,
          networkRequests: 15
        },
        current: {
          renderTime: 16,
          memoryUsage: 65,
          bundleSize: 45,
          cacheHitRate: 85,
          networkRequests: 8
        },
        improvements: [],
        isRunning: false,
        lastRun: Date.now() - 3600000
      },
      {
        id: 'meeting-list-loading',
        name: 'Meeting List Loading',
        type: 'feature',
        baseline: {
          renderTime: 2500,
          memoryUsage: 120,
          bundleSize: 35,
          cacheHitRate: 30,
          networkRequests: 25
        },
        current: {
          renderTime: 300,
          memoryUsage: 95,
          bundleSize: 35,
          cacheHitRate: 75,
          networkRequests: 8
        },
        improvements: [],
        isRunning: false,
        lastRun: Date.now() - 1800000
      },
      {
        id: 'real-time-updates',
        name: 'Real-time Updates Performance',
        type: 'feature',
        baseline: {
          renderTime: 45,
          memoryUsage: 75,
          bundleSize: 25,
          cacheHitRate: 0,
          networkRequests: 250
        },
        current: {
          renderTime: 8,
          memoryUsage: 68,
          bundleSize: 25,
          cacheHitRate: 65,
          networkRequests: 45
        },
        improvements: [],
        isRunning: false,
        lastRun: Date.now() - 900000
      }
    ];

    setTests(testData);
  }, []);

  // Filtered optimizations
  const filteredOptimizations = useMemo(() => {
    return optimizations.filter(opt => {
      if (filter.category !== 'all' && opt.category !== filter.category) return false;
      if (filter.impact !== 'all' && opt.businessImpact !== filter.impact) return false;
      if (filter.effort !== 'all' && opt.implementationEffort !== filter.effort) return false;
      return true;
    });
  }, [optimizations, filter]);

  // Calculate overall statistics
  const overallStats = useMemo(() => {
    const totalOptimizations = optimizations.length;
    const implementedOptimizations = optimizations.filter(o => o.status === 'measured').length;
    const averageImprovement = optimizations.reduce((sum, o) => sum + o.improvementPercent, 0) / totalOptimizations;
    const totalImpact = optimizations.reduce((sum, o) => sum + (o.status === 'measured' ? o.improvement : 0), 0);

    return {
      totalOptimizations,
      implementedOptimizations,
      averageImprovement,
      totalImpact,
      implementationRate: (implementedOptimizations / totalOptimizations) * 100
    };
  }, [optimizations]);

  // Run performance tests
  const runPerformanceTests = useCallback(async () => {
    setIsRunningTests(true);

    try {
      // Simulate running performance tests
      for (const test of tests) {
        test.isRunning = true;
        setTests(prevTests => [...prevTests]);

        // Simulate test execution time
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Update test results with small variations
        test.current = {
          renderTime: test.current.renderTime + (Math.random() - 0.5) * 5,
          memoryUsage: test.current.memoryUsage + (Math.random() - 0.5) * 10,
          bundleSize: test.current.bundleSize,
          cacheHitRate: Math.min(100, test.current.cacheHitRate + Math.random() * 5),
          networkRequests: Math.max(1, test.current.networkRequests + (Math.random() - 0.5) * 2)
        };

        test.isRunning = false;
        test.lastRun = Date.now();
        setTests(prevTests => [...prevTests]);
      }
    } finally {
      setIsRunningTests(false);
    }
  }, [tests]);

  // Render optimization card
  const renderOptimizationCard = (optimization: OptimizationImpact) => {
    const getStatusColor = (status: string) => {
      switch (status) {
        case 'measured': return 'text-green-600 bg-green-50 border-green-200';
        case 'estimated': return 'text-yellow-600 bg-yellow-50 border-yellow-200';
        case 'theoretical': return 'text-blue-600 bg-blue-50 border-blue-200';
        default: return 'text-gray-600 bg-gray-50 border-gray-200';
      }
    };

    const getImpactIcon = (improvement: number) => {
      if (improvement > 50) return <ArrowUp className="text-green-500" size={20} />;
      if (improvement > 20) return <ArrowRight className="text-yellow-500" size={20} />;
      return <ArrowDown className="text-gray-500" size={20} />;
    };

    const getCategoryIcon = (category: string) => {
      switch (category) {
        case 'rendering': return <Zap className="text-blue-500" size={16} />;
        case 'memory': return <HardDrive className="text-purple-500" size={16} />;
        case 'network': return <Wifi className="text-green-500" size={16} />;
        case 'caching': return <Target className="text-orange-500" size={16} />;
        case 'bundling': return <Download className="text-red-500" size={16} />;
        default: return <Activity className="text-gray-500" size={16} />;
      }
    };

    return (
      <div
        key={optimization.id}
        className={`optimization-card p-4 rounded-lg border cursor-pointer transition-all hover:shadow-md ${
          selectedOptimization?.id === optimization.id ? 'ring-2 ring-blue-500' : ''
        } ${getStatusColor(optimization.status)}`}
        onClick={() => {
          setSelectedOptimization(optimization);
          onOptimizationSelect?.(optimization);
        }}
      >
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            {getCategoryIcon(optimization.category)}
            <h3 className="font-semibold text-sm">{optimization.name}</h3>
          </div>
          <div className="flex items-center gap-2">
            {getImpactIcon(optimization.improvementPercent)}
            <span className="text-lg font-bold text-green-600">
              {optimization.improvementPercent.toFixed(1)}%
            </span>
          </div>
        </div>

        <p className="text-sm text-gray-600 mb-3">{optimization.description}</p>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <span className="text-gray-500">Before:</span>
            <span className="font-medium ml-1">
              {optimization.beforeValue.toLocaleString()} {optimization.unit.split(' ')[0]}
            </span>
          </div>
          <div>
            <span className="text-gray-500">After:</span>
            <span className="font-medium ml-1">
              {optimization.afterValue.toLocaleString()} {optimization.unit.split(' ')[0]}
            </span>
          </div>
        </div>

        <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-200">
          <div className="flex gap-2">
            <span className={`px-2 py-1 text-xs rounded ${
              optimization.implementationEffort === 'low' ? 'bg-green-100 text-green-700' :
              optimization.implementationEffort === 'medium' ? 'bg-yellow-100 text-yellow-700' :
              'bg-red-100 text-red-700'
            }`}>
              {optimization.implementationEffort} effort
            </span>
            <span className={`px-2 py-1 text-xs rounded ${
              optimization.businessImpact === 'high' ? 'bg-blue-100 text-blue-700' :
              optimization.businessImpact === 'medium' ? 'bg-purple-100 text-purple-700' :
              'bg-gray-100 text-gray-700'
            }`}>
              {optimization.businessImpact} impact
            </span>
          </div>
          <span className="text-xs text-gray-500">
            {optimization.confidence}% confidence
          </span>
        </div>
      </div>
    );
  };

  // Render performance test
  const renderPerformanceTest = (test: PerformanceTest) => {
    const calculateImprovement = (baseline: number, current: number) => {
      return ((baseline - current) / baseline) * 100;
    };

    return (
      <div key={test.id} className="test-card p-4 bg-white rounded-lg border">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-semibold">{test.name}</h3>
            <p className="text-sm text-gray-600 capitalize">{test.type} performance test</p>
          </div>
          <div className="flex items-center gap-2">
            {test.isRunning ? (
              <div className="flex items-center gap-2 text-blue-600">
                <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                <span className="text-sm">Running...</span>
              </div>
            ) : (
              <span className="text-xs text-gray-500">
                Last run: {new Date(test.lastRun).toLocaleTimeString()}
              </span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="metric">
            <div className="flex items-center gap-1 mb-1">
              <Clock size={14} className="text-gray-500" />
              <span className="text-xs text-gray-600">Render Time</span>
            </div>
            <div className="text-lg font-bold">{test.current.renderTime.toFixed(1)}ms</div>
            <div className={`text-xs ${calculateImprovement(test.baseline.renderTime, test.current.renderTime) > 0 ? 'text-green-600' : 'text-red-600'}`}>
              {calculateImprovement(test.baseline.renderTime, test.current.renderTime).toFixed(1)}% improvement
            </div>
          </div>

          <div className="metric">
            <div className="flex items-center gap-1 mb-1">
              <HardDrive size={14} className="text-gray-500" />
              <span className="text-xs text-gray-600">Memory</span>
            </div>
            <div className="text-lg font-bold">{test.current.memoryUsage.toFixed(1)}MB</div>
            <div className={`text-xs ${calculateImprovement(test.baseline.memoryUsage, test.current.memoryUsage) > 0 ? 'text-green-600' : 'text-red-600'}`}>
              {calculateImprovement(test.baseline.memoryUsage, test.current.memoryUsage).toFixed(1)}% improvement
            </div>
          </div>

          <div className="metric">
            <div className="flex items-center gap-1 mb-1">
              <Target size={14} className="text-gray-500" />
              <span className="text-xs text-gray-600">Cache Hit</span>
            </div>
            <div className="text-lg font-bold">{test.current.cacheHitRate.toFixed(1)}%</div>
            <div className={`text-xs ${test.current.cacheHitRate > test.baseline.cacheHitRate ? 'text-green-600' : 'text-red-600'}`}>
              +{(test.current.cacheHitRate - test.baseline.cacheHitRate).toFixed(1)}% vs baseline
            </div>
          </div>

          <div className="metric">
            <div className="flex items-center gap-1 mb-1">
              <Wifi size={14} className="text-gray-500" />
              <span className="text-xs text-gray-600">Requests</span>
            </div>
            <div className="text-lg font-bold">{Math.round(test.current.networkRequests)}</div>
            <div className={`text-xs ${calculateImprovement(test.baseline.networkRequests, test.current.networkRequests) > 0 ? 'text-green-600' : 'text-red-600'}`}>
              {calculateImprovement(test.baseline.networkRequests, test.current.networkRequests).toFixed(1)}% improvement
            </div>
          </div>

          <div className="metric">
            <div className="flex items-center gap-1 mb-1">
              <Gauge size={14} className="text-gray-500" />
              <span className="text-xs text-gray-600">Overall</span>
            </div>
            <div className="text-lg font-bold text-green-600">
              {(
                (calculateImprovement(test.baseline.renderTime, test.current.renderTime) +
                 calculateImprovement(test.baseline.memoryUsage, test.current.memoryUsage) +
                 calculateImprovement(test.baseline.networkRequests, test.current.networkRequests)) / 3
              ).toFixed(1)}%
            </div>
            <div className="text-xs text-gray-600">avg improvement</div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className={`performance-clinic ${className}`}>
      {/* Header */}
      <div className="header p-6 bg-gradient-to-r from-blue-600 to-purple-600 text-white">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold mb-2">Performance Clinic</h1>
            <p className="text-blue-100">
              Track optimization impacts and discover performance opportunities
            </p>
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold">{overallStats.averageImprovement.toFixed(1)}%</div>
            <div className="text-sm text-blue-100">Average Improvement</div>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
          <div className="stat-card bg-white/10 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1">
              <Target size={16} />
              <span className="text-sm">Optimizations</span>
            </div>
            <div className="text-xl font-bold">{overallStats.implementedOptimizations}/{overallStats.totalOptimizations}</div>
            <div className="text-xs text-blue-100">implemented</div>
          </div>
          
          <div className="stat-card bg-white/10 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp size={16} />
              <span className="text-sm">Performance</span>
            </div>
            <div className="text-xl font-bold">{overallStats.implementationRate.toFixed(1)}%</div>
            <div className="text-xs text-blue-100">completion rate</div>
          </div>

          <div className="stat-card bg-white/10 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1">
              <Users size={16} />
              <span className="text-sm">User Impact</span>
            </div>
            <div className="text-xl font-bold">High</div>
            <div className="text-xs text-blue-100">business value</div>
          </div>

          <div className="stat-card bg-white/10 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1">
              <Lightbulb size={16} />
              <span className="text-sm">ROI</span>
            </div>
            <div className="text-xl font-bold">8.5x</div>
            <div className="text-xs text-blue-100">estimated return</div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="nav p-4 bg-white border-b">
        <div className="flex items-center justify-between">
          <div className="flex space-x-1">
            {[
              { key: 'overview', label: 'Overview', icon: BarChart3 },
              { key: 'impacts', label: 'Impacts', icon: TrendingUp },
              { key: 'scenarios', label: 'Scenarios', icon: Target },
              { key: 'tests', label: 'Tests', icon: PlayCircle }
            ].map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key as any)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                  activeTab === tab.key
                    ? 'bg-blue-100 text-blue-700'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                <tab.icon size={16} />
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-4">
            {activeTab === 'tests' && (
              <button
                onClick={runPerformanceTests}
                disabled={isRunningTests}
                className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50"
              >
                {isRunningTests ? <StopCircle size={16} /> : <PlayCircle size={16} />}
                {isRunningTests ? 'Running...' : 'Run Tests'}
              </button>
            )}

            {activeTab === 'impacts' && (
              <div className="flex items-center gap-2">
                <select
                  value={filter.category}
                  onChange={(e) => setFilter(f => ({ ...f, category: e.target.value }))}
                  className="px-3 py-2 border rounded-lg text-sm"
                >
                  <option value="all">All Categories</option>
                  <option value="rendering">Rendering</option>
                  <option value="memory">Memory</option>
                  <option value="network">Network</option>
                  <option value="caching">Caching</option>
                  <option value="bundling">Bundling</option>
                </select>

                <select
                  value={filter.impact}
                  onChange={(e) => setFilter(f => ({ ...f, impact: e.target.value }))}
                  className="px-3 py-2 border rounded-lg text-sm"
                >
                  <option value="all">All Impact</option>
                  <option value="high">High Impact</option>
                  <option value="medium">Medium Impact</option>
                  <option value="low">Low Impact</option>
                </select>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="content p-6">
        {activeTab === 'overview' && (
          <div className="overview space-y-6">
            {/* Performance Summary Chart */}
            <div className="bg-white rounded-lg border p-6">
              <h2 className="text-lg font-semibold mb-4">Performance Improvement Timeline</h2>
              <div className="h-64 flex items-end justify-center space-x-2">
                {optimizations.filter(o => o.status === 'measured').map((opt, index) => (
                  <div key={opt.id} className="flex flex-col items-center">
                    <div
                      className="bg-blue-500 rounded-t"
                      style={{
                        height: `${(opt.improvementPercent / 100) * 200}px`,
                        width: '40px'
                      }}
                    ></div>
                    <div className="text-xs text-gray-600 mt-2 text-center max-w-16 truncate">
                      {opt.name.split(' ')[0]}
                    </div>
                    <div className="text-xs font-bold text-blue-600">
                      {opt.improvementPercent.toFixed(0)}%
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Top Optimizations */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white rounded-lg border p-6">
                <h3 className="text-lg font-semibold mb-4">Biggest Wins</h3>
                <div className="space-y-3">
                  {optimizations
                    .filter(o => o.status === 'measured')
                    .sort((a, b) => b.improvementPercent - a.improvementPercent)
                    .slice(0, 3)
                    .map(opt => (
                      <div key={opt.id} className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                        <div>
                          <div className="font-medium text-sm">{opt.name}</div>
                          <div className="text-xs text-gray-600">{opt.description}</div>
                        </div>
                        <div className="text-right">
                          <div className="font-bold text-green-600">{opt.improvementPercent.toFixed(1)}%</div>
                          <div className="text-xs text-gray-500">improvement</div>
                        </div>
                      </div>
                    ))}
                </div>
              </div>

              <div className="bg-white rounded-lg border p-6">
                <h3 className="text-lg font-semibold mb-4">Next Opportunities</h3>
                <div className="space-y-3">
                  {optimizations
                    .filter(o => o.status !== 'measured')
                    .sort((a, b) => b.improvementPercent - a.improvementPercent)
                    .slice(0, 3)
                    .map(opt => (
                      <div key={opt.id} className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
                        <div>
                          <div className="font-medium text-sm">{opt.name}</div>
                          <div className="text-xs text-gray-600">{opt.implementationEffort} effort</div>
                        </div>
                        <div className="text-right">
                          <div className="font-bold text-blue-600">{opt.improvementPercent.toFixed(1)}%</div>
                          <div className="text-xs text-gray-500">potential</div>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'impacts' && (
          <div className="impacts">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredOptimizations.map(renderOptimizationCard)}
            </div>
            
            {filteredOptimizations.length === 0 && (
              <div className="text-center py-12 text-gray-500">
                <Filter size={48} className="mx-auto mb-4 text-gray-300" />
                <p>No optimizations match your current filters</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'scenarios' && (
          <div className="scenarios space-y-6">
            {scenarios.map(scenario => (
              <div key={scenario.id} className="bg-white rounded-lg border p-6">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-semibold">{scenario.name}</h3>
                    <p className="text-gray-600">{scenario.description}</p>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-green-600">{scenario.totalImprovement}%</div>
                    <div className="text-sm text-gray-500">estimated improvement</div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <h4 className="font-medium text-sm">User Impact</h4>
                    <p className="text-sm text-gray-600">{scenario.estimatedUserImpact}</p>
                  </div>
                  
                  <div className="space-y-2">
                    <h4 className="font-medium text-sm">Implementation</h4>
                    <div className="text-sm text-gray-600">
                      <div>Effort: <span className="capitalize">{scenario.implementation.effort}</span></div>
                      <div>Timeline: {scenario.implementation.timeline}</div>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <h4 className="font-medium text-sm">Resources Needed</h4>
                    <div className="text-sm text-gray-600">
                      {scenario.implementation.resources.map((resource, i) => (
                        <div key={i}>• {resource}</div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'tests' && (
          <div className="tests space-y-4">
            {tests.map(renderPerformanceTest)}
          </div>
        )}
      </div>

      {/* Selected Optimization Details */}
      {selectedOptimization && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h2 className="text-xl font-bold">{selectedOptimization.name}</h2>
                  <p className="text-gray-600">{selectedOptimization.description}</p>
                </div>
                <button
                  onClick={() => setSelectedOptimization(null)}
                  className="text-gray-500 hover:text-gray-700"
                >
                  ✕
                </button>
              </div>

              <div className="grid grid-cols-2 gap-6 mb-6">
                <div className="space-y-4">
                  <div>
                    <h4 className="font-medium mb-2">Performance Impact</h4>
                    <div className="bg-green-50 p-4 rounded-lg">
                      <div className="text-2xl font-bold text-green-600">
                        {selectedOptimization.improvementPercent.toFixed(1)}%
                      </div>
                      <div className="text-sm text-gray-600">improvement</div>
                    </div>
                  </div>

                  <div>
                    <h4 className="font-medium mb-2">Implementation Details</h4>
                    <div className="space-y-2 text-sm">
                      <div>Effort: <span className="capitalize">{selectedOptimization.implementationEffort}</span></div>
                      <div>Business Impact: <span className="capitalize">{selectedOptimization.businessImpact}</span></div>
                      <div>Confidence: {selectedOptimization.confidence}%</div>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <h4 className="font-medium mb-2">Before vs After</h4>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Before:</span>
                        <span className="font-medium">{selectedOptimization.beforeValue.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">After:</span>
                        <span className="font-medium text-green-600">{selectedOptimization.afterValue.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between border-t pt-2">
                        <span className="text-gray-600">Improvement:</span>
                        <span className="font-bold text-green-600">
                          {selectedOptimization.improvement.toLocaleString()} {selectedOptimization.unit}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h4 className="font-medium mb-2">Tags</h4>
                    <div className="flex flex-wrap gap-2">
                      {selectedOptimization.tags.map((tag, i) => (
                        <span key={i} className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setSelectedOptimization(null)}
                  className="px-4 py-2 text-gray-600 border rounded-lg hover:bg-gray-50"
                >
                  Close
                </button>
                <button className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600">
                  View Implementation
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};