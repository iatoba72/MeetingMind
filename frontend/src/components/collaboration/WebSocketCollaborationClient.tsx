// WebSocket Real-time Collaboration Client
// Handles real-time synchronization with collaboration server

import React, { useState, useEffect, useRef, useCallback, createContext, useContext } from 'react';
import { 
  Wifi, 
  WifiOff, 
  AlertCircle, 
  // CheckCircle, 
  // Clock, 
  RefreshCw,
  // Activity,
  // Users,
  // MessageSquare
} from 'lucide-react';

interface CollaborationMessage {
  type: string;
  data: any;
  userId?: string;
  documentId?: string;
  timestamp: string;
  messageId: string;
}

interface ConnectionState {
  status: 'connecting' | 'connected' | 'disconnected' | 'error' | 'reconnecting';
  lastPing?: number;
  latency?: number;
  reconnectAttempts: number;
  error?: string;
}

interface UserPresence {
  userId: string;
  userName: string;
  avatar?: string;
  color: string;
  cursor?: { position: number; timestamp: string };
  selection?: { start: number; end: number; timestamp: string };
  lastSeen: string;
  status: 'active' | 'idle' | 'away';
}

interface CollaborationContextType {
  connectionState: ConnectionState;
  users: UserPresence[];
  isConnected: boolean;
  sendMessage: (type: string, data: any) => void;
  connect: (documentId: string, userId: string, userName: string) => void;
  disconnect: () => void;
  reconnect: () => void;
  onMessage: (callback: (message: CollaborationMessage) => void) => () => void;
  onUserJoin: (callback: (user: UserPresence) => void) => () => void;
  onUserLeave: (callback: (userId: string) => void) => () => void;
  onPresenceUpdate: (callback: (users: UserPresence[]) => void) => () => void;
}

const CollaborationContext = createContext<CollaborationContextType | null>(null);

export const useCollaboration = () => {
  const context = useContext(CollaborationContext);
  if (!context) {
    throw new Error('useCollaboration must be used within a CollaborationProvider');
  }
  return context;
};

interface WebSocketCollaborationProviderProps {
  children: React.ReactNode;
  serverUrl?: string;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
  pingInterval?: number;
  debug?: boolean;
}

export const WebSocketCollaborationProvider: React.FC<WebSocketCollaborationProviderProps> = ({
  children,
  serverUrl = 'ws://localhost:8765',
  reconnectInterval = 3000,
  maxReconnectAttempts = 10,
  pingInterval = 30000,
  debug = false
}) => {
  const [connectionState, setConnectionState] = useState<ConnectionState>({
    status: 'disconnected',
    reconnectAttempts: 0
  });
  const [users, setUsers] = useState<UserPresence[]>([]);
  const [currentUser, setCurrentUser] = useState<{ id: string; name: string } | null>(null);
  const [documentId, setDocumentId] = useState<string | null>(null);
  
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();
  const pingIntervalRef = useRef<NodeJS.Timeout>();
  const messageCallbacks = useRef<((message: CollaborationMessage) => void)[]>([]);
  const userJoinCallbacks = useRef<((user: UserPresence) => void)[]>([]);
  const userLeaveCallbacks = useRef<((userId: string) => void)[]>([]);
  const presenceUpdateCallbacks = useRef<((users: UserPresence[]) => void)[]>([]);
  const messageQueue = useRef<CollaborationMessage[]>([]);
  
  const log = useCallback((message: string, level: 'info' | 'warn' | 'error' = 'info') => {
    if (debug) {
      console.log(`[WebSocketCollab] ${level.toUpperCase()}: ${message}`);
    }
  }, [debug]);
  
  // Generate unique message ID
  const generateMessageId = useCallback(() => {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }, []);
  
  // Send message through WebSocket
  const sendMessage = useCallback((type: string, data: any) => {
    const message: CollaborationMessage = {
      type,
      data,
      userId: currentUser?.id,
      documentId,
      timestamp: new Date().toISOString(),
      messageId: generateMessageId()
    };
    
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      try {
        wsRef.current.send(JSON.stringify(message));
        log(`Sent message: ${type}`);
      } catch (error) {
        log(`Failed to send message: ${error}`, 'error');
        // Queue message for retry
        messageQueue.current.push(message);
      }
    } else {
      log(`WebSocket not ready, queueing message: ${type}`, 'warn');
      messageQueue.current.push(message);
    }
  }, [currentUser, documentId, generateMessageId, log]);
  
  // Process queued messages
  const processMessageQueue = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      const queue = [...messageQueue.current];
      messageQueue.current = [];
      
      queue.forEach(message => {
        try {
          wsRef.current!.send(JSON.stringify(message));
          log(`Sent queued message: ${message.type}`);
        } catch (error) {
          log(`Failed to send queued message: ${error}`, 'error');
          messageQueue.current.push(message);
        }
      });
    }
  }, [log]);
  
  // Handle incoming WebSocket message
  const handleMessage = useCallback((event: MessageEvent) => {
    try {
      const message: CollaborationMessage = JSON.parse(event.data);
      log(`Received message: ${message.type}`);
      
      switch (message.type) {
        case 'user_join': {
          const joinedUser = message.data.user as UserPresence;
          setUsers(prev => [...prev.filter(u => u.userId !== joinedUser.userId), joinedUser]);
          userJoinCallbacks.current.forEach(callback => callback(joinedUser));
          break;
        }
          
        case 'user_leave': {
          const leftUserId = message.data.user_id;
          setUsers(prev => prev.filter(u => u.userId !== leftUserId));
          userLeaveCallbacks.current.forEach(callback => callback(leftUserId));
          break;
        }
          
        case 'presence_update': {
          const presenceUsers = message.data.users as UserPresence[];
          setUsers(presenceUsers);
          presenceUpdateCallbacks.current.forEach(callback => callback(presenceUsers));
          break;
        }
          
        case 'document_state':
          log('Received document state');
          break;
          
        case 'operation_ack':
          log(`Operation acknowledged: ${message.data.operation_id}`);
          break;
          
        case 'operation_reject':
          log(`Operation rejected: ${message.data.error}`, 'warn');
          break;
          
        case 'pong': {
          const now = Date.now();
          const latency = now - (message.data.timestamp ? new Date(message.data.timestamp).getTime() : now);
          setConnectionState(prev => ({ ...prev, lastPing: now, latency }));
          break;
        }
          
        case 'error':
          log(`Server error: ${message.data.message}`, 'error');
          setConnectionState(prev => ({ ...prev, error: message.data.message }));
          break;
      }
      
      // Notify all message callbacks
      messageCallbacks.current.forEach(callback => callback(message));
      
    } catch (error) {
      log(`Failed to parse message: ${error}`, 'error');
    }
  }, [log]);
  
  // Handle WebSocket connection open
  const handleOpen = useCallback(() => {
    log('WebSocket connected');
    setConnectionState(prev => ({
      ...prev,
      status: 'connected',
      reconnectAttempts: 0,
      error: undefined
    }));
    
    // Send initial user join message
    if (currentUser && documentId) {
      sendMessage('user_join', {
        user_id: currentUser.id,
        user_name: currentUser.name,
        document_id: documentId
      });
    }
    
    // Process any queued messages
    processMessageQueue();
    
    // Start ping interval
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
    }
    
    pingIntervalRef.current = setInterval(() => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        sendMessage('ping', { timestamp: new Date().toISOString() });
      }
    }, pingInterval);
    
  }, [currentUser, documentId, sendMessage, processMessageQueue, pingInterval, log]);
  
  // Handle WebSocket connection close
  const handleClose = useCallback((event: CloseEvent) => {
    log(`WebSocket closed: ${event.code} ${event.reason}`);
    setConnectionState(prev => ({ ...prev, status: 'disconnected' }));
    
    // Clear ping interval
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
    }
    
    // Attempt reconnection if not intentional close
    if (event.code !== 1000 && connectionState.reconnectAttempts < maxReconnectAttempts) {
      setConnectionState(prev => ({
        ...prev,
        status: 'reconnecting',
        reconnectAttempts: prev.reconnectAttempts + 1
      }));
      
      reconnectTimeoutRef.current = setTimeout(() => {
        reconnect();
      }, reconnectInterval);
    }
  }, [connectionState.reconnectAttempts, maxReconnectAttempts, reconnectInterval, log, reconnect]);
  
  // Handle WebSocket error
  const handleError = useCallback(() => {
    log('WebSocket error occurred', 'error');
    setConnectionState(prev => ({ 
      ...prev, 
      status: 'error',
      error: 'Connection error occurred'
    }));
  }, [log]);
  
  // Connect to WebSocket server
  const connect = useCallback((docId: string, userId: string, userName: string) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      log('Already connected');
      return;
    }
    
    setDocumentId(docId);
    setCurrentUser({ id: userId, name: userName });
    setConnectionState(prev => ({ ...prev, status: 'connecting' }));
    
    try {
      log(`Connecting to ${serverUrl}`);
      wsRef.current = new WebSocket(serverUrl);
      
      wsRef.current.onopen = handleOpen;
      wsRef.current.onmessage = handleMessage;
      wsRef.current.onclose = handleClose;
      wsRef.current.onerror = handleError;
      
    } catch (error) {
      log(`Failed to create WebSocket connection: ${error}`, 'error');
      setConnectionState(prev => ({ 
        ...prev, 
        status: 'error',
        error: 'Failed to create connection'
      }));
    }
  }, [serverUrl, handleOpen, handleMessage, handleClose, handleError, log]);
  
  // Disconnect from WebSocket server
  const disconnect = useCallback(() => {
    log('Disconnecting');
    
    // Clear timeouts
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
    }
    
    // Close WebSocket
    if (wsRef.current) {
      wsRef.current.close(1000, 'User disconnected');
      wsRef.current = null;
    }
    
    setConnectionState({
      status: 'disconnected',
      reconnectAttempts: 0
    });
    setUsers([]);
    setCurrentUser(null);
    setDocumentId(null);
    messageQueue.current = [];
  }, [log]);
  
  // Reconnect to WebSocket server
  const reconnect = useCallback(() => {
    if (currentUser && documentId) {
      log('Attempting to reconnect');
      disconnect();
      setTimeout(() => {
        connect(documentId, currentUser.id, currentUser.name);
      }, 1000);
    }
  }, [currentUser, documentId, connect, disconnect, log]);
  
  // Register message callback
  const onMessage = useCallback((callback: (message: CollaborationMessage) => void) => {
    messageCallbacks.current.push(callback);
    return () => {
      messageCallbacks.current = messageCallbacks.current.filter(cb => cb !== callback);
    };
  }, []);
  
  // Register user join callback
  const onUserJoin = useCallback((callback: (user: UserPresence) => void) => {
    userJoinCallbacks.current.push(callback);
    return () => {
      userJoinCallbacks.current = userJoinCallbacks.current.filter(cb => cb !== callback);
    };
  }, []);
  
  // Register user leave callback
  const onUserLeave = useCallback((callback: (userId: string) => void) => {
    userLeaveCallbacks.current.push(callback);
    return () => {
      userLeaveCallbacks.current = userLeaveCallbacks.current.filter(cb => cb !== callback);
    };
  }, []);
  
  // Register presence update callback
  const onPresenceUpdate = useCallback((callback: (users: UserPresence[]) => void) => {
    presenceUpdateCallbacks.current.push(callback);
    return () => {
      presenceUpdateCallbacks.current = presenceUpdateCallbacks.current.filter(cb => cb !== callback);
    };
  }, []);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);
  
  const value: CollaborationContextType = {
    connectionState,
    users,
    isConnected: connectionState.status === 'connected',
    sendMessage,
    connect,
    disconnect,
    reconnect,
    onMessage,
    onUserJoin,
    onUserLeave,
    onPresenceUpdate
  };
  
  return (
    <CollaborationContext.Provider value={value}>
      {children}
    </CollaborationContext.Provider>
  );
};

// Connection Status Component
export const ConnectionStatus: React.FC<{ className?: string }> = ({ className = '' }) => {
  const { connectionState, users, reconnect } = useCollaboration();
  const [showDetails, setShowDetails] = useState(false);
  
  const getStatusColor = () => {
    switch (connectionState.status) {
      case 'connected': return 'text-green-500';
      case 'connecting':
      case 'reconnecting': return 'text-yellow-500';
      case 'disconnected': return 'text-gray-500';
      case 'error': return 'text-red-500';
      default: return 'text-gray-500';
    }
  };
  
  const getStatusIcon = () => {
    switch (connectionState.status) {
      case 'connected': return <Wifi size={16} />;
      case 'connecting':
      case 'reconnecting': return <RefreshCw size={16} className="animate-spin" />;
      case 'disconnected': return <WifiOff size={16} />;
      case 'error': return <AlertCircle size={16} />;
      default: return <WifiOff size={16} />;
    }
  };
  
  const getStatusText = () => {
    switch (connectionState.status) {
      case 'connected': return 'Connected';
      case 'connecting': return 'Connecting...';
      case 'reconnecting': return `Reconnecting... (${connectionState.reconnectAttempts})`;
      case 'disconnected': return 'Disconnected';
      case 'error': return 'Connection Error';
      default: return 'Unknown';
    }
  };
  
  return (
    <div className={`relative ${className}`}>
      <button
        onClick={() => setShowDetails(!showDetails)}
        className={`flex items-center gap-2 px-3 py-1 rounded text-sm ${getStatusColor()} hover:bg-gray-100`}
        title="Connection status"
      >
        {getStatusIcon()}
        <span>{getStatusText()}</span>
        {connectionState.status === 'connected' && (
          <span className="text-gray-500">({users.length})</span>
        )}
      </button>
      
      {showDetails && (
        <div className="absolute top-full right-0 mt-1 w-80 bg-white border rounded-lg shadow-lg z-50 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-medium">Connection Details</h3>
            <button
              onClick={() => setShowDetails(false)}
              className="text-gray-400 hover:text-gray-600"
            >
              ×
            </button>
          </div>
          
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span>Status:</span>
              <span className={getStatusColor()}>{getStatusText()}</span>
            </div>
            
            {connectionState.latency && (
              <div className="flex justify-between">
                <span>Latency:</span>
                <span>{connectionState.latency}ms</span>
              </div>
            )}
            
            {connectionState.lastPing && (
              <div className="flex justify-between">
                <span>Last Ping:</span>
                <span>{new Date(connectionState.lastPing).toLocaleTimeString()}</span>
              </div>
            )}
            
            {connectionState.error && (
              <div className="text-red-500 text-xs mt-2">
                Error: {connectionState.error}
              </div>
            )}
            
            <div className="flex justify-between">
              <span>Active Users:</span>
              <span>{users.length}</span>
            </div>
            
            {users.length > 0 && (
              <div className="mt-3">
                <div className="text-xs text-gray-600 mb-2">Connected Users:</div>
                <div className="space-y-1">
                  {users.map(user => (
                    <div key={user.userId} className="flex items-center gap-2">
                      <div 
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: user.color }}
                      />
                      <span className="text-xs">{user.userName}</span>
                      <span className={`text-xs ${
                        user.status === 'active' ? 'text-green-500' :
                        user.status === 'idle' ? 'text-yellow-500' :
                        'text-gray-500'
                      }`}>
                        {user.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          
          {(connectionState.status === 'error' || connectionState.status === 'disconnected') && (
            <button
              onClick={reconnect}
              className="w-full mt-3 px-3 py-2 bg-blue-500 text-white rounded text-sm hover:bg-blue-600"
            >
              <RefreshCw size={14} className="inline mr-1" />
              Reconnect
            </button>
          )}
        </div>
      )}
    </div>
  );
};

// Real-time Operation Hooks
export const useRealtimeOperations = () => {
  const { sendMessage, onMessage } = useCollaboration();
  
  const sendOperation = useCallback((operation: any) => {
    sendMessage('operation', operation);
  }, [sendMessage]);
  
  const sendCursorMove = useCallback((position: number) => {
    sendMessage('cursor_move', { position });
  }, [sendMessage]);
  
  const sendSelectionChange = useCallback((start: number, end: number) => {
    sendMessage('selection_change', { start, end });
  }, [sendMessage]);
  
  const sendAnnotation = useCallback((annotation: any) => {
    sendMessage('annotation_add', annotation);
  }, [sendMessage]);
  
  const sendActionItem = useCallback((actionItem: any) => {
    sendMessage('action_item_add', actionItem);
  }, [sendMessage]);
  
  return {
    sendOperation,
    sendCursorMove,
    sendSelectionChange,
    sendAnnotation,
    sendActionItem,
    onMessage
  };
};

// Collaborative Hook for Components
export const useCollaborativeFeatures = (documentId: string, userId: string, userName: string) => {
  const { connect, disconnect, isConnected, users } = useCollaboration();
  const [hasInitialized, setHasInitialized] = useState(false);
  
  useEffect(() => {
    if (!hasInitialized && documentId && userId && userName) {
      connect(documentId, userId, userName);
      setHasInitialized(true);
    }
    
    return () => {
      if (hasInitialized) {
        disconnect();
        setHasInitialized(false);
      }
    };
  }, [documentId, userId, userName, connect, disconnect, hasInitialized]);
  
  return {
    isConnected,
    users,
    isReady: hasInitialized && isConnected
  };
};