// MeetingMind Desktop - Preload Script
// Secure bridge between main process and renderer with minimal API exposure

import { contextBridge, ipcRenderer } from 'electron';

// Define the API interface
interface ElectronAPI {
  // System information
  getSystemInfo: () => Promise<any>;
  getDeviceId: () => Promise<string>;
  getAppVersion: () => Promise<string>;

  // Theme management
  getTheme: () => Promise<'light' | 'dark'>;
  setTheme: (theme: 'light' | 'dark' | 'system') => Promise<'light' | 'dark'>;

  // Window management
  minimizeWindow: () => Promise<void>;
  maximizeWindow: () => Promise<boolean>;
  closeWindow: () => Promise<void>;
  openSettings: () => Promise<void>;

  // File operations
  saveFile: (data: any, filters?: any) => Promise<{ success: boolean; path?: string; error?: string; cancelled?: boolean }>;
  loadFile: () => Promise<{ success: boolean; data?: any; path?: string; error?: string; cancelled?: boolean }>;

  // Security
  checkMicrophoneAccess: () => Promise<boolean>;
  checkCameraAccess: () => Promise<boolean>;

  // Auto-updater
  checkForUpdates: () => Promise<void>;
  installUpdate: () => Promise<void>;

  // Event listeners
  onUpdateStatus: (callback: (status: any) => void) => void;
  onMenuAction: (callback: (action: string) => void) => void;
  onWindowFocus: (callback: (focused: boolean) => void) => void;
  onDeepLink: (callback: (url: string) => void) => void;

  // Remove listeners
  removeAllListeners: (channel: string) => void;
}

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
const electronAPI: ElectronAPI = {
  // System information
  getSystemInfo: () => ipcRenderer.invoke('get-system-info'),
  getDeviceId: () => ipcRenderer.invoke('get-device-id'),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),

  // Theme management
  getTheme: () => ipcRenderer.invoke('get-theme'),
  setTheme: (theme: 'light' | 'dark' | 'system') => ipcRenderer.invoke('set-theme', theme),

  // Window management
  minimizeWindow: () => ipcRenderer.invoke('minimize-window'),
  maximizeWindow: () => ipcRenderer.invoke('maximize-window'),
  closeWindow: () => ipcRenderer.invoke('close-window'),
  openSettings: () => ipcRenderer.invoke('open-settings'),

  // File operations
  saveFile: (data: any, filters?: any) => ipcRenderer.invoke('save-file', data, filters),
  loadFile: () => ipcRenderer.invoke('load-file'),

  // Security
  checkMicrophoneAccess: () => ipcRenderer.invoke('check-microphone-access'),
  checkCameraAccess: () => ipcRenderer.invoke('check-camera-access'),

  // Auto-updater
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  installUpdate: () => ipcRenderer.invoke('install-update'),

  // Event listeners with automatic cleanup
  onUpdateStatus: (callback: (status: any) => void) => {
    const wrappedCallback = (event: any, ...args: any[]) => callback(...args);
    ipcRenderer.on('update-status', wrappedCallback);
  },

  onMenuAction: (callback: (action: string) => void) => {
    const wrappedCallback = (event: any, ...args: any[]) => callback(...args);
    ipcRenderer.on('menu-action', wrappedCallback);
  },

  onWindowFocus: (callback: (focused: boolean) => void) => {
    const wrappedCallback = (event: any, ...args: any[]) => callback(...args);
    ipcRenderer.on('window-focus', wrappedCallback);
  },

  onDeepLink: (callback: (url: string) => void) => {
    const wrappedCallback = (event: any, ...args: any[]) => callback(...args);
    ipcRenderer.on('deep-link', wrappedCallback);
  },

  // Remove listeners
  removeAllListeners: (channel: string) => {
    ipcRenderer.removeAllListeners(channel);
  }
};

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electronAPI', electronAPI);
  } catch (error) {
    console.error('Failed to expose electronAPI:', error);
  }
} else {
  // Fallback for when context isolation is disabled
  (window as any).electronAPI = electronAPI;
}

// Additional security: Remove Node.js globals in renderer
delete (window as any).require;
delete (window as any).exports;
delete (window as any).module;

// Platform detection helpers
contextBridge.exposeInMainWorld('platform', {
  isWindows: process.platform === 'win32',
  isMacOS: process.platform === 'darwin',
  isLinux: process.platform === 'linux',
  platform: process.platform,
  arch: process.arch
});

// Version information
contextBridge.exposeInMainWorld('versions', {
  node: process.versions.node,
  chrome: process.versions.chrome,
  electron: process.versions.electron
});

// Console logging with context
const originalConsole = { ...console };
Object.assign(console, {
  log: (...args: any[]) => originalConsole.log('[Renderer]', ...args),
  warn: (...args: any[]) => originalConsole.warn('[Renderer]', ...args),
  error: (...args: any[]) => originalConsole.error('[Renderer]', ...args),
  info: (...args: any[]) => originalConsole.info('[Renderer]', ...args),
  debug: (...args: any[]) => originalConsole.debug('[Renderer]', ...args)
});

// Declare global types for TypeScript
declare global {
  interface Window {
    electronAPI: ElectronAPI;
    platform: {
      isWindows: boolean;
      isMacOS: boolean;
      isLinux: boolean;
      platform: string;
      arch: string;
    };
    versions: {
      node: string;
      chrome: string;
      electron: string;
    };
  }
}

// Export for TypeScript
export { ElectronAPI };