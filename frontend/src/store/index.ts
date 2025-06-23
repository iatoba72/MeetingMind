/**
 * Main Zustand Store Configuration
 * Combines all slices and configures middleware, persistence, and devtools
 */

import { create } from 'zustand';
import { devtools, persist, subscribeWithSelector } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { 
  AppState, 
  StoreActions, 
  StoreConfig,
  User,
  UserPreferences
} from './types';

// Import all slices
import { createMeetingSlice, MeetingSlice } from './slices/meetingSlice';
import { createAudioSlice, AudioSlice } from './slices/audioSlice';
import { createStreamingSlice, StreamingSlice } from './slices/streamingSlice';
import { createAISlice, AISlice } from './slices/aiSlice';
import { createRecordingSlice, RecordingSlice } from './slices/recordingSlice';
import { createUISlice, UISlice } from './slices/uiSlice';
import { createErrorSlice, ErrorSlice } from './slices/errorSlice';

// Combined store type
export type AppStore = AppState & StoreActions & 
  MeetingSlice & 
  AudioSlice & 
  StreamingSlice & 
  AISlice & 
  RecordingSlice & 
  UISlice & 
  ErrorSlice;

// Default state
const defaultAppState: AppState = {
  // Core state
  user: null,
  meetings: {},
  activeMeetingId: null,
  
  // Feature state
  audio: {
    isRecording: false,
    isProcessing: false,
    currentLevel: 0,
    deviceId: undefined,
    sampleRate: 44100,
    channels: 1,
    quality: {
      snr: 0,
      clarity: 0,
      stability: 0,
      overall: 0
    },
    settings: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      enhancedProcessing: false,
      bufferSize: 4096,
      latencyMode: 'balanced'
    }
  },
  
  streams: {
    streams: {},
    activeStreamId: undefined,
    totalBandwidthUsage: 0,
    networkQuality: {
      overall: 0,
      stability: 0,
      latency: 0,
      bandwidth: 0,
      lastChecked: new Date()
    }
  },
  
  ai: {
    providers: [],
    activeProvider: undefined,
    isProcessing: false,
    processingQueue: [],
    results: [],
    settings: {
      autoProcess: true,
      qualityThreshold: 0.8,
      parallelTasks: 3,
      retryAttempts: 2,
      preferredProvider: undefined,
      fallbackEnabled: true
    }
  },
  
  recording: {
    recordings: {},
    isRecording: false,
    currentRecordingId: undefined,
    storageUsed: 0,
    storageLimit: 10 * 1024 * 1024 * 1024, // 10GB
    settings: {
      autoRecord: false,
      format: 'webm',
      quality: 'high',
      includeVideo: true,
      includeAudio: true,
      includeScreenShare: false,
      chapterDetection: true,
      autoTranscribe: true,
      retention: '30d'
    }
  },
  
  // UI state
  ui: {
    theme: 'system',
    sidebar: {
      isCollapsed: false,
      activeSection: 'meetings',
      pinnedItems: [],
      customSections: []
    },
    modals: {
      activeModals: [],
      modalData: {},
      modalHistory: []
    },
    notifications: {
      notifications: [],
      settings: {
        enableBrowser: true,
        enableSound: true,
        enableDesktop: false,
        types: {
          info: true,
          success: true,
          warning: true,
          error: true
        },
        autoHide: true,
        hideDelay: 5000
      },
      unreadCount: 0
    },
    layout: {
      currentView: 'dashboard',
      viewHistory: ['dashboard'],
      panelSizes: {
        sidebar: 250,
        main: 800,
        details: 300
      },
      isFullscreen: false,
      customLayouts: []
    },
    performance: {
      fps: 60,
      memoryUsage: 0,
      cpuUsage: 0,
      networkUsage: 0,
      renderTime: 0,
      isOptimized: true,
      metrics: []
    }
  },
  
  errors: {
    errors: [],
    isErrorBoundaryTriggered: false,
    debugMode: false,
    errorReporting: true
  },
  
  // Meta state
  isInitialized: false,
  isLoading: false,
  lastUpdated: new Date(),
  version: '1.0.0'
};

// Global store actions
const createGlobalActions = (set: any, get: any): StoreActions => ({
  // User actions
  setUser: (user: User) => {
    set((state: AppState) => {
      state.user = user;
      state.lastUpdated = new Date();
    });
  },
  
  updateUserPreferences: (preferences: Partial<UserPreferences>) => {
    set((state: AppState) => {
      if (state.user) {
        Object.assign(state.user.preferences, preferences);
        state.lastUpdated = new Date();
      }
    });
  },
  
  // Meeting actions (delegated to meeting slice)
  createMeeting: (meeting) => {
    return get().createMeeting(meeting);
  },
  
  updateMeeting: (id, updates) => {
    get().updateMeeting(id, updates);
  },
  
  deleteMeeting: (id) => {
    get().deleteMeeting(id);
  },
  
  setActiveMeeting: (id) => {
    get().setActiveMeeting(id);
  },
  
  // Audio actions (delegated to audio slice)
  setAudioState: (audioState) => {
    set((state: AppState) => {
      Object.assign(state.audio, audioState);
      state.lastUpdated = new Date();
    });
  },
  
  updateAudioSettings: (settings) => {
    get().updateAudioSettings(settings);
  },
  
  // Transcription actions (delegated to meeting slice)
  addTranscriptionSegment: (meetingId, segment) => {
    get().addTranscriptionSegment(meetingId, segment);
  },
  
  updateTranscriptionSegment: (meetingId, segmentId, updates) => {
    get().updateTranscriptionSegment(meetingId, segmentId, updates);
  },
  
  setTranscriptionSettings: (settings) => {
    set((state: AppState) => {
      const activeMeeting = get().getActiveMeeting();
      if (activeMeeting) {
        Object.assign(activeMeeting.transcription.settings, settings);
        state.lastUpdated = new Date();
      }
    });
  },
  
  // Stream actions (delegated to streaming slice)
  addStream: (stream) => {
    get().createStream(stream);
  },
  
  updateStream: (id, updates) => {
    get().updateStream(id, updates);
  },
  
  removeStream: (id) => {
    get().deleteStream(id);
  },
  
  setActiveStream: (id) => {
    get().setActiveStream(id);
  },
  
  // AI actions (delegated to AI slice)
  addAIProvider: (provider) => {
    get().addProvider(provider);
  },
  
  updateAIProvider: (id, updates) => {
    get().updateProvider(id, updates);
  },
  
  removeAIProvider: (id) => {
    get().removeProvider(id);
  },
  
  queueAITask: (task) => {
    get().queueTask(task);
  },
  
  updateAITask: (id, updates) => {
    get().updateTask(id, updates);
  },
  
  // Recording actions (delegated to recording slice)
  startRecording: (meetingId, settings) => {
    get().startRecording(meetingId, settings);
  },
  
  stopRecording: () => {
    get().stopRecording();
  },
  
  updateRecording: (id, updates) => {
    get().updateRecording(id, updates);
  },
  
  deleteRecording: (id) => {
    get().deleteRecording(id);
  },
  
  // UI actions (delegated to UI slice)
  setTheme: (theme) => {
    get().setTheme(theme);
  },
  
  toggleSidebar: () => {
    get().toggleSidebar();
  },
  
  setSidebarSection: (section) => {
    get().setSidebarSection(section);
  },
  
  openModal: (modalId, data) => {
    get().openModal(modalId, data);
  },
  
  closeModal: (modalId) => {
    get().closeModal(modalId);
  },
  
  closeAllModals: () => {
    get().closeAllModals();
  },
  
  // Notification actions (delegated to UI slice)
  addNotification: (notification) => {
    return get().addNotification(notification);
  },
  
  markNotificationRead: (id) => {
    get().markNotificationRead(id);
  },
  
  removeNotification: (id) => {
    get().removeNotification(id);
  },
  
  clearAllNotifications: () => {
    get().clearAllNotifications();
  },
  
  // Error actions (delegated to error slice)
  addError: (error) => {
    return get().addError(error);
  },
  
  resolveError: (id, resolution) => {
    get().resolveError(id, resolution);
  },
  
  clearErrors: () => {
    get().clearErrors();
  },
  
  setDebugMode: (enabled) => {
    get().setDebugMode(enabled);
  },
  
  // Reset actions
  resetStore: () => {
    set({ ...defaultAppState, isInitialized: false });
  },
  
  resetMeetingData: () => {
    set((state: AppState) => {
      state.meetings = {};
      state.activeMeetingId = null;
      state.lastUpdated = new Date();
    });
  }
});

// Store configuration
const storeConfig: StoreConfig = {
  persist: {
    name: 'meetingmind-store',
    version: 1,
    // Only persist user preferences, UI settings, and some meeting data
    whitelist: ['user', 'ui', 'errors'],
    // Don't persist sensitive or temporary data
    blacklist: ['audio', 'streams', 'ai', 'recording']
  },
  devtools: {
    enabled: process.env.NODE_ENV === 'development',
    name: 'MeetingMind Store'
  },
  middleware: ['immer', 'devtools', 'persist', 'subscribeWithSelector']
};

// Create the store with all slices and middleware
export const useStore = create<AppStore>()(
  devtools(
    persist(
      subscribeWithSelector(
        immer((set, get, api) => ({
          // Default state
          ...defaultAppState,
          
          // Global actions
          ...createGlobalActions(set, get),
          
          // Meeting slice
          ...createMeetingSlice(set, get, api),
          
          // Audio slice
          ...createAudioSlice(set, get, api),
          
          // Streaming slice
          ...createStreamingSlice(set, get, api),
          
          // AI slice
          ...createAISlice(set, get, api),
          
          // Recording slice
          ...createRecordingSlice(set, get, api),
          
          // UI slice
          ...createUISlice(set, get, api),
          
          // Error slice
          ...createErrorSlice(set, get, api)
        }))
      ),
      {
        name: storeConfig.persist!.name,
        version: storeConfig.persist!.version,
        partialize: (state) => {
          // Only persist whitelisted parts
          const { user, ui, errors } = state;
          return { user, ui, errors };
        }
      }
    ),
    {
      enabled: storeConfig.devtools!.enabled,
      name: storeConfig.devtools!.name
    }
  )
);

// Store initialization
export const initializeStore = async () => {
  const store = useStore.getState();
  
  try {
    // Initialize audio system
    await store.initializeAudio();
    
    // Check system health
    store.checkSystemHealth();
    
    // Set initialization flag
    useStore.setState({ isInitialized: true });
    
    console.log('Store initialized successfully');
  } catch (error) {
    console.error('Failed to initialize store:', error);
    store.addError({
      type: 'system',
      severity: 'high',
      message: 'Failed to initialize application',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

// Cleanup function for app shutdown
export const cleanupStore = () => {
  const store = useStore.getState();
  
  // Cleanup all slices
  store.cleanup?.();
  
  console.log('Store cleaned up');
};

// Export types for use in components
export type { AppStore };
export * from './types';

// Export default store
export default useStore;