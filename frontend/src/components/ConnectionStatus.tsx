// Connection Status Component
// Provides visual feedback about WebSocket connection state with detailed information
// and connection management controls

import { WebSocketState, WebSocketHook } from '../hooks/useWebSocket';

interface ConnectionStatusProps {
  websocket: WebSocketHook;
}

/**
 * ConnectionStatus Component
 * 
 * This component provides comprehensive connection status information including:
 * - Visual connection state indicator with colors
 * - Connection metadata (attempts, active users, etc.)
 * - Manual connection controls
 * - Error display and handling
 * - Connection quality indicators
 * 
 * Connection States Explained:
 * - CONNECTING: Initial handshake in progress (yellow)
 * - CONNECTED: Ready for communication (green)
 * - DISCONNECTED: No active connection (gray)
 * - RECONNECTING: Attempting to restore connection (orange)
 * - ERROR: Connection failed or error occurred (red)
 */
export const ConnectionStatus: React.FC<ConnectionStatusProps> = ({ websocket }) => {
  // Get visual styling based on connection state
  const getStatusStyles = () => {
    switch (websocket.state) {
      case WebSocketState.CONNECTED:
        return {
          indicator: 'bg-green-400',
          text: 'text-green-800',
          background: 'bg-green-50 border-green-200',
          icon: '✅'
        };
      case WebSocketState.CONNECTING:
        return {
          indicator: 'bg-yellow-400 animate-pulse',
          text: 'text-yellow-800',
          background: 'bg-yellow-50 border-yellow-200',
          icon: '🔄'
        };
      case WebSocketState.RECONNECTING:
        return {
          indicator: 'bg-orange-400 animate-pulse',
          text: 'text-orange-800',
          background: 'bg-orange-50 border-orange-200',
          icon: '🔄'
        };
      case WebSocketState.DISCONNECTED:
        return {
          indicator: 'bg-gray-400',
          text: 'text-gray-800',
          background: 'bg-gray-50 border-gray-200',
          icon: '❌'
        };
      case WebSocketState.ERROR:
        return {
          indicator: 'bg-red-400',
          text: 'text-red-800',
          background: 'bg-red-50 border-red-200',
          icon: '⚠️'
        };
      default:
        return {
          indicator: 'bg-gray-400',
          text: 'text-gray-800',
          background: 'bg-gray-50 border-gray-200',
          icon: '❓'
        };
    }
  };
  
  // Get human-readable status text
  const getStatusText = () => {
    switch (websocket.state) {
      case WebSocketState.CONNECTED:
        return 'Connected';
      case WebSocketState.CONNECTING:
        return 'Connecting...';
      case WebSocketState.RECONNECTING:
        return `Reconnecting... (${websocket.reconnectAttempts}/5)`;
      case WebSocketState.DISCONNECTED:
        return 'Disconnected';
      case WebSocketState.ERROR:
        return 'Connection Error';
      default:
        return 'Unknown State';
    }
  };
  
  // Get detailed status description
  const getStatusDescription = () => {
    switch (websocket.state) {
      case WebSocketState.CONNECTED:
        return 'Real-time communication is active. Messages will be delivered instantly.';
      case WebSocketState.CONNECTING:
        return 'Establishing connection to the server. Please wait...';
      case WebSocketState.RECONNECTING:
        return 'Connection lost. Attempting to reconnect automatically.';
      case WebSocketState.DISCONNECTED:
        return 'No active connection. Click connect to establish communication.';
      case WebSocketState.ERROR:
        return 'Connection failed. Check your internet connection and try again.';
      default:
        return 'Connection state unknown.';
    }
  };
  
  const styles = getStatusStyles();
  
  return (
    <div className={`border rounded-lg p-4 ${styles.background}`}>
      {/* Main Status Row */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center space-x-3">
          {/* Status Indicator */}
          <div className="flex items-center space-x-2">
            <div className={`w-3 h-3 rounded-full ${styles.indicator}`}></div>
            <span className={`font-semibold ${styles.text}`}>
              {styles.icon} {getStatusText()}
            </span>
          </div>
        </div>
        
        {/* Connection Controls */}
        <div className="flex space-x-2">
          {websocket.state === WebSocketState.DISCONNECTED && (
            <button
              onClick={websocket.connect}
              className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
            >
              Connect
            </button>
          )}
          
          {(websocket.state === WebSocketState.CONNECTED || 
            websocket.state === WebSocketState.CONNECTING) && (
            <button
              onClick={websocket.disconnect}
              className="px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
            >
              Disconnect
            </button>
          )}
          
          {websocket.state === WebSocketState.ERROR && (
            <button
              onClick={() => {
                websocket.disconnect();
                setTimeout(websocket.connect, 100);
              }}
              className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
            >
              Retry
            </button>
          )}
        </div>
      </div>
      
      {/* Status Description */}
      <p className={`text-sm mb-3 ${styles.text} opacity-80`}>
        {getStatusDescription()}
      </p>
      
      {/* Connection Details */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
        {/* Active Connections */}
        <div className="text-center">
          <div className={`font-semibold ${styles.text}`}>
            {websocket.activeConnections}
          </div>
          <div className={`text-xs ${styles.text} opacity-70`}>
            Active Users
          </div>
        </div>
        
        {/* Connection ID */}
        <div className="text-center">
          <div className={`font-semibold ${styles.text} font-mono text-xs`}>
            {websocket.connectionId ? 
              `${websocket.connectionId.slice(0, 8)}...` : 
              'N/A'
            }
          </div>
          <div className={`text-xs ${styles.text} opacity-70`}>
            Connection ID
          </div>
        </div>
        
        {/* Reconnect Attempts */}
        <div className="text-center">
          <div className={`font-semibold ${styles.text}`}>
            {websocket.reconnectAttempts}/5
          </div>
          <div className={`text-xs ${styles.text} opacity-70`}>
            Reconnect Attempts
          </div>
        </div>
        
        {/* Messages Count */}
        <div className="text-center">
          <div className={`font-semibold ${styles.text}`}>
            {websocket.messages.length}
          </div>
          <div className={`text-xs ${styles.text} opacity-70`}>
            Messages Received
          </div>
        </div>
      </div>
      
      {/* Error Display */}
      {websocket.lastError && (
        <div className="mt-3 p-3 bg-red-100 border border-red-200 rounded text-red-800 text-sm">
          <div className="font-semibold">⚠️ Connection Error</div>
          <div className="mt-1">{websocket.lastError}</div>
        </div>
      )}
      
      {/* Connection Quality Indicator */}
      {websocket.isConnected && (
        <div className="mt-3 flex items-center space-x-2 text-sm text-green-700">
          <div className="flex space-x-1">
            <div className="w-1 h-3 bg-green-400 rounded"></div>
            <div className="w-1 h-3 bg-green-400 rounded"></div>
            <div className="w-1 h-3 bg-green-400 rounded"></div>
            <div className="w-1 h-3 bg-green-300 rounded"></div>
          </div>
          <span className="text-xs">Good connection quality</span>
        </div>
      )}
      
      {/* WebSocket URL Info */}
      <div className="mt-3 pt-3 border-t border-gray-200 text-xs text-gray-600">
        <div className="font-medium">WebSocket Endpoint:</div>
        <div className="font-mono mt-1 break-all">
          ws://localhost:8000/ws/{websocket.connectionId || 'client_id'}
        </div>
      </div>
    </div>
  );
};