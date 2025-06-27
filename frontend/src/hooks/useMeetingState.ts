// Custom hook for meeting state management
// Provides real-time meeting state updates, status transitions, and lifecycle management

import { useState, useEffect, useCallback } from 'react';
import { useWebSocket } from './useWebSocket';

export interface MeetingState {
  id: string;
  status: 'not_started' | 'active' | 'paused' | 'ended' | 'cancelled';
  actual_start?: string;
  actual_end?: string;
  duration_minutes?: number;
  is_overdue: boolean;
  participants_joined?: number;
  recording_status?: 'stopped' | 'recording' | 'paused';
  transcription_active?: boolean;
  ai_insights_enabled?: boolean;
}

export interface MeetingStateHook {
  // Current meeting state
  meetingState: MeetingState | null;
  
  // State management functions
  startMeeting: () => Promise<boolean>;
  pauseMeeting: () => Promise<boolean>;
  resumeMeeting: () => Promise<boolean>;
  endMeeting: () => Promise<boolean>;
  cancelMeeting: () => Promise<boolean>;
  
  // Recording controls
  startRecording: () => Promise<boolean>;
  stopRecording: () => Promise<boolean>;
  pauseRecording: () => Promise<boolean>;
  
  // Real-time updates
  isLoading: boolean;
  error: string | null;
  
  // Meeting analytics
  getElapsedTime: () => number;
  getStatusHistory: () => StatusChange[];
  
  // Participant management
  joinMeeting: (participantId: string) => Promise<boolean>;
  leaveMeeting: (participantId: string) => Promise<boolean>;
}

interface StatusChange {
  from_status: string;
  to_status: string;
  timestamp: string;
  triggered_by?: string;
}

interface UseMeetingStateOptions {
  meetingId?: string;
  enableRealTimeUpdates?: boolean;
  autoStart?: boolean;
  onStatusChange?: (oldStatus: string, newStatus: string) => void;
  onError?: (error: string) => void;
}

export const useMeetingState = (options: UseMeetingStateOptions = {}): MeetingStateHook => {
  const {
    meetingId,
    enableRealTimeUpdates = true,
    autoStart = false,
    onStatusChange,
    onError
  } = options;

  // State management
  const [meetingState, setMeetingState] = useState<MeetingState | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusHistory, setStatusHistory] = useState<StatusChange[]>([]);

  // WebSocket for real-time updates
  const websocket = useWebSocket({
    url: enableRealTimeUpdates ? `ws://localhost:8000/ws/meeting_${meetingId}` : undefined,
    debug: false
  });

  // API base URL
  const API_BASE = 'http://localhost:8000';

  // Load initial meeting state
  const loadMeetingState = useCallback(async () => {
    if (!meetingId) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE}/meetings/${meetingId}`);
      
      if (!response.ok) {
        throw new Error(`Failed to load meeting: ${response.statusText}`);
      }

      const meeting = await response.json();
      
      const state: MeetingState = {
        id: meeting.id,
        status: meeting.status,
        actual_start: meeting.actual_start,
        actual_end: meeting.actual_end,
        duration_minutes: meeting.duration_minutes,
        is_overdue: meeting.is_overdue,
        participants_joined: meeting.participants?.filter((p: any) => p.status === 'joined').length || 0,
        recording_status: meeting.is_recording ? 'recording' : 'stopped',
        transcription_active: meeting.is_transcription_enabled,
        ai_insights_enabled: meeting.is_ai_insights_enabled
      };

      setMeetingState(state);

    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to load meeting state';
      setError(errorMsg);
      onError?.(errorMsg);
    } finally {
      setIsLoading(false);
    }
  }, [meetingId, onError]);

  // Update meeting status
  const updateMeetingStatus = useCallback(async (newStatus: string): Promise<boolean> => {
    if (!meetingId) return false;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE}/meetings/${meetingId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to update meeting status');
      }

      const updatedMeeting = await response.json();
      
      // Record status change
      if (meetingState) {
        const statusChange: StatusChange = {
          from_status: meetingState.status,
          to_status: newStatus,
          timestamp: new Date().toISOString(),
          triggered_by: 'user'
        };
        
        setStatusHistory(prev => [...prev, statusChange]);
        onStatusChange?.(meetingState.status, newStatus);
      }

      // Update local state
      setMeetingState(prev => prev ? {
        ...prev,
        status: updatedMeeting.status,
        actual_start: updatedMeeting.actual_start,
        actual_end: updatedMeeting.actual_end,
        duration_minutes: updatedMeeting.duration_minutes
      } : null);

      // Broadcast status change via WebSocket
      if (websocket.isConnected) {
        websocket.sendMessage('meeting_status_change', {
          meeting_id: meetingId,
          old_status: meetingState?.status,
          new_status: newStatus,
          timestamp: new Date().toISOString()
        });
      }

      return true;

    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to update meeting status';
      setError(errorMsg);
      onError?.(errorMsg);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [meetingId, meetingState, onStatusChange, onError, websocket]);

  // Meeting control functions
  const startMeeting = useCallback(() => updateMeetingStatus('active'), [updateMeetingStatus]);
  const pauseMeeting = useCallback(() => updateMeetingStatus('paused'), [updateMeetingStatus]);
  const resumeMeeting = useCallback(() => updateMeetingStatus('active'), [updateMeetingStatus]);
  const endMeeting = useCallback(() => updateMeetingStatus('ended'), [updateMeetingStatus]);
  const cancelMeeting = useCallback(() => updateMeetingStatus('cancelled'), [updateMeetingStatus]);

  // Recording control functions
  const startRecording = useCallback(async (): Promise<boolean> => {
    if (!meetingId) return false;

    try {
      const response = await fetch(`${API_BASE}/meetings/${meetingId}/recording/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        setMeetingState(prev => prev ? { ...prev, recording_status: 'recording' } : null);
        return true;
      }

      return false;
    } catch {
      return false;
    }
  }, [meetingId]);

  const stopRecording = useCallback(async (): Promise<boolean> => {
    if (!meetingId) return false;

    try {
      const response = await fetch(`${API_BASE}/meetings/${meetingId}/recording/stop`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        setMeetingState(prev => prev ? { ...prev, recording_status: 'stopped' } : null);
        return true;
      }

      return false;
    } catch {
      return false;
    }
  }, [meetingId]);

  const pauseRecording = useCallback(async (): Promise<boolean> => {
    if (!meetingId) return false;

    try {
      const response = await fetch(`${API_BASE}/meetings/${meetingId}/recording/pause`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        setMeetingState(prev => prev ? { ...prev, recording_status: 'paused' } : null);
        return true;
      }

      return false;
    } catch {
      return false;
    }
  }, [meetingId]);

  // Participant management
  const joinMeeting = useCallback(async (participantId: string): Promise<boolean> => {
    if (!meetingId) return false;

    try {
      const response = await fetch(`${API_BASE}/meetings/${meetingId}/participants/${participantId}/join`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        setMeetingState(prev => prev ? {
          ...prev,
          participants_joined: (prev.participants_joined || 0) + 1
        } : null);
        return true;
      }

      return false;
    } catch {
      return false;
    }
  }, [meetingId]);

  const leaveMeeting = useCallback(async (participantId: string): Promise<boolean> => {
    if (!meetingId) return false;

    try {
      const response = await fetch(`${API_BASE}/meetings/${meetingId}/participants/${participantId}/leave`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        setMeetingState(prev => prev ? {
          ...prev,
          participants_joined: Math.max(0, (prev.participants_joined || 0) - 1)
        } : null);
        return true;
      }

      return false;
    } catch {
      return false;
    }
  }, [meetingId]);

  // Analytics functions
  const getElapsedTime = useCallback((): number => {
    if (!meetingState?.actual_start) return 0;
    
    const start = new Date(meetingState.actual_start);
    const end = meetingState.actual_end ? new Date(meetingState.actual_end) : new Date();
    
    return Math.floor((end.getTime() - start.getTime()) / 1000 / 60); // minutes
  }, [meetingState]);

  const getStatusHistory = useCallback(() => statusHistory, [statusHistory]);

  // Handle WebSocket messages for real-time updates
  useEffect(() => {
    if (!websocket.isConnected || !enableRealTimeUpdates) return;

    const handleMessage = (message: any) => {
      if (message.type === 'meeting_update' && message.data.meeting_id === meetingId) {
        setMeetingState(prev => prev ? {
          ...prev,
          ...message.data.updates
        } : null);
      }
      
      if (message.type === 'participant_joined' && message.data.meeting_id === meetingId) {
        setMeetingState(prev => prev ? {
          ...prev,
          participants_joined: (prev.participants_joined || 0) + 1
        } : null);
      }
      
      if (message.type === 'participant_left' && message.data.meeting_id === meetingId) {
        setMeetingState(prev => prev ? {
          ...prev,
          participants_joined: Math.max(0, (prev.participants_joined || 0) - 1)
        } : null);
      }
    };

    // Subscribe to WebSocket messages
    websocket.addMessageListener?.(handleMessage);

    return () => {
      websocket.removeMessageListener?.(handleMessage);
    };
  }, [websocket.isConnected, enableRealTimeUpdates, meetingId]);

  // Load initial state and handle auto-start
  useEffect(() => {
    if (meetingId) {
      loadMeetingState();
      
      if (autoStart) {
        // Auto-start meeting if it's not started and scheduled time has passed
        setTimeout(async () => {
          if (meetingState?.status === 'not_started' && meetingState.is_overdue) {
            await startMeeting();
          }
        }, 1000);
      }
    }
  }, [meetingId, loadMeetingState, autoStart]);

  return {
    meetingState,
    startMeeting,
    pauseMeeting,
    resumeMeeting,
    endMeeting,
    cancelMeeting,
    startRecording,
    stopRecording,
    pauseRecording,
    isLoading,
    error,
    getElapsedTime,
    getStatusHistory,
    joinMeeting,
    leaveMeeting
  };
};