// Collaboration Components Exports
// Central export file for all collaboration components

export { SharedNoteTaking } from './SharedNoteTaking';
export { AnnotationSystem } from './AnnotationSystem';
export { ActionItemsBoard } from './ActionItemsBoard';
export { PresenceSystem } from './PresenceSystem';
export { CursorTracker } from './CursorTracker';
export { CollaborationPlayground } from './CollaborationPlayground';
export { 
  WebSocketCollaborationProvider,
  useCollaboration,
  ConnectionStatus,
  useRealtimeOperations,
  useCollaborativeFeatures
} from './WebSocketCollaborationClient';
export { IntegratedCollaborationDemo } from './IntegratedCollaborationDemo';

// Type exports
export type {
  // Add type exports as needed
  CursorData,
  UserPresence,
  CollaborationMessage
} from './WebSocketCollaborationClient';

// Re-export common types that might be used across components
export interface CollaborationUser {
  id: string;
  name: string;
  color: string;
  avatar?: string;
  isActive?: boolean;
}

export interface TextOperation {
  type: 'insert' | 'delete' | 'retain' | 'format';
  position: number;
  content?: string;
  length?: number;
  attributes?: any;
  author: string;
  timestamp: string;
  operationId: string;
}

export interface AnnotationData {
  id: string;
  type: 'highlight' | 'comment' | 'suggestion';
  startOffset: number;
  endOffset: number;
  text: string;
  content: string;
  author: string;
  authorName: string;
  authorColor: string;
  createdAt: string;
  updatedAt?: string;
  resolved?: boolean;
  replies?: AnnotationReply[];
  tags?: string[];
  color?: string;
}

export interface AnnotationReply {
  id: string;
  content: string;
  author: string;
  authorName: string;
  createdAt: string;
}

export interface ActionItemData {
  id: string;
  title: string;
  description: string;
  status: 'open' | 'in_progress' | 'review' | 'completed';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  assignee?: string;
  assigneeName?: string;
  dueDate?: string;
  createdAt: string;
  updatedAt: string;
  author: string;
  authorName: string;
  tags: string[];
  comments: ActionItemComment[];
  estimatedHours?: number;
  completedAt?: string;
  dependencies?: string[];
  attachments?: ActionItemAttachment[];
}

export interface ActionItemComment {
  id: string;
  content: string;
  author: string;
  authorName: string;
  createdAt: string;
}

export interface ActionItemAttachment {
  id: string;
  name: string;
  url: string;
  type: string;
  size: number;
  uploadedBy: string;
  uploadedAt: string;
}

// Utility functions for collaboration
export const generateUniqueId = (prefix: string = '') => {
  return `${prefix}${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

export const formatTimeAgo = (timestamp: string) => {
  const now = new Date();
  const time = new Date(timestamp);
  const diffMs = now.getTime() - time.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return time.toLocaleDateString();
};

export const generateUserColor = (userId: string) => {
  const colors = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', 
    '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F',
    '#BB8FCE', '#85C1E9', '#F8C471', '#82E0AA'
  ];
  
  // Simple hash function to assign consistent colors to users
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    const char = userId.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  
  return colors[Math.abs(hash) % colors.length];
};

export const createDefaultUser = (id: string, name: string): CollaborationUser => ({
  id,
  name,
  color: generateUserColor(id),
  isActive: true
});