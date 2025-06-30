// Settings Container
// Main container component that provides navigation between different settings views

import React, { useState } from 'react';
import {
  Settings,
  Flask,
  // History,
  // FileText,
  Cog
} from 'lucide-react';

import { SettingsEditor } from './SettingsEditor';
import { ConfigLaboratory } from './ConfigLaboratory';

interface Tab {
  id: string;
  label: string;
  icon: React.ComponentType<any>;
  description: string;
  component: React.ComponentType<any>;
}

const SETTINGS_TABS: Tab[] = [
  {
    id: 'editor',
    label: 'Configuration',
    icon: Cog,
    description: 'Manage application settings',
    component: SettingsEditor
  },
  {
    id: 'laboratory',
    label: 'Config Lab',
    icon: Flask,
    description: 'Test configuration changes',
    component: ConfigLaboratory
  }
];

interface SettingsContainerProps {
  defaultTab?: string;
  currentScope?: string;
  currentScopeId?: string;
  onScopeChange?: (scope: string, scopeId: string) => void;
  readOnly?: boolean;
  showAdvanced?: boolean;
}

export const SettingsContainer: React.FC<SettingsContainerProps> = ({
  defaultTab = 'editor',
  currentScope = 'user',
  currentScopeId = 'current_user',
  onScopeChange = () => {},
  readOnly = false,
  showAdvanced = false
}) => {
  const [activeTab, setActiveTab] = useState(defaultTab);

  const currentTab = SETTINGS_TABS.find(tab => tab.id === activeTab) || SETTINGS_TABS[0];
  const CurrentComponent = currentTab.component;

  return (
    <div className="settings-container h-full flex flex-col bg-gray-50">
      {/* Header with Navigation */}
      <div className="bg-white border-b">
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Settings className="text-blue-600" size={24} />
            </div>
            <div>
              <h1 className="text-xl font-bold">Settings Management</h1>
              <p className="text-sm text-gray-600">Configure and test your application settings</p>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex">
          {SETTINGS_TABS.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-6 py-3 border-b-2 transition-colors ${
                  isActive
                    ? 'border-blue-500 text-blue-600 bg-blue-50'
                    : 'border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                <Icon size={16} />
                <span className="font-medium">{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Tab Description */}
        <div className="px-6 py-2 bg-gray-50 border-b text-sm text-gray-600">
          {currentTab.description}
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'editor' ? (
          <SettingsEditor
            currentScope={currentScope}
            currentScopeId={currentScopeId}
            onScopeChange={onScopeChange}
            readOnly={readOnly}
            showAdvanced={showAdvanced}
          />
        ) : (
          <CurrentComponent />
        )}
      </div>
    </div>
  );
};