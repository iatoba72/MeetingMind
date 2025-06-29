// Advanced Caching System for MeetingMind
// Multi-level caching with automatic invalidation and performance optimization

export interface TranscriptSegment {
  id: string;
  text: string;
  start: number;
  end: number;
  speaker?: string;
  confidence: number;
}

export interface Meeting {
  id: string;
  title: string;
  start_time: string;
  end_time?: string;
  participants: string[];
  status: 'scheduled' | 'active' | 'completed' | 'cancelled';
  transcript_id?: string;
  metadata?: Record<string, unknown>;
}

export interface MeetingFilters {
  status?: Meeting['status'];
  dateFrom?: string;
  dateTo?: string;
  participants?: string[];
  search?: string;
}

export interface APIResponse {
  data: unknown;
  status: number;
  message?: string;
  timestamp: number;
  error?: string;
}

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
  accessCount: number;
  lastAccessed: number;
  tags: string[];
  size: number;
}

interface CacheStats {
  hits: number;
  misses: number;
  evictions: number;
  size: number;
  maxSize: number;
  hitRate: number;
  avgAccessTime: number;
  memoryUsage: number;
}

interface CacheConfig {
  maxSize: number;
  defaultTTL: number;
  enableCompression: boolean;
  enablePersistence: boolean;
  evictionPolicy: 'lru' | 'lfu' | 'ttl' | 'size';
  maxMemoryUsage: number; // bytes
  persistenceKey: string;
}

class MemoryCache<T = unknown> {
  private cache = new Map<string, CacheEntry<T>>();
  private accessOrder: string[] = [];
  private stats: CacheStats;
  private config: CacheConfig;
  private compressionWorker?: Worker;

  constructor(config: Partial<CacheConfig> = {}) {
    this.config = {
      maxSize: 1000,
      defaultTTL: 5 * 60 * 1000, // 5 minutes
      enableCompression: true,
      enablePersistence: true,
      evictionPolicy: 'lru',
      maxMemoryUsage: 50 * 1024 * 1024, // 50MB
      persistenceKey: 'meetingmind_cache',
      ...config
    };

    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      size: 0,
      maxSize: this.config.maxSize,
      hitRate: 0,
      avgAccessTime: 0,
      memoryUsage: 0
    };

    this.initializeCompression();
    this.loadFromPersistence();
    this.startCleanupInterval();
  }

  async set(key: string, data: T, ttl?: number, tags: string[] = []): Promise<void> {
    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      ttl: ttl || this.config.defaultTTL,
      accessCount: 0,
      lastAccessed: Date.now(),
      tags,
      size: this.calculateSize(data)
    };

    // Check if we need to evict
    if (this.cache.size >= this.config.maxSize || 
        this.getCurrentMemoryUsage() + entry.size > this.config.maxMemoryUsage) {
      await this.evict();
    }

    this.cache.set(key, entry);
    this.updateAccessOrder(key);
    this.updateStats();
    
    if (this.config.enablePersistence) {
      this.saveToPersistence();
    }
  }

  async get(key: string): Promise<T | null> {
    const startTime = performance.now();
    const entry = this.cache.get(key);

    if (!entry) {
      this.stats.misses++;
      this.updateHitRate();
      return null;
    }

    // Check TTL
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      this.stats.misses++;
      this.updateHitRate();
      return null;
    }

    // Update access info
    entry.accessCount++;
    entry.lastAccessed = Date.now();
    this.updateAccessOrder(key);

    this.stats.hits++;
    this.updateHitRate();
    this.updateAvgAccessTime(performance.now() - startTime);

    return entry.data;
  }

  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    
    // Check TTL
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return false;
    }
    
    return true;
  }

  delete(key: string): boolean {
    const deleted = this.cache.delete(key);
    if (deleted) {
      this.removeFromAccessOrder(key);
      this.updateStats();
    }
    return deleted;
  }

  clear(): void {
    this.cache.clear();
    this.accessOrder = [];
    this.stats.size = 0;
    this.stats.memoryUsage = 0;
  }

  // Tag-based invalidation
  invalidateByTag(tag: string): number {
    let count = 0;
    for (const [key, entry] of this.cache.entries()) {
      if (entry.tags.includes(tag)) {
        this.cache.delete(key);
        this.removeFromAccessOrder(key);
        count++;
      }
    }
    this.updateStats();
    return count;
  }

  // Pattern-based invalidation
  invalidateByPattern(pattern: string | RegExp): number {
    const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;
    let count = 0;
    
    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        this.cache.delete(key);
        this.removeFromAccessOrder(key);
        count++;
      }
    }
    
    this.updateStats();
    return count;
  }

  // Batch operations
  async setMany(entries: Array<{ key: string; data: T; ttl?: number; tags?: string[] }>): Promise<void> {
    for (const entry of entries) {
      await this.set(entry.key, entry.data, entry.ttl, entry.tags);
    }
  }

  async getMany(keys: string[]): Promise<Map<string, T | null>> {
    const results = new Map<string, T | null>();
    
    for (const key of keys) {
      results.set(key, await this.get(key));
    }
    
    return results;
  }

  // Cache warming
  async warmUp(loader: (key: string) => Promise<T>, keys: string[]): Promise<void> {
    const promises = keys.map(async key => {
      if (!this.has(key)) {
        try {
          const data = await loader(key);
          await this.set(key, data);
        } catch (error) {
          console.warn(`Failed to warm cache for key ${key}:`, error);
        }
      }
    });
    
    await Promise.all(promises);
  }

  getStats(): CacheStats {
    return { ...this.stats };
  }

  // Eviction strategies
  private async evict(): Promise<void> {
    if (this.cache.size === 0) return;

    let keyToEvict: string;

    switch (this.config.evictionPolicy) {
      case 'lru':
        keyToEvict = this.accessOrder[0];
        break;
      case 'lfu':
        keyToEvict = this.findLeastFrequentlyUsed();
        break;
      case 'ttl':
        keyToEvict = this.findEarliestExpiring();
        break;
      case 'size':
        keyToEvict = this.findLargestEntry();
        break;
      default:
        keyToEvict = this.accessOrder[0]; // Default to LRU
    }

    if (keyToEvict) {
      this.cache.delete(keyToEvict);
      this.removeFromAccessOrder(keyToEvict);
      this.stats.evictions++;
    }
  }

  private findLeastFrequentlyUsed(): string {
    let minAccess = Infinity;
    let leastUsedKey = '';
    
    for (const [key, entry] of this.cache.entries()) {
      if (entry.accessCount < minAccess) {
        minAccess = entry.accessCount;
        leastUsedKey = key;
      }
    }
    
    return leastUsedKey;
  }

  private findEarliestExpiring(): string {
    let earliestExpiry = Infinity;
    let earliestKey = '';
    
    for (const [key, entry] of this.cache.entries()) {
      const expiryTime = entry.timestamp + entry.ttl;
      if (expiryTime < earliestExpiry) {
        earliestExpiry = expiryTime;
        earliestKey = key;
      }
    }
    
    return earliestKey;
  }

  private findLargestEntry(): string {
    let maxSize = 0;
    let largestKey = '';
    
    for (const [key, entry] of this.cache.entries()) {
      if (entry.size > maxSize) {
        maxSize = entry.size;
        largestKey = key;
      }
    }
    
    return largestKey;
  }

  private updateAccessOrder(key: string): void {
    this.removeFromAccessOrder(key);
    this.accessOrder.push(key);
  }

  private removeFromAccessOrder(key: string): void {
    const index = this.accessOrder.indexOf(key);
    if (index > -1) {
      this.accessOrder.splice(index, 1);
    }
  }

  private updateStats(): void {
    this.stats.size = this.cache.size;
    this.stats.memoryUsage = this.getCurrentMemoryUsage();
  }

  private updateHitRate(): void {
    const total = this.stats.hits + this.stats.misses;
    this.stats.hitRate = total > 0 ? this.stats.hits / total : 0;
  }

  private updateAvgAccessTime(accessTime: number): void {
    const total = this.stats.hits + this.stats.misses;
    this.stats.avgAccessTime = ((this.stats.avgAccessTime * (total - 1)) + accessTime) / total;
  }

  private calculateSize(data: T): number {
    // Rough estimation of object size in bytes
    try {
      return new TextEncoder().encode(JSON.stringify(data)).length;
    } catch {
      return 1000; // Default estimate for non-serializable objects
    }
  }

  private getCurrentMemoryUsage(): number {
    let totalSize = 0;
    for (const entry of this.cache.values()) {
      totalSize += entry.size;
    }
    return totalSize;
  }

  private initializeCompression(): void {
    if (this.config.enableCompression && 'Worker' in window) {
      // Initialize compression worker for large objects
      try {
        const workerCode = `
          self.onmessage = function(e) {
            const { action, data, id } = e.data;
            
            if (action === 'compress') {
              // Simple compression using JSON stringify with reduced precision
              const compressed = JSON.stringify(data, (key, value) => {
                if (typeof value === 'number') {
                  return Math.round(value * 1000) / 1000; // Reduce float precision
                }
                return value;
              });
              
              self.postMessage({ id, result: compressed });
            } else if (action === 'decompress') {
              try {
                const decompressed = JSON.parse(data);
                self.postMessage({ id, result: decompressed });
              } catch (error) {
                self.postMessage({ id, error: error.message });
              }
            }
          };
        `;
        
        const blob = new Blob([workerCode], { type: 'application/javascript' });
        this.compressionWorker = new Worker(URL.createObjectURL(blob));
      } catch (error) {
        console.warn('Compression worker initialization failed:', error);
      }
    }
  }

  private startCleanupInterval(): void {
    // Clean up expired entries every 5 minutes
    setInterval(() => {
      this.cleanup();
    }, 5 * 60 * 1000);
  }

  private cleanup(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];
    
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        keysToDelete.push(key);
      }
    }
    
    for (const key of keysToDelete) {
      this.cache.delete(key);
      this.removeFromAccessOrder(key);
    }
    
    if (keysToDelete.length > 0) {
      this.updateStats();
    }
  }

  private saveToPersistence(): void {
    if (!this.config.enablePersistence) return;
    
    try {
      const cacheData = {
        entries: Array.from(this.cache.entries()),
        accessOrder: this.accessOrder,
        stats: this.stats,
        timestamp: Date.now()
      };
      
      localStorage.setItem(this.config.persistenceKey, JSON.stringify(cacheData));
    } catch (error) {
      console.warn('Failed to save cache to localStorage:', error);
    }
  }

  private loadFromPersistence(): void {
    if (!this.config.enablePersistence) return;
    
    try {
      const cached = localStorage.getItem(this.config.persistenceKey);
      if (!cached) return;
      
      const cacheData = JSON.parse(cached);
      const now = Date.now();
      
      // Only load if cache is less than 1 hour old
      if (now - cacheData.timestamp > 60 * 60 * 1000) {
        localStorage.removeItem(this.config.persistenceKey);
        return;
      }
      
      // Restore cache entries
      for (const [key, entry] of cacheData.entries) {
        // Check if entry is still valid
        if (now - entry.timestamp < entry.ttl) {
          this.cache.set(key, entry);
        }
      }
      
      this.accessOrder = cacheData.accessOrder.filter(key => this.cache.has(key));
      this.stats = { ...this.stats, ...cacheData.stats };
      
    } catch (error) {
      console.warn('Failed to load cache from localStorage:', error);
      localStorage.removeItem(this.config.persistenceKey);
    }
  }
}

// Specialized caches for different data types
export class TranscriptCache extends MemoryCache<TranscriptSegment[]> {
  constructor() {
    super({
      maxSize: 500,
      defaultTTL: 30 * 60 * 1000, // 30 minutes
      evictionPolicy: 'lru',
      persistenceKey: 'meetingmind_transcript_cache'
    });
  }

  async cacheTranscriptSegments(meetingId: string, segments: TranscriptSegment[]): Promise<void> {
    const key = `transcript:${meetingId}`;
    await this.set(key, segments, undefined, ['transcript', meetingId]);
  }

  async getTranscriptSegments(meetingId: string): Promise<TranscriptSegment[] | null> {
    const key = `transcript:${meetingId}`;
    return await this.get(key);
  }

  invalidateMeeting(meetingId: string): void {
    this.invalidateByTag(meetingId);
  }
}

export class MeetingCache extends MemoryCache<Meeting | Meeting[]> {
  constructor() {
    super({
      maxSize: 1000,
      defaultTTL: 10 * 60 * 1000, // 10 minutes
      evictionPolicy: 'lru',
      persistenceKey: 'meetingmind_meeting_cache'
    });
  }

  async cacheMeetingList(page: number, filters: MeetingFilters, meetings: Meeting[]): Promise<void> {
    const key = `meetings:${page}:${JSON.stringify(filters)}`;
    await this.set(key, meetings, undefined, ['meetings', `page:${page}`]);
  }

  async getMeetingList(page: number, filters: MeetingFilters): Promise<Meeting[] | null> {
    const key = `meetings:${page}:${JSON.stringify(filters)}`;
    return await this.get(key);
  }

  async cacheMeetingDetails(meetingId: string, details: Meeting): Promise<void> {
    const key = `meeting:${meetingId}`;
    await this.set(key, details, undefined, ['meeting', meetingId]);
  }

  async getMeetingDetails(meetingId: string): Promise<Meeting | null> {
    const key = `meeting:${meetingId}`;
    return await this.get(key);
  }

  invalidateAllMeetings(): void {
    this.invalidateByTag('meetings');
  }
}

export class APICache extends MemoryCache<APIResponse> {
  constructor() {
    super({
      maxSize: 2000,
      defaultTTL: 5 * 60 * 1000, // 5 minutes
      evictionPolicy: 'lru',
      persistenceKey: 'meetingmind_api_cache'
    });
  }

  async cacheAPIResponse(endpoint: string, params: Record<string, unknown>, response: APIResponse, ttl?: number): Promise<void> {
    const key = `api:${endpoint}:${JSON.stringify(params)}`;
    await this.set(key, response, ttl, ['api', endpoint]);
  }

  async getAPIResponse(endpoint: string, params: Record<string, unknown>): Promise<APIResponse | null> {
    const key = `api:${endpoint}:${JSON.stringify(params)}`;
    return await this.get(key);
  }

  invalidateEndpoint(endpoint: string): void {
    this.invalidateByTag(endpoint);
  }
}

// Cache manager to coordinate multiple caches
export class CacheManager {
  private static instance: CacheManager;
  
  public transcriptCache: TranscriptCache;
  public meetingCache: MeetingCache;
  public apiCache: APICache;
  
  private constructor() {
    this.transcriptCache = new TranscriptCache();
    this.meetingCache = new MeetingCache();
    this.apiCache = new APICache();
  }

  static getInstance(): CacheManager {
    if (!CacheManager.instance) {
      CacheManager.instance = new CacheManager();
    }
    return CacheManager.instance;
  }

  // Global cache operations
  clearAll(): void {
    this.transcriptCache.clear();
    this.meetingCache.clear();
    this.apiCache.clear();
  }

  getGlobalStats() {
    return {
      transcript: this.transcriptCache.getStats(),
      meeting: this.meetingCache.getStats(),
      api: this.apiCache.getStats()
    };
  }

  // Cache invalidation strategies
  invalidateByMeeting(meetingId: string): void {
    this.transcriptCache.invalidateMeeting(meetingId);
    this.meetingCache.invalidateByPattern(`meeting:${meetingId}`);
    this.apiCache.invalidateByPattern(`.*${meetingId}.*`);
  }

  invalidateByUser(userId: string): void {
    this.meetingCache.invalidateByPattern(`.*user:${userId}.*`);
    this.apiCache.invalidateByPattern(`.*user:${userId}.*`);
  }

  // Performance monitoring
  getPerformanceMetrics() {
    const stats = this.getGlobalStats();
    
    return {
      totalHitRate: (stats.transcript.hits + stats.meeting.hits + stats.api.hits) / 
                    (stats.transcript.hits + stats.transcript.misses + 
                     stats.meeting.hits + stats.meeting.misses + 
                     stats.api.hits + stats.api.misses),
      totalMemoryUsage: stats.transcript.memoryUsage + stats.meeting.memoryUsage + stats.api.memoryUsage,
      totalCacheSize: stats.transcript.size + stats.meeting.size + stats.api.size,
      avgAccessTime: (stats.transcript.avgAccessTime + stats.meeting.avgAccessTime + stats.api.avgAccessTime) / 3
    };
  }
}

// Export singleton instance
export const cacheManager = CacheManager.getInstance();