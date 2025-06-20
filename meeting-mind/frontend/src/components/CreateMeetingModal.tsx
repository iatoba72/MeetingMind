// Create Meeting Modal Component
// Form for creating new meetings with validation and error handling

import React, { useState } from 'react';

interface CreateMeetingModalProps {
  onClose: () => void;
  onCreate: (meetingData: any) => Promise<any>;
}

interface MeetingFormData {
  title: string;
  description: string;
  scheduled_start: string;
  scheduled_end: string;
  timezone: string;
  max_participants: number;
  is_recording: boolean;
  is_transcription_enabled: boolean;
  is_ai_insights_enabled: boolean;
  agenda: string;
  meeting_notes: string;
}

export const CreateMeetingModal: React.FC<CreateMeetingModalProps> = ({ onClose, onCreate }) => {
  const [formData, setFormData] = useState<MeetingFormData>({
    title: '',
    description: '',
    scheduled_start: '',
    scheduled_end: '',
    timezone: 'UTC',
    max_participants: 100,
    is_recording: true,
    is_transcription_enabled: true,
    is_ai_insights_enabled: true,
    agenda: '',
    meeting_notes: ''
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Handle form field changes
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    
    if (type === 'checkbox') {
      const checkbox = e.target as HTMLInputElement;
      setFormData(prev => ({
        ...prev,
        [name]: checkbox.checked
      }));
    } else if (type === 'number') {
      setFormData(prev => ({
        ...prev,
        [name]: parseInt(value) || 0
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        [name]: value
      }));
    }
  };

  // Auto-set end time when start time changes
  const handleStartTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const startTime = e.target.value;
    setFormData(prev => {
      // Auto-set end time to 1 hour after start time if end time is not set
      let endTime = prev.scheduled_end;
      if (!endTime || new Date(endTime) <= new Date(startTime)) {
        const start = new Date(startTime);
        start.setHours(start.getHours() + 1);
        endTime = start.toISOString().slice(0, 16); // Format for datetime-local input
      }
      
      return {
        ...prev,
        scheduled_start: startTime,
        scheduled_end: endTime
      };
    });
  };

  // Form validation
  const validateForm = (): string | null => {
    if (!formData.title.trim()) {
      return 'Meeting title is required';
    }
    
    if (!formData.scheduled_start) {
      return 'Start time is required';
    }
    
    if (!formData.scheduled_end) {
      return 'End time is required';
    }
    
    const start = new Date(formData.scheduled_start);
    const end = new Date(formData.scheduled_end);
    
    if (end <= start) {
      return 'End time must be after start time';
    }
    
    if (start < new Date()) {
      return 'Start time cannot be in the past';
    }
    
    if (formData.max_participants < 1 || formData.max_participants > 1000) {
      return 'Max participants must be between 1 and 1000';
    }
    
    return null;
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      // Convert local datetime to ISO format
      const meetingData = {
        ...formData,
        scheduled_start: new Date(formData.scheduled_start).toISOString(),
        scheduled_end: new Date(formData.scheduled_end).toISOString(),
      };
      
      await onCreate(meetingData);
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create meeting');
    } finally {
      setLoading(false);
    }
  };

  // Get current datetime in local format for min attribute
  const getCurrentDateTime = () => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    return now.toISOString().slice(0, 16);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        {/* Background overlay */}
        <div 
          className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity"
          onClick={onClose}
        ></div>

        {/* Modal container */}
        <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-2xl sm:w-full">
          <form onSubmit={handleSubmit}>
            {/* Header */}
            <div className="bg-white px-6 py-4 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium text-gray-900">Create New Meeting</h3>
                <button
                  type="button"
                  onClick={onClose}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <span className="sr-only">Close</span>
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Form content */}
            <div className="bg-white px-6 py-4 space-y-6 max-h-96 overflow-y-auto">
              
              {/* Error display */}
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
                  <div className="flex">
                    <span className="text-red-500 mr-2">⚠️</span>
                    <span>{error}</span>
                  </div>
                </div>
              )}

              {/* Basic Information */}
              <div className="space-y-4">
                <h4 className="text-md font-medium text-gray-900">Basic Information</h4>
                
                <div>
                  <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-1">
                    Meeting Title *
                  </label>
                  <input
                    type="text"
                    id="title"
                    name="title"
                    value={formData.title}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Enter meeting title"
                    required
                  />
                </div>

                <div>
                  <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
                    Description
                  </label>
                  <textarea
                    id="description"
                    name="description"
                    value={formData.description}
                    onChange={handleChange}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Brief description of the meeting"
                  />
                </div>
              </div>

              {/* Schedule */}
              <div className="space-y-4">
                <h4 className="text-md font-medium text-gray-900">Schedule</h4>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="scheduled_start" className="block text-sm font-medium text-gray-700 mb-1">
                      Start Time *
                    </label>
                    <input
                      type="datetime-local"
                      id="scheduled_start"
                      name="scheduled_start"
                      value={formData.scheduled_start}
                      onChange={handleStartTimeChange}
                      min={getCurrentDateTime()}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      required
                    />
                  </div>

                  <div>
                    <label htmlFor="scheduled_end" className="block text-sm font-medium text-gray-700 mb-1">
                      End Time *
                    </label>
                    <input
                      type="datetime-local"
                      id="scheduled_end"
                      name="scheduled_end"
                      value={formData.scheduled_end}
                      onChange={handleChange}
                      min={formData.scheduled_start}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="timezone" className="block text-sm font-medium text-gray-700 mb-1">
                      Timezone
                    </label>
                    <select
                      id="timezone"
                      name="timezone"
                      value={formData.timezone}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="UTC">UTC</option>
                      <option value="America/New_York">Eastern Time</option>
                      <option value="America/Chicago">Central Time</option>
                      <option value="America/Denver">Mountain Time</option>
                      <option value="America/Los_Angeles">Pacific Time</option>
                      <option value="Europe/London">London</option>
                      <option value="Europe/Paris">Paris</option>
                      <option value="Asia/Tokyo">Tokyo</option>
                    </select>
                  </div>

                  <div>
                    <label htmlFor="max_participants" className="block text-sm font-medium text-gray-700 mb-1">
                      Max Participants
                    </label>
                    <input
                      type="number"
                      id="max_participants"
                      name="max_participants"
                      value={formData.max_participants}
                      onChange={handleChange}
                      min="1"
                      max="1000"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>
              </div>

              {/* Settings */}
              <div className="space-y-4">
                <h4 className="text-md font-medium text-gray-900">Meeting Settings</h4>
                
                <div className="space-y-3">
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      name="is_recording"
                      checked={formData.is_recording}
                      onChange={handleChange}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    />
                    <span className="ml-2 text-sm text-gray-700">Enable recording</span>
                  </label>

                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      name="is_transcription_enabled"
                      checked={formData.is_transcription_enabled}
                      onChange={handleChange}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    />
                    <span className="ml-2 text-sm text-gray-700">Enable live transcription</span>
                  </label>

                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      name="is_ai_insights_enabled"
                      checked={formData.is_ai_insights_enabled}
                      onChange={handleChange}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    />
                    <span className="ml-2 text-sm text-gray-700">Enable AI insights</span>
                  </label>
                </div>
              </div>

              {/* Additional Content */}
              <div className="space-y-4">
                <h4 className="text-md font-medium text-gray-900">Additional Details</h4>
                
                <div>
                  <label htmlFor="agenda" className="block text-sm font-medium text-gray-700 mb-1">
                    Agenda
                  </label>
                  <textarea
                    id="agenda"
                    name="agenda"
                    value={formData.agenda}
                    onChange={handleChange}
                    rows={4}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Meeting agenda items..."
                  />
                </div>

                <div>
                  <label htmlFor="meeting_notes" className="block text-sm font-medium text-gray-700 mb-1">
                    Meeting Notes
                  </label>
                  <textarea
                    id="meeting_notes"
                    name="meeting_notes"
                    value={formData.meeting_notes}
                    onChange={handleChange}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Pre-meeting notes or preparation details..."
                  />
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="bg-gray-50 px-6 py-4 flex justify-end space-x-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                disabled={loading}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-blue-400 disabled:cursor-not-allowed flex items-center"
                disabled={loading}
              >
                {loading && (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                )}
                {loading ? 'Creating...' : 'Create Meeting'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};