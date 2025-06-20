// Main App component for MeetingMind
// Enhanced with comprehensive WebSocket integration, chat interface, and debugging tools
// This demonstrates real-time communication patterns and educational WebSocket usage

import { useState } from 'react';
import { useWebSocket } from './hooks/useWebSocket';
import { ChatInterface } from './components/ChatInterface';
import { ConnectionStatus } from './components/ConnectionStatus';
import { DebugPanel } from './components/DebugPanel';
import { AudioInterface } from './components/AudioInterface';
import { AIProviderManager } from './components/AIProviderManager';
import { AIPlayground } from './components/AIPlayground';
import { AIHealthMonitor } from './components/AIHealthMonitor';
import { MeetingDashboard } from './components/MeetingDashboard';
import { MeetingTemplates } from './components/MeetingTemplates';
import { DatabaseVisualizer } from './components/DatabaseVisualizer';

function App() {
  // Generate a unique client ID for this session
  // In a real app, this would come from user authentication
  const [clientId] = useState(() => `user_${Math.random().toString(36).substr(2, 9)}`);
  const [userName] = useState(() => `User ${Math.floor(Math.random() * 1000)}`);
  
  // Initialize WebSocket connection using our custom hook
  // This provides connection management, automatic reconnection, and message handling
  const websocket = useWebSocket({
    url: `ws://localhost:8000/ws/${clientId}`,
    debug: true, // Enable detailed logging for educational purposes
    reconnectInterval: 1000,      // Start reconnection after 1 second
    maxReconnectAttempts: 10,     // Try up to 10 times
    heartbeatInterval: 30000      // Send ping every 30 seconds
  });
  
  // Component state for UI interactions
  const [activeTab, setActiveTab] = useState<'meetings' | 'templates' | 'database' | 'audio' | 'chat' | 'debug' | 'ai' | 'playground' | 'health'>('meetings');

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Header with Enhanced Connection Status */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center">
              <h1 className="text-2xl font-bold text-gray-900">MeetingMind</h1>
              <span className="ml-3 px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded-full">
                AI-Powered Meeting Assistant
              </span>
            </div>
            
            {/* Quick Connection Status in Header */}
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <div className={`w-3 h-3 rounded-full ${
                  websocket.isConnected ? 'bg-green-400' : 'bg-red-400'
                }`}></div>
                <span className="text-sm text-gray-600">
                  {websocket.isConnected ? 'Connected' : websocket.state}
                </span>
              </div>
              
              {/* Active Users Count */}
              {websocket.isConnected && (
                <span className="text-sm text-gray-500">
                  {websocket.activeConnections} user{websocket.activeConnections !== 1 ? 's' : ''} online
                </span>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {/* Introduction Section */}
        <div className="mb-8">
          <div className="card">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              AI-Powered Meeting Assistant Platform
            </h2>
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <p className="text-gray-600 mb-4">
                  Comprehensive meeting assistant platform featuring:
                </p>
                <ul className="text-sm text-gray-600 space-y-1">
                  <li>• <strong>Meeting Management:</strong> Full-featured meeting lifecycle management</li>
                  <li>• <strong>Database Integration:</strong> SQLAlchemy models with PostgreSQL backend</li>
                  <li>• <strong>Real-time Audio:</strong> Live audio capture and streaming</li>
                  <li>• <strong>AI Integration:</strong> Multiple provider support (Anthropic, OpenAI, X.AI)</li>
                  <li>• <strong>Provider Management:</strong> Health monitoring and cost tracking</li>
                  <li>• <strong>Interactive Testing:</strong> AI playground with side-by-side comparison</li>
                  <li>• <strong>WebSocket Communication:</strong> Real-time chat and notifications</li>
                </ul>
              </div>
              <div className="bg-blue-50 p-4 rounded-lg">
                <h4 className="font-semibold text-blue-900 mb-2">🎓 Platform Features:</h4>
                <ul className="text-sm text-blue-800 space-y-1">
                  <li>• Comprehensive meeting dashboard with CRUD operations</li>
                  <li>• Advanced filtering, search, and pagination</li>
                  <li>• Meeting statistics and analytics visualization</li>
                  <li>• Dynamic AI provider configuration and management</li>
                  <li>• Real-time health monitoring and cost optimization</li>
                  <li>• Interactive AI testing and comparison tools</li>
                  <li>• Live audio streaming with visualization</li>
                  <li>• Educational explanations and best practices</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
        
        {/* Main Demo Area */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Left Column - Chat and Tabs */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* Tab Navigation */}
            <div className="flex space-x-1 bg-gray-100 p-1 rounded-lg">
              <button
                onClick={() => setActiveTab('meetings')}
                className={`flex-1 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                  activeTab === 'meetings'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                📅 Meetings
              </button>
              <button
                onClick={() => setActiveTab('templates')}
                className={`flex-1 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                  activeTab === 'templates'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                📝 Templates
              </button>
              <button
                onClick={() => setActiveTab('database')}
                className={`flex-1 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                  activeTab === 'database'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                🗄️ Database
              </button>
              <button
                onClick={() => setActiveTab('audio')}
                className={`flex-1 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                  activeTab === 'audio'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                🎤 Audio Streaming
              </button>
              <button
                onClick={() => setActiveTab('chat')}
                className={`flex-1 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                  activeTab === 'chat'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                💬 Live Chat
              </button>
              <button
                onClick={() => setActiveTab('debug')}
                className={`flex-1 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                  activeTab === 'debug'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                🔧 Debug Panel
              </button>
              <button
                onClick={() => setActiveTab('ai')}
                className={`flex-1 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                  activeTab === 'ai'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                🤖 AI Providers
              </button>
              <button
                onClick={() => setActiveTab('playground')}
                className={`flex-1 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                  activeTab === 'playground'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                🧪 AI Playground
              </button>
              <button
                onClick={() => setActiveTab('health')}
                className={`flex-1 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                  activeTab === 'health'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                🏥 Health Monitor
              </button>
            </div>
            
            {/* Tab Content */}
            {activeTab === 'meetings' && (
              <div>
                <MeetingDashboard clientId={clientId} />
                
                {/* Meeting Dashboard Instructions */}
                <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <h4 className="font-semibold text-blue-800 mb-2">📅 Meeting Dashboard Features:</h4>
                  <ul className="text-sm text-blue-700 space-y-1">
                    <li>• Create and manage meetings with comprehensive scheduling</li>
                    <li>• Real-time meeting status updates (start, pause, end, cancel)</li>
                    <li>• Advanced filtering and search capabilities</li>
                    <li>• Meeting statistics and analytics dashboard</li>
                    <li>• Participant management and engagement tracking</li>
                  </ul>
                </div>
              </div>
            )}
            
            {activeTab === 'templates' && (
              <div>
                <MeetingTemplates clientId={clientId} />
                
                {/* Templates Instructions */}
                <div className="mt-4 p-4 bg-purple-50 border border-purple-200 rounded-lg">
                  <h4 className="font-semibold text-purple-800 mb-2">📝 Meeting Templates Features:</h4>
                  <ul className="text-sm text-purple-700 space-y-1">
                    <li>• Create reusable meeting templates for recurring events</li>
                    <li>• Predefined templates for common meeting types (standups, planning, etc.)</li>
                    <li>• Customizable agenda templates and default settings</li>
                    <li>• Public and private template sharing capabilities</li>
                    <li>• One-click meeting creation from templates</li>
                  </ul>
                </div>
              </div>
            )}
            
            {activeTab === 'database' && (
              <div>
                <DatabaseVisualizer />
                
                {/* Database Visualizer Instructions */}
                <div className="mt-4 p-4 bg-indigo-50 border border-indigo-200 rounded-lg">
                  <h4 className="font-semibold text-indigo-800 mb-2">🗄️ Database Visualizer Features:</h4>
                  <ul className="text-sm text-indigo-700 space-y-1">
                    <li>• Interactive schema visualization with zoom and pan controls</li>
                    <li>• Detailed table information with column types and constraints</li>
                    <li>• Relationship mapping showing foreign key connections</li>
                    <li>• Primary key, foreign key, and constraint indicators</li>
                    <li>• Comprehensive database statistics and metadata</li>
                  </ul>
                </div>
              </div>
            )}
            
            {activeTab === 'audio' && (
              <div>
                <AudioInterface 
                  clientId={clientId}
                  websocketUrl={`ws://localhost:8000/ws/${clientId}`}
                />
                
                {/* Audio Instructions */}
                <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
                  <h4 className="font-semibold text-green-800 mb-2">🎤 Audio Streaming Demo:</h4>
                  <ul className="text-sm text-green-700 space-y-1">
                    <li>• Grant microphone permission when prompted</li>
                    <li>• Select your preferred audio input device</li>
                    <li>• Start recording to see real-time visualization</li>
                    <li>• Watch the statistics tab for performance metrics</li>
                    <li>• Enable Learning Mode for detailed explanations</li>
                  </ul>
                </div>
              </div>
            )}
            
            {activeTab === 'chat' && (
              <div>
                <ChatInterface 
                  clientId={clientId} 
                  userName={userName}
                />
                
                {/* Chat Instructions */}
                <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <h4 className="font-semibold text-yellow-800 mb-2">💡 Try This:</h4>
                  <ul className="text-sm text-yellow-700 space-y-1">
                    <li>• Open this page in multiple browser tabs to test real-time chat</li>
                    <li>• Type a message and watch it appear in other tabs instantly</li>
                    <li>• Start typing to see typing indicators in action</li>
                    <li>• Disconnect and reconnect to test automatic reconnection</li>
                  </ul>
                </div>
              </div>
            )}
            
            {activeTab === 'debug' && (
              <div>
                <DebugPanel websocket={websocket} />
                
                {/* Debug Instructions */}
                <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <h4 className="font-semibold text-blue-800 mb-2">🔍 Debug Features:</h4>
                  <ul className="text-sm text-blue-700 space-y-1">
                    <li>• View all WebSocket messages in real-time</li>
                    <li>• Filter messages by type or content</li>
                    <li>• Send test messages to understand the protocol</li>
                    <li>• Export message history for analysis</li>
                    <li>• Monitor connection statistics and health</li>
                  </ul>
                </div>
              </div>
            )}
            
            {activeTab === 'ai' && (
              <div>
                <AIProviderManager clientId={clientId} />
                
                {/* AI Provider Instructions */}
                <div className="mt-4 p-4 bg-purple-50 border border-purple-200 rounded-lg">
                  <h4 className="font-semibold text-purple-800 mb-2">🤖 AI Provider Management:</h4>
                  <ul className="text-sm text-purple-700 space-y-1">
                    <li>• Monitor real-time status and health of all AI providers</li>
                    <li>• Track usage costs and performance metrics</li>
                    <li>• Test individual providers with custom prompts</li>
                    <li>• Configure provider priorities and settings</li>
                    <li>• View comprehensive analytics and optimization tips</li>
                  </ul>
                </div>
              </div>
            )}
            
            {activeTab === 'playground' && (
              <div>
                <AIPlayground clientId={clientId} />
                
                {/* Playground Instructions */}
                <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
                  <h4 className="font-semibold text-green-800 mb-2">🧪 AI Playground Features:</h4>
                  <ul className="text-sm text-green-700 space-y-1">
                    <li>• Test and compare AI providers side-by-side</li>
                    <li>• Experiment with different prompts and parameters</li>
                    <li>• Use pre-built templates for common use cases</li>
                    <li>• Monitor response quality, cost, and performance</li>
                    <li>• Export results for analysis and documentation</li>
                  </ul>
                </div>
              </div>
            )}
            
            {activeTab === 'health' && (
              <div>
                <AIHealthMonitor />
                
                {/* Health Monitor Instructions */}
                <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                  <h4 className="font-semibold text-red-800 mb-2">🏥 Health Monitoring Features:</h4>
                  <ul className="text-sm text-red-700 space-y-1">
                    <li>• Real-time provider health status and performance monitoring</li>
                    <li>• Automatic alerting for failures and degraded performance</li>
                    <li>• Historical uptime and response time analytics</li>
                    <li>• Manual health checks and metrics reset capabilities</li>
                    <li>• System-wide health scoring and compliance tracking</li>
                  </ul>
                </div>
              </div>
            )}
          </div>

          {/* Right Column - Connection Status and Info */}
          <div className="space-y-6">
            
            {/* Enhanced Connection Status */}
            <ConnectionStatus websocket={websocket} />
            
            {/* User Information */}
            <div className="card">
              <h3 className="text-lg font-medium text-gray-900 mb-3">Session Info</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Your ID:</span>
                  <span className="font-mono text-gray-900">{clientId}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Display Name:</span>
                  <span className="text-gray-900">{userName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Connection ID:</span>
                  <span className="font-mono text-gray-900 text-xs">
                    {websocket.connectionId ? 
                      `${websocket.connectionId.slice(0, 12)}...` : 
                      'Not connected'
                    }
                  </span>
                </div>
              </div>
            </div>
            
            {/* WebSocket Concepts */}
            <div className="card">
              <h3 className="text-lg font-medium text-gray-900 mb-3">WebSocket Concepts</h3>
              <div className="space-y-3 text-sm">
                <div>
                  <h4 className="font-semibold text-gray-800">Connection States:</h4>
                  <ul className="mt-1 space-y-1 text-gray-600">
                    <li>• <span className="text-yellow-600">CONNECTING</span> - Handshake in progress</li>
                    <li>• <span className="text-green-600">CONNECTED</span> - Ready for communication</li>
                    <li>• <span className="text-orange-600">RECONNECTING</span> - Automatic recovery</li>
                    <li>• <span className="text-gray-600">DISCONNECTED</span> - No active connection</li>
                    <li>• <span className="text-red-600">ERROR</span> - Connection failed</li>
                  </ul>
                </div>
                
                <div>
                  <h4 className="font-semibold text-gray-800">Message Types:</h4>
                  <ul className="mt-1 space-y-1 text-gray-600">
                    <li>• <code className="text-xs bg-gray-100 px-1 rounded">chat_message</code> - User messages</li>
                    <li>• <code className="text-xs bg-gray-100 px-1 rounded">user_typing</code> - Typing indicators</li>
                    <li>• <code className="text-xs bg-gray-100 px-1 rounded">ping/pong</code> - Keep-alive</li>
                    <li>• <code className="text-xs bg-gray-100 px-1 rounded">user_joined</code> - Connection events</li>
                  </ul>
                </div>
              </div>
            </div>
            
            {/* Quick Actions */}
            <div className="card">
              <h3 className="text-lg font-medium text-gray-900 mb-3">Quick Actions</h3>
              <div className="space-y-2">
                <button
                  onClick={() => websocket.sendMessage('ping', { timestamp: new Date().toISOString() })}
                  disabled={!websocket.isConnected}
                  className="w-full px-3 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                >
                  Send Ping
                </button>
                
                <button
                  onClick={websocket.clearMessages}
                  className="w-full px-3 py-2 text-sm bg-gray-600 text-white rounded hover:bg-gray-700"
                >
                  Clear Message History
                </button>
                
                <button
                  onClick={() => window.open(window.location.href, '_blank')}
                  className="w-full px-3 py-2 text-sm bg-green-600 text-white rounded hover:bg-green-700"
                >
                  Open New Tab
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Technology Stack Info */}
        <div className="mt-12">
          <div className="card">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              Technology Stack
            </h2>
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <h3 className="font-semibold text-gray-800 mb-2">Backend (FastAPI)</h3>
                <ul className="text-sm text-gray-600 space-y-1">
                  <li>• Async WebSocket endpoint with connection management</li>
                  <li>• Message broadcasting and routing</li>
                  <li>• Automatic connection cleanup and error handling</li>
                  <li>• Heartbeat monitoring and health checks</li>
                </ul>
              </div>
              <div>
                <h3 className="font-semibold text-gray-800 mb-2">Frontend (React)</h3>
                <ul className="text-sm text-gray-600 space-y-1">
                  <li>• Custom useWebSocket hook with lifecycle management</li>
                  <li>• Exponential backoff reconnection strategy</li>
                  <li>• Real-time UI updates and state synchronization</li>
                  <li>• Educational debugging and monitoring tools</li>
                </ul>
              </div>
            </div>
          </div>
        </div>

      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <p className="text-center text-sm text-gray-500">
            MeetingMind - AI-Powered Meeting Assistant Platform
          </p>
        </div>
      </footer>
    </div>
  );
}

export default App;