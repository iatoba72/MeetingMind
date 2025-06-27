// Meeting Card Component
// Individual meeting card with actions for status updates and deletion

import React, { useState } from 'react';
import { MeetingControls } from './MeetingControls';

interface Meeting {
  id: string;
  title: string;
  description: string;
  meeting_number: string;
  status: 'not_started' | 'active' | 'paused' | 'ended' | 'cancelled';
  scheduled_start: string;
  scheduled_end: string;
  participant_count: number;
  created_by: string;
  created_at: string;
}

interface MeetingCardProps {
  meeting: Meeting;
  onDelete: (meetingId: string) => Promise<void>;
  onStatusUpdate: (meetingId: string, newStatus: string) => Promise<void>;
  onSelect: (meeting: Meeting) => void;
  showControls?: boolean;
}

export const MeetingCard: React.FC<MeetingCardProps> = ({ 
  meeting, 
  onDelete, 
  onStatusUpdate, 
  onSelect,
  showControls = false
}) => {
  const [showActions, setShowActions] = useState(false);
  const [updating, setUpdating] = useState(false);

  // Format datetime for display
  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString);
    return {
      date: date.toLocaleDateString(),
      time: date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
  };

  // Get status styling
  const getStatusStyle = (status: string) => {
    switch (status) {
      case 'not_started':
        return 'bg-gray-100 text-gray-800';
      case 'active':
        return 'bg-green-100 text-green-800';
      case 'paused':
        return 'bg-yellow-100 text-yellow-800';
      case 'ended':
        return 'bg-blue-100 text-blue-800';
      case 'cancelled':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  // Get status emoji
  const getStatusEmoji = (status: string) => {
    switch (status) {
      case 'not_started':
        return '⏳';
      case 'active':
        return '🟢';
      case 'paused':
        return '⏸️';
      case 'ended':
        return '✅';
      case 'cancelled':
        return '❌';
      default:
        return '⏳';
    }
  };

  // Get available status transitions
  const getAvailableStatuses = (currentStatus: string) => {
    switch (currentStatus) {
      case 'not_started':
        return [
          { value: 'active', label: 'Start Meeting', emoji: '▶️' },
          { value: 'cancelled', label: 'Cancel', emoji: '❌' }
        ];
      case 'active':
        return [
          { value: 'paused', label: 'Pause', emoji: '⏸️' },
          { value: 'ended', label: 'End Meeting', emoji: '⏹️' }
        ];
      case 'paused':
        return [
          { value: 'active', label: 'Resume', emoji: '▶️' },
          { value: 'ended', label: 'End Meeting', emoji: '⏹️' }
        ];
      default:
        return [];
    }
  };

  // Handle status update
  const handleStatusUpdate = async (newStatus: string) => {
    setUpdating(true);
    try {
      await onStatusUpdate(meeting.id, newStatus);
    } finally {
      setUpdating(false);
      setShowActions(false);
    }
  };

  // Handle delete
  const handleDelete = async () => {
    setUpdating(true);
    try {
      await onDelete(meeting.id);
    } finally {
      setUpdating(false);
    }
  };

  // Calculate meeting duration
  const getDuration = () => {
    const start = new Date(meeting.scheduled_start);
    const end = new Date(meeting.scheduled_end);
    const durationMs = end.getTime() - start.getTime();
    const hours = Math.floor(durationMs / (1000 * 60 * 60));
    const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  // Check if meeting is upcoming soon
  const isUpcomingSoon = () => {
    const now = new Date();
    const start = new Date(meeting.scheduled_start);
    const diffMinutes = (start.getTime() - now.getTime()) / (1000 * 60);
    return diffMinutes > 0 && diffMinutes <= 30; // Within 30 minutes
  };

  // Check if meeting is overdue
  const isOverdue = () => {
    const now = new Date();
    const start = new Date(meeting.scheduled_start);
    return now > start && meeting.status === 'not_started';
  };

  const startDateTime = formatDateTime(meeting.scheduled_start);
  const endDateTime = formatDateTime(meeting.scheduled_end);
  const availableStatuses = getAvailableStatuses(meeting.status);

  return (
    <div className={`bg-white rounded-lg border-2 p-6 hover:shadow-md transition-shadow relative ${
      isUpcomingSoon() ? 'border-orange-200 bg-orange-50' : 
      isOverdue() ? 'border-red-200 bg-red-50' : 
      'border-gray-200'
    }`}>
      
      {/* Header */}
      <div className="flex justify-between items-start mb-4">
        <div className="flex-1">
          <div className="flex items-center space-x-3 mb-2">
            <h3 
              className="text-lg font-semibold text-gray-900 cursor-pointer hover:text-blue-600"
              onClick={() => onSelect(meeting)}
            >
              {meeting.title}
            </h3>
            <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusStyle(meeting.status)}`}>
              {getStatusEmoji(meeting.status)} {meeting.status.replace('_', ' ').toUpperCase()}
            </span>
          </div>
          
          <div className="flex items-center space-x-4 text-sm text-gray-600">
            <span className="font-mono">#{meeting.meeting_number}</span>
            <span>👥 {meeting.participant_count} participants</span>
            <span>⏱️ {getDuration()}</span>
          </div>
        </div>

        {/* Actions Menu */}
        <div className="relative">
          <button
            onClick={() => setShowActions(!showActions)}
            className="p-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100"
            disabled={updating}
          >
            {updating ? (
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-600"></div>
            ) : (
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
                <path d="M10 4a2 2 0 100-4 2 2 0 000 4z" />
                <path d="M10 20a2 2 0 100-4 2 2 0 000 4z" />
              </svg>
            )}
          </button>

          {showActions && (
            <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg z-10 border border-gray-200">
              <div className="py-1">
                {/* Status Change Actions */}
                {availableStatuses.map((status) => (
                  <button
                    key={status.value}
                    onClick={() => handleStatusUpdate(status.value)}
                    className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                  >
                    <span className="mr-2">{status.emoji}</span>
                    {status.label}
                  </button>
                ))}
                
                {availableStatuses.length > 0 && (
                  <hr className="my-1" />
                )}
                
                {/* Delete Action */}
                <button
                  onClick={handleDelete}
                  className="block w-full text-left px-4 py-2 text-sm text-red-700 hover:bg-red-50"
                >
                  <span className="mr-2">🗑️</span>
                  Delete Meeting
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Description */}
      {meeting.description && (
        <p className="text-gray-600 text-sm mb-4 line-clamp-2">{meeting.description}</p>
      )}

      {/* Schedule Information */}
      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <div className="text-gray-600 mb-1">Start Time</div>
          <div className="font-medium text-gray-900">
            {startDateTime.date}
          </div>
          <div className="text-gray-600">
            {startDateTime.time}
          </div>
        </div>
        
        <div>
          <div className="text-gray-600 mb-1">End Time</div>
          <div className="font-medium text-gray-900">
            {endDateTime.date}
          </div>
          <div className="text-gray-600">
            {endDateTime.time}
          </div>
        </div>
      </div>

      {/* Warning Messages */}
      {isUpcomingSoon() && (
        <div className="mt-4 p-3 bg-orange-100 border border-orange-200 rounded-lg">
          <div className="flex items-center text-orange-800 text-sm">
            <span className="mr-2">⚠️</span>
            <span>Meeting starts in less than 30 minutes!</span>
          </div>
        </div>
      )}

      {isOverdue() && (
        <div className="mt-4 p-3 bg-red-100 border border-red-200 rounded-lg">
          <div className="flex items-center text-red-800 text-sm">
            <span className="mr-2">🚨</span>
            <span>Meeting is overdue and hasn't started yet.</span>
          </div>
        </div>
      )}

      {/* Meeting Controls */}
      {showControls && (meeting.status === 'active' || meeting.status === 'paused' || meeting.status === 'not_started') && (
        <div className="mt-4">
          <MeetingControls
            meetingId={meeting.id}
            onStatusChange={(oldStatus, newStatus) => {
              // Refresh the parent component when status changes
              onStatusUpdate(meeting.id, newStatus);
            }}
            compact={true}
          />
        </div>
      )}

      {/* Click overlay for mobile */}
      <div 
        className="absolute inset-0 cursor-pointer md:hidden"
        onClick={() => onSelect(meeting)}
      />
    </div>
  );
};