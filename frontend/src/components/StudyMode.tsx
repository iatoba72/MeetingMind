// Advanced Study Mode with Loop Sections and Note-Taking
// Provides comprehensive learning tools for reviewing recorded meetings and lectures

import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { MediaPlayback } from './MediaPlayback';

interface StudyNote {
  id: string;
  timestamp: number;
  title: string;
  content: string;
  tags: string[];
  type: 'summary' | 'question' | 'insight' | 'action' | 'reminder';
  color: string;
  createdAt: Date;
  updatedAt: Date;
  segmentId?: string;
}

interface StudySession {
  id: string;
  name: string;
  mediaUrl: string;
  mediaType: 'audio' | 'video';
  transcript: any[];
  notes: StudyNote[];
  bookmarks: any[];
  loopSections: LoopSection[];
  totalStudyTime: number; // in minutes
  completionPercentage: number;
  createdAt: Date;
  lastAccessed: Date;
}

interface LoopSection {
  id: string;
  start: number;
  end: number;
  title: string;
  description?: string;
  playCount: number;
  targetPlays: number;
  difficulty: 'easy' | 'medium' | 'hard';
  masteryLevel: number; // 0-100%
  notes: string[];
  isActive: boolean;
  completedAt?: Date;
}

interface StudyGoal {
  id: string;
  title: string;
  description: string;
  targetSections: string[];
  progressMetrics: {
    sectionsCompleted: number;
    totalSections: number;
    averagePlaysPerSection: number;
    masteryScore: number;
  };
  deadline?: Date;
  isCompleted: boolean;
}

interface StudyModeProps {
  session: StudySession;
  onSessionUpdate: (session: StudySession) => void;
  className?: string;
}

/**
 * Study Mode Implementation Strategy:
 * 
 * 1. Adaptive Learning:
 *    - Spaced repetition algorithm for loop sections
 *    - Difficulty adjustment based on user performance
 *    - Progress tracking with mastery metrics
 *    - Personalized study recommendations
 * 
 * 2. Note-Taking System:
 *    - Real-time note creation during playback
 *    - Rich text formatting with markdown support
 *    - Automatic timestamp linking
 *    - Tag-based organization and search
 * 
 * 3. Loop Section Management:
 *    - Intelligent section identification
 *    - Customizable repetition targets
 *    - Progress visualization
 *    - Mastery assessment
 * 
 * 4. Study Analytics:
 *    - Time tracking and productivity metrics
 *    - Learning curve analysis
 *    - Attention pattern recognition
 *    - Performance improvement suggestions
 */

export const StudyMode: React.FC<StudyModeProps> = ({
  session,
  onSessionUpdate,
  className = ''
}) => {
  // Study state
  const [currentNote, setCurrentNote] = useState<Partial<StudyNote>>({});
  const [showNoteEditor, setShowNoteEditor] = useState(false);
  const [selectedNoteType, setSelectedNoteType] = useState<StudyNote['type']>('summary');
  const [noteSearchTerm, setNoteSearchTerm] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  
  // Loop section state
  const [showLoopCreator, setShowLoopCreator] = useState(false);
  
  // Study session state
  const [studyStartTime, setStudyStartTime] = useState<Date | null>(null);
  const [currentSessionTime, setCurrentSessionTime] = useState(0);
  const [studyGoals] = useState<StudyGoal[]>([]);
  
  // UI state
  const [activeTab, setActiveTab] = useState<'notes' | 'loops' | 'goals' | 'analytics'>('notes');
  const [isFullscreen, setIsFullscreen] = useState(false);
  
  // Refs
  const noteEditorRef = useRef<HTMLTextAreaElement>(null);
  const studyTimerRef = useRef<NodeJS.Timeout | null>(null);
  
  // Start study session tracking
  useEffect(() => {
    setStudyStartTime(new Date());
    
    studyTimerRef.current = setInterval(() => {
      setCurrentSessionTime(prev => prev + 1);
    }, 60000); // Update every minute
    
    return () => {
      if (studyTimerRef.current) {
        clearInterval(studyTimerRef.current);
      }
      
      // Update total study time in session
      if (studyStartTime) {
        const sessionDuration = Math.floor((Date.now() - studyStartTime.getTime()) / 60000);
        onSessionUpdate({
          ...session,
          totalStudyTime: session.totalStudyTime + sessionDuration,
          lastAccessed: new Date(),
        });
      }
    };
  }, [session, onSessionUpdate, studyStartTime]);
  
  // Available tags for notes
  const availableTags = useMemo(() => {
    const tags = new Set<string>();
    session.notes.forEach(note => {
      note.tags.forEach(tag => tags.add(tag));
    });
    return Array.from(tags).sort();
  }, [session.notes]);
  
  // Filtered notes based on search and tags
  const filteredNotes = useMemo(() => {
    let filtered = session.notes;
    
    if (noteSearchTerm) {
      const searchLower = noteSearchTerm.toLowerCase();
      filtered = filtered.filter(note => 
        note.title.toLowerCase().includes(searchLower) ||
        note.content.toLowerCase().includes(searchLower) ||
        note.tags.some(tag => tag.toLowerCase().includes(searchLower))
      );
    }
    
    if (selectedTags.length > 0) {
      filtered = filtered.filter(note =>
        selectedTags.every(tag => note.tags.includes(tag))
      );
    }
    
    return filtered.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }, [session.notes, noteSearchTerm, selectedTags]);
  
  // Active loop sections
  const activeLoopSections = useMemo(() => {
    return session.loopSections.filter(loop => loop.isActive);
  }, [session.loopSections]);
  
  // Calculate study progress
  const studyProgress = useMemo(() => {
    const completedLoops = session.loopSections.filter(loop => 
      loop.playCount >= loop.targetPlays
    ).length;
    
    const totalLoops = session.loopSections.length;
    const averageMastery = session.loopSections.reduce((sum, loop) => 
      sum + loop.masteryLevel, 0
    ) / Math.max(totalLoops, 1);
    
    return {
      completedLoops,
      totalLoops,
      completionPercentage: totalLoops > 0 ? (completedLoops / totalLoops) * 100 : 0,
      averageMastery,
      totalNotes: session.notes.length,
      totalStudyTime: session.totalStudyTime + currentSessionTime,
    };
  }, [session.loopSections, session.notes, session.totalStudyTime, currentSessionTime]);
  
  // Create new note
  const createNote = useCallback((timestamp: number, type: StudyNote['type'] = 'summary') => {
    const newNote: StudyNote = {
      id: `note_${Date.now()}`,
      timestamp,
      title: '',
      content: '',
      tags: [],
      type,
      color: getTypeColor(type),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    setCurrentNote(newNote);
    setSelectedNoteType(type);
    setShowNoteEditor(true);
    
    setTimeout(() => noteEditorRef.current?.focus(), 100);
  }, []);
  
  // Save note
  const saveNote = useCallback(() => {
    if (!currentNote.title?.trim() || !currentNote.content?.trim()) return;
    
    const noteToSave: StudyNote = {
      id: currentNote.id || `note_${Date.now()}`,
      timestamp: currentNote.timestamp || 0,
      title: currentNote.title.trim(),
      content: currentNote.content.trim(),
      tags: currentNote.tags || [],
      type: selectedNoteType,
      color: getTypeColor(selectedNoteType),
      createdAt: currentNote.createdAt || new Date(),
      updatedAt: new Date(),
    };
    
    const updatedNotes = currentNote.id 
      ? session.notes.map(note => note.id === currentNote.id ? noteToSave : note)
      : [...session.notes, noteToSave];
    
    onSessionUpdate({
      ...session,
      notes: updatedNotes,
    });
    
    setCurrentNote({});
    setShowNoteEditor(false);
  }, [currentNote, selectedNoteType, session, onSessionUpdate]);
  
  // Delete note
  const deleteNote = useCallback((noteId: string) => {
    if (window.confirm('Are you sure you want to delete this note?')) {
      onSessionUpdate({
        ...session,
        notes: session.notes.filter(note => note.id !== noteId),
      });
    }
  }, [session, onSessionUpdate]);
  
  // Create loop section
  const createLoopSection = useCallback((
    start: number, 
    end: number, 
    title: string, 
    difficulty: LoopSection['difficulty'] = 'medium'
  ) => {
    const targetPlays = difficulty === 'easy' ? 2 : difficulty === 'medium' ? 3 : 5;
    
    const newLoop: LoopSection = {
      id: `loop_${Date.now()}`,
      start,
      end,
      title,
      description: '',
      playCount: 0,
      targetPlays,
      difficulty,
      masteryLevel: 0,
      notes: [],
      isActive: true,
    };
    
    onSessionUpdate({
      ...session,
      loopSections: [...session.loopSections, newLoop],
    });
    
    setShowLoopCreator(false);
  }, [session, onSessionUpdate]);
  
  
  // Get color for note type
  function getTypeColor(type: StudyNote['type']): string {
    const colors = {
      summary: '#3B82F6',
      question: '#EF4444',
      insight: '#10B981',
      action: '#F59E0B',
      reminder: '#8B5CF6',
    };
    return colors[type];
  }
  
  // Format time for display
  const formatTime = useCallback((seconds: number): string => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }, []);
  
  // Parse tags from input
  const parseTags = useCallback((input: string): string[] => {
    return input.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0);
  }, []);

  return (
    <div className={`bg-white rounded-lg shadow-lg ${className}`}>
      {/* Study Mode Header */}
      <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white p-6 rounded-t-lg">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center">
              📚 Study Mode
              <span className="ml-3 text-sm bg-white bg-opacity-20 px-3 py-1 rounded-full">
                Session: {Math.floor(currentSessionTime)}min
              </span>
            </h1>
            <p className="text-blue-100 mt-1">{session.name}</p>
          </div>
          
          <div className="flex items-center space-x-4">
            {/* Progress indicator */}
            <div className="text-right">
              <div className="text-2xl font-bold">{Math.round(studyProgress.completionPercentage)}%</div>
              <div className="text-sm text-blue-100">Complete</div>
            </div>
            
            <div className="text-right">
              <div className="text-2xl font-bold">{studyProgress.totalNotes}</div>
              <div className="text-sm text-blue-100">Notes</div>
            </div>
            
            <button
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="p-2 bg-white bg-opacity-20 rounded-lg hover:bg-opacity-30 transition-colors"
              title="Toggle fullscreen"
            >
              {isFullscreen ? '🔲' : '⛶'}
            </button>
          </div>
        </div>
        
        {/* Progress bar */}
        <div className="mt-4">
          <div className="w-full bg-white bg-opacity-20 rounded-full h-2">
            <div 
              className="bg-white h-2 rounded-full transition-all duration-300"
              style={{ width: `${studyProgress.completionPercentage}%` }}
            />
          </div>
          <div className="flex justify-between text-sm text-blue-100 mt-1">
            <span>{studyProgress.completedLoops}/{studyProgress.totalLoops} sections mastered</span>
            <span>Average mastery: {Math.round(studyProgress.averageMastery)}%</span>
          </div>
        </div>
      </div>
      
      {/* Main content area */}
      <div className={`flex flex-col lg:flex-row ${isFullscreen ? 'h-screen' : 'h-[800px]'}`}>
        {/* Media playback section */}
        <div className={`${isFullscreen ? 'lg:w-2/3' : 'lg:w-1/2'} w-full lg:border-r border-gray-200 ${isFullscreen ? '' : 'h-1/2 lg:h-full'}`}>
          <MediaPlayback
            audioUrl={session.mediaType === 'audio' ? session.mediaUrl : undefined}
            videoUrl={session.mediaType === 'video' ? session.mediaUrl : undefined}
            segments={session.transcript}
            enableStudyMode={true}
            enableBookmarks={true}
            enableAnnotations={true}
            enableSpeedControl={true}
            enableSkipSilence={true}
            studyModeConfig={{
              autoLoop: true,
              showNotes: true,
              highlightActive: true,
            }}
            onBookmarkAdd={(bookmark) => {
              onSessionUpdate({
                ...session,
                bookmarks: [...session.bookmarks, bookmark],
              });
            }}
            onAnnotationAdd={(annotation) => {
              createNote(annotation.timestamp, 'summary');
            }}
            className="h-full"
          />
        </div>
        
        {/* Study tools sidebar */}
        <div className={`${isFullscreen ? 'lg:w-1/3' : 'lg:w-1/2'} w-full flex flex-col ${isFullscreen ? '' : 'h-1/2 lg:h-full'}`}>
          {/* Tab navigation */}
          <div className="flex border-b border-gray-200">
            {[
              { id: 'notes', label: 'Notes', icon: '📝', count: session.notes.length },
              { id: 'loops', label: 'Loops', icon: '🔄', count: activeLoopSections.length },
              { id: 'goals', label: 'Goals', icon: '🎯', count: studyGoals.length },
              { id: 'analytics', label: 'Analytics', icon: '📊' },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`
                  flex-1 py-3 px-4 text-sm font-medium border-b-2 transition-colors
                  ${activeTab === tab.id 
                    ? 'border-blue-500 text-blue-600 bg-blue-50' 
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                  }
                `}
              >
                <span className="flex items-center justify-center space-x-1">
                  <span>{tab.icon}</span>
                  <span>{tab.label}</span>
                  {tab.count !== undefined && (
                    <span className="bg-gray-200 text-gray-600 text-xs px-1.5 py-0.5 rounded-full ml-1">
                      {tab.count}
                    </span>
                  )}
                </span>
              </button>
            ))}
          </div>
          
          {/* Tab content */}
          <div className="flex-1 overflow-hidden">
            {/* Notes tab */}
            {activeTab === 'notes' && (
              <div className="h-full flex flex-col">
                {/* Notes header */}
                <div className="p-4 border-b border-gray-200">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold">Study Notes</h3>
                    <button
                      onClick={() => createNote(0, 'summary')}
                      className="px-3 py-1 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700"
                    >
                      + New Note
                    </button>
                  </div>
                  
                  {/* Search and filters */}
                  <div className="space-y-2">
                    <input
                      type="text"
                      placeholder="Search notes..."
                      value={noteSearchTerm}
                      onChange={(e) => setNoteSearchTerm(e.target.value)}
                      className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                    />
                    
                    {availableTags.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {availableTags.map(tag => (
                          <button
                            key={tag}
                            onClick={() => {
                              setSelectedTags(prev => 
                                prev.includes(tag) 
                                  ? prev.filter(t => t !== tag)
                                  : [...prev, tag]
                              );
                            }}
                            className={`
                              px-2 py-1 text-xs rounded-full border transition-colors
                              ${selectedTags.includes(tag)
                                ? 'bg-blue-100 border-blue-300 text-blue-700'
                                : 'bg-gray-100 border-gray-300 text-gray-600 hover:bg-gray-200'
                              }
                            `}
                          >
                            {tag}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                
                {/* Notes list */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {filteredNotes.map(note => (
                    <div
                      key={note.id}
                      className="bg-gray-50 border border-gray-200 rounded-lg p-3 hover:shadow-md transition-shadow"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center space-x-2">
                          <div 
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: note.color }}
                          />
                          <span className="text-xs bg-gray-200 px-2 py-1 rounded-full capitalize">
                            {note.type}
                          </span>
                          <span className="text-xs text-gray-500">
                            {formatTime(note.timestamp)}
                          </span>
                        </div>
                        
                        <div className="flex items-center space-x-1">
                          <button
                            onClick={() => {
                              setCurrentNote(note);
                              setSelectedNoteType(note.type);
                              setShowNoteEditor(true);
                            }}
                            className="text-gray-400 hover:text-blue-600"
                            title="Edit note"
                          >
                            ✏️
                          </button>
                          <button
                            onClick={() => deleteNote(note.id)}
                            className="text-gray-400 hover:text-red-600"
                            title="Delete note"
                          >
                            🗑️
                          </button>
                        </div>
                      </div>
                      
                      <h4 className="font-medium text-gray-900 mb-1">{note.title}</h4>
                      <p className="text-sm text-gray-600 mb-2">{note.content}</p>
                      
                      {note.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {note.tags.map(tag => (
                            <span
                              key={tag}
                              className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                  
                  {filteredNotes.length === 0 && (
                    <div className="text-center text-gray-500 py-8">
                      {noteSearchTerm || selectedTags.length > 0 
                        ? 'No notes match your search criteria'
                        : 'No notes yet. Start taking notes during playback!'
                      }
                    </div>
                  )}
                </div>
              </div>
            )}
            
            {/* Loop sections tab */}
            {activeTab === 'loops' && (
              <div className="h-full flex flex-col">
                <div className="p-4 border-b border-gray-200">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold">Loop Sections</h3>
                    <button
                      onClick={() => setShowLoopCreator(true)}
                      className="px-3 py-1 bg-green-600 text-white rounded-md text-sm hover:bg-green-700"
                    >
                      + Create Loop
                    </button>
                  </div>
                  
                  <div className="text-sm text-gray-600">
                    Focus on difficult sections by creating loops for repeated practice
                  </div>
                </div>
                
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {session.loopSections.map(loop => (
                    <div
                      key={loop.id}
                      className={`
                        border rounded-lg p-3 transition-all
                        ${loop.isActive 
                          ? 'border-green-300 bg-green-50' 
                          : 'border-gray-200 bg-gray-50'
                        }
                      `}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <h4 className="font-medium text-gray-900">{loop.title}</h4>
                          <div className="text-sm text-gray-600">
                            {formatTime(loop.start)} - {formatTime(loop.end)}
                          </div>
                        </div>
                        
                        <div className="flex items-center space-x-2">
                          <span className={`
                            text-xs px-2 py-1 rounded-full capitalize
                            ${loop.difficulty === 'easy' ? 'bg-green-100 text-green-700' :
                              loop.difficulty === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                              'bg-red-100 text-red-700'
                            }
                          `}>
                            {loop.difficulty}
                          </span>
                          
                          <button
                            onClick={() => {
                              const updatedLoops = session.loopSections.map(l =>
                                l.id === loop.id ? { ...l, isActive: !l.isActive } : l
                              );
                              onSessionUpdate({
                                ...session,
                                loopSections: updatedLoops,
                              });
                            }}
                            className={`
                              px-2 py-1 text-xs rounded transition-colors
                              ${loop.isActive 
                                ? 'bg-red-100 text-red-700 hover:bg-red-200' 
                                : 'bg-green-100 text-green-700 hover:bg-green-200'
                              }
                            `}
                          >
                            {loop.isActive ? 'Deactivate' : 'Activate'}
                          </button>
                        </div>
                      </div>
                      
                      {/* Progress bar */}
                      <div className="mb-2">
                        <div className="flex items-center justify-between text-sm text-gray-600 mb-1">
                          <span>Progress: {loop.playCount}/{loop.targetPlays} plays</span>
                          <span>Mastery: {Math.round(loop.masteryLevel)}%</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div 
                            className={`
                              h-2 rounded-full transition-all duration-300
                              ${loop.masteryLevel >= 100 ? 'bg-green-500' : 'bg-blue-500'}
                            `}
                            style={{ width: `${Math.min(loop.masteryLevel, 100)}%` }}
                          />
                        </div>
                      </div>
                      
                      {loop.completedAt && (
                        <div className="text-xs text-green-600 font-medium">
                          ✅ Completed on {new Date(loop.completedAt).toLocaleDateString()}
                        </div>
                      )}
                    </div>
                  ))}
                  
                  {session.loopSections.length === 0 && (
                    <div className="text-center text-gray-500 py-8">
                      No loop sections created yet. Create loops for sections you want to practice repeatedly.
                    </div>
                  )}
                </div>
              </div>
            )}
            
            {/* Study goals tab */}
            {activeTab === 'goals' && (
              <div className="h-full flex flex-col">
                <div className="p-4 border-b border-gray-200">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold">Study Goals</h3>
                    <button
                      onClick={() => {/* TODO: Implement goal creator */}}
                      className="px-3 py-1 bg-purple-600 text-white rounded-md text-sm hover:bg-purple-700"
                    >
                      + Set Goal
                    </button>
                  </div>
                  
                  <div className="text-sm text-gray-600">
                    Set learning objectives and track your progress
                  </div>
                </div>
                
                <div className="flex-1 overflow-y-auto p-4">
                  <div className="text-center text-gray-500 py-8">
                    Study goals feature coming soon!
                  </div>
                </div>
              </div>
            )}
            
            {/* Analytics tab */}
            {activeTab === 'analytics' && (
              <div className="h-full flex flex-col">
                <div className="p-4 border-b border-gray-200">
                  <h3 className="font-semibold">Study Analytics</h3>
                  <div className="text-sm text-gray-600">
                    Track your learning progress and performance
                  </div>
                </div>
                
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {/* Study time stats */}
                  <div className="bg-blue-50 rounded-lg p-4">
                    <h4 className="font-medium text-blue-900 mb-2">Study Time</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <div className="text-2xl font-bold text-blue-700">
                          {Math.floor(studyProgress.totalStudyTime / 60)}h {studyProgress.totalStudyTime % 60}m
                        </div>
                        <div className="text-sm text-blue-600">Total time</div>
                      </div>
                      <div>
                        <div className="text-2xl font-bold text-blue-700">{currentSessionTime}m</div>
                        <div className="text-sm text-blue-600">This session</div>
                      </div>
                    </div>
                  </div>
                  
                  {/* Learning progress */}
                  <div className="bg-green-50 rounded-lg p-4">
                    <h4 className="font-medium text-green-900 mb-2">Learning Progress</h4>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>Sections mastered</span>
                        <span>{studyProgress.completedLoops}/{studyProgress.totalLoops}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span>Average mastery</span>
                        <span>{Math.round(studyProgress.averageMastery)}%</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span>Notes created</span>
                        <span>{studyProgress.totalNotes}</span>
                      </div>
                    </div>
                  </div>
                  
                  {/* Note type distribution */}
                  <div className="bg-purple-50 rounded-lg p-4">
                    <h4 className="font-medium text-purple-900 mb-2">Note Types</h4>
                    <div className="space-y-1">
                      {Object.entries(
                        session.notes.reduce((acc, note) => {
                          acc[note.type] = (acc[note.type] || 0) + 1;
                          return acc;
                        }, {} as Record<string, number>)
                      ).map(([type, count]) => (
                        <div key={type} className="flex justify-between text-sm">
                          <span className="capitalize">{type}</span>
                          <span>{count}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      
      {/* Note Editor Modal */}
      {showNoteEditor && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-[600px] max-h-[80vh] overflow-y-auto">
            <h3 className="text-lg font-semibold mb-4">
              {currentNote.id ? 'Edit Note' : 'Create Note'}
            </h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Type
                </label>
                <select
                  value={selectedNoteType}
                  onChange={(e) => setSelectedNoteType(e.target.value as StudyNote['type'])}
                  className="w-full border border-gray-300 rounded-md px-3 py-2"
                >
                  <option value="summary">Summary</option>
                  <option value="question">Question</option>
                  <option value="insight">Insight</option>
                  <option value="action">Action Item</option>
                  <option value="reminder">Reminder</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Title
                </label>
                <input
                  type="text"
                  value={currentNote.title || ''}
                  onChange={(e) => setCurrentNote(prev => ({ ...prev, title: e.target.value }))}
                  className="w-full border border-gray-300 rounded-md px-3 py-2"
                  placeholder="Note title..."
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Content
                </label>
                <textarea
                  ref={noteEditorRef}
                  value={currentNote.content || ''}
                  onChange={(e) => setCurrentNote(prev => ({ ...prev, content: e.target.value }))}
                  className="w-full border border-gray-300 rounded-md px-3 py-2"
                  rows={6}
                  placeholder="Write your note here..."
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Tags (comma-separated)
                </label>
                <input
                  type="text"
                  value={currentNote.tags?.join(', ') || ''}
                  onChange={(e) => setCurrentNote(prev => ({ 
                    ...prev, 
                    tags: parseTags(e.target.value)
                  }))}
                  className="w-full border border-gray-300 rounded-md px-3 py-2"
                  placeholder="study, important, review..."
                />
              </div>
              
              <div className="text-sm text-gray-500">
                Timestamp: {formatTime(currentNote.timestamp || 0)}
              </div>
            </div>
            
            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => {
                  setCurrentNote({});
                  setShowNoteEditor(false);
                }}
                className="px-4 py-2 text-gray-600 hover:text-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={saveNote}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                Save Note
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Loop Creator Modal */}
      {showLoopCreator && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-96">
            <h3 className="text-lg font-semibold mb-4">Create Loop Section</h3>
            
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const formData = new FormData(e.currentTarget);
                createLoopSection(
                  Number(formData.get('start')),
                  Number(formData.get('end')),
                  formData.get('title') as string,
                  formData.get('difficulty') as LoopSection['difficulty']
                );
              }}
            >
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Title
                  </label>
                  <input
                    name="title"
                    type="text"
                    required
                    className="w-full border border-gray-300 rounded-md px-3 py-2"
                    placeholder="Loop section title"
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Start (seconds)
                    </label>
                    <input
                      name="start"
                      type="number"
                      required
                      min="0"
                      className="w-full border border-gray-300 rounded-md px-3 py-2"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      End (seconds)
                    </label>
                    <input
                      name="end"
                      type="number"
                      required
                      min="0"
                      className="w-full border border-gray-300 rounded-md px-3 py-2"
                    />
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Difficulty
                  </label>
                  <select
                    name="difficulty"
                    className="w-full border border-gray-300 rounded-md px-3 py-2"
                  >
                    <option value="easy">Easy (2 repetitions)</option>
                    <option value="medium">Medium (3 repetitions)</option>
                    <option value="hard">Hard (5 repetitions)</option>
                  </select>
                </div>
              </div>
              
              <div className="flex justify-end space-x-3 mt-6">
                <button
                  type="button"
                  onClick={() => setShowLoopCreator(false)}
                  className="px-4 py-2 text-gray-600 hover:text-gray-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
                >
                  Create Loop
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};