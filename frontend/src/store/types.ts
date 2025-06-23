/**
 * Global State Management Types
 * Defines all types used across the Zustand store slices
 */

import { ReactNode } from 'react';

// ============================================================================
// Core Application Types
// ============================================================================

export interface User {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  preferences: UserPreferences;
}

export interface UserPreferences {
  theme: 'light' | 'dark' | 'system';
  language: string;
  notifications: boolean;
  autoSave: boolean;
  defaultQuality: 'low' | 'medium' | 'high' | 'ultra';
}

// ============================================================================
// Meeting & Session Types
// ============================================================================

export interface Meeting {
  id: string;
  title: string;
  description?: string;
  status: 'waiting' | 'active' | 'paused' | 'completed' | 'error';
  startedAt?: Date;
  endedAt?: Date;
  duration?: number;
  participants: Participant[];
  transcription: TranscriptionData;
  recording?: RecordingData;
  insights?: MeetingInsight[];
  metadata: MeetingMetadata;
}

export interface Participant {
  id: string;
  name: string;
  role: 'host' | 'participant' | 'observer';
  status: 'connected' | 'disconnected' | 'speaking' | 'muted';
  joinedAt: Date;
  leftAt?: Date;
  audioLevel?: number;
  speakingTime?: number;
}

export interface MeetingMetadata {
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  tags?: string[];
  category?: string;
  priority?: 'low' | 'medium' | 'high';
  isPrivate: boolean;
}

// ============================================================================
// Audio & Transcription Types
// ============================================================================

export interface AudioState {
  isRecording: boolean;
  isProcessing: boolean;
  currentLevel: number;
  deviceId?: string;
  sampleRate: number;
  channels: number;
  quality: AudioQuality;
  settings: AudioSettings;
}

export interface AudioQuality {
  snr: number;
  clarity: number;
  stability: number;
  overall: number;
}

export interface AudioSettings {
  echoCancellation: boolean;
  noiseSuppression: boolean;
  autoGainControl: boolean;
  enhancedProcessing: boolean;
  bufferSize: number;
  latencyMode: 'low' | 'balanced' | 'high';
}

export interface TranscriptionData {
  segments: TranscriptionSegment[];
  language: string;
  confidence: number;
  isLive: boolean;
  settings: TranscriptionSettings;
}

export interface TranscriptionSegment {
  id: string;
  text: string;
  speaker?: string;
  startTime: number;
  endTime: number;
  confidence: number;
  timestamp: Date;
  isEdited?: boolean;
  editHistory?: TranscriptionEdit[];
}

export interface TranscriptionEdit {
  timestamp: Date;
  originalText: string;
  editedText: string;
  editedBy: string;
  reason?: string;
}

export interface TranscriptionSettings {
  model: 'tiny' | 'base' | 'small' | 'medium' | 'large-v2' | 'large-v3';
  language?: string;
  enableSpeakerDetection: boolean;
  enablePunctuation: boolean;
  enableFormatting: boolean;
  realTimeMode: boolean;
  qualityThreshold: number;
}

// ============================================================================
// Streaming & Network Types
// ============================================================================

export interface StreamState {
  streams: Record<string, StreamInfo>;
  activeStreamId?: string;
  totalBandwidthUsage: number;
  networkQuality: NetworkQuality;
}

export interface StreamInfo {
  id: string;
  type: 'rtmp' | 'srt' | 'webrtc';
  status: 'idle' | 'connecting' | 'connected' | 'streaming' | 'error' | 'disconnected';
  url: string;
  quality: StreamQuality;
  statistics: StreamStatistics;
  settings: StreamSettings;
  error?: StreamError;
}

export interface StreamQuality {
  video: QualityMetrics;
  audio: QualityMetrics;
  network: NetworkMetrics;
}

export interface QualityMetrics {
  bitrate: number;
  resolution?: string;
  fps?: number;
  quality: number; // 0-1
}

export interface NetworkMetrics {
  latency: number;
  jitter: number;
  packetLoss: number;
  bandwidth: number;
}

export interface StreamStatistics {
  duration: number;
  bytesTransferred: number;
  framesProcessed: number;
  droppedFrames: number;
  averageLatency: number;
  errorCount: number;
}

export interface StreamSettings {
  autoReconnect: boolean;
  maxRetries: number;
  bufferSize: number;
  adaptiveBitrate: boolean;
  lowLatencyMode: boolean;
}

export interface StreamError {
  code: string;
  message: string;
  timestamp: Date;
  severity: 'low' | 'medium' | 'high' | 'critical';
  context?: Record<string, any>;
}

export interface NetworkQuality {
  overall: number; // 0-1
  stability: number;
  latency: number;
  bandwidth: number;
  lastChecked: Date;
}

// ============================================================================
// AI & Analysis Types
// ============================================================================

export interface AIState {
  providers: AIProvider[];
  activeProvider?: string;
  isProcessing: boolean;
  processingQueue: AITask[];
  results: AIResult[];
  settings: AISettings;
}

export interface AIProvider {
  id: string;
  name: string;
  type: 'openai' | 'anthropic' | 'google' | 'local';
  status: 'connected' | 'disconnected' | 'error' | 'rate_limited';
  capabilities: AICapability[];
  usage: ProviderUsage;
  settings: ProviderSettings;
}

export interface AICapability {
  type: 'transcription' | 'translation' | 'summarization' | 'sentiment' | 'insight' | 'qa';
  quality: number;
  speed: number;
  cost: number;
}

export interface ProviderUsage {
  requestsToday: number;
  tokensUsed: number;
  costToday: number;
  lastRequest?: Date;
  rateLimitRemaining?: number;
}

export interface ProviderSettings {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  customParameters?: Record<string, any>;
}

export interface AITask {
  id: string;
  type: AICapability['type'];
  input: any;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'queued' | 'processing' | 'completed' | 'error' | 'cancelled';
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
}

export interface AIResult {
  taskId: string;
  type: AICapability['type'];
  data: any;
  confidence: number;
  processingTime: number;
  provider: string;
  timestamp: Date;
}

export interface AISettings {
  autoProcess: boolean;
  qualityThreshold: number;
  parallelTasks: number;
  retryAttempts: number;
  preferredProvider?: string;
  fallbackEnabled: boolean;
}

export interface MeetingInsight {
  id: string;
  type: 'summary' | 'action_item' | 'decision' | 'topic' | 'sentiment' | 'keyword';
  title: string;
  content: string;
  confidence: number;
  relevance: number;
  timestamp: Date;
  tags?: string[];
  relatedSegments?: string[];
  metadata?: Record<string, any>;
}

// ============================================================================
// Recording & Media Types
// ============================================================================

export interface RecordingState {
  recordings: Record<string, RecordingData>;
  isRecording: boolean;
  currentRecordingId?: string;
  storageUsed: number;
  storageLimit: number;
  settings: RecordingSettings;
}

export interface RecordingData {
  id: string;
  meetingId: string;
  filename: string;
  duration: number;
  size: number;
  format: 'webm' | 'mp4' | 'wav' | 'mp3';
  quality: 'low' | 'medium' | 'high' | 'lossless';
  status: 'recording' | 'processing' | 'ready' | 'error' | 'deleted';
  createdAt: Date;
  processedAt?: Date;
  thumbnails?: string[];
  chapters?: RecordingChapter[];
  metadata: RecordingMetadata;
}

export interface RecordingChapter {
  id: string;
  title: string;
  startTime: number;
  endTime: number;
  thumbnail?: string;
  summary?: string;
}

export interface RecordingMetadata {
  originalSize: number;
  compressedSize?: number;
  compressionRatio?: number;
  encoding: string;
  resolution?: string;
  frameRate?: number;
  audioCodec: string;
  videoCodec?: string;
}

export interface RecordingSettings {
  autoRecord: boolean;
  format: RecordingData['format'];
  quality: RecordingData['quality'];
  includeVideo: boolean;
  includeAudio: boolean;
  includeScreenShare: boolean;
  chapterDetection: boolean;
  autoTranscribe: boolean;
  retention: 'session' | '7d' | '30d' | '90d' | 'forever';
}

// ============================================================================
// UI & Application State Types
// ============================================================================

export interface UIState {
  theme: 'light' | 'dark' | 'system';
  sidebar: SidebarState;
  modals: ModalState;
  notifications: NotificationState;
  layout: LayoutState;
  performance: PerformanceState;
}

export interface SidebarState {
  isCollapsed: boolean;
  activeSection: string;
  pinnedItems: string[];
  customSections?: SidebarSection[];
}

export interface SidebarSection {
  id: string;
  title: string;
  icon: string;
  items: SidebarItem[];
  isExpanded: boolean;
}

export interface SidebarItem {
  id: string;
  title: string;
  icon?: string;
  route: string;
  badge?: string | number;
}

export interface ModalState {
  activeModals: string[];
  modalData: Record<string, any>;
  modalHistory: string[];
}

export interface NotificationState {
  notifications: AppNotification[];
  settings: NotificationSettings;
  unreadCount: number;
}

export interface AppNotification {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  title: string;
  message: string;
  timestamp: Date;
  isRead: boolean;
  isPersistent: boolean;
  actions?: NotificationAction[];
  data?: Record<string, any>;
}

export interface NotificationAction {
  id: string;
  label: string;
  action: () => void;
  style?: 'primary' | 'secondary' | 'danger';
}

export interface NotificationSettings {
  enableBrowser: boolean;
  enableSound: boolean;
  enableDesktop: boolean;
  types: Record<AppNotification['type'], boolean>;
  autoHide: boolean;
  hideDelay: number;
}

export interface LayoutState {
  currentView: string;
  viewHistory: string[];
  panelSizes: Record<string, number>;
  isFullscreen: boolean;
  customLayouts: LayoutConfig[];
}

export interface LayoutConfig {
  id: string;
  name: string;
  description?: string;
  config: Record<string, any>;
  isDefault?: boolean;
}

export interface PerformanceState {
  fps: number;
  memoryUsage: number;
  cpuUsage: number;
  networkUsage: number;
  renderTime: number;
  isOptimized: boolean;
  metrics: PerformanceMetric[];
}

export interface PerformanceMetric {
  timestamp: Date;
  fps: number;
  memory: number;
  cpu: number;
  network: number;
  renderTime: number;
}

// ============================================================================
// Error & Debug Types
// ============================================================================

export interface ErrorState {
  errors: AppError[];
  isErrorBoundaryTriggered: boolean;
  debugMode: boolean;
  errorReporting: boolean;
}

export interface AppError {
  id: string;
  type: 'ui' | 'network' | 'audio' | 'transcription' | 'ai' | 'recording' | 'system';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  details?: string;
  stack?: string;
  timestamp: Date;
  context?: Record<string, any>;
  isResolved: boolean;
  resolution?: string;
}

// ============================================================================
// Store Action Types
// ============================================================================

export interface StoreActions {
  // User actions
  setUser: (user: User) => void;
  updateUserPreferences: (preferences: Partial<UserPreferences>) => void;
  
  // Meeting actions
  createMeeting: (meeting: Omit<Meeting, 'id'>) => void;
  updateMeeting: (id: string, updates: Partial<Meeting>) => void;
  deleteMeeting: (id: string) => void;
  setActiveMeeting: (id: string | null) => void;
  
  // Audio actions
  setAudioState: (state: Partial<AudioState>) => void;
  updateAudioSettings: (settings: Partial<AudioSettings>) => void;
  
  // Transcription actions
  addTranscriptionSegment: (meetingId: string, segment: TranscriptionSegment) => void;
  updateTranscriptionSegment: (meetingId: string, segmentId: string, updates: Partial<TranscriptionSegment>) => void;
  setTranscriptionSettings: (settings: Partial<TranscriptionSettings>) => void;
  
  // Stream actions
  addStream: (stream: StreamInfo) => void;
  updateStream: (id: string, updates: Partial<StreamInfo>) => void;
  removeStream: (id: string) => void;
  setActiveStream: (id: string | null) => void;
  
  // AI actions
  addAIProvider: (provider: AIProvider) => void;
  updateAIProvider: (id: string, updates: Partial<AIProvider>) => void;
  removeAIProvider: (id: string) => void;
  queueAITask: (task: Omit<AITask, 'id' | 'createdAt'>) => void;
  updateAITask: (id: string, updates: Partial<AITask>) => void;
  
  // Recording actions
  startRecording: (meetingId: string, settings?: Partial<RecordingSettings>) => void;
  stopRecording: () => void;
  updateRecording: (id: string, updates: Partial<RecordingData>) => void;
  deleteRecording: (id: string) => void;
  
  // UI actions
  setTheme: (theme: UIState['theme']) => void;
  toggleSidebar: () => void;
  setSidebarSection: (section: string) => void;
  openModal: (modalId: string, data?: any) => void;
  closeModal: (modalId: string) => void;
  closeAllModals: () => void;
  
  // Notification actions
  addNotification: (notification: Omit<AppNotification, 'id' | 'timestamp' | 'isRead'>) => void;
  markNotificationRead: (id: string) => void;
  removeNotification: (id: string) => void;
  clearAllNotifications: () => void;
  
  // Error actions
  addError: (error: Omit<AppError, 'id' | 'timestamp' | 'isResolved'>) => void;
  resolveError: (id: string, resolution?: string) => void;
  clearErrors: () => void;
  setDebugMode: (enabled: boolean) => void;
  
  // Reset actions
  resetStore: () => void;
  resetMeetingData: () => void;
}

// ============================================================================
// Store State Interface
// ============================================================================

export interface AppState {
  // Core state
  user: User | null;
  meetings: Record<string, Meeting>;
  activeMeetingId: string | null;
  
  // Feature state
  audio: AudioState;
  streams: StreamState;
  ai: AIState;
  recording: RecordingState;
  
  // UI state
  ui: UIState;
  errors: ErrorState;
  
  // Meta state
  isInitialized: boolean;
  isLoading: boolean;
  lastUpdated: Date;
  version: string;
}

// ============================================================================
// Store Configuration Types
// ============================================================================

export interface StoreConfig {
  persist?: {
    name: string;
    version: number;
    blacklist?: (keyof AppState)[];
    whitelist?: (keyof AppState)[];
  };
  devtools?: {
    enabled: boolean;
    name?: string;
  };
  middleware?: string[];
}

// ============================================================================
// Utility Types
// ============================================================================

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export type StoreSlice<T> = (
  set: (partial: T | Partial<T> | ((state: T) => T | Partial<T>)) => void,
  get: () => T,
  api: any
) => T;

export interface AsyncAction<T = any> {
  (args: T): Promise<void>;
}

export interface SyncAction<T = any> {
  (args: T): void;
}