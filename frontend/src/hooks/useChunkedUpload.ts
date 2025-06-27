// Chunked Upload System for Large Media Files
// Provides resilient, resumable upload capabilities with progress tracking and error recovery

import { useState, useRef, useCallback } from 'react';

export interface UploadChunk {
  id: string;
  data: Blob;
  start: number;
  end: number;
  size: number;
  index: number;
  hash?: string; // For integrity checking
}

export interface UploadProgress {
  uploadedBytes: number;
  totalBytes: number;
  percentage: number;
  chunksUploaded: number;
  totalChunks: number;
  speed: number; // bytes per second
  eta: number; // estimated time remaining in seconds
}

export interface UploadSession {
  sessionId: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  chunkSize: number;
  totalChunks: number;
  uploadedChunks: Set<number>;
  createdAt: Date;
  lastActivity: Date;
}

export interface ChunkedUploadConfig {
  chunkSize?: number; // Default: 1MB
  maxConcurrentUploads?: number; // Default: 3
  retryAttempts?: number; // Default: 3
  retryDelay?: number; // Default: 1000ms
  endpoint: string;
  headers?: Record<string, string>;
  onProgress?: (progress: UploadProgress) => void;
  onChunkComplete?: (chunkIndex: number) => void;
  onError?: (error: Error, chunkIndex?: number) => void;
  onComplete?: (sessionId: string, url?: string) => void;
  validateChunks?: boolean; // Enable chunk integrity validation
}

export interface UseChunkedUploadReturn {
  // Upload state
  isUploading: boolean;
  isPaused: boolean;
  progress: UploadProgress | null;
  error: string | null;
  session: UploadSession | null;
  
  // Upload controls
  startUpload: (file: File | Blob, fileName: string, config: ChunkedUploadConfig) => Promise<void>;
  pauseUpload: () => void;
  resumeUpload: () => void;
  cancelUpload: () => void;
  retryFailedChunks: () => Promise<void>;
  
  // Session management
  resumeSession: (sessionId: string, config: ChunkedUploadConfig) => Promise<void>;
  clearSession: () => void;
  
  // Utilities
  clearError: () => void;
}

/**
 * Storage Strategy for Large Media Files:
 * 
 * 1. Client-Side Chunking:
 *    - Split large files into manageable chunks (default 1MB)
 *    - Generate unique chunk IDs and calculate hashes for integrity
 *    - Store upload progress in localStorage for resumability
 * 
 * 2. Upload Strategy:
 *    - Parallel uploads with configurable concurrency limits
 *    - Automatic retry logic with exponential backoff
 *    - Resume capability using stored session data
 * 
 * 3. Server-Side Handling (Backend Requirements):
 *    - Endpoint should accept: sessionId, chunkIndex, chunkData, hash
 *    - Temporary storage for chunks until assembly
 *    - Final assembly and validation of complete file
 *    - Cleanup of temporary chunks after successful assembly
 * 
 * 4. Error Recovery:
 *    - Failed chunks are tracked and can be retried individually
 *    - Network interruptions don't lose progress
 *    - Integrity validation ensures data consistency
 */

export const useChunkedUpload = (): UseChunkedUploadReturn => {
  // Core upload state
  const [isUploading, setIsUploading] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<UploadSession | null>(null);
  
  // Upload tracking refs
  const uploadConfigRef = useRef<ChunkedUploadConfig | null>(null);
  const chunksRef = useRef<UploadChunk[]>([]);
  const failedChunksRef = useRef<Set<number>>(new Set());
  const activeUploadsRef = useRef<Map<number, AbortController>>(new Map());
  const uploadStartTimeRef = useRef<number>(0);
  const lastProgressTimeRef = useRef<number>(0);
  const lastUploadedBytesRef = useRef<number>(0);

  // Generate chunk hash for integrity validation
  const generateChunkHash = useCallback(async (chunk: Blob): Promise<string> => {
    const arrayBuffer = await chunk.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }, []);

  // Create upload chunks from file
  const createChunks = useCallback(async (
    file: File | Blob, 
    chunkSize: number,
    validateChunks: boolean = false
  ): Promise<UploadChunk[]> => {
    const chunks: UploadChunk[] = [];
    const totalChunks = Math.ceil(file.size / chunkSize);
    
    for (let i = 0; i < totalChunks; i++) {
      const start = i * chunkSize;
      const end = Math.min(start + chunkSize, file.size);
      const chunkBlob = file.slice(start, end);
      
      const chunk: UploadChunk = {
        id: `chunk_${i}_${Date.now()}`,
        data: chunkBlob,
        start,
        end,
        size: chunkBlob.size,
        index: i,
      };
      
      // Generate hash for validation if enabled
      if (validateChunks) {
        chunk.hash = await generateChunkHash(chunkBlob);
      }
      
      chunks.push(chunk);
    }
    
    return chunks;
  }, [generateChunkHash]);

  // Calculate upload progress and speed
  const updateProgress = useCallback(() => {
    if (!session || !chunksRef.current.length) return;
    
    const now = Date.now();
    const uploadedChunks = session.uploadedChunks.size;
    const uploadedBytes = Array.from(session.uploadedChunks)
      .reduce((total, chunkIndex) => {
        const chunk = chunksRef.current[chunkIndex];
        return total + (chunk?.size || 0);
      }, 0);
    
    // Calculate upload speed
    let speed = 0;
    if (lastProgressTimeRef.current > 0) {
      const timeElapsed = (now - lastProgressTimeRef.current) / 1000; // seconds
      const bytesUploaded = uploadedBytes - lastUploadedBytesRef.current;
      speed = timeElapsed > 0 ? bytesUploaded / timeElapsed : 0;
    }
    
    // Calculate ETA
    const remainingBytes = session.fileSize - uploadedBytes;
    const eta = speed > 0 ? remainingBytes / speed : 0;
    
    const progressData: UploadProgress = {
      uploadedBytes,
      totalBytes: session.fileSize,
      percentage: (uploadedBytes / session.fileSize) * 100,
      chunksUploaded: uploadedChunks,
      totalChunks: session.totalChunks,
      speed,
      eta,
    };
    
    setProgress(progressData);
    uploadConfigRef.current?.onProgress?.(progressData);
    
    // Update tracking variables
    lastProgressTimeRef.current = now;
    lastUploadedBytesRef.current = uploadedBytes;
  }, [session]);

  // Upload individual chunk with retry logic
  const uploadChunk = useCallback(async (
    chunk: UploadChunk,
    config: ChunkedUploadConfig
  ): Promise<void> => {
    const maxRetries = config.retryAttempts || 3;
    const retryDelay = config.retryDelay || 1000;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const abortController = new AbortController();
      activeUploadsRef.current.set(chunk.index, abortController);
      
      try {
        // Prepare form data for chunk upload
        const formData = new FormData();
        formData.append('sessionId', session!.sessionId);
        formData.append('chunkIndex', chunk.index.toString());
        formData.append('chunkData', chunk.data);
        formData.append('chunkSize', chunk.size.toString());
        
        if (chunk.hash) {
          formData.append('hash', chunk.hash);
        }
        
        // Upload chunk
        const response = await fetch(`${config.endpoint}/upload-chunk`, {
          method: 'POST',
          headers: config.headers,
          body: formData,
          signal: abortController.signal,
        });
        
        if (!response.ok) {
          throw new Error(`Chunk upload failed: ${response.statusText}`);
        }
        
        // Mark chunk as uploaded
        setSession(prev => {
          if (!prev) return prev;
          const newUploadedChunks = new Set(prev.uploadedChunks);
          newUploadedChunks.add(chunk.index);
          
          return {
            ...prev,
            uploadedChunks: newUploadedChunks,
            lastActivity: new Date(),
          };
        });
        
        // Remove from failed chunks if it was there
        failedChunksRef.current.delete(chunk.index);
        
        config.onChunkComplete?.(chunk.index);
        updateProgress();
        
        // Save session to localStorage for resumability
        if (session) {
          localStorage.setItem(`upload_session_${session.sessionId}`, JSON.stringify({
            ...session,
            uploadedChunks: Array.from(session.uploadedChunks),
          }));
        }
        
        return; // Success, exit retry loop
        
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          throw err; // Don't retry if aborted
        }
        
        if (attempt === maxRetries) {
          // Final attempt failed
          failedChunksRef.current.add(chunk.index);
          throw new Error(`Chunk ${chunk.index} failed after ${maxRetries + 1} attempts: ${err}`);
        }
        
        // Wait before retry with exponential backoff
        await new Promise(resolve => setTimeout(resolve, retryDelay * Math.pow(2, attempt)));
      } finally {
        activeUploadsRef.current.delete(chunk.index);
      }
    }
  }, [session, updateProgress]);

  // Upload chunks with concurrency control
  const uploadChunksConcurrently = useCallback(async (
    chunks: UploadChunk[],
    config: ChunkedUploadConfig
  ): Promise<void> => {
    const maxConcurrency = config.maxConcurrentUploads || 3;
    const pendingChunks = chunks.filter(chunk => 
      !session?.uploadedChunks.has(chunk.index) && 
      !failedChunksRef.current.has(chunk.index)
    );
    
    const uploadPromises: Promise<void>[] = [];
    
    for (let i = 0; i < pendingChunks.length; i++) {
      const chunk = pendingChunks[i];
      
      const uploadPromise = uploadChunk(chunk, config).catch(err => {
        config.onError?.(err, chunk.index);
        throw err;
      });
      
      uploadPromises.push(uploadPromise);
      
      // Control concurrency
      if (uploadPromises.length >= maxConcurrency || i === pendingChunks.length - 1) {
        try {
          await Promise.allSettled(uploadPromises);
        } catch (err) {
          // Individual chunk errors are handled in uploadChunk
        }
        uploadPromises.length = 0; // Clear completed promises
        
        // Check if upload was paused or cancelled
        if (isPaused || !isUploading) {
          return;
        }
      }
    }
  }, [session, uploadChunk, isPaused, isUploading]);

  // Finalize upload by assembling chunks on server
  const finalizeUpload = useCallback(async (config: ChunkedUploadConfig): Promise<void> => {
    if (!session) return;
    
    try {
      const response = await fetch(`${config.endpoint}/finalize-upload`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...config.headers,
        },
        body: JSON.stringify({
          sessionId: session.sessionId,
          fileName: session.fileName,
          fileSize: session.fileSize,
          fileType: session.fileType,
          totalChunks: session.totalChunks,
        }),
      });
      
      if (!response.ok) {
        throw new Error(`Finalization failed: ${response.statusText}`);
      }
      
      const result = await response.json();
      
      // Cleanup session data
      localStorage.removeItem(`upload_session_${session.sessionId}`);
      
      config.onComplete?.(session.sessionId, result.url);
      
    } catch (err) {
      throw new Error(`Upload finalization failed: ${(err as Error).message}`);
    }
  }, [session]);

  // Start new upload
  const startUpload = useCallback(async (
    file: File | Blob,
    fileName: string,
    config: ChunkedUploadConfig
  ): Promise<void> => {
    try {
      setError(null);
      setIsUploading(true);
      setIsPaused(false);
      uploadConfigRef.current = config;
      
      const chunkSize = config.chunkSize || 1024 * 1024; // 1MB default
      const validateChunks = config.validateChunks || false;
      
      // Create chunks
      const chunks = await createChunks(file, chunkSize, validateChunks);
      chunksRef.current = chunks;
      
      // Create upload session
      const sessionId = `upload_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const newSession: UploadSession = {
        sessionId,
        fileName,
        fileSize: file.size,
        fileType: file instanceof File ? file.type : 'application/octet-stream',
        chunkSize,
        totalChunks: chunks.length,
        uploadedChunks: new Set(),
        createdAt: new Date(),
        lastActivity: new Date(),
      };
      
      setSession(newSession);
      
      // Initialize progress tracking
      uploadStartTimeRef.current = Date.now();
      lastProgressTimeRef.current = 0;
      lastUploadedBytesRef.current = 0;
      updateProgress();
      
      // Start upload process
      await uploadChunksConcurrently(chunks, config);
      
      // Check if all chunks uploaded successfully
      if (newSession.uploadedChunks.size === chunks.length && failedChunksRef.current.size === 0) {
        await finalizeUpload(config);
      } else if (failedChunksRef.current.size > 0) {
        throw new Error(`Upload incomplete: ${failedChunksRef.current.size} chunks failed`);
      }
      
    } catch (err) {
      setError((err as Error).message);
      config.onError?.(err as Error);
    } finally {
      setIsUploading(false);
    }
  }, [createChunks, updateProgress, uploadChunksConcurrently, finalizeUpload]);

  // Pause upload
  const pauseUpload = useCallback(() => {
    setIsPaused(true);
    
    // Abort active uploads
    activeUploadsRef.current.forEach(controller => {
      controller.abort();
    });
    activeUploadsRef.current.clear();
  }, []);

  // Resume upload
  const resumeUpload = useCallback(async () => {
    if (!uploadConfigRef.current || !chunksRef.current.length) return;
    
    setIsPaused(false);
    setError(null);
    
    try {
      await uploadChunksConcurrently(chunksRef.current, uploadConfigRef.current);
      
      if (session && session.uploadedChunks.size === chunksRef.current.length) {
        await finalizeUpload(uploadConfigRef.current);
      }
    } catch (err) {
      setError((err as Error).message);
      uploadConfigRef.current?.onError?.(err as Error);
    }
  }, [uploadChunksConcurrently, finalizeUpload, session]);

  // Cancel upload
  const cancelUpload = useCallback(() => {
    setIsUploading(false);
    setIsPaused(false);
    
    // Abort all active uploads
    activeUploadsRef.current.forEach(controller => {
      controller.abort();
    });
    activeUploadsRef.current.clear();
    
    // Cleanup session data
    if (session) {
      localStorage.removeItem(`upload_session_${session.sessionId}`);
    }
    
    // Reset state
    setSession(null);
    setProgress(null);
    chunksRef.current = [];
    failedChunksRef.current.clear();
  }, [session]);

  // Retry failed chunks
  const retryFailedChunks = useCallback(async (): Promise<void> => {
    if (!uploadConfigRef.current || failedChunksRef.current.size === 0) return;
    
    setError(null);
    
    const failedChunks = chunksRef.current.filter(chunk => 
      failedChunksRef.current.has(chunk.index)
    );
    
    failedChunksRef.current.clear();
    
    try {
      await uploadChunksConcurrently(failedChunks, uploadConfigRef.current);
      
      if (session && session.uploadedChunks.size === chunksRef.current.length) {
        await finalizeUpload(uploadConfigRef.current);
      }
    } catch (err) {
      setError((err as Error).message);
      uploadConfigRef.current?.onError?.(err as Error);
    }
  }, [uploadChunksConcurrently, finalizeUpload, session]);

  // Resume from stored session
  const resumeSession = useCallback(async (
    sessionId: string,
    config: ChunkedUploadConfig
  ): Promise<void> => {
    try {
      const storedSession = localStorage.getItem(`upload_session_${sessionId}`);
      if (!storedSession) {
        throw new Error('Session not found');
      }
      
      const sessionData = JSON.parse(storedSession);
      const restoredSession: UploadSession = {
        ...sessionData,
        uploadedChunks: new Set(sessionData.uploadedChunks),
        createdAt: new Date(sessionData.createdAt),
        lastActivity: new Date(sessionData.lastActivity),
      };
      
      setSession(restoredSession);
      uploadConfigRef.current = config;
      
      // Note: Chunks would need to be recreated from the original file
      // This is a limitation - we'd need to store chunk data or regenerate
      console.warn('Session resumed, but chunks need to be recreated from original file');
      
    } catch (err) {
      setError(`Failed to resume session: ${(err as Error).message}`);
    }
  }, []);

  // Clear session
  const clearSession = useCallback(() => {
    if (session) {
      localStorage.removeItem(`upload_session_${session.sessionId}`);
    }
    setSession(null);
    setProgress(null);
    chunksRef.current = [];
    failedChunksRef.current.clear();
  }, [session]);

  // Clear error
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    // Upload state
    isUploading,
    isPaused,
    progress,
    error,
    session,
    
    // Upload controls
    startUpload,
    pauseUpload,
    resumeUpload,
    cancelUpload,
    retryFailedChunks,
    
    // Session management
    resumeSession,
    clearSession,
    
    // Utilities
    clearError,
  };
};