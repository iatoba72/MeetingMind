// Visual Settings Configuration Editor
// Advanced settings management interface with hierarchical configuration

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useToast } from '../../store/hooks';
import {
  Settings,
  Search,
  Filter,
  Save,
  RotateCcw,
  Upload,
  Download,
  History,
  Copy,
  Eye,
  EyeOff,
  AlertTriangle,
  CheckCircle,
  Info,
  Lock,
  Unlock,
  Folder,
  FolderOpen,
  ChevronRight,
  ChevronDown,
  Plus,
  Trash2,
  Edit,
  GitBranch,
  Clock,
  User,
  Globe,
  Users,
  Building
} from 'lucide-react';

interface SettingsDefinition {
  key: string;
  name: string;
  description: string;
  type: string;
  category: string;
  scope: string;
  default_value: any;
  ui_component: string;
  ui_props: Record<string, any>;
  help_text?: string;
  requires_restart: boolean;
  hot_reload: boolean;
  deprecated: boolean;
  sensitive: boolean;
  validation_rules?: any[];
}

interface SettingsValue {
  key: string;
  value: any;
  scope: string;
  scope_id: string;
  set_by: string;
  set_at: string;
  version: number;
  is_valid: boolean;
  validation_errors: string[];
}

interface SettingsVersion {
  version_id: string;
  version_number: number;
  description: string;
  created_at: string;
  created_by: string;
  change_summary: {
    added_count: number;
    modified_count: number;
    removed_count: number;
    total_settings: number;
  };
  tags: string[];
}

interface SettingsScope {
  value: string;
  label: string;
  icon: React.ComponentType<any>;
  description: string;
}

const SETTINGS_SCOPES: SettingsScope[] = [
  {
    value: 'global',
    label: 'Global',
    icon: Globe,
    description: 'System-wide settings that affect all users'
  },
  {
    value: 'organization',
    label: 'Organization',
    icon: Building,
    description: 'Settings for your organization'
  },
  {
    value: 'team',
    label: 'Team',
    icon: Users,
    description: 'Settings for your team'
  },
  {
    value: 'user',
    label: 'User',
    icon: User,
    description: 'Personal settings'
  }
];

interface SettingsEditorProps {
  currentScope: string;
  currentScopeId: string;
  onScopeChange: (scope: string, scopeId: string) => void;
  readOnly?: boolean;
  showAdvanced?: boolean;
}

export const SettingsEditor: React.FC<SettingsEditorProps> = ({
  currentScope,
  currentScopeId,
  onScopeChange,
  readOnly = false,
  showAdvanced = false
}) => {
  // State
  const [definitions, setDefinitions] = useState<SettingsDefinition[]>([]);
  const [values, setValues] = useState<Record<string, any>>({});
  const [versions, setVersions] = useState<SettingsVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [showOnlyModified, setShowOnlyModified] = useState(false);
  const [showSensitive, setShowSensitive] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(['appearance']));
  const [pendingChanges, setPendingChanges] = useState<Record<string, any>>({});
  const [validationErrors, setValidationErrors] = useState<Record<string, string[]>>({});
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [selectedVersion, setSelectedVersion] = useState<string | null>(null);

  // Hooks
  const showToast = useToast();

  // Categories
  const categories = useMemo(() => {
    const cats = Array.from(new Set(definitions.map(d => d.category)));
    return cats.map(cat => ({
      value: cat,
      label: cat.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
      count: definitions.filter(d => d.category === cat).length
    }));
  }, [definitions]);

  // Filtered definitions
  const filteredDefinitions = useMemo(() => {
    return definitions.filter(def => {
      // Search filter
      if (searchTerm) {
        const search = searchTerm.toLowerCase();
        if (!def.name.toLowerCase().includes(search) &&
            !def.description.toLowerCase().includes(search) &&
            !def.key.toLowerCase().includes(search)) {
          return false;
        }
      }

      // Category filter
      if (selectedCategory !== 'all' && def.category !== selectedCategory) {
        return false;
      }

      // Modified filter
      if (showOnlyModified && !(def.key in pendingChanges)) {
        return false;
      }

      // Sensitive filter
      if (def.sensitive && !showSensitive) {
        return false;
      }

      // Advanced filter
      if (!showAdvanced && def.category === 'advanced') {
        return false;
      }

      // Deprecated filter
      if (def.deprecated) {
        return false;
      }

      return true;
    });
  }, [definitions, searchTerm, selectedCategory, showOnlyModified, showSensitive, showAdvanced, pendingChanges]);

  // Group definitions by category
  const groupedDefinitions = useMemo(() => {
    const groups: Record<string, SettingsDefinition[]> = {};
    
    filteredDefinitions.forEach(def => {
      if (!groups[def.category]) {
        groups[def.category] = [];
      }
      groups[def.category].push(def);
    });

    return groups;
  }, [filteredDefinitions]);

  // Load data
  useEffect(() => {
    loadSettingsData();
  }, [currentScope, currentScopeId]);

  const loadSettingsData = async () => {
    setLoading(true);
    try {
      // Load definitions
      const defsResponse = await fetch('/api/settings/definitions');
      const defsData = await defsResponse.json();
      setDefinitions(defsData);

      // Load current values
      const valuesResponse = await fetch(`/api/settings/values/${currentScope}/${currentScopeId}`);
      const valuesData = await valuesResponse.json();
      setValues(valuesData);

      // Load version history
      const versionsResponse = await fetch(`/api/settings/versions/${currentScope}/${currentScopeId}`);
      const versionsData = await versionsResponse.json();
      setVersions(versionsData);

      // Reset pending changes
      setPendingChanges({});
      setValidationErrors({});

    } catch (error) {
      console.error('Failed to load settings data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Handle value change
  const handleValueChange = useCallback((key: string, value: any) => {
    setPendingChanges(prev => ({
      ...prev,
      [key]: value
    }));

    // Clear validation errors for this key
    setValidationErrors(prev => {
      const newErrors = { ...prev };
      delete newErrors[key];
      return newErrors;
    });
  }, []);

  // Get effective value (pending or current)
  const getEffectiveValue = useCallback((key: string) => {
    if (key in pendingChanges) {
      return pendingChanges[key];
    }
    if (key in values) {
      return values[key];
    }
    const definition = definitions.find(d => d.key === key);
    return definition?.default_value;
  }, [pendingChanges, values, definitions]);

  // Validate settings
  const validateSettings = async () => {
    const response = await fetch(`/api/settings/validate/${currentScope}/${currentScopeId}`, {
      method: 'POST'
    });
    const data = await response.json();
    
    if (!data.valid) {
      setValidationErrors(data.errors);
      return false;
    }
    
    return true;
  };

  // Save changes
  const saveChanges = async () => {
    if (Object.keys(pendingChanges).length === 0) return;

    setSaving(true);
    try {
      // Validate first
      const isValid = await validateSettings();
      if (!isValid) {
        setSaving(false);
        return;
      }

      // Save bulk changes
      const response = await fetch(`/api/settings/values/${currentScope}/${currentScopeId}/bulk`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          settings: pendingChanges,
          set_by: 'settings_editor',
          source: 'manual'
        })
      });

      if (response.ok) {
        // Reload data
        await loadSettingsData();
        
        // Show success message
        showToast('Settings saved successfully', 'success');
      } else {
        throw new Error('Failed to save settings');
      }

    } catch (error) {
      console.error('Error saving settings:', error);
      showToast('Failed to save settings. Please try again.', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Reset changes
  const resetChanges = () => {
    setPendingChanges({});
    setValidationErrors({});
  };

  // Export settings
  const exportSettings = async () => {
    try {
      const response = await fetch(`/api/settings/export/${currentScope}/${currentScopeId}?format=json&include_metadata=true`);
      const data = await response.json();
      
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = `settings_${currentScope}_${currentScopeId}_${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error exporting settings:', error);
    }
  };

  // Import settings
  const importSettings = async (file: File) => {
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      
      const response = await fetch(`/api/settings/import/${currentScope}/${currentScopeId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          data,
          merge: true,
          imported_by: 'settings_editor'
        })
      });

      if (response.ok) {
        await loadSettingsData();
        showToast('Settings imported successfully', 'success');
      } else {
        throw new Error('Failed to import settings');
      }

    } catch (error) {
      console.error('Error importing settings:', error);
      showToast('Failed to import settings. Please check the file format.', 'error');
    }
  };

  // Rollback to version
  const rollbackToVersion = async (versionId: string) => {
    try {
      const response = await fetch(`/api/settings/rollback/${currentScope}/${currentScopeId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          version_id: versionId,
          rolled_back_by: 'settings_editor'
        })
      });

      if (response.ok) {
        await loadSettingsData();
        showToast('Settings rolled back successfully', 'success');
        setShowVersionHistory(false);
        setSelectedVersion(null);
      } else {
        throw new Error('Failed to rollback settings');
      }
    } catch (error) {
      console.error('Error rolling back settings:', error);
      showToast('Failed to rollback settings. Please try again.', 'error');
    }
  };

  // Toggle category expansion
  const toggleCategory = (category: string) => {
    setExpandedCategories(prev => {
      const newSet = new Set(prev);
      if (newSet.has(category)) {
        newSet.delete(category);
      } else {
        newSet.add(category);
      }
      return newSet;
    });
  };

  // Render setting input
  const renderSettingInput = (definition: SettingsDefinition) => {
    const value = getEffectiveValue(definition.key);
    const hasError = definition.key in validationErrors;
    const isModified = definition.key in pendingChanges;

    const inputProps = {
      value,
      onChange: (newValue: any) => handleValueChange(definition.key, newValue),
      disabled: readOnly || definition.sensitive && !showSensitive,
      error: hasError,
      ...definition.ui_props
    };

    switch (definition.ui_component) {
      case 'toggle':
        return (
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={value || false}
              onChange={(e) => inputProps.onChange(e.target.checked)}
              disabled={inputProps.disabled}
              className="sr-only"
            />
            <div className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              value ? 'bg-blue-600' : 'bg-gray-200'
            } ${inputProps.disabled ? 'opacity-50' : ''}`}>
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                value ? 'translate-x-6' : 'translate-x-1'
              }`} />
            </div>
            <span className="text-sm">{value ? 'Enabled' : 'Disabled'}</span>
          </label>
        );

      case 'select':
        return (
          <select
            value={value || ''}
            onChange={(e) => inputProps.onChange(e.target.value)}
            disabled={inputProps.disabled}
            className={`w-full border rounded-lg px-3 py-2 ${hasError ? 'border-red-500' : 'border-gray-300'}`}
          >
            {inputProps.options?.map((option: any) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        );

      case 'slider':
        return (
          <div className="space-y-2">
            <input
              type="range"
              min={inputProps.min || 0}
              max={inputProps.max || 100}
              step={inputProps.step || 1}
              value={value || inputProps.min || 0}
              onChange={(e) => inputProps.onChange(Number(e.target.value))}
              disabled={inputProps.disabled}
              className="w-full"
            />
            <div className="flex justify-between text-sm text-gray-500">
              <span>{inputProps.min || 0}{inputProps.suffix || ''}</span>
              <span className="font-medium">{value || inputProps.min || 0}{inputProps.suffix || ''}</span>
              <span>{inputProps.max || 100}{inputProps.suffix || ''}</span>
            </div>
          </div>
        );

      case 'textarea':
        return (
          <textarea
            value={value || ''}
            onChange={(e) => inputProps.onChange(e.target.value)}
            disabled={inputProps.disabled}
            placeholder={definition.placeholder}
            rows={inputProps.rows || 3}
            className={`w-full border rounded-lg px-3 py-2 ${hasError ? 'border-red-500' : 'border-gray-300'}`}
          />
        );

      case 'color':
        return (
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={value || '#000000'}
              onChange={(e) => inputProps.onChange(e.target.value)}
              disabled={inputProps.disabled}
              className="w-12 h-8 border rounded"
            />
            <input
              type="text"
              value={value || '#000000'}
              onChange={(e) => inputProps.onChange(e.target.value)}
              disabled={inputProps.disabled}
              placeholder="#000000"
              className={`flex-1 border rounded px-2 py-1 ${hasError ? 'border-red-500' : 'border-gray-300'}`}
            />
          </div>
        );

      default:
        return (
          <input
            type={definition.type === 'integer' || definition.type === 'float' ? 'number' : 'text'}
            value={value || ''}
            onChange={(e) => {
              const newValue = definition.type === 'integer' ? parseInt(e.target.value) || 0 :
                              definition.type === 'float' ? parseFloat(e.target.value) || 0 :
                              e.target.value;
              inputProps.onChange(newValue);
            }}
            disabled={inputProps.disabled}
            placeholder={definition.placeholder}
            className={`w-full border rounded-lg px-3 py-2 ${hasError ? 'border-red-500' : 'border-gray-300'}`}
          />
        );
    }
  };

  // Render setting item
  const renderSettingItem = (definition: SettingsDefinition) => {
    const hasError = definition.key in validationErrors;
    const isModified = definition.key in pendingChanges;
    const value = getEffectiveValue(definition.key);

    return (
      <div key={definition.key} className={`p-4 border rounded-lg ${hasError ? 'border-red-200 bg-red-50' : 'border-gray-200'}`}>
        <div className="flex items-start justify-between mb-2">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <label className="font-medium text-sm">{definition.name}</label>
              {isModified && (
                <span className="px-2 py-0.5 bg-blue-100 text-blue-800 text-xs rounded">
                  Modified
                </span>
              )}
              {definition.requires_restart && (
                <span className="px-2 py-0.5 bg-orange-100 text-orange-800 text-xs rounded">
                  Restart Required
                </span>
              )}
              {definition.sensitive && (
                <Lock size={14} className="text-gray-400" />
              )}
            </div>
            <p className="text-sm text-gray-600 mt-1">{definition.description}</p>
            {definition.help_text && (
              <p className="text-xs text-gray-500 mt-1">{definition.help_text}</p>
            )}
          </div>
          
          <div className="flex items-center gap-2 ml-4">
            <code className="text-xs bg-gray-100 px-2 py-1 rounded">{definition.key}</code>
          </div>
        </div>

        <div className="mb-2">
          {renderSettingInput(definition)}
        </div>

        {hasError && (
          <div className="flex items-center gap-2 text-red-600 text-sm">
            <AlertTriangle size={16} />
            <div>
              {validationErrors[definition.key].map((error, index) => (
                <div key={index}>{error}</div>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center justify-between text-xs text-gray-500 mt-2">
          <span>Type: {definition.type}</span>
          <span>Default: {JSON.stringify(definition.default_value)}</span>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="settings-editor h-full flex flex-col">
      {/* Header */}
      <div className="border-b bg-white p-4">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Settings className="text-blue-500" />
            Settings Configuration
          </h1>

          <div className="flex items-center gap-2">
            {/* Scope selector */}
            <select
              value={currentScope}
              onChange={(e) => onScopeChange(e.target.value, currentScopeId)}
              className="border rounded px-3 py-2 text-sm"
            >
              {SETTINGS_SCOPES.map(scope => (
                <option key={scope.value} value={scope.value}>
                  {scope.label}
                </option>
              ))}
            </select>

            <button
              onClick={() => setShowVersionHistory(true)}
              className="flex items-center gap-1 px-3 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
              title="Version History"
            >
              <History size={16} />
              Versions
            </button>

            <button
              onClick={exportSettings}
              className="flex items-center gap-1 px-3 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
              title="Export Settings"
            >
              <Download size={16} />
              Export
            </button>

            <label className="flex items-center gap-1 px-3 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 cursor-pointer">
              <Upload size={16} />
              Import
              <input
                type="file"
                accept=".json"
                onChange={(e) => e.target.files?.[0] && importSettings(e.target.files[0])}
                className="sr-only"
              />
            </label>
          </div>
        </div>

        {/* Search and filters */}
        <div className="flex flex-wrap gap-3">
          <div className="flex-1 min-w-64">
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search settings..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-3 py-2 border rounded-lg"
              />
            </div>
          </div>

          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="border rounded px-3 py-2"
          >
            <option value="all">All Categories</option>
            {categories.map(cat => (
              <option key={cat.value} value={cat.value}>
                {cat.label} ({cat.count})
              </option>
            ))}
          </select>

          <label className="flex items-center gap-2 px-3 py-2 border rounded cursor-pointer">
            <input
              type="checkbox"
              checked={showOnlyModified}
              onChange={(e) => setShowOnlyModified(e.target.checked)}
            />
            Modified Only
          </label>

          <label className="flex items-center gap-2 px-3 py-2 border rounded cursor-pointer">
            <input
              type="checkbox"
              checked={showSensitive}
              onChange={(e) => setShowSensitive(e.target.checked)}
            />
            {showSensitive ? <Eye size={16} /> : <EyeOff size={16} />}
            Sensitive
          </label>
        </div>

        {/* Pending changes indicator */}
        {Object.keys(pendingChanges).length > 0 && (
          <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Info size={16} className="text-blue-600" />
                <span className="text-blue-800">
                  {Object.keys(pendingChanges).length} unsaved changes
                </span>
              </div>
              
              <div className="flex items-center gap-2">
                <button
                  onClick={resetChanges}
                  className="flex items-center gap-1 px-3 py-1 text-gray-600 hover:text-gray-800"
                >
                  <RotateCcw size={14} />
                  Reset
                </button>
                
                <button
                  onClick={saveChanges}
                  disabled={saving || readOnly}
                  className="flex items-center gap-1 px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
                >
                  <Save size={14} />
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="space-y-6">
          {Object.entries(groupedDefinitions).map(([category, categoryDefinitions]) => (
            <div key={category} className="bg-white rounded-lg border">
              <button
                onClick={() => toggleCategory(category)}
                className="w-full p-4 flex items-center justify-between hover:bg-gray-50"
              >
                <div className="flex items-center gap-3">
                  {expandedCategories.has(category) ? (
                    <ChevronDown size={20} />
                  ) : (
                    <ChevronRight size={20} />
                  )}
                  <h2 className="text-lg font-semibold">
                    {category.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                  </h2>
                  <span className="px-2 py-1 bg-gray-100 text-gray-600 text-sm rounded">
                    {categoryDefinitions.length}
                  </span>
                </div>
              </button>

              {expandedCategories.has(category) && (
                <div className="p-4 border-t space-y-4">
                  {categoryDefinitions.map(renderSettingItem)}
                </div>
              )}
            </div>
          ))}

          {Object.keys(groupedDefinitions).length === 0 && (
            <div className="text-center py-12 text-gray-500">
              <Settings size={48} className="mx-auto mb-4 opacity-50" />
              <div>No settings found matching your criteria</div>
              <div className="text-sm">Try adjusting your search or filters</div>
            </div>
          )}
        </div>
      </div>

      {/* Version History Modal */}
      {showVersionHistory && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg w-full max-w-4xl mx-4 max-h-[90vh] overflow-hidden flex flex-col">
            <div className="p-4 border-b flex items-center justify-between">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <History size={20} />
                Version History
              </h3>
              <button
                onClick={() => setShowVersionHistory(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                ×
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              <div className="space-y-3">
                {versions.map(version => (
                  <div
                    key={version.version_id}
                    className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                      selectedVersion === version.version_id ? 'border-blue-500 bg-blue-50' : 'hover:bg-gray-50'
                    }`}
                    onClick={() => setSelectedVersion(version.version_id)}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">Version {version.version_number}</span>
                          {version.tags.map(tag => (
                            <span key={tag} className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded">
                              {tag}
                            </span>
                          ))}
                        </div>
                        <p className="text-sm text-gray-600 mt-1">{version.description}</p>
                        <div className="flex items-center gap-4 text-xs text-gray-500 mt-2">
                          <span className="flex items-center gap-1">
                            <User size={12} />
                            {version.created_by}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock size={12} />
                            {new Date(version.created_at).toLocaleString()}
                          </span>
                        </div>
                      </div>
                      
                      <div className="text-right text-sm">
                        <div className="text-green-600">+{version.change_summary.added_count}</div>
                        <div className="text-blue-600">~{version.change_summary.modified_count}</div>
                        <div className="text-red-600">-{version.change_summary.removed_count}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-4 border-t flex justify-end gap-2">
              <button
                onClick={() => setShowVersionHistory(false)}
                className="px-4 py-2 text-gray-600 hover:text-gray-800"
              >
                Close
              </button>
              {selectedVersion && (
                <button
                  onClick={() => rollbackToVersion(selectedVersion!)}
                  className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                >
                  Rollback to This Version
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};