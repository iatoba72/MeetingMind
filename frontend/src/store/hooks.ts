/**
 * React Hooks for Zustand Store
 * Provides typed hooks for accessing store state and actions
 */

import { useCallback } from 'react';
import { useStore } from './index';
import type { AppStore } from './index';

// Generic hook for selecting store state
export const useAppStore = <T>(selector: (state: AppStore) => T) => {
  return useStore(selector);
};

// ============================================================================
// User Hooks
// ============================================================================

export const useUser = () => {
  return useStore((state) => state.user);
};

export const useUserActions = () => {
  return useStore((state) => ({
    setUser: state.setUser,
    updateUserPreferences: state.updateUserPreferences
  }));
};

// ============================================================================
// Meeting Hooks
// ============================================================================

export const useMeetings = () => {
  return useStore((state) => state.meetings);
};

export const useActiveMeeting = () => {
  return useStore((state) => state.getActiveMeeting());
};

export const useMeetingActions = () => {
  return useStore((state) => ({
    createMeeting: state.createMeeting,
    updateMeeting: state.updateMeeting,
    deleteMeeting: state.deleteMeeting,
    setActiveMeeting: state.setActiveMeeting,
    startMeeting: state.startMeeting,
    pauseMeeting: state.pauseMeeting,
    resumeMeeting: state.resumeMeeting,
    endMeeting: state.endMeeting
  }));
};

export const useParticipantActions = () => {
  return useStore((state) => ({
    addParticipant: state.addParticipant,
    updateParticipant: state.updateParticipant,
    removeParticipant: state.removeParticipant,
    setParticipantSpeaking: state.setParticipantSpeaking,
    updateParticipantAudioLevel: state.updateParticipantAudioLevel
  }));
};

export const useTranscriptionActions = () => {
  return useStore((state) => ({
    addTranscriptionSegment: state.addTranscriptionSegment,
    updateTranscriptionSegment: state.updateTranscriptionSegment,
    deleteTranscriptionSegment: state.deleteTranscriptionSegment,
    editTranscriptionText: state.editTranscriptionText
  }));
};

// ============================================================================
// Audio Hooks
// ============================================================================

export const useAudio = () => {
  return useStore((state) => state.audio);
};

export const useAudioActions = () => {
  return useStore((state) => ({
    initializeAudio: state.initializeAudio,
    startRecording: state.startRecording,
    stopRecording: state.stopRecording,
    pauseRecording: state.pauseRecording,
    resumeRecording: state.resumeRecording,
    updateAudioSettings: state.updateAudioSettings,
    resetAudioSettings: state.resetAudioSettings,
    requestPermissions: state.requestPermissions,
    enumerateDevices: state.enumerateDevices,
    selectDevice: state.selectDevice,
    testDevice: state.testDevice
  }));
};

export const useAudioDevices = () => {
  return useStore((state) => ({
    availableDevices: state.availableDevices,
    selectedDevice: state.selectedDevice,
    devicePermissions: state.devicePermissions
  }));
};

export const useAudioMetrics = () => {
  return useStore((state) => ({
    realTimeMetrics: state.realTimeMetrics,
    audioContext: state.audioContext,
    analyserNode: state.analyserNode
  }));
};

// ============================================================================
// Streaming Hooks
// ============================================================================

export const useStreams = () => {
  return useStore((state) => state.streams);
};

export const useStreamActions = () => {
  return useStore((state) => ({
    createStream: state.createStream,
    updateStream: state.updateStream,
    deleteStream: state.deleteStream,
    setActiveStream: state.setActiveStream,
    connectStream: state.connectStream,
    disconnectStream: state.disconnectStream,
    reconnectStream: state.reconnectStream,
    testStreamConnection: state.testStreamConnection
  }));
};

export const useNetworkQuality = () => {
  return useStore((state) => state.streams.networkQuality);
};

// ============================================================================
// AI Hooks
// ============================================================================

export const useAI = () => {
  return useStore((state) => state.ai);
};

export const useAIActions = () => {
  return useStore((state) => ({
    addProvider: state.addProvider,
    updateProvider: state.updateProvider,
    removeProvider: state.removeProvider,
    setActiveProvider: state.setActiveProvider,
    testProvider: state.testProvider,
    queueTask: state.queueTask,
    updateTask: state.updateTask,
    cancelTask: state.cancelTask,
    processNextTask: state.processNextTask
  }));
};

export const useAIProviders = () => {
  return useStore((state) => state.ai.providers);
};

export const useAIQueue = () => {
  return useStore((state) => ({
    processingQueue: state.ai.processingQueue,
    isProcessing: state.ai.isProcessing,
    results: state.ai.results
  }));
};

// ============================================================================
// Recording Hooks
// ============================================================================

export const useRecording = () => {
  return useStore((state) => state.recording);
};

export const useRecordingActions = () => {
  return useStore((state) => ({
    startRecording: state.startRecording,
    stopRecording: state.stopRecording,
    pauseRecording: state.pauseRecording,
    resumeRecording: state.resumeRecording,
    createRecording: state.createRecording,
    updateRecording: state.updateRecording,
    deleteRecording: state.deleteRecording,
    processRecording: state.processRecording
  }));
};

export const useRecordings = () => {
  return useStore((state) => state.recording.recordings);
};

export const useRecordingSettings = () => {
  return useStore((state) => ({
    settings: state.recording.settings,
    updateSettings: state.updateSettings,
    resetSettings: state.resetSettings,
    optimizeForQuality: state.optimizeForQuality
  }));
};

// ============================================================================
// UI Hooks
// ============================================================================

export const useTheme = () => {
  return useStore((state) => ({
    theme: state.ui.theme,
    setTheme: state.setTheme,
    toggleTheme: state.toggleTheme
  }));
};

export const useSidebar = () => {
  return useStore((state) => ({
    sidebar: state.ui.sidebar,
    toggleSidebar: state.toggleSidebar,
    setSidebarCollapsed: state.setSidebarCollapsed,
    setSidebarSection: state.setSidebarSection
  }));
};

export const useModals = () => {
  return useStore((state) => ({
    modals: state.ui.modals,
    openModal: state.openModal,
    closeModal: state.closeModal,
    closeAllModals: state.closeAllModals,
    isModalOpen: state.isModalOpen,
    getModalData: state.getModalData
  }));
};

export const useNotifications = () => {
  return useStore((state) => ({
    notifications: state.ui.notifications.notifications,
    unreadCount: state.ui.notifications.unreadCount,
    settings: state.ui.notifications.settings,
    addNotification: state.addNotification,
    markNotificationRead: state.markNotificationRead,
    removeNotification: state.removeNotification,
    clearAllNotifications: state.clearAllNotifications,
    updateNotificationSettings: state.updateNotificationSettings
  }));
};

export const useLayout = () => {
  return useStore((state) => ({
    layout: state.ui.layout,
    setCurrentView: state.setCurrentView,
    updatePanelSize: state.updatePanelSize,
    toggleFullscreen: state.toggleFullscreen
  }));
};

export const usePerformance = () => {
  return useStore((state) => ({
    performance: state.ui.performance,
    updatePerformanceMetrics: state.updatePerformanceMetrics,
    addPerformanceMetric: state.addPerformanceMetric,
    getPerformanceHistory: state.getPerformanceHistory
  }));
};

// ============================================================================
// Error Hooks
// ============================================================================

export const useErrors = () => {
  return useStore((state) => state.errors);
};

export const useErrorActions = () => {
  return useStore((state) => ({
    addError: state.addError,
    updateError: state.updateError,
    resolveError: state.resolveError,
    dismissError: state.dismissError,
    clearErrors: state.clearErrors,
    reportError: state.reportError,
    reportNetworkError: state.reportNetworkError,
    reportAPIError: state.reportAPIError,
    reportUIError: state.reportUIError
  }));
};

export const useDebug = () => {
  return useStore((state) => ({
    debugMode: state.errors.debugMode,
    setDebugMode: state.setDebugMode,
    toggleDebugMode: state.toggleDebugMode,
    getDebugInfo: state.getDebugInfo
  }));
};

// ============================================================================
// Utility Hooks
// ============================================================================

// Hook for showing toast notifications
export const useToast = () => {
  const showToast = useStore((state) => state.showToast);
  
  return useCallback((message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info') => {
    return showToast(message, type);
  }, [showToast]);
};

// Hook for confirmation dialogs
export const useConfirmDialog = () => {
  const showConfirmDialog = useStore((state) => state.showConfirmDialog);
  
  return useCallback((message: string, onConfirm: () => void, onCancel?: () => void) => {
    return showConfirmDialog(message, onConfirm, onCancel);
  }, [showConfirmDialog]);
};

// Hook for accessing store initialization status
export const useStoreStatus = () => {
  return useStore((state) => ({
    isInitialized: state.isInitialized,
    isLoading: state.isLoading,
    lastUpdated: state.lastUpdated,
    version: state.version
  }));
};

// Hook for real-time meeting data
export const useRealtimeMeetingData = (meetingId?: string) => {
  return useStore((state) => {
    const targetId = meetingId || state.activeMeetingId;
    if (!targetId) return null;
    
    const meeting = state.meetings[targetId];
    if (!meeting) return null;
    
    return {
      meeting,
      isActive: meeting.status === 'active',
      participants: meeting.participants,
      transcription: meeting.transcription,
      recording: meeting.recording,
      insights: meeting.insights
    };
  });
};

// Hook for system health monitoring
export const useSystemHealth = () => {
  const checkSystemHealth = useStore((state) => state.checkSystemHealth);
  const errors = useStore((state) => state.errors.errors);
  const performance = useStore((state) => state.ui.performance);
  
  return useCallback(() => {
    const health = checkSystemHealth();
    return {
      ...health,
      criticalErrors: errors.filter(e => e.severity === 'critical' && !e.isResolved).length,
      memoryUsage: performance.memoryUsage,
      fps: performance.fps
    };
  }, [checkSystemHealth, errors, performance]);
};

// Hook for advanced search across meetings
export const useSearchMeetings = () => {
  const searchMeetings = useStore((state) => state.searchMeetings);
  const filterMeetings = useStore((state) => state.filterMeetings);
  
  return useCallback((query?: string, filters?: any) => {
    if (query && filters) {
      // Combine search and filter
      const searchResults = searchMeetings(query);
      return searchResults.filter(meeting => {
        // Apply additional filters to search results
        return filterMeetings(filters).includes(meeting);
      });
    } else if (query) {
      return searchMeetings(query);
    } else if (filters) {
      return filterMeetings(filters);
    }
    return [];
  }, [searchMeetings, filterMeetings]);
};