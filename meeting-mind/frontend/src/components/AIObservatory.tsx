// AI Observatory Dashboard Component
// Comprehensive visualization for AI orchestration system performance
// Shows metrics, costs, A/B test results, and real-time monitoring

import React, { useState, useEffect, useCallback } from 'react';
import { 
  LineChart, Line, AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';

interface ModelMetrics {
  model_name: string;
  total_requests: number;
  successful_requests: number;
  failed_requests: number;
  total_tokens: number;
  total_cost_cents: number;
  average_latency_ms: number;
  average_quality_score: number;
  cache_hits: number;
  cache_misses: number;
  error_rate: number;
  throughput_rpm: number;
  p95_latency_ms: number;
  p99_latency_ms: number;
  last_updated: string;
}

interface ABTestResult {
  experiment_id: string;
  experiment_name: string;
  status: string;
  variants: Array<{
    name: string;
    model: string;
    sample_size: number;
    metrics: {
      latency: number;
      cost: number;
      quality: number;
      error_rate: number;
    };
  }>;
  winner?: string;
  confidence_level: number;
  completion_percentage: number;
}

interface OrchestrationMetrics {
  total_requests: number;
  total_cost_cents: number;
  average_latency_ms: number;
  overall_error_rate: number;
  cache_hit_rate: number;
  models: Record<string, ModelMetrics>;
  complexity_distribution: Record<string, number>;
  routing_strategy_usage: Record<string, number>;
  timestamp: string;
}

export const AIObservatory: React.FC = () => {
  const [metrics, setMetrics] = useState<OrchestrationMetrics | null>(null);
  const [abTests, setABTests] = useState<ABTestResult[]>([]);
  const [activeTab, setActiveTab] = useState<'overview' | 'models' | 'costs' | 'abtests' | 'performance'>('overview');
  const [timeRange, setTimeRange] = useState('24h');
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  // Fetch orchestration metrics
  const fetchMetrics = useCallback(async () => {
    try {
      setIsLoading(true);
      
      // Fetch orchestration metrics
      const metricsResponse = await fetch('/api/orchestration/metrics');
      if (metricsResponse.ok) {
        const metricsData = await metricsResponse.json();
        setMetrics(metricsData);
      }

      // Fetch A/B test results
      const abTestResponse = await fetch('/api/ab-testing/experiments');
      if (abTestResponse.ok) {
        const abTestData = await abTestResponse.json();
        setABTests(abTestData);
      }

      setLastUpdate(new Date());
    } catch (error) {
      console.error('Failed to fetch AI Observatory data:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    fetchMetrics();
    const interval = setInterval(fetchMetrics, 30000);
    return () => clearInterval(interval);
  }, [fetchMetrics]);

  // Generate sample data for demonstration
  useEffect(() => {
    if (!metrics) {
      const sampleMetrics: OrchestrationMetrics = {
        total_requests: 15420,
        total_cost_cents: 1247.56,
        average_latency_ms: 342.1,
        overall_error_rate: 2.3,
        cache_hit_rate: 67.8,
        models: {
          'claude-3-5-sonnet-20241022': {
            model_name: 'claude-3-5-sonnet-20241022',
            total_requests: 8740,
            successful_requests: 8521,
            failed_requests: 219,
            total_tokens: 2847392,
            total_cost_cents: 856.47,
            average_latency_ms: 425.3,
            average_quality_score: 4.7,
            cache_hits: 2341,
            cache_misses: 6180,
            error_rate: 2.5,
            throughput_rpm: 42.3,
            p95_latency_ms: 782.1,
            p99_latency_ms: 1203.5,
            last_updated: new Date().toISOString()
          },
          'claude-3-haiku-20240307': {
            model_name: 'claude-3-haiku-20240307',
            total_requests: 4620,
            successful_requests: 4531,
            failed_requests: 89,
            total_tokens: 892847,
            total_cost_cents: 234.78,
            average_latency_ms: 187.9,
            average_quality_score: 4.2,
            cache_hits: 1523,
            cache_misses: 2998,
            error_rate: 1.9,
            throughput_rpm: 67.8,
            p95_latency_ms: 324.7,
            p99_latency_ms: 456.2,
            last_updated: new Date().toISOString()
          },
          'gpt-4o-mini': {
            model_name: 'gpt-4o-mini',
            total_requests: 2060,
            successful_requests: 2012,
            failed_requests: 48,
            total_tokens: 547231,
            total_cost_cents: 156.31,
            average_latency_ms: 298.4,
            average_quality_score: 4.1,
            cache_hits: 687,
            cache_misses: 1325,
            error_rate: 2.3,
            throughput_rpm: 28.9,
            p95_latency_ms: 523.8,
            p99_latency_ms: 698.1,
            last_updated: new Date().toISOString()
          }
        },
        complexity_distribution: {
          simple: 6420,
          moderate: 5830,
          complex: 2670,
          critical: 500
        },
        routing_strategy_usage: {
          complexity_based: 11200,
          cost_optimized: 2340,
          performance_optimized: 1560,
          ab_test: 320
        },
        timestamp: new Date().toISOString()
      };

      const sampleABTests: ABTestResult[] = [
        {
          experiment_id: 'exp_001',
          experiment_name: 'Claude vs GPT-4 for Meeting Summaries',
          status: 'running',
          variants: [
            {
              name: 'Control (Claude Sonnet)',
              model: 'claude-3-5-sonnet-20241022',
              sample_size: 1247,
              metrics: {
                latency: 425.3,
                cost: 0.0234,
                quality: 4.7,
                error_rate: 2.1
              }
            },
            {
              name: 'Test (GPT-4)',
              model: 'gpt-4o',
              sample_size: 1198,
              metrics: {
                latency: 567.8,
                cost: 0.0487,
                quality: 4.5,
                error_rate: 3.2
              }
            }
          ],
          confidence_level: 87.3,
          completion_percentage: 78.5
        },
        {
          experiment_id: 'exp_002',
          experiment_name: 'Cost Optimization: Haiku vs Sonnet',
          status: 'completed',
          variants: [
            {
              name: 'Control (Sonnet)',
              model: 'claude-3-5-sonnet-20241022',
              sample_size: 2500,
              metrics: {
                latency: 425.3,
                cost: 0.0234,
                quality: 4.7,
                error_rate: 2.1
              }
            },
            {
              name: 'Test (Haiku)',
              model: 'claude-3-haiku-20240307',
              sample_size: 2500,
              metrics: {
                latency: 187.9,
                cost: 0.0089,
                quality: 4.2,
                error_rate: 1.9
              }
            }
          ],
          winner: 'Test (Haiku)',
          confidence_level: 95.7,
          completion_percentage: 100
        }
      ];

      setMetrics(sampleMetrics);
      setABTests(sampleABTests);
      setIsLoading(false);
    }
  }, [metrics]);

  const formatCost = (cents: number) => `$${(cents / 100).toFixed(3)}`;
  const formatNumber = (num: number) => num.toLocaleString();

  // Prepare chart data
  const modelComparisonData = metrics ? Object.values(metrics.models).map(model => ({
    name: model.model_name.split('-').slice(-1)[0],
    requests: model.total_requests,
    latency: model.average_latency_ms,
    cost: model.total_cost_cents / 100,
    quality: model.average_quality_score,
    errorRate: model.error_rate
  })) : [];

  const complexityData = metrics ? Object.entries(metrics.complexity_distribution).map(([key, value]) => ({
    name: key.charAt(0).toUpperCase() + key.slice(1),
    value: value,
    percentage: (value / metrics.total_requests * 100).toFixed(1)
  })) : [];

  const routingData = metrics ? Object.entries(metrics.routing_strategy_usage).map(([key, value]) => ({
    name: key.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase()),
    value: value
  })) : [];

  const COLORS = ['#8884d8', '#82ca9d', '#ffc658', '#ff7300', '#00ff88'];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="text-gray-600 mt-2">Loading AI Observatory...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-gray-900">AI Observatory</h2>
            <p className="text-gray-600 mt-1">
              Comprehensive monitoring dashboard for AI orchestration system
            </p>
          </div>
          
          <div className="flex items-center space-x-4">
            <div className="text-right">
              <div className="text-sm text-gray-500">Last updated</div>
              <div className="text-sm font-medium">
                {lastUpdate.toLocaleTimeString()}
              </div>
            </div>
            
            <select
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value)}
              className="border border-gray-300 rounded px-3 py-1 text-sm"
            >
              <option value="1h">Last Hour</option>
              <option value="24h">Last 24 Hours</option>
              <option value="7d">Last 7 Days</option>
              <option value="30d">Last 30 Days</option>
            </select>
            
            <button
              onClick={fetchMetrics}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
            >
              Refresh
            </button>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      {metrics && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="bg-white p-4 rounded-lg border border-gray-200">
            <div className="text-2xl font-bold text-blue-600">
              {formatNumber(metrics.total_requests)}
            </div>
            <div className="text-sm text-gray-600">Total Requests</div>
          </div>
          
          <div className="bg-white p-4 rounded-lg border border-gray-200">
            <div className="text-2xl font-bold text-green-600">
              {formatCost(metrics.total_cost_cents)}
            </div>
            <div className="text-sm text-gray-600">Total Cost</div>
          </div>
          
          <div className="bg-white p-4 rounded-lg border border-gray-200">
            <div className="text-2xl font-bold text-orange-600">
              {metrics.average_latency_ms.toFixed(0)}ms
            </div>
            <div className="text-sm text-gray-600">Avg. Latency</div>
          </div>
          
          <div className="bg-white p-4 rounded-lg border border-gray-200">
            <div className="text-2xl font-bold text-purple-600">
              {metrics.cache_hit_rate.toFixed(1)}%
            </div>
            <div className="text-sm text-gray-600">Cache Hit Rate</div>
          </div>
          
          <div className="bg-white p-4 rounded-lg border border-gray-200">
            <div className="text-2xl font-bold text-red-600">
              {metrics.overall_error_rate.toFixed(1)}%
            </div>
            <div className="text-sm text-gray-600">Error Rate</div>
          </div>
        </div>
      )}

      {/* Tab Navigation */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          {[
            { id: 'overview', label: '📊 Overview', icon: '📊' },
            { id: 'models', label: '🤖 Model Performance', icon: '🤖' },
            { id: 'costs', label: '💰 Cost Analysis', icon: '💰' },
            { id: 'abtests', label: '🧪 A/B Tests', icon: '🧪' },
            { id: 'performance', label: '⚡ Performance', icon: '⚡' }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Task Complexity Distribution */}
          <div className="bg-white p-6 rounded-lg border border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Task Complexity Distribution</h3>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={complexityData}
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                  label={({ name, percentage }) => `${name}: ${percentage}%`}
                >
                  {complexityData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Routing Strategy Usage */}
          <div className="bg-white p-6 rounded-lg border border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Routing Strategy Usage</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={routingData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="value" fill="#8884d8" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {activeTab === 'models' && (
        <div className="space-y-6">
          {/* Model Comparison Chart */}
          <div className="bg-white p-6 rounded-lg border border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Model Performance Comparison</h3>
            <ResponsiveContainer width="100%" height={400}>
              <BarChart data={modelComparisonData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis yAxisId="left" />
                <YAxis yAxisId="right" orientation="right" />
                <Tooltip />
                <Legend />
                <Bar yAxisId="left" dataKey="requests" fill="#8884d8" name="Requests" />
                <Bar yAxisId="right" dataKey="latency" fill="#82ca9d" name="Latency (ms)" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Model Details Table */}
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">Detailed Model Metrics</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Model</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Requests</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Success Rate</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Avg Latency</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total Cost</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Quality Score</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {metrics && Object.values(metrics.models).map((model) => (
                    <tr key={model.model_name}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {model.model_name.split('-').slice(-1)[0]}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {formatNumber(model.total_requests)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {((model.successful_requests / model.total_requests) * 100).toFixed(1)}%
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {model.average_latency_ms.toFixed(0)}ms
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {formatCost(model.total_cost_cents)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {model.average_quality_score.toFixed(1)}/5.0
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'abtests' && (
        <div className="space-y-6">
          {abTests.map((test) => (
            <div key={test.experiment_id} className="bg-white rounded-lg border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">{test.experiment_name}</h3>
                  <div className="flex items-center space-x-4 mt-1">
                    <span className={`px-2 py-1 text-xs rounded-full ${
                      test.status === 'running' ? 'bg-yellow-100 text-yellow-800' :
                      test.status === 'completed' ? 'bg-green-100 text-green-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {test.status.charAt(0).toUpperCase() + test.status.slice(1)}
                    </span>
                    <span className="text-sm text-gray-600">
                      {test.completion_percentage.toFixed(1)}% complete
                    </span>
                    {test.winner && (
                      <span className="text-sm text-green-600 font-medium">
                        Winner: {test.winner}
                      </span>
                    )}
                  </div>
                </div>
                
                <div className="text-right">
                  <div className="text-lg font-semibold text-blue-600">
                    {test.confidence_level.toFixed(1)}%
                  </div>
                  <div className="text-sm text-gray-600">Confidence</div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {test.variants.map((variant, index) => (
                  <div key={variant.name} className={`p-4 rounded border-2 ${
                    test.winner === variant.name ? 'border-green-300 bg-green-50' : 'border-gray-200'
                  }`}>
                    <h4 className="font-semibold text-gray-900 mb-2">{variant.name}</h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span>Sample Size:</span>
                        <span className="font-mono">{formatNumber(variant.sample_size)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Avg. Latency:</span>
                        <span className="font-mono">{variant.metrics.latency.toFixed(0)}ms</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Avg. Cost:</span>
                        <span className="font-mono">${variant.metrics.cost.toFixed(4)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Quality Score:</span>
                        <span className="font-mono">{variant.metrics.quality.toFixed(1)}/5.0</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Error Rate:</span>
                        <span className="font-mono">{variant.metrics.error_rate.toFixed(1)}%</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Info Panel */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h4 className="font-semibold text-blue-900 mb-2">🏢 AI Observatory Features:</h4>
        <ul className="text-blue-800 text-sm space-y-1">
          <li>• Real-time monitoring of all AI models and orchestration metrics</li>
          <li>• Comprehensive cost analysis and optimization recommendations</li>
          <li>• A/B testing results with statistical significance analysis</li>
          <li>• Performance benchmarking and quality scoring</li>
          <li>• Task complexity distribution and routing strategy analytics</li>
          <li>• Historical trends and predictive cost modeling</li>
        </ul>
      </div>
    </div>
  );
};