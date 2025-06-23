/**
 * Meeting Management Slice
 * Handles meeting creation, updates, participant management, and meeting lifecycle
 */

import { StateCreator } from 'zustand';
import { produce } from 'immer';
import { 
  Meeting, 
  Participant, 
  MeetingMetadata, 
  TranscriptionSegment,
  AppState,
  StoreActions 
} from '../types';

export interface MeetingSlice {
  // State
  meetings: Record<string, Meeting>;
  activeMeetingId: string | null;
  
  // Computed getters
  getActiveMeeting: () => Meeting | null;
  getMeetingById: (id: string) => Meeting | null;
  getRecentMeetings: (limit?: number) => Meeting[];
  getMeetingsByStatus: (status: Meeting['status']) => Meeting[];
  getTotalMeetingTime: () => number;
  
  // Meeting management actions
  createMeeting: (meeting: Omit<Meeting, 'id'>) => string;
  updateMeeting: (id: string, updates: Partial<Meeting>) => void;
  deleteMeeting: (id: string) => void;
  setActiveMeeting: (id: string | null) => void;
  startMeeting: (id: string) => void;
  pauseMeeting: (id: string) => void;
  resumeMeeting: (id: string) => void;
  endMeeting: (id: string) => void;
  
  // Participant management
  addParticipant: (meetingId: string, participant: Omit<Participant, 'id' | 'joinedAt'>) => void;
  updateParticipant: (meetingId: string, participantId: string, updates: Partial<Participant>) => void;
  removeParticipant: (meetingId: string, participantId: string) => void;
  setParticipantSpeaking: (meetingId: string, participantId: string, isSpeaking: boolean) => void;
  updateParticipantAudioLevel: (meetingId: string, participantId: string, level: number) => void;
  
  // Transcription management
  addTranscriptionSegment: (meetingId: string, segment: Omit<TranscriptionSegment, 'id' | 'timestamp'>) => void;
  updateTranscriptionSegment: (meetingId: string, segmentId: string, updates: Partial<TranscriptionSegment>) => void;
  deleteTranscriptionSegment: (meetingId: string, segmentId: string) => void;
  editTranscriptionText: (meetingId: string, segmentId: string, newText: string, editedBy: string) => void;
  
  // Meeting analytics
  calculateMeetingStats: (meetingId: string) => MeetingStats | null;
  generateMeetingSummary: (meetingId: string) => MeetingSummary | null;
  
  // Bulk operations
  bulkUpdateMeetings: (updates: Array<{ id: string; updates: Partial<Meeting> }>) => void;
  archiveMeetings: (meetingIds: string[]) => void;
  exportMeetingData: (meetingId: string) => MeetingExport | null;
  
  // Search and filter
  searchMeetings: (query: string) => Meeting[];
  filterMeetings: (filters: MeetingFilters) => Meeting[];
}

export interface MeetingStats {
  duration: number;
  participantCount: number;
  totalSpeakingTime: number;
  speakingDistribution: Record<string, number>;
  transcriptionAccuracy: number;
  wordCount: number;
  topicChanges: number;
  engagementScore: number;
}

export interface MeetingSummary {
  keyPoints: string[];
  actionItems: string[];
  decisions: string[];
  participants: string[];
  duration: string;
  topics: string[];
}

export interface MeetingExport {
  meeting: Meeting;
  transcript: string;
  summary: MeetingSummary;
  stats: MeetingStats;
  exportedAt: Date;
}

export interface MeetingFilters {
  status?: Meeting['status'][];
  dateRange?: { start: Date; end: Date };
  participants?: string[];
  tags?: string[];
  category?: string;
  priority?: Meeting['metadata']['priority'][];
  minDuration?: number;
  maxDuration?: number;
  hasRecording?: boolean;
  hasTranscription?: boolean;
}

const generateId = () => `meeting_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
const generateParticipantId = () => `participant_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
const generateSegmentId = () => `segment_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

export const createMeetingSlice: StateCreator<
  AppState & StoreActions,
  [],
  [],
  MeetingSlice
> = (set, get) => ({
  // Initial state
  meetings: {},
  activeMeetingId: null,
  
  // Computed getters
  getActiveMeeting: () => {
    const { activeMeetingId, meetings } = get();
    return activeMeetingId ? meetings[activeMeetingId] || null : null;
  },
  
  getMeetingById: (id: string) => {
    const { meetings } = get();
    return meetings[id] || null;
  },
  
  getRecentMeetings: (limit = 10) => {
    const { meetings } = get();
    return Object.values(meetings)
      .sort((a, b) => b.metadata.updatedAt.getTime() - a.metadata.updatedAt.getTime())
      .slice(0, limit);
  },
  
  getMeetingsByStatus: (status: Meeting['status']) => {
    const { meetings } = get();
    return Object.values(meetings).filter(meeting => meeting.status === status);
  },
  
  getTotalMeetingTime: () => {
    const { meetings } = get();
    return Object.values(meetings)
      .filter(meeting => meeting.duration)
      .reduce((total, meeting) => total + (meeting.duration || 0), 0);
  },
  
  // Meeting management actions
  createMeeting: (meetingData) => {
    const id = generateId();
    const now = new Date();
    
    const meeting: Meeting = {
      id,
      ...meetingData,
      status: 'waiting',
      participants: meetingData.participants || [],
      transcription: {
        segments: [],
        language: 'en',
        confidence: 0,
        isLive: false,
        settings: {
          model: 'base',
          enableSpeakerDetection: true,
          enablePunctuation: true,
          enableFormatting: true,
          realTimeMode: false,
          qualityThreshold: 0.7
        }
      },
      metadata: {
        ...meetingData.metadata,
        createdAt: now,
        updatedAt: now
      }
    };
    
    set(produce((state: AppState) => {
      state.meetings[id] = meeting;
    }));
    
    return id;
  },
  
  updateMeeting: (id, updates) => {
    set(produce((state: AppState) => {
      if (state.meetings[id]) {
        Object.assign(state.meetings[id], updates);
        state.meetings[id].metadata.updatedAt = new Date();
      }
    }));
  },
  
  deleteMeeting: (id) => {
    set(produce((state: AppState) => {
      delete state.meetings[id];
      if (state.activeMeetingId === id) {
        state.activeMeetingId = null;
      }
    }));
  },
  
  setActiveMeeting: (id) => {
    set(produce((state: AppState) => {
      state.activeMeetingId = id;
    }));
  },
  
  startMeeting: (id) => {
    set(produce((state: AppState) => {
      if (state.meetings[id]) {
        state.meetings[id].status = 'active';
        state.meetings[id].startedAt = new Date();
        state.meetings[id].metadata.updatedAt = new Date();
        state.meetings[id].transcription.isLive = true;
      }
    }));
  },
  
  pauseMeeting: (id) => {
    set(produce((state: AppState) => {
      if (state.meetings[id]) {
        state.meetings[id].status = 'paused';
        state.meetings[id].metadata.updatedAt = new Date();
        state.meetings[id].transcription.isLive = false;
      }
    }));
  },
  
  resumeMeeting: (id) => {
    set(produce((state: AppState) => {
      if (state.meetings[id]) {
        state.meetings[id].status = 'active';
        state.meetings[id].metadata.updatedAt = new Date();
        state.meetings[id].transcription.isLive = true;
      }
    }));
  },
  
  endMeeting: (id) => {
    set(produce((state: AppState) => {
      if (state.meetings[id]) {
        const meeting = state.meetings[id];
        meeting.status = 'completed';
        meeting.endedAt = new Date();
        meeting.transcription.isLive = false;
        
        // Calculate duration
        if (meeting.startedAt) {
          meeting.duration = meeting.endedAt.getTime() - meeting.startedAt.getTime();
        }
        
        meeting.metadata.updatedAt = new Date();
      }
    }));
  },
  
  // Participant management
  addParticipant: (meetingId, participantData) => {
    const id = generateParticipantId();
    const participant: Participant = {
      id,
      ...participantData,
      status: 'connected',
      joinedAt: new Date(),
      audioLevel: 0,
      speakingTime: 0
    };
    
    set(produce((state: AppState) => {
      if (state.meetings[meetingId]) {
        state.meetings[meetingId].participants.push(participant);
        state.meetings[meetingId].metadata.updatedAt = new Date();
      }
    }));
  },
  
  updateParticipant: (meetingId, participantId, updates) => {
    set(produce((state: AppState) => {
      const meeting = state.meetings[meetingId];
      if (meeting) {
        const participant = meeting.participants.find(p => p.id === participantId);
        if (participant) {
          Object.assign(participant, updates);
          meeting.metadata.updatedAt = new Date();
        }
      }
    }));
  },
  
  removeParticipant: (meetingId, participantId) => {
    set(produce((state: AppState) => {
      const meeting = state.meetings[meetingId];
      if (meeting) {
        const index = meeting.participants.findIndex(p => p.id === participantId);
        if (index !== -1) {
          meeting.participants[index].leftAt = new Date();
          meeting.participants[index].status = 'disconnected';
          meeting.metadata.updatedAt = new Date();
        }
      }
    }));
  },
  
  setParticipantSpeaking: (meetingId, participantId, isSpeaking) => {
    set(produce((state: AppState) => {
      const meeting = state.meetings[meetingId];
      if (meeting) {
        const participant = meeting.participants.find(p => p.id === participantId);
        if (participant) {
          participant.status = isSpeaking ? 'speaking' : 'connected';
          meeting.metadata.updatedAt = new Date();
        }
      }
    }));
  },
  
  updateParticipantAudioLevel: (meetingId, participantId, level) => {
    set(produce((state: AppState) => {
      const meeting = state.meetings[meetingId];
      if (meeting) {
        const participant = meeting.participants.find(p => p.id === participantId);
        if (participant) {
          participant.audioLevel = level;
        }
      }
    }));
  },
  
  // Transcription management
  addTranscriptionSegment: (meetingId, segmentData) => {
    const id = generateSegmentId();
    const segment: TranscriptionSegment = {
      id,
      ...segmentData,
      timestamp: new Date(),
      isEdited: false,
      editHistory: []
    };
    
    set(produce((state: AppState) => {
      const meeting = state.meetings[meetingId];
      if (meeting) {
        meeting.transcription.segments.push(segment);
        
        // Update overall confidence (running average)
        const segments = meeting.transcription.segments;
        meeting.transcription.confidence = 
          segments.reduce((sum, s) => sum + s.confidence, 0) / segments.length;
        
        meeting.metadata.updatedAt = new Date();
      }
    }));
  },
  
  updateTranscriptionSegment: (meetingId, segmentId, updates) => {
    set(produce((state: AppState) => {
      const meeting = state.meetings[meetingId];
      if (meeting) {
        const segment = meeting.transcription.segments.find(s => s.id === segmentId);
        if (segment) {
          Object.assign(segment, updates);
          meeting.metadata.updatedAt = new Date();
        }
      }
    }));
  },
  
  deleteTranscriptionSegment: (meetingId, segmentId) => {
    set(produce((state: AppState) => {
      const meeting = state.meetings[meetingId];
      if (meeting) {
        const index = meeting.transcription.segments.findIndex(s => s.id === segmentId);
        if (index !== -1) {
          meeting.transcription.segments.splice(index, 1);
          meeting.metadata.updatedAt = new Date();
        }
      }
    }));
  },
  
  editTranscriptionText: (meetingId, segmentId, newText, editedBy) => {
    set(produce((state: AppState) => {
      const meeting = state.meetings[meetingId];
      if (meeting) {
        const segment = meeting.transcription.segments.find(s => s.id === segmentId);
        if (segment) {
          // Add to edit history
          if (!segment.editHistory) {
            segment.editHistory = [];
          }
          
          segment.editHistory.push({
            timestamp: new Date(),
            originalText: segment.text,
            editedText: newText,
            editedBy
          });
          
          // Update text
          segment.text = newText;
          segment.isEdited = true;
          meeting.metadata.updatedAt = new Date();
        }
      }
    }));
  },
  
  // Meeting analytics
  calculateMeetingStats: (meetingId) => {
    const meeting = get().meetings[meetingId];
    if (!meeting) return null;
    
    const stats: MeetingStats = {
      duration: meeting.duration || 0,
      participantCount: meeting.participants.length,
      totalSpeakingTime: meeting.participants.reduce((sum, p) => sum + (p.speakingTime || 0), 0),
      speakingDistribution: {},
      transcriptionAccuracy: meeting.transcription.confidence,
      wordCount: meeting.transcription.segments.reduce((sum, s) => sum + s.text.split(' ').length, 0),
      topicChanges: 0, // Would be calculated based on AI analysis
      engagementScore: 0 // Would be calculated based on participation metrics
    };
    
    // Calculate speaking distribution
    meeting.participants.forEach(participant => {
      if (participant.speakingTime) {
        stats.speakingDistribution[participant.name] = participant.speakingTime;
      }
    });
    
    return stats;
  },
  
  generateMeetingSummary: (meetingId) => {
    const meeting = get().meetings[meetingId];
    if (!meeting) return null;
    
    // This would typically call an AI service for real summarization
    const summary: MeetingSummary = {
      keyPoints: ['Meeting summary would be generated by AI'],
      actionItems: ['Action items would be extracted by AI'],
      decisions: ['Decisions would be identified by AI'],
      participants: meeting.participants.map(p => p.name),
      duration: meeting.duration ? `${Math.round(meeting.duration / 60000)} minutes` : 'Unknown',
      topics: ['Topics would be identified by AI']
    };
    
    return summary;
  },
  
  // Bulk operations
  bulkUpdateMeetings: (updates) => {
    set(produce((state: AppState) => {
      updates.forEach(({ id, updates: meetingUpdates }) => {
        if (state.meetings[id]) {
          Object.assign(state.meetings[id], meetingUpdates);
          state.meetings[id].metadata.updatedAt = new Date();
        }
      });
    }));
  },
  
  archiveMeetings: (meetingIds) => {
    set(produce((state: AppState) => {
      meetingIds.forEach(id => {
        if (state.meetings[id]) {
          state.meetings[id].metadata.isPrivate = true;
          state.meetings[id].metadata.updatedAt = new Date();
        }
      });
    }));
  },
  
  exportMeetingData: (meetingId) => {
    const meeting = get().meetings[meetingId];
    if (!meeting) return null;
    
    const stats = get().calculateMeetingStats(meetingId);
    const summary = get().generateMeetingSummary(meetingId);
    
    const exportData: MeetingExport = {
      meeting,
      transcript: meeting.transcription.segments.map(s => s.text).join(' '),
      summary: summary!,
      stats: stats!,
      exportedAt: new Date()
    };
    
    return exportData;
  },
  
  // Search and filter
  searchMeetings: (query) => {
    const { meetings } = get();
    const lowercaseQuery = query.toLowerCase();
    
    return Object.values(meetings).filter(meeting => 
      meeting.title.toLowerCase().includes(lowercaseQuery) ||
      meeting.description?.toLowerCase().includes(lowercaseQuery) ||
      meeting.participants.some(p => p.name.toLowerCase().includes(lowercaseQuery)) ||
      meeting.transcription.segments.some(s => s.text.toLowerCase().includes(lowercaseQuery))
    );
  },
  
  filterMeetings: (filters) => {
    const { meetings } = get();
    
    return Object.values(meetings).filter(meeting => {
      // Status filter
      if (filters.status && !filters.status.includes(meeting.status)) {
        return false;
      }
      
      // Date range filter
      if (filters.dateRange) {
        const meetingDate = meeting.metadata.createdAt;
        if (meetingDate < filters.dateRange.start || meetingDate > filters.dateRange.end) {
          return false;
        }
      }
      
      // Participants filter
      if (filters.participants && filters.participants.length > 0) {
        const hasParticipant = meeting.participants.some(p => 
          filters.participants!.includes(p.name)
        );
        if (!hasParticipant) return false;
      }
      
      // Tags filter
      if (filters.tags && filters.tags.length > 0) {
        const meetingTags = meeting.metadata.tags || [];
        const hasTag = filters.tags.some(tag => meetingTags.includes(tag));
        if (!hasTag) return false;
      }
      
      // Category filter
      if (filters.category && meeting.metadata.category !== filters.category) {
        return false;
      }
      
      // Priority filter
      if (filters.priority && !filters.priority.includes(meeting.metadata.priority)) {
        return false;
      }
      
      // Duration filters
      if (filters.minDuration && (!meeting.duration || meeting.duration < filters.minDuration)) {
        return false;
      }
      
      if (filters.maxDuration && (!meeting.duration || meeting.duration > filters.maxDuration)) {
        return false;
      }
      
      // Recording filter
      if (filters.hasRecording !== undefined) {
        const hasRecording = !!meeting.recording;
        if (hasRecording !== filters.hasRecording) return false;
      }
      
      // Transcription filter
      if (filters.hasTranscription !== undefined) {
        const hasTranscription = meeting.transcription.segments.length > 0;
        if (hasTranscription !== filters.hasTranscription) return false;
      }
      
      return true;
    });
  }
});