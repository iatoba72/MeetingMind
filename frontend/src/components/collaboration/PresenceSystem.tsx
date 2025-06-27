// Presence System with User Avatars and Activity Indicators
// Real-time user presence and activity visualization

import React, { useState, useEffect, useMemo } from 'react';
import {
  Users,
  Circle,
  Wifi,
  WifiOff,
  Edit,
  Eye,
  MessageCircle,
  Mouse,
  Clock,
  User,
  Crown,
  Shield,
  Settings,
  Palette
} from 'lucide-react';

interface UserPresence {
  id: string;
  name: string;
  email?: string;
  avatar?: string;
  color: string;
  status: 'active' | 'idle' | 'away' | 'offline';
  lastSeen: string;
  cursor?: {
    position: number;
    timestamp: string;
  };
  selection?: {
    start: number;
    end: number;
    timestamp: string;
  };
  currentActivity?: {
    type: 'typing' | 'reading' | 'annotating' | 'commenting';
    location?: string;
    timestamp: string;
  };
  role?: 'owner' | 'admin' | 'editor' | 'viewer';
  joinedAt: string;
  permissions: string[];
}

interface PresenceSystemProps {
  users: UserPresence[];
  currentUser: UserPresence;
  maxVisibleAvatars?: number;
  showDetailedPresence?: boolean;
  showActivityFeed?: boolean;
  onUserClick?: (user: UserPresence) => void;
  onPermissionChange?: (userId: string, permissions: string[]) => void;
  className?: string;
}

const statusConfig = {
  active: {
    label: 'Active',
    color: 'bg-green-500',
    icon: Circle,
    description: 'Currently active'
  },
  idle: {
    label: 'Idle',
    color: 'bg-yellow-500',
    icon: Clock,
    description: 'Away for a few minutes'
  },
  away: {
    label: 'Away',
    color: 'bg-gray-400',
    icon: WifiOff,
    description: 'Away for a while'
  },
  offline: {
    label: 'Offline',
    color: 'bg-gray-300',
    icon: WifiOff,
    description: 'Not currently online'
  }
};

const roleConfig = {
  owner: {
    label: 'Owner',
    icon: Crown,
    color: 'text-purple-600',
    permissions: ['read', 'write', 'admin', 'delete']
  },
  admin: {
    label: 'Admin',
    icon: Shield,
    color: 'text-blue-600',
    permissions: ['read', 'write', 'admin']
  },
  editor: {
    label: 'Editor',
    icon: Edit,
    color: 'text-green-600',
    permissions: ['read', 'write']
  },
  viewer: {
    label: 'Viewer',
    icon: Eye,
    color: 'text-gray-600',
    permissions: ['read']
  }
};

const activityConfig = {
  typing: {
    label: 'Typing',
    icon: Edit,
    color: 'text-blue-500'
  },
  reading: {
    label: 'Reading',
    icon: Eye,
    color: 'text-green-500'
  },
  annotating: {
    label: 'Annotating',
    icon: MessageCircle,
    color: 'text-purple-500'
  },
  commenting: {
    label: 'Commenting',
    icon: MessageCircle,
    color: 'text-orange-500'
  }
};

export const PresenceSystem: React.FC<PresenceSystemProps> = ({
  users,
  currentUser,
  maxVisibleAvatars = 5,
  showDetailedPresence = true,
  showActivityFeed = false,
  onUserClick,
  onPermissionChange,
  className = ''
}) => {
  const [showAllUsers, setShowAllUsers] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserPresence | null>(null);
  const [showPresencePanel, setShowPresencePanel] = useState(false);

  // Sort users by activity and status
  const sortedUsers = useMemo(() => {
    return [...users].sort((a, b) => {
      // Current user first
      if (a.id === currentUser.id) return -1;
      if (b.id === currentUser.id) return 1;
      
      // Then by status (active > idle > away > offline)
      const statusOrder = { active: 0, idle: 1, away: 2, offline: 3 };
      const statusDiff = statusOrder[a.status] - statusOrder[b.status];
      if (statusDiff !== 0) return statusDiff;
      
      // Then by last activity
      return new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime();
    });
  }, [users, currentUser.id]);

  // Get visible users for avatar stack
  const visibleUsers = useMemo(() => {
    return showAllUsers ? sortedUsers : sortedUsers.slice(0, maxVisibleAvatars);
  }, [sortedUsers, showAllUsers, maxVisibleAvatars]);

  // Count users by status
  const statusCounts = useMemo(() => {
    return users.reduce((acc, user) => {
      acc[user.status] = (acc[user.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }, [users]);

  // Format time ago
  const formatTimeAgo = (timestamp: string) => {
    const now = new Date();
    const time = new Date(timestamp);
    const diffMs = now.getTime() - time.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return time.toLocaleDateString();
  };

  // Generate avatar from initials
  const generateAvatar = (name: string, color: string) => {
    const initials = name
      .split(' ')
      .map(part => part[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
    
    return (
      <div 
        className="w-full h-full flex items-center justify-center text-white font-medium text-sm"
        style={{ backgroundColor: color }}
      >
        {initials}
      </div>
    );
  };

  // User avatar component
  const UserAvatar: React.FC<{ 
    user: UserPresence; 
    size?: 'sm' | 'md' | 'lg';
    showStatus?: boolean;
    showActivity?: boolean;
    clickable?: boolean;
  }> = ({ 
    user, 
    size = 'md', 
    showStatus = true, 
    showActivity = false,
    clickable = true 
  }) => {
    const sizeClasses = {
      sm: 'w-8 h-8',
      md: 'w-10 h-10',
      lg: 'w-12 h-12'
    };

    const StatusIcon = statusConfig[user.status].icon;
    const RoleIcon = user.role ? roleConfig[user.role].icon : null;
    const ActivityIcon = user.currentActivity ? activityConfig[user.currentActivity.type].icon : null;

    return (
      <div 
        className={`relative ${clickable ? 'cursor-pointer' : ''}`}
        onClick={() => clickable && onUserClick?.(user)}
        title={`${user.name} (${statusConfig[user.status].label})`}
      >
        <div className={`${sizeClasses[size]} rounded-full overflow-hidden border-2 border-white shadow-sm`}>
          {user.avatar ? (
            <img 
              src={user.avatar} 
              alt={user.name}
              className="w-full h-full object-cover"
            />
          ) : (
            generateAvatar(user.name, user.color)
          )}
        </div>

        {/* Status indicator */}
        {showStatus && (
          <div className="absolute -bottom-1 -right-1">
            <div className={`w-3 h-3 rounded-full border-2 border-white ${statusConfig[user.status].color}`}>
              {user.status === 'active' && user.currentActivity && (
                <div className="w-full h-full flex items-center justify-center">
                  <div className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
                </div>
              )}
            </div>
          </div>
        )}

        {/* Role indicator */}
        {user.role && RoleIcon && size !== 'sm' && (
          <div className={`absolute -top-1 -left-1 w-4 h-4 bg-white rounded-full flex items-center justify-center shadow-sm ${roleConfig[user.role].color}`}>
            <RoleIcon size={10} />
          </div>
        )}

        {/* Activity indicator */}
        {showActivity && user.currentActivity && ActivityIcon && (
          <div className="absolute top-0 right-0 w-5 h-5 bg-white rounded-full flex items-center justify-center shadow-sm">
            <ActivityIcon size={12} className={activityConfig[user.currentActivity.type].color} />
          </div>
        )}
      </div>
    );
  };

  // User list item component
  const UserListItem: React.FC<{ user: UserPresence }> = ({ user }) => {
    const StatusIcon = statusConfig[user.status].icon;
    const RoleIcon = user.role ? roleConfig[user.role].icon : User;

    return (
      <div 
        className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 cursor-pointer"
        onClick={() => setSelectedUser(user)}
      >
        <UserAvatar user={user} showActivity />
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm truncate">{user.name}</span>
            {user.id === currentUser.id && (
              <span className="text-xs bg-blue-100 text-blue-600 px-2 py-0.5 rounded">You</span>
            )}
            {user.role && (
              <span className={`text-xs ${roleConfig[user.role].color}`}>
                {roleConfig[user.role].label}
              </span>
            )}
          </div>
          
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <StatusIcon size={12} className={statusConfig[user.status].color.replace('bg-', 'text-')} />
            <span>{statusConfig[user.status].label}</span>
            <span>•</span>
            <span>{formatTimeAgo(user.lastSeen)}</span>
          </div>
          
          {user.currentActivity && (
            <div className="flex items-center gap-1 text-xs text-gray-600 mt-1">
              {React.createElement(activityConfig[user.currentActivity.type].icon, { size: 12 })}
              <span>{activityConfig[user.currentActivity.type].label}</span>
              {user.currentActivity.location && (
                <span className="text-gray-400">in {user.currentActivity.location}</span>
              )}
            </div>
          )}
        </div>

        <div className="text-xs text-gray-400">
          {formatTimeAgo(user.joinedAt)}
        </div>
      </div>
    );
  };

  return (
    <div className={`presence-system ${className}`}>
      {/* Compact avatar stack */}
      <div className="flex items-center">
        <div className="flex -space-x-2">
          {visibleUsers.map((user, index) => (
            <div key={user.id} style={{ zIndex: visibleUsers.length - index }}>
              <UserAvatar user={user} />
            </div>
          ))}
        </div>

        {/* Show more indicator */}
        {sortedUsers.length > maxVisibleAvatars && !showAllUsers && (
          <button
            onClick={() => setShowAllUsers(true)}
            className="ml-2 w-10 h-10 rounded-full bg-gray-100 border-2 border-white shadow-sm flex items-center justify-center text-xs font-medium text-gray-600 hover:bg-gray-200"
          >
            +{sortedUsers.length - maxVisibleAvatars}
          </button>
        )}

        {/* Users count and status */}
        <div className="ml-3 flex items-center gap-2">
          <button
            onClick={() => setShowPresencePanel(!showPresencePanel)}
            className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-800"
          >
            <Users size={16} />
            <span>{users.length}</span>
          </button>

          {/* Quick status indicators */}
          <div className="flex items-center gap-1">
            {Object.entries(statusCounts).map(([status, count]) => {
              if (count === 0) return null;
              const StatusIcon = statusConfig[status as keyof typeof statusConfig].icon;
              return (
                <div key={status} className="flex items-center gap-1" title={`${count} ${status}`}>
                  <StatusIcon 
                    size={12} 
                    className={statusConfig[status as keyof typeof statusConfig].color.replace('bg-', 'text-')} 
                  />
                  <span className="text-xs text-gray-500">{count}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Detailed presence panel */}
      {showDetailedPresence && showPresencePanel && (
        <div className="absolute top-full left-0 mt-2 w-80 bg-white rounded-lg shadow-lg border z-50">
          <div className="p-4 border-b">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-medium">Active Users</h3>
              <button
                onClick={() => setShowPresencePanel(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                ×
              </button>
            </div>
            
            <div className="flex items-center gap-4 text-sm text-gray-600">
              {Object.entries(statusCounts).map(([status, count]) => (
                <div key={status} className="flex items-center gap-1">
                  <div className={`w-2 h-2 rounded-full ${statusConfig[status as keyof typeof statusConfig].color}`} />
                  <span>{count} {statusConfig[status as keyof typeof statusConfig].label.toLowerCase()}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="max-h-64 overflow-y-auto">
            {sortedUsers.map(user => (
              <UserListItem key={user.id} user={user} />
            ))}
          </div>

          {showActivityFeed && (
            <div className="p-4 border-t">
              <h4 className="font-medium text-sm mb-2">Recent Activity</h4>
              <div className="space-y-2 text-xs text-gray-600">
                {users
                  .filter(user => user.currentActivity)
                  .sort((a, b) => 
                    new Date(b.currentActivity!.timestamp).getTime() - 
                    new Date(a.currentActivity!.timestamp).getTime()
                  )
                  .slice(0, 3)
                  .map(user => (
                    <div key={user.id} className="flex items-center gap-2">
                      <UserAvatar user={user} size="sm" showStatus={false} clickable={false} />
                      <span>
                        <strong>{user.name}</strong> is {activityConfig[user.currentActivity!.type].label.toLowerCase()}
                        {user.currentActivity!.location && ` in ${user.currentActivity!.location}`}
                      </span>
                      <span className="text-gray-400 ml-auto">
                        {formatTimeAgo(user.currentActivity!.timestamp)}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* User details modal */}
      {selectedUser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-96 max-w-full mx-4">
            <div className="flex items-start gap-4 mb-4">
              <UserAvatar user={selectedUser} size="lg" showActivity />
              
              <div className="flex-1">
                <h3 className="font-medium text-lg">{selectedUser.name}</h3>
                {selectedUser.email && (
                  <p className="text-sm text-gray-600">{selectedUser.email}</p>
                )}
                
                <div className="flex items-center gap-2 mt-2">
                  <div className={`w-3 h-3 rounded-full ${statusConfig[selectedUser.status].color}`} />
                  <span className="text-sm">{statusConfig[selectedUser.status].label}</span>
                  {selectedUser.role && (
                    <>
                      <span className="text-gray-400">•</span>
                      <span className={`text-sm ${roleConfig[selectedUser.role].color}`}>
                        {roleConfig[selectedUser.role].label}
                      </span>
                    </>
                  )}
                </div>
              </div>

              <button
                onClick={() => setSelectedUser(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                ×
              </button>
            </div>

            <div className="space-y-3 text-sm">
              <div>
                <label className="block text-gray-600 mb-1">Status</label>
                <div className="flex items-center gap-2">
                  {React.createElement(statusConfig[selectedUser.status].icon, { size: 16 })}
                  <span>{statusConfig[selectedUser.status].description}</span>
                </div>
              </div>

              <div>
                <label className="block text-gray-600 mb-1">Last seen</label>
                <span>{formatTimeAgo(selectedUser.lastSeen)}</span>
              </div>

              <div>
                <label className="block text-gray-600 mb-1">Joined session</label>
                <span>{formatTimeAgo(selectedUser.joinedAt)}</span>
              </div>

              {selectedUser.currentActivity && (
                <div>
                  <label className="block text-gray-600 mb-1">Current activity</label>
                  <div className="flex items-center gap-2">
                    {React.createElement(activityConfig[selectedUser.currentActivity.type].icon, { size: 16 })}
                    <span>{activityConfig[selectedUser.currentActivity.type].label}</span>
                    {selectedUser.currentActivity.location && (
                      <span className="text-gray-500">in {selectedUser.currentActivity.location}</span>
                    )}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-gray-600 mb-1">Permissions</label>
                <div className="flex flex-wrap gap-1">
                  {selectedUser.permissions.map(permission => (
                    <span key={permission} className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">
                      {permission}
                    </span>
                  ))}
                </div>
              </div>

              {selectedUser.cursor && (
                <div>
                  <label className="block text-gray-600 mb-1">Cursor position</label>
                  <span>Position {selectedUser.cursor.position}</span>
                  <span className="text-gray-500 ml-2">
                    ({formatTimeAgo(selectedUser.cursor.timestamp)})
                  </span>
                </div>
              )}

              {selectedUser.selection && (
                <div>
                  <label className="block text-gray-600 mb-1">Text selection</label>
                  <span>
                    {selectedUser.selection.start}-{selectedUser.selection.end}
                  </span>
                  <span className="text-gray-500 ml-2">
                    ({formatTimeAgo(selectedUser.selection.timestamp)})
                  </span>
                </div>
              )}
            </div>

            {/* Permission management for admins */}
            {currentUser.role === 'owner' || currentUser.role === 'admin' && selectedUser.id !== currentUser.id && (
              <div className="mt-4 pt-4 border-t">
                <label className="block text-gray-600 mb-2">Manage permissions</label>
                <div className="space-y-2">
                  {Object.entries(roleConfig).map(([role, config]) => (
                    <label key={role} className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="role"
                        value={role}
                        checked={selectedUser.role === role}
                        onChange={() => {
                          const newPermissions = config.permissions;
                          onPermissionChange?.(selectedUser.id, newPermissions);
                        }}
                        className="text-blue-500"
                      />
                      <config.icon size={16} className={config.color} />
                      <span className="text-sm">{config.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Cursor indicators (would be positioned absolutely over content) */}
      <div className="cursors-container">
        {users
          .filter(user => user.cursor && user.id !== currentUser.id)
          .map(user => (
            <div
              key={`cursor-${user.id}`}
              className="absolute pointer-events-none z-10"
              style={{
                // Position would be calculated based on cursor.position
                // This is a simplified representation
                left: `${user.cursor!.position % 100}%`,
                top: `${Math.floor(user.cursor!.position / 100) * 20}px`
              }}
            >
              <div className="flex items-center gap-1">
                <div 
                  className="w-0.5 h-5"
                  style={{ backgroundColor: user.color }}
                />
                <div 
                  className="px-2 py-1 rounded text-xs text-white text-nowrap"
                  style={{ backgroundColor: user.color }}
                >
                  {user.name}
                </div>
              </div>
            </div>
          ))}
      </div>

      {/* Selection indicators (would be positioned absolutely over content) */}
      <div className="selections-container">
        {users
          .filter(user => user.selection && user.id !== currentUser.id)
          .map(user => (
            <div
              key={`selection-${user.id}`}
              className="absolute pointer-events-none z-5"
              style={{
                // Position and size would be calculated based on selection.start and selection.end
                // This is a simplified representation
                left: `${user.selection!.start % 100}%`,
                top: `${Math.floor(user.selection!.start / 100) * 20}px`,
                width: `${(user.selection!.end - user.selection!.start) % 100}%`,
                height: '20px',
                backgroundColor: user.color,
                opacity: 0.2
              }}
            />
          ))}
      </div>
    </div>
  );
};