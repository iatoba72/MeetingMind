// Shared Action Items Board with CRDT
// Collaborative Kanban-style board for managing action items

import React, { useState, useMemo, useCallback } from 'react';
import { 
  Plus, 
  Edit, 
  Trash2, 
  Calendar, 
  User, 
  Clock, 
  AlertCircle, 
  CheckCircle, 
  Circle,
  MoreVertical,
  MessageSquare,
  Search
} from 'lucide-react';

interface ActionItem {
  id: string;
  title: string;
  description: string;
  status: 'open' | 'in_progress' | 'review' | 'completed';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  assignee?: string;
  assigneeName?: string;
  dueDate?: string;
  createdAt: string;
  updatedAt: string;
  author: string;
  authorName: string;
  tags: string[];
  comments: ActionItemComment[];
  estimatedHours?: number;
  completedAt?: string;
  dependencies?: string[];
  attachments?: ActionItemAttachment[];
}

interface ActionItemComment {
  id: string;
  content: string;
  author: string;
  authorName: string;
  createdAt: string;
}

interface ActionItemAttachment {
  id: string;
  name: string;
  url: string;
  type: string;
  size: number;
  uploadedBy: string;
  uploadedAt: string;
}

interface User {
  id: string;
  name: string;
  avatar?: string;
  color: string;
}

interface ActionItemsBoardProps {
  actionItems: ActionItem[];
  users: User[];
  currentUser: User;
  onAddItem: (item: Omit<ActionItem, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onUpdateItem: (id: string, updates: Partial<ActionItem>) => void;
  onDeleteItem: (id: string) => void;
  onAddComment: (itemId: string, comment: Omit<ActionItemComment, 'id' | 'createdAt'>) => void;
  readOnly?: boolean;
}

const statusConfig = {
  open: { 
    label: 'Open', 
    color: 'bg-gray-100 text-gray-800', 
    icon: Circle,
    column: 'todo'
  },
  in_progress: { 
    label: 'In Progress', 
    color: 'bg-blue-100 text-blue-800', 
    icon: Clock,
    column: 'in_progress'
  },
  review: { 
    label: 'Review', 
    color: 'bg-yellow-100 text-yellow-800', 
    icon: AlertCircle,
    column: 'review'
  },
  completed: { 
    label: 'Completed', 
    color: 'bg-green-100 text-green-800', 
    icon: CheckCircle,
    column: 'completed'
  }
};

const priorityConfig = {
  low: { label: 'Low', color: 'bg-gray-100 text-gray-600' },
  medium: { label: 'Medium', color: 'bg-blue-100 text-blue-600' },
  high: { label: 'High', color: 'bg-orange-100 text-orange-600' },
  urgent: { label: 'Urgent', color: 'bg-red-100 text-red-600' }
};

export const ActionItemsBoard: React.FC<ActionItemsBoardProps> = ({
  actionItems,
  users,
  currentUser,
  onAddItem,
  onUpdateItem,
  onDeleteItem,
  onAddComment,
  readOnly = false
}) => {
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingItem, setEditingItem] = useState<ActionItem | null>(null);
  const [showItemDetails, setShowItemDetails] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterAssignee, setFilterAssignee] = useState<string>('all');
  const [filterPriority, setFilterPriority] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<'kanban' | 'list'>('kanban');
  
  // Form state
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    status: 'open' as ActionItem['status'],
    priority: 'medium' as ActionItem['priority'],
    assignee: '',
    dueDate: '',
    tags: [] as string[],
    estimatedHours: undefined as number | undefined
  });
  
  const [newComment, setNewComment] = useState<{ [key: string]: string }>({});
  const [newTag, setNewTag] = useState('');

  // Filter and search action items
  const filteredItems = useMemo(() => {
    return actionItems.filter(item => {
      // Status filter
      if (filterStatus !== 'all' && item.status !== filterStatus) return false;
      
      // Assignee filter
      if (filterAssignee !== 'all' && item.assignee !== filterAssignee) return false;
      
      // Priority filter
      if (filterPriority !== 'all' && item.priority !== filterPriority) return false;
      
      // Search filter
      if (searchTerm) {
        const searchLower = searchTerm.toLowerCase();
        return (
          item.title.toLowerCase().includes(searchLower) ||
          item.description.toLowerCase().includes(searchLower) ||
          item.tags.some(tag => tag.toLowerCase().includes(searchLower))
        );
      }
      
      return true;
    });
  }, [actionItems, filterStatus, filterAssignee, filterPriority, searchTerm]);

  // Group items by status for Kanban view
  const groupedItems = useMemo(() => {
    const groups = {
      todo: filteredItems.filter(item => item.status === 'open'),
      in_progress: filteredItems.filter(item => item.status === 'in_progress'),
      review: filteredItems.filter(item => item.status === 'review'),
      completed: filteredItems.filter(item => item.status === 'completed')
    };
    return groups;
  }, [filteredItems]);

  // Get user by ID
  const getUserById = useCallback((userId: string) => {
    return users.find(user => user.id === userId);
  }, [users]);

  // Format date
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  // Check if due date is overdue
  const isOverdue = (dueDate: string, status: ActionItem['status']) => {
    if (status === 'completed') return false;
    return new Date(dueDate) < new Date();
  };

  // Handle form submission
  const handleSubmit = () => {
    if (!formData.title.trim()) return;

    const itemData = {
      ...formData,
      author: currentUser.id,
      authorName: currentUser.name,
      comments: [],
      dependencies: [],
      attachments: []
    };

    if (editingItem) {
      onUpdateItem(editingItem.id, itemData);
      setEditingItem(null);
    } else {
      onAddItem(itemData);
    }

    // Reset form
    setFormData({
      title: '',
      description: '',
      status: 'open',
      priority: 'medium',
      assignee: '',
      dueDate: '',
      tags: [],
      estimatedHours: undefined
    });
    setShowAddModal(false);
  };

  // Handle status change via drag and drop or direct update
  const handleStatusChange = (itemId: string, newStatus: ActionItem['status']) => {
    const updates: Partial<ActionItem> = { status: newStatus };
    
    if (newStatus === 'completed') {
      updates.completedAt = new Date().toISOString();
    }
    
    onUpdateItem(itemId, updates);
  };

  // Add comment to item
  const addComment = (itemId: string) => {
    const commentText = newComment[itemId]?.trim();
    if (!commentText) return;

    onAddComment(itemId, {
      content: commentText,
      author: currentUser.id,
      authorName: currentUser.name
    });

    setNewComment({ ...newComment, [itemId]: '' });
  };

  // Add tag to form
  const addTag = () => {
    if (newTag.trim() && !formData.tags.includes(newTag.trim())) {
      setFormData({
        ...formData,
        tags: [...formData.tags, newTag.trim()]
      });
      setNewTag('');
    }
  };

  // Remove tag from form
  const removeTag = (tagToRemove: string) => {
    setFormData({
      ...formData,
      tags: formData.tags.filter(tag => tag !== tagToRemove)
    });
  };

  // Start editing item
  const startEdit = (item: ActionItem) => {
    setFormData({
      title: item.title,
      description: item.description,
      status: item.status,
      priority: item.priority,
      assignee: item.assignee || '',
      dueDate: item.dueDate || '',
      tags: [...item.tags],
      estimatedHours: item.estimatedHours
    });
    setEditingItem(item);
    setShowAddModal(true);
  };

  // Action item card component
  const ActionItemCard: React.FC<{ item: ActionItem }> = ({ item }) => {
    const assignee = item.assignee ? getUserById(item.assignee) : null;
    const StatusIcon = statusConfig[item.status].icon;
    const isItemOverdue = item.dueDate && isOverdue(item.dueDate, item.status);

    return (
      <div className="bg-white rounded-lg border p-4 shadow-sm hover:shadow-md transition-shadow">
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className={`text-xs px-2 py-1 rounded-full ${priorityConfig[item.priority].color}`}>
              {priorityConfig[item.priority].label}
            </span>
            {isItemOverdue && (
              <span className="text-xs px-2 py-1 rounded-full bg-red-100 text-red-600">
                Overdue
              </span>
            )}
          </div>
          
          {!readOnly && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => startEdit(item)}
                className="text-gray-400 hover:text-gray-600"
                title="Edit item"
              >
                <Edit size={14} />
              </button>
              <button
                onClick={() => onDeleteItem(item.id)}
                className="text-gray-400 hover:text-red-600"
                title="Delete item"
              >
                <Trash2 size={14} />
              </button>
            </div>
          )}
        </div>

        {/* Title and description */}
        <div className="mb-3">
          <h4 className="font-medium text-sm mb-1 line-clamp-2">{item.title}</h4>
          {item.description && (
            <p className="text-xs text-gray-600 line-clamp-2">{item.description}</p>
          )}
        </div>

        {/* Tags */}
        {item.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-3">
            {item.tags.slice(0, 3).map(tag => (
              <span key={tag} className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">
                {tag}
              </span>
            ))}
            {item.tags.length > 3 && (
              <span className="text-xs text-gray-500">+{item.tags.length - 3}</span>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between text-xs text-gray-500">
          <div className="flex items-center gap-2">
            {assignee && (
              <div className="flex items-center gap-1">
                <User size={12} />
                <span>{assignee.name}</span>
              </div>
            )}
            
            {item.dueDate && (
              <div className={`flex items-center gap-1 ${isItemOverdue ? 'text-red-500' : ''}`}>
                <Calendar size={12} />
                <span>{formatDate(item.dueDate)}</span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            {item.comments.length > 0 && (
              <div className="flex items-center gap-1">
                <MessageSquare size={12} />
                <span>{item.comments.length}</span>
              </div>
            )}
            
            <button
              onClick={() => setShowItemDetails(item.id)}
              className="hover:text-gray-700"
              title="View details"
            >
              <MoreVertical size={12} />
            </button>
          </div>
        </div>
      </div>
    );
  };

  // Kanban column component
  const KanbanColumn: React.FC<{ 
    title: string; 
    items: ActionItem[]; 
    status: ActionItem['status'];
    color: string;
  }> = ({ title, items, status, color }) => (
    <div className="flex-1 min-w-0">
      <div className={`p-3 rounded-t-lg ${color}`}>
        <div className="flex items-center justify-between">
          <h3 className="font-medium">{title}</h3>
          <span className="text-sm">{items.length}</span>
        </div>
      </div>
      
      <div className="bg-gray-50 rounded-b-lg p-3 min-h-96 space-y-3">
        {items.map(item => (
          <ActionItemCard key={item.id} item={item} />
        ))}
        
        {items.length === 0 && (
          <div className="text-center text-gray-500 py-8">
            <Circle size={32} className="mx-auto mb-2 opacity-50" />
            <div className="text-sm">No items</div>
          </div>
        )}
        
        {!readOnly && (
          <button
            onClick={() => {
              setFormData({ ...formData, status });
              setShowAddModal(true);
            }}
            className="w-full p-3 border-2 border-dashed border-gray-300 rounded-lg text-gray-500 hover:border-gray-400 hover:text-gray-600 transition-colors"
          >
            <Plus size={16} className="mx-auto mb-1" />
            <div className="text-sm">Add item</div>
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div className="action-items-board h-full flex flex-col">
      {/* Header */}
      <div className="border-b bg-white p-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Action Items</h2>
          
          <div className="flex items-center gap-2">
            {/* View mode toggle */}
            <div className="flex border rounded-lg">
              <button
                onClick={() => setViewMode('kanban')}
                className={`px-3 py-1 text-sm rounded-l-lg ${
                  viewMode === 'kanban' ? 'bg-blue-500 text-white' : 'text-gray-600 hover:text-gray-800'
                }`}
              >
                Board
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`px-3 py-1 text-sm rounded-r-lg ${
                  viewMode === 'list' ? 'bg-blue-500 text-white' : 'text-gray-600 hover:text-gray-800'
                }`}
              >
                List
              </button>
            </div>
            
            {!readOnly && (
              <button
                onClick={() => setShowAddModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
              >
                <Plus size={16} />
                Add Item
              </button>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <Search size={16} className="text-gray-400" />
            <input
              type="text"
              placeholder="Search items..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="border rounded px-3 py-1 text-sm"
            />
          </div>

          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="border rounded px-3 py-1 text-sm"
          >
            <option value="all">All Status</option>
            {Object.entries(statusConfig).map(([status, config]) => (
              <option key={status} value={status}>{config.label}</option>
            ))}
          </select>

          <select
            value={filterAssignee}
            onChange={(e) => setFilterAssignee(e.target.value)}
            className="border rounded px-3 py-1 text-sm"
          >
            <option value="all">All Assignees</option>
            <option value="">Unassigned</option>
            {users.map(user => (
              <option key={user.id} value={user.id}>{user.name}</option>
            ))}
          </select>

          <select
            value={filterPriority}
            onChange={(e) => setFilterPriority(e.target.value)}
            className="border rounded px-3 py-1 text-sm"
          >
            <option value="all">All Priorities</option>
            {Object.entries(priorityConfig).map(([priority, config]) => (
              <option key={priority} value={priority}>{config.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {viewMode === 'kanban' ? (
          <div className="flex gap-4 p-4 h-full overflow-x-auto">
            <KanbanColumn
              title="To Do"
              items={groupedItems.todo}
              status="open"
              color="bg-gray-100"
            />
            <KanbanColumn
              title="In Progress"
              items={groupedItems.in_progress}
              status="in_progress"
              color="bg-blue-100"
            />
            <KanbanColumn
              title="Review"
              items={groupedItems.review}
              status="review"
              color="bg-yellow-100"
            />
            <KanbanColumn
              title="Completed"
              items={groupedItems.completed}
              status="completed"
              color="bg-green-100"
            />
          </div>
        ) : (
          <div className="overflow-y-auto p-4">
            <div className="space-y-3">
              {filteredItems.map(item => (
                <div key={item.id} className="bg-white rounded-lg border p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h4 className="font-medium">{item.title}</h4>
                        <span className={`text-xs px-2 py-1 rounded-full ${statusConfig[item.status].color}`}>
                          {statusConfig[item.status].label}
                        </span>
                        <span className={`text-xs px-2 py-1 rounded-full ${priorityConfig[item.priority].color}`}>
                          {priorityConfig[item.priority].label}
                        </span>
                      </div>
                      
                      {item.description && (
                        <p className="text-sm text-gray-600 mb-2">{item.description}</p>
                      )}
                      
                      <div className="flex items-center gap-4 text-xs text-gray-500">
                        {item.assignee && (
                          <div className="flex items-center gap-1">
                            <User size={12} />
                            <span>{getUserById(item.assignee)?.name}</span>
                          </div>
                        )}
                        
                        {item.dueDate && (
                          <div className="flex items-center gap-1">
                            <Calendar size={12} />
                            <span>{formatDate(item.dueDate)}</span>
                          </div>
                        )}
                        
                        <div className="flex items-center gap-1">
                          <Clock size={12} />
                          <span>{formatDate(item.createdAt)}</span>
                        </div>
                      </div>
                    </div>
                    
                    {!readOnly && (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => startEdit(item)}
                          className="text-gray-400 hover:text-gray-600"
                        >
                          <Edit size={16} />
                        </button>
                        <button
                          onClick={() => onDeleteItem(item.id)}
                          className="text-gray-400 hover:text-red-600"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold mb-4">
              {editingItem ? 'Edit Action Item' : 'Add Action Item'}
            </h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Title *</label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2"
                  placeholder="Enter item title..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2"
                  rows={3}
                  placeholder="Enter item description..."
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Status</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as ActionItem['status'] })}
                    className="w-full border rounded-lg px-3 py-2"
                  >
                    {Object.entries(statusConfig).map(([status, config]) => (
                      <option key={status} value={status}>{config.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Priority</label>
                  <select
                    value={formData.priority}
                    onChange={(e) => setFormData({ ...formData, priority: e.target.value as ActionItem['priority'] })}
                    className="w-full border rounded-lg px-3 py-2"
                  >
                    {Object.entries(priorityConfig).map(([priority, config]) => (
                      <option key={priority} value={priority}>{config.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Assignee</label>
                  <select
                    value={formData.assignee}
                    onChange={(e) => setFormData({ ...formData, assignee: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2"
                  >
                    <option value="">Unassigned</option>
                    {users.map(user => (
                      <option key={user.id} value={user.id}>{user.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Due Date</label>
                  <input
                    type="date"
                    value={formData.dueDate}
                    onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Estimated Hours</label>
                <input
                  type="number"
                  value={formData.estimatedHours || ''}
                  onChange={(e) => setFormData({ ...formData, estimatedHours: e.target.value ? Number(e.target.value) : undefined })}
                  className="w-full border rounded-lg px-3 py-2"
                  placeholder="Estimated hours..."
                  min="0"
                  step="0.5"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Tags</label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {formData.tags.map(tag => (
                    <span key={tag} className="flex items-center gap-1 bg-blue-100 text-blue-800 px-2 py-1 rounded text-sm">
                      {tag}
                      <button
                        onClick={() => removeTag(tag)}
                        className="text-blue-600 hover:text-blue-800"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newTag}
                    onChange={(e) => setNewTag(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && addTag()}
                    className="flex-1 border rounded-lg px-3 py-2"
                    placeholder="Add tag..."
                  />
                  <button
                    onClick={addTag}
                    className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                  >
                    Add
                  </button>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setEditingItem(null);
                  setFormData({
                    title: '',
                    description: '',
                    status: 'open',
                    priority: 'medium',
                    assignee: '',
                    dueDate: '',
                    tags: [],
                    estimatedHours: undefined
                  });
                }}
                className="px-4 py-2 text-gray-600 hover:text-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={!formData.title.trim()}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50"
              >
                {editingItem ? 'Update' : 'Create'} Item
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Item Details Modal */}
      {showItemDetails && (
        (() => {
          const item = actionItems.find(item => item.id === showItemDetails);
          if (!item) return null;

          return (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white rounded-lg p-6 w-full max-w-3xl mx-4 max-h-[90vh] overflow-y-auto">
                <div className="flex items-start justify-between mb-4">
                  <h3 className="text-lg font-semibold">{item.title}</h3>
                  <button
                    onClick={() => setShowItemDetails(null)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    ×
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <div className="mb-4">
                      <label className="block text-sm font-medium text-gray-600 mb-1">Description</label>
                      <p className="text-sm">{item.description || 'No description'}</p>
                    </div>

                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-600 mb-1">Status</label>
                        <span className={`inline-block text-xs px-2 py-1 rounded-full ${statusConfig[item.status].color}`}>
                          {statusConfig[item.status].label}
                        </span>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-600 mb-1">Priority</label>
                        <span className={`inline-block text-xs px-2 py-1 rounded-full ${priorityConfig[item.priority].color}`}>
                          {priorityConfig[item.priority].label}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-600 mb-1">Assignee</label>
                        <p className="text-sm">{item.assigneeName || 'Unassigned'}</p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-600 mb-1">Due Date</label>
                        <p className="text-sm">{item.dueDate ? formatDate(item.dueDate) : 'No due date'}</p>
                      </div>
                    </div>

                    {item.tags.length > 0 && (
                      <div className="mb-4">
                        <label className="block text-sm font-medium text-gray-600 mb-1">Tags</label>
                        <div className="flex flex-wrap gap-1">
                          {item.tags.map(tag => (
                            <span key={tag} className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">
                              {tag}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div>
                    <div className="mb-4">
                      <label className="block text-sm font-medium text-gray-600 mb-2">
                        Comments ({item.comments.length})
                      </label>
                      
                      <div className="space-y-3 mb-3 max-h-64 overflow-y-auto">
                        {item.comments.map(comment => (
                          <div key={comment.id} className="bg-gray-50 p-3 rounded">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-sm font-medium">{comment.authorName}</span>
                              <span className="text-xs text-gray-500">{formatDate(comment.createdAt)}</span>
                            </div>
                            <p className="text-sm">{comment.content}</p>
                          </div>
                        ))}
                        
                        {item.comments.length === 0 && (
                          <div className="text-center text-gray-500 py-4">
                            <MessageSquare size={32} className="mx-auto mb-2 opacity-50" />
                            <div className="text-sm">No comments yet</div>
                          </div>
                        )}
                      </div>

                      {!readOnly && (
                        <div className="flex gap-2">
                          <input
                            type="text"
                            placeholder="Add a comment..."
                            value={newComment[item.id] || ''}
                            onChange={(e) => setNewComment({ ...newComment, [item.id]: e.target.value })}
                            className="flex-1 border rounded px-3 py-2 text-sm"
                            onKeyPress={(e) => e.key === 'Enter' && addComment(item.id)}
                          />
                          <button
                            onClick={() => addComment(item.id)}
                            disabled={!newComment[item.id]?.trim()}
                            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
                          >
                            Add
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="mt-6 pt-4 border-t flex justify-between">
                  <div className="text-sm text-gray-500">
                    Created by {item.authorName} on {formatDate(item.createdAt)}
                    {item.updatedAt !== item.createdAt && (
                      <span> • Updated {formatDate(item.updatedAt)}</span>
                    )}
                  </div>
                  
                  {!readOnly && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          startEdit(item);
                          setShowItemDetails(null);
                        }}
                        className="flex items-center gap-1 px-3 py-1 text-blue-600 hover:text-blue-800"
                      >
                        <Edit size={14} />
                        Edit
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })()
      )}
    </div>
  );
};