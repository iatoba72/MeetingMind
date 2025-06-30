import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Badge } from './ui/badge';
import { Alert, AlertDescription } from './ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { 
  Video, 
  Wifi, 
  Settings, 
  Copy, 
  Eye, 
  AlertTriangle, 
  CheckCircle, 
  Loader,
  BarChart3,
  Monitor,
  Key
} from 'lucide-react';

// interface StreamKey {
//   id: string;
//   key: string;
//   meetingId: string;
//   userId: string;
//   protocol: string;
//   status: 'active' | 'expired' | 'revoked';
//   expiresAt: string;
//   createdAt: string;
// }

interface StreamStatus {
  streamId: string;
  status: 'connecting' | 'live' | 'ended' | 'error';
  protocol: string;
  startTime?: string;
  endTime?: string;
  viewers: number;
  quality: {
    bitrate?: number;
    fps?: number;
    resolution?: string;
  };
  health: {
    status: 'healthy' | 'warning' | 'critical';
    issues: Array<{
      type: string;
      message: string;
      severity: string;
    }>;
  };
}

interface StreamingMetrics {
  system: {
    activeStreams: number;
    totalBandwidth: number;
    avgQuality: number;
    uptime: number;
  };
  timeSeries: {
    bandwidth: { current: number };
    quality: { current: number };
  };
}

interface StreamingManagerProps {
  meetingId: string;
  userId: string;
}

export const StreamingManager: React.FC<StreamingManagerProps> = ({
  meetingId,
  userId
}) => {
  // const [streamKeys, setStreamKeys] = useState<StreamKey[]>([]);
  const [activeStreams, setActiveStreams] = useState<StreamStatus[]>([]);
  const [metrics, setMetrics] = useState<StreamingMetrics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Stream key generation form
  const [newKeyProtocol, setNewKeyProtocol] = useState('rtmp');
  const [newKeyExpiry, setNewKeyExpiry] = useState('24h');
  
  // Configuration URLs
  const [serverConfig, setServerConfig] = useState<{
    rtmpUrl?: string;
    srtUrl?: string;
    webrtcUrl?: string;
    dashUrl?: string;
    hlsUrl?: string;
  } | null>(null);

  useEffect(() => {
    loadStreamData();
    loadServerConfig();
    
    // Set up periodic refresh
    const interval = setInterval(loadStreamData, 10000); // Every 10 seconds
    return () => clearInterval(interval);
  }, [meetingId, loadStreamData, loadServerConfig]);

  const loadStreamData = async () => {
    try {
      const [streamsRes, metricsRes] = await Promise.all([
        fetch(`/api/streaming/streams?meeting_id=${meetingId}`),
        fetch('/api/streaming/metrics')
      ]);
      
      if (streamsRes.ok) {
        const streams = await streamsRes.json();
        setActiveStreams(streams);
      }
      
      if (metricsRes.ok) {
        const metricsData = await metricsRes.json();
        setMetrics(metricsData);
      }
    } catch (err) {
      console.error('Failed to load stream data:', err);
    }
  };

  const loadServerConfig = async () => {
    try {
      const response = await fetch(`/api/streaming/config/${meetingId}`);
      if (response.ok) {
        const config = await response.json();
        setServerConfig(config);
      }
    } catch (err) {
      console.error('Failed to load server config:', err);
    }
  };

  const generateStreamKey = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/streaming/stream-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          meeting_id: meetingId,
          user_id: userId,
          protocol: newKeyProtocol,
          expires_in: newKeyExpiry,
          permissions: ['publish']
        })
      });
      
      if (response.ok) {
        const result = await response.json(); // eslint-disable-line @typescript-eslint/no-unused-vars
        // Show success message with stream URLs
        setError(null);
        // Refresh the stream keys list if you're tracking them
        loadStreamData();
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to generate stream key');
      }
    } catch (err) { // eslint-disable-line @typescript-eslint/no-unused-vars
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    // You could add a toast notification here
  };

  const formatBitrate = (bps: number) => {
    if (bps === 0) return '0 bps';
    if (bps < 1000) return `${bps} bps`;
    if (bps < 1000000) return `${Math.round(bps / 1000)} kbps`;
    return `${(bps / 1000000).toFixed(1)} Mbps`;
  };

  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'live': return 'bg-green-500';
      case 'connecting': return 'bg-yellow-500';
      case 'ended': return 'bg-gray-500';
      case 'error': return 'bg-red-500';
      default: return 'bg-gray-400';
    }
  };

  const getHealthColor = (status: string) => {
    switch (status) {
      case 'healthy': return 'text-green-600';
      case 'warning': return 'text-yellow-600';
      case 'critical': return 'text-red-600';
      default: return 'text-gray-600';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Video className="h-6 w-6" />
          <h2 className="text-2xl font-bold">Streaming Manager</h2>
        </div>
        {metrics && (
          <div className="flex items-center gap-4 text-sm text-gray-600">
            <span className="flex items-center gap-1">
              <Wifi className="h-4 w-4" />
              {metrics.system.activeStreams} active
            </span>
            <span>{formatBitrate(metrics.system.totalBandwidth)}</span>
          </div>
        )}
      </div>

      {error && (
        <Alert className="border-red-200 bg-red-50">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="streams" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="streams">Active Streams</TabsTrigger>
          <TabsTrigger value="generate">Generate Key</TabsTrigger>
          <TabsTrigger value="config">OBS Setup</TabsTrigger>
          <TabsTrigger value="metrics">Metrics</TabsTrigger>
        </TabsList>

        {/* Active Streams Tab */}
        <TabsContent value="streams" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Monitor className="h-5 w-5" />
                Active Streams
              </CardTitle>
            </CardHeader>
            <CardContent>
              {activeStreams.length === 0 ? (
                <p className="text-center text-gray-500 py-8">
                  No active streams. Generate a stream key to get started.
                </p>
              ) : (
                <div className="space-y-4">
                  {activeStreams.map((stream) => (
                    <div key={stream.streamId} className="border rounded-lg p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <div className={`w-3 h-3 rounded-full ${getStatusColor(stream.status)}`} />
                          <span className="font-medium">{stream.streamId}</span>
                          <Badge variant="outline">{stream.protocol.toUpperCase()}</Badge>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          <Eye className="h-4 w-4" />
                          {stream.viewers} viewers
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div>
                          <span className="text-gray-600">Status:</span>
                          <span className="ml-1 capitalize">{stream.status}</span>
                        </div>
                        <div>
                          <span className="text-gray-600">Bitrate:</span>
                          <span className="ml-1">{formatBitrate(stream.quality.bitrate || 0)}</span>
                        </div>
                        <div>
                          <span className="text-gray-600">FPS:</span>
                          <span className="ml-1">{stream.quality.fps || 0}</span>
                        </div>
                        <div>
                          <span className="text-gray-600">Health:</span>
                          <span className={`ml-1 ${getHealthColor(stream.health.status)}`}>
                            {stream.health.status}
                          </span>
                        </div>
                      </div>
                      
                      {stream.health.issues && stream.health.issues.length > 0 && (
                        <div className="mt-3 p-2 bg-yellow-50 border border-yellow-200 rounded">
                          <p className="text-sm text-yellow-800">
                            <AlertTriangle className="h-4 w-4 inline mr-1" />
                            {stream.health.issues[0].message}
                          </p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Generate Stream Key Tab */}
        <TabsContent value="generate" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Key className="h-5 w-5" />
                Generate Stream Key
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Protocol</label>
                  <Select value={newKeyProtocol} onValueChange={setNewKeyProtocol}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="rtmp">RTMP (Universal)</SelectItem>
                      <SelectItem value="srt">SRT (Low Latency)</SelectItem>
                      <SelectItem value="webrtc">WebRTC (Ultra Low Latency)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-2">Expires In</label>
                  <Select value={newKeyExpiry} onValueChange={setNewKeyExpiry}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1h">1 Hour</SelectItem>
                      <SelectItem value="24h">24 Hours</SelectItem>
                      <SelectItem value="7d">7 Days</SelectItem>
                      <SelectItem value="30d">30 Days</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              <Button 
                onClick={generateStreamKey} 
                disabled={loading}
                className="w-full"
              >
                {loading ? (
                  <>
                    <Loader className="h-4 w-4 mr-2 animate-spin" />
                    Generating...
                  </>
                ) : (
                  'Generate Stream Key'
                )}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* OBS Configuration Tab */}
        <TabsContent value="config" className="space-y-4">
          {serverConfig && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {Object.entries(serverConfig.protocols).map(([protocol, config]: [string, any]) => (
                <Card key={protocol}>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Settings className="h-5 w-5" />
                      {config.name}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-600 mb-1">
                        Server URL
                      </label>
                      <div className="flex items-center gap-2">
                        <Input 
                          value={config.url.replace('YOUR_STREAM_KEY', '[YOUR-STREAM-KEY]')} 
                          readOnly 
                          className="text-xs"
                        />
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => copyToClipboard(config.url)}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    
                    <div className="text-sm space-y-2">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Latency:</span>
                        <span>{config.latency}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Port:</span>
                        <span>{config.port}</span>
                      </div>
                    </div>
                    
                    <p className="text-xs text-gray-600">{config.description}</p>
                    
                    <div className="p-2 bg-blue-50 border border-blue-200 rounded">
                      <p className="text-xs text-blue-800">
                        <strong>Setup:</strong> {config.setup_guide}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
          
          {serverConfig && (
            <Card>
              <CardHeader>
                <CardTitle>Recommended Settings</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                  {Object.entries(serverConfig.recommended_settings).map(([key, value]) => (
                    <div key={key} className="flex justify-between">
                      <span className="text-gray-600 capitalize">{key.replace('_', ' ')}:</span>
                      <span className="font-medium">{value}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Metrics Tab */}
        <TabsContent value="metrics" className="space-y-4">
          {metrics && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2">
                      <Monitor className="h-5 w-5 text-blue-600" />
                      <div>
                        <p className="text-sm text-gray-600">Active Streams</p>
                        <p className="text-2xl font-bold">{metrics.system.activeStreams}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2">
                      <BarChart3 className="h-5 w-5 text-green-600" />
                      <div>
                        <p className="text-sm text-gray-600">Bandwidth</p>
                        <p className="text-2xl font-bold">
                          {formatBitrate(metrics.system.totalBandwidth)}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-5 w-5 text-yellow-600" />
                      <div>
                        <p className="text-sm text-gray-600">Avg Quality</p>
                        <p className="text-2xl font-bold">{Math.round(metrics.system.avgQuality)}%</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2">
                      <Wifi className="h-5 w-5 text-purple-600" />
                      <div>
                        <p className="text-sm text-gray-600">Uptime</p>
                        <p className="text-2xl font-bold">{formatDuration(metrics.system.uptime)}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};