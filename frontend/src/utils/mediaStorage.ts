// Media Storage Management Utilities
// Comprehensive file management system for audio/video recordings with optimization strategies

/**
 * Media Storage Architecture:
 * 
 * 1. Storage Tiers:
 *    - Hot Storage: Recently accessed files (local cache + fast CDN)
 *    - Warm Storage: Frequently accessed files (standard cloud storage)
 *    - Cold Storage: Archive files (long-term, cost-effective storage)
 * 
 * 2. File Management:
 *    - Automatic compression and format optimization
 *    - Progressive download with adaptive bitrates
 *    - Intelligent caching based on usage patterns
 *    - Automatic cleanup of temporary files
 * 
 * 3. Performance Optimization:
 *    - Lazy loading for large media libraries
 *    - Background prefetching of likely-to-be-accessed files
 *    - Bandwidth-aware quality adjustment
 *    - Efficient metadata indexing
 * 
 * 4. Data Integrity:
 *    - Checksum validation for uploads/downloads
 *    - Redundant storage with automatic failover
 *    - Version control for file revisions
 *    - Backup and disaster recovery
 */

export interface MediaFile {
  id: string;
  fileName: string;
  originalFileName: string;
  fileSize: number;
  duration: number;
  mimeType: string;
  quality: 'low' | 'medium' | 'high' | 'original';
  format: string;
  urls: {
    original: string;
    optimized?: string;
    thumbnail?: string;
    waveform?: string;
  };
  metadata: {
    bitrate?: number;
    sampleRate?: number;
    channels?: number;
    codec?: string;
    resolution?: string;
    frameRate?: number;
  };
  transcriptionStatus: 'pending' | 'processing' | 'completed' | 'failed';
  transcriptionId?: string;
  uploadedAt: Date;
  lastAccessed: Date;
  accessCount: number;
  storageClass: 'hot' | 'warm' | 'cold';
  tags: string[];
  checksum: string;
}

export interface StorageQuota {
  used: number;
  available: number;
  total: number;
  quotaReached: boolean;
  estimatedDaysRemaining?: number;
}

export interface CacheEntry {
  fileId: string;
  blob: Blob;
  url: string;
  lastAccessed: Date;
  size: number;
  quality: string;
}

export interface UploadPolicy {
  maxFileSize: number; // bytes
  allowedFormats: string[];
  compressionEnabled: boolean;
  autoTranscription: boolean;
  retentionDays?: number;
  storageClass: 'hot' | 'warm' | 'cold';
}

export interface DownloadOptions {
  quality?: 'low' | 'medium' | 'high' | 'original';
  preferCache?: boolean;
  preloadNext?: boolean;
  onProgress?: (progress: number) => void;
}

class MediaStorageManager {
  private cache = new Map<string, CacheEntry>();
  private readonly maxCacheSize = 500 * 1024 * 1024; // 500MB
  private readonly maxCacheAge = 24 * 60 * 60 * 1000; // 24 hours
  private compressionWorker: Worker | null = null;
  
  private baseUrl: string;
  private apiKey?: string;
  
  constructor(baseUrl: string, apiKey?: string) {
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
    this.initializeCompressionWorker();
    this.startCacheCleanup();
  }

  /**
   * Initialize Web Worker for media compression
   */
  private initializeCompressionWorker(): void {
    this.compressionWorker = new Worker(
      URL.createObjectURL(new Blob([`
        // Media Compression Web Worker
        importScripts('https://cdn.jsdelivr.net/npm/ffmpeg.wasm@0.11.6/dist/ffmpeg.min.js');
        
        let ffmpeg;
        
        self.onmessage = async function(e) {
          const { type, data } = e.data;
          
          try {
            if (type === 'init') {
              const { createFFmpeg, fetchFile } = FFmpeg;
              ffmpeg = createFFmpeg({ 
                log: false,
                corePath: 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.11.0/dist/ffmpeg-core.js'
              });
              await ffmpeg.load();
              self.postMessage({ type: 'ready' });
              
            } else if (type === 'compress') {
              const { file, options } = data;
              
              // Write input file
              const fileData = await fetchFile(file);
              ffmpeg.FS('writeFile', 'input.webm', fileData);
              
              // Compression command based on options
              let command = ['-i', 'input.webm'];
              
              if (options.quality === 'low') {
                command.push('-b:a', '64k', '-b:v', '500k');
              } else if (options.quality === 'medium') {
                command.push('-b:a', '128k', '-b:v', '1000k');
              } else if (options.quality === 'high') {
                command.push('-b:a', '192k', '-b:v', '2000k');
              }
              
              command.push('-c:v', 'libx264', '-preset', 'fast');
              command.push('-movflags', '+faststart'); // Web optimization
              command.push('output.mp4');
              
              await ffmpeg.run(...command);
              
              // Read output file
              const data = ffmpeg.FS('readFile', 'output.mp4');
              const compressedBlob = new Blob([data.buffer], { type: 'video/mp4' });
              
              self.postMessage({
                type: 'compressed',
                data: compressedBlob,
                originalSize: file.size,
                compressedSize: compressedBlob.size
              });
              
              // Cleanup
              ffmpeg.FS('unlink', 'input.webm');
              ffmpeg.FS('unlink', 'output.mp4');
            }
          } catch (error) {
            self.postMessage({ type: 'error', error: error.message });
          }
        };
      `], { type: 'application/javascript' }))
    );
  }

  /**
   * Start automatic cache cleanup
   */
  private startCacheCleanup(): void {
    setInterval(() => {
      this.cleanupCache();
    }, 60 * 60 * 1000); // Every hour
  }

  /**
   * Calculate storage quota usage
   */
  async getStorageQuota(): Promise<StorageQuota> {
    try {
      const response = await fetch(`${this.baseUrl}/storage/quota`, {
        headers: this.getAuthHeaders(),
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch storage quota');
      }
      
      return await response.json();
    } catch (error) {
      console.error('Storage quota check failed:', error);
      return {
        used: 0,
        available: 0,
        total: 0,
        quotaReached: false,
      };
    }
  }

  /**
   * Upload media file with optional compression
   */
  async uploadFile(
    file: File,
    policy: UploadPolicy
  ): Promise<MediaFile> {
    // Validate file
    this.validateFile(file, policy);
    
    let fileToUpload = file;
    
    // Compress if enabled and file is large
    if (policy.compressionEnabled && file.size > 10 * 1024 * 1024) { // 10MB
      fileToUpload = await this.compressFile(file, 'medium');
    }
    
    // Calculate checksum
    const checksum = await this.calculateChecksum(fileToUpload);
    
    // Create form data
    const formData = new FormData();
    formData.append('file', fileToUpload);
    formData.append('originalName', file.name);
    formData.append('checksum', checksum);
    formData.append('storageClass', policy.storageClass);
    formData.append('autoTranscription', policy.autoTranscription.toString());
    
    if (policy.retentionDays) {
      formData.append('retentionDays', policy.retentionDays.toString());
    }
    
    try {
      const response = await fetch(`${this.baseUrl}/media/upload`, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: formData,
      });
      
      if (!response.ok) {
        throw new Error(`Upload failed: ${response.statusText}`);
      }
      
      const mediaFile: MediaFile = await response.json();
      
      // Cache the file if it's small enough
      if (fileToUpload.size < 50 * 1024 * 1024) { // 50MB
        this.addToCache(mediaFile.id, fileToUpload, 'original');
      }
      
      return mediaFile;
    } catch (error) {
      console.error('File upload failed:', error);
      throw error;
    }
  }

  /**
   * Download media file with caching
   */
  async downloadFile(
    fileId: string,
    options: DownloadOptions = {}
  ): Promise<Blob> {
    const quality = options.quality || 'medium';
    const cacheKey = `${fileId}_${quality}`;
    
    // Check cache first
    if (options.preferCache !== false) {
      const cached = this.cache.get(cacheKey);
      if (cached && !this.isCacheExpired(cached)) {
        cached.lastAccessed = new Date();
        return cached.blob;
      }
    }
    
    try {
      // Get file metadata
      const fileInfo = await this.getFileInfo(fileId);
      
      // Determine download URL based on quality
      let downloadUrl = fileInfo.urls.original;
      if (quality !== 'original' && fileInfo.urls.optimized) {
        downloadUrl = fileInfo.urls.optimized;
      }
      
      // Download with progress tracking
      const response = await fetch(downloadUrl, {
        headers: this.getAuthHeaders(),
      });
      
      if (!response.ok) {
        throw new Error(`Download failed: ${response.statusText}`);
      }
      
      const contentLength = response.headers.get('content-length');
      const total = contentLength ? parseInt(contentLength, 10) : 0;
      let loaded = 0;
      
      const reader = response.body?.getReader();
      if (!reader) throw new Error('Failed to read response body');
      
      const chunks: Uint8Array[] = [];
      
      while (true) {
        const { done, value } = await reader.read();
        
        if (done) break;
        
        chunks.push(value);
        loaded += value.length;
        
        if (options.onProgress && total > 0) {
          options.onProgress((loaded / total) * 100);
        }
      }
      
      // Combine chunks into blob
      const blob = new Blob(chunks, { type: fileInfo.mimeType });
      
      // Add to cache
      this.addToCache(fileId, blob, quality);
      
      // Update access statistics
      this.updateAccessStats(fileId);
      
      // Preload next file if requested
      if (options.preloadNext) {
        // Implementation would depend on context (playlist, sequence, etc.)
      }
      
      return blob;
    } catch (error) {
      console.error('File download failed:', error);
      throw error;
    }
  }

  /**
   * Get file information
   */
  async getFileInfo(fileId: string): Promise<MediaFile> {
    const response = await fetch(`${this.baseUrl}/media/${fileId}`, {
      headers: this.getAuthHeaders(),
    });
    
    if (!response.ok) {
      throw new Error(`Failed to get file info: ${response.statusText}`);
    }
    
    return await response.json();
  }

  /**
   * List media files with filtering and pagination
   */
  async listFiles(params: {
    page?: number;
    limit?: number;
    type?: 'audio' | 'video';
    tags?: string[];
    sortBy?: 'date' | 'name' | 'size' | 'duration';
    sortOrder?: 'asc' | 'desc';
  } = {}): Promise<{
    files: MediaFile[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    const searchParams = new URLSearchParams();
    
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) {
        if (Array.isArray(value)) {
          searchParams.append(key, value.join(','));
        } else {
          searchParams.append(key, value.toString());
        }
      }
    });
    
    const response = await fetch(`${this.baseUrl}/media?${searchParams}`, {
      headers: this.getAuthHeaders(),
    });
    
    if (!response.ok) {
      throw new Error(`Failed to list files: ${response.statusText}`);
    }
    
    return await response.json();
  }

  /**
   * Delete media file
   */
  async deleteFile(fileId: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/media/${fileId}`, {
      method: 'DELETE',
      headers: this.getAuthHeaders(),
    });
    
    if (!response.ok) {
      throw new Error(`Failed to delete file: ${response.statusText}`);
    }
    
    // Remove from cache
    this.removeFromCache(fileId);
  }

  /**
   * Generate waveform data for audio file
   */
  async generateWaveform(fileId: string): Promise<number[]> {
    const response = await fetch(`${this.baseUrl}/media/${fileId}/waveform`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
    });
    
    if (!response.ok) {
      throw new Error(`Failed to generate waveform: ${response.statusText}`);
    }
    
    const { waveformData } = await response.json();
    return waveformData;
  }

  /**
   * Get transcription for media file
   */
  async getTranscription(fileId: string): Promise<Array<{ timestamp: number; text: string; speaker?: string }>> {
    const response = await fetch(`${this.baseUrl}/media/${fileId}/transcription`, {
      headers: this.getAuthHeaders(),
    });
    
    if (!response.ok) {
      throw new Error(`Failed to get transcription: ${response.statusText}`);
    }
    
    return await response.json();
  }

  /**
   * Update file metadata
   */
  async updateFileMetadata(
    fileId: string,
    metadata: Partial<Pick<MediaFile, 'tags' | 'fileName'>>
  ): Promise<MediaFile> {
    const response = await fetch(`${this.baseUrl}/media/${fileId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...this.getAuthHeaders(),
      },
      body: JSON.stringify(metadata),
    });
    
    if (!response.ok) {
      throw new Error(`Failed to update metadata: ${response.statusText}`);
    }
    
    return await response.json();
  }

  /**
   * Compress media file
   */
  private async compressFile(file: File, quality: 'low' | 'medium' | 'high'): Promise<File> {
    return new Promise((resolve, reject) => {
      if (!this.compressionWorker) {
        reject(new Error('Compression worker not available'));
        return;
      }
      
      this.compressionWorker.onmessage = (e) => {
        const { type, data, error } = e.data;
        
        if (type === 'compressed') {
          const compressedFile = new File([data], file.name, {
            type: 'video/mp4',
            lastModified: file.lastModified,
          });
          resolve(compressedFile);
        } else if (type === 'error') {
          reject(new Error(error));
        }
      };
      
      this.compressionWorker.postMessage({
        type: 'compress',
        data: { file, options: { quality } },
      });
    });
  }

  /**
   * Calculate file checksum
   */
  private async calculateChecksum(file: File): Promise<string> {
    const arrayBuffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Validate file against upload policy
   */
  private validateFile(file: File, policy: UploadPolicy): void {
    if (file.size > policy.maxFileSize) {
      throw new Error(`File size exceeds limit of ${policy.maxFileSize} bytes`);
    }
    
    if (!policy.allowedFormats.includes(file.type)) {
      throw new Error(`File type ${file.type} is not allowed`);
    }
  }

  /**
   * Add file to cache
   */
  private addToCache(fileId: string, blob: Blob, quality: string): void {
    const cacheKey = `${fileId}_${quality}`;
    
    // Check if we need to make space
    this.ensureCacheSpace(blob.size);
    
    const entry: CacheEntry = {
      fileId,
      blob,
      url: URL.createObjectURL(blob),
      lastAccessed: new Date(),
      size: blob.size,
      quality,
    };
    
    this.cache.set(cacheKey, entry);
  }

  /**
   * Remove file from cache
   */
  private removeFromCache(fileId: string): void {
    for (const [key, entry] of this.cache.entries()) {
      if (entry.fileId === fileId) {
        URL.revokeObjectURL(entry.url);
        this.cache.delete(key);
      }
    }
  }

  /**
   * Check if cache entry is expired
   */
  private isCacheExpired(entry: CacheEntry): boolean {
    return Date.now() - entry.lastAccessed.getTime() > this.maxCacheAge;
  }

  /**
   * Ensure there's enough space in cache
   */
  private ensureCacheSpace(requiredSize: number): void {
    let currentSize = Array.from(this.cache.values())
      .reduce((total, entry) => total + entry.size, 0);
    
    if (currentSize + requiredSize <= this.maxCacheSize) return;
    
    // Remove oldest entries until we have space
    const entries = Array.from(this.cache.entries())
      .sort(([, a], [, b]) => a.lastAccessed.getTime() - b.lastAccessed.getTime());
    
    for (const [key, entry] of entries) {
      URL.revokeObjectURL(entry.url);
      this.cache.delete(key);
      currentSize -= entry.size;
      
      if (currentSize + requiredSize <= this.maxCacheSize) break;
    }
  }

  /**
   * Clean up expired cache entries
   */
  private cleanupCache(): void {
    for (const [key, entry] of this.cache.entries()) {
      if (this.isCacheExpired(entry)) {
        URL.revokeObjectURL(entry.url);
        this.cache.delete(key);
      }
    }
  }

  /**
   * Update file access statistics
   */
  private async updateAccessStats(fileId: string): Promise<void> {
    try {
      await fetch(`${this.baseUrl}/media/${fileId}/access`, {
        method: 'POST',
        headers: this.getAuthHeaders(),
      });
    } catch (error) {
      console.warn('Failed to update access stats:', error);
    }
  }

  /**
   * Get authentication headers
   */
  private getAuthHeaders(): Record<string, string> {
    const headers: Record<string, string> = {};
    
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }
    
    return headers;
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    // Cleanup cache
    for (const entry of this.cache.values()) {
      URL.revokeObjectURL(entry.url);
    }
    this.cache.clear();
    
    // Terminate worker
    if (this.compressionWorker) {
      this.compressionWorker.terminate();
      this.compressionWorker = null;
    }
  }
}

// Default storage policies
export const StoragePolicies = {
  meeting: {
    maxFileSize: 500 * 1024 * 1024, // 500MB
    allowedFormats: ['audio/webm', 'video/webm', 'audio/wav', 'video/mp4'],
    compressionEnabled: true,
    autoTranscription: true,
    retentionDays: 365,
    storageClass: 'warm' as const,
  },
  lecture: {
    maxFileSize: 2 * 1024 * 1024 * 1024, // 2GB
    allowedFormats: ['audio/webm', 'video/webm', 'audio/wav', 'video/mp4'],
    compressionEnabled: true,
    autoTranscription: true,
    retentionDays: 1095, // 3 years
    storageClass: 'cold' as const,
  },
  interview: {
    maxFileSize: 1024 * 1024 * 1024, // 1GB
    allowedFormats: ['audio/webm', 'video/webm', 'audio/wav'],
    compressionEnabled: false, // Preserve quality
    autoTranscription: true,
    retentionDays: 2555, // 7 years (legal requirement)
    storageClass: 'warm' as const,
  },
} as const;

// Singleton instance
let storageManager: MediaStorageManager | null = null;

export function getStorageManager(baseUrl?: string, apiKey?: string): MediaStorageManager {
  if (!storageManager) {
    storageManager = new MediaStorageManager(
      baseUrl || process.env.REACT_APP_API_BASE_URL || 'http://localhost:8000',
      apiKey || process.env.REACT_APP_API_KEY
    );
  }
  return storageManager;
}

export { MediaStorageManager };