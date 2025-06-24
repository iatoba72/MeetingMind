/**
 * UI Management Slice
 * Handles user interface state, theming, modals, notifications, and layout
 */

import { StateCreator } from 'zustand';
import { produce } from 'immer';
import { 
  UIState, 
  SidebarState,
  ModalState,
  NotificationState,
  LayoutState,
  PerformanceState,
  AppNotification,
  NotificationAction,
  NotificationSettings,
  SidebarSection,
  SidebarItem,
  LayoutConfig,
  PerformanceMetric,
  AppState,
  StoreActions 
} from '../types';

export interface UISlice {
  // State
  ui: UIState;
  
  // Theme management
  setTheme: (theme: UIState['theme']) => void;
  toggleTheme: () => void;
  getSystemTheme: () => 'light' | 'dark';
  
  // Sidebar management
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setSidebarSection: (section: string) => void;
  addPinnedItem: (itemId: string) => void;
  removePinnedItem: (itemId: string) => void;
  addCustomSection: (section: Omit<SidebarSection, 'id'>) => string;
  updateCustomSection: (id: string, updates: Partial<SidebarSection>) => void;
  removeCustomSection: (id: string) => void;
  
  // Modal management
  openModal: (modalId: string, data?: any) => void;
  closeModal: (modalId: string) => void;
  closeAllModals: () => void;
  isModalOpen: (modalId: string) => boolean;
  getModalData: (modalId: string) => any;
  
  // Notification management
  addNotification: (notification: Omit<AppNotification, 'id' | 'timestamp' | 'isRead'>) => string;
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;
  removeNotification: (id: string) => void;
  clearAllNotifications: () => void;
  updateNotificationSettings: (settings: Partial<NotificationSettings>) => void;
  
  // Layout management
  setCurrentView: (view: string) => void;
  updatePanelSize: (panelId: string, size: number) => void;
  toggleFullscreen: () => void;
  saveLayoutConfig: (config: Omit<LayoutConfig, 'id'>) => string;
  loadLayoutConfig: (id: string) => boolean;
  deleteLayoutConfig: (id: string) => void;
  resetLayout: () => void;
  
  // Performance monitoring
  updatePerformanceMetrics: (metrics: Partial<PerformanceState>) => void;
  addPerformanceMetric: (metric: Omit<PerformanceMetric, 'timestamp'>) => void;
  getPerformanceHistory: (duration: number) => PerformanceMetric[];
  optimizePerformance: () => void;
  
  // Utility functions
  showToast: (message: string, type?: AppNotification['type']) => string;
  showConfirmDialog: (message: string, onConfirm: () => void, onCancel?: () => void) => string;
  triggerHapticFeedback: (type: 'light' | 'medium' | 'heavy') => void;
  
  // Cleanup
  cleanup: () => void;
}

const defaultSidebarState: SidebarState = {
  isCollapsed: false,
  activeSection: 'meetings',
  pinnedItems: [],
  customSections: []
};

const defaultNotificationSettings: NotificationSettings = {
  enableBrowser: true,
  enableSound: true,
  enableDesktop: false,
  types: {
    info: true,
    success: true,
    warning: true,
    error: true
  },
  autoHide: true,
  hideDelay: 5000
};

const defaultNotificationState: NotificationState = {
  notifications: [],
  settings: defaultNotificationSettings,
  unreadCount: 0
};

const defaultModalState: ModalState = {
  activeModals: [],
  modalData: {},
  modalHistory: []
};

const defaultLayoutState: LayoutState = {
  currentView: 'dashboard',
  viewHistory: ['dashboard'],
  panelSizes: {
    sidebar: 250,
    main: 800,
    details: 300
  },
  isFullscreen: false,
  customLayouts: []
};

const defaultPerformanceState: PerformanceState = {
  fps: 60,
  memoryUsage: 0,
  cpuUsage: 0,
  networkUsage: 0,
  renderTime: 0,
  isOptimized: true,
  metrics: []
};

const defaultUIState: UIState = {
  theme: 'system',
  sidebar: defaultSidebarState,
  modals: defaultModalState,
  notifications: defaultNotificationState,
  layout: defaultLayoutState,
  performance: defaultPerformanceState
};

const generateId = () => `ui_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

export const createUISlice: StateCreator<
  AppState & StoreActions,
  [],
  [],
  UISlice
> = (set, get) => ({
  // Initial state
  ui: defaultUIState,
  
  // Theme management
  setTheme: (theme) => {
    set(produce((state: AppState) => {
      state.ui.theme = theme;
    }));
    
    // Apply theme to document
    const effectiveTheme = theme === 'system' ? get().getSystemTheme() : theme;
    document.documentElement.setAttribute('data-theme', effectiveTheme);
  },
  
  toggleTheme: () => {
    const currentTheme = get().ui.theme;
    let newTheme: UIState['theme'];
    
    if (currentTheme === 'light') {
      newTheme = 'dark';
    } else if (currentTheme === 'dark') {
      newTheme = 'system';
    } else {
      newTheme = 'light';
    }
    
    get().setTheme(newTheme);
  },
  
  getSystemTheme: () => {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  },
  
  // Sidebar management
  toggleSidebar: () => {
    set(produce((state: AppState) => {
      state.ui.sidebar.isCollapsed = !state.ui.sidebar.isCollapsed;
    }));
  },
  
  setSidebarCollapsed: (collapsed) => {
    set(produce((state: AppState) => {
      state.ui.sidebar.isCollapsed = collapsed;
    }));
  },
  
  setSidebarSection: (section) => {
    set(produce((state: AppState) => {
      state.ui.sidebar.activeSection = section;
    }));
  },
  
  addPinnedItem: (itemId) => {
    set(produce((state: AppState) => {
      if (!state.ui.sidebar.pinnedItems.includes(itemId)) {
        state.ui.sidebar.pinnedItems.push(itemId);
      }
    }));
  },
  
  removePinnedItem: (itemId) => {
    set(produce((state: AppState) => {
      state.ui.sidebar.pinnedItems = state.ui.sidebar.pinnedItems.filter(id => id !== itemId);
    }));
  },
  
  addCustomSection: (sectionData) => {
    const id = generateId();
    const section: SidebarSection = {
      id,
      ...sectionData,
      isExpanded: true
    };
    
    set(produce((state: AppState) => {
      if (!state.ui.sidebar.customSections) {
        state.ui.sidebar.customSections = [];
      }
      state.ui.sidebar.customSections.push(section);
    }));
    
    return id;
  },
  
  updateCustomSection: (id, updates) => {
    set(produce((state: AppState) => {
      const section = state.ui.sidebar.customSections?.find(s => s.id === id);
      if (section) {
        Object.assign(section, updates);
      }
    }));
  },
  
  removeCustomSection: (id) => {
    set(produce((state: AppState) => {
      if (state.ui.sidebar.customSections) {
        state.ui.sidebar.customSections = state.ui.sidebar.customSections.filter(s => s.id !== id);
      }
    }));
  },
  
  // Modal management
  openModal: (modalId, data) => {
    set(produce((state: AppState) => {
      if (!state.ui.modals.activeModals.includes(modalId)) {
        state.ui.modals.activeModals.push(modalId);
        state.ui.modals.modalHistory.push(modalId);
        
        if (data) {
          state.ui.modals.modalData[modalId] = data;
        }
      }
    }));
  },
  
  closeModal: (modalId) => {
    set(produce((state: AppState) => {
      state.ui.modals.activeModals = state.ui.modals.activeModals.filter(id => id !== modalId);
      delete state.ui.modals.modalData[modalId];
    }));
  },
  
  closeAllModals: () => {
    set(produce((state: AppState) => {
      state.ui.modals.activeModals = [];
      state.ui.modals.modalData = {};
    }));
  },
  
  isModalOpen: (modalId) => {
    return get().ui.modals.activeModals.includes(modalId);
  },
  
  getModalData: (modalId) => {
    return get().ui.modals.modalData[modalId];
  },
  
  // Notification management
  addNotification: (notificationData) => {
    const id = generateId();
    const notification: AppNotification = {
      id,
      ...notificationData,
      timestamp: new Date(),
      isRead: false
    };
    
    set(produce((state: AppState) => {
      state.ui.notifications.notifications.push(notification);
      state.ui.notifications.unreadCount += 1;
    }));
    
    // Auto-hide if enabled
    const { settings } = get().ui.notifications;
    if (settings.autoHide && !notification.isPersistent) {
      setTimeout(() => {
        get().removeNotification(id);
      }, settings.hideDelay);
    }
    
    // Browser notification if enabled
    if (settings.enableBrowser && 'Notification' in window) {
      if (Notification.permission === 'granted') {
        new Notification(notification.title, {
          body: notification.message,
          icon: '/icon-192.png'
        });
      }
    }
    
    return id;
  },
  
  markNotificationRead: (id) => {
    set(produce((state: AppState) => {
      const notification = state.ui.notifications.notifications.find(n => n.id === id);
      if (notification && !notification.isRead) {
        notification.isRead = true;
        state.ui.notifications.unreadCount = Math.max(0, state.ui.notifications.unreadCount - 1);
      }
    }));
  },
  
  markAllNotificationsRead: () => {
    set(produce((state: AppState) => {
      state.ui.notifications.notifications.forEach(notification => {
        notification.isRead = true;
      });
      state.ui.notifications.unreadCount = 0;
    }));
  },
  
  removeNotification: (id) => {
    set(produce((state: AppState) => {
      const notification = state.ui.notifications.notifications.find(n => n.id === id);
      if (notification && !notification.isRead) {
        state.ui.notifications.unreadCount = Math.max(0, state.ui.notifications.unreadCount - 1);
      }
      state.ui.notifications.notifications = state.ui.notifications.notifications.filter(n => n.id !== id);
    }));
  },
  
  clearAllNotifications: () => {
    set(produce((state: AppState) => {
      state.ui.notifications.notifications = [];
      state.ui.notifications.unreadCount = 0;
    }));
  },
  
  updateNotificationSettings: (settingsUpdate) => {
    set(produce((state: AppState) => {
      Object.assign(state.ui.notifications.settings, settingsUpdate);
    }));
  },
  
  // Layout management
  setCurrentView: (view) => {
    set(produce((state: AppState) => {
      if (state.ui.layout.currentView !== view) {
        state.ui.layout.viewHistory.push(view);
        state.ui.layout.currentView = view;
        
        // Keep history limited
        if (state.ui.layout.viewHistory.length > 10) {
          state.ui.layout.viewHistory = state.ui.layout.viewHistory.slice(-10);
        }
      }
    }));
  },
  
  updatePanelSize: (panelId, size) => {
    set(produce((state: AppState) => {
      state.ui.layout.panelSizes[panelId] = size;
    }));
  },
  
  toggleFullscreen: () => {
    set(produce((state: AppState) => {
      state.ui.layout.isFullscreen = !state.ui.layout.isFullscreen;
    }));
    
    // Toggle browser fullscreen
    const isFullscreen = get().ui.layout.isFullscreen;
    if (isFullscreen) {
      document.documentElement.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
  },
  
  saveLayoutConfig: (configData) => {
    const id = generateId();
    const config: LayoutConfig = {
      id,
      ...configData
    };
    
    set(produce((state: AppState) => {
      state.ui.layout.customLayouts.push(config);
    }));
    
    return id;
  },
  
  loadLayoutConfig: (id) => {
    const config = get().ui.layout.customLayouts.find(c => c.id === id);
    if (!config) return false;
    
    try {
      // Apply layout configuration
      if (config.config.panelSizes) {
        set(produce((state: AppState) => {
          Object.assign(state.ui.layout.panelSizes, config.config.panelSizes);
        }));
      }
      
      if (config.config.view) {
        get().setCurrentView(config.config.view);
      }
      
      return true;
    } catch (error) {
      console.error('Failed to load layout config:', error);
      return false;
    }
  },
  
  deleteLayoutConfig: (id) => {
    set(produce((state: AppState) => {
      state.ui.layout.customLayouts = state.ui.layout.customLayouts.filter(c => c.id !== id);
    }));
  },
  
  resetLayout: () => {
    set(produce((state: AppState) => {
      state.ui.layout = { ...defaultLayoutState };
    }));
  },
  
  // Performance monitoring
  updatePerformanceMetrics: (metricsUpdate) => {
    set(produce((state: AppState) => {
      Object.assign(state.ui.performance, metricsUpdate);
    }));
  },
  
  addPerformanceMetric: (metricData) => {
    const metric: PerformanceMetric = {
      ...metricData,
      timestamp: new Date()
    };
    
    set(produce((state: AppState) => {
      state.ui.performance.metrics.push(metric);
      
      // Keep only last 100 metrics
      if (state.ui.performance.metrics.length > 100) {
        state.ui.performance.metrics = state.ui.performance.metrics.slice(-100);
      }
    }));
  },
  
  getPerformanceHistory: (duration) => {
    const cutoff = new Date(Date.now() - duration);
    return get().ui.performance.metrics.filter(m => m.timestamp > cutoff);
  },
  
  optimizePerformance: () => {
    const { performance } = get().ui;
    
    // Apply performance optimizations
    let optimizations: Partial<PerformanceState> = {};
    
    if (performance.fps < 30) {
      optimizations.isOptimized = false;
    } else if (performance.memoryUsage > 500 * 1024 * 1024) { // 500MB
      optimizations.isOptimized = false;
    } else {
      optimizations.isOptimized = true;
    }
    
    get().updatePerformanceMetrics(optimizations);
  },
  
  // Utility functions
  showToast: (message, type = 'info') => {
    return get().addNotification({
      type,
      title: type.charAt(0).toUpperCase() + type.slice(1),
      message,
      isPersistent: false
    });
  },
  
  showConfirmDialog: (message, onConfirm, onCancel) => {
    const actions: NotificationAction[] = [
      {
        id: 'confirm',
        label: 'Confirm',
        action: onConfirm,
        style: 'primary'
      }
    ];
    
    if (onCancel) {
      actions.push({
        id: 'cancel',
        label: 'Cancel',
        action: onCancel,
        style: 'secondary'
      });
    }
    
    return get().addNotification({
      type: 'warning',
      title: 'Confirmation Required',
      message,
      isPersistent: true,
      actions
    });
  },
  
  triggerHapticFeedback: (type) => {
    if ('vibrate' in navigator && typeof navigator.vibrate === 'function') {
      const patterns = {
        light: [10],
        medium: [20],
        heavy: [50]
      };
      navigator.vibrate(patterns[type]);
    }
  },
  
  // Cleanup
  cleanup: () => {
    // Close all modals
    get().closeAllModals();
    
    // Clear notifications
    get().clearAllNotifications();
    
    // Reset to default state
    set(produce((state: AppState) => {
      state.ui = { ...defaultUIState };
    }));
  }
});