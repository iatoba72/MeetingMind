// Custom React hook for WebSocket connection management
// This hook provides a clean interface for WebSocket operations with automatic reconnection,
// connection state management, and error handling

import { useEffect, useRef, useState, useCallback } from 'react';

// WebSocket connection states - represents the lifecycle of a WebSocket connection
export enum WebSocketState {
  CONNECTING = 'connecting',    // Initial connection attempt in progress
  CONNECTED = 'connected',      // Successfully connected and ready to send/receive
  DISCONNECTED = 'disconnected', // Connection lost or never established
  RECONNECTING = 'reconnecting', // Attempting to reconnect after disconnection
  ERROR = 'error'               // Connection failed with error
}

// Message structure for WebSocket communication
// All messages follow this standardized format for consistency
export interface WebSocketMessage {
  type: string;                 // Message type identifier (e.g., 'chat_message', 'ping')
  data: any;                   // Message payload - can be any JSON-serializable data
  timestamp: string;           // ISO timestamp when message was created
}

// Configuration options for the WebSocket hook
export interface WebSocketConfig {
  url: string;                 // WebSocket server URL
  protocols?: string[];        // Optional WebSocket sub-protocols
  reconnectInterval?: number;  // Base interval between reconnection attempts (ms)
  maxReconnectAttempts?: number; // Maximum number of reconnection attempts
  heartbeatInterval?: number;  // Interval for sending ping messages (ms)
  debug?: boolean;            // Enable debug logging
}

// Return type for the useWebSocket hook
export interface WebSocketHook {
  // Connection state
  state: WebSocketState;
  isConnected: boolean;
  
  // Connection info
  connectionId: string | null;
  activeConnections: number;
  reconnectAttempts: number;
  
  // Message handling
  messages: WebSocketMessage[];
  lastMessage: WebSocketMessage | null;
  
  // Actions
  sendMessage: (type: string, data: any) => void;
  clearMessages: () => void;
  connect: () => void;
  disconnect: () => void;
  
  // Error information
  lastError: string | null;
}

/**
 * Custom hook for managing WebSocket connections with advanced features
 * 
 * Features:
 * - Automatic connection management
 * - Exponential backoff reconnection strategy
 * - Heartbeat/ping mechanism to detect connection issues
 * - Message history and state management
 * - Error handling and recovery
 * - Clean lifecycle management with React
 * 
 * WebSocket Lifecycle Explained:
 * 1. CONNECTING: Initial handshake in progress
 * 2. CONNECTED: Ready for bidirectional communication
 * 3. DISCONNECTED: Connection closed (normal or error)
 * 4. RECONNECTING: Attempting to restore connection
 * 5. ERROR: Failed to connect or connection error occurred
 * 
 * @param config - WebSocket configuration options
 * @returns WebSocket hook interface with state and methods
 */
export const useWebSocket = (config: WebSocketConfig): WebSocketHook => {
  // WebSocket instance reference - persists across renders
  const websocketRef = useRef<WebSocket | null>(null);
  
  // Reconnection logic references
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef<number>(0);
  const isManuallyDisconnectedRef = useRef<boolean>(false);
  
  // Connection state management
  const [state, setState] = useState<WebSocketState>(WebSocketState.DISCONNECTED);
  const [connectionId, setConnectionId] = useState<string | null>(null);
  const [activeConnections, setActiveConnections] = useState<number>(0);
  const [messages, setMessages] = useState<WebSocketMessage[]>([]);
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  
  // Configuration with defaults
  const {
    url,
    protocols = [],
    reconnectInterval = 1000,      // Start with 1 second
    maxReconnectAttempts = 10,     // Maximum 10 attempts
    heartbeatInterval = 30000,     // Ping every 30 seconds
    debug = false
  } = config;
  
  // Debug logging function
  const log = useCallback((message: string, data?: any) => {
    if (debug) {
      console.log(`[WebSocket] ${message}`, data || '');
    }
  }, [debug]);
  
  // Calculate reconnection delay with exponential backoff
  // Exponential backoff prevents overwhelming the server with connection attempts
  // Formula: base_interval * (2 ^ attempt_number) + random_jitter
  const getReconnectDelay = useCallback((attempt: number): number => {
    const exponentialDelay = reconnectInterval * Math.pow(2, attempt);
    const maxDelay = 30000; // Cap at 30 seconds
    const jitter = Math.random() * 1000; // Add 0-1 second random jitter
    
    return Math.min(exponentialDelay + jitter, maxDelay);
  }, [reconnectInterval]);
  
  // Send heartbeat ping to detect connection issues
  // Heartbeats help detect "zombie" connections where network is down
  // but the WebSocket hasn't fired the close event yet
  const sendHeartbeat = useCallback(() => {
    if (websocketRef.current?.readyState === WebSocket.OPEN) {
      const pingMessage = {
        type: 'ping',
        data: { timestamp: new Date().toISOString() },
        timestamp: new Date().toISOString()
      };
      
      log('Sending heartbeat ping');
      websocketRef.current.send(JSON.stringify(pingMessage));
    }
  }, [log]);
  
  // Start heartbeat interval
  const startHeartbeat = useCallback(() => {
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
    }
    
    heartbeatIntervalRef.current = setInterval(sendHeartbeat, heartbeatInterval);
    log(`Heartbeat started with ${heartbeatInterval}ms interval`);
  }, [sendHeartbeat, heartbeatInterval, log]);
  
  // Stop heartbeat interval
  const stopHeartbeat = useCallback(() => {
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
      log('Heartbeat stopped');
    }
  }, [log]);
  
  // Process incoming WebSocket messages
  const handleMessage = useCallback((event: MessageEvent) => {
    try {
      const message: WebSocketMessage = JSON.parse(event.data);
      log('Received message:', message);
      
      // Handle different message types
      switch (message.type) {
        case 'connection_established':
          // Server confirms connection - extract connection info
          setConnectionId(message.data.connection_id);
          setActiveConnections(message.data.active_connections);
          log('Connection established:', message.data);
          break;
          
        case 'user_joined':
        case 'user_left':
          // Update active connection count
          setActiveConnections(message.data.active_connections);
          break;
          
        case 'pong':
          // Response to our ping - connection is healthy
          log('Received pong - connection healthy');
          break;
          
        case 'error':
          // Server reported an error
          setLastError(message.data.error);
          log('Server error:', message.data);
          break;
          
        default:
          // Regular message - add to message history
          break;
      }
      
      // Add all messages to history for debugging and display
      setMessages(prev => [...prev, message]);
      setLastMessage(message);
      
    } catch (error) {
      log('Error parsing message:', error);
      setLastError('Failed to parse incoming message');
    }
  }, [log]);
  
  // Handle WebSocket connection opening
  const handleOpen = useCallback(() => {
    log('WebSocket connection opened');
    setState(WebSocketState.CONNECTED);
    setLastError(null);
    reconnectAttemptsRef.current = 0; // Reset reconnection attempts
    
    // Start heartbeat to monitor connection health
    startHeartbeat();
  }, [log, startHeartbeat]);
  
  // Handle WebSocket connection closing
  const handleClose = useCallback((event: CloseEvent) => {
    log('WebSocket connection closed:', { code: event.code, reason: event.reason });
    setState(WebSocketState.DISCONNECTED);
    setConnectionId(null);
    
    // Stop heartbeat
    stopHeartbeat();
    
    // Attempt reconnection if not manually disconnected
    if (!isManuallyDisconnectedRef.current && reconnectAttemptsRef.current < maxReconnectAttempts) {
      const delay = getReconnectDelay(reconnectAttemptsRef.current);
      log(`Reconnecting in ${delay}ms (attempt ${reconnectAttemptsRef.current + 1}/${maxReconnectAttempts})`);
      
      setState(WebSocketState.RECONNECTING);
      reconnectTimeoutRef.current = setTimeout(() => {
        reconnectAttemptsRef.current++;
        connect();
      }, delay);
    } else if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
      log('Max reconnection attempts reached');
      setLastError('Maximum reconnection attempts exceeded');
      setState(WebSocketState.ERROR);
    }
  }, [log, stopHeartbeat, maxReconnectAttempts, getReconnectDelay]);
  
  // Handle WebSocket errors
  const handleError = useCallback((event: Event) => {
    log('WebSocket error:', event);
    setState(WebSocketState.ERROR);
    setLastError('WebSocket connection error occurred');
  }, [log]);
  
  // Connect to WebSocket server
  const connect = useCallback(() => {
    // Don't create multiple connections
    if (websocketRef.current?.readyState === WebSocket.CONNECTING || 
        websocketRef.current?.readyState === WebSocket.OPEN) {
      log('Connection already exists');
      return;
    }
    
    try {
      log('Connecting to WebSocket:', url);
      setState(WebSocketState.CONNECTING);
      setLastError(null);
      isManuallyDisconnectedRef.current = false;
      
      // Create new WebSocket connection
      websocketRef.current = new WebSocket(url, protocols);
      
      // Attach event handlers
      websocketRef.current.onopen = handleOpen;
      websocketRef.current.onmessage = handleMessage;
      websocketRef.current.onclose = handleClose;
      websocketRef.current.onerror = handleError;
      
    } catch (error) {
      log('Error creating WebSocket connection:', error);
      setState(WebSocketState.ERROR);
      setLastError('Failed to create WebSocket connection');
    }
  }, [url, protocols, log, handleOpen, handleMessage, handleClose, handleError]);
  
  // Disconnect from WebSocket server
  const disconnect = useCallback(() => {
    log('Manually disconnecting WebSocket');
    isManuallyDisconnectedRef.current = true;
    
    // Clear reconnection timeout
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    
    // Stop heartbeat
    stopHeartbeat();
    
    // Close WebSocket connection
    if (websocketRef.current) {
      websocketRef.current.close();
      websocketRef.current = null;
    }
    
    setState(WebSocketState.DISCONNECTED);
    setConnectionId(null);
  }, [log, stopHeartbeat]);
  
  // Send message through WebSocket
  const sendMessage = useCallback((type: string, data: any) => {
    if (websocketRef.current?.readyState === WebSocket.OPEN) {
      const message: WebSocketMessage = {
        type,
        data,
        timestamp: new Date().toISOString()
      };
      
      log('Sending message:', message);
      websocketRef.current.send(JSON.stringify(message));
    } else {
      log('Cannot send message: WebSocket not connected');
      setLastError('Cannot send message: not connected');
    }
  }, [log]);
  
  // Clear message history
  const clearMessages = useCallback(() => {
    setMessages([]);
    setLastMessage(null);
  }, []);
  
  // Auto-connect on mount and cleanup on unmount
  useEffect(() => {
    connect();
    
    // Cleanup function - called when component unmounts or dependencies change
    return () => {
      isManuallyDisconnectedRef.current = true;
      
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      
      stopHeartbeat();
      
      if (websocketRef.current) {
        websocketRef.current.close();
      }
    };
  }, [url]); // Reconnect if URL changes
  
  // Return hook interface
  return {
    // Connection state
    state,
    isConnected: state === WebSocketState.CONNECTED,
    
    // Connection info
    connectionId,
    activeConnections,
    reconnectAttempts: reconnectAttemptsRef.current,
    
    // Message handling
    messages,
    lastMessage,
    
    // Actions
    sendMessage,
    clearMessages,
    connect,
    disconnect,
    
    // Error information
    lastError
  };
};