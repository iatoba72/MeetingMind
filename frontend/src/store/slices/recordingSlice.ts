/**
 * Recording Management Slice
 * Handles recording creation, processing, storage, and playback
 */

import { StateCreator } from 'zustand';
import { produce } from 'immer';
import { 
  RecordingState, 
  RecordingData, 
  RecordingSettings,
  RecordingChapter,
  AppState,
  StoreActions 
} from '../types';

export interface RecordingSlice {
  // State
  recording: RecordingState;
  
  // Recording control
  startRecording: (meetingId: string, settings?: Partial<RecordingSettings>) => Promise<string | null>;
  stopRecording: () => Promise<boolean>;
  pauseRecording: () => void;
  resumeRecording: () => void;
  
  // Recording management
  createRecording: (recording: Omit<RecordingData, 'id' | 'createdAt'>) => string;
  updateRecording: (id: string, updates: Partial<RecordingData>) => void;
  deleteRecording: (id: string) => Promise<boolean>;
  processRecording: (id: string) => Promise<boolean>;
  
  // Chapter management
  addChapter: (recordingId: string, chapter: Omit<RecordingChapter, 'id'>) => string;
  updateChapter: (recordingId: string, chapterId: string, updates: Partial<RecordingChapter>) => void;
  deleteChapter: (recordingId: string, chapterId: string) => void;
  generateChapters: (recordingId: string) => Promise<RecordingChapter[]>;
  
  // Settings management
  updateSettings: (settings: Partial<RecordingSettings>) => void;
  resetSettings: () => void;
  optimizeForQuality: (quality: RecordingData['quality']) => void;
  
  // Storage management
  getStorageInfo: () => StorageInfo;
  cleanupOldRecordings: (retention: RecordingSettings['retention']) => Promise<number>;
  compressRecording: (id: string, quality?: RecordingData['quality']) => Promise<boolean>;
  
  // Export and sharing
  exportRecording: (id: string, format?: string) => Promise<string | null>;
  shareRecording: (id: string, options: ShareOptions) => Promise<string | null>;
  downloadRecording: (id: string) => Promise<Blob | null>;
  
  // Playback control
  playRecording: (id: string, startTime?: number) => void;
  pausePlayback: () => void;
  seekTo: (time: number) => void;
  setPlaybackSpeed: (speed: number) => void;
  
  // Analytics
  getRecordingAnalytics: (id: string) => RecordingAnalytics | null;
  getStorageAnalytics: () => StorageAnalytics;
  
  // Cleanup
  cleanup: () => void;
}

export interface StorageInfo {
  used: number;
  available: number;
  total: number;
  percentage: number;
  recordings: number;
}

export interface ShareOptions {
  expiration?: Date;
  password?: string;
  allowDownload?: boolean;
  watermark?: boolean;
}

export interface RecordingAnalytics {
  recordingId: string;
  duration: number;
  fileSize: number;
  quality: RecordingData['quality'];
  compressionRatio: number;
  chapters: number;
  viewCount: number;
  lastViewed?: Date;
}

export interface StorageAnalytics {
  totalRecordings: number;
  totalSize: number;
  averageSize: number;
  byQuality: Record<RecordingData['quality'], number>;
  byFormat: Record<RecordingData['format'], number>;
  oldestRecording?: Date;
  newestRecording?: Date;
}

const defaultRecordingSettings: RecordingSettings = {
  autoRecord: false,
  format: 'webm',
  quality: 'high',
  includeVideo: true,
  includeAudio: true,
  includeScreenShare: false,
  chapterDetection: true,
  autoTranscribe: true,
  retention: '30d'
};

const defaultRecordingState: RecordingState = {
  recordings: {},
  isRecording: false,
  currentRecordingId: undefined,
  storageUsed: 0,
  storageLimit: 10 * 1024 * 1024 * 1024, // 10GB default
  settings: defaultRecordingSettings
};

const generateRecordingId = () => `recording_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
const generateChapterId = () => `chapter_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

export const createRecordingSlice: StateCreator<
  AppState & StoreActions,
  [],
  [],
  RecordingSlice
> = (set, get) => ({
  // Initial state
  recording: defaultRecordingState,
  
  // Recording control
  startRecording: async (meetingId, settingsOverride = {}) => {
    const { recording } = get();
    
    if (recording.isRecording) {
      console.warn('Recording already in progress');
      return null;
    }
    
    try {
      const recordingSettings = { ...recording.settings, ...settingsOverride };
      
      // Create recording record
      const recordingId = get().createRecording({
        meetingId,
        filename: `meeting_${meetingId}_${Date.now()}.${recordingSettings.format}`,
        duration: 0,
        size: 0,
        format: recordingSettings.format,
        quality: recordingSettings.quality,
        status: 'recording',
        processedAt: undefined,
        thumbnails: undefined,
        chapters: undefined,
        metadata: {
          originalSize: 0,
          encoding: 'h264',
          audioCodec: 'aac',
          videoCodec: recordingSettings.includeVideo ? 'h264' : undefined
        }
      });
      
      // Start actual recording (would integrate with MediaRecorder API)
      set(produce((state: AppState) => {
        state.recording.isRecording = true;
        state.recording.currentRecordingId = recordingId;
      }));
      
      return recordingId;
    } catch (error) {
      console.error('Failed to start recording:', error);
      return null;
    }
  },
  
  stopRecording: async () => {
    const { recording } = get();
    
    if (!recording.isRecording || !recording.currentRecordingId) {
      return false;
    }
    
    try {
      const recordingId = recording.currentRecordingId;
      
      // Stop recording and update status
      set(produce((state: AppState) => {
        state.recording.isRecording = false;
        state.recording.currentRecordingId = undefined;
        
        if (state.recording.recordings[recordingId]) {
          state.recording.recordings[recordingId].status = 'processing';
          state.recording.recordings[recordingId].duration = Date.now(); // Mock duration
          state.recording.recordings[recordingId].size = Math.random() * 100 * 1024 * 1024; // Mock size
        }
      }));
      
      // Process recording
      setTimeout(() => get().processRecording(recordingId), 1000);
      
      return true;
    } catch (error) {
      console.error('Failed to stop recording:', error);
      return false;
    }
  },
  
  pauseRecording: () => {
    set(produce((state: AppState) => {
      if (state.recording.currentRecordingId) {
        const recording = state.recording.recordings[state.recording.currentRecordingId];
        if (recording) {
          recording.status = 'processing'; // Temporary status for pause
        }
      }
    }));
  },
  
  resumeRecording: () => {
    set(produce((state: AppState) => {
      if (state.recording.currentRecordingId) {
        const recording = state.recording.recordings[state.recording.currentRecordingId];
        if (recording) {
          recording.status = 'recording';
        }
      }
    }));
  },
  
  // Recording management
  createRecording: (recordingData) => {
    const id = generateRecordingId();
    const recording: RecordingData = {
      id,
      ...recordingData,
      createdAt: new Date()
    };
    
    set(produce((state: AppState) => {
      state.recording.recordings[id] = recording;
    }));
    
    return id;
  },
  
  updateRecording: (id, updates) => {
    set(produce((state: AppState) => {
      if (state.recording.recordings[id]) {
        Object.assign(state.recording.recordings[id], updates);
      }
    }));
  },
  
  deleteRecording: async (id) => {
    try {
      const recording = get().recording.recordings[id];
      if (!recording) return false;
      
      // Mark as deleted and update storage
      set(produce((state: AppState) => {
        if (state.recording.recordings[id]) {
          state.recording.storageUsed -= state.recording.recordings[id].size;
          delete state.recording.recordings[id];
        }
      }));
      
      return true;
    } catch (error) {
      console.error('Failed to delete recording:', error);
      return false;
    }
  },
  
  processRecording: async (id) => {
    try {
      get().updateRecording(id, { status: 'processing' });
      
      // Simulate processing time
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Update with processed data
      const processedSize = Math.random() * 50 * 1024 * 1024; // Mock compressed size
      
      get().updateRecording(id, {
        status: 'ready',
        processedAt: new Date(),
        size: processedSize,
        metadata: {
          ...get().recording.recordings[id]?.metadata,
          compressedSize: processedSize,
          compressionRatio: 0.5
        }
      });
      
      // Generate chapters if enabled
      if (get().recording.settings.chapterDetection) {
        get().generateChapters(id);
      }
      
      // Update storage usage
      set(produce((state: AppState) => {
        state.recording.storageUsed += processedSize;
      }));
      
      return true;
    } catch (error) {
      console.error('Failed to process recording:', error);
      get().updateRecording(id, { status: 'error' });
      return false;
    }
  },
  
  // Chapter management
  addChapter: (recordingId, chapterData) => {
    const id = generateChapterId();
    const chapter: RecordingChapter = {
      id,
      ...chapterData
    };
    
    set(produce((state: AppState) => {
      const recording = state.recording.recordings[recordingId];
      if (recording) {
        if (!recording.chapters) {
          recording.chapters = [];
        }
        recording.chapters.push(chapter);
      }
    }));
    
    return id;
  },
  
  updateChapter: (recordingId, chapterId, updates) => {
    set(produce((state: AppState) => {
      const recording = state.recording.recordings[recordingId];
      if (recording?.chapters) {
        const chapter = recording.chapters.find(c => c.id === chapterId);
        if (chapter) {
          Object.assign(chapter, updates);
        }
      }
    }));
  },
  
  deleteChapter: (recordingId, chapterId) => {
    set(produce((state: AppState) => {
      const recording = state.recording.recordings[recordingId];
      if (recording?.chapters) {
        recording.chapters = recording.chapters.filter(c => c.id !== chapterId);
      }
    }));
  },
  
  generateChapters: async (recordingId) => {
    // Mock chapter generation based on AI analysis
    const chapters: RecordingChapter[] = [
      {
        id: generateChapterId(),
        title: 'Introduction',
        startTime: 0,
        endTime: 300000, // 5 minutes
        summary: 'Meeting introduction and agenda review'
      },
      {
        id: generateChapterId(),
        title: 'Main Discussion',
        startTime: 300000,
        endTime: 1800000, // 30 minutes
        summary: 'Core topics and decision making'
      }
    ];
    
    set(produce((state: AppState) => {
      const recording = state.recording.recordings[recordingId];
      if (recording) {
        recording.chapters = chapters;
      }
    }));
    
    return chapters;
  },
  
  // Settings management
  updateSettings: (settingsUpdate) => {
    set(produce((state: AppState) => {
      Object.assign(state.recording.settings, settingsUpdate);
    }));
  },
  
  resetSettings: () => {
    set(produce((state: AppState) => {
      state.recording.settings = { ...defaultRecordingSettings };
    }));
  },
  
  optimizeForQuality: (quality) => {
    const optimizations: Record<RecordingData['quality'], Partial<RecordingSettings>> = {
      low: {
        format: 'webm',
        includeVideo: false,
        chapterDetection: false
      },
      medium: {
        format: 'webm',
        includeVideo: true,
        chapterDetection: true
      },
      high: {
        format: 'mp4',
        includeVideo: true,
        chapterDetection: true,
        autoTranscribe: true
      },
      lossless: {
        format: 'wav',
        includeVideo: true,
        chapterDetection: true,
        autoTranscribe: true
      }
    };
    
    get().updateSettings({ quality, ...optimizations[quality] });
  },
  
  // Storage management
  getStorageInfo: () => {
    const { recording } = get();
    const used = recording.storageUsed;
    const total = recording.storageLimit;
    const available = total - used;
    const percentage = (used / total) * 100;
    const recordings = Object.keys(recording.recordings).length;
    
    return {
      used,
      available,
      total,
      percentage,
      recordings
    };
  },
  
  cleanupOldRecordings: async (retention) => {
    const retentionPeriods = {
      'session': 0,
      '7d': 7 * 24 * 60 * 60 * 1000,
      '30d': 30 * 24 * 60 * 60 * 1000,
      '90d': 90 * 24 * 60 * 60 * 1000,
      'forever': Infinity
    };
    
    const cutoffTime = Date.now() - retentionPeriods[retention];
    const { recordings } = get().recording;
    
    let deletedCount = 0;
    
    for (const [id, recording] of Object.entries(recordings)) {
      if (recording.createdAt.getTime() < cutoffTime) {
        await get().deleteRecording(id);
        deletedCount++;
      }
    }
    
    return deletedCount;
  },
  
  compressRecording: async (id, quality = 'medium') => {
    try {
      const recording = get().recording.recordings[id];
      if (!recording) return false;
      
      get().updateRecording(id, { status: 'processing' });
      
      // Simulate compression
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const compressionRatios = { low: 0.3, medium: 0.5, high: 0.7, lossless: 1.0 };
      const newSize = recording.size * compressionRatios[quality];
      
      get().updateRecording(id, {
        status: 'ready',
        quality,
        size: newSize,
        metadata: {
          ...recording.metadata,
          compressedSize: newSize,
          compressionRatio: compressionRatios[quality]
        }
      });
      
      return true;
    } catch (error) {
      console.error('Failed to compress recording:', error);
      return false;
    }
  },
  
  // Export and sharing
  exportRecording: async (id, format = 'mp4') => {
    try {
      const recording = get().recording.recordings[id];
      if (!recording) return null;
      
      // Simulate export process
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Return mock export URL
      return `exports/${id}.${format}`;
    } catch (error) {
      console.error('Failed to export recording:', error);
      return null;
    }
  },
  
  shareRecording: async (id, options) => {
    try {
      const recording = get().recording.recordings[id];
      if (!recording) return null;
      
      // Generate share link with options
      const shareId = Math.random().toString(36).substr(2, 12);
      const shareUrl = `https://meetingmind.app/share/${shareId}`;
      
      // Store share configuration (would be persisted)
      console.log('Share options:', options);
      
      return shareUrl;
    } catch (error) {
      console.error('Failed to share recording:', error);
      return null;
    }
  },
  
  downloadRecording: async (id) => {
    try {
      const recording = get().recording.recordings[id];
      if (!recording) return null;
      
      // Create mock blob for download
      const blob = new Blob(['mock recording data'], { type: 'video/webm' });
      return blob;
    } catch (error) {
      console.error('Failed to download recording:', error);
      return null;
    }
  },
  
  // Playback control
  playRecording: (id, startTime = 0) => {
    const recording = get().recording.recordings[id];
    if (!recording) return;
    
    // Playback logic would be implemented with video/audio elements
    console.log(`Playing recording ${id} from ${startTime}ms`);
  },
  
  pausePlayback: () => {
    console.log('Pausing playback');
  },
  
  seekTo: (time) => {
    console.log(`Seeking to ${time}ms`);
  },
  
  setPlaybackSpeed: (speed) => {
    console.log(`Setting playback speed to ${speed}x`);
  },
  
  // Analytics
  getRecordingAnalytics: (id) => {
    const recording = get().recording.recordings[id];
    if (!recording) return null;
    
    return {
      recordingId: id,
      duration: recording.duration,
      fileSize: recording.size,
      quality: recording.quality,
      compressionRatio: recording.metadata.compressionRatio || 1,
      chapters: recording.chapters?.length || 0,
      viewCount: Math.floor(Math.random() * 100), // Mock
      lastViewed: new Date()
    };
  },
  
  getStorageAnalytics: () => {
    const { recordings } = get().recording;
    const recordingList = Object.values(recordings);
    
    const totalRecordings = recordingList.length;
    const totalSize = recordingList.reduce((sum, r) => sum + r.size, 0);
    const averageSize = totalSize / Math.max(totalRecordings, 1);
    
    const byQuality = recordingList.reduce((acc, r) => {
      acc[r.quality] = (acc[r.quality] || 0) + 1;
      return acc;
    }, {} as Record<RecordingData['quality'], number>);
    
    const byFormat = recordingList.reduce((acc, r) => {
      acc[r.format] = (acc[r.format] || 0) + 1;
      return acc;
    }, {} as Record<RecordingData['format'], number>);
    
    const dates = recordingList.map(r => r.createdAt);
    const oldestRecording = dates.length > 0 ? new Date(Math.min(...dates.map(d => d.getTime()))) : undefined;
    const newestRecording = dates.length > 0 ? new Date(Math.max(...dates.map(d => d.getTime()))) : undefined;
    
    return {
      totalRecordings,
      totalSize,
      averageSize,
      byQuality,
      byFormat,
      oldestRecording,
      newestRecording
    };
  },
  
  // Cleanup
  cleanup: () => {
    // Stop any active recording
    if (get().recording.isRecording) {
      get().stopRecording();
    }
    
    // Reset state
    set(produce((state: AppState) => {
      state.recording = { ...defaultRecordingState };
    }));
  }
});