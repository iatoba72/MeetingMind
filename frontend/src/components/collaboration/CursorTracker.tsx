// Real-time Cursor Tracking Component
// Displays cursors and selections of multiple users in real-time

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Eye, EyeOff } from 'lucide-react';

interface CursorData {
  userId: string;
  userName: string;
  position: { x: number; y: number };
  elementId?: string;
  elementType?: string;
  selection?: {
    start: { x: number; y: number };
    end: { x: number; y: number };
    text?: string;
  };
  color: string;
  avatar?: string;
  timestamp: string;
  isActive: boolean;
  activity?: 'typing' | 'selecting' | 'scrolling' | 'idle';
}

interface UserPresence {
  userId: string;
  userName: string;
  color: string;
  avatar?: string;
  isActive: boolean;
  lastSeen: string;
  currentPage?: string;
  deviceInfo?: {
    type: 'desktop' | 'tablet' | 'mobile';
    browser?: string;
    os?: string;
  };
}

interface CursorTrackerProps {
  cursors: CursorData[];
  users: UserPresence[];
  currentUser: { id: string; name: string; color: string };
  onCursorMove: (position: { x: number; y: number }, elementId?: string) => void;
  onSelection: (selection: { start: { x: number; y: number }; end: { x: number; y: number }; text?: string }) => void;
  showCursors?: boolean;
  showSelections?: boolean;
  showUserList?: boolean;
  trackingEnabled?: boolean;
  container?: HTMLElement;
}

export const CursorTracker: React.FC<CursorTrackerProps> = ({
  cursors,
  users,
  currentUser,
  onCursorMove,
  onSelection,
  showCursors = true,
  showSelections = true,
  showUserList = true,
  trackingEnabled = true,
  container
}) => {
  const [isTracking, setIsTracking] = useState(trackingEnabled);
  const [showSettings, setShowSettings] = useState(false);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectionStart, setSelectionStart] = useState<{ x: number; y: number } | null>(null);
  const [currentSelection, setCurrentSelection] = useState<{ start: { x: number; y: number }; end: { x: number; y: number } } | null>(null);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const trackingContainer = container || containerRef.current || document.body;
  
  // Throttle cursor updates to avoid overwhelming the network
  const throttleRef = useRef<NodeJS.Timeout>();
  const THROTTLE_DELAY = 50; // 20 FPS

  // Get element information at position
  const getElementInfo = useCallback((x: number, y: number) => {
    const element = document.elementFromPoint(x, y);
    if (!element) return {};
    
    return {
      elementId: element.id || element.className || element.tagName,
      elementType: element.tagName.toLowerCase(),
      boundingRect: element.getBoundingClientRect()
    };
  }, []);

  // Handle mouse movement
  const handleMouseMove = useCallback((event: MouseEvent) => {
    if (!isTracking) return;
    
    const rect = trackingContainer.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    
    setMousePosition({ x, y });
    
    // Throttle cursor updates
    if (throttleRef.current) {
      clearTimeout(throttleRef.current);
    }
    
    throttleRef.current = setTimeout(() => {
      const elementInfo = getElementInfo(event.clientX, event.clientY);
      onCursorMove({ x, y }, elementInfo.elementId);
    }, THROTTLE_DELAY);
  }, [isTracking, trackingContainer, onCursorMove, getElementInfo]);

  // Handle mouse down (start selection)
  const handleMouseDown = useCallback((event: MouseEvent) => {
    if (!isTracking || event.button !== 0) return; // Only track left mouse button
    
    const rect = trackingContainer.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    
    setIsSelecting(true);
    setSelectionStart({ x, y });
    setCurrentSelection(null);
  }, [isTracking, trackingContainer]);

  // Handle mouse up (end selection)
  const handleMouseUp = useCallback((event: MouseEvent) => {
    if (!isTracking || !isSelecting || !selectionStart) return;
    
    const rect = trackingContainer.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    
    const selection = {
      start: selectionStart,
      end: { x, y }
    };
    
    // Get selected text if available
    const windowSelection = window.getSelection();
    const selectedText = windowSelection?.toString();
    
    setCurrentSelection(selection);
    setIsSelecting(false);
    setSelectionStart(null);
    
    if (selectedText) {
      onSelection({
        ...selection,
        text: selectedText
      });
    }
  }, [isTracking, isSelecting, selectionStart, trackingContainer, onSelection]);

  // Handle selection change
  const handleSelectionChange = useCallback(() => {
    if (!isTracking) return;
    
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      const containerRect = trackingContainer.getBoundingClientRect();
      
      if (rect.width > 0 && rect.height > 0) {
        const selectionData = {
          start: {
            x: rect.left - containerRect.left,
            y: rect.top - containerRect.top
          },
          end: {
            x: rect.right - containerRect.left,
            y: rect.bottom - containerRect.top
          },
          text: selection.toString()
        };
        
        setCurrentSelection(selectionData);
        onSelection(selectionData);
      }
    }
  }, [isTracking, trackingContainer, onSelection]);

  // Set up event listeners
  useEffect(() => {
    if (!trackingContainer || !isTracking) return;
    
    trackingContainer.addEventListener('mousemove', handleMouseMove);
    trackingContainer.addEventListener('mousedown', handleMouseDown);
    trackingContainer.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('selectionchange', handleSelectionChange);
    
    return () => {
      trackingContainer.removeEventListener('mousemove', handleMouseMove);
      trackingContainer.removeEventListener('mousedown', handleMouseDown);
      trackingContainer.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('selectionchange', handleSelectionChange);
      
      if (throttleRef.current) {
        clearTimeout(throttleRef.current);
      }
    };
  }, [trackingContainer, isTracking, handleMouseMove, handleMouseDown, handleMouseUp, handleSelectionChange]);

  // Filter active cursors (exclude current user and inactive users)
  const activeCursors = useMemo(() => {
    return cursors.filter(cursor => 
      cursor.userId !== currentUser.id && 
      cursor.isActive &&
      Date.now() - new Date(cursor.timestamp).getTime() < 30000 // 30 seconds
    );
  }, [cursors, currentUser.id]);

  // Get user avatar or initials
  const getUserDisplay = useCallback((userId: string) => {
    const user = users.find(u => u.userId === userId);
    if (!user) return { initials: '?', color: '#gray' };
    
    const initials = user.userName
      .split(' ')
      .map(name => name.charAt(0))
      .join('')
      .toUpperCase()
      .slice(0, 2);
    
    return {
      initials,
      avatar: user.avatar,
      color: user.color,
      name: user.userName
    };
  }, [users]);

  // Cursor component
  const CursorComponent: React.FC<{ cursor: CursorData }> = ({ cursor }) => {
    const userDisplay = getUserDisplay(cursor.userId);
    const isRecentlyActive = Date.now() - new Date(cursor.timestamp).getTime() < 5000; // 5 seconds
    
    return (
      <div
        className="absolute pointer-events-none z-50 transition-all duration-200"
        style={{
          left: cursor.position.x,
          top: cursor.position.y,
          transform: 'translate(-4px, -4px)'
        }}
      >
        {/* Cursor pointer */}
        <svg
          width="20"
          height="20"
          viewBox="0 0 20 20"
          className="drop-shadow-sm"
          style={{ filter: isRecentlyActive ? 'none' : 'opacity(0.7)' }}
        >
          <path
            d="M4 4l12 6-6 2-2 6-4-14z"
            fill={cursor.color}
            stroke="white"
            strokeWidth="1"
          />
        </svg>
        
        {/* User info tooltip */}
        <div
          className="absolute left-4 top-0 px-2 py-1 rounded text-xs text-white whitespace-nowrap shadow-lg"
          style={{ backgroundColor: cursor.color }}
        >
          <div className="flex items-center gap-1">
            {userDisplay.avatar ? (
              <img 
                src={userDisplay.avatar} 
                alt={userDisplay.name}
                className="w-4 h-4 rounded-full"
              />
            ) : (
              <div 
                className="w-4 h-4 rounded-full flex items-center justify-center text-white text-xs font-medium"
                style={{ backgroundColor: cursor.color }}
              >
                {userDisplay.initials}
              </div>
            )}
            <span>{cursor.userName}</span>
            {cursor.activity && (
              <span className="text-xs opacity-75">• {cursor.activity}</span>
            )}
          </div>
        </div>
        
        {/* Activity indicator */}
        {cursor.activity === 'typing' && (
          <div
            className="absolute left-6 top-6 w-2 h-2 rounded-full animate-pulse"
            style={{ backgroundColor: cursor.color }}
          />
        )}
      </div>
    );
  };

  // Selection component
  const SelectionComponent: React.FC<{ cursor: CursorData }> = ({ cursor }) => {
    if (!cursor.selection) return null;
    
    const { start, end } = cursor.selection;
    const width = Math.abs(end.x - start.x);
    const height = Math.abs(end.y - start.y);
    const left = Math.min(start.x, end.x);
    const top = Math.min(start.y, end.y);
    
    return (
      <div
        className="absolute pointer-events-none z-40"
        style={{
          left,
          top,
          width,
          height,
          backgroundColor: cursor.color,
          opacity: 0.2,
          borderRadius: '2px'
        }}
      >
        {cursor.selection.text && (
          <div
            className="absolute -top-6 left-0 px-2 py-1 rounded text-xs text-white whitespace-nowrap shadow-lg"
            style={{ backgroundColor: cursor.color }}
          >
            "{cursor.selection.text.slice(0, 50)}..."
          </div>
        )}
      </div>
    );
  };

  return (
    <div ref={containerRef} className="cursor-tracker relative">
      {/* Render remote cursors */}
      {showCursors && activeCursors.map(cursor => (
        <CursorComponent key={cursor.userId} cursor={cursor} />
      ))}
      
      {/* Render remote selections */}
      {showSelections && activeCursors.map(cursor => (
        <SelectionComponent key={`${cursor.userId}-selection`} cursor={cursor} />
      ))}
      
      {/* Current user selection */}
      {showSelections && currentSelection && (
        <div
          className="absolute pointer-events-none z-30"
          style={{
            left: Math.min(currentSelection.start.x, currentSelection.end.x),
            top: Math.min(currentSelection.start.y, currentSelection.end.y),
            width: Math.abs(currentSelection.end.x - currentSelection.start.x),
            height: Math.abs(currentSelection.end.y - currentSelection.start.y),
            backgroundColor: currentUser.color,
            opacity: 0.3,
            borderRadius: '2px',
            border: `2px solid ${currentUser.color}`
          }}
        />
      )}
      
      {/* User list panel */}
      {showUserList && (
        <div className="fixed top-4 right-4 bg-white rounded-lg shadow-lg border p-3 z-50 min-w-48">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-medium text-sm">Active Users ({users.filter(u => u.isActive).length})</h4>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setIsTracking(!isTracking)}
                className={`p-1 rounded ${isTracking ? 'text-green-600' : 'text-gray-400'}`}
                title={isTracking ? 'Disable tracking' : 'Enable tracking'}
              >
                {isTracking ? <Eye size={14} /> : <EyeOff size={14} />}
              </button>
              <button
                onClick={() => setShowSettings(!showSettings)}
                className="p-1 text-gray-400 hover:text-gray-600"
                title="Settings"
              >
                <Mouse size={14} />
              </button>
            </div>
          </div>
          
          <div className="space-y-2">
            {users.map(user => {
              const isCurrentUser = user.userId === currentUser.id;
              const cursor = cursors.find(c => c.userId === user.userId);
              const isActive = user.isActive && (!cursor || Date.now() - new Date(cursor.timestamp).getTime() < 10000);
              
              return (
                <div
                  key={user.userId}
                  className="flex items-center gap-2 text-sm"
                >
                  {/* Status indicator */}
                  <div
                    className={`w-2 h-2 rounded-full ${isActive ? 'bg-green-400' : 'bg-gray-300'}`}
                  />
                  
                  {/* Avatar */}
                  {user.avatar ? (
                    <img 
                      src={user.avatar} 
                      alt={user.userName}
                      className="w-6 h-6 rounded-full"
                    />
                  ) : (
                    <div 
                      className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-medium"
                      style={{ backgroundColor: user.color }}
                    >
                      {user.userName.charAt(0).toUpperCase()}
                    </div>
                  )}
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1">
                      <span className={`truncate ${isCurrentUser ? 'font-medium' : ''}`}>
                        {user.userName}
                        {isCurrentUser && ' (You)'}
                      </span>
                    </div>
                    
                    {cursor?.activity && (
                      <div className="text-xs text-gray-500 capitalize">
                        {cursor.activity}
                      </div>
                    )}
                  </div>
                  
                  {user.deviceInfo && (
                    <div className="text-xs text-gray-400">
                      {user.deviceInfo.type === 'mobile' ? '📱' : 
                       user.deviceInfo.type === 'tablet' ? '📱' : '💻'}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          
          {/* Statistics */}
          <div className="mt-3 pt-3 border-t text-xs text-gray-500">
            <div>Cursors: {activeCursors.length} active</div>
            <div>Tracking: {isTracking ? 'Enabled' : 'Disabled'}</div>
          </div>
        </div>
      )}
      
      {/* Settings panel */}
      {showSettings && (
        <div className="fixed top-20 right-4 bg-white rounded-lg shadow-lg border p-4 z-50 w-64">
          <h4 className="font-medium text-sm mb-3">Cursor Settings</h4>
          
          <div className="space-y-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={showCursors}
                onChange={(e) => {
                  // In a real implementation, this would be passed as a prop
                  console.log('Toggle cursors:', e.target.checked);
                }}
                className="rounded"
              />
              Show cursors
            </label>
            
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={showSelections}
                onChange={(e) => {
                  console.log('Toggle selections:', e.target.checked);
                }}
                className="rounded"
              />
              Show selections
            </label>
            
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={isTracking}
                onChange={(e) => setIsTracking(e.target.checked)}
                className="rounded"
              />
              Enable tracking
            </label>
            
            <div className="text-xs text-gray-500 mt-3">
              <div>Update rate: {1000 / THROTTLE_DELAY} FPS</div>
              <div>Position: {mousePosition.x}, {mousePosition.y}</div>
            </div>
          </div>
          
          <button
            onClick={() => setShowSettings(false)}
            className="mt-3 text-xs text-blue-600 hover:text-blue-800"
          >
            Close Settings
          </button>
        </div>
      )}
    </div>
  );
};