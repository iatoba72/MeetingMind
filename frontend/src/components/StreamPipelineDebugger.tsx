import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Alert, AlertDescription } from './ui/alert';
import { 
  Play, 
  Pause, 
  Activity, 
  Cpu, 
  Wifi, 
  AlertTriangle, 
  ArrowRight,
  Download,
  RefreshCw,
  Zap,
  Eye
} from 'lucide-react';

interface ProcessingStage {
  id: string;
  name: string;
  status: 'idle' | 'active' | 'error' | 'warning';
  lastUpdate?: Date;
  metrics?: {
    throughput?: number;
    latency?: number;
    errorRate?: number;
  };
}

interface StreamFormat {
  container: string;
  duration: number;
  bitrate: number;
  streams: {
    video: Array<{
      index: number;
      codec: string;
      width: number;
      height: number;
      fps: number;
      bitrate: number;
    }>;
    audio: Array<{
      index: number;
      codec: string;
      sampleRate: number;
      channels: number;
      bitrate: number;
    }>;
    data: Array<{
      index: number;
      codec: string;
    }>;
  };
}

interface PipelineMetrics {
  input: {
    bitrate: number;
    fps: number;
    resolution: string | null;
    codec: string | null;
  };
  processing: {
    cpu: number;
    memory: number;
    latency: number;
  };
  output: {
    formats: Array<{
      name: string;
      format: string;
      codec: string;
      bitrate: number;
      consumers: number;
    }>;
    totalBitrate: number;
  };
  network: {
    quality: string;
    packetLoss: number;
    jitter: number;
  };
  lastUpdate: Date;
}

interface DebugInfo {
  processorId: string;
  state: string;
  inputFormat?: StreamFormat;
  stages: ProcessingStage[];
  outputFormats: any[];
  metrics: PipelineMetrics;
  errors: Array<{
    timestamp: Date;
    message: string;
    stack?: string;
  }>;
  warnings: Array<{
    timestamp: Date;
    message: string;
    stage: string;
  }>;
  adaptationHistory: Array<{
    timestamp: Date;
    targetBitrate: number;
    networkQuality: string;
    reason: string;
  }>;
}

interface StreamPipelineDebuggerProps {
  processorId: string;
  websocketUrl?: string;
}

export const StreamPipelineDebugger: React.FC<StreamPipelineDebuggerProps> = ({
  processorId,
  websocketUrl = 'ws://localhost:3001'
}) => {
  const [debugInfo, setDebugInfo] = useState<DebugInfo | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [selectedStage, setSelectedStage] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    connectWebSocket();
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [processorId, connectWebSocket]);

  useEffect(() => {
    if (autoRefresh) {
      const interval = setInterval(fetchDebugInfo, 2000);
      return () => clearInterval(interval);
    }
  }, [autoRefresh, processorId, fetchDebugInfo]);

  const connectWebSocket = useCallback(() => {
    try {
      wsRef.current = new WebSocket(websocketUrl);
      
      wsRef.current.onopen = () => {
        setIsConnected(true);
        // Subscribe to processor updates
        wsRef.current?.send(JSON.stringify({
          type: 'subscribe',
          target: 'processor',
          id: processorId
        }));
      };

      wsRef.current.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === 'debug-update' && data.processorId === processorId) {
          setDebugInfo(data.debugInfo);
        }
      };

      wsRef.current.onclose = () => {
        setIsConnected(false);
      };

      wsRef.current.onerror = (error) => {
        console.error('WebSocket error:', error);
        setIsConnected(false);
      };
    } catch (error) {
      console.error('Failed to connect WebSocket:', error);
    }
  }, [websocketUrl, processorId]);

  const fetchDebugInfo = useCallback(async () => {
    try {
      const response = await fetch(`/api/stream-processor/${processorId}/debug`);
      if (response.ok) {
        const data = await response.json();
        setDebugInfo(data);
      }
    } catch (error) {
      console.error('Failed to fetch debug info:', error);
    }
  }, [processorId]);

  const exportDebugData = () => {
    if (!debugInfo) return;
    
    const dataStr = JSON.stringify(debugInfo, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `stream-debug-${processorId}-${new Date().toISOString()}.json`;
    link.click();
    
    URL.revokeObjectURL(url);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-500';
      case 'warning': return 'bg-yellow-500';
      case 'error': return 'bg-red-500';
      case 'idle': return 'bg-gray-400';
      default: return 'bg-gray-400';
    }
  };

  const getQualityColor = (quality: string) => {
    switch (quality) {
      case 'excellent': return 'text-green-600';
      case 'good': return 'text-blue-600';
      case 'fair': return 'text-yellow-600';
      case 'poor': return 'text-orange-600';
      case 'critical': return 'text-red-600';
      default: return 'text-gray-600';
    }
  };

  const formatBitrate = (bps: number) => {
    if (bps === 0) return '0 bps';
    if (bps < 1000) return `${bps} bps`;
    if (bps < 1000000) return `${Math.round(bps / 1000)} kbps`;
    return `${(bps / 1000000).toFixed(1)} Mbps`;
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  if (!debugInfo) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-64">
          <div className="text-center">
            <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4" />
            <p>Loading pipeline debug information...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="h-6 w-6" />
          <h2 className="text-2xl font-bold">Pipeline Debugger</h2>
          <Badge variant={isConnected ? "default" : "destructive"}>
            {isConnected ? 'Live' : 'Offline'}
          </Badge>
        </div>
        
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAutoRefresh(!autoRefresh)}
          >
            {autoRefresh ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            {autoRefresh ? 'Pause' : 'Resume'}
          </Button>
          
          <Button
            variant="outline"
            size="sm"
            onClick={fetchDebugInfo}
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
          
          <Button
            variant="outline"
            size="sm"
            onClick={exportDebugData}
          >
            <Download className="h-4 w-4" />
            Export
          </Button>
        </div>
      </div>

      {/* Pipeline Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Eye className="h-5 w-5" />
            Pipeline Overview
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="text-center">
              <p className="text-sm text-gray-600">State</p>
              <Badge variant={debugInfo.state === 'processing' ? 'default' : 'secondary'}>
                {debugInfo.state}
              </Badge>
            </div>
            
            <div className="text-center">
              <p className="text-sm text-gray-600">Input Bitrate</p>
              <p className="font-mono text-lg">{formatBitrate(debugInfo.metrics.input.bitrate)}</p>
            </div>
            
            <div className="text-center">
              <p className="text-sm text-gray-600">Output Bitrate</p>
              <p className="font-mono text-lg">{formatBitrate(debugInfo.metrics.output.totalBitrate)}</p>
            </div>
            
            <div className="text-center">
              <p className="text-sm text-gray-600">Network Quality</p>
              <p className={`font-semibold ${getQualityColor(debugInfo.metrics.network.quality)}`}>
                {debugInfo.metrics.network.quality}
              </p>
            </div>
          </div>

          {/* Visual Pipeline Flow */}
          <div className="flex items-center justify-between bg-gray-50 p-4 rounded-lg">
            {debugInfo.stages.map((stage, index) => (
              <React.Fragment key={stage.id}>
                <div
                  className={`p-3 rounded-lg border cursor-pointer transition-all ${
                    selectedStage === stage.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white'
                  }`}
                  onClick={() => setSelectedStage(selectedStage === stage.id ? null : stage.id)}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <div className={`w-3 h-3 rounded-full ${getStatusColor(stage.status)}`} />
                    <span className="text-sm font-medium">{stage.name}</span>
                  </div>
                  {stage.metrics && (
                    <div className="text-xs text-gray-600">
                      {stage.metrics.throughput && (
                        <div>Throughput: {formatBitrate(stage.metrics.throughput)}</div>
                      )}
                      {stage.metrics.latency && (
                        <div>Latency: {stage.metrics.latency}ms</div>
                      )}
                    </div>
                  )}
                </div>
                
                {index < debugInfo.stages.length - 1 && (
                  <ArrowRight className="h-4 w-4 text-gray-400" />
                )}
              </React.Fragment>
            ))}
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="metrics" className="w-full">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="metrics">Metrics</TabsTrigger>
          <TabsTrigger value="formats">Formats</TabsTrigger>
          <TabsTrigger value="network">Network</TabsTrigger>
          <TabsTrigger value="errors">Issues</TabsTrigger>
          <TabsTrigger value="adaptation">Adaptation</TabsTrigger>
        </TabsList>

        {/* Real-time Metrics */}
        <TabsContent value="metrics" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Input Metrics */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Input Stream</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-600">Codec:</span>
                  <span className="font-mono">{debugInfo.metrics.input.codec || 'Unknown'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Resolution:</span>
                  <span className="font-mono">{debugInfo.metrics.input.resolution || 'Unknown'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">FPS:</span>
                  <span className="font-mono">{debugInfo.metrics.input.fps}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Bitrate:</span>
                  <span className="font-mono">{formatBitrate(debugInfo.metrics.input.bitrate)}</span>
                </div>
              </CardContent>
            </Card>

            {/* Processing Metrics */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Cpu className="h-4 w-4" />
                  Processing
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-600">CPU Usage:</span>
                  <span className="font-mono">{debugInfo.metrics.processing.cpu.toFixed(1)}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Memory:</span>
                  <span className="font-mono">{formatBytes(debugInfo.metrics.processing.memory)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Latency:</span>
                  <span className="font-mono">{debugInfo.metrics.processing.latency}ms</span>
                </div>
              </CardContent>
            </Card>

            {/* Network Metrics */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Wifi className="h-4 w-4" />
                  Network
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-600">Quality:</span>
                  <span className={`font-semibold ${getQualityColor(debugInfo.metrics.network.quality)}`}>
                    {debugInfo.metrics.network.quality}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Packet Loss:</span>
                  <span className="font-mono">{(debugInfo.metrics.network.packetLoss * 100).toFixed(2)}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Jitter:</span>
                  <span className="font-mono">{debugInfo.metrics.network.jitter}ms</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Stream Formats */}
        <TabsContent value="formats" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Input Format */}
            {debugInfo.inputFormat && (
              <Card>
                <CardHeader>
                  <CardTitle>Input Format</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Container:</span>
                      <span className="font-mono">{debugInfo.inputFormat.container}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Duration:</span>
                      <span className="font-mono">{debugInfo.inputFormat.duration.toFixed(1)}s</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Bitrate:</span>
                      <span className="font-mono">{formatBitrate(debugInfo.inputFormat.bitrate)}</span>
                    </div>
                    
                    <div className="space-y-2">
                      <h4 className="font-medium">Video Streams:</h4>
                      {debugInfo.inputFormat.streams.video.map((stream, index) => (
                        <div key={index} className="text-sm bg-gray-50 p-2 rounded">
                          <div>{stream.codec} - {stream.width}x{stream.height} @ {stream.fps}fps</div>
                          <div className="text-gray-600">{formatBitrate(stream.bitrate)}</div>
                        </div>
                      ))}
                    </div>
                    
                    <div className="space-y-2">
                      <h4 className="font-medium">Audio Streams:</h4>
                      {debugInfo.inputFormat.streams.audio.map((stream, index) => (
                        <div key={index} className="text-sm bg-gray-50 p-2 rounded">
                          <div>{stream.codec} - {stream.sampleRate}Hz, {stream.channels} ch</div>
                          <div className="text-gray-600">{formatBitrate(stream.bitrate)}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Output Formats */}
            <Card>
              <CardHeader>
                <CardTitle>Output Formats</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {debugInfo.metrics.output.formats.map((format, index) => (
                    <div key={index} className="border rounded-lg p-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium">{format.name}</span>
                        <Badge variant="outline">{format.format}</Badge>
                      </div>
                      <div className="text-sm space-y-1">
                        <div className="flex justify-between">
                          <span className="text-gray-600">Codec:</span>
                          <span className="font-mono">{format.codec}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Bitrate:</span>
                          <span className="font-mono">{formatBitrate(format.bitrate)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Consumers:</span>
                          <span className="font-mono">{format.consumers}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Network Details */}
        <TabsContent value="network" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Network Status</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <h4 className="font-medium">Connection Quality</h4>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span>Overall Quality:</span>
                      <Badge className={getQualityColor(debugInfo.metrics.network.quality)}>
                        {debugInfo.metrics.network.quality}
                      </Badge>
                    </div>
                    <div className="flex justify-between">
                      <span>Packet Loss:</span>
                      <span className="font-mono">{(debugInfo.metrics.network.packetLoss * 100).toFixed(3)}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Jitter:</span>
                      <span className="font-mono">{debugInfo.metrics.network.jitter}ms</span>
                    </div>
                  </div>
                </div>
                
                <div className="space-y-4">
                  <h4 className="font-medium">Adaptation History</h4>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {debugInfo.adaptationHistory.slice(-5).map((adaptation, index) => (
                      <div key={index} className="text-sm border rounded p-2">
                        <div className="flex justify-between">
                          <span>{new Date(adaptation.timestamp).toLocaleTimeString()}</span>
                          <Badge variant="outline">{adaptation.networkQuality}</Badge>
                        </div>
                        <div className="text-gray-600">
                          Target: {formatBitrate(adaptation.targetBitrate)}
                        </div>
                        <div className="text-gray-600">
                          Reason: {adaptation.reason}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Errors and Warnings */}
        <TabsContent value="errors" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Errors */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-red-600">
                  <AlertTriangle className="h-4 w-4" />
                  Errors ({debugInfo.errors.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {debugInfo.errors.length === 0 ? (
                    <p className="text-gray-500 text-center py-4">No errors</p>
                  ) : (
                    debugInfo.errors.map((error, index) => (
                      <Alert key={index} className="border-red-200">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertDescription>
                          <div className="text-sm">
                            <div className="font-medium">{error.message}</div>
                            <div className="text-gray-600 text-xs">
                              {new Date(error.timestamp).toLocaleString()}
                            </div>
                          </div>
                        </AlertDescription>
                      </Alert>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Warnings */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-yellow-600">
                  <AlertTriangle className="h-4 w-4" />
                  Warnings ({debugInfo.warnings.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {debugInfo.warnings.length === 0 ? (
                    <p className="text-gray-500 text-center py-4">No warnings</p>
                  ) : (
                    debugInfo.warnings.map((warning, index) => (
                      <Alert key={index} className="border-yellow-200">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertDescription>
                          <div className="text-sm">
                            <div className="font-medium">{warning.message}</div>
                            <div className="text-gray-600 text-xs">
                              Stage: {warning.stage} • {new Date(warning.timestamp).toLocaleString()}
                            </div>
                          </div>
                        </AlertDescription>
                      </Alert>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Adaptation History */}
        <TabsContent value="adaptation" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-4 w-4" />
                Adaptive Bitrate History
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {debugInfo.adaptationHistory.length === 0 ? (
                  <p className="text-gray-500 text-center py-8">No adaptations recorded</p>
                ) : (
                  <div className="space-y-3">
                    {debugInfo.adaptationHistory.slice(-10).reverse().map((adaptation, index) => (
                      <div key={index} className="border rounded-lg p-4">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-medium">
                            {new Date(adaptation.timestamp).toLocaleString()}
                          </span>
                          <Badge className={getQualityColor(adaptation.networkQuality)}>
                            {adaptation.networkQuality}
                          </Badge>
                        </div>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <span className="text-gray-600">Target Bitrate:</span>
                            <span className="ml-2 font-mono">{formatBitrate(adaptation.targetBitrate)}</span>
                          </div>
                          <div>
                            <span className="text-gray-600">Reason:</span>
                            <span className="ml-2">{adaptation.reason.replace(/_/g, ' ')}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};