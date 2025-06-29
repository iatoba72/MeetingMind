// Database Relationship Visualizer Component
// Interactive visualization of the MeetingMind database schema and relationships

import React, { useState } from 'react';

interface Table {
  name: string;
  columns: Column[];
  position: { x: number; y: number };
  color: string;
}

interface Column {
  name: string;
  type: string;
  nullable: boolean;
  primary_key: boolean;
  foreign_key?: string;
  unique?: boolean;
  default?: string;
}

interface Relationship {
  from_table: string;
  from_column: string;
  to_table: string;
  to_column: string;
  relationship_type: 'one-to-one' | 'one-to-many' | 'many-to-many';
}

export const DatabaseVisualizer: React.FC = () => {
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [showRelationships, setShowRelationships] = useState(true);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [viewMode, setViewMode] = useState<'schema' | 'data' | 'statistics'>('schema');

  // Database schema definition
  const tables: Table[] = [
    {
      name: 'meeting_templates',
      position: { x: 50, y: 50 },
      color: '#E5E7EB',
      columns: [
        { name: 'id', type: 'UUID', nullable: false, primary_key: true },
        { name: 'name', type: 'VARCHAR(255)', nullable: false },
        { name: 'description', type: 'TEXT', nullable: true },
        { name: 'category', type: 'VARCHAR(100)', nullable: true },
        { name: 'default_duration_minutes', type: 'INTEGER', nullable: true, default: '60' },
        { name: 'default_settings', type: 'JSONB', nullable: true },
        { name: 'agenda_template', type: 'TEXT', nullable: true },
        { name: 'created_by', type: 'VARCHAR(255)', nullable: false },
        { name: 'is_public', type: 'BOOLEAN', nullable: true, default: 'false' },
        { name: 'organization_id', type: 'VARCHAR(255)', nullable: true },
        { name: 'created_at', type: 'TIMESTAMP', nullable: false },
        { name: 'updated_at', type: 'TIMESTAMP', nullable: false }
      ]
    },
    {
      name: 'meetings',
      position: { x: 400, y: 150 },
      color: '#DBEAFE',
      columns: [
        { name: 'id', type: 'UUID', nullable: false, primary_key: true },
        { name: 'title', type: 'VARCHAR(500)', nullable: false },
        { name: 'description', type: 'TEXT', nullable: true },
        { name: 'meeting_number', type: 'VARCHAR(50)', nullable: true, unique: true },
        { name: 'scheduled_start', type: 'TIMESTAMP', nullable: false },
        { name: 'scheduled_end', type: 'TIMESTAMP', nullable: false },
        { name: 'actual_start', type: 'TIMESTAMP', nullable: true },
        { name: 'actual_end', type: 'TIMESTAMP', nullable: true },
        { name: 'timezone', type: 'VARCHAR(50)', nullable: true, default: 'UTC' },
        { name: 'status', type: 'ENUM(MeetingStatus)', nullable: false, default: 'not_started' },
        { name: 'max_participants', type: 'INTEGER', nullable: true, default: '100' },
        { name: 'is_recording', type: 'BOOLEAN', nullable: true, default: 'true' },
        { name: 'is_transcription_enabled', type: 'BOOLEAN', nullable: true, default: 'true' },
        { name: 'is_ai_insights_enabled', type: 'BOOLEAN', nullable: true, default: 'true' },
        { name: 'meeting_url', type: 'VARCHAR(500)', nullable: true },
        { name: 'meeting_password', type: 'VARCHAR(100)', nullable: true },
        { name: 'is_public', type: 'BOOLEAN', nullable: true, default: 'false' },
        { name: 'requires_approval', type: 'BOOLEAN', nullable: true, default: 'false' },
        { name: 'created_by', type: 'VARCHAR(255)', nullable: false },
        { name: 'organization_id', type: 'VARCHAR(255)', nullable: true },
        { name: 'template_id', type: 'UUID', nullable: true, foreign_key: 'meeting_templates.id' },
        { name: 'calendar_event_id', type: 'VARCHAR(255)', nullable: true },
        { name: 'external_meeting_id', type: 'VARCHAR(255)', nullable: true },
        { name: 'agenda', type: 'TEXT', nullable: true },
        { name: 'meeting_notes', type: 'TEXT', nullable: true },
        { name: 'recording_url', type: 'VARCHAR(500)', nullable: true },
        { name: 'participant_count', type: 'INTEGER', nullable: true, default: '0' },
        { name: 'total_speaking_time_seconds', type: 'INTEGER', nullable: true, default: '0' },
        { name: 'created_at', type: 'TIMESTAMP', nullable: false },
        { name: 'updated_at', type: 'TIMESTAMP', nullable: false }
      ]
    },
    {
      name: 'participants',
      position: { x: 100, y: 450 },
      color: '#D1FAE5',
      columns: [
        { name: 'id', type: 'UUID', nullable: false, primary_key: true },
        { name: 'meeting_id', type: 'UUID', nullable: false, foreign_key: 'meetings.id' },
        { name: 'user_id', type: 'VARCHAR(255)', nullable: true },
        { name: 'email', type: 'VARCHAR(255)', nullable: false },
        { name: 'display_name', type: 'VARCHAR(255)', nullable: false },
        { name: 'avatar_url', type: 'VARCHAR(500)', nullable: true },
        { name: 'role', type: 'ENUM(ParticipantRole)', nullable: false, default: 'participant' },
        { name: 'status', type: 'ENUM(ParticipantStatus)', nullable: false, default: 'invited' },
        { name: 'invited_at', type: 'TIMESTAMP', nullable: false },
        { name: 'joined_at', type: 'TIMESTAMP', nullable: true },
        { name: 'left_at', type: 'TIMESTAMP', nullable: true },
        { name: 'speaking_time_seconds', type: 'INTEGER', nullable: true, default: '0' },
        { name: 'microphone_on_duration_seconds', type: 'INTEGER', nullable: true, default: '0' },
        { name: 'camera_on_duration_seconds', type: 'INTEGER', nullable: true, default: '0' },
        { name: 'chat_messages_count', type: 'INTEGER', nullable: true, default: '0' },
        { name: 'screen_share_duration_seconds', type: 'INTEGER', nullable: true, default: '0' },
        { name: 'connection_quality_score', type: 'FLOAT', nullable: true },
        { name: 'device_info', type: 'JSONB', nullable: true },
        { name: 'ip_address', type: 'VARCHAR(45)', nullable: true },
        { name: 'can_speak', type: 'BOOLEAN', nullable: true, default: 'true' },
        { name: 'can_share_screen', type: 'BOOLEAN', nullable: true, default: 'true' },
        { name: 'can_use_chat', type: 'BOOLEAN', nullable: true, default: 'true' },
        { name: 'created_at', type: 'TIMESTAMP', nullable: false },
        { name: 'updated_at', type: 'TIMESTAMP', nullable: false }
      ]
    },
    {
      name: 'transcripts',
      position: { x: 600, y: 450 },
      color: '#FEF3C7',
      columns: [
        { name: 'id', type: 'UUID', nullable: false, primary_key: true },
        { name: 'meeting_id', type: 'UUID', nullable: false, foreign_key: 'meetings.id' },
        { name: 'participant_id', type: 'UUID', nullable: true, foreign_key: 'participants.id' },
        { name: 'content', type: 'TEXT', nullable: false },
        { name: 'transcript_type', type: 'ENUM(TranscriptType)', nullable: false, default: 'speech' },
        { name: 'language', type: 'VARCHAR(10)', nullable: true, default: 'en' },
        { name: 'start_time_seconds', type: 'FLOAT', nullable: false },
        { name: 'end_time_seconds', type: 'FLOAT', nullable: false },
        { name: 'sequence_number', type: 'INTEGER', nullable: false },
        { name: 'confidence_score', type: 'FLOAT', nullable: true },
        { name: 'word_count', type: 'INTEGER', nullable: true, default: '0' },
        { name: 'is_final', type: 'BOOLEAN', nullable: true, default: 'false' },
        { name: 'speaker_id', type: 'VARCHAR(100)', nullable: true },
        { name: 'is_speaker_identified', type: 'BOOLEAN', nullable: true, default: 'false' },
        { name: 'transcription_engine', type: 'VARCHAR(100)', nullable: true },
        { name: 'processing_metadata', type: 'JSONB', nullable: true },
        { name: 'is_processed_for_insights', type: 'BOOLEAN', nullable: true, default: 'false' },
        { name: 'contains_action_items', type: 'BOOLEAN', nullable: true, default: 'false' },
        { name: 'sentiment_score', type: 'FLOAT', nullable: true },
        { name: 'created_at', type: 'TIMESTAMP', nullable: false },
        { name: 'updated_at', type: 'TIMESTAMP', nullable: false }
      ]
    },
    {
      name: 'ai_insights',
      position: { x: 800, y: 250 },
      color: '#E0E7FF',
      columns: [
        { name: 'id', type: 'UUID', nullable: false, primary_key: true },
        { name: 'meeting_id', type: 'UUID', nullable: false, foreign_key: 'meetings.id' },
        { name: 'insight_type', type: 'ENUM(InsightType)', nullable: false },
        { name: 'title', type: 'VARCHAR(500)', nullable: false },
        { name: 'content', type: 'TEXT', nullable: false },
        { name: 'structured_data', type: 'JSONB', nullable: true },
        { name: 'confidence_score', type: 'FLOAT', nullable: false },
        { name: 'accuracy_rating', type: 'FLOAT', nullable: true },
        { name: 'usefulness_rating', type: 'FLOAT', nullable: true },
        { name: 'ai_model', type: 'VARCHAR(100)', nullable: false },
        { name: 'processing_version', type: 'VARCHAR(50)', nullable: true },
        { name: 'processing_duration_seconds', type: 'FLOAT', nullable: true },
        { name: 'input_token_count', type: 'INTEGER', nullable: true },
        { name: 'output_token_count', type: 'INTEGER', nullable: true },
        { name: 'processing_cost_cents', type: 'FLOAT', nullable: true },
        { name: 'source_transcript_ids', type: 'JSONB', nullable: true },
        { name: 'source_time_range', type: 'JSONB', nullable: true },
        { name: 'is_user_validated', type: 'BOOLEAN', nullable: true, default: 'false' },
        { name: 'user_feedback', type: 'TEXT', nullable: true },
        { name: 'is_action_required', type: 'BOOLEAN', nullable: true, default: 'false' },
        { name: 'action_assignee', type: 'VARCHAR(255)', nullable: true },
        { name: 'action_due_date', type: 'TIMESTAMP', nullable: true },
        { name: 'is_public', type: 'BOOLEAN', nullable: true, default: 'false' },
        { name: 'shared_with', type: 'JSONB', nullable: true },
        { name: 'created_at', type: 'TIMESTAMP', nullable: false },
        { name: 'updated_at', type: 'TIMESTAMP', nullable: false }
      ]
    },
    {
      name: 'tags',
      position: { x: 1000, y: 50 },
      color: '#FECACA',
      columns: [
        { name: 'id', type: 'UUID', nullable: false, primary_key: true },
        { name: 'name', type: 'VARCHAR(100)', nullable: false },
        { name: 'slug', type: 'VARCHAR(100)', nullable: false, unique: true },
        { name: 'description', type: 'TEXT', nullable: true },
        { name: 'parent_id', type: 'UUID', nullable: true, foreign_key: 'tags.id' },
        { name: 'color', type: 'VARCHAR(7)', nullable: true, default: '#3B82F6' },
        { name: 'icon', type: 'VARCHAR(50)', nullable: true },
        { name: 'is_system', type: 'BOOLEAN', nullable: true, default: 'false' },
        { name: 'is_auto_assigned', type: 'BOOLEAN', nullable: true, default: 'false' },
        { name: 'usage_count', type: 'INTEGER', nullable: true, default: '0' },
        { name: 'last_used', type: 'TIMESTAMP', nullable: true },
        { name: 'created_by', type: 'VARCHAR(255)', nullable: true },
        { name: 'organization_id', type: 'VARCHAR(255)', nullable: true },
        { name: 'is_public', type: 'BOOLEAN', nullable: true, default: 'true' },
        { name: 'created_at', type: 'TIMESTAMP', nullable: false },
        { name: 'updated_at', type: 'TIMESTAMP', nullable: false }
      ]
    },
    {
      name: 'meeting_tags',
      position: { x: 700, y: 50 },
      color: '#F3E8FF',
      columns: [
        { name: 'meeting_id', type: 'UUID', nullable: false, primary_key: true, foreign_key: 'meetings.id' },
        { name: 'tag_id', type: 'UUID', nullable: false, primary_key: true, foreign_key: 'tags.id' }
      ]
    }
  ];

  // Relationships between tables
  const relationships: Relationship[] = [
    {
      from_table: 'meetings',
      from_column: 'template_id',
      to_table: 'meeting_templates',
      to_column: 'id',
      relationship_type: 'many-to-one'
    },
    {
      from_table: 'participants',
      from_column: 'meeting_id',
      to_table: 'meetings',
      to_column: 'id',
      relationship_type: 'many-to-one'
    },
    {
      from_table: 'transcripts',
      from_column: 'meeting_id',
      to_table: 'meetings',
      to_column: 'id',
      relationship_type: 'many-to-one'
    },
    {
      from_table: 'transcripts',
      from_column: 'participant_id',
      to_table: 'participants',
      to_column: 'id',
      relationship_type: 'many-to-one'
    },
    {
      from_table: 'ai_insights',
      from_column: 'meeting_id',
      to_table: 'meetings',
      to_column: 'id',
      relationship_type: 'many-to-one'
    },
    {
      from_table: 'meeting_tags',
      from_column: 'meeting_id',
      to_table: 'meetings',
      to_column: 'id',
      relationship_type: 'many-to-many'
    },
    {
      from_table: 'meeting_tags',
      from_column: 'tag_id',
      to_table: 'tags',
      to_column: 'id',
      relationship_type: 'many-to-many'
    },
    {
      from_table: 'tags',
      from_column: 'parent_id',
      to_table: 'tags',
      to_column: 'id',
      relationship_type: 'many-to-one'
    }
  ];

  // Get table position with zoom
  const getTableStyle = (table: Table) => ({
    left: table.position.x * zoomLevel,
    top: table.position.y * zoomLevel,
    transform: `scale(${zoomLevel})`,
    transformOrigin: 'top left'
  });

  // Get column type styling
  const getColumnTypeStyle = (column: Column) => {
    if (column.primary_key) return 'text-yellow-700 font-bold';
    if (column.foreign_key) return 'text-blue-700';
    if (column.type.includes('ENUM')) return 'text-purple-700';
    if (column.type.includes('JSONB')) return 'text-green-700';
    if (column.type.includes('TIMESTAMP')) return 'text-red-700';
    return 'text-gray-700';
  };

  // Get column icon
  const getColumnIcon = (column: Column) => {
    if (column.primary_key) return '🔑';
    if (column.foreign_key) return '🔗';
    if (column.unique) return '⭐';
    if (!column.nullable) return '❗';
    return '';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Database Schema Visualizer</h2>
          <p className="text-gray-600">Interactive visualization of MeetingMind database relationships</p>
        </div>
        
        <div className="flex items-center space-x-4">
          {/* View Mode Selector */}
          <select
            value={viewMode}
            onChange={(e) => setViewMode(e.target.value as 'schema' | 'relationships' | 'performance')}
            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="schema">Schema View</option>
            <option value="data">Data Types</option>
            <option value="statistics">Statistics</option>
          </select>
          
          {/* Zoom Controls */}
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setZoomLevel(Math.max(0.5, zoomLevel - 0.1))}
              className="px-2 py-1 bg-gray-200 hover:bg-gray-300 rounded text-sm"
            >
              −
            </button>
            <span className="text-sm font-medium w-12 text-center">{Math.round(zoomLevel * 100)}%</span>
            <button
              onClick={() => setZoomLevel(Math.min(2, zoomLevel + 0.1))}
              className="px-2 py-1 bg-gray-200 hover:bg-gray-300 rounded text-sm"
            >
              +
            </button>
          </div>
          
          {/* Relationships Toggle */}
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={showRelationships}
              onChange={(e) => setShowRelationships(e.target.checked)}
              className="mr-2"
            />
            <span className="text-sm">Show Relationships</span>
          </label>
        </div>
      </div>

      {/* Legend */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <h3 className="text-sm font-medium text-gray-900 mb-3">Legend</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
          <div className="flex items-center space-x-2">
            <span className="text-yellow-700">🔑</span>
            <span>Primary Key</span>
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-blue-700">🔗</span>
            <span>Foreign Key</span>
          </div>
          <div className="flex items-center space-x-2">
            <span>⭐</span>
            <span>Unique</span>
          </div>
          <div className="flex items-center space-x-2">
            <span>❗</span>
            <span>Not Null</span>
          </div>
        </div>
      </div>

      {/* Schema Visualization */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-auto" style={{ height: '600px' }}>
        <div 
          className="relative"
          style={{ 
            width: `${1200 * zoomLevel}px`, 
            height: `${800 * zoomLevel}px`,
            minWidth: '100%',
            minHeight: '100%'
          }}
        >
          {/* Relationship Lines */}
          {showRelationships && (
            <svg
              className="absolute inset-0 pointer-events-none"
              style={{ 
                width: `${1200 * zoomLevel}px`, 
                height: `${800 * zoomLevel}px` 
              }}
            >
              {relationships.map((rel, index) => {
                const fromTable = tables.find(t => t.name === rel.from_table);
                const toTable = tables.find(t => t.name === rel.to_table);
                
                if (!fromTable || !toTable) return null;
                
                const fromX = (fromTable.position.x + 150) * zoomLevel;
                const fromY = (fromTable.position.y + 50) * zoomLevel;
                const toX = (toTable.position.x + 150) * zoomLevel;
                const toY = (toTable.position.y + 50) * zoomLevel;
                
                return (
                  <g key={index}>
                    <line
                      x1={fromX}
                      y1={fromY}
                      x2={toX}
                      y2={toY}
                      stroke="#6B7280"
                      strokeWidth="2"
                      strokeDasharray={rel.relationship_type === 'many-to-many' ? '5,5' : '0'}
                    />
                    <circle cx={fromX} cy={fromY} r="3" fill="#3B82F6" />
                    <circle cx={toX} cy={toY} r="3" fill="#EF4444" />
                  </g>
                );
              })}
            </svg>
          )}

          {/* Tables */}
          {tables.map((table) => (
            <div
              key={table.name}
              className={`absolute bg-white border-2 rounded-lg shadow-md cursor-pointer transition-all ${
                selectedTable === table.name ? 'border-blue-500 shadow-lg' : 'border-gray-300'
              }`}
              style={getTableStyle(table)}
              onClick={() => setSelectedTable(selectedTable === table.name ? null : table.name)}
            >
              {/* Table Header */}
              <div 
                className="px-3 py-2 rounded-t-lg font-semibold text-sm"
                style={{ backgroundColor: table.color }}
              >
                <div className="flex items-center justify-between">
                  <span>{table.name}</span>
                  <span className="text-xs bg-white px-2 py-1 rounded">
                    {table.columns.length} cols
                  </span>
                </div>
              </div>

              {/* Table Columns */}
              <div className="p-2 max-h-40 overflow-y-auto" style={{ width: '300px' }}>
                {(selectedTable === table.name ? table.columns : table.columns.slice(0, 5)).map((column) => (
                  <div 
                    key={column.name} 
                    className="flex items-center justify-between py-1 text-xs border-b border-gray-100 last:border-b-0"
                  >
                    <div className="flex items-center space-x-1">
                      <span>{getColumnIcon(column)}</span>
                      <span className={`font-medium ${getColumnTypeStyle(column)}`}>
                        {column.name}
                      </span>
                    </div>
                    <span className="text-gray-500 text-xs">
                      {column.type.replace(/\([^)]*\)/g, '')}
                    </span>
                  </div>
                ))}
                
                {selectedTable !== table.name && table.columns.length > 5 && (
                  <div className="text-xs text-gray-500 text-center py-1">
                    +{table.columns.length - 5} more columns
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Table Details */}
      {selectedTable && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex justify-between items-start mb-4">
            <h3 className="text-lg font-medium text-gray-900">{selectedTable} Table Details</h3>
            <button
              onClick={() => setSelectedTable(null)}
              className="text-gray-400 hover:text-gray-600"
            >
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {(() => {
            const table = tables.find(t => t.name === selectedTable);
            if (!table) return null;

            return (
              <div className="space-y-4">
                {/* Table Statistics */}
                <div className="grid grid-cols-4 gap-4 text-sm">
                  <div>
                    <div className="text-gray-600 mb-1">Total Columns</div>
                    <div className="font-medium text-gray-900">{table.columns.length}</div>
                  </div>
                  <div>
                    <div className="text-gray-600 mb-1">Primary Keys</div>
                    <div className="font-medium text-gray-900">
                      {table.columns.filter(c => c.primary_key).length}
                    </div>
                  </div>
                  <div>
                    <div className="text-gray-600 mb-1">Foreign Keys</div>
                    <div className="font-medium text-gray-900">
                      {table.columns.filter(c => c.foreign_key).length}
                    </div>
                  </div>
                  <div>
                    <div className="text-gray-600 mb-1">Nullable</div>
                    <div className="font-medium text-gray-900">
                      {table.columns.filter(c => c.nullable).length}
                    </div>
                  </div>
                </div>

                {/* Column Details */}
                <div>
                  <h4 className="font-medium text-gray-900 mb-3">Column Details</h4>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-2 text-left">Column</th>
                          <th className="px-4 py-2 text-left">Type</th>
                          <th className="px-4 py-2 text-left">Constraints</th>
                          <th className="px-4 py-2 text-left">Default</th>
                          <th className="px-4 py-2 text-left">Foreign Key</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {table.columns.map((column) => (
                          <tr key={column.name}>
                            <td className="px-4 py-2">
                              <div className="flex items-center space-x-2">
                                <span>{getColumnIcon(column)}</span>
                                <span className={`font-medium ${getColumnTypeStyle(column)}`}>
                                  {column.name}
                                </span>
                              </div>
                            </td>
                            <td className="px-4 py-2 text-gray-600">{column.type}</td>
                            <td className="px-4 py-2">
                              <div className="flex space-x-1">
                                {column.primary_key && (
                                  <span className="px-2 py-1 text-xs bg-yellow-100 text-yellow-800 rounded">PK</span>
                                )}
                                {column.unique && (
                                  <span className="px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded">UNIQUE</span>
                                )}
                                {!column.nullable && (
                                  <span className="px-2 py-1 text-xs bg-red-100 text-red-800 rounded">NOT NULL</span>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-2 text-gray-600">
                              {column.default || '—'}
                            </td>
                            <td className="px-4 py-2 text-gray-600">
                              {column.foreign_key || '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Related Tables */}
                <div>
                  <h4 className="font-medium text-gray-900 mb-3">Related Tables</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-sm text-gray-600 mb-2">References From:</div>
                      <div className="space-y-1">
                        {relationships
                          .filter(rel => rel.to_table === selectedTable)
                          .map((rel, index) => (
                            <div key={index} className="text-sm bg-blue-50 px-3 py-2 rounded">
                              <strong>{rel.from_table}</strong>.{rel.from_column} → {rel.to_column}
                            </div>
                          ))}
                      </div>
                    </div>
                    
                    <div>
                      <div className="text-sm text-gray-600 mb-2">References To:</div>
                      <div className="space-y-1">
                        {relationships
                          .filter(rel => rel.from_table === selectedTable)
                          .map((rel, index) => (
                            <div key={index} className="text-sm bg-green-50 px-3 py-2 rounded">
                              {rel.from_column} → <strong>{rel.to_table}</strong>.{rel.to_column}
                            </div>
                          ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* Schema Summary */}
      <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-lg border border-indigo-200 p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Schema Summary</h3>
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <div className="text-gray-600 mb-1">Total Tables</div>
            <div className="text-2xl font-bold text-indigo-600">{tables.length}</div>
          </div>
          
          <div>
            <div className="text-gray-600 mb-1">Total Relationships</div>
            <div className="text-2xl font-bold text-purple-600">{relationships.length}</div>
          </div>
          
          <div>
            <div className="text-gray-600 mb-1">Core Tables</div>
            <div className="text-2xl font-bold text-green-600">
              {tables.filter(t => ['meetings', 'participants', 'transcripts', 'ai_insights'].includes(t.name)).length}
            </div>
          </div>
          
          <div>
            <div className="text-gray-600 mb-1">Support Tables</div>
            <div className="text-2xl font-bold text-orange-600">
              {tables.filter(t => ['meeting_templates', 'tags', 'meeting_tags'].includes(t.name)).length}
            </div>
          </div>
        </div>

        <div className="mt-4 text-sm text-gray-600">
          <p>
            The MeetingMind database is designed with a normalized structure centered around the <strong>meetings</strong> table,
            with related entities for participants, transcripts, and AI insights. The schema supports advanced features like
            templating, tagging, and comprehensive analytics while maintaining data integrity through foreign key constraints.
          </p>
        </div>
      </div>
    </div>
  );
};