// Meeting Templates Component
// Template management for recurring meetings and standardized meeting formats

import React, { useState, useEffect } from 'react';
import { CreateTemplateModal } from './CreateTemplateModal';
import { TemplateCard } from './TemplateCard';

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

interface MeetingTemplatesProps {
  clientId: string;
  onTemplateSelect?: (template: MeetingTemplate) => void;
}

export const MeetingTemplates: React.FC<MeetingTemplatesProps> = ({ 
  clientId, 
  onTemplateSelect 
}) => {
  const [templates, setTemplates] = useState<MeetingTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Predefined template categories
  const categories = [
    { value: 'all', label: 'All Templates', icon: '📁' },
    { value: 'standup', label: 'Stand-up', icon: '🏃' },
    { value: 'planning', label: 'Planning', icon: '📋' },
    { value: 'review', label: 'Review', icon: '🔍' },
    { value: 'presentation', label: 'Presentation', icon: '📊' },
    { value: 'interview', label: 'Interview', icon: '💬' },
    { value: 'training', label: 'Training', icon: '🎓' },
    { value: 'retrospective', label: 'Retrospective', icon: '🔄' },
    { value: 'brainstorming', label: 'Brainstorming', icon: '💡' },
    { value: 'custom', label: 'Custom', icon: '⚙️' }
  ];

  // Default templates that are created on first load
  const defaultTemplates = [
    {
      name: 'Daily Stand-up',
      description: 'Quick daily team sync to discuss progress and blockers',
      category: 'standup',
      default_duration_minutes: 15,
      default_settings: {
        is_recording: false,
        is_transcription_enabled: true,
        is_ai_insights_enabled: true,
        max_participants: 10
      },
      agenda_template: `1. What did you accomplish yesterday?
2. What are you working on today?
3. Are there any blockers or impediments?
4. Any announcements or updates?`,
      is_public: true
    },
    {
      name: 'Sprint Planning',
      description: 'Plan upcoming sprint goals and tasks',
      category: 'planning',
      default_duration_minutes: 120,
      default_settings: {
        is_recording: true,
        is_transcription_enabled: true,
        is_ai_insights_enabled: true,
        max_participants: 8
      },
      agenda_template: `1. Review previous sprint performance
2. Discuss upcoming sprint goals
3. Break down user stories and tasks
4. Estimate effort and assign work
5. Identify dependencies and risks`,
      is_public: true
    },
    {
      name: 'Client Presentation',
      description: 'Formal presentation to clients or stakeholders',
      category: 'presentation',
      default_duration_minutes: 60,
      default_settings: {
        is_recording: true,
        is_transcription_enabled: true,
        is_ai_insights_enabled: false,
        max_participants: 20
      },
      agenda_template: `1. Welcome and introductions
2. Project overview and objectives
3. Key findings and results
4. Recommendations and next steps
5. Q&A session`,
      is_public: true
    },
    {
      name: 'Job Interview',
      description: 'Structured interview template for candidate evaluation',
      category: 'interview',
      default_duration_minutes: 45,
      default_settings: {
        is_recording: false,
        is_transcription_enabled: false,
        is_ai_insights_enabled: false,
        max_participants: 5
      },
      agenda_template: `1. Welcome and company introduction (5 min)
2. Candidate background and experience (10 min)
3. Technical/role-specific questions (20 min)
4. Candidate questions about role/company (8 min)
5. Next steps and timeline (2 min)`,
      is_public: false
    },
    {
      name: 'Training Session',
      description: 'Educational session with learning objectives',
      category: 'training',
      default_duration_minutes: 90,
      default_settings: {
        is_recording: true,
        is_transcription_enabled: true,
        is_ai_insights_enabled: true,
        max_participants: 25
      },
      agenda_template: `1. Learning objectives and overview
2. Topic introduction and context
3. Core content delivery
4. Hands-on exercises or examples
5. Q&A and discussion
6. Summary and next steps`,
      is_public: true
    }
  ];

  // Fetch templates from backend
  const fetchTemplates = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('http://localhost:8000/meeting-templates');
      
      if (!response.ok) {
        throw new Error(`Failed to fetch templates: ${response.statusText}`);
      }

      const data = await response.json();
      setTemplates(data.templates || []);

      // If no templates exist, create default ones
      if (data.templates?.length === 0) {
        await createDefaultTemplates();
      }

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch templates');
      console.error('Error fetching templates:', err);
    } finally {
      setLoading(false);
    }
  };

  // Create default templates
  const createDefaultTemplates = async () => {
    for (const template of defaultTemplates) {
      try {
        await fetch('http://localhost:8000/meeting-templates', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            ...template,
            created_by: clientId
          }),
        });
      } catch (err) {
        console.error('Error creating default template:', err);
      }
    }
    
    // Refresh templates after creating defaults
    await fetchTemplates();
  };

  // Create a new template
  const createTemplate = async (templateData: { name: string; description: string; category: string; [key: string]: unknown }) => {
    const response = await fetch('http://localhost:8000/meeting-templates', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...templateData,
        created_by: clientId
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.detail || 'Failed to create template');
    }

    // Refresh templates list
    await fetchTemplates();
    setShowCreateModal(false);
  };

  // Delete a template
  const deleteTemplate = async (templateId: string) => {
    if (!confirm('Are you sure you want to delete this template?')) {
      return;
    }

    try {
      const response = await fetch(`http://localhost:8000/meeting-templates/${templateId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to delete template');
      }

      // Refresh templates list
      await fetchTemplates();

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete template');
      console.error('Error deleting template:', err);
    }
  };

  // Use template to create a meeting
  const useTemplate = async (template: MeetingTemplate) => {
    if (onTemplateSelect) {
      onTemplateSelect(template);
    } else {
      // Create a meeting from template with current date/time
      const now = new Date();
      const startTime = new Date(now.getTime() + 5 * 60000); // 5 minutes from now
      const endTime = new Date(startTime.getTime() + template.default_duration_minutes * 60000);

      const meetingData = {
        title: `${template.name} - ${now.toLocaleDateString()}`,
        description: template.description,
        scheduled_start: startTime.toISOString(),
        scheduled_end: endTime.toISOString(),
        agenda: template.agenda_template,
        ...template.default_settings,
        template_id: template.id,
        created_by: clientId
      };

      try {
        const response = await fetch('http://localhost:8000/meetings', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(meetingData),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.detail || 'Failed to create meeting from template');
        }

        alert('Meeting created successfully from template!');

      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create meeting from template');
        console.error('Error creating meeting from template:', err);
      }
    }
  };

  // Filter templates
  const filteredTemplates = templates.filter(template => {
    const matchesCategory = selectedCategory === 'all' || template.category === selectedCategory;
    const matchesSearch = template.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         template.description.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  // Load templates on component mount
  useEffect(() => {
    fetchTemplates();
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Meeting Templates</h2>
          <p className="text-gray-600">Create standardized meeting formats for recurring events</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium flex items-center space-x-2"
        >
          <span>📝</span>
          <span>Create Template</span>
        </button>
      </div>

      {/* Search and Filters */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
        <div className="flex flex-col sm:flex-row gap-4">
          {/* Search */}
          <div className="flex-1">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Search templates..."
              />
            </div>
          </div>

          {/* Category Filter */}
          <div className="sm:w-48">
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="block w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              {categories.map((category) => (
                <option key={category.value} value={category.value}>
                  {category.icon} {category.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Category Tabs */}
        <div className="flex flex-wrap gap-2">
          {categories.map((category) => (
            <button
              key={category.value}
              onClick={() => setSelectedCategory(category.value)}
              className={`px-3 py-1 text-sm rounded-full border transition-colors ${
                selectedCategory === category.value
                  ? 'bg-blue-100 border-blue-300 text-blue-800'
                  : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
              }`}
            >
              {category.icon} {category.label}
            </button>
          ))}
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

      {/* Loading State */}
      {loading && (
        <div className="flex justify-center items-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="ml-2 text-gray-600">Loading templates...</span>
        </div>
      )}

      {/* Templates Grid */}
      {!loading && filteredTemplates.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <div className="text-gray-400 text-6xl mb-4">📝</div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">No templates found</h3>
          <p className="text-gray-600 mb-4">
            {searchTerm || selectedCategory !== 'all'
              ? 'Try adjusting your search or filter criteria.'
              : 'Create your first meeting template to get started.'
            }
          </p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium"
          >
            Create Your First Template
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredTemplates.map((template) => (
            <TemplateCard
              key={template.id}
              template={template}
              onUse={useTemplate}
              onDelete={deleteTemplate}
              currentUserId={clientId}
            />
          ))}
        </div>
      )}

      {/* Template Statistics */}
      {templates.length > 0 && (
        <div className="bg-gradient-to-r from-green-50 to-blue-50 rounded-lg border border-green-200 p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Template Statistics</h3>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <div className="text-gray-600 mb-1">Total Templates</div>
              <div className="text-2xl font-bold text-gray-900">{templates.length}</div>
            </div>
            
            <div>
              <div className="text-gray-600 mb-1">Public Templates</div>
              <div className="text-2xl font-bold text-green-600">
                {templates.filter(t => t.is_public).length}
              </div>
            </div>
            
            <div>
              <div className="text-gray-600 mb-1">Categories Used</div>
              <div className="text-2xl font-bold text-blue-600">
                {new Set(templates.map(t => t.category)).size}
              </div>
            </div>
            
            <div>
              <div className="text-gray-600 mb-1">Avg. Duration</div>
              <div className="text-2xl font-bold text-purple-600">
                {Math.round(templates.reduce((sum, t) => sum + t.default_duration_minutes, 0) / templates.length)}m
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create Template Modal */}
      {showCreateModal && (
        <CreateTemplateModal
          onClose={() => setShowCreateModal(false)}
          onCreate={createTemplate}
          categories={categories.filter(c => c.value !== 'all')}
        />
      )}
    </div>
  );
};