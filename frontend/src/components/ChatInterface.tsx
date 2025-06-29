// Real-time Chat Interface Component
// This component demonstrates WebSocket functionality through a chat interface
// It showcases message broadcasting, typing indicators, and real-time updates

import { useState, useRef, useEffect } from 'react';
import { useWebSocket, WebSocketState } from '../hooks/useWebSocket';

// Props for the ChatInterface component
interface ChatInterfaceProps {
  clientId: string;
  userName?: string;
}

// Individual chat message structure for display
interface ChatMessage {
  id: string;
  message: string;
  sender: string;
  senderName: string;
  timestamp: string;
  isOwn: boolean; // Whether this message was sent by current user
}

// User typing indicator
interface TypingUser {
  user: string;
  userName: string;
}

/**
 * ChatInterface Component
 * 
 * This component provides a complete chat interface that demonstrates:
 * - Real-time message broadcasting via WebSocket
 * - Typing indicators for enhanced user experience
 * - Message history and scrolling behavior
 * - Connection state awareness
 * - Error handling and user feedback
 * 
 * WebSocket Usage Patterns Demonstrated:
 * 1. Sending structured messages with type and data
 * 2. Handling different message types (chat, typing, system events)
 * 3. Real-time UI updates based on WebSocket events
 * 4. Connection state management and user feedback
 */
export const ChatInterface: React.FC<ChatInterfaceProps> = ({ 
  clientId, 
  userName = clientId 
}) => {
  // WebSocket connection using our custom hook
  const websocket = useWebSocket({
    url: `ws://localhost:8000/ws/${clientId}`,
    debug: true, // Enable debug logging to see WebSocket activity
    reconnectInterval: 1000,
    maxReconnectAttempts: 5,
    heartbeatInterval: 30000
  });
  
  // Component state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [messageInput, setMessageInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);
  
  // Refs for DOM manipulation
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Auto-scroll to bottom when new messages arrive
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };
  
  useEffect(() => {
    scrollToBottom();
  }, [chatMessages]);
  
  // Process incoming WebSocket messages and update chat state
  useEffect(() => {
    if (websocket.lastMessage) {
      const message = websocket.lastMessage;
      
      switch (message.type) {
        case 'chat_message': {
          // Add new chat message to the list
          const chatMsg: ChatMessage = {
            id: message.data.message_id,
            message: message.data.message,
            sender: message.data.sender,
            senderName: message.data.sender_name,
            timestamp: message.timestamp,
            isOwn: message.data.sender === clientId
          };
          
          setChatMessages(prev => [...prev, chatMsg]);
          break;
        }
          
        case 'user_typing': {
          // Handle typing indicators from other users
          const { user, user_name, is_typing } = message.data;
          
          if (user !== clientId) { // Don't show own typing indicator
            setTypingUsers(prev => {
              if (is_typing) {
                // Add user to typing list if not already there
                if (!prev.find(u => u.user === user)) {
                  return [...prev, { user, userName: user_name }];
                }
                return prev;
              } else {
                // Remove user from typing list
                return prev.filter(u => u.user !== user);
              }
            });
          }
          break;
        }
          
        case 'user_joined': {
          // Add system message for user joining
          const joinMsg: ChatMessage = {
            id: `system-${Date.now()}`,
            message: `${message.data.client_id} joined the chat`,
            sender: 'system',
            senderName: 'System',
            timestamp: message.timestamp,
            isOwn: false
          };
          setChatMessages(prev => [...prev, joinMsg]);
          break;
        }
          
        case 'user_left': {
          // Add system message for user leaving
          const leaveMsg: ChatMessage = {
            id: `system-${Date.now()}`,
            message: `${message.data.client_id} left the chat`,
            sender: 'system',
            senderName: 'System',
            timestamp: message.timestamp,
            isOwn: false
          };
          setChatMessages(prev => [...prev, leaveMsg]);
          
          // Remove from typing users if they were typing
          setTypingUsers(prev => prev.filter(u => u.user !== message.data.client_id));
          break;
        }
      }
    }
  }, [websocket.lastMessage, clientId]);
  
  // Handle typing indicators with debouncing
  // Debouncing prevents sending too many "typing" events
  const handleInputChange = (value: string) => {
    setMessageInput(value);
    
    // Start typing indicator if not already active
    if (!isTyping && value.length > 0) {
      setIsTyping(true);
      websocket.sendMessage('typing_start', { user_name: userName });
    }
    
    // Reset typing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    
    // Stop typing indicator after 2 seconds of inactivity
    typingTimeoutRef.current = setTimeout(() => {
      if (isTyping) {
        setIsTyping(false);
        websocket.sendMessage('typing_stop', { user_name: userName });
      }
    }, 2000);
    
    // Stop typing immediately if input is empty
    if (value.length === 0 && isTyping) {
      setIsTyping(false);
      websocket.sendMessage('typing_stop', { user_name: userName });
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    }
  };
  
  // Send chat message
  const sendMessage = () => {
    if (messageInput.trim() && websocket.isConnected) {
      // Send chat message via WebSocket
      websocket.sendMessage('chat_message', {
        message: messageInput.trim(),
        sender_name: userName
      });
      
      // Clear input and stop typing indicator
      setMessageInput('');
      if (isTyping) {
        setIsTyping(false);
        websocket.sendMessage('typing_stop', { user_name: userName });
      }
      
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    }
  };
  
  // Handle Enter key press for sending messages
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };
  
  // Format timestamp for display
  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };
  
  // Get connection status color for visual feedback
  const getStatusColor = () => {
    switch (websocket.state) {
      case WebSocketState.CONNECTED:
        return 'text-green-600 bg-green-100';
      case WebSocketState.CONNECTING:
      case WebSocketState.RECONNECTING:
        return 'text-yellow-600 bg-yellow-100';
      case WebSocketState.DISCONNECTED:
        return 'text-gray-600 bg-gray-100';
      case WebSocketState.ERROR:
        return 'text-red-600 bg-red-100';
      default:
        return 'text-gray-600 bg-gray-100';
    }
  };
  
  // Get status text for display
  const getStatusText = () => {
    switch (websocket.state) {
      case WebSocketState.CONNECTED:
        return `Connected (${websocket.activeConnections} users)`;
      case WebSocketState.CONNECTING:
        return 'Connecting...';
      case WebSocketState.RECONNECTING:
        return `Reconnecting... (${websocket.reconnectAttempts})`;
      case WebSocketState.DISCONNECTED:
        return 'Disconnected';
      case WebSocketState.ERROR:
        return 'Connection Error';
      default:
        return 'Unknown';
    }
  };
  
  return (
    <div className="flex flex-col h-96 bg-white rounded-lg border border-gray-200 shadow-sm">
      {/* Chat Header with Connection Status */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-gray-50 rounded-t-lg">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Live Chat</h3>
          <p className="text-sm text-gray-600">Testing WebSocket communication</p>
        </div>
        
        {/* Connection Status Indicator */}
        <div className="flex items-center space-x-2">
          <div className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor()}`}>
            {getStatusText()}
          </div>
          
          {/* Connection Actions */}
          <div className="flex space-x-1">
            {websocket.state === WebSocketState.DISCONNECTED && (
              <button
                onClick={websocket.connect}
                className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Connect
              </button>
            )}
            
            {websocket.isConnected && (
              <button
                onClick={websocket.disconnect}
                className="px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700"
              >
                Disconnect
              </button>
            )}
          </div>
        </div>
      </div>
      
      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {chatMessages.length === 0 ? (
          <div className="text-center text-gray-500 py-8">
            <p>No messages yet. Start the conversation!</p>
            <p className="text-sm mt-2">
              Open multiple browser tabs to test real-time chat
            </p>
          </div>
        ) : (
          chatMessages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.isOwn ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
                  msg.sender === 'system'
                    ? 'bg-gray-100 text-gray-600 text-sm italic text-center w-full'
                    : msg.isOwn
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 text-gray-900'
                }`}
              >
                {msg.sender !== 'system' && !msg.isOwn && (
                  <div className="text-xs font-semibold mb-1">{msg.senderName}</div>
                )}
                <div className="break-words">{msg.message}</div>
                <div className={`text-xs mt-1 ${
                  msg.sender === 'system' 
                    ? 'text-gray-500' 
                    : msg.isOwn 
                    ? 'text-blue-100' 
                    : 'text-gray-500'
                }`}>
                  {formatTime(msg.timestamp)}
                </div>
              </div>
            </div>
          ))
        )}
        
        {/* Typing Indicators */}
        {typingUsers.length > 0 && (
          <div className="flex justify-start">
            <div className="bg-gray-100 text-gray-600 px-3 py-2 rounded-lg text-sm italic">
              {typingUsers.length === 1
                ? `${typingUsers[0].userName} is typing...`
                : `${typingUsers.length} people are typing...`}
            </div>
          </div>
        )}
        
        {/* Auto-scroll anchor */}
        <div ref={messagesEndRef} />
      </div>
      
      {/* Message Input */}
      <div className="p-4 border-t border-gray-200">
        {websocket.lastError && (
          <div className="mb-2 p-2 bg-red-100 text-red-700 text-sm rounded border border-red-200">
            Error: {websocket.lastError}
          </div>
        )}
        
        <div className="flex space-x-2">
          <input
            type="text"
            value={messageInput}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder={
              websocket.isConnected 
                ? "Type a message..." 
                : "Connect to start chatting"
            }
            disabled={!websocket.isConnected}
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
          />
          <button
            onClick={sendMessage}
            disabled={!websocket.isConnected || !messageInput.trim()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
          >
            Send
          </button>
        </div>
        
        <div className="mt-2 text-xs text-gray-500">
          {websocket.isConnected ? (
            <>
              Connected as <span className="font-medium">{userName}</span>
              {websocket.connectionId && (
                <span className="ml-2">
                  (ID: {websocket.connectionId.slice(0, 8)}...)
                </span>
              )}
            </>
          ) : (
            'Not connected - messages cannot be sent'
          )}
        </div>
      </div>
    </div>
  );
};