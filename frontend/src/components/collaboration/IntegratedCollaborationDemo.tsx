// Integrated Collaboration Demo
// Demonstrates all collaborative features working together

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Users,
  FileText,
  MessageSquare,
  CheckSquare,
  // Mouse,
  Activity,
  Settings,
  // Play,
  // Pause,
  // RotateCcw,
  Zap,
  TestTube
} from 'lucide-react';

import { WebSocketCollaborationProvider, useCollaboration, ConnectionStatus, useRealtimeOperations } from './WebSocketCollaborationClient';
import { SharedNoteTaking } from './SharedNoteTaking';
import { AnnotationSystem } from './AnnotationSystem';
import { ActionItemsBoard } from './ActionItemsBoard';
import { PresenceSystem } from './PresenceSystem';
import { CursorTracker } from './CursorTracker';
import { CollaborationPlayground } from './CollaborationPlayground';

interface TabConfig {
  id: string;
  label: string;
  icon: React.ComponentType<any>;
  component: React.ComponentType<any>;
}

const DEMO_DOCUMENT_CONTENT = `# Project Collaboration Demo

Welcome to the MeetingMind collaboration features demo! This document showcases real-time collaborative editing capabilities.

## Features Demonstrated

### 1. Real-time Text Editing
- Operational transforms for conflict resolution
- Character-by-character synchronization
- Undo/redo with collaborative awareness

### 2. Collaborative Annotations
- Highlighting with color-coded user identification
- Comments and suggestions
- Reply threads on annotations
- Real-time annotation updates

### 3. Shared Action Items
- Kanban-style board for task management
- Real-time status updates
- Assignee changes reflected instantly
- Comment threads on action items

### 4. Presence Awareness
- Live cursor tracking
- User status indicators (active, idle, away)
- Avatar display with user information
- Activity feed showing recent actions

### 5. Conflict Resolution
- CRDT-based data structures
- Operational transform algorithms
- Automatic conflict resolution
- Convergence guarantees

## Try It Out!

1. **Edit this text** - Make changes and see them sync in real-time
2. **Select text and add annotations** - Right-click or use the toolbar
3. **Create action items** - Use the action items board below
4. **Move your cursor** - See it tracked for other users
5. **Open multiple browser tabs** - Simulate multiple users

## Technical Implementation

This demo uses:
- **WebSocket** connections for real-time communication
- **Operational Transforms** for text editing conflicts
- **CRDTs** (Conflict-free Replicated Data Types) for structured data
- **Vector clocks** for causal ordering
- **Presence protocols** for user awareness

The system handles network partitions, reconnections, and ensures eventual consistency across all clients.

---

*This is a live collaborative document. Changes you make will be visible to all connected users in real-time.*`;

const DEMO_USERS = [
  { id: 'alice', name: 'Alice Chen', color: '#FF6B6B', avatar: undefined },
  { id: 'bob', name: 'Bob Smith', color: '#4ECDC4', avatar: undefined },
  { id: 'charlie', name: 'Charlie Davis', color: '#45B7D1', avatar: undefined },
  { id: 'diana', name: 'Diana Wilson', color: '#96CEB4', avatar: undefined }
];

const DemoContent: React.FC = () => {
  const [activeTab, setActiveTab] = useState('notes');
  const [documentContent, setDocumentContent] = useState(DEMO_DOCUMENT_CONTENT);
  const [annotations, setAnnotations] = useState<Array<{ id: string; text: string; position: { x: number; y: number }; author: string }>>([]);
  const [actionItems, setActionItems] = useState<Array<{ id: string; task: string; assignee: string; deadline?: string; completed: boolean }>>([]);
  const [cursors, setCursors] = useState<Array<{ userId: string; position: { x: number; y: number }; color: string }>>([]);
  const [currentUser] = useState(DEMO_USERS[0]); // Simulate current user
  const [users] = useState(DEMO_USERS);
  const [showSettings, setShowSettings] = useState(false);
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(true);
  const [showMetrics, setShowMetrics] = useState(false);
  
  const { isConnected, users: connectedUsers, sendMessage } = useCollaboration();
  const { sendOperation, sendCursorMove, sendSelectionChange, sendAnnotation, sendActionItem, onMessage } = useRealtimeOperations();
  
  // Metrics tracking
  const [metrics, setMetrics] = useState({
    operations: 0,
    conflicts: 0,
    latency: 0,
    throughput: 0,
    startTime: Date.now()
  });
  
  // Handle incoming real-time messages
  useEffect(() => {
    const unsubscribe = onMessage((message) => {
      switch (message.type) {
        case 'operation':
          setMetrics(prev => ({ ...prev, operations: prev.operations + 1 }));
          // Handle text operations
          break;
        case 'cursor_move':
          setCursors(prev => [
            ...prev.filter(c => c.userId !== message.userId),
            {
              userId: message.userId,
              userName: users.find(u => u.id === message.userId)?.name || 'Unknown',
              position: message.data.position,
              color: users.find(u => u.id === message.userId)?.color || '#000000',
              timestamp: message.timestamp,
              isActive: true
            }
          ]);
          break;
        case 'annotation_add':
          setAnnotations(prev => [...prev, message.data]);
          break;
        case 'action_item_add':
          setActionItems(prev => [...prev, message.data]);
          break;
      }
    });
    
    return unsubscribe;
  }, [onMessage, users]);
  
  // Handle text operations
  const handleOperation = useCallback((operation: any) => {
    sendOperation(operation);
    setMetrics(prev => ({ ...prev, operations: prev.operations + 1 }));
  }, [sendOperation]);
  
  // Handle cursor movement
  const handleCursorMove = useCallback((position: number, selection?: any) => {
    sendCursorMove(position);
    if (selection) {
      sendSelectionChange(selection.start, selection.end);
    }
  }, [sendCursorMove, sendSelectionChange]);
  
  // Handle annotation operations
  const handleAddAnnotation = useCallback((annotation: any) => {
    const newAnnotation = {
      ...annotation,
      id: `annotation-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      createdAt: new Date().toISOString()
    };
    setAnnotations(prev => [...prev, newAnnotation]);
    sendAnnotation(newAnnotation);
  }, [sendAnnotation]);
  
  const handleUpdateAnnotation = useCallback((id: string, updates: any) => {
    setAnnotations(prev => prev.map(a => a.id === id ? { ...a, ...updates } : a));
    sendMessage('annotation_update', { annotation_id: id, annotation: updates });
  }, [sendMessage]);
  
  const handleDeleteAnnotation = useCallback((id: string) => {
    setAnnotations(prev => prev.filter(a => a.id !== id));
    sendMessage('annotation_remove', { annotation_id: id });
  }, [sendMessage]);
  
  // Handle action item operations
  const handleAddActionItem = useCallback((item: any) => {
    const newItem = {
      ...item,
      id: `action-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    setActionItems(prev => [...prev, newItem]);
    sendActionItem(newItem);
  }, [sendActionItem]);
  
  const handleUpdateActionItem = useCallback((id: string, updates: any) => {
    setActionItems(prev => prev.map(item => 
      item.id === id ? { ...item, ...updates, updatedAt: new Date().toISOString() } : item
    ));
    sendMessage('action_item_update', { item_id: id, item: updates });
  }, [sendMessage]);
  
  const handleDeleteActionItem = useCallback((id: string) => {
    setActionItems(prev => prev.filter(item => item.id !== id));
    sendMessage('action_item_remove', { item_id: id });
  }, [sendMessage]);
  
  // Calculate real-time metrics
  const calculatedMetrics = useMemo(() => {
    const now = Date.now();
    const duration = (now - metrics.startTime) / 1000;
    const throughput = duration > 0 ? metrics.operations / duration : 0;
    
    return {
      ...metrics,
      throughput: Math.round(throughput * 100) / 100,
      duration: Math.round(duration)
    };
  }, [metrics]);
  
  // Tab configuration
  const tabs: TabConfig[] = [
    {
      id: 'notes',
      label: 'Shared Notes',
      icon: FileText,
      component: () => (
        <SharedNoteTaking
          documentId="demo-doc"
          initialContent={documentContent}
          users={users.map(u => ({ ...u, isActive: true }))}
          currentUser={currentUser}
          onOperation={handleOperation}
          onCursorMove={handleCursorMove}
          cursors={cursors}
        />
      )
    },
    {
      id: 'annotations',
      label: 'Annotations',
      icon: MessageSquare,
      component: () => (
        <AnnotationSystem
          documentContent={documentContent}
          annotations={annotations}
          currentUser={currentUser}
          users={users}
          onAddAnnotation={handleAddAnnotation}
          onUpdateAnnotation={handleUpdateAnnotation}
          onDeleteAnnotation={handleDeleteAnnotation}
          onAddReply={(annotationId, reply) => {
            setAnnotations(prev => prev.map(a => 
              a.id === annotationId 
                ? { 
                    ...a, 
                    replies: [
                      ...(a.replies || []), 
                      {
                        ...reply,
                        id: `reply-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                        createdAt: new Date().toISOString()
                      }
                    ]
                  }
                : a
            ));
          }}
        />
      )
    },
    {
      id: 'actions',
      label: 'Action Items',
      icon: CheckSquare,
      component: () => (
        <ActionItemsBoard
          actionItems={actionItems}
          users={users}
          currentUser={currentUser}
          onAddItem={handleAddActionItem}
          onUpdateItem={handleUpdateActionItem}
          onDeleteItem={handleDeleteActionItem}
          onAddComment={(itemId, comment) => {
            setActionItems(prev => prev.map(item =>
              item.id === itemId
                ? {
                    ...item,
                    comments: [
                      ...item.comments,
                      {
                        ...comment,
                        id: `comment-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                        createdAt: new Date().toISOString()
                      }
                    ]
                  }
                : item
            ));
          }}
        />
      )
    },
    {
      id: 'presence',
      label: 'User Presence',
      icon: Users,
      component: () => (
        <div className="p-6">
          <PresenceSystem
            users={users.map(u => ({
              ...u,
              userId: u.id,
              userName: u.name,
              isActive: true,
              status: 'active' as const,
              lastSeen: new Date().toISOString(),
              joinedAt: new Date().toISOString(),
              permissions: ['read', 'write']
            }))}
            currentUser={{
              ...currentUser,
              userId: currentUser.id,
              userName: currentUser.name,
              isActive: true,
              status: 'active' as const,
              lastSeen: new Date().toISOString(),
              joinedAt: new Date().toISOString(),
              permissions: ['read', 'write']
            }}
            showDetailedPresence={true}
            showActivityFeed={true}
          />
          
          <div className="mt-8">
            <CursorTracker
              cursors={cursors}
              users={users.map(u => ({
                userId: u.id,
                userName: u.name,
                color: u.color,
                isActive: true,
                lastSeen: new Date().toISOString()
              }))}
              currentUser={currentUser}
              onCursorMove={handleCursorMove}
              onSelection={(selection) => {
                sendSelectionChange(selection.start.x, selection.end.x);
              }}
            />
          </div>
        </div>
      )
    },
    {
      id: 'testing',
      label: 'Testing Playground',
      icon: TestTube,
      component: () => <CollaborationPlayground />
    }
  ];
  
  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b shadow-sm">
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-3">
            <Zap className="text-blue-500" size={24} />
            <h1 className="text-xl font-bold">Collaboration Demo</h1>
            <span className="text-sm text-gray-500">Real-time collaborative features</span>
          </div>
          
          <div className="flex items-center gap-3">
            {/* Metrics toggle */}
            <button
              onClick={() => setShowMetrics(!showMetrics)}
              className={`px-3 py-1 rounded text-sm ${showMetrics ? 'bg-blue-500 text-white' : 'bg-gray-100'}`}
            >
              <Activity size={16} className="inline mr-1" />
              Metrics
            </button>
            
            {/* Settings toggle */}
            <button
              onClick={() => setShowSettings(!showSettings)}
              className={`px-3 py-1 rounded text-sm ${showSettings ? 'bg-gray-500 text-white' : 'bg-gray-100'}`}
            >
              <Settings size={16} className="inline mr-1" />
              Settings
            </button>
            
            {/* Connection status */}
            <ConnectionStatus />
          </div>
        </div>
        
        {/* Tab navigation */}
        <div className="border-t">
          <nav className="flex">
            {tabs.map(tab => {
              const IconComponent = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-6 py-3 border-b-2 transition-colors ${
                    activeTab === tab.id
                      ? 'border-blue-500 text-blue-600 bg-blue-50'
                      : 'border-transparent text-gray-600 hover:text-gray-800 hover:bg-gray-50'
                  }`}
                >
                  <IconComponent size={16} />
                  {tab.label}
                </button>
              );
            })}
          </nav>
        </div>
      </div>
      
      {/* Main content with sidebars */}
      <div className="flex-1 flex overflow-hidden">
        {/* Metrics sidebar */}
        {showMetrics && (
          <div className="w-64 bg-white border-r p-4 overflow-y-auto">
            <h3 className="font-medium mb-4 flex items-center gap-2">
              <Activity size={16} />
              Real-time Metrics
            </h3>
            
            <div className="space-y-3">
              <div className="bg-blue-50 p-3 rounded">
                <div className="text-xs text-gray-600">Operations</div>
                <div className="text-lg font-semibold text-blue-600">{calculatedMetrics.operations}</div>
              </div>
              
              <div className="bg-orange-50 p-3 rounded">
                <div className="text-xs text-gray-600">Conflicts</div>
                <div className="text-lg font-semibold text-orange-600">{calculatedMetrics.conflicts}</div>
              </div>
              
              <div className="bg-green-50 p-3 rounded">
                <div className="text-xs text-gray-600">Throughput</div>
                <div className="text-lg font-semibold text-green-600">{calculatedMetrics.throughput}/sec</div>
              </div>
              
              <div className="bg-purple-50 p-3 rounded">
                <div className="text-xs text-gray-600">Duration</div>
                <div className="text-lg font-semibold text-purple-600">{calculatedMetrics.duration}s</div>
              </div>
              
              <div className="bg-gray-50 p-3 rounded">
                <div className="text-xs text-gray-600">Connected Users</div>
                <div className="text-lg font-semibold text-gray-600">{connectedUsers.length}</div>
              </div>
            </div>
            
            <div className="mt-6 pt-4 border-t">
              <h4 className="text-sm font-medium mb-2">Connection Status</h4>
              <div className={`text-sm ${isConnected ? 'text-green-600' : 'text-red-600'}`}>
                {isConnected ? '🟢 Connected' : '🔴 Disconnected'}
              </div>
            </div>
          </div>
        )}
        
        {/* Main content area */}
        <div className="flex-1 overflow-hidden">
          {tabs.find(tab => tab.id === activeTab)?.component()}
        </div>
        
        {/* Settings sidebar */}
        {showSettings && (
          <div className="w-64 bg-white border-l p-4 overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-medium">Settings</h3>
              <button
                onClick={() => setShowSettings(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                ×
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={autoSaveEnabled}
                    onChange={(e) => setAutoSaveEnabled(e.target.checked)}
                  />
                  Auto-save changes
                </label>
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">Current User</label>
                <div className="flex items-center gap-2">
                  <div 
                    className="w-4 h-4 rounded-full"
                    style={{ backgroundColor: currentUser.color }}
                  />
                  <span className="text-sm">{currentUser.name}</span>
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-2">Demo Data</label>
                <div className="space-y-2">
                  <button
                    onClick={() => {
                      setDocumentContent(DEMO_DOCUMENT_CONTENT);
                      setAnnotations([]);
                      setActionItems([]);
                    }}
                    className="w-full px-3 py-2 bg-blue-500 text-white rounded text-sm hover:bg-blue-600"
                  >
                    Reset Demo
                  </button>
                  
                  <button
                    onClick={() => {
                      // Add sample annotation
                      handleAddAnnotation({
                        type: 'comment',
                        startOffset: 100,
                        endOffset: 150,
                        text: 'collaborative editing',
                        content: 'This is a sample annotation!',
                        author: currentUser.id,
                        authorName: currentUser.name,
                        authorColor: currentUser.color,
                        tags: ['demo', 'example']
                      });
                    }}
                    className="w-full px-3 py-2 bg-green-500 text-white rounded text-sm hover:bg-green-600"
                  >
                    Add Sample Annotation
                  </button>
                  
                  <button
                    onClick={() => {
                      // Add sample action item
                      handleAddActionItem({
                        title: 'Demo Action Item',
                        description: 'This is a sample action item for demonstration',
                        status: 'open' as const,
                        priority: 'medium' as const,
                        author: currentUser.id,
                        authorName: currentUser.name,
                        tags: ['demo', 'sample'],
                        comments: []
                      });
                    }}
                    className="w-full px-3 py-2 bg-purple-500 text-white rounded text-sm hover:bg-purple-600"
                  >
                    Add Sample Action Item
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
      
      {/* Status bar */}
      <div className="bg-gray-800 text-white px-4 py-2 text-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span>Active Tab: {tabs.find(t => t.id === activeTab)?.label}</span>
            <span>Operations: {calculatedMetrics.operations}</span>
          </div>
          
          <div className="flex items-center gap-4">
            <span>Users: {users.length}</span>
            <span>Throughput: {calculatedMetrics.throughput}/sec</span>
            <span className={isConnected ? 'text-green-400' : 'text-red-400'}>
              {isConnected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

// Main demo component with WebSocket provider
export const IntegratedCollaborationDemo: React.FC = () => {
  return (
    <WebSocketCollaborationProvider
      serverUrl="ws://localhost:8765"
      debug={true}
      reconnectInterval={3000}
      maxReconnectAttempts={10}
    >
      <DemoContent />
    </WebSocketCollaborationProvider>
  );
};