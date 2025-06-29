// Debug Panel Component
// Educational component that shows all WebSocket messages and connection details
// for learning and debugging purposes

import { useState } from 'react';
import { WebSocketHook } from '../hooks/useWebSocket';

interface DebugPanelProps {
  websocket: WebSocketHook;
}

/**
 * DebugPanel Component
 * 
 * This educational component provides:
 * - Real-time display of all WebSocket messages
 * - Message filtering and search functionality
 * - JSON formatting for easy reading
 * - Connection statistics and debugging info
 * - Message history with timestamps
 * - Export functionality for analysis
 * 
 * Learning Features:
 * - Shows actual WebSocket message structure
 * - Demonstrates message types and data formats
 * - Reveals connection lifecycle events
 * - Helps understand real-time communication patterns
 */
export const DebugPanel: React.FC<DebugPanelProps> = ({ websocket }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [messageFilter, setMessageFilter] = useState('');
  const [selectedMessageTypes, setSelectedMessageTypes] = useState<string[]>(['all']);
  
  // Get unique message types for filtering
  const messageTypes = ['all', ...new Set(websocket.messages.map(msg => msg.type))];
  
  // Filter messages based on search and type filters
  const filteredMessages = websocket.messages.filter(message => {
    const matchesFilter = messageFilter === '' || 
      JSON.stringify(message).toLowerCase().includes(messageFilter.toLowerCase());
    
    const matchesType = selectedMessageTypes.includes('all') || 
      selectedMessageTypes.includes(message.type);
    
    return matchesFilter && matchesType;
  });
  
  // Toggle message type filter
  const toggleMessageType = (type: string) => {
    if (type === 'all') {
      setSelectedMessageTypes(['all']);
    } else {
      setSelectedMessageTypes(prev => {
        const newTypes = prev.includes(type) 
          ? prev.filter(t => t !== type)
          : [...prev.filter(t => t !== 'all'), type];
        
        return newTypes.length === 0 ? ['all'] : newTypes;
      });
    }
  };
  
  // Format timestamp for display
  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return `${date.toLocaleTimeString()}.${date.getMilliseconds().toString().padStart(3, '0')}`;
  };
  
  // Get color for message type
  const getMessageTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      'connection_established': 'bg-green-100 text-green-800',
      'chat_message': 'bg-blue-100 text-blue-800',
      'user_joined': 'bg-purple-100 text-purple-800',
      'user_left': 'bg-orange-100 text-orange-800',
      'user_typing': 'bg-yellow-100 text-yellow-800',
      'ping': 'bg-gray-100 text-gray-600',
      'pong': 'bg-gray-100 text-gray-600',
      'error': 'bg-red-100 text-red-800',
      'message_history': 'bg-indigo-100 text-indigo-800'
    };
    
    return colors[type] || 'bg-gray-100 text-gray-800';
  };
  
  // Export messages as JSON
  const exportMessages = () => {
    const dataStr = JSON.stringify(filteredMessages, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `websocket-messages-${new Date().toISOString()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };
  
  // Send test message
  const sendTestMessage = (type: string) => {
    const testMessages: Record<string, Record<string, unknown>> = {
      ping: { timestamp: new Date().toISOString() },
      chat_message: { 
        message: 'Test message from debug panel',
        sender_name: 'Debug Panel'
      },
      typing_start: { user_name: 'Debug Panel' },
      meeting_action: {
        action: 'test_action',
        user_name: 'Debug Panel',
        details: { source: 'debug_panel' }
      }
    };
    
    if (testMessages[type]) {
      websocket.sendMessage(type, testMessages[type]);
    }
  };
  
  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
      {/* Header */}
      <div 
        className="flex items-center justify-between p-4 border-b border-gray-200 cursor-pointer bg-gray-50 rounded-t-lg"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center space-x-2">
          <span className="text-lg">🔧</span>
          <h3 className="text-lg font-semibold text-gray-900">WebSocket Debug Panel</h3>
          <span className="text-sm text-gray-500">
            ({websocket.messages.length} messages)
          </span>
        </div>
        <div className="flex items-center space-x-2">
          {/* Connection State Badge */}
          <span className={`px-2 py-1 text-xs font-medium rounded-full ${
            websocket.isConnected 
              ? 'bg-green-100 text-green-800' 
              : 'bg-red-100 text-red-800'
          }`}>
            {websocket.state.toUpperCase()}
          </span>
          
          {/* Expand/Collapse Icon */}
          <span className={`transform transition-transform ${
            isExpanded ? 'rotate-180' : ''
          }`}>
            ⌄
          </span>
        </div>
      </div>
      
      {isExpanded && (
        <div className="p-4">
          {/* Controls */}
          <div className="mb-4 space-y-3">
            {/* Search Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Search Messages
              </label>
              <input
                type="text"
                value={messageFilter}
                onChange={(e) => setMessageFilter(e.target.value)}
                placeholder="Search in message content..."
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            
            {/* Message Type Filters */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Message Types
              </label>
              <div className="flex flex-wrap gap-2">
                {messageTypes.map(type => (
                  <button
                    key={type}
                    onClick={() => toggleMessageType(type)}
                    className={`px-3 py-1 text-xs rounded-full font-medium transition-colors ${
                      selectedMessageTypes.includes(type)
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                    }`}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>
            
            {/* Action Buttons */}
            <div className="flex flex-wrap gap-2">
              <button
                onClick={websocket.clearMessages}
                className="px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700"
              >
                Clear Messages
              </button>
              
              <button
                onClick={exportMessages}
                className="px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700"
                disabled={filteredMessages.length === 0}
              >
                Export JSON
              </button>
              
              {/* Test Message Buttons */}
              {websocket.isConnected && (
                <>
                  <button
                    onClick={() => sendTestMessage('ping')}
                    className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
                  >
                    Send Ping
                  </button>
                  
                  <button
                    onClick={() => sendTestMessage('chat_message')}
                    className="px-3 py-1 text-sm bg-purple-600 text-white rounded hover:bg-purple-700"
                  >
                    Test Chat
                  </button>
                </>
              )}
            </div>
          </div>
          
          {/* Message List */}
          <div className="border border-gray-200 rounded-lg">
            <div className="bg-gray-50 px-3 py-2 border-b border-gray-200">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-gray-700">
                  Messages ({filteredMessages.length})
                </span>
                {filteredMessages.length !== websocket.messages.length && (
                  <span className="text-xs text-gray-500">
                    Filtered from {websocket.messages.length} total
                  </span>
                )}
              </div>
            </div>
            
            <div className="max-h-80 overflow-y-auto">
              {filteredMessages.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  <div className="text-4xl mb-2">📭</div>
                  <p>No messages to display</p>
                  <p className="text-sm mt-1">
                    {websocket.messages.length === 0 
                      ? 'Connect and start chatting to see messages'
                      : 'Try adjusting your filters'
                    }
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-gray-200">
                  {filteredMessages.map((message, index) => (
                    <div key={index} className="p-3">
                      {/* Message Header */}
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center space-x-2">
                          <span className={`px-2 py-1 text-xs font-medium rounded ${getMessageTypeColor(message.type)}`}>
                            {message.type}
                          </span>
                          <span className="text-xs text-gray-500 font-mono">
                            {formatTimestamp(message.timestamp)}
                          </span>
                        </div>
                        
                        {/* Message Direction Indicator */}
                        <div className="text-xs text-gray-400">
                          {index === filteredMessages.length - 1 && '← Latest'}
                        </div>
                      </div>
                      
                      {/* Message Content */}
                      <div className="bg-gray-50 rounded p-3 overflow-x-auto">
                        <pre className="text-xs text-gray-800 whitespace-pre-wrap">
                          {JSON.stringify(message, null, 2)}
                        </pre>
                      </div>
                      
                      {/* Message Details */}
                      {message.data && typeof message.data === 'object' && (
                        <div className="mt-2 text-xs text-gray-600">
                          <strong>Key fields:</strong> {Object.keys(message.data).join(', ')}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          
          {/* Connection Statistics */}
          <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div className="text-center p-3 bg-blue-50 rounded">
              <div className="font-semibold text-blue-900">{websocket.messages.length}</div>
              <div className="text-blue-700">Total Messages</div>
            </div>
            
            <div className="text-center p-3 bg-green-50 rounded">
              <div className="font-semibold text-green-900">{websocket.activeConnections}</div>
              <div className="text-green-700">Active Connections</div>
            </div>
            
            <div className="text-center p-3 bg-purple-50 rounded">
              <div className="font-semibold text-purple-900">{messageTypes.length - 1}</div>
              <div className="text-purple-700">Message Types</div>
            </div>
            
            <div className="text-center p-3 bg-orange-50 rounded">
              <div className="font-semibold text-orange-900">{websocket.reconnectAttempts}</div>
              <div className="text-orange-700">Reconnect Attempts</div>
            </div>
          </div>
          
          {/* Educational Notes */}
          <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded text-sm">
            <div className="font-semibold text-blue-900 mb-2">🎓 Learning Notes:</div>
            <ul className="text-blue-800 space-y-1">
              <li>• Each message follows the format: {`{type, data, timestamp}`}</li>
              <li>• Message types determine how the frontend processes the data</li>
              <li>• Timestamps show when messages were created (ISO format)</li>
              <li>• Connection events (join/leave) are automatically generated</li>
              <li>• Ping/pong messages maintain connection health</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
};