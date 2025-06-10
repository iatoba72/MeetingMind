// Create Template Modal Component
// Form for creating meeting templates with validation and category selection

import React, { useState } from 'react';

interface CreateTemplateModalProps {
  onClose: () => void;
  onCreate: (templateData: any) => Promise<any>;
  categories: Array<{ value: string; label: string; icon: string }>;
}

interface TemplateFormData {
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
  is_public: boolean;
}

export const CreateTemplateModal: React.FC<CreateTemplateModalProps> = ({ 
  onClose, 
  onCreate, 
  categories 
}) => {
  const [formData, setFormData] = useState<TemplateFormData>({
    name: '',
    description: '',
    category: 'custom',
    default_duration_minutes: 60,
    default_settings: {
      is_recording: true,
      is_transcription_enabled: true,
      is_ai_insights_enabled: true,
      max_participants: 10
    },
    agenda_template: '',
    is_public: false
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Predefined agenda templates for different categories
  const agendaTemplates = {
    standup: `1. What did you accomplish yesterday?
2. What are you working on today?
3. Are there any blockers or impediments?
4. Any announcements or updates?`,
    
    planning: `1. Review objectives and goals
2. Discuss priorities and scope
3. Break down tasks and deliverables
4. Assign responsibilities and timelines
5. Identify risks and dependencies`,
    
    review: `1. Present completed work
2. Review against requirements
3. Collect feedback and suggestions
4. Discuss next steps and improvements
5. Document decisions and action items`,
    
    presentation: `1. Welcome and introductions
2. Agenda overview
3. Main presentation content
4. Key takeaways and next steps
5. Q&A session`,
    
    interview: `1. Welcome and company introduction
2. Candidate background and experience
3. Role-specific questions
4. Technical assessment (if applicable)
5. Candidate questions
6. Next steps and timeline`,
    
    training: `1. Learning objectives and overview
2. Topic introduction and context
3. Core content delivery
4. Hands-on exercises or examples
5. Q&A and discussion
6. Summary and next steps`,
    
    retrospective: `1. What went well?
2. What could be improved?
3. What should we start doing?
4. What should we stop doing?
5. Action items and commitments`,
    
    brainstorming: `1. Problem statement and context
2. Idea generation (no criticism)
3. Idea clarification and discussion
4. Idea evaluation and prioritization
5. Next steps and action items`,
    
    custom: ''
  };

  // Handle form field changes
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    
    if (type === 'checkbox') {
      const checkbox = e.target as HTMLInputElement;
      if (name.startsWith('default_settings.')) {
        const settingName = name.replace('default_settings.', '');
        setFormData(prev => ({
          ...prev,
          default_settings: {
            ...prev.default_settings,
            [settingName]: checkbox.checked
          }
        }));
      } else {
        setFormData(prev => ({
          ...prev,
          [name]: checkbox.checked
        }));
      }
    } else if (type === 'number') {
      if (name.startsWith('default_settings.')) {
        const settingName = name.replace('default_settings.', '');
        setFormData(prev => ({
          ...prev,
          default_settings: {
            ...prev.default_settings,
            [settingName]: parseInt(value) || 0
          }
        }));
      } else {
        setFormData(prev => ({
          ...prev,
          [name]: parseInt(value) || 0
        }));
      }
    } else {
      setFormData(prev => ({
        ...prev,
        [name]: value
      }));
    }
  };

  // Handle category change and auto-populate agenda
  const handleCategoryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const category = e.target.value;
    setFormData(prev => ({
      ...prev,
      category,
      agenda_template: agendaTemplates[category as keyof typeof agendaTemplates] || ''
    }));
  };

  // Form validation
  const validateForm = (): string | null => {
    if (!formData.name.trim()) {
      return 'Template name is required';
    }
    
    if (!formData.description.trim()) {
      return 'Template description is required';
    }
    
    if (formData.default_duration_minutes < 5 || formData.default_duration_minutes > 480) {
      return 'Duration must be between 5 and 480 minutes';
    }
    
    if (formData.default_settings.max_participants < 1 || formData.default_settings.max_participants > 1000) {
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
      await onCreate(formData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create template');
    } finally {
      setLoading(false);
    }
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
                <h3 className="text-lg font-medium text-gray-900">Create Meeting Template</h3>
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
                  <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                    Template Name *
                  </label>
                  <input
                    type="text"
                    id="name"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Enter template name"
                    required
                  />
                </div>

                <div>
                  <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
                    Description *
                  </label>
                  <textarea
                    id="description"
                    name="description"
                    value={formData.description}
                    onChange={handleChange}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Brief description of this template"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="category" className="block text-sm font-medium text-gray-700 mb-1">
                      Category
                    </label>
                    <select
                      id="category"
                      name="category"
                      value={formData.category}
                      onChange={handleCategoryChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      {categories.map((category) => (
                        <option key={category.value} value={category.value}>
                          {category.icon} {category.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label htmlFor="default_duration_minutes" className="block text-sm font-medium text-gray-700 mb-1">
                      Default Duration (minutes)
                    </label>
                    <input
                      type="number"
                      id="default_duration_minutes"
                      name="default_duration_minutes"
                      value={formData.default_duration_minutes}
                      onChange={handleChange}
                      min="5"
                      max="480"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>
              </div>

              {/* Default Settings */}
              <div className="space-y-4">
                <h4 className="text-md font-medium text-gray-900">Default Settings</h4>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="default_settings.max_participants" className="block text-sm font-medium text-gray-700 mb-1">
                      Max Participants
                    </label>
                    <input
                      type="number"
                      id="default_settings.max_participants"
                      name="default_settings.max_participants"
                      value={formData.default_settings.max_participants}
                      onChange={handleChange}
                      min="1"
                      max="1000"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      name="default_settings.is_recording"
                      checked={formData.default_settings.is_recording}
                      onChange={handleChange}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    />
                    <span className="ml-2 text-sm text-gray-700">Enable recording by default</span>
                  </label>

                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      name="default_settings.is_transcription_enabled"
                      checked={formData.default_settings.is_transcription_enabled}
                      onChange={handleChange}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    />
                    <span className="ml-2 text-sm text-gray-700">Enable live transcription by default</span>
                  </label>

                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      name="default_settings.is_ai_insights_enabled"
                      checked={formData.default_settings.is_ai_insights_enabled}
                      onChange={handleChange}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    />
                    <span className="ml-2 text-sm text-gray-700">Enable AI insights by default</span>
                  </label>

                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      name="is_public"
                      checked={formData.is_public}
                      onChange={handleChange}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    />
                    <span className="ml-2 text-sm text-gray-700">Make this template public</span>
                  </label>
                </div>
              </div>

              {/* Agenda Template */}
              <div className="space-y-4">
                <h4 className="text-md font-medium text-gray-900">Agenda Template</h4>
                
                <div>
                  <label htmlFor="agenda_template" className="block text-sm font-medium text-gray-700 mb-1">
                    Default Agenda
                  </label>
                  <textarea
                    id="agenda_template"
                    name="agenda_template"
                    value={formData.agenda_template}
                    onChange={handleChange}
                    rows={8}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Enter the default agenda items for this template..."
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    This agenda will be pre-filled when creating meetings from this template
                  </p>
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
                {loading ? 'Creating...' : 'Create Template'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};