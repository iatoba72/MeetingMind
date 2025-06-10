// Template Card Component
// Individual template card with preview and action buttons

import React, { useState } from 'react';

interface MeetingTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  default_duration_minutes: number;
  default_settings: {
    is_recording: boolean;
    is_transcription_enabled: boolean;
    is_ai_insights_enabled: boolean;
    max_participants: number;
  };
  agenda_template: string;
  created_by: string;
  is_public: boolean;
  organization_id?: string;
  created_at: string;
  updated_at: string;
}

interface TemplateCardProps {
  template: MeetingTemplate;
  onUse: (template: MeetingTemplate) => void;
  onDelete: (templateId: string) => void;
  currentUserId: string;
}

export const TemplateCard: React.FC<TemplateCardProps> = ({ 
  template, 
  onUse, 
  onDelete,
  currentUserId 
}) => {
  const [showDetails, setShowDetails] = useState(false);
  const [showActions, setShowActions] = useState(false);

  // Get category styling and icon
  const getCategoryStyle = (category: string) => {
    switch (category) {
      case 'standup':
        return { icon: '🏃', color: 'bg-blue-100 text-blue-800' };
      case 'planning':
        return { icon: '📋', color: 'bg-green-100 text-green-800' };
      case 'review':
        return { icon: '🔍', color: 'bg-purple-100 text-purple-800' };
      case 'presentation':
        return { icon: '📊', color: 'bg-orange-100 text-orange-800' };
      case 'interview':
        return { icon: '💬', color: 'bg-pink-100 text-pink-800' };
      case 'training':
        return { icon: '🎓', color: 'bg-indigo-100 text-indigo-800' };
      case 'retrospective':
        return { icon: '🔄', color: 'bg-teal-100 text-teal-800' };
      case 'brainstorming':
        return { icon: '💡', color: 'bg-yellow-100 text-yellow-800' };
      default:
        return { icon: '⚙️', color: 'bg-gray-100 text-gray-800' };
    }
  };

  // Format duration
  const formatDuration = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    
    if (hours > 0) {
      return `${hours}h ${mins}m`;
    }
    return `${mins}m`;
  };

  // Check if user can edit/delete
  const canEdit = template.created_by === currentUserId;

  const categoryStyle = getCategoryStyle(template.category);

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6 hover:shadow-md transition-shadow relative">
      
      {/* Header */}
      <div className="flex justify-between items-start mb-4">
        <div className="flex-1">
          <div className="flex items-center space-x-3 mb-2">
            <h3 className="text-lg font-semibold text-gray-900">{template.name}</h3>
            <span className={`px-2 py-1 text-xs font-medium rounded-full ${categoryStyle.color}`}>
              {categoryStyle.icon} {template.category}
            </span>
            {template.is_public && (
              <span className="px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800">
                🌐 Public
              </span>
            )}
          </div>
          
          <p className="text-gray-600 text-sm line-clamp-2">{template.description}</p>
        </div>

        {/* Actions Menu */}
        {canEdit && (
          <div className="relative">
            <button
              onClick={() => setShowActions(!showActions)}
              className="p-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
                <path d="M10 4a2 2 0 100-4 2 2 0 000 4z" />
                <path d="M10 20a2 2 0 100-4 2 2 0 000 4z" />
              </svg>
            </button>

            {showActions && (
              <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg z-10 border border-gray-200">
                <div className="py-1">
                  <button
                    onClick={() => onDelete(template.id)}
                    className="block w-full text-left px-4 py-2 text-sm text-red-700 hover:bg-red-50"
                  >
                    <span className="mr-2">🗑️</span>
                    Delete Template
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Template Info */}
      <div className="grid grid-cols-2 gap-4 text-sm mb-4">
        <div>
          <div className="text-gray-600 mb-1">Duration</div>
          <div className="font-medium text-gray-900">
            {formatDuration(template.default_duration_minutes)}
          </div>
        </div>
        
        <div>
          <div className="text-gray-600 mb-1">Max Participants</div>
          <div className="font-medium text-gray-900">
            {template.default_settings.max_participants}
          </div>
        </div>
      </div>

      {/* Features */}
      <div className="flex flex-wrap gap-2 mb-4">
        {template.default_settings.is_recording && (
          <span className="px-2 py-1 text-xs bg-red-100 text-red-700 rounded-full">
            🔴 Recording
          </span>
        )}
        {template.default_settings.is_transcription_enabled && (
          <span className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded-full">
            📝 Transcription
          </span>
        )}
        {template.default_settings.is_ai_insights_enabled && (
          <span className="px-2 py-1 text-xs bg-purple-100 text-purple-700 rounded-full">
            🤖 AI Insights
          </span>
        )}
      </div>

      {/* Agenda Preview */}
      {template.agenda_template && (
        <div className="mb-4">
          <button
            onClick={() => setShowDetails(!showDetails)}
            className="text-sm text-blue-600 hover:text-blue-700 font-medium"
          >
            {showDetails ? '▼' : '▶'} Agenda Preview
          </button>
          
          {showDetails && (
            <div className="mt-2 p-3 bg-gray-50 rounded-lg">
              <pre className="text-xs text-gray-700 whitespace-pre-wrap font-sans">
                {template.agenda_template.length > 200 
                  ? `${template.agenda_template.substring(0, 200)}...`
                  : template.agenda_template
                }
              </pre>
              {template.agenda_template.length > 200 && (
                <button
                  onClick={() => setShowDetails(!showDetails)}
                  className="mt-2 text-xs text-blue-600 hover:text-blue-700"
                >
                  Show full agenda
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex space-x-2">
        <button
          onClick={() => onUse(template)}
          className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium text-sm transition-colors"
        >
          Use Template
        </button>
        
        <button
          onClick={() => setShowDetails(!showDetails)}
          className="px-3 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50 transition-colors"
        >
          Preview
        </button>
      </div>

      {/* Footer Info */}
      <div className="mt-4 pt-4 border-t border-gray-200 text-xs text-gray-500">
        <div className="flex justify-between items-center">
          <span>
            Created {new Date(template.created_at).toLocaleDateString()}
          </span>
          {!template.is_public && (
            <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded-full">
              🔒 Private
            </span>
          )}
        </div>
      </div>

      {/* Detailed View Modal */}
      {showDetails && (
        <div 
          className="fixed inset-0 z-50 overflow-y-auto"
          onClick={() => setShowDetails(false)}
        >
          <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity"></div>

            <div 
              className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="bg-white px-6 py-4 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-medium text-gray-900">{template.name}</h3>
                  <button
                    onClick={() => setShowDetails(false)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Modal Content */}
              <div className="bg-white px-6 py-4 space-y-4">
                <div>
                  <h4 className="font-medium text-gray-900 mb-2">Description</h4>
                  <p className="text-gray-600 text-sm">{template.description}</p>
                </div>

                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <h4 className="font-medium text-gray-900 mb-1">Category</h4>
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${categoryStyle.color}`}>
                      {categoryStyle.icon} {template.category}
                    </span>
                  </div>
                  <div>
                    <h4 className="font-medium text-gray-900 mb-1">Duration</h4>
                    <span className="text-gray-600">{formatDuration(template.default_duration_minutes)}</span>
                  </div>
                </div>

                <div>
                  <h4 className="font-medium text-gray-900 mb-2">Default Settings</h4>
                  <div className="text-sm space-y-1">
                    <div className="flex justify-between">
                      <span>Max Participants:</span>
                      <span>{template.default_settings.max_participants}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Recording:</span>
                      <span>{template.default_settings.is_recording ? '✅ Enabled' : '❌ Disabled'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Transcription:</span>
                      <span>{template.default_settings.is_transcription_enabled ? '✅ Enabled' : '❌ Disabled'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>AI Insights:</span>
                      <span>{template.default_settings.is_ai_insights_enabled ? '✅ Enabled' : '❌ Disabled'}</span>
                    </div>
                  </div>
                </div>

                {template.agenda_template && (
                  <div>
                    <h4 className="font-medium text-gray-900 mb-2">Full Agenda</h4>
                    <div className="bg-gray-50 p-3 rounded-lg">
                      <pre className="text-sm text-gray-700 whitespace-pre-wrap font-sans">
                        {template.agenda_template}
                      </pre>
                    </div>
                  </div>
                )}
              </div>

              {/* Modal Footer */}
              <div className="bg-gray-50 px-6 py-4 flex justify-end space-x-3">
                <button
                  onClick={() => setShowDetails(false)}
                  className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                >
                  Close
                </button>
                <button
                  onClick={() => {
                    onUse(template);
                    setShowDetails(false);
                  }}
                  className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
                >
                  Use This Template
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};