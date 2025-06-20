// Local-Only Service for MeetingMind
// Implements completely offline functionality with local storage and processing

import { encryptionService } from './EncryptionService';

interface LocalStorageConfig {
  enableEncryption: boolean;
  encryptionPassword?: string;
  maxStorageSize: number; // bytes
  compressionEnabled: boolean;
  backupEnabled: boolean;
  syncToRemovableMedia: boolean;
}

interface LocalDataStore {
  meetings: Map<string, any>;
  transcripts: Map<string, any>;
  users: Map<string, any>;
  settings: Map<string, any>;
  recordings: Map<string, Blob>;
  analytics: Map<string, any>;
}

interface LocalBackup {
  id: string;
  timestamp: number;
  dataSize: number;
  encryptionEnabled: boolean;
  checksum: string;
  version: string;
}

interface OfflineCapability {
  name: string;
  isAvailable: boolean;
  description: string;
  limitations: string[];
  fallbackMethod?: string;
}

interface LocalOnlyStatus {
  isLocalOnlyMode: boolean;
  storageUsed: number;
  storageAvailable: number;
  encryptionEnabled: boolean;
  lastBackup?: number;
  capabilitiesCount: number;
  offlineCapabilities: OfflineCapability[];
  networkDisabled: boolean;
}

export class LocalOnlyService {
  private static instance: LocalOnlyService;
  private config: LocalStorageConfig;
  private dataStore: LocalDataStore;
  private isLocalOnlyMode: boolean = false;
  private storageQuota: number = 0;
  private storageUsed: number = 0;
  private backupHistory: LocalBackup[] = [];
  private offlineWorker: Worker | null = null;
  private compressionWorker: Worker | null = null;

  private constructor(config: Partial<LocalStorageConfig> = {}) {
    this.config = {
      enableEncryption: true,
      maxStorageSize: 2 * 1024 * 1024 * 1024, // 2GB default
      compressionEnabled: true,
      backupEnabled: true,
      syncToRemovableMedia: false,
      ...config
    };

    this.dataStore = {
      meetings: new Map(),
      transcripts: new Map(),
      users: new Map(),
      settings: new Map(),
      recordings: new Map(),
      analytics: new Map()
    };

    this.initializeLocalStorage();
  }

  static getInstance(config?: Partial<LocalStorageConfig>): LocalOnlyService {
    if (!LocalOnlyService.instance) {
      LocalOnlyService.instance = new LocalOnlyService(config);
    }
    return LocalOnlyService.instance;
  }

  private async initializeLocalStorage(): Promise<void> {
    try {
      // Check storage quota
      if ('storage' in navigator && 'estimate' in navigator.storage) {
        const estimate = await navigator.storage.estimate();
        this.storageQuota = estimate.quota || this.config.maxStorageSize;
        this.storageUsed = estimate.usage || 0;
      }

      // Initialize workers
      await this.initializeWorkers();

      // Load existing data
      await this.loadLocalData();

      console.log('Local-only service initialized');
    } catch (error) {
      console.error('Failed to initialize local storage:', error);
      throw error;
    }
  }

  private async initializeWorkers(): Promise<void> {
    if (typeof Worker === 'undefined') return;

    try {
      // Offline processing worker
      const offlineWorkerCode = `
        // Offline processing capabilities
        self.onmessage = function(e) {
          const { action, data, id } = e.data;
          
          try {
            switch (action) {
              case 'processAudio':
                // Simulate local audio processing
                const result = {
                  segments: data.audioData.length / 1000, // Mock transcription
                  duration: data.duration,
                  confidence: 0.85,
                  processed: true
                };
                self.postMessage({ id, result });
                break;
                
              case 'compressData':
                // Simple data compression
                const compressed = JSON.stringify(data);
                self.postMessage({ 
                  id, 
                  result: { 
                    compressed,
                    originalSize: JSON.stringify(data).length,
                    compressedSize: compressed.length
                  }
                });
                break;
                
              case 'indexData':
                // Create search index
                const index = this.createSearchIndex(data);
                self.postMessage({ id, result: index });
                break;
                
              default:
                self.postMessage({ id, error: 'Unknown action' });
            }
          } catch (error) {
            self.postMessage({ id, error: error.message });
          }
        };
        
        function createSearchIndex(data) {
          const index = {};
          if (data.transcripts) {
            for (const [id, transcript] of Object.entries(data.transcripts)) {
              const words = transcript.text.toLowerCase().split(/\\s+/);
              words.forEach(word => {
                if (!index[word]) index[word] = [];
                index[word].push(id);
              });
            }
          }
          return index;
        }
      `;

      const blob = new Blob([offlineWorkerCode], { type: 'application/javascript' });
      this.offlineWorker = new Worker(URL.createObjectURL(blob));
    } catch (error) {
      console.warn('Failed to initialize offline worker:', error);
    }
  }

  // Enable/disable local-only mode
  async enableLocalOnlyMode(encryptionPassword?: string): Promise<void> {
    this.isLocalOnlyMode = true;
    
    if (this.config.enableEncryption && encryptionPassword) {
      this.config.encryptionPassword = encryptionPassword;
      await encryptionService.initialize();
    }

    // Disable network requests
    this.disableNetworkRequests();

    // Enable offline capabilities
    await this.enableOfflineCapabilities();

    console.log('Local-only mode enabled');
  }

  async disableLocalOnlyMode(): Promise<void> {
    this.isLocalOnlyMode = false;
    this.config.encryptionPassword = undefined;

    // Re-enable network requests
    this.enableNetworkRequests();

    console.log('Local-only mode disabled');
  }

  private disableNetworkRequests(): void {
    // Override fetch and XMLHttpRequest to prevent network calls
    if (typeof window !== 'undefined') {
      const originalFetch = window.fetch;
      const originalXHR = window.XMLHttpRequest;

      window.fetch = async (...args) => {
        console.warn('Network request blocked in local-only mode:', args[0]);
        throw new Error('Network requests disabled in local-only mode');
      };

      window.XMLHttpRequest = class extends originalXHR {
        open(...args: any[]) {
          console.warn('XHR request blocked in local-only mode:', args[1]);
          throw new Error('Network requests disabled in local-only mode');
        }
      } as any;

      // Store original functions for restoration
      (window as any).__originalFetch = originalFetch;
      (window as any).__originalXHR = originalXHR;
    }
  }

  private enableNetworkRequests(): void {
    if (typeof window !== 'undefined') {
      if ((window as any).__originalFetch) {
        window.fetch = (window as any).__originalFetch;
        delete (window as any).__originalFetch;
      }

      if ((window as any).__originalXHR) {
        window.XMLHttpRequest = (window as any).__originalXHR;
        delete (window as any).__originalXHR;
      }
    }
  }

  // Local data management
  async storeData(
    type: keyof LocalDataStore, 
    id: string, 
    data: any
  ): Promise<void> {
    try {
      let processedData = data;

      // Encrypt if enabled
      if (this.config.enableEncryption && this.config.encryptionPassword) {
        const salt = encryptionService.generateSecureRandom(32);
        const key = await encryptionService.deriveKeyFromPassword(
          this.config.encryptionPassword,
          salt.buffer
        );

        const dataString = JSON.stringify(data);
        const iv = encryptionService.generateSecureRandom(12);
        
        const encryptedBuffer = await crypto.subtle.encrypt(
          {
            name: 'AES-GCM',
            iv: iv,
            tagLength: 128
          },
          key,
          new TextEncoder().encode(dataString)
        );

        processedData = {
          encrypted: true,
          data: encryptionService.arrayBufferToBase64(encryptedBuffer),
          salt: encryptionService.arrayBufferToBase64(salt.buffer),
          iv: encryptionService.arrayBufferToBase64(iv.buffer),
          timestamp: Date.now()
        };
      }

      // Compress if enabled
      if (this.config.compressionEnabled && !processedData.encrypted) {
        processedData = await this.compressData(processedData);
      }

      // Store in memory
      this.dataStore[type].set(id, processedData);

      // Persist to localStorage/IndexedDB
      await this.persistData(type, id, processedData);

      // Update storage usage
      await this.updateStorageUsage();

    } catch (error) {
      console.error(`Failed to store ${type} data:`, error);
      throw error;
    }
  }

  async retrieveData(type: keyof LocalDataStore, id: string): Promise<any> {
    try {
      // Try memory first
      let data = this.dataStore[type].get(id);

      // Fallback to persistent storage
      if (!data) {
        data = await this.loadPersistedData(type, id);
        if (data) {
          this.dataStore[type].set(id, data);
        }
      }

      if (!data) {
        return null;
      }

      // Decompress if needed
      if (data.compressed) {
        data = await this.decompressData(data);
      }

      // Decrypt if needed
      if (data.encrypted && this.config.encryptionPassword) {
        const salt = encryptionService.base64ToArrayBuffer(data.salt);
        const iv = encryptionService.base64ToArrayBuffer(data.iv);
        const encryptedData = encryptionService.base64ToArrayBuffer(data.data);

        const key = await encryptionService.deriveKeyFromPassword(
          this.config.encryptionPassword,
          salt
        );

        const decryptedBuffer = await crypto.subtle.decrypt(
          {
            name: 'AES-GCM',
            iv: iv,
            tagLength: 128
          },
          key,
          encryptedData
        );

        const decryptedString = new TextDecoder().decode(decryptedBuffer);
        data = JSON.parse(decryptedString);
      }

      return data;
    } catch (error) {
      console.error(`Failed to retrieve ${type} data:`, error);
      throw error;
    }
  }

  async deleteData(type: keyof LocalDataStore, id: string): Promise<void> {
    // Remove from memory
    this.dataStore[type].delete(id);

    // Remove from persistent storage
    await this.deletePersistedData(type, id);

    // Update storage usage
    await this.updateStorageUsage();
  }

  async listData(type: keyof LocalDataStore): Promise<string[]> {
    // Combine memory and persistent storage keys
    const memoryKeys = Array.from(this.dataStore[type].keys());
    const persistentKeys = await this.listPersistedData(type);
    
    return [...new Set([...memoryKeys, ...persistentKeys])];
  }

  // Offline capabilities
  private async enableOfflineCapabilities(): Promise<void> {
    // Enable service worker for offline operation
    if ('serviceWorker' in navigator) {
      try {
        const registration = await navigator.serviceWorker.register('/offline-sw.js');
        console.log('Offline service worker registered');
      } catch (error) {
        console.warn('Failed to register service worker:', error);
      }
    }

    // Enable persistent storage
    if ('storage' in navigator && 'persist' in navigator.storage) {
      const persistent = await navigator.storage.persist();
      if (persistent) {
        console.log('Persistent storage enabled');
      }
    }
  }

  async processAudioLocally(audioData: ArrayBuffer): Promise<any> {
    if (!this.offlineWorker) {
      throw new Error('Offline processing not available');
    }

    return new Promise((resolve, reject) => {
      const id = Math.random().toString(36);

      const handleMessage = (e: MessageEvent) => {
        if (e.data.id === id) {
          this.offlineWorker!.removeEventListener('message', handleMessage);
          
          if (e.data.error) {
            reject(new Error(e.data.error));
          } else {
            resolve(e.data.result);
          }
        }
      };

      this.offlineWorker.addEventListener('message', handleMessage);
      this.offlineWorker.postMessage({
        action: 'processAudio',
        data: { audioData, duration: audioData.byteLength / 44100 },
        id
      });

      // Timeout after 30 seconds
      setTimeout(() => {
        this.offlineWorker!.removeEventListener('message', handleMessage);
        reject(new Error('Audio processing timeout'));
      }, 30000);
    });
  }

  async createLocalIndex(): Promise<any> {
    if (!this.offlineWorker) {
      throw new Error('Offline indexing not available');
    }

    const allData = {
      meetings: Object.fromEntries(this.dataStore.meetings),
      transcripts: Object.fromEntries(this.dataStore.transcripts)
    };

    return new Promise((resolve, reject) => {
      const id = Math.random().toString(36);

      const handleMessage = (e: MessageEvent) => {
        if (e.data.id === id) {
          this.offlineWorker!.removeEventListener('message', handleMessage);
          
          if (e.data.error) {
            reject(new Error(e.data.error));
          } else {
            resolve(e.data.result);
          }
        }
      };

      this.offlineWorker.addEventListener('message', handleMessage);
      this.offlineWorker.postMessage({
        action: 'indexData',
        data: allData,
        id
      });
    });
  }

  // Backup and export
  async createLocalBackup(): Promise<string> {
    try {
      const backupData = {
        version: '1.0.0',
        timestamp: Date.now(),
        config: this.config,
        data: {
          meetings: Object.fromEntries(this.dataStore.meetings),
          transcripts: Object.fromEntries(this.dataStore.transcripts),
          users: Object.fromEntries(this.dataStore.users),
          settings: Object.fromEntries(this.dataStore.settings),
          analytics: Object.fromEntries(this.dataStore.analytics)
        }
      };

      // Calculate checksum
      const dataString = JSON.stringify(backupData);
      const checksum = await encryptionService.hashString(dataString);

      // Compress backup
      let processedData = dataString;
      if (this.config.compressionEnabled) {
        processedData = JSON.stringify(await this.compressData(backupData));
      }

      // Encrypt backup if enabled
      if (this.config.enableEncryption && this.config.encryptionPassword) {
        const salt = encryptionService.generateSecureRandom(32);
        const key = await encryptionService.deriveKeyFromPassword(
          this.config.encryptionPassword,
          salt.buffer
        );

        const iv = encryptionService.generateSecureRandom(12);
        const encryptedBuffer = await crypto.subtle.encrypt(
          {
            name: 'AES-GCM',
            iv: iv,
            tagLength: 128
          },
          key,
          new TextEncoder().encode(processedData)
        );

        processedData = JSON.stringify({
          encrypted: true,
          data: encryptionService.arrayBufferToBase64(encryptedBuffer),
          salt: encryptionService.arrayBufferToBase64(salt.buffer),
          iv: encryptionService.arrayBufferToBase64(iv.buffer)
        });
      }

      // Create backup record
      const backup: LocalBackup = {
        id: `backup_${Date.now()}`,
        timestamp: Date.now(),
        dataSize: processedData.length,
        encryptionEnabled: this.config.enableEncryption,
        checksum,
        version: '1.0.0'
      };

      this.backupHistory.push(backup);

      // Save backup to file system (if supported)
      if ('showSaveFilePicker' in window) {
        try {
          const fileHandle = await (window as any).showSaveFilePicker({
            suggestedName: `meetingmind_backup_${backup.id}.json`,
            types: [{
              description: 'MeetingMind Backup',
              accept: { 'application/json': ['.json'] }
            }]
          });

          const writable = await fileHandle.createWritable();
          await writable.write(processedData);
          await writable.close();

          console.log('Backup saved to file system');
        } catch (error) {
          console.warn('Failed to save backup to file system:', error);
        }
      }

      return backup.id;
    } catch (error) {
      console.error('Failed to create backup:', error);
      throw error;
    }
  }

  async restoreFromBackup(backupFile: File): Promise<void> {
    try {
      const backupText = await backupFile.text();
      let backupData;

      try {
        backupData = JSON.parse(backupText);
      } catch {
        throw new Error('Invalid backup file format');
      }

      // Decrypt if needed
      if (backupData.encrypted) {
        if (!this.config.encryptionPassword) {
          throw new Error('Encryption password required for encrypted backup');
        }

        const salt = encryptionService.base64ToArrayBuffer(backupData.salt);
        const iv = encryptionService.base64ToArrayBuffer(backupData.iv);
        const encryptedData = encryptionService.base64ToArrayBuffer(backupData.data);

        const key = await encryptionService.deriveKeyFromPassword(
          this.config.encryptionPassword,
          salt
        );

        const decryptedBuffer = await crypto.subtle.decrypt(
          {
            name: 'AES-GCM',
            iv: iv,
            tagLength: 128
          },
          key,
          encryptedData
        );

        const decryptedString = new TextDecoder().decode(decryptedBuffer);
        backupData = JSON.parse(decryptedString);
      }

      // Decompress if needed
      if (backupData.compressed) {
        backupData = await this.decompressData(backupData);
      }

      // Validate backup structure
      if (!backupData.version || !backupData.data) {
        throw new Error('Invalid backup structure');
      }

      // Restore data
      for (const [type, data] of Object.entries(backupData.data)) {
        if (type in this.dataStore) {
          this.dataStore[type as keyof LocalDataStore] = new Map(Object.entries(data as any));
        }
      }

      // Persist restored data
      await this.persistAllData();

      console.log('Backup restored successfully');
    } catch (error) {
      console.error('Failed to restore backup:', error);
      throw error;
    }
  }

  // Status and monitoring
  getLocalOnlyStatus(): LocalOnlyStatus {
    const offlineCapabilities = this.getOfflineCapabilities();

    return {
      isLocalOnlyMode: this.isLocalOnlyMode,
      storageUsed: this.storageUsed,
      storageAvailable: this.storageQuota - this.storageUsed,
      encryptionEnabled: this.config.enableEncryption,
      lastBackup: this.backupHistory.length > 0 
        ? Math.max(...this.backupHistory.map(b => b.timestamp))
        : undefined,
      capabilitiesCount: offlineCapabilities.filter(c => c.isAvailable).length,
      offlineCapabilities,
      networkDisabled: this.isLocalOnlyMode
    };
  }

  private getOfflineCapabilities(): OfflineCapability[] {
    return [
      {
        name: 'Local Storage',
        isAvailable: 'localStorage' in window,
        description: 'Store data locally in browser',
        limitations: ['Limited storage space', 'May be cleared by browser']
      },
      {
        name: 'IndexedDB',
        isAvailable: 'indexedDB' in window,
        description: 'Large-scale local database storage',
        limitations: ['Browser-specific', 'Async operations only']
      },
      {
        name: 'Web Workers',
        isAvailable: typeof Worker !== 'undefined',
        description: 'Background processing for audio/video',
        limitations: ['Limited processing power', 'No direct DOM access']
      },
      {
        name: 'File System Access',
        isAvailable: 'showSaveFilePicker' in window,
        description: 'Save and load files directly',
        limitations: ['Browser support limited', 'Requires user interaction']
      },
      {
        name: 'Service Worker',
        isAvailable: 'serviceWorker' in navigator,
        description: 'Offline page caching and background sync',
        limitations: ['HTTPS required', 'Limited API access']
      },
      {
        name: 'Persistent Storage',
        isAvailable: 'storage' in navigator && 'persist' in navigator.storage!,
        description: 'Protected storage that won\'t be cleared',
        limitations: ['Requires user permission', 'Limited availability']
      },
      {
        name: 'Local Encryption',
        isAvailable: 'crypto' in window && 'subtle' in crypto,
        description: 'Client-side encryption of sensitive data',
        limitations: ['Performance overhead', 'Key management complexity']
      },
      {
        name: 'Audio Processing',
        isAvailable: 'AudioContext' in window,
        description: 'Local audio analysis and processing',
        limitations: ['Browser performance dependent', 'Limited ML capabilities'],
        fallbackMethod: 'Basic audio recording only'
      }
    ];
  }

  // Helper methods
  private async compressData(data: any): Promise<any> {
    // Simple JSON compression simulation
    return {
      compressed: true,
      data: JSON.stringify(data),
      originalSize: JSON.stringify(data).length,
      timestamp: Date.now()
    };
  }

  private async decompressData(compressedData: any): Promise<any> {
    if (!compressedData.compressed) {
      return compressedData;
    }
    return JSON.parse(compressedData.data);
  }

  private async persistData(type: string, id: string, data: any): Promise<void> {
    const key = `meetingmind_${type}_${id}`;
    try {
      localStorage.setItem(key, JSON.stringify(data));
    } catch (error) {
      console.warn('Failed to persist to localStorage:', error);
      // Fallback to memory only
    }
  }

  private async loadPersistedData(type: string, id: string): Promise<any> {
    const key = `meetingmind_${type}_${id}`;
    try {
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.warn('Failed to load from localStorage:', error);
      return null;
    }
  }

  private async deletePersistedData(type: string, id: string): Promise<void> {
    const key = `meetingmind_${type}_${id}`;
    try {
      localStorage.removeItem(key);
    } catch (error) {
      console.warn('Failed to delete from localStorage:', error);
    }
  }

  private async listPersistedData(type: string): Promise<string[]> {
    const prefix = `meetingmind_${type}_`;
    const keys: string[] = [];
    
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(prefix)) {
          keys.push(key.substring(prefix.length));
        }
      }
    } catch (error) {
      console.warn('Failed to list localStorage keys:', error);
    }
    
    return keys;
  }

  private async persistAllData(): Promise<void> {
    for (const [type, dataMap] of Object.entries(this.dataStore)) {
      for (const [id, data] of dataMap.entries()) {
        await this.persistData(type, id, data);
      }
    }
  }

  private async loadLocalData(): Promise<void> {
    const types = Object.keys(this.dataStore) as (keyof LocalDataStore)[];
    
    for (const type of types) {
      const ids = await this.listPersistedData(type);
      for (const id of ids) {
        const data = await this.loadPersistedData(type, id);
        if (data) {
          this.dataStore[type].set(id, data);
        }
      }
    }
  }

  private async updateStorageUsage(): Promise<void> {
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      const estimate = await navigator.storage.estimate();
      this.storageUsed = estimate.usage || 0;
    }
  }

  // Cleanup
  async cleanup(): Promise<void> {
    // Terminate workers
    if (this.offlineWorker) {
      this.offlineWorker.terminate();
      this.offlineWorker = null;
    }

    if (this.compressionWorker) {
      this.compressionWorker.terminate();
      this.compressionWorker = null;
    }

    // Re-enable network if disabled
    if (this.isLocalOnlyMode) {
      this.enableNetworkRequests();
    }

    console.log('Local-only service cleanup completed');
  }
}

// Export singleton instance
export const localOnlyService = LocalOnlyService.getInstance({
  enableEncryption: true,
  compressionEnabled: true,
  backupEnabled: true
});

// React hook for local-only mode
export function useLocalOnlyMode() {
  const [status, setStatus] = React.useState<LocalOnlyStatus | null>(null);
  const [isEnabled, setIsEnabled] = React.useState(false);

  React.useEffect(() => {
    const updateStatus = () => {
      const currentStatus = localOnlyService.getLocalOnlyStatus();
      setStatus(currentStatus);
      setIsEnabled(currentStatus.isLocalOnlyMode);
    };

    updateStatus();
    const interval = setInterval(updateStatus, 5000);

    return () => clearInterval(interval);
  }, []);

  const enableLocalMode = React.useCallback(async (password?: string) => {
    await localOnlyService.enableLocalOnlyMode(password);
    setIsEnabled(true);
  }, []);

  const disableLocalMode = React.useCallback(async () => {
    await localOnlyService.disableLocalOnlyMode();
    setIsEnabled(false);
  }, []);

  const createBackup = React.useCallback(async () => {
    return await localOnlyService.createLocalBackup();
  }, []);

  const restoreBackup = React.useCallback(async (file: File) => {
    return await localOnlyService.restoreFromBackup(file);
  }, []);

  return {
    status,
    isEnabled,
    enableLocalMode,
    disableLocalMode,
    createBackup,
    restoreBackup,
    localOnlyService
  };
}