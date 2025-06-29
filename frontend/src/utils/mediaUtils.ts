// Media Utility Functions
// Common helpers for audio/video processing, format conversion, and browser compatibility

/**
 * Browser compatibility checks
 */
export const BrowserSupport = {
  // Check if MediaRecorder API is supported
  mediaRecorder: (): boolean => {
    return typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported;
  },

  // Check if getUserMedia is supported
  getUserMedia: (): boolean => {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  },

  // Check if Web Audio API is supported
  webAudio: (): boolean => {
    return typeof AudioContext !== 'undefined' || typeof (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext !== 'undefined';
  },

  // Check if WebRTC is supported
  webRTC: (): boolean => {
    return !!(window.RTCPeerConnection || (window as typeof window & { webkitRTCPeerConnection?: typeof RTCPeerConnection; mozRTCPeerConnection?: typeof RTCPeerConnection }).webkitRTCPeerConnection || (window as typeof window & { webkitRTCPeerConnection?: typeof RTCPeerConnection; mozRTCPeerConnection?: typeof RTCPeerConnection }).mozRTCPeerConnection);
  },

  // Check if File API is supported
  fileAPI: (): boolean => {
    return typeof FileReader !== 'undefined';
  },

  // Check if Web Workers are supported
  webWorkers: (): boolean => {
    return typeof Worker !== 'undefined';
  },

  // Get supported MIME types for recording
  getSupportedMimeTypes: (): string[] => {
    if (!BrowserSupport.mediaRecorder()) return [];

    const mimeTypes = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm;codecs=h264,opus',
      'video/webm',
      'audio/webm;codecs=opus',
      'audio/webm',
      'video/mp4',
      'audio/mp4',
      'audio/wav',
    ];

    return mimeTypes.filter(type => MediaRecorder.isTypeSupported(type));
  },
};

/**
 * Time formatting utilities
 */
export const TimeUtils = {
  // Format seconds to HH:MM:SS or MM:SS
  formatDuration: (seconds: number, forceHours = false): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hours > 0 || forceHours) {
      return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  },

  // Parse time string to seconds
  parseTimeString: (timeString: string): number => {
    const parts = timeString.split(':').map(Number);
    if (parts.length === 2) {
      return parts[0] * 60 + parts[1]; // MM:SS
    } else if (parts.length === 3) {
      return parts[0] * 3600 + parts[1] * 60 + parts[2]; // HH:MM:SS
    }
    return 0;
  },

  // Format for SRT subtitles (HH:MM:SS,mmm)
  formatSRTTime: (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    const milliseconds = Math.floor((secs % 1) * 1000);
    const wholeSeconds = Math.floor(secs);

    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${wholeSeconds.toString().padStart(2, '0')},${milliseconds.toString().padStart(3, '0')}`;
  },

  // Get relative time (e.g., "2 minutes ago")
  getRelativeTime: (date: Date): string => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);

    if (diffSec < 60) {
      return 'just now';
    } else if (diffMin < 60) {
      return `${diffMin} minute${diffMin !== 1 ? 's' : ''} ago`;
    } else if (diffHour < 24) {
      return `${diffHour} hour${diffHour !== 1 ? 's' : ''} ago`;
    } else if (diffDay < 7) {
      return `${diffDay} day${diffDay !== 1 ? 's' : ''} ago`;
    } else {
      return date.toLocaleDateString();
    }
  },
};

/**
 * File size utilities
 */
export const FileUtils = {
  // Format bytes to human-readable string
  formatFileSize: (bytes: number): string => {
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    if (bytes === 0) return '0 B';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
  },

  // Get file extension from filename
  getFileExtension: (filename: string): string => {
    return filename.slice((filename.lastIndexOf('.') - 1 >>> 0) + 2);
  },

  // Check if file is audio
  isAudioFile: (filename: string): boolean => {
    const audioExtensions = ['mp3', 'wav', 'ogg', 'aac', 'm4a', 'webm'];
    const ext = FileUtils.getFileExtension(filename).toLowerCase();
    return audioExtensions.includes(ext);
  },

  // Check if file is video
  isVideoFile: (filename: string): boolean => {
    const videoExtensions = ['mp4', 'webm', 'avi', 'mov', 'mkv', 'wmv'];
    const ext = FileUtils.getFileExtension(filename).toLowerCase();
    return videoExtensions.includes(ext);
  },

  // Generate safe filename
  sanitizeFilename: (filename: string): string => {
    return filename
      .replace(/[^a-z0-9.-]/gi, '_')
      .replace(/_{2,}/g, '_')
      .replace(/^_|_$/g, '');
  },
};

/**
 * Audio processing utilities
 */
export const AudioUtils = {
  // Create AudioContext with browser compatibility
  createAudioContext: (): AudioContext => {
    const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    return new AudioContextClass();
  },

  // Calculate RMS (Root Mean Square) for audio level
  calculateRMS: (audioData: Float32Array): number => {
    let sum = 0;
    for (let i = 0; i < audioData.length; i++) {
      sum += audioData[i] * audioData[i];
    }
    return Math.sqrt(sum / audioData.length);
  },

  // Detect silence in audio data
  detectSilence: (audioData: Float32Array, threshold = 0.01): boolean => {
    const rms = AudioUtils.calculateRMS(audioData);
    return rms < threshold;
  },

  // Extract peaks from audio buffer for waveform
  extractPeaks: (audioBuffer: AudioBuffer, resolution: number): Float32Array => {
    const channelData = audioBuffer.getChannelData(0); // Use first channel
    const peaks = new Float32Array(resolution);
    const samplesPerPeak = Math.floor(channelData.length / resolution);

    for (let i = 0; i < resolution; i++) {
      const start = i * samplesPerPeak;
      const end = Math.min(start + samplesPerPeak, channelData.length);

      let max = 0;
      for (let j = start; j < end; j++) {
        const abs = Math.abs(channelData[j]);
        if (abs > max) max = abs;
      }

      peaks[i] = max;
    }

    return peaks;
  },

  // Normalize audio data
  normalizeAudioData: (audioData: Float32Array): Float32Array => {
    const normalized = new Float32Array(audioData.length);
    let max = 0;

    // Find maximum value
    for (let i = 0; i < audioData.length; i++) {
      const abs = Math.abs(audioData[i]);
      if (abs > max) max = abs;
    }

    // Normalize
    if (max > 0) {
      for (let i = 0; i < audioData.length; i++) {
        normalized[i] = audioData[i] / max;
      }
    } else {
      normalized.set(audioData);
    }

    return normalized;
  },
};

/**
 * Local storage utilities for caching
 */
export const CacheUtils = {
  // Store data with expiration
  setWithExpiry: (key: string, value: unknown, ttl: number): void => {
    const now = new Date();
    const item = {
      value: value,
      expiry: now.getTime() + ttl,
    };
    localStorage.setItem(key, JSON.stringify(item));
  },

  // Get data if not expired
  getWithExpiry: (key: string): unknown => {
    const itemStr = localStorage.getItem(key);
    if (!itemStr) return null;

    try {
      const item = JSON.parse(itemStr);
      const now = new Date();

      if (now.getTime() > item.expiry) {
        localStorage.removeItem(key);
        return null;
      }
      return item.value;
    } catch {
      localStorage.removeItem(key);
      return null;
    }
  },

  // Clear expired items
  clearExpired: (): void => {
    const now = new Date();
    const keys = Object.keys(localStorage);

    keys.forEach(key => {
      try {
        const itemStr = localStorage.getItem(key);
        if (itemStr) {
          const item = JSON.parse(itemStr);
          if (item.expiry && now.getTime() > item.expiry) {
            localStorage.removeItem(key);
          }
        }
      } catch {
        // Invalid JSON, skip
      }
    });
  },

  // Get cache size in bytes
  getCacheSize: (): number => {
    let total = 0;
    for (const key in localStorage) {
      if (Object.prototype.hasOwnProperty.call(localStorage, key)) {
        total += localStorage[key].length + key.length;
      }
    }
    return total;
  },
};

/**
 * Device detection utilities
 */
export const DeviceUtils = {
  // Check if device is mobile
  isMobile: (): boolean => {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  },

  // Check if device is iOS
  isIOS: (): boolean => {
    return /iPad|iPhone|iPod/.test(navigator.userAgent);
  },

  // Check if device is Android
  isAndroid: (): boolean => {
    return /Android/.test(navigator.userAgent);
  },

  // Get device pixel ratio
  getPixelRatio: (): number => {
    return window.devicePixelRatio || 1;
  },

  // Check if device supports touch
  isTouchDevice: (): boolean => {
    return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  },

  // Get screen info
  getScreenInfo: () => ({
    width: window.screen.width,
    height: window.screen.height,
    availWidth: window.screen.availWidth,
    availHeight: window.screen.availHeight,
    pixelRatio: DeviceUtils.getPixelRatio(),
  }),
};

/**
 * Keyboard shortcut utilities
 */
export const KeyboardUtils = {
  // Check if key combination matches
  isKeyCombo: (event: KeyboardEvent, combo: string): boolean => {
    const parts = combo.toLowerCase().split('+');
    const key = parts.pop();
    
    const modifiers = {
      ctrl: event.ctrlKey,
      cmd: event.metaKey,
      alt: event.altKey,
      shift: event.shiftKey,
    };

    // Check modifiers
    for (const part of parts) {
      if (part === 'ctrl' && !modifiers.ctrl) return false;
      if (part === 'cmd' && !modifiers.cmd) return false;
      if (part === 'alt' && !modifiers.alt) return false;
      if (part === 'shift' && !modifiers.shift) return false;
    }

    // Check key
    return event.key.toLowerCase() === key || event.code.toLowerCase() === key?.toLowerCase();
  },

  // Format key combo for display
  formatKeyCombo: (combo: string): string => {
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    return combo
      .replace(/ctrl/gi, isMac ? '⌘' : 'Ctrl')
      .replace(/cmd/gi, '⌘')
      .replace(/alt/gi, isMac ? '⌥' : 'Alt')
      .replace(/shift/gi, isMac ? '⇧' : 'Shift')
      .replace(/\+/g, isMac ? '' : '+');
  },
};

/**
 * URL and blob utilities
 */
export const URLUtils = {
  // Create object URL with automatic cleanup
  createObjectURL: (blob: Blob): { url: string; cleanup: () => void } => {
    const url = URL.createObjectURL(blob);
    return {
      url,
      cleanup: () => URL.revokeObjectURL(url),
    };
  },

  // Download blob as file
  downloadBlob: (blob: Blob, filename: string): void => {
    const { url, cleanup } = URLUtils.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    cleanup();
  },

  // Check if URL is valid
  isValidURL: (url: string): boolean => {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  },
};

/**
 * Performance utilities
 */
export const PerformanceUtils = {
  // Debounce function calls
  debounce: <T extends (...args: unknown[]) => unknown>(
    func: T,
    delay: number
  ): ((...args: Parameters<T>) => void) => {
    let timeoutId: NodeJS.Timeout;
    return (...args: Parameters<T>) => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => func(...args), delay);
    };
  },

  // Throttle function calls
  throttle: <T extends (...args: unknown[]) => unknown>(
    func: T,
    delay: number
  ): ((...args: Parameters<T>) => void) => {
    let lastCall = 0;
    return (...args: Parameters<T>) => {
      const now = Date.now();
      if (now - lastCall >= delay) {
        lastCall = now;
        func(...args);
      }
    };
  },

  // Measure performance
  measurePerformance: async <T>(operation: () => Promise<T> | T): Promise<{ result: T; duration: number }> => {
    const start = performance.now();
    const result = await operation();
    const end = performance.now();
    return { result, duration: end - start };
  },
};

// Export all utilities as a single object for convenience
export const MediaUtils = {
  Browser: BrowserSupport,
  Time: TimeUtils,
  File: FileUtils,
  Audio: AudioUtils,
  Cache: CacheUtils,
  Device: DeviceUtils,
  Keyboard: KeyboardUtils,
  URL: URLUtils,
  Performance: PerformanceUtils,
};