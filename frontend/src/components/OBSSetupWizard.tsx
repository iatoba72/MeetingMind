import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Alert, AlertDescription } from './ui/alert';
import { Progress } from './ui/progress';
import { 
  CheckCircle, 
  XCircle, 
  AlertTriangle, 
  Settings, 
  Download, 
  Play,
  RefreshCw,
  Monitor,
  Cpu,
  Zap,
  FileText,
  ExternalLink
} from 'lucide-react';

interface TestResult {
  name: string;
  status: 'pending' | 'running' | 'passed' | 'failed' | 'warning';
  message: string;
  details?: string;
  recommendation?: string;
  value?: string | number;
  threshold?: string | number;
}

interface SystemSpecs {
  cpu_cores: number;
  cpu_frequency: number;
  ram_gb: number;
  gpu_name: string;
  gpu_memory_gb: number;
  has_hardware_encoder: boolean;
  encoder_type: string;
  os_type: string;
  network_upload_mbps: number;
  disk_space_gb: number;
  webcam_resolution: [number, number];
  microphone_quality: string;
}

interface OBSConnection {
  host: string;
  port: number;
  password: string;
  connected: boolean;
  version?: string;
  scenes?: string[];
  sources?: string[];
}

interface WizardStep {
  id: string;
  title: string;
  description: string;
  completed: boolean;
}

export const OBSSetupWizard: React.FC = () => {
  const [currentStep, setCurrentStep] = useState(0);
  const [isRunningTests, setIsRunningTests] = useState(false);
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const [systemSpecs, setSystemSpecs] = useState<SystemSpecs | null>(null);
  const [obsConnection, setObsConnection] = useState<OBSConnection>({
    host: 'localhost',
    port: 4455,
    password: '',
    connected: false
  });
  const [generatedConfig, setGeneratedConfig] = useState<{ videoSettings: Record<string, unknown>; audioSettings: Record<string, unknown>; scenes: Array<{ name: string; sources: Array<{ type: string; settings: Record<string, unknown> }> }> } | null>(null);
  const [testProgress, setTestProgress] = useState(0);

  const steps: WizardStep[] = [
    {
      id: 'welcome',
      title: 'Welcome',
      description: 'Introduction to OBS setup',
      completed: false
    },
    {
      id: 'system-check',
      title: 'System Check',
      description: 'Analyze system capabilities',
      completed: false
    },
    {
      id: 'obs-connection',
      title: 'OBS Connection',
      description: 'Connect to OBS WebSocket',
      completed: false
    },
    {
      id: 'performance-test',
      title: 'Performance Test',
      description: 'Test streaming performance',
      completed: false
    },
    {
      id: 'configuration',
      title: 'Configuration',
      description: 'Generate optimal settings',
      completed: false
    },
    {
      id: 'setup-complete',
      title: 'Complete',
      description: 'Finish setup and apply settings',
      completed: false
    }
  ];

  const runSystemCheck = async () => {
    setIsRunningTests(true);
    setTestProgress(0);
    
    const tests: TestResult[] = [
      { name: 'CPU Performance', status: 'pending', message: 'Checking CPU capabilities...' },
      { name: 'Memory Available', status: 'pending', message: 'Checking available RAM...' },
      { name: 'GPU Hardware Encoding', status: 'pending', message: 'Detecting hardware encoders...' },
      { name: 'Network Upload Speed', status: 'pending', message: 'Testing upload bandwidth...' },
      { name: 'Disk Space', status: 'pending', message: 'Checking available storage...' },
      { name: 'Webcam Detection', status: 'pending', message: 'Detecting webcam capabilities...' },
      { name: 'Audio Device Detection', status: 'pending', message: 'Checking audio devices...' }
    ];

    setTestResults([...tests]);

    try {
      // Simulate system analysis
      for (let i = 0; i < tests.length; i++) {
        const updatedTests = [...tests];
        updatedTests[i].status = 'running';
        setTestResults([...updatedTests]);
        setTestProgress((i / tests.length) * 100);

        // Simulate API call to analyze system
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Mock test results based on typical scenarios
        switch (tests[i].name) {
          case 'CPU Performance': {
            const cpuCores = 8; // Mock data
            updatedTests[i] = {
              ...updatedTests[i],
              status: cpuCores >= 4 ? 'passed' : 'warning',
              message: `${cpuCores} cores detected`,
              value: cpuCores,
              threshold: 4,
              recommendation: cpuCores < 4 ? 'Consider upgrading to a CPU with more cores for better performance' : undefined
            };
            break;
          }

          case 'Memory Available': {
            const ramGb = 16; // Mock data
            updatedTests[i] = {
              ...updatedTests[i],
              status: ramGb >= 8 ? 'passed' : 'warning',
              message: `${ramGb}GB RAM available`,
              value: ramGb,
              threshold: 8,
              recommendation: ramGb < 8 ? 'Upgrade to at least 8GB RAM for optimal performance' : undefined
            };
            break;
          }

          case 'GPU Hardware Encoding': {
            const hasHwEncoder = true; // Mock data
            updatedTests[i] = {
              ...updatedTests[i],
              status: hasHwEncoder ? 'passed' : 'warning',
              message: hasHwEncoder ? 'NVIDIA NVENC detected' : 'No hardware encoder found',
              recommendation: !hasHwEncoder ? 'Consider a GPU with hardware encoding support' : undefined
            };
            break;
          }

          case 'Network Upload Speed': {
            const uploadMbps = 25; // Mock data
            updatedTests[i] = {
              ...updatedTests[i],
              status: uploadMbps >= 10 ? 'passed' : 'warning',
              message: `${uploadMbps} Mbps upload speed`,
              value: uploadMbps,
              threshold: 10,
              recommendation: uploadMbps < 10 ? 'Upgrade internet for higher quality streaming' : undefined
            };
            break;
          }

          case 'Disk Space': {
            const diskGb = 500; // Mock data
            updatedTests[i] = {
              ...updatedTests[i],
              status: diskGb >= 50 ? 'passed' : 'warning',
              message: `${diskGb}GB available`,
              value: diskGb,
              threshold: 50,
              recommendation: diskGb < 50 ? 'Free up disk space for recordings' : undefined
            };
            break;
          }

          case 'Webcam Detection': {
            const webcamFound = true; // Mock data
            updatedTests[i] = {
              ...updatedTests[i],
              status: webcamFound ? 'passed' : 'failed',
              message: webcamFound ? '1080p webcam detected' : 'No webcam found',
              recommendation: !webcamFound ? 'Connect a webcam for video streaming' : undefined
            };
            break;
          }

          case 'Audio Device Detection': {
            const audioFound = true; // Mock data
            updatedTests[i] = {
              ...updatedTests[i],
              status: audioFound ? 'passed' : 'failed',
              message: audioFound ? 'Microphone and speakers detected' : 'No audio devices found',
              recommendation: !audioFound ? 'Connect audio devices for meeting participation' : undefined
            };
            break;
          }
        }

        setTestResults([...updatedTests]);
      }

      setTestProgress(100);
      
      // Mock system specs based on test results
      setSystemSpecs({
        cpu_cores: 8,
        cpu_frequency: 3.2,
        ram_gb: 16,
        gpu_name: 'NVIDIA GeForce RTX 3070',
        gpu_memory_gb: 8,
        has_hardware_encoder: true,
        encoder_type: 'nvidia',
        os_type: 'windows',
        network_upload_mbps: 25,
        disk_space_gb: 500,
        webcam_resolution: [1920, 1080],
        microphone_quality: 'good'
      });

    } catch (error) {
      console.error('System check failed:', error);
    } finally {
      setIsRunningTests(false);
    }
  };

  const testOBSConnection = async () => {
    try {
      const response = await fetch('/api/obs/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          host: obsConnection.host,
          port: obsConnection.port,
          password: obsConnection.password
        })
      });

      const result = await response.json();
      
      if (result.connected) {
        setObsConnection({
          ...obsConnection,
          connected: true,
          version: result.version?.obsVersion,
          scenes: result.scenes?.map((s: { name: string }) => s.name) || [],
          sources: result.sources || []
        });
      }

      return result.connected;
    } catch (error) {
      console.error('OBS connection test failed:', error);
      return false;
    }
  };

  const generateOptimalConfig = async () => {
    if (!systemSpecs) return;

    try {
      const response = await fetch('/api/obs/config/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          meeting_type: 'discussion',
          quality_preset: 'high_quality',
          streaming_platform: 'meetingmind',
          system_specs: systemSpecs
        })
      });

      const config = await response.json();
      setGeneratedConfig(config);
    } catch (error) {
      console.error('Config generation failed:', error);
    }
  };

  const downloadConfig = () => {
    if (!generatedConfig) return;

    const dataStr = JSON.stringify(generatedConfig, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `meetingmind-obs-config-${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    
    URL.revokeObjectURL(url);
  };

  const getStatusIcon = (status: TestResult['status']) => {
    switch (status) {
      case 'passed': return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'failed': return <XCircle className="h-5 w-5 text-red-500" />;
      case 'warning': return <AlertTriangle className="h-5 w-5 text-yellow-500" />;
      case 'running': return <RefreshCw className="h-5 w-5 text-blue-500 animate-spin" />;
      default: return <div className="h-5 w-5 rounded-full bg-gray-300" />;
    }
  };

  const getStepIcon = (stepId: string) => {
    switch (stepId) {
      case 'welcome': return <Play className="h-5 w-5" />;
      case 'system-check': return <Monitor className="h-5 w-5" />;
      case 'obs-connection': return <Zap className="h-5 w-5" />;
      case 'performance-test': return <Cpu className="h-5 w-5" />;
      case 'configuration': return <Settings className="h-5 w-5" />;
      case 'setup-complete': return <CheckCircle className="h-5 w-5" />;
      default: return <div className="h-5 w-5 rounded-full bg-gray-300" />;
    }
  };

  const nextStep = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const prevStep = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const renderWelcomeStep = () => (
    <div className="text-center space-y-6">
      <div className="flex justify-center">
        <div className="w-32 h-32 bg-blue-100 rounded-full flex items-center justify-center">
          <Settings className="w-16 h-16 text-blue-600" />
        </div>
      </div>
      
      <div>
        <h2 className="text-2xl font-bold mb-4">Welcome to OBS Setup Wizard</h2>
        <p className="text-gray-600 max-w-2xl mx-auto">
          This wizard will help you configure OBS Studio for optimal streaming with MeetingMind. 
          We'll check your system, test your connection, and generate personalized settings.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-4xl mx-auto">
        <Card>
          <CardContent className="p-4 text-center">
            <Monitor className="w-8 h-8 mx-auto mb-2 text-blue-500" />
            <h3 className="font-semibold mb-1">System Analysis</h3>
            <p className="text-sm text-gray-600">Check hardware capabilities</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4 text-center">
            <Zap className="w-8 h-8 mx-auto mb-2 text-green-500" />
            <h3 className="font-semibold mb-1">OBS Connection</h3>
            <p className="text-sm text-gray-600">Connect to OBS WebSocket</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4 text-center">
            <Settings className="w-8 h-8 mx-auto mb-2 text-purple-500" />
            <h3 className="font-semibold mb-1">Optimal Configuration</h3>
            <p className="text-sm text-gray-600">Generate custom settings</p>
          </CardContent>
        </Card>
      </div>

      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          Make sure OBS Studio is running with WebSocket server enabled before proceeding.
        </AlertDescription>
      </Alert>
    </div>
  );

  const renderSystemCheckStep = () => (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold mb-2">System Capability Check</h2>
        <p className="text-gray-600">Analyzing your system for optimal OBS performance</p>
      </div>

      <div className="flex justify-center mb-6">
        <Button 
          onClick={runSystemCheck} 
          disabled={isRunningTests}
          className="px-8"
        >
          {isRunningTests ? (
            <>
              <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              Running Tests...
            </>
          ) : (
            <>
              <Play className="w-4 h-4 mr-2" />
              Start System Check
            </>
          )}
        </Button>
      </div>

      {isRunningTests && (
        <div className="mb-6">
          <div className="flex justify-between text-sm mb-2">
            <span>Progress</span>
            <span>{Math.round(testProgress)}%</span>
          </div>
          <Progress value={testProgress} className="w-full" />
        </div>
      )}

      <div className="space-y-3">
        {testResults.map((test, index) => (
          <Card key={index}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  {getStatusIcon(test.status)}
                  <div>
                    <h3 className="font-medium">{test.name}</h3>
                    <p className="text-sm text-gray-600">{test.message}</p>
                    {test.recommendation && (
                      <p className="text-sm text-yellow-600 mt-1">💡 {test.recommendation}</p>
                    )}
                  </div>
                </div>
                {test.value && test.threshold && (
                  <Badge variant={test.status === 'passed' ? 'default' : 'destructive'}>
                    {test.value} / {test.threshold}
                  </Badge>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {systemSpecs && (
        <Card>
          <CardHeader>
            <CardTitle>System Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-sm text-gray-600">CPU</p>
                <p className="font-medium">{systemSpecs.cpu_cores} cores @ {systemSpecs.cpu_frequency}GHz</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">RAM</p>
                <p className="font-medium">{systemSpecs.ram_gb}GB</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">GPU</p>
                <p className="font-medium">{systemSpecs.gpu_name}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Upload Speed</p>
                <p className="font-medium">{systemSpecs.network_upload_mbps} Mbps</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );

  const renderOBSConnectionStep = () => (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold mb-2">Connect to OBS Studio</h2>
        <p className="text-gray-600">Configure WebSocket connection to OBS</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>WebSocket Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Host</label>
            <Input
              value={obsConnection.host}
              onChange={(e) => setObsConnection({...obsConnection, host: e.target.value})}
              placeholder="localhost"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-2">Port</label>
            <Input
              type="number"
              value={obsConnection.port}
              onChange={(e) => setObsConnection({...obsConnection, port: parseInt(e.target.value)})}
              placeholder="4455"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-2">Password (Optional)</label>
            <Input
              type="password"
              value={obsConnection.password}
              onChange={(e) => setObsConnection({...obsConnection, password: e.target.value})}
              placeholder="WebSocket password"
            />
          </div>

          <Button onClick={testOBSConnection} className="w-full">
            <Zap className="w-4 h-4 mr-2" />
            Test Connection
          </Button>
        </CardContent>
      </Card>

      {obsConnection.connected && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <CheckCircle className="w-5 h-5 text-green-500 mr-2" />
              Connected to OBS
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <p className="text-sm text-gray-600">Version</p>
                <p className="font-medium">{obsConnection.version || 'Unknown'}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Scenes</p>
                <p className="font-medium">{obsConnection.scenes?.length || 0} scenes</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Sources</p>
                <p className="font-medium">{obsConnection.sources?.length || 0} sources</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          <strong>Enable WebSocket Server:</strong> In OBS, go to Tools → WebSocket Server Settings and enable the server. 
          Default port is 4455. Set a password for security.
        </AlertDescription>
      </Alert>
    </div>
  );

  const renderConfigurationStep = () => (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold mb-2">Generate Optimal Configuration</h2>
        <p className="text-gray-600">Creating personalized OBS settings based on your system</p>
      </div>

      <div className="flex justify-center mb-6">
        <Button onClick={generateOptimalConfig} className="px-8">
          <Settings className="w-4 h-4 mr-2" />
          Generate Configuration
        </Button>
      </div>

      {generatedConfig && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Generated Configuration</CardTitle>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="video" className="w-full">
                <TabsList className="grid w-full grid-cols-4">
                  <TabsTrigger value="video">Video</TabsTrigger>
                  <TabsTrigger value="audio">Audio</TabsTrigger>
                  <TabsTrigger value="stream">Stream</TabsTrigger>
                  <TabsTrigger value="scenes">Scenes</TabsTrigger>
                </TabsList>
                
                <TabsContent value="video" className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-gray-600">Resolution</p>
                      <p className="font-medium">{generatedConfig.video?.output_width}x{generatedConfig.video?.output_height}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Frame Rate</p>
                      <p className="font-medium">{generatedConfig.video?.fps_common} FPS</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Encoder</p>
                      <p className="font-medium">{generatedConfig.stream?.encoder}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Bitrate</p>
                      <p className="font-medium">{generatedConfig.stream?.bitrate} kbps</p>
                    </div>
                  </div>
                </TabsContent>
                
                <TabsContent value="audio">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-gray-600">Sample Rate</p>
                      <p className="font-medium">{generatedConfig.audio?.sample_rate} Hz</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Channels</p>
                      <p className="font-medium">{generatedConfig.audio?.channels}</p>
                    </div>
                  </div>
                </TabsContent>
                
                <TabsContent value="stream">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-gray-600">Service</p>
                      <p className="font-medium">{generatedConfig.stream?.service}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Preset</p>
                      <p className="font-medium">{generatedConfig.stream?.preset}</p>
                    </div>
                  </div>
                </TabsContent>
                
                <TabsContent value="scenes">
                  <div className="space-y-2">
                    {generatedConfig.scene_collection?.scenes?.map((scene: { name: string; sources: unknown[] }, index: number) => (
                      <div key={index} className="flex items-center justify-between p-2 border rounded">
                        <span className="font-medium">{scene.name}</span>
                        <Badge variant="outline">{scene.sources?.length || 0} sources</Badge>
                      </div>
                    ))}
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          <div className="flex space-x-4">
            <Button onClick={downloadConfig} className="flex-1">
              <Download className="w-4 h-4 mr-2" />
              Download Configuration
            </Button>
            <Button variant="outline" className="flex-1">
              <ExternalLink className="w-4 h-4 mr-2" />
              Apply to OBS
            </Button>
          </div>

          {generatedConfig.recommendations && (
            <Card>
              <CardHeader>
                <CardTitle>Recommendations</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {generatedConfig.recommendations.map((rec: string, index: number) => (
                    <li key={index} className="flex items-start">
                      <span className="text-blue-500 mr-2">•</span>
                      <span className="text-sm">{rec}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );

  const renderCompleteStep = () => (
    <div className="text-center space-y-6">
      <div className="flex justify-center">
        <div className="w-32 h-32 bg-green-100 rounded-full flex items-center justify-center">
          <CheckCircle className="w-16 h-16 text-green-600" />
        </div>
      </div>
      
      <div>
        <h2 className="text-2xl font-bold mb-4">Setup Complete!</h2>
        <p className="text-gray-600 max-w-2xl mx-auto">
          Your OBS Studio is now configured for optimal streaming with MeetingMind. 
          The generated configuration has been applied and you're ready to start streaming.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl mx-auto">
        <Card>
          <CardContent className="p-4 text-center">
            <FileText className="w-8 h-8 mx-auto mb-2 text-blue-500" />
            <h3 className="font-semibold mb-1">Setup Guide</h3>
            <p className="text-sm text-gray-600 mb-3">View detailed setup instructions</p>
            <Button variant="outline" size="sm">
              <ExternalLink className="w-4 h-4 mr-2" />
              Open Guide
            </Button>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4 text-center">
            <Settings className="w-8 h-8 mx-auto mb-2 text-green-500" />
            <h3 className="font-semibold mb-1">Test Stream</h3>
            <p className="text-sm text-gray-600 mb-3">Start a test stream to verify setup</p>
            <Button size="sm">
              <Play className="w-4 h-4 mr-2" />
              Test Now
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );

  const renderStepContent = () => {
    switch (steps[currentStep].id) {
      case 'welcome': return renderWelcomeStep();
      case 'system-check': return renderSystemCheckStep();
      case 'obs-connection': return renderOBSConnectionStep();
      case 'performance-test': return renderSystemCheckStep(); // Reuse for now
      case 'configuration': return renderConfigurationStep();
      case 'setup-complete': return renderCompleteStep();
      default: return renderWelcomeStep();
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">OBS Setup Wizard</h1>
        <p className="text-gray-600">Configure OBS Studio for optimal streaming with MeetingMind</p>
      </div>

      {/* Progress Steps */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          {steps.map((step, index) => (
            <div
              key={step.id}
              className={`flex items-center ${index < steps.length - 1 ? 'flex-1' : ''}`}
            >
              <div className={`flex items-center space-x-2 ${index <= currentStep ? 'text-blue-600' : 'text-gray-400'}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 ${
                  index <= currentStep ? 'border-blue-600 bg-blue-50' : 'border-gray-300'
                }`}>
                  {index < currentStep ? (
                    <CheckCircle className="w-4 h-4" />
                  ) : (
                    getStepIcon(step.id)
                  )}
                </div>
                <div className="hidden sm:block">
                  <p className="text-sm font-medium">{step.title}</p>
                  <p className="text-xs">{step.description}</p>
                </div>
              </div>
              {index < steps.length - 1 && (
                <div className={`flex-1 h-px mx-4 ${index < currentStep ? 'bg-blue-600' : 'bg-gray-300'}`} />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Step Content */}
      <Card className="min-h-[600px]">
        <CardContent className="p-8">
          {renderStepContent()}
        </CardContent>
      </Card>

      {/* Navigation */}
      <div className="flex justify-between mt-6">
        <Button
          variant="outline"
          onClick={prevStep}
          disabled={currentStep === 0}
        >
          Previous
        </Button>
        
        <div className="flex space-x-2">
          <Button
            variant="outline"
            onClick={() => setCurrentStep(0)}
          >
            Restart
          </Button>
          
          <Button
            onClick={nextStep}
            disabled={currentStep === steps.length - 1}
          >
            {currentStep === steps.length - 2 ? 'Finish' : 'Next'}
          </Button>
        </div>
      </div>
    </div>
  );
};