/**
 * Network Diagnostics Component
 * Comprehensive network testing and troubleshooting interface
 */

import React, { useState, useEffect } from 'react';

interface PingResult {
  host: string;
  packets_sent: number;
  packets_received: number;
  packet_loss_percent: number;
  min_latency_ms: number;
  max_latency_ms: number;
  avg_latency_ms: number;
  std_deviation_ms: number;
  success: boolean;
  error_message?: string;
}

interface PortResult {
  host: string;
  port: number;
  protocol: string;
  is_open: boolean;
  response_time_ms: number;
  error_message?: string;
}

interface BandwidthResult {
  download_mbps: number;
  upload_mbps: number;
  latency_ms: number;
  jitter_ms: number;
  packet_loss_percent: number;
  test_duration_seconds: number;
  success: boolean;
  error_message?: string;
}

interface NetworkInterface {
  name: string;
  type: string;
  is_up: boolean;
  ip_addresses: string[];
  mac_address: string;
  mtu: number;
  speed_mbps?: number;
  duplex?: string;
  statistics: Record<string, number>;
}

interface TestResult {
  test_id?: string;
  status: string;
  result?: { latency?: number; bandwidth?: number; jitter?: number; packetLoss?: number; [key: string]: unknown };
  error?: string;
  progress?: number;
}

interface StreamingTestResult {
  streaming_servers: Array<{
    server: string;
    latency_ms: number;
    packet_loss: number;
    success: boolean;
  }>;
  rtmp_server: {
    accessible: boolean;
    response_time_ms: number;
  };
  srt_server: {
    accessible: boolean;
    response_time_ms: number;
  };
  bandwidth: {
    download_mbps: number;
    upload_mbps: number;
    suitable_for_streaming: boolean;
  };
  quality_assessment: {
    score: number;
    avg_latency_ms: number;
    issues: string[];
    recommendations: string[];
  };
}

export const NetworkDiagnostics: React.FC = () => {
  const [activeTab, setActiveTab] = useState<string>('overview');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Test results
  const [pingResult, setPingResult] = useState<PingResult | null>(null);
  const [portResults, setPortResults] = useState<PortResult[]>([]);
  const [bandwidthResult, setBandwidthResult] = useState<BandwidthResult | null>(null);
  const [interfaces, setInterfaces] = useState<NetworkInterface[]>([]);
  const [comprehensiveTest, setComprehensiveTest] = useState<TestResult | null>(null);
  const [streamingTest, setStreamingTest] = useState<StreamingTestResult | null>(null);
  
  // Form data
  const [pingHost, setPingHost] = useState('google.com');
  const [portHost, setPortHost] = useState('google.com');
  const [portNumber, setPortNumber] = useState(80);
  const [portProtocol, setPortProtocol] = useState('tcp');
  const [bandwidthDuration, setBandwidthDuration] = useState(10);

  useEffect(() => {
    loadNetworkInterfaces();
  }, []);

  const loadNetworkInterfaces = async () => {
    try {
      const response = await fetch('/api/network-diagnostics/interfaces');
      const data = await response.json();
      
      if (data.success) {
        setInterfaces(data.data.interfaces);
      }
    } catch (err) {
      console.error('Error loading network interfaces:', err);
    }
  };

  const runQuickTest = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/network-diagnostics/quick-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ host: pingHost })
      });
      
      const data = await response.json();
      
      if (data.success) {
        setPingResult(data.data.test_result.ping);
      } else {
        setError(data.message);
      }
    } catch (err) {
      setError(`Quick test failed: ${err}`);
    } finally {
      setIsLoading(false);
    }
  };

  const runPingTest = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/network-diagnostics/ping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          host: pingHost,
          count: 10,
          timeout: 5
        })
      });
      
      const data = await response.json();
      
      if (data.success) {
        setPingResult(data.data.ping_result);
      } else {
        setError(data.message);
      }
    } catch (err) {
      setError(`Ping test failed: ${err}`);
    } finally {
      setIsLoading(false);
    }
  };

  const runPortTest = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/network-diagnostics/port-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          host: portHost,
          port: portNumber,
          protocol: portProtocol,
          timeout: 5
        })
      });
      
      const data = await response.json();
      
      if (data.success) {
        setPortResults([data.data.port_result]);
      } else {
        setError(data.message);
      }
    } catch (err) {
      setError(`Port test failed: ${err}`);
    } finally {
      setIsLoading(false);
    }
  };

  const runCommonPortsTest = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`/api/network-diagnostics/common-ports?host=${encodeURIComponent(portHost)}`);
      const data = await response.json();
      
      if (data.success) {
        setPortResults(data.data.port_results);
      } else {
        setError(data.message);
      }
    } catch (err) {
      setError(`Common ports test failed: ${err}`);
    } finally {
      setIsLoading(false);
    }
  };

  const runBandwidthTest = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/network-diagnostics/bandwidth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ duration_seconds: bandwidthDuration })
      });
      
      const data = await response.json();
      
      if (data.success) {
        setBandwidthResult(data.data.bandwidth_result);
      } else {
        setError(data.message);
      }
    } catch (err) {
      setError(`Bandwidth test failed: ${err}`);
    } finally {
      setIsLoading(false);
    }
  };

  const runStreamingTest = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/network-diagnostics/streaming-specific-test');
      const data = await response.json();
      
      if (data.success) {
        setStreamingTest(data.data);
      } else {
        setError(data.message);
      }
    } catch (err) {
      setError(`Streaming test failed: ${err}`);
    } finally {
      setIsLoading(false);
    }
  };

  const runComprehensiveTest = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/network-diagnostics/comprehensive-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_host: pingHost })
      });
      
      const data = await response.json();
      
      if (data.success) {
        const testId = data.data.test_id;
        setComprehensiveTest({ test_id: testId, status: 'running' });
        
        // Poll for results
        pollComprehensiveTest(testId);
      } else {
        setError(data.message);
      }
    } catch (err) {
      setError(`Failed to start comprehensive test: ${err}`);
      setIsLoading(false);
    }
  };

  const pollComprehensiveTest = async (testId: string) => {
    try {
      const response = await fetch(`/api/network-diagnostics/comprehensive-test/${testId}`);
      const data = await response.json();
      
      if (data.success) {
        const testData = data.data.test_data;
        setComprehensiveTest(testData);
        
        if (testData.status === 'running') {
          // Continue polling
          setTimeout(() => pollComprehensiveTest(testId), 2000);
        } else {
          setIsLoading(false);
        }
      }
    } catch (err) {
      console.error('Error polling test:', err);
      setIsLoading(false);
    }
  };

  const getQualityColor = (score: number) => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getLatencyColor = (latency: number) => {
    if (latency <= 50) return 'text-green-600';
    if (latency <= 100) return 'text-yellow-600';
    return 'text-red-600';
  };

  return (
    <div className="network-diagnostics p-6 bg-gray-100 min-h-screen">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold text-gray-800">
            Network Diagnostics
          </h1>
          <button
            onClick={runQuickTest}
            disabled={isLoading}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
          >
            {isLoading ? 'Testing...' : '🚀 Quick Test'}
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="bg-white rounded-lg shadow-md mb-6">
          <div className="border-b border-gray-200">
            <nav className="flex space-x-8">
              {[
                { id: 'overview', label: 'Overview', icon: '📊' },
                { id: 'ping', label: 'Ping Test', icon: '🏓' },
                { id: 'ports', label: 'Port Test', icon: '🔌' },
                { id: 'bandwidth', label: 'Bandwidth', icon: '📶' },
                { id: 'streaming', label: 'Streaming', icon: '🎥' },
                { id: 'interfaces', label: 'Interfaces', icon: '🖧' },
                { id: 'comprehensive', label: 'Full Test', icon: '🔍' }
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`py-4 px-6 text-sm font-medium border-b-2 ${
                    activeTab === tab.id
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <span className="mr-2">{tab.icon}</span>
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>

          <div className="p-6">
            {/* Overview Tab */}
            {activeTab === 'overview' && (
              <div>
                <h2 className="text-xl font-semibold mb-4">Network Overview</h2>
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {/* Quick Status Cards */}
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <h3 className="font-medium text-gray-700 mb-2">Connection Status</h3>
                    <div className="text-2xl font-bold text-green-600">
                      {pingResult?.success ? '✅ Connected' : '❌ Disconnected'}
                    </div>
                    {pingResult && (
                      <div className="text-sm text-gray-600 mt-2">
                        Latency: <span className={getLatencyColor(pingResult.avg_latency_ms)}>
                          {pingResult.avg_latency_ms.toFixed(1)}ms
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="bg-gray-50 p-4 rounded-lg">
                    <h3 className="font-medium text-gray-700 mb-2">Bandwidth</h3>
                    <div className="text-2xl font-bold text-blue-600">
                      {bandwidthResult ? `${bandwidthResult.download_mbps.toFixed(1)} Mbps` : 'Not tested'}
                    </div>
                    {bandwidthResult && (
                      <div className="text-sm text-gray-600 mt-2">
                        Upload: {bandwidthResult.upload_mbps.toFixed(1)} Mbps
                      </div>
                    )}
                  </div>

                  <div className="bg-gray-50 p-4 rounded-lg">
                    <h3 className="font-medium text-gray-700 mb-2">Active Interfaces</h3>
                    <div className="text-2xl font-bold text-purple-600">
                      {interfaces.filter(i => i.is_up).length}
                    </div>
                    <div className="text-sm text-gray-600 mt-2">
                      Total: {interfaces.length}
                    </div>
                  </div>
                </div>

                {streamingTest && (
                  <div className="mt-6 bg-blue-50 p-4 rounded-lg">
                    <h3 className="font-medium text-blue-800 mb-3">Streaming Quality Assessment</h3>
                    <div className="flex items-center space-x-4">
                      <div className={`text-3xl font-bold ${getQualityColor(streamingTest.quality_assessment.score)}`}>
                        {streamingTest.quality_assessment.score}/100
                      </div>
                      <div>
                        <div className="text-sm text-gray-600">
                          RTMP: {streamingTest.rtmp_server.accessible ? '✅' : '❌'}
                          SRT: {streamingTest.srt_server.accessible ? '✅' : '❌'}
                        </div>
                        <div className="text-sm text-gray-600">
                          Suitable for streaming: {streamingTest.bandwidth.suitable_for_streaming ? 'Yes' : 'No'}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Ping Test Tab */}
            {activeTab === 'ping' && (
              <div>
                <h2 className="text-xl font-semibold mb-4">Ping Test</h2>
                
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <h3 className="font-medium mb-3">Test Configuration</h3>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Host
                        </label>
                        <input
                          type="text"
                          value={pingHost}
                          onChange={(e) => setPingHost(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md"
                          placeholder="google.com"
                        />
                      </div>
                      <button
                        onClick={runPingTest}
                        disabled={isLoading}
                        className="w-full px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50"
                      >
                        {isLoading ? 'Testing...' : 'Run Ping Test'}
                      </button>
                    </div>
                  </div>

                  {pingResult && (
                    <div className="bg-gray-50 p-4 rounded-lg">
                      <h3 className="font-medium mb-3">Results</h3>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span>Host:</span>
                          <span className="font-medium">{pingResult.host}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Packets Sent:</span>
                          <span className="font-medium">{pingResult.packets_sent}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Packets Received:</span>
                          <span className="font-medium">{pingResult.packets_received}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Packet Loss:</span>
                          <span className={`font-medium ${pingResult.packet_loss_percent > 0 ? 'text-red-600' : 'text-green-600'}`}>
                            {pingResult.packet_loss_percent.toFixed(1)}%
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span>Average Latency:</span>
                          <span className={`font-medium ${getLatencyColor(pingResult.avg_latency_ms)}`}>
                            {pingResult.avg_latency_ms.toFixed(1)}ms
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span>Min/Max Latency:</span>
                          <span className="font-medium">
                            {pingResult.min_latency_ms.toFixed(1)} / {pingResult.max_latency_ms.toFixed(1)}ms
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Port Test Tab */}
            {activeTab === 'ports' && (
              <div>
                <h2 className="text-xl font-semibold mb-4">Port Connectivity Test</h2>
                
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <h3 className="font-medium mb-3">Single Port Test</h3>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Host
                        </label>
                        <input
                          type="text"
                          value={portHost}
                          onChange={(e) => setPortHost(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md"
                          placeholder="google.com"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Port
                          </label>
                          <input
                            type="number"
                            value={portNumber}
                            onChange={(e) => setPortNumber(parseInt(e.target.value))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md"
                            placeholder="80"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Protocol
                          </label>
                          <select
                            value={portProtocol}
                            onChange={(e) => setPortProtocol(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md"
                          >
                            <option value="tcp">TCP</option>
                            <option value="udp">UDP</option>
                          </select>
                        </div>
                      </div>
                      <button
                        onClick={runPortTest}
                        disabled={isLoading}
                        className="w-full px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
                      >
                        Test Port
                      </button>
                    </div>
                  </div>

                  <div className="bg-gray-50 p-4 rounded-lg">
                    <h3 className="font-medium mb-3">Common Ports Test</h3>
                    <p className="text-sm text-gray-600 mb-3">
                      Test connectivity to common service ports
                    </p>
                    <button
                      onClick={runCommonPortsTest}
                      disabled={isLoading}
                      className="w-full px-4 py-2 bg-purple-500 text-white rounded hover:bg-purple-600 disabled:opacity-50"
                    >
                      Test Common Ports
                    </button>
                  </div>
                </div>

                {portResults.length > 0 && (
                  <div className="bg-white rounded-lg border">
                    <div className="px-4 py-3 border-b border-gray-200">
                      <h3 className="font-medium">Port Test Results</h3>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-4 py-2 text-left">Host</th>
                            <th className="px-4 py-2 text-left">Port</th>
                            <th className="px-4 py-2 text-left">Protocol</th>
                            <th className="px-4 py-2 text-left">Status</th>
                            <th className="px-4 py-2 text-left">Response Time</th>
                          </tr>
                        </thead>
                        <tbody>
                          {portResults.map((result, index) => (
                            <tr key={index} className="border-t border-gray-200">
                              <td className="px-4 py-2">{result.host}</td>
                              <td className="px-4 py-2">{result.port}</td>
                              <td className="px-4 py-2">{result.protocol.toUpperCase()}</td>
                              <td className="px-4 py-2">
                                <span className={`px-2 py-1 rounded-full text-xs ${
                                  result.is_open 
                                    ? 'bg-green-100 text-green-800' 
                                    : 'bg-red-100 text-red-800'
                                }`}>
                                  {result.is_open ? 'Open' : 'Closed'}
                                </span>
                              </td>
                              <td className="px-4 py-2">
                                {result.response_time_ms.toFixed(1)}ms
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Bandwidth Tab */}
            {activeTab === 'bandwidth' && (
              <div>
                <h2 className="text-xl font-semibold mb-4">Bandwidth Test</h2>
                
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <h3 className="font-medium mb-3">Test Configuration</h3>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Test Duration (seconds)
                        </label>
                        <input
                          type="number"
                          value={bandwidthDuration}
                          onChange={(e) => setBandwidthDuration(parseInt(e.target.value))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md"
                          min="5"
                          max="60"
                        />
                      </div>
                      <button
                        onClick={runBandwidthTest}
                        disabled={isLoading}
                        className="w-full px-4 py-2 bg-orange-500 text-white rounded hover:bg-orange-600 disabled:opacity-50"
                      >
                        {isLoading ? 'Testing...' : 'Run Bandwidth Test'}
                      </button>
                    </div>
                  </div>

                  {bandwidthResult && (
                    <div className="bg-gray-50 p-4 rounded-lg">
                      <h3 className="font-medium mb-3">Results</h3>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span>Download Speed:</span>
                          <span className="font-medium text-blue-600">
                            {bandwidthResult.download_mbps.toFixed(2)} Mbps
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span>Upload Speed:</span>
                          <span className="font-medium text-green-600">
                            {bandwidthResult.upload_mbps.toFixed(2)} Mbps
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span>Latency:</span>
                          <span className={`font-medium ${getLatencyColor(bandwidthResult.latency_ms)}`}>
                            {bandwidthResult.latency_ms.toFixed(1)}ms
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span>Jitter:</span>
                          <span className="font-medium">
                            {bandwidthResult.jitter_ms.toFixed(1)}ms
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span>Test Duration:</span>
                          <span className="font-medium">
                            {bandwidthResult.test_duration_seconds.toFixed(1)}s
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Streaming Tab */}
            {activeTab === 'streaming' && (
              <div>
                <h2 className="text-xl font-semibold mb-4">Streaming Network Test</h2>
                
                <div className="mb-6">
                  <button
                    onClick={runStreamingTest}
                    disabled={isLoading}
                    className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 disabled:opacity-50"
                  >
                    {isLoading ? 'Testing...' : 'Run Streaming Test'}
                  </button>
                </div>

                {streamingTest && (
                  <div className="space-y-6">
                    {/* Quality Score */}
                    <div className="bg-white rounded-lg border p-4">
                      <h3 className="font-medium mb-3">Streaming Quality Assessment</h3>
                      <div className="flex items-center space-x-4">
                        <div className={`text-4xl font-bold ${getQualityColor(streamingTest.quality_assessment.score)}`}>
                          {streamingTest.quality_assessment.score}/100
                        </div>
                        <div>
                          <div className="text-sm text-gray-600">
                            Average Latency: {streamingTest.quality_assessment.avg_latency_ms.toFixed(1)}ms
                          </div>
                          <div className="text-sm text-gray-600">
                            Upload Bandwidth: {streamingTest.bandwidth.upload_mbps.toFixed(1)} Mbps
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Server Status */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="bg-white rounded-lg border p-4">
                        <h4 className="font-medium mb-2">RTMP Server</h4>
                        <div className="flex items-center space-x-2">
                          <span className={streamingTest.rtmp_server.accessible ? 'text-green-600' : 'text-red-600'}>
                            {streamingTest.rtmp_server.accessible ? '✅' : '❌'}
                          </span>
                          <span className="text-sm">
                            {streamingTest.rtmp_server.accessible ? 'Accessible' : 'Not accessible'}
                          </span>
                        </div>
                        <div className="text-sm text-gray-600 mt-1">
                          Response time: {streamingTest.rtmp_server.response_time_ms.toFixed(1)}ms
                        </div>
                      </div>

                      <div className="bg-white rounded-lg border p-4">
                        <h4 className="font-medium mb-2">SRT Server</h4>
                        <div className="flex items-center space-x-2">
                          <span className={streamingTest.srt_server.accessible ? 'text-green-600' : 'text-red-600'}>
                            {streamingTest.srt_server.accessible ? '✅' : '❌'}
                          </span>
                          <span className="text-sm">
                            {streamingTest.srt_server.accessible ? 'Accessible' : 'Not accessible'}
                          </span>
                        </div>
                        <div className="text-sm text-gray-600 mt-1">
                          Response time: {streamingTest.srt_server.response_time_ms.toFixed(1)}ms
                        </div>
                      </div>
                    </div>

                    {/* Issues and Recommendations */}
                    {(streamingTest.quality_assessment.issues.length > 0 || streamingTest.quality_assessment.recommendations.length > 0) && (
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        {streamingTest.quality_assessment.issues.length > 0 && (
                          <div className="bg-red-50 rounded-lg border border-red-200 p-4">
                            <h4 className="font-medium text-red-800 mb-2">Issues Found</h4>
                            <ul className="space-y-1">
                              {streamingTest.quality_assessment.issues.map((issue, index) => (
                                <li key={index} className="text-sm text-red-700">
                                  • {issue}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {streamingTest.quality_assessment.recommendations.length > 0 && (
                          <div className="bg-blue-50 rounded-lg border border-blue-200 p-4">
                            <h4 className="font-medium text-blue-800 mb-2">Recommendations</h4>
                            <ul className="space-y-1">
                              {streamingTest.quality_assessment.recommendations.map((rec, index) => (
                                <li key={index} className="text-sm text-blue-700">
                                  • {rec}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Network Interfaces Tab */}
            {activeTab === 'interfaces' && (
              <div>
                <h2 className="text-xl font-semibold mb-4">Network Interfaces</h2>
                
                <div className="space-y-4">
                  {interfaces.map((interface_, index) => (
                    <div key={index} className="bg-white rounded-lg border p-4">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="font-medium">{interface_.name}</h3>
                        <div className="flex items-center space-x-2">
                          <span className={`px-2 py-1 rounded-full text-xs ${
                            interface_.is_up ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                          }`}>
                            {interface_.is_up ? 'Up' : 'Down'}
                          </span>
                          <span className="px-2 py-1 bg-gray-100 text-gray-800 rounded-full text-xs">
                            {interface_.type}
                          </span>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
                        <div>
                          <span className="text-gray-600">IP Addresses:</span>
                          <div className="font-medium">
                            {interface_.ip_addresses.length > 0 ? interface_.ip_addresses.join(', ') : 'None'}
                          </div>
                        </div>
                        <div>
                          <span className="text-gray-600">MAC Address:</span>
                          <div className="font-medium font-mono">{interface_.mac_address || 'N/A'}</div>
                        </div>
                        <div>
                          <span className="text-gray-600">MTU:</span>
                          <div className="font-medium">{interface_.mtu}</div>
                        </div>
                        {interface_.speed_mbps && (
                          <div>
                            <span className="text-gray-600">Speed:</span>
                            <div className="font-medium">{interface_.speed_mbps} Mbps</div>
                          </div>
                        )}
                        {interface_.duplex && (
                          <div>
                            <span className="text-gray-600">Duplex:</span>
                            <div className="font-medium">{interface_.duplex}</div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Comprehensive Test Tab */}
            {activeTab === 'comprehensive' && (
              <div>
                <h2 className="text-xl font-semibold mb-4">Comprehensive Network Test</h2>
                
                <div className="mb-6">
                  <button
                    onClick={runComprehensiveTest}
                    disabled={isLoading}
                    className="px-4 py-2 bg-indigo-500 text-white rounded hover:bg-indigo-600 disabled:opacity-50"
                  >
                    {isLoading ? 'Running Tests...' : 'Start Comprehensive Test'}
                  </button>
                </div>

                {comprehensiveTest && (
                  <div className="bg-white rounded-lg border p-4">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-medium">Test Status</h3>
                      <span className={`px-3 py-1 rounded-full text-sm ${
                        comprehensiveTest.status === 'completed' ? 'bg-green-100 text-green-800' :
                        comprehensiveTest.status === 'running' ? 'bg-blue-100 text-blue-800' :
                        'bg-red-100 text-red-800'
                      }`}>
                        {comprehensiveTest.status}
                      </span>
                    </div>

                    {comprehensiveTest.status === 'running' && (
                      <div className="mb-4">
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div 
                            className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                            style={{ width: `${comprehensiveTest.progress || 0}%` }}
                          ></div>
                        </div>
                        <div className="text-sm text-gray-600 mt-1">
                          Progress: {comprehensiveTest.progress || 0}%
                        </div>
                      </div>
                    )}

                    {comprehensiveTest.status === 'completed' && comprehensiveTest.result && (
                      <div className="space-y-4">
                        <div className="text-sm text-gray-600">
                          <strong>Duration:</strong> {comprehensiveTest.result.duration_seconds?.toFixed(1)}s
                        </div>
                        
                        {/* Quality Assessment */}
                        {comprehensiveTest.result.tests?.quality_assessment && (
                          <div className="bg-gray-50 p-4 rounded-lg">
                            <h4 className="font-medium mb-2">Quality Assessment</h4>
                            <div className={`text-2xl font-bold ${getQualityColor(comprehensiveTest.result.tests.quality_assessment.overall_score)}`}>
                              {comprehensiveTest.result.tests.quality_assessment.overall_score}/100
                            </div>
                            <div className="grid grid-cols-3 gap-4 mt-3 text-sm">
                              <div>
                                <span className="text-gray-600">Latency:</span>
                                <div className="font-medium">{comprehensiveTest.result.tests.quality_assessment.latency_score}/100</div>
                              </div>
                              <div>
                                <span className="text-gray-600">Bandwidth:</span>
                                <div className="font-medium">{comprehensiveTest.result.tests.quality_assessment.bandwidth_score}/100</div>
                              </div>
                              <div>
                                <span className="text-gray-600">Stability:</span>
                                <div className="font-medium">{comprehensiveTest.result.tests.quality_assessment.stability_score}/100</div>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {comprehensiveTest.status === 'failed' && (
                      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                        <h4 className="font-medium text-red-800 mb-2">Test Failed</h4>
                        <p className="text-sm text-red-700">{comprehensiveTest.error}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
            <strong>Error:</strong> {error}
            <button
              onClick={() => setError(null)}
              className="float-right font-bold text-red-700 hover:text-red-900"
            >
              ×
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default NetworkDiagnostics;