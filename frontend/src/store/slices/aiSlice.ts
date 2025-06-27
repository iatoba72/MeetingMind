/**
 * AI Management Slice
 * Handles AI providers, task processing, and intelligent analysis
 */

import { StateCreator } from 'zustand';
import { produce } from 'immer';
import { 
  AIState, 
  AIProvider, 
  AITask, 
  AIResult,
  AISettings,
  MeetingInsight,
  ProviderUsage,
  ProviderSettings,
  AppState,
  StoreActions 
} from '../types';

export interface AISlice {
  // State
  ai: AIState;
  
  // Provider management
  addProvider: (provider: Omit<AIProvider, 'id' | 'usage'>) => string;
  updateProvider: (id: string, updates: Partial<AIProvider>) => void;
  removeProvider: (id: string) => void;
  setActiveProvider: (id: string | null) => void;
  testProvider: (id: string) => Promise<ProviderTestResult>;
  
  // Task management
  queueTask: (task: Omit<AITask, 'id' | 'createdAt' | 'status'>) => string;
  updateTask: (id: string, updates: Partial<AITask>) => void;
  cancelTask: (id: string) => void;
  processNextTask: () => Promise<void>;
  processTask: (taskId: string) => Promise<AIResult | null>;
  
  // Results management
  addResult: (result: Omit<AIResult, 'timestamp'>) => void;
  getResultsByTask: (taskId: string) => AIResult[];
  getResultsByType: (type: AIResult['type']) => AIResult[];
  clearResults: (olderThan?: Date) => void;
  
  // Settings management
  updateSettings: (settings: Partial<AISettings>) => void;
  resetSettings: () => void;
  optimizeForUsage: (usage: 'speed' | 'quality' | 'cost') => void;
  
  // Provider usage tracking
  updateProviderUsage: (providerId: string, usage: Partial<ProviderUsage>) => void;
  getProviderCost: (providerId: string, period: 'day' | 'week' | 'month') => number;
  resetProviderUsage: (providerId: string) => void;
  
  // Intelligent analysis
  generateInsights: (meetingId: string) => Promise<MeetingInsight[]>;
  analyzeSentiment: (text: string) => Promise<SentimentAnalysis>;
  extractKeywords: (text: string) => Promise<string[]>;
  summarizeText: (text: string, options?: SummaryOptions) => Promise<string>;
  
  // Batch operations
  batchProcess: (tasks: Array<Omit<AITask, 'id' | 'createdAt' | 'status'>>) => Promise<string[]>;
  prioritizeQueue: () => void;
  pauseProcessing: () => void;
  resumeProcessing: () => void;
  
  // Analytics
  getProviderPerformance: (providerId: string) => ProviderPerformance;
  getQueueAnalytics: () => QueueAnalytics;
  
  // Cleanup
  cleanup: () => void;
}

export interface ProviderTestResult {
  providerId: string;
  success: boolean;
  latency: number;
  error?: string;
  capabilities: string[];
}

export interface SentimentAnalysis {
  overall: 'positive' | 'neutral' | 'negative';
  confidence: number;
  emotions: Record<string, number>;
  topics: Array<{ topic: string; sentiment: number }>;
}

export interface SummaryOptions {
  maxLength?: number;
  style?: 'bullet' | 'paragraph' | 'executive';
  focus?: 'decisions' | 'actions' | 'general';
}

export interface ProviderPerformance {
  providerId: string;
  averageLatency: number;
  successRate: number;
  qualityScore: number;
  costEfficiency: number;
  totalTasks: number;
  period: string;
}

export interface QueueAnalytics {
  totalTasks: number;
  pendingTasks: number;
  processingTasks: number;
  completedTasks: number;
  errorTasks: number;
  averageWaitTime: number;
  averageProcessingTime: number;
  throughputPerHour: number;
}

const defaultAISettings: AISettings = {
  autoProcess: true,
  qualityThreshold: 0.8,
  parallelTasks: 3,
  retryAttempts: 2,
  preferredProvider: undefined,
  fallbackEnabled: true
};

const defaultAIState: AIState = {
  providers: [],
  activeProvider: undefined,
  isProcessing: false,
  processingQueue: [],
  results: [],
  settings: defaultAISettings
};

const generateTaskId = () => `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
const generateProviderId = () => `provider_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

export const createAISlice: StateCreator<
  AppState & StoreActions,
  [],
  [],
  AISlice
> = (set, get) => ({
  // Initial state
  ai: defaultAIState,
  
  // Provider management
  addProvider: (providerData) => {
    const id = generateProviderId();
    const provider: AIProvider = {
      id,
      ...providerData,
      status: 'disconnected',
      usage: {
        requestsToday: 0,
        tokensUsed: 0,
        costToday: 0,
        lastRequest: undefined,
        rateLimitRemaining: undefined
      }
    };
    
    set(produce((state: AppState) => {
      state.ai.providers.push(provider);
    }));
    
    return id;
  },
  
  updateProvider: (id, updates) => {
    set(produce((state: AppState) => {
      const provider = state.ai.providers.find(p => p.id === id);
      if (provider) {
        Object.assign(provider, updates);
      }
    }));
  },
  
  removeProvider: (id) => {
    set(produce((state: AppState) => {
      state.ai.providers = state.ai.providers.filter(p => p.id !== id);
      if (state.ai.activeProvider === id) {
        state.ai.activeProvider = undefined;
      }
    }));
  },
  
  setActiveProvider: (id) => {
    set(produce((state: AppState) => {
      state.ai.activeProvider = id || undefined;
    }));
  },
  
  testProvider: async (id): Promise<ProviderTestResult> => {
    const provider = get().ai.providers.find(p => p.id === id);
    if (!provider) {
      return {
        providerId: id,
        success: false,
        latency: 0,
        error: 'Provider not found',
        capabilities: []
      };
    }
    
    const startTime = performance.now();
    
    try {
      // Simulate provider test
      await new Promise(resolve => setTimeout(resolve, Math.random() * 500 + 100));
      
      const latency = performance.now() - startTime;
      
      get().updateProvider(id, { status: 'connected' });
      
      return {
        providerId: id,
        success: true,
        latency,
        capabilities: provider.capabilities.map(c => c.type)
      };
    } catch (error) {
      get().updateProvider(id, { status: 'error' });
      
      return {
        providerId: id,
        success: false,
        latency: 0,
        error: error instanceof Error ? error.message : 'Test failed',
        capabilities: []
      };
    }
  },
  
  // Task management
  queueTask: (taskData) => {
    const id = generateTaskId();
    const task: AITask = {
      id,
      ...taskData,
      status: 'queued',
      createdAt: new Date()
    };
    
    set(produce((state: AppState) => {
      state.ai.processingQueue.push(task);
    }));
    
    // Auto-process if enabled
    if (get().ai.settings.autoProcess) {
      setTimeout(() => get().processNextTask(), 100);
    }
    
    return id;
  },
  
  updateTask: (id, updates) => {
    set(produce((state: AppState) => {
      const task = state.ai.processingQueue.find(t => t.id === id);
      if (task) {
        Object.assign(task, updates);
      }
    }));
  },
  
  cancelTask: (id) => {
    set(produce((state: AppState) => {
      const task = state.ai.processingQueue.find(t => t.id === id);
      if (task && task.status === 'queued') {
        task.status = 'cancelled';
      }
    }));
  },
  
  processNextTask: async () => {
    const { ai } = get();
    
    if (ai.isProcessing || ai.processingQueue.length === 0) {
      return;
    }
    
    // Find next queued task
    const nextTask = ai.processingQueue.find(t => t.status === 'queued');
    if (!nextTask) {
      return;
    }
    
    set(produce((state: AppState) => {
      state.ai.isProcessing = true;
    }));
    
    const result = await get().processTask(nextTask.id);
    
    if (result) {
      get().addResult(result);
    }
    
    set(produce((state: AppState) => {
      state.ai.isProcessing = false;
    }));
    
    // Process next task if auto-process is enabled
    if (get().ai.settings.autoProcess) {
      setTimeout(() => get().processNextTask(), 100);
    }
  },
  
  processTask: async (taskId) => {
    const task = get().ai.processingQueue.find(t => t.id === taskId);
    if (!task) return null;
    
    const { ai } = get();
    const provider = ai.providers.find(p => p.id === ai.activeProvider);
    
    if (!provider) {
      get().updateTask(taskId, { 
        status: 'error', 
        error: 'No active provider',
        completedAt: new Date()
      });
      return null;
    }
    
    try {
      get().updateTask(taskId, { 
        status: 'processing', 
        startedAt: new Date() 
      });
      
      // Simulate AI processing
      const processingTime = Math.random() * 2000 + 500;
      await new Promise(resolve => setTimeout(resolve, processingTime));
      
      // Mock result based on task type
      let resultData: any;
      let confidence = 0.8 + Math.random() * 0.2;
      
      switch (task.type) {
        case 'transcription':
          resultData = { text: 'Mock transcription result', language: 'en' };
          break;
        case 'summarization':
          resultData = { summary: 'Mock summary of the content', keyPoints: ['Point 1', 'Point 2'] };
          break;
        case 'sentiment':
          resultData = { 
            sentiment: Math.random() > 0.5 ? 'positive' : 'negative',
            confidence: confidence,
            score: Math.random() * 2 - 1
          };
          break;
        case 'insight':
          resultData = { 
            insights: ['Insight 1', 'Insight 2'],
            topics: ['Topic A', 'Topic B']
          };
          break;
        default:
          resultData = { result: 'Mock result' };
      }
      
      const result: AIResult = {
        taskId,
        type: task.type,
        data: resultData,
        confidence,
        processingTime,
        provider: provider.id,
        timestamp: new Date()
      };
      
      get().updateTask(taskId, { 
        status: 'completed',
        completedAt: new Date()
      });
      
      // Update provider usage
      get().updateProviderUsage(provider.id, {
        requestsToday: provider.usage.requestsToday + 1,
        tokensUsed: provider.usage.tokensUsed + Math.floor(Math.random() * 1000),
        costToday: provider.usage.costToday + Math.random() * 0.1,
        lastRequest: new Date()
      });
      
      return result;
    } catch (error) {
      get().updateTask(taskId, { 
        status: 'error',
        error: error instanceof Error ? error.message : 'Processing failed',
        completedAt: new Date()
      });
      
      return null;
    }
  },
  
  // Results management
  addResult: (resultData) => {
    const result: AIResult = {
      ...resultData,
      timestamp: new Date()
    };
    
    set(produce((state: AppState) => {
      state.ai.results.push(result);
    }));
  },
  
  getResultsByTask: (taskId) => {
    return get().ai.results.filter(r => r.taskId === taskId);
  },
  
  getResultsByType: (type) => {
    return get().ai.results.filter(r => r.type === type);
  },
  
  clearResults: (olderThan) => {
    set(produce((state: AppState) => {
      if (olderThan) {
        state.ai.results = state.ai.results.filter(r => r.timestamp > olderThan);
      } else {
        state.ai.results = [];
      }
    }));
  },
  
  // Settings management
  updateSettings: (settingsUpdate) => {
    set(produce((state: AppState) => {
      Object.assign(state.ai.settings, settingsUpdate);
    }));
  },
  
  resetSettings: () => {
    set(produce((state: AppState) => {
      state.ai.settings = { ...defaultAISettings };
    }));
  },
  
  optimizeForUsage: (usage) => {
    const optimizations: Record<typeof usage, Partial<AISettings>> = {
      speed: {
        parallelTasks: 5,
        qualityThreshold: 0.6,
        retryAttempts: 1,
        fallbackEnabled: false
      },
      quality: {
        parallelTasks: 1,
        qualityThreshold: 0.9,
        retryAttempts: 3,
        fallbackEnabled: true
      },
      cost: {
        parallelTasks: 2,
        qualityThreshold: 0.7,
        retryAttempts: 1,
        fallbackEnabled: true
      }
    };
    
    get().updateSettings(optimizations[usage]);
  },
  
  // Provider usage tracking
  updateProviderUsage: (providerId, usageUpdate) => {
    set(produce((state: AppState) => {
      const provider = state.ai.providers.find(p => p.id === providerId);
      if (provider) {
        Object.assign(provider.usage, usageUpdate);
      }
    }));
  },
  
  getProviderCost: (providerId, period) => {
    const provider = get().ai.providers.find(p => p.id === providerId);
    if (!provider) return 0;
    
    // For now, return today's cost (would implement proper period filtering)
    return provider.usage.costToday;
  },
  
  resetProviderUsage: (providerId) => {
    set(produce((state: AppState) => {
      const provider = state.ai.providers.find(p => p.id === providerId);
      if (provider) {
        provider.usage = {
          requestsToday: 0,
          tokensUsed: 0,
          costToday: 0,
          lastRequest: undefined,
          rateLimitRemaining: undefined
        };
      }
    }));
  },
  
  // Intelligent analysis
  generateInsights: async (meetingId) => {
    // Queue multiple AI tasks for comprehensive analysis
    const tasks = [
      { type: 'summarization' as const, input: meetingId, priority: 'high' as const },
      { type: 'sentiment' as const, input: meetingId, priority: 'medium' as const },
      { type: 'insight' as const, input: meetingId, priority: 'medium' as const }
    ];
    
    const taskIds = await get().batchProcess(tasks);
    
    // Wait for results (simplified - would implement proper async handling)
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Generate mock insights based on results
    const insights: MeetingInsight[] = [
      {
        id: `insight_${Date.now()}_1`,
        type: 'summary',
        title: 'Meeting Summary',
        content: 'Mock comprehensive meeting summary',
        confidence: 0.9,
        relevance: 0.95,
        timestamp: new Date(),
        tags: ['summary', 'overview'],
        relatedSegments: []
      },
      {
        id: `insight_${Date.now()}_2`,
        type: 'action_item',
        title: 'Action Items',
        content: 'Follow up on project timeline',
        confidence: 0.85,
        relevance: 0.8,
        timestamp: new Date(),
        tags: ['action', 'follow-up'],
        relatedSegments: []
      }
    ];
    
    return insights;
  },
  
  analyzeSentiment: async (text) => {
    const taskId = get().queueTask({
      type: 'sentiment',
      input: { text },
      priority: 'medium'
    });
    
    // Wait for processing (simplified)
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Mock sentiment analysis
    return {
      overall: Math.random() > 0.5 ? 'positive' : 'negative',
      confidence: 0.8 + Math.random() * 0.2,
      emotions: {
        joy: Math.random(),
        anger: Math.random() * 0.3,
        sadness: Math.random() * 0.2,
        fear: Math.random() * 0.1
      },
      topics: [
        { topic: 'project', sentiment: Math.random() * 2 - 1 },
        { topic: 'timeline', sentiment: Math.random() * 2 - 1 }
      ]
    };
  },
  
  extractKeywords: async (text) => {
    get().queueTask({
      type: 'insight',
      input: { text, operation: 'keywords' },
      priority: 'low'
    });
    
    // Return mock keywords
    return ['meeting', 'project', 'timeline', 'discussion', 'decision'];
  },
  
  summarizeText: async (text, options = {}) => {
    get().queueTask({
      type: 'summarization',
      input: { text, options },
      priority: 'medium'
    });
    
    // Return mock summary
    return 'Mock summary of the provided text content with key points highlighted.';
  },
  
  // Batch operations
  batchProcess: async (tasks) => {
    const taskIds = tasks.map(task => get().queueTask(task));
    
    // Trigger processing
    if (get().ai.settings.autoProcess) {
      setTimeout(() => get().processNextTask(), 100);
    }
    
    return taskIds;
  },
  
  prioritizeQueue: () => {
    set(produce((state: AppState) => {
      state.ai.processingQueue.sort((a, b) => {
        const priorityOrder = { urgent: 4, high: 3, medium: 2, low: 1 };
        return priorityOrder[b.priority] - priorityOrder[a.priority];
      });
    }));
  },
  
  pauseProcessing: () => {
    set(produce((state: AppState) => {
      state.ai.settings.autoProcess = false;
    }));
  },
  
  resumeProcessing: () => {
    set(produce((state: AppState) => {
      state.ai.settings.autoProcess = true;
    }));
    
    // Resume processing
    setTimeout(() => get().processNextTask(), 100);
  },
  
  // Analytics
  getProviderPerformance: (providerId) => {
    const provider = get().ai.providers.find(p => p.id === providerId);
    const tasks = get().ai.processingQueue.filter(t => t.completedAt);
    
    if (!provider || tasks.length === 0) {
      return {
        providerId,
        averageLatency: 0,
        successRate: 0,
        qualityScore: 0,
        costEfficiency: 0,
        totalTasks: 0,
        period: '24h'
      };
    }
    
    const completedTasks = tasks.filter(t => t.status === 'completed');
    const successRate = completedTasks.length / tasks.length;
    
    return {
      providerId,
      averageLatency: 1500, // Mock
      successRate,
      qualityScore: 0.85, // Mock
      costEfficiency: 0.9, // Mock
      totalTasks: tasks.length,
      period: '24h'
    };
  },
  
  getQueueAnalytics: () => {
    const { processingQueue } = get().ai;
    
    const totalTasks = processingQueue.length;
    const pendingTasks = processingQueue.filter(t => t.status === 'queued').length;
    const processingTasks = processingQueue.filter(t => t.status === 'processing').length;
    const completedTasks = processingQueue.filter(t => t.status === 'completed').length;
    const errorTasks = processingQueue.filter(t => t.status === 'error').length;
    
    return {
      totalTasks,
      pendingTasks,
      processingTasks,
      completedTasks,
      errorTasks,
      averageWaitTime: 2000, // Mock
      averageProcessingTime: 1500, // Mock
      throughputPerHour: completedTasks * 60 // Mock
    };
  },
  
  // Cleanup
  cleanup: () => {
    set(produce((state: AppState) => {
      state.ai = { ...defaultAIState };
    }));
  }
});