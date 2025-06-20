// Shared TypeScript types and interfaces for MeetingMind
// This ensures type safety between frontend and backend communication
// TypeScript chosen for better developer experience and catch errors at compile time

// Meeting-related types
export interface Meeting {
  id: string;
  title: string;
  description?: string;
  startTime: Date;
  endTime?: Date;
  status: MeetingStatus;
  participants: Participant[];
  transcription?: Transcription[];
  summary?: MeetingSummary;
  actionItems?: ActionItem[];
  createdAt: Date;
  updatedAt: Date;
}

export enum MeetingStatus {
  SCHEDULED = 'scheduled',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled'
}

// Participant information
export interface Participant {
  id: string;
  name: string;
  email: string;
  role: ParticipantRole;
  joinedAt?: Date;
  leftAt?: Date;
}

export enum ParticipantRole {
  HOST = 'host',
  MODERATOR = 'moderator',
  PARTICIPANT = 'participant',
  OBSERVER = 'observer'
}

// Real-time transcription
export interface Transcription {
  id: string;
  meetingId: string;
  speakerId?: string;
  text: string;
  confidence: number;
  timestamp: Date;
  isInterim: boolean; // For live transcription updates
}

// AI-generated meeting summary
export interface MeetingSummary {
  id: string;
  meetingId: string;
  summary: string;
  keyPoints: string[];
  decisions: string[];
  topics: string[];
  sentiment: SentimentAnalysis;
  generatedAt: Date;
}

export interface SentimentAnalysis {
  overall: 'positive' | 'neutral' | 'negative';
  score: number; // -1 to 1
  confidence: number;
}

// Action items and follow-ups
export interface ActionItem {
  id: string;
  meetingId: string;
  description: string;
  assignee?: string;
  dueDate?: Date;
  status: ActionItemStatus;
  priority: ActionItemPriority;
  createdAt: Date;
  updatedAt: Date;
}

export enum ActionItemStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled'
}

export enum ActionItemPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  URGENT = 'urgent'
}

// WebSocket message types for real-time communication
export interface WebSocketMessage {
  type: MessageType;
  data: any;
  timestamp: Date;
  clientId?: string;
}

export enum MessageType {
  // Connection events
  CONNECT = 'connect',
  DISCONNECT = 'disconnect',
  
  // Meeting events
  MEETING_START = 'meeting_start',
  MEETING_END = 'meeting_end',
  PARTICIPANT_JOIN = 'participant_join',
  PARTICIPANT_LEAVE = 'participant_leave',
  
  // Transcription events
  TRANSCRIPTION_UPDATE = 'transcription_update',
  TRANSCRIPTION_FINAL = 'transcription_final',
  
  // AI events
  AI_INSIGHT = 'ai_insight',
  ACTION_ITEM_DETECTED = 'action_item_detected',
  
  // System events
  ERROR = 'error',
  STATUS_UPDATE = 'status_update'
}

// API Response types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  timestamp: Date;
}

// Configuration and settings
export interface AppConfig {
  api: {
    baseUrl: string;
    wsUrl: string;
    timeout: number;
  };
  features: {
    aiInsights: boolean;
    realTimeTranscription: boolean;
    autoRecording: boolean;
    sentimentAnalysis: boolean;
  };
  audio: {
    sampleRate: number;
    channels: number;
    bitDepth: number;
  };
}

// User preferences
export interface UserPreferences {
  userId: string;
  theme: 'light' | 'dark' | 'auto';
  language: string;
  notifications: {
    email: boolean;
    browser: boolean;
    actionItems: boolean;
    meetingSummaries: boolean;
  };
  transcription: {
    autoStart: boolean;
    showSpeakerNames: boolean;
    showTimestamps: boolean;
  };
}