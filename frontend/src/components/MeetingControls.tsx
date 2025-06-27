// Meeting Controls Component
// Real-time meeting state management with status controls, recording, and participant tracking

import React, { useState } from 'react';
import { useMeetingState, MeetingState } from '../hooks/useMeetingState';

interface MeetingControlsProps {
  meetingId: string;
  onStatusChange?: (oldStatus: string, newStatus: string) => void;
  compact?: boolean;
}

export const MeetingControls: React.FC<MeetingControlsProps> = ({ 
  meetingId, 
  onStatusChange,
  compact = false 
}) => {
  const [showAdvanced, setShowAdvanced] = useState(false);
  
  const {
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
    getStatusHistory
  } = useMeetingState({
    meetingId,
    enableRealTimeUpdates: true,
    onStatusChange,
    onError: (err) => console.error('Meeting state error:', err)
  });

  if (!meetingState) {
    return (
      <div className="bg-gray-100 rounded-lg p-4 text-center">
        <div className="text-gray-500">Loading meeting controls...</div>
      </div>
    );
  }

  // Get available actions based on current status
  const getAvailableActions = (status: string) => {
    switch (status) {
      case 'not_started':
        return [
          { action: startMeeting, label: 'Start Meeting', icon: '▶️', variant: 'primary' },
          { action: cancelMeeting, label: 'Cancel', icon: '❌', variant: 'danger' }
        ];
      case 'active':
        return [
          { action: pauseMeeting, label: 'Pause', icon: '⏸️', variant: 'secondary' },
          { action: endMeeting, label: 'End Meeting', icon: '⏹️', variant: 'danger' }
        ];
      case 'paused':
        return [
          { action: resumeMeeting, label: 'Resume', icon: '▶️', variant: 'primary' },
          { action: endMeeting, label: 'End Meeting', icon: '⏹️', variant: 'danger' }
        ];
      default:
        return [];
    }
  };

  // Get recording actions
  const getRecordingActions = () => {
    switch (meetingState.recording_status) {
      case 'stopped':
        return [
          { action: startRecording, label: 'Start Recording', icon: '🔴', variant: 'primary' }
        ];
      case 'recording':
        return [
          { action: pauseRecording, label: 'Pause Recording', icon: '⏸️', variant: 'secondary' },
          { action: stopRecording, label: 'Stop Recording', icon: '⏹️', variant: 'danger' }
        ];
      case 'paused':
        return [
          { action: startRecording, label: 'Resume Recording', icon: '▶️', variant: 'primary' },
          { action: stopRecording, label: 'Stop Recording', icon: '⏹️', variant: 'danger' }
        ];
      default:
        return [];
    }
  };

  // Get button styling
  const getButtonStyle = (variant: string, disabled = false) => {
    const base = 'px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
    
    if (disabled) return `${base} bg-gray-200 text-gray-400`;
    
    switch (variant) {
      case 'primary':
        return `${base} bg-blue-600 hover:bg-blue-700 text-white`;
      case 'secondary':
        return `${base} bg-gray-600 hover:bg-gray-700 text-white`;
      case 'danger':
        return `${base} bg-red-600 hover:bg-red-700 text-white`;
      default:
        return `${base} bg-gray-200 hover:bg-gray-300 text-gray-800`;
    }
  };

  // Format elapsed time
  const formatElapsedTime = () => {
    const minutes = getElapsedTime();
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    
    if (hours > 0) {
      return `${hours}h ${mins}m`;
    }
    return `${mins}m`;
  };

  // Get status indicator
  const getStatusIndicator = (status: string) => {
    switch (status) {
      case 'not_started':
        return { emoji: '⏳', color: 'text-gray-600', bg: 'bg-gray-100' };
      case 'active':
        return { emoji: '🟢', color: 'text-green-600', bg: 'bg-green-100' };
      case 'paused':
        return { emoji: '⏸️', color: 'text-yellow-600', bg: 'bg-yellow-100' };
      case 'ended':
        return { emoji: '✅', color: 'text-blue-600', bg: 'bg-blue-100' };
      case 'cancelled':
        return { emoji: '❌', color: 'text-red-600', bg: 'bg-red-100' };
      default:
        return { emoji: '❓', color: 'text-gray-600', bg: 'bg-gray-100' };
    }
  };

  const statusIndicator = getStatusIndicator(meetingState.status);
  const availableActions = getAvailableActions(meetingState.status);
  const recordingActions = getRecordingActions();

  if (compact) {
    return (
      <div className="flex items-center space-x-2">
        <div className={`px-2 py-1 rounded-full text-xs font-medium ${statusIndicator.bg} ${statusIndicator.color}`}>
          {statusIndicator.emoji} {meetingState.status.replace('_', ' ').toUpperCase()}
        </div>
        
        {availableActions.map((action, index) => (
          <button
            key={index}
            onClick={action.action}
            disabled={isLoading}
            className={`px-3 py-1 text-sm rounded ${getButtonStyle(action.variant, isLoading)}`}
          >
            {isLoading ? '⏳' : action.icon} {action.label}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-medium text-gray-900">Meeting Controls</h3>
        <div className={`px-3 py-1 rounded-full text-sm font-medium ${statusIndicator.bg} ${statusIndicator.color}`}>
          {statusIndicator.emoji} {meetingState.status.replace('_', ' ').toUpperCase()}
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          <div className="flex">
            <span className="text-red-500 mr-2">⚠️</span>
            <span>{error}</span>
          </div>
        </div>
      )}

      {/* Meeting Status Info */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
        <div>
          <div className="text-gray-600 mb-1">Status</div>
          <div className="font-medium">{meetingState.status.replace('_', ' ')}</div>
        </div>
        
        {meetingState.actual_start && (
          <div>
            <div className="text-gray-600 mb-1">Duration</div>
            <div className="font-medium">{formatElapsedTime()}</div>
          </div>
        )}
        
        <div>
          <div className="text-gray-600 mb-1">Participants</div>
          <div className="font-medium">{meetingState.participants_joined || 0} joined</div>
        </div>
        
        <div>
          <div className="text-gray-600 mb-1">Recording</div>
          <div className="font-medium">
            {meetingState.recording_status === 'recording' && '🔴 Recording'}
            {meetingState.recording_status === 'paused' && '⏸️ Paused'}
            {meetingState.recording_status === 'stopped' && '⏹️ Stopped'}
          </div>
        </div>
      </div>

      {/* Main Controls */}
      <div className="space-y-3">
        {/* Meeting Status Controls */}
        {availableActions.length > 0 && (
          <div>
            <div className="text-sm font-medium text-gray-700 mb-2">Meeting Actions</div>
            <div className="flex flex-wrap gap-2">
              {availableActions.map((action, index) => (
                <button
                  key={index}
                  onClick={action.action}
                  disabled={isLoading}
                  className={getButtonStyle(action.variant, isLoading)}
                >
                  {isLoading ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2 inline-block"></div>
                  ) : (
                    <span className="mr-2">{action.icon}</span>
                  )}
                  {action.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Recording Controls */}
        {(meetingState.status === 'active' || meetingState.status === 'paused') && recordingActions.length > 0 && (
          <div>
            <div className="text-sm font-medium text-gray-700 mb-2">Recording Controls</div>
            <div className="flex flex-wrap gap-2">
              {recordingActions.map((action, index) => (
                <button
                  key={index}
                  onClick={action.action}
                  disabled={isLoading}
                  className={getButtonStyle(action.variant, isLoading)}
                >
                  <span className="mr-2">{action.icon}</span>
                  {action.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Advanced Options */}
      <div>
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="text-sm text-blue-600 hover:text-blue-700 font-medium"
        >
          {showAdvanced ? '▼' : '▶'} Advanced Options
        </button>
        
        {showAdvanced && (
          <div className="mt-3 space-y-3 border-t border-gray-200 pt-3">
            {/* Feature Toggles */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-gray-700">Transcription</span>
                <span className={`px-2 py-1 rounded text-xs ${
                  meetingState.transcription_active 
                    ? 'bg-green-100 text-green-800' 
                    : 'bg-gray-100 text-gray-600'
                }`}>
                  {meetingState.transcription_active ? 'ON' : 'OFF'}
                </span>
              </div>
              
              <div className="flex items-center justify-between">
                <span className="text-gray-700">AI Insights</span>
                <span className={`px-2 py-1 rounded text-xs ${
                  meetingState.ai_insights_enabled 
                    ? 'bg-green-100 text-green-800' 
                    : 'bg-gray-100 text-gray-600'
                }`}>
                  {meetingState.ai_insights_enabled ? 'ON' : 'OFF'}
                </span>
              </div>
              
              <div className="flex items-center justify-between">
                <span className="text-gray-700">Overdue</span>
                <span className={`px-2 py-1 rounded text-xs ${
                  meetingState.is_overdue 
                    ? 'bg-red-100 text-red-800' 
                    : 'bg-green-100 text-green-800'
                }`}>
                  {meetingState.is_overdue ? 'YES' : 'NO'}
                </span>
              </div>
            </div>

            {/* Status History */}
            <div>
              <div className="text-sm font-medium text-gray-700 mb-2">Status History</div>
              <div className="max-h-32 overflow-y-auto space-y-1">
                {getStatusHistory().length === 0 ? (
                  <div className="text-xs text-gray-500">No status changes yet</div>
                ) : (
                  getStatusHistory().slice(-5).reverse().map((change, index) => (
                    <div key={index} className="text-xs text-gray-600">
                      <span className="font-medium">{change.from_status}</span>
                      {' → '}
                      <span className="font-medium">{change.to_status}</span>
                      <span className="text-gray-400 ml-2">
                        {new Date(change.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};