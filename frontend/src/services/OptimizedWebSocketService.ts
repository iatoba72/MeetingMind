// Optimized WebSocket Service with Message Batching
// High-performance real-time communication with automatic batching and retry logic

interface WebSocketMessage {
  id: string;
  type: string;
  payload: any;
  timestamp: number;
  priority: 'low' | 'medium' | 'high' | 'critical';
  retryCount?: number;
  maxRetries?: number;
}

interface BatchedMessage {
  messages: WebSocketMessage[];
  totalSize: number;
  batchId: string;
  timestamp: number;
}

interface ConnectionConfig {
  url: string;
  protocols?: string[];
  maxReconnectAttempts: number;
  reconnectInterval: number;
  heartbeatInterval: number;
  batchSize: number;
  batchTimeout: number;
  maxMessageSize: number;
  compressionThreshold: number;
  enableCompression: boolean;
  priorityQueues: boolean;
}

interface ConnectionStats {
  isConnected: boolean;
  connectionAttempts: number;
  messagesReceived: number;
  messagesSent: number;
  bytesReceived: number;
  bytesSent: number;
  batchesSent: number;
  averageBatchSize: number;
  averageLatency: number;
  errorCount: number;
  lastActivity: number;
  connectionUptime: number;
  reconnectCount: number;
}

interface MessageCallback {
  (message: any): void;
}

interface ErrorCallback {
  (error: Event | Error): void;
}

interface ConnectionCallback {
  (): void;
}

export class OptimizedWebSocketService {
  private ws: WebSocket | null = null;
  private config: ConnectionConfig;
  private stats: ConnectionStats;
  private messageQueue: Map<string, WebSocketMessage[]> = new Map();
  private batchTimer: NodeJS.Timeout | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private messageCallbacks: Map<string, MessageCallback[]> = new Map();
  private errorCallbacks: ErrorCallback[] = [];
  private connectionCallbacks: ConnectionCallback[] = [];
  private disconnectionCallbacks: ConnectionCallback[] = [];
  private pendingMessages: Map<string, WebSocketMessage> = new Map();
  private connectionStartTime: number = 0;
  private lastPingTime: number = 0;
  private latencyBuffer: number[] = [];
  private compressionWorker: Worker | null = null;

  constructor(config: Partial<ConnectionConfig> = {}) {
    this.config = {
      url: '',
      maxReconnectAttempts: 5,
      reconnectInterval: 1000,
      heartbeatInterval: 30000,
      batchSize: 10,
      batchTimeout: 100,
      maxMessageSize: 1024 * 1024, // 1MB
      compressionThreshold: 1024, // 1KB
      enableCompression: true,
      priorityQueues: true,
      ...config
    };

    this.stats = {
      isConnected: false,
      connectionAttempts: 0,
      messagesReceived: 0,
      messagesSent: 0,
      bytesReceived: 0,
      bytesSent: 0,
      batchesSent: 0,
      averageBatchSize: 0,
      averageLatency: 0,
      errorCount: 0,
      lastActivity: Date.now(),
      connectionUptime: 0,
      reconnectCount: 0
    };

    // Initialize priority queues
    if (this.config.priorityQueues) {
      this.messageQueue.set('critical', []);
      this.messageQueue.set('high', []);
      this.messageQueue.set('medium', []);
      this.messageQueue.set('low', []);
    } else {
      this.messageQueue.set('default', []);
    }

    this.initializeCompression();
  }

  private initializeCompression(): void {
    if (!this.config.enableCompression || typeof Worker === 'undefined') return;

    try {
      const workerCode = `
        // Compression worker for WebSocket messages
        self.onmessage = function(e) {
          const { action, data, id } = e.data;
          
          try {
            if (action === 'compress') {
              // Simple compression - in production, use a proper compression library
              const compressed = JSON.stringify(data);
              const savings = (data.length - compressed.length) / data.length;
              
              self.postMessage({
                id,
                result: compressed,
                originalSize: data.length,
                compressedSize: compressed.length,
                compressionRatio: savings
              });
            } else if (action === 'decompress') {
              const decompressed = JSON.parse(data);
              self.postMessage({ id, result: decompressed });
            }
          } catch (error) {
            self.postMessage({ id, error: error.message });
          }
        };
      `;

      const blob = new Blob([workerCode], { type: 'application/javascript' });
      this.compressionWorker = new Worker(URL.createObjectURL(blob));
    } catch (error) {
      console.warn('WebSocket compression worker initialization failed:', error);
    }
  }

  async connect(url?: string): Promise<void> {
    const wsUrl = url || this.config.url;
    if (!wsUrl) {
      throw new Error('WebSocket URL is required');
    }

    this.config.url = wsUrl;
    this.stats.connectionAttempts++;
    this.connectionStartTime = Date.now();

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(wsUrl, this.config.protocols);

        this.ws.onopen = (event) => { // eslint-disable-line @typescript-eslint/no-unused-vars
          this.stats.isConnected = true;
          this.stats.lastActivity = Date.now();
          this.stats.connectionUptime = 0;
          
          this.startHeartbeat();
          this.processBatchedMessages();
          
          this.connectionCallbacks.forEach(callback => callback());
          resolve();
        };

        this.ws.onmessage = (event) => {
          this.handleMessage(event);
        };

        this.ws.onerror = (error) => {
          this.stats.errorCount++;
          this.errorCallbacks.forEach(callback => callback(error));
          reject(error);
        };

        this.ws.onclose = (event) => {
          this.handleDisconnection(event);
        };

      } catch (error) {
        this.stats.errorCount++;
        reject(error);
      }
    });
  }

  private async handleMessage(event: MessageEvent): Promise<void> {
    try {
      this.stats.messagesReceived++;
      this.stats.bytesReceived += event.data.length;
      this.stats.lastActivity = Date.now();

      let data;
      
      // Handle compressed messages
      if (typeof event.data === 'string' && event.data.startsWith('COMPRESSED:')) {
        const compressedData = event.data.substring(11);
        data = await this.decompressMessage(compressedData);
      } else {
        data = JSON.parse(event.data);
      }

      // Handle different message types
      if (data.type === 'batch') {
        // Process batched messages
        for (const message of data.messages) {
          await this.processMessage(message);
        }
      } else if (data.type === 'pong') {
        // Handle heartbeat response
        this.handlePong(data);
      } else {
        await this.processMessage(data);
      }

    } catch (error) {
      console.error('Error handling WebSocket message:', error);
      this.stats.errorCount++;
    }
  }

  private async processMessage(message: any): Promise<void> {
    const callbacks = this.messageCallbacks.get(message.type) || [];
    
    // Execute callbacks concurrently
    const promises = callbacks.map(callback => {
      try {
        return Promise.resolve(callback(message));
      } catch (error) {
        console.error(`Error in message callback for type ${message.type}:`, error);
        return Promise.resolve();
      }
    });

    await Promise.all(promises);

    // Handle acknowledgments
    if (message.ack && this.pendingMessages.has(message.ack)) {
      this.pendingMessages.delete(message.ack);
    }
  }

  private handlePong(data: any): void {
    if (data.timestamp && this.lastPingTime) {
      const latency = Date.now() - this.lastPingTime;
      this.updateLatencyStats(latency);
    }
  }

  private updateLatencyStats(latency: number): void {
    this.latencyBuffer.push(latency);
    
    // Keep only last 100 measurements
    if (this.latencyBuffer.length > 100) {
      this.latencyBuffer.shift();
    }

    // Calculate average latency
    this.stats.averageLatency = this.latencyBuffer.reduce((sum, lat) => sum + lat, 0) / this.latencyBuffer.length;
  }

  private handleDisconnection(event: CloseEvent): void {
    this.stats.isConnected = false;
    this.stats.connectionUptime = Date.now() - this.connectionStartTime;
    
    this.stopHeartbeat();
    this.disconnectionCallbacks.forEach(callback => callback());

    // Attempt reconnection if not manually closed
    if (event.code !== 1000 && this.stats.reconnectCount < this.config.maxReconnectAttempts) {
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    this.stats.reconnectCount++;
    
    const delay = Math.min(
      this.config.reconnectInterval * Math.pow(2, this.stats.reconnectCount - 1),
      30000 // Max 30 seconds
    );

    this.reconnectTimer = setTimeout(async () => {
      try {
        await this.connect();
        this.stats.reconnectCount = 0; // Reset on successful reconnection
      } catch (error) {
        console.error('Reconnection failed:', error);
      }
    }, delay);
  }

  async send(type: string, payload: any, options: {
    priority?: 'low' | 'medium' | 'high' | 'critical';
    expectAck?: boolean;
    maxRetries?: number;
    timeout?: number;
  } = {}): Promise<void> {
    const message: WebSocketMessage = {
      id: this.generateMessageId(),
      type,
      payload,
      timestamp: Date.now(),
      priority: options.priority || 'medium',
      retryCount: 0,
      maxRetries: options.maxRetries || 3
    };

    if (options.expectAck) {
      this.pendingMessages.set(message.id, message);
      
      // Set timeout for acknowledgment
      if (options.timeout) {
        setTimeout(() => {
          if (this.pendingMessages.has(message.id)) {
            console.warn(`Message ${message.id} acknowledgment timeout`);
            this.pendingMessages.delete(message.id);
          }
        }, options.timeout);
      }
    }

    await this.queueMessage(message);
  }

  private async queueMessage(message: WebSocketMessage): Promise<void> {
    const queueName = this.config.priorityQueues ? message.priority : 'default';
    const queue = this.messageQueue.get(queueName) || [];
    
    queue.push(message);
    this.messageQueue.set(queueName, queue);

    // Trigger batch processing
    this.scheduleBatchSend();
  }

  private scheduleBatchSend(): void {
    if (this.batchTimer) return;

    this.batchTimer = setTimeout(() => {
      this.processBatchedMessages();
      this.batchTimer = null;
    }, this.config.batchTimeout);
  }

  private async processBatchedMessages(): Promise<void> {
    if (!this.stats.isConnected || !this.ws) return;

    const batch: WebSocketMessage[] = [];
    let totalSize = 0;

    // Collect messages by priority
    const priorities = this.config.priorityQueues 
      ? ['critical', 'high', 'medium', 'low'] 
      : ['default'];

    for (const priority of priorities) {
      const queue = this.messageQueue.get(priority) || [];
      
      while (queue.length > 0 && batch.length < this.config.batchSize) {
        const message = queue.shift()!;
        const messageSize = this.calculateMessageSize(message);
        
        if (totalSize + messageSize > this.config.maxMessageSize && batch.length > 0) {
          // Current batch is full, put message back and process current batch
          queue.unshift(message);
          break;
        }

        batch.push(message);
        totalSize += messageSize;
      }

      this.messageQueue.set(priority, queue);
    }

    if (batch.length === 0) return;

    try {
      await this.sendBatch(batch, totalSize);
    } catch (error) {
      console.error('Failed to send batch:', error);
      // Re-queue failed messages for retry
      this.requeueFailedMessages(batch);
    }
  }

  private async sendBatch(messages: WebSocketMessage[], totalSize: number): Promise<void> {
    const batchedMessage: BatchedMessage = {
      messages,
      totalSize,
      batchId: this.generateMessageId(),
      timestamp: Date.now()
    };

    let payload: string;

    // Compress large batches
    if (this.config.enableCompression && totalSize > this.config.compressionThreshold) {
      payload = await this.compressMessage(batchedMessage);
      payload = 'COMPRESSED:' + payload;
    } else {
      payload = JSON.stringify({
        type: 'batch',
        ...batchedMessage
      });
    }

    this.ws!.send(payload);

    // Update statistics
    this.stats.messagesSent += messages.length;
    this.stats.bytesSent += payload.length;
    this.stats.batchesSent++;
    this.stats.averageBatchSize = this.stats.messagesSent / this.stats.batchesSent;
    this.stats.lastActivity = Date.now();
  }

  private async compressMessage(data: any): Promise<string> {
    if (!this.compressionWorker) {
      return JSON.stringify(data);
    }

    return new Promise((resolve, reject) => {
      const id = this.generateMessageId();
      
      const handleWorkerMessage = (e: MessageEvent) => {
        if (e.data.id === id) {
          this.compressionWorker!.removeEventListener('message', handleWorkerMessage);
          
          if (e.data.error) {
            reject(new Error(e.data.error));
          } else {
            resolve(e.data.result);
          }
        }
      };

      this.compressionWorker.addEventListener('message', handleWorkerMessage);
      this.compressionWorker.postMessage({
        action: 'compress',
        data: JSON.stringify(data),
        id
      });

      // Timeout fallback
      setTimeout(() => {
        this.compressionWorker!.removeEventListener('message', handleWorkerMessage);
        resolve(JSON.stringify(data));
      }, 1000);
    });
  }

  private async decompressMessage(data: string): Promise<any> {
    if (!this.compressionWorker) {
      return JSON.parse(data);
    }

    return new Promise((resolve, reject) => {
      const id = this.generateMessageId();
      
      const handleWorkerMessage = (e: MessageEvent) => {
        if (e.data.id === id) {
          this.compressionWorker!.removeEventListener('message', handleWorkerMessage);
          
          if (e.data.error) {
            reject(new Error(e.data.error));
          } else {
            resolve(e.data.result);
          }
        }
      };

      this.compressionWorker.addEventListener('message', handleWorkerMessage);
      this.compressionWorker.postMessage({
        action: 'decompress',
        data,
        id
      });

      // Timeout fallback
      setTimeout(() => {
        this.compressionWorker!.removeEventListener('message', handleWorkerMessage);
        resolve(JSON.parse(data));
      }, 1000);
    });
  }

  private requeueFailedMessages(messages: WebSocketMessage[]): void {
    for (const message of messages) {
      message.retryCount = (message.retryCount || 0) + 1;
      
      if (message.retryCount <= (message.maxRetries || 3)) {
        // Requeue with exponential backoff
        setTimeout(() => {
          this.queueMessage(message);
        }, Math.pow(2, message.retryCount) * 1000);
      } else {
        console.error(`Message ${message.id} exceeded max retries`);
        this.pendingMessages.delete(message.id);
      }
    }
  }

  private calculateMessageSize(message: WebSocketMessage): number {
    try {
      return new TextEncoder().encode(JSON.stringify(message)).length;
    } catch {
      return 1000; // Default estimate
    }
  }

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      if (this.stats.isConnected && this.ws) {
        this.lastPingTime = Date.now();
        this.send('ping', { timestamp: this.lastPingTime }, { priority: 'critical' });
      }
    }, this.config.heartbeatInterval);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private generateMessageId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Public API methods
  onMessage(type: string, callback: MessageCallback): void {
    const callbacks = this.messageCallbacks.get(type) || [];
    callbacks.push(callback);
    this.messageCallbacks.set(type, callbacks);
  }

  offMessage(type: string, callback?: MessageCallback): void {
    if (!callback) {
      this.messageCallbacks.delete(type);
      return;
    }

    const callbacks = this.messageCallbacks.get(type) || [];
    const index = callbacks.indexOf(callback);
    if (index > -1) {
      callbacks.splice(index, 1);
      this.messageCallbacks.set(type, callbacks);
    }
  }

  onError(callback: ErrorCallback): void {
    this.errorCallbacks.push(callback);
  }

  onConnect(callback: ConnectionCallback): void {
    this.connectionCallbacks.push(callback);
  }

  onDisconnect(callback: ConnectionCallback): void {
    this.disconnectionCallbacks.push(callback);
  }

  getStats(): ConnectionStats {
    if (this.stats.isConnected) {
      this.stats.connectionUptime = Date.now() - this.connectionStartTime;
    }
    
    return { ...this.stats };
  }

  getQueueStatus(): { [queueName: string]: number } {
    const status: { [queueName: string]: number } = {};
    
    for (const [queueName, queue] of this.messageQueue.entries()) {
      status[queueName] = queue.length;
    }

    return status;
  }

  getPendingAcks(): number {
    return this.pendingMessages.size;
  }

  async flush(): Promise<void> {
    // Force send all queued messages immediately
    while (this.hasQueuedMessages()) {
      await this.processBatchedMessages();
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  }

  private hasQueuedMessages(): boolean {
    for (const queue of this.messageQueue.values()) {
      if (queue.length > 0) return true;
    }
    return false;
  }

  async disconnect(): Promise<void> {
    // Clear timers
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }
    
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this.stopHeartbeat();

    // Flush pending messages
    await this.flush();

    // Close connection
    if (this.ws && this.stats.isConnected) {
      this.ws.close(1000, 'Normal closure');
    }

    // Cleanup worker
    if (this.compressionWorker) {
      this.compressionWorker.terminate();
      this.compressionWorker = null;
    }

    // Clear state
    this.messageQueue.clear();
    this.pendingMessages.clear();
    this.messageCallbacks.clear();
    this.errorCallbacks.length = 0;
    this.connectionCallbacks.length = 0;
    this.disconnectionCallbacks.length = 0;
  }

  // Configuration methods
  updateConfig(newConfig: Partial<ConnectionConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  setBatchSize(size: number): void {
    this.config.batchSize = Math.max(1, Math.min(size, 100));
  }

  setBatchTimeout(timeout: number): void {
    this.config.batchTimeout = Math.max(10, Math.min(timeout, 5000));
  }

  setCompressionThreshold(threshold: number): void {
    this.config.compressionThreshold = Math.max(100, threshold);
  }

  // Utility methods for specific use cases
  async sendTranscriptUpdate(transcriptId: string, segments: any[]): Promise<void> {
    await this.send('transcript_update', {
      transcriptId,
      segments,
      timestamp: Date.now()
    }, {
      priority: 'high',
      expectAck: true,
      timeout: 5000
    });
  }

  async sendCollaborationEvent(eventType: string, data: any): Promise<void> {
    await this.send('collaboration', {
      eventType,
      data,
      timestamp: Date.now()
    }, {
      priority: 'medium',
      expectAck: false
    });
  }

  async sendSystemNotification(notification: any): Promise<void> {
    await this.send('system_notification', notification, {
      priority: 'critical',
      expectAck: true,
      maxRetries: 5,
      timeout: 10000
    });
  }
}

// Export singleton instance with default configuration
export const optimizedWebSocketService = new OptimizedWebSocketService({
  batchSize: 20,
  batchTimeout: 50,
  maxReconnectAttempts: 10,
  reconnectInterval: 1000,
  heartbeatInterval: 30000,
  enableCompression: true,
  compressionThreshold: 2048,
  priorityQueues: true
});

// React hook for WebSocket connection
export function useOptimizedWebSocket(url: string, options: {
  autoConnect?: boolean;
  onMessage?: (type: string, callback: MessageCallback) => void;
  onError?: ErrorCallback;
  onConnect?: ConnectionCallback;
  onDisconnect?: ConnectionCallback;
} = {}) {
  const [isConnected, setIsConnected] = React.useState(false);
  const [stats, setStats] = React.useState<ConnectionStats | null>(null);
  const wsRef = React.useRef<OptimizedWebSocketService | null>(null);

  React.useEffect(() => {
    const ws = new OptimizedWebSocketService();
    wsRef.current = ws;

    // Set up event listeners
    ws.onConnect(() => {
      setIsConnected(true);
      options.onConnect?.();
    });

    ws.onDisconnect(() => {
      setIsConnected(false);
      options.onDisconnect?.();
    });

    if (options.onError) {
      ws.onError(options.onError);
    }

    // Auto-connect if requested
    if (options.autoConnect !== false) {
      ws.connect(url).catch(console.error);
    }

    // Update stats periodically
    const statsInterval = setInterval(() => {
      setStats(ws.getStats());
    }, 1000);

    return () => {
      clearInterval(statsInterval);
      ws.disconnect();
    };
  }, [url]);

  return {
    isConnected,
    stats,
    send: wsRef.current?.send.bind(wsRef.current),
    onMessage: wsRef.current?.onMessage.bind(wsRef.current),
    offMessage: wsRef.current?.offMessage.bind(wsRef.current),
    connect: wsRef.current?.connect.bind(wsRef.current),
    disconnect: wsRef.current?.disconnect.bind(wsRef.current),
    flush: wsRef.current?.flush.bind(wsRef.current),
    getQueueStatus: wsRef.current?.getQueueStatus.bind(wsRef.current),
    updateConfig: wsRef.current?.updateConfig.bind(wsRef.current)
  };
}