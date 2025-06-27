// Performance Profiler and Benchmarking Tools
// Advanced profiling utilities for React components and application performance

interface ProfilerOptions {
  enabled: boolean;
  sampleRate: number;
  maxSamples: number;
  autoStart: boolean;
  includeStackTrace: boolean;
  trackMemory: boolean;
  trackUserTiming: boolean;
  trackResources: boolean;
}

interface PerformanceSample {
  id: string;
  name: string;
  startTime: number;
  endTime: number;
  duration: number;
  type: 'component' | 'function' | 'async' | 'render' | 'effect';
  metadata: any;
  stackTrace?: string;
  memoryBefore?: number;
  memoryAfter?: number;
  children: PerformanceSample[];
  tags: string[];
}

interface BenchmarkResult {
  name: string;
  samples: number;
  mean: number;
  median: number;
  min: number;
  max: number;
  stdDev: number;
  p95: number;
  p99: number;
  opsPerSecond: number;
  timestamp: number;
}

interface ProfileReport {
  id: string;
  name: string;
  duration: number;
  samples: PerformanceSample[];
  benchmarks: BenchmarkResult[];
  summary: {
    totalSamples: number;
    averageDuration: number;
    slowestOperations: PerformanceSample[];
    memoryUsage: {
      peak: number;
      average: number;
      allocations: number;
    };
    recommendations: string[];
  };
  timestamp: number;
}

export class PerformanceProfiler {
  private static instance: PerformanceProfiler;
  private options: ProfilerOptions;
  private samples: PerformanceSample[] = [];
  private activeSamples: Map<string, PerformanceSample> = new Map();
  private benchmarkResults: Map<string, BenchmarkResult[]> = new Map();
  private isRunning: boolean = false;
  private startTime: number = 0;
  private observer: PerformanceObserver | null = null;
  private memoryObserver: any = null;

  constructor(options: Partial<ProfilerOptions> = {}) {
    this.options = {
      enabled: true,
      sampleRate: 1.0,
      maxSamples: 10000,
      autoStart: false,
      includeStackTrace: false,
      trackMemory: true,
      trackUserTiming: true,
      trackResources: true,
      ...options
    };

    if (this.options.autoStart) {
      this.start();
    }
  }

  static getInstance(options?: Partial<ProfilerOptions>): PerformanceProfiler {
    if (!PerformanceProfiler.instance) {
      PerformanceProfiler.instance = new PerformanceProfiler(options);
    }
    return PerformanceProfiler.instance;
  }

  start(): void {
    if (!this.options.enabled || this.isRunning) return;

    this.isRunning = true;
    this.startTime = performance.now();
    this.samples = [];
    this.activeSamples.clear();

    // Set up performance observers
    this.setupObservers();

    console.log('Performance profiler started');
  }

  stop(): ProfileReport {
    if (!this.isRunning) {
      throw new Error('Profiler is not running');
    }

    this.isRunning = false;
    this.cleanupObservers();

    const duration = performance.now() - this.startTime;
    const report = this.generateReport(duration);

    console.log('Performance profiler stopped', report);
    return report;
  }

  private setupObservers(): void {
    if (!('PerformanceObserver' in window)) return;

    // User timing observer
    if (this.options.trackUserTiming) {
      try {
        this.observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (entry.entryType === 'measure') {
              this.addSample({
                id: this.generateId(),
                name: entry.name,
                startTime: entry.startTime,
                endTime: entry.startTime + entry.duration,
                duration: entry.duration,
                type: 'function',
                metadata: { entryType: entry.entryType },
                children: [],
                tags: ['user-timing']
              });
            }
          }
        });

        this.observer.observe({ entryTypes: ['measure', 'navigation', 'resource'] });
      } catch (error) {
        console.warn('Failed to setup performance observer:', error);
      }
    }

    // Memory observer (if available)
    if (this.options.trackMemory && 'memory' in performance) {
      this.startMemoryTracking();
    }
  }

  private startMemoryTracking(): void {
    const trackMemory = () => {
      if (!this.isRunning) return;

      const memInfo = (performance as any).memory;
      if (memInfo) {
        // Store memory snapshots
        this.addMemorySnapshot({
          timestamp: performance.now(),
          usedJSHeapSize: memInfo.usedJSHeapSize,
          totalJSHeapSize: memInfo.totalJSHeapSize,
          jsHeapSizeLimit: memInfo.jsHeapSizeLimit
        });
      }

      setTimeout(trackMemory, 100); // Track every 100ms
    };

    trackMemory();
  }

  private addMemorySnapshot(snapshot: any): void {
    // Store memory snapshots for analysis
    if (!this.memorySnapshots) {
      this.memorySnapshots = [];
    }
    this.memorySnapshots.push(snapshot);
  }

  private memorySnapshots: any[] = [];

  private cleanupObservers(): void {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
  }

  // Core profiling methods
  profile<T>(name: string, fn: () => T, options: { tags?: string[]; metadata?: any } = {}): T {
    if (!this.options.enabled || !this.shouldSample()) {
      return fn();
    }

    const sample = this.startSample(name, 'function', options);
    
    try {
      const result = fn();
      
      if (result instanceof Promise) {
        return result.finally(() => this.endSample(sample.id)) as any;
      } else {
        this.endSample(sample.id);
        return result;
      }
    } catch (error) {
      sample.metadata.error = error;
      this.endSample(sample.id);
      throw error;
    }
  }

  async profileAsync<T>(name: string, fn: () => Promise<T>, options: { tags?: string[]; metadata?: any } = {}): Promise<T> {
    if (!this.options.enabled || !this.shouldSample()) {
      return fn();
    }

    const sample = this.startSample(name, 'async', options);
    
    try {
      const result = await fn();
      this.endSample(sample.id);
      return result;
    } catch (error) {
      sample.metadata.error = error;
      this.endSample(sample.id);
      throw error;
    }
  }

  profileComponent(name: string, props?: any): { onRender: (id: string, phase: string, actualDuration: number) => void } {
    if (!this.options.enabled) {
      return { onRender: () => {} };
    }

    return {
      onRender: (id: string, phase: string, actualDuration: number) => {
        this.addSample({
          id: this.generateId(),
          name: `${name} (${phase})`,
          startTime: performance.now() - actualDuration,
          endTime: performance.now(),
          duration: actualDuration,
          type: 'component',
          metadata: { componentId: id, phase, props },
          children: [],
          tags: ['react', 'component']
        });
      }
    };
  }

  mark(name: string, metadata?: any): void {
    if (!this.options.enabled) return;

    performance.mark(name);
    
    this.addSample({
      id: this.generateId(),
      name,
      startTime: performance.now(),
      endTime: performance.now(),
      duration: 0,
      type: 'function',
      metadata: metadata || {},
      children: [],
      tags: ['mark']
    });
  }

  measure(name: string, startMark: string, endMark?: string): void {
    if (!this.options.enabled) return;

    performance.measure(name, startMark, endMark);
  }

  private startSample(name: string, type: PerformanceSample['type'], options: { tags?: string[]; metadata?: any } = {}): PerformanceSample {
    const id = this.generateId();
    const startTime = performance.now();
    
    const sample: PerformanceSample = {
      id,
      name,
      startTime,
      endTime: 0,
      duration: 0,
      type,
      metadata: options.metadata || {},
      children: [],
      tags: options.tags || []
    };

    if (this.options.includeStackTrace) {
      sample.stackTrace = new Error().stack;
    }

    if (this.options.trackMemory && 'memory' in performance) {
      sample.memoryBefore = (performance as any).memory.usedJSHeapSize;
    }

    this.activeSamples.set(id, sample);
    return sample;
  }

  private endSample(id: string): void {
    const sample = this.activeSamples.get(id);
    if (!sample) return;

    sample.endTime = performance.now();
    sample.duration = sample.endTime - sample.startTime;

    if (this.options.trackMemory && 'memory' in performance) {
      sample.memoryAfter = (performance as any).memory.usedJSHeapSize;
    }

    this.activeSamples.delete(id);
    this.addSample(sample);
  }

  private addSample(sample: PerformanceSample): void {
    if (this.samples.length >= this.options.maxSamples) {
      this.samples.shift(); // Remove oldest sample
    }

    this.samples.push(sample);
  }

  private shouldSample(): boolean {
    return Math.random() < this.options.sampleRate;
  }

  private generateId(): string {
    return `sample_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Benchmarking methods
  async benchmark(name: string, fn: () => any, options: {
    iterations?: number;
    warmupIterations?: number;
    timeout?: number;
  } = {}): Promise<BenchmarkResult> {
    const {
      iterations = 1000,
      warmupIterations = 100,
      timeout = 30000
    } = options;

    console.log(`Starting benchmark: ${name}`);

    // Warmup
    for (let i = 0; i < warmupIterations; i++) {
      await fn();
    }

    const times: number[] = [];
    const startTime = Date.now();

    for (let i = 0; i < iterations; i++) {
      if (Date.now() - startTime > timeout) {
        console.warn(`Benchmark ${name} timed out after ${i} iterations`);
        break;
      }

      const start = performance.now();
      await fn();
      const end = performance.now();
      times.push(end - start);
    }

    const result = this.calculateBenchmarkStats(name, times);
    
    // Store result
    const results = this.benchmarkResults.get(name) || [];
    results.push(result);
    this.benchmarkResults.set(name, results);

    console.log(`Benchmark ${name} completed:`, result);
    return result;
  }

  private calculateBenchmarkStats(name: string, times: number[]): BenchmarkResult {
    const sorted = [...times].sort((a, b) => a - b);
    const n = times.length;
    
    const mean = times.reduce((sum, time) => sum + time, 0) / n;
    const median = n % 2 === 0 
      ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2
      : sorted[Math.floor(n / 2)];
    
    const variance = times.reduce((sum, time) => sum + Math.pow(time - mean, 2), 0) / n;
    const stdDev = Math.sqrt(variance);
    
    const p95Index = Math.ceil(n * 0.95) - 1;
    const p99Index = Math.ceil(n * 0.99) - 1;

    return {
      name,
      samples: n,
      mean,
      median,
      min: sorted[0],
      max: sorted[n - 1],
      stdDev,
      p95: sorted[p95Index],
      p99: sorted[p99Index],
      opsPerSecond: 1000 / mean,
      timestamp: Date.now()
    };
  }

  // Comparison and analysis
  compareBenchmarks(name: string): { current: BenchmarkResult; previous?: BenchmarkResult; improvement?: number } {
    const results = this.benchmarkResults.get(name) || [];
    if (results.length === 0) {
      throw new Error(`No benchmark results found for ${name}`);
    }

    const current = results[results.length - 1];
    const previous = results.length > 1 ? results[results.length - 2] : undefined;
    
    let improvement: number | undefined;
    if (previous) {
      improvement = ((previous.mean - current.mean) / previous.mean) * 100;
    }

    return { current, previous, improvement };
  }

  private generateReport(duration: number): ProfileReport {
    const slowestOperations = [...this.samples]
      .sort((a, b) => b.duration - a.duration)
      .slice(0, 10);

    const averageDuration = this.samples.length > 0
      ? this.samples.reduce((sum, s) => sum + s.duration, 0) / this.samples.length
      : 0;

    let memoryUsage = {
      peak: 0,
      average: 0,
      allocations: 0
    };

    if (this.memorySnapshots && this.memorySnapshots.length > 0) {
      const memValues = this.memorySnapshots.map(s => s.usedJSHeapSize);
      memoryUsage = {
        peak: Math.max(...memValues),
        average: memValues.reduce((sum, val) => sum + val, 0) / memValues.length,
        allocations: this.memorySnapshots.length
      };
    }

    const recommendations = this.generateRecommendations(slowestOperations, memoryUsage);

    return {
      id: this.generateId(),
      name: `Profile Report ${new Date().toISOString()}`,
      duration,
      samples: this.samples,
      benchmarks: Array.from(this.benchmarkResults.values()).flat(),
      summary: {
        totalSamples: this.samples.length,
        averageDuration,
        slowestOperations,
        memoryUsage,
        recommendations
      },
      timestamp: Date.now()
    };
  }

  private generateRecommendations(slowestOperations: PerformanceSample[], memoryUsage: any): string[] {
    const recommendations: string[] = [];

    // Performance recommendations
    slowestOperations.forEach(op => {
      if (op.duration > 16) { // Longer than 1 frame at 60fps
        recommendations.push(`Optimize "${op.name}" - taking ${op.duration.toFixed(2)}ms`);
      }
    });

    // Memory recommendations
    if (memoryUsage.peak > 100 * 1024 * 1024) { // > 100MB
      recommendations.push('High memory usage detected - consider memory optimization');
    }

    // Component-specific recommendations
    const componentSamples = this.samples.filter(s => s.type === 'component');
    const slowComponents = componentSamples.filter(s => s.duration > 5);
    
    if (slowComponents.length > 0) {
      recommendations.push('Consider memoizing slow components or using React.memo');
    }

    // Async operation recommendations
    const asyncSamples = this.samples.filter(s => s.type === 'async');
    const slowAsync = asyncSamples.filter(s => s.duration > 100);
    
    if (slowAsync.length > 0) {
      recommendations.push('Optimize slow async operations or implement caching');
    }

    return recommendations;
  }

  // Export/Import functionality
  exportReport(report: ProfileReport): string {
    return JSON.stringify(report, null, 2);
  }

  exportSamples(): string {
    return JSON.stringify({
      samples: this.samples,
      benchmarks: Array.from(this.benchmarkResults.entries()),
      metadata: {
        exportTime: Date.now(),
        sampleCount: this.samples.length
      }
    }, null, 2);
  }

  // Utility methods
  getSamples(filter?: (sample: PerformanceSample) => boolean): PerformanceSample[] {
    return filter ? this.samples.filter(filter) : [...this.samples];
  }

  getBenchmarks(name?: string): BenchmarkResult[] {
    if (name) {
      return this.benchmarkResults.get(name) || [];
    }
    return Array.from(this.benchmarkResults.values()).flat();
  }

  clear(): void {
    this.samples = [];
    this.activeSamples.clear();
    this.benchmarkResults.clear();
    this.memorySnapshots = [];
  }

  getStats(): {
    isRunning: boolean;
    sampleCount: number;
    activeSamples: number;
    benchmarkCount: number;
    memorySnapshots: number;
  } {
    return {
      isRunning: this.isRunning,
      sampleCount: this.samples.length,
      activeSamples: this.activeSamples.size,
      benchmarkCount: Array.from(this.benchmarkResults.values()).flat().length,
      memorySnapshots: this.memorySnapshots?.length || 0
    };
  }
}

// React hook for profiling
export function useProfiler(name: string, enabled: boolean = true) {
  const profiler = React.useMemo(() => PerformanceProfiler.getInstance(), []);
  
  const profile = React.useCallback(<T>(fn: () => T, options?: any): T => {
    if (!enabled) return fn();
    return profiler.profile(name, fn, options);
  }, [profiler, name, enabled]);

  const profileAsync = React.useCallback(<T>(fn: () => Promise<T>, options?: any): Promise<T> => {
    if (!enabled) return fn();
    return profiler.profileAsync(name, fn, options);
  }, [profiler, name, enabled]);

  const mark = React.useCallback((markName: string, metadata?: any) => {
    if (!enabled) return;
    profiler.mark(`${name}.${markName}`, metadata);
  }, [profiler, name, enabled]);

  return { profile, profileAsync, mark };
}

// Decorator for automatic profiling
export function profileFunction(name?: string) {
  return function(target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    const profiler = PerformanceProfiler.getInstance();
    const functionName = name || `${target.constructor.name}.${propertyKey}`;

    descriptor.value = function(...args: any[]) {
      return profiler.profile(functionName, () => originalMethod.apply(this, args));
    };

    return descriptor;
  };
}

// HOC for component profiling
export function withProfiler<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  profilerName?: string
) {
  const ComponentWithProfiler = React.forwardRef<any, P>((props, ref) => {
    const profiler = PerformanceProfiler.getInstance();
    const name = profilerName || WrappedComponent.displayName || WrappedComponent.name || 'Component';

    return (
      <React.Profiler {...profiler.profileComponent(name, props)}>
        <WrappedComponent {...props} ref={ref} />
      </React.Profiler>
    );
  });

  ComponentWithProfiler.displayName = `withProfiler(${WrappedComponent.displayName || WrappedComponent.name})`;

  return ComponentWithProfiler;
}

// Export singleton instance
export const performanceProfiler = PerformanceProfiler.getInstance({
  enabled: process.env.NODE_ENV === 'development',
  sampleRate: 0.1, // Sample 10% in production
  maxSamples: 5000,
  autoStart: true,
  trackMemory: true,
  trackUserTiming: true
});