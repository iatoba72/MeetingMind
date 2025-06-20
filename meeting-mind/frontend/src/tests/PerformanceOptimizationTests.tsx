// Comprehensive Performance Optimization Test Suite
// Validates all implemented performance optimizations and measures their impact

import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { act } from 'react-dom/test-utils';
import { performance } from 'perf_hooks';

// Import components to test
import { VirtualizedTranscript } from '../components/VirtualizedTranscript';
import { LazyMeetingHistory } from '../components/LazyMeetingHistory';
import { PerformanceMonitoringDashboard } from '../components/PerformanceMonitoringDashboard';
import { PerformanceClinic } from '../components/PerformanceClinic';
import { OptimizedWebSocketService } from '../services/OptimizedWebSocketService';
import { CacheManager, cacheManager } from '../utils/CacheManager';
import { PerformanceProfiler, performanceProfiler } from '../utils/PerformanceProfiler';

// Mock data generators
const generateTranscriptSegments = (count: number) => {
  return Array.from({ length: count }, (_, i) => ({
    id: `segment_${i}`,
    speaker: `Speaker ${(i % 3) + 1}`,
    speakerId: `speaker_${(i % 3) + 1}`,
    text: `This is transcript segment ${i + 1}. It contains some sample text that would normally be spoken content from a meeting transcription. This helps us test the virtual scrolling performance with realistic data lengths.`,
    timestamp: Date.now() - (count - i) * 5000,
    confidence: 0.85 + Math.random() * 0.15,
    duration: 3 + Math.random() * 4,
    sentiment: ['positive', 'negative', 'neutral'][i % 3] as any,
    tags: ['important', 'action-item', 'decision'][i % 3] ? [['important', 'action-item', 'decision'][i % 3]] : []
  }));
};

const generateMeetings = (count: number) => {
  return Array.from({ length: count }, (_, i) => ({
    id: `meeting_${i}`,
    title: `Meeting ${i + 1} - ${['Weekly Sync', 'Project Review', 'Strategy Session'][i % 3]}`,
    description: `Description for meeting ${i + 1}`,
    startTime: new Date(Date.now() - (count - i) * 86400000).toISOString(),
    endTime: new Date(Date.now() - (count - i) * 86400000 + 3600000).toISOString(),
    duration: 60,
    participants: [
      { id: `user_${i}_1`, name: `User ${i}-1`, email: `user${i}1@test.com`, role: 'host' as any },
      { id: `user_${i}_2`, name: `User ${i}-2`, email: `user${i}2@test.com`, role: 'attendee' as any }
    ],
    status: 'completed' as any,
    tags: ['important'],
    isStarred: false,
    createdBy: `user_${i}_1`,
    lastModified: new Date().toISOString(),
    size: 1024 * 1024,
    hasAI: true
  }));
};

// Performance measurement utilities
class PerformanceTestSuite {
  private measurements: Map<string, number[]> = new Map();
  private memoryBaselines: Map<string, number> = new Map();

  startMeasurement(testName: string): string {
    const measurementId = `${testName}_${Date.now()}_${Math.random()}`;
    performance.mark(`${measurementId}_start`);
    
    // Record memory baseline if available
    if ('memory' in performance) {
      this.memoryBaselines.set(measurementId, (performance as any).memory.usedJSHeapSize);
    }
    
    return measurementId;
  }

  endMeasurement(measurementId: string): { duration: number; memoryDelta?: number } {
    performance.mark(`${measurementId}_end`);
    performance.measure(measurementId, `${measurementId}_start`, `${measurementId}_end`);
    
    const measure = performance.getEntriesByName(measurementId)[0];
    const duration = measure.duration;
    
    // Store measurement
    const testName = measurementId.split('_')[0];
    const measurements = this.measurements.get(testName) || [];
    measurements.push(duration);
    this.measurements.set(testName, measurements);
    
    // Calculate memory delta
    let memoryDelta: number | undefined;
    if ('memory' in performance && this.memoryBaselines.has(measurementId)) {
      const baseline = this.memoryBaselines.get(measurementId)!;
      const current = (performance as any).memory.usedJSHeapSize;
      memoryDelta = current - baseline;
      this.memoryBaselines.delete(measurementId);
    }
    
    // Cleanup
    performance.clearMarks(`${measurementId}_start`);
    performance.clearMarks(`${measurementId}_end`);
    performance.clearMeasures(measurementId);
    
    return { duration, memoryDelta };
  }

  getTestResults(testName: string) {
    const measurements = this.measurements.get(testName) || [];
    if (measurements.length === 0) return null;

    const sorted = [...measurements].sort((a, b) => a - b);
    return {
      count: measurements.length,
      min: sorted[0],
      max: sorted[sorted.length - 1],
      mean: measurements.reduce((sum, val) => sum + val, 0) / measurements.length,
      median: sorted[Math.floor(sorted.length / 2)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      p99: sorted[Math.floor(sorted.length * 0.99)]
    };
  }

  getAllResults() {
    const results: { [key: string]: any } = {};
    for (const [testName] of this.measurements) {
      results[testName] = this.getTestResults(testName);
    }
    return results;
  }

  clear() {
    this.measurements.clear();
    this.memoryBaselines.clear();
  }
}

const perfTestSuite = new PerformanceTestSuite();

// Virtual Scrolling Performance Tests
describe('Virtual Scrolling Performance', () => {
  beforeEach(() => {
    perfTestSuite.clear();
  });

  test('should render large transcript efficiently', async () => {
    const segments = generateTranscriptSegments(10000);
    const measurementId = perfTestSuite.startMeasurement('virtual_scrolling_render');
    
    const { container } = render(
      <VirtualizedTranscript
        segments={segments}
        enableVirtualization={true}
        itemHeight={120}
        bufferSize={5}
      />
    );
    
    await waitFor(() => {
      expect(container.querySelector('.transcript-virtual-list')).toBeInTheDocument();
    });
    
    const { duration, memoryDelta } = perfTestSuite.endMeasurement(measurementId);
    
    // Performance assertions
    expect(duration).toBeLessThan(100); // Should render in less than 100ms
    if (memoryDelta !== undefined) {
      expect(memoryDelta).toBeLessThan(50 * 1024 * 1024); // Less than 50MB memory increase
    }
  });

  test('should handle scrolling performance', async () => {
    const segments = generateTranscriptSegments(5000);
    
    const { container } = render(
      <VirtualizedTranscript
        segments={segments}
        enableVirtualization={true}
        itemHeight={120}
      />
    );

    await waitFor(() => {
      expect(container.querySelector('.transcript-virtual-list')).toBeInTheDocument();
    });

    const scrollContainer = container.querySelector('.transcript-virtual-list');
    expect(scrollContainer).toBeInTheDocument();

    // Measure scroll performance
    const measurementId = perfTestSuite.startMeasurement('virtual_scrolling_scroll');
    
    // Simulate rapid scrolling
    for (let i = 0; i < 10; i++) {
      act(() => {
        fireEvent.scroll(scrollContainer!, { target: { scrollTop: i * 1000 } });
      });
    }
    
    const { duration } = perfTestSuite.endMeasurement(measurementId);
    expect(duration).toBeLessThan(50); // Scroll operations should be very fast
  });

  test('should search efficiently in large transcript', async () => {
    const segments = generateTranscriptSegments(2000);
    
    const { rerender } = render(
      <VirtualizedTranscript
        segments={segments}
        enableVirtualization={true}
        searchQuery=""
      />
    );

    // Measure search performance
    const measurementId = perfTestSuite.startMeasurement('virtual_scrolling_search');
    
    rerender(
      <VirtualizedTranscript
        segments={segments}
        enableVirtualization={true}
        searchQuery="segment"
      />
    );
    
    const { duration } = perfTestSuite.endMeasurement(measurementId);
    expect(duration).toBeLessThan(20); // Search should be very fast
  });
});

// Lazy Loading Performance Tests
describe('Lazy Loading Performance', () => {
  beforeEach(() => {
    perfTestSuite.clear();
  });

  test('should load initial meetings quickly', async () => {
    const measurementId = perfTestSuite.startMeasurement('lazy_loading_initial');
    
    render(<LazyMeetingHistory pageSize={20} enableInfiniteScroll={true} />);
    
    await waitFor(() => {
      expect(screen.getByText('Meeting History')).toBeInTheDocument();
    });
    
    const { duration } = perfTestSuite.endMeasurement(measurementId);
    expect(duration).toBeLessThan(200); // Initial load should be fast
  });

  test('should handle infinite scroll performance', async () => {
    const { container } = render(
      <LazyMeetingHistory pageSize={10} enableInfiniteScroll={true} />
    );

    await waitFor(() => {
      expect(screen.getByText('Meeting History')).toBeInTheDocument();
    });

    // Simulate scrolling to trigger lazy loading
    const measurementId = perfTestSuite.startMeasurement('lazy_loading_scroll');
    
    const scrollContainer = container.querySelector('.meeting-history');
    act(() => {
      fireEvent.scroll(scrollContainer!, { target: { scrollTop: 1000 } });
    });
    
    const { duration } = perfTestSuite.endMeasurement(measurementId);
    expect(duration).toBeLessThan(100);
  });
});

// Caching Performance Tests
describe('Caching Performance', () => {
  let testCacheManager: CacheManager;

  beforeEach(async () => {
    perfTestSuite.clear();
    testCacheManager = new CacheManager();
  });

  test('should demonstrate cache performance improvement', async () => {
    const testData = { large: 'data'.repeat(10000) };
    const key = 'performance_test_key';

    // First access (cache miss)
    const missId = perfTestSuite.startMeasurement('cache_miss');
    await testCacheManager.transcriptCache.set(key, testData);
    const firstResult = await testCacheManager.transcriptCache.get(key);
    const { duration: missDuration } = perfTestSuite.endMeasurement(missId);

    expect(firstResult).toEqual(testData);

    // Second access (cache hit)
    const hitId = perfTestSuite.startMeasurement('cache_hit');
    const secondResult = await testCacheManager.transcriptCache.get(key);
    const { duration: hitDuration } = perfTestSuite.endMeasurement(hitId);

    expect(secondResult).toEqual(testData);
    expect(hitDuration).toBeLessThan(missDuration); // Cache hit should be faster
    expect(hitDuration).toBeLessThan(5); // Cache hits should be very fast
  });

  test('should handle cache eviction efficiently', async () => {
    const measurementId = perfTestSuite.startMeasurement('cache_eviction');
    
    // Fill cache beyond capacity
    for (let i = 0; i < 1200; i++) {
      await testCacheManager.transcriptCache.set(`key_${i}`, { data: `value_${i}` });
    }
    
    const { duration } = perfTestSuite.endMeasurement(measurementId);
    expect(duration).toBeLessThan(500); // Eviction should be efficient

    const stats = testCacheManager.transcriptCache.getStats();
    expect(stats.evictions).toBeGreaterThan(0);
  });

  test('should batch cache operations efficiently', async () => {
    const entries = Array.from({ length: 100 }, (_, i) => ({
      key: `batch_key_${i}`,
      data: { value: `batch_value_${i}` }
    }));

    const measurementId = perfTestSuite.startMeasurement('cache_batch_set');
    await testCacheManager.transcriptCache.setMany(entries);
    const { duration } = perfTestSuite.endMeasurement(measurementId);

    expect(duration).toBeLessThan(100); // Batch operations should be efficient
  });
});

// WebSocket Performance Tests
describe('WebSocket Performance', () => {
  let wsService: OptimizedWebSocketService;

  beforeEach(() => {
    perfTestSuite.clear();
    wsService = new OptimizedWebSocketService({
      batchSize: 10,
      batchTimeout: 50,
      enableCompression: true
    });
  });

  afterEach(async () => {
    await wsService.disconnect();
  });

  test('should batch messages efficiently', async () => {
    // Mock WebSocket for testing
    const mockWS = {
      send: jest.fn(),
      readyState: WebSocket.OPEN
    };
    
    // @ts-ignore - Mock WebSocket
    wsService.ws = mockWS;
    wsService.stats.isConnected = true;

    const measurementId = perfTestSuite.startMeasurement('websocket_batching');
    
    // Send multiple messages rapidly
    const promises = [];
    for (let i = 0; i < 25; i++) {
      promises.push(wsService.send('test_message', { data: `message_${i}` }));
    }
    
    await Promise.all(promises);
    await new Promise(resolve => setTimeout(resolve, 100)); // Wait for batching
    
    const { duration } = perfTestSuite.endMeasurement(measurementId);
    
    expect(duration).toBeLessThan(200);
    expect(mockWS.send).toHaveBeenCalledTimes(3); // Should batch into ~3 calls (25 messages / 10 batch size)
  });

  test('should handle high message throughput', async () => {
    const messageCount = 1000;
    const measurementId = perfTestSuite.startMeasurement('websocket_throughput');
    
    // Simulate high throughput messaging
    for (let i = 0; i < messageCount; i++) {
      wsService.send('throughput_test', { 
        data: `message_${i}`,
        timestamp: Date.now()
      }, { priority: 'medium' });
    }
    
    const { duration } = perfTestSuite.endMeasurement(measurementId);
    
    expect(duration).toBeLessThan(100); // Queuing should be very fast
    expect(wsService.getQueueStatus().medium).toBe(messageCount);
  });
});

// Performance Monitoring Dashboard Tests
describe('Performance Monitoring Dashboard', () => {
  beforeEach(() => {
    perfTestSuite.clear();
  });

  test('should render dashboard efficiently', async () => {
    const measurementId = perfTestSuite.startMeasurement('dashboard_render');
    
    render(<PerformanceMonitoringDashboard />);
    
    await waitFor(() => {
      expect(screen.getByText('Performance Monitor')).toBeInTheDocument();
    });
    
    const { duration } = perfTestSuite.endMeasurement(measurementId);
    expect(duration).toBeLessThan(100);
  });

  test('should collect metrics efficiently', async () => {
    const { rerender } = render(<PerformanceMonitoringDashboard />);
    
    await waitFor(() => {
      expect(screen.getByText('Performance Monitor')).toBeInTheDocument();
    });

    const measurementId = perfTestSuite.startMeasurement('dashboard_metrics');
    
    // Trigger metric collection
    const refreshButton = screen.getByText('Refresh');
    fireEvent.click(refreshButton);
    
    await waitFor(() => {
      expect(screen.getByText('Performance Monitor')).toBeInTheDocument();
    });
    
    const { duration } = perfTestSuite.endMeasurement(measurementId);
    expect(duration).toBeLessThan(50); // Metric collection should be fast
  });
});

// Performance Clinic Tests
describe('Performance Clinic', () => {
  beforeEach(() => {
    perfTestSuite.clear();
  });

  test('should render clinic dashboard efficiently', async () => {
    const measurementId = perfTestSuite.startMeasurement('clinic_render');
    
    render(<PerformanceClinic />);
    
    await waitFor(() => {
      expect(screen.getByText('Performance Clinic')).toBeInTheDocument();
    });
    
    const { duration } = perfTestSuite.endMeasurement(measurementId);
    expect(duration).toBeLessThan(150);
  });

  test('should handle tab switching efficiently', async () => {
    render(<PerformanceClinic />);
    
    await waitFor(() => {
      expect(screen.getByText('Performance Clinic')).toBeInTheDocument();
    });

    const measurementId = perfTestSuite.startMeasurement('clinic_tab_switch');
    
    // Switch between tabs
    const impactsTab = screen.getByText('Impacts');
    fireEvent.click(impactsTab);
    
    const scenariosTab = screen.getByText('Scenarios');
    fireEvent.click(scenariosTab);
    
    const testsTab = screen.getByText('Tests');
    fireEvent.click(testsTab);
    
    const { duration } = perfTestSuite.endMeasurement(measurementId);
    expect(duration).toBeLessThan(50); // Tab switching should be instantaneous
  });
});

// Performance Profiler Tests
describe('Performance Profiler', () => {
  beforeEach(() => {
    perfTestSuite.clear();
    performanceProfiler.clear();
  });

  test('should profile function execution efficiently', async () => {
    const testFunction = () => {
      // Simulate some work
      let sum = 0;
      for (let i = 0; i < 10000; i++) {
        sum += i;
      }
      return sum;
    };

    const measurementId = perfTestSuite.startMeasurement('profiler_function');
    
    const result = performanceProfiler.profile('test_function', testFunction);
    
    const { duration } = perfTestSuite.endMeasurement(measurementId);
    
    expect(result).toBe(49995000); // Expected sum
    expect(duration).toBeLessThan(20); // Profiling overhead should be minimal
    
    const samples = performanceProfiler.getSamples();
    expect(samples.length).toBe(1);
    expect(samples[0].name).toBe('test_function');
  });

  test('should handle async profiling', async () => {
    const asyncFunction = async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
      return 'async_result';
    };

    const measurementId = perfTestSuite.startMeasurement('profiler_async');
    
    const result = await performanceProfiler.profileAsync('async_test', asyncFunction);
    
    const { duration } = perfTestSuite.endMeasurement(measurementId);
    
    expect(result).toBe('async_result');
    expect(duration).toBeLessThan(50); // Should complete quickly
    
    const samples = performanceProfiler.getSamples();
    expect(samples.some(s => s.name === 'async_test')).toBe(true);
  });

  test('should benchmark efficiently', async () => {
    const benchmarkFunction = () => {
      return Math.random() * 1000;
    };

    const measurementId = perfTestSuite.startMeasurement('profiler_benchmark');
    
    const result = await performanceProfiler.benchmark('test_benchmark', benchmarkFunction, {
      iterations: 100,
      warmupIterations: 10
    });
    
    const { duration } = perfTestSuite.endMeasurement(measurementId);
    
    expect(result.samples).toBe(100);
    expect(result.mean).toBeGreaterThan(0);
    expect(duration).toBeLessThan(1000); // Benchmarking should complete reasonably quickly
  });
});

// Integration Performance Tests
describe('Integration Performance', () => {
  beforeEach(() => {
    perfTestSuite.clear();
  });

  test('should handle component integration efficiently', async () => {
    const segments = generateTranscriptSegments(1000);
    
    const measurementId = perfTestSuite.startMeasurement('integration_test');
    
    const { container } = render(
      <div>
        <VirtualizedTranscript
          segments={segments}
          enableVirtualization={true}
          searchQuery="test"
        />
        <LazyMeetingHistory pageSize={20} />
        <PerformanceMonitoringDashboard />
      </div>
    );
    
    await waitFor(() => {
      expect(container.querySelector('.transcript-virtual-list')).toBeInTheDocument();
      expect(screen.getByText('Meeting History')).toBeInTheDocument();
      expect(screen.getByText('Performance Monitor')).toBeInTheDocument();
    });
    
    const { duration, memoryDelta } = perfTestSuite.endMeasurement(measurementId);
    
    expect(duration).toBeLessThan(300); // Combined rendering should still be fast
    if (memoryDelta !== undefined) {
      expect(memoryDelta).toBeLessThan(100 * 1024 * 1024); // Reasonable memory usage
    }
  });

  test('should maintain performance under load', async () => {
    const largeSegments = generateTranscriptSegments(5000);
    
    const { container, rerender } = render(
      <VirtualizedTranscript
        segments={largeSegments}
        enableVirtualization={true}
        searchQuery=""
      />
    );

    await waitFor(() => {
      expect(container.querySelector('.transcript-virtual-list')).toBeInTheDocument();
    });

    // Simulate rapid updates
    const measurementId = perfTestSuite.startMeasurement('load_test');
    
    for (let i = 0; i < 10; i++) {
      rerender(
        <VirtualizedTranscript
          segments={largeSegments}
          enableVirtualization={true}
          searchQuery={`search_${i}`}
        />
      );
      
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    
    const { duration } = perfTestSuite.endMeasurement(measurementId);
    expect(duration).toBeLessThan(500); // Should handle rapid updates efficiently
  });
});

// Test Results Summary
describe('Performance Test Summary', () => {
  test('should generate performance report', () => {
    const results = perfTestSuite.getAllResults();
    
    console.log('\n=== Performance Test Results ===');
    console.log('All times in milliseconds\n');
    
    Object.entries(results).forEach(([testName, stats]) => {
      if (stats) {
        console.log(`${testName}:`);
        console.log(`  Mean: ${stats.mean.toFixed(2)}ms`);
        console.log(`  Median: ${stats.median.toFixed(2)}ms`);
        console.log(`  P95: ${stats.p95.toFixed(2)}ms`);
        console.log(`  Min/Max: ${stats.min.toFixed(2)}ms / ${stats.max.toFixed(2)}ms`);
        console.log(`  Samples: ${stats.count}`);
        console.log('');
      }
    });
    
    // Performance assertions
    const virtualScrollingResults = results['virtual_scrolling_render'];
    if (virtualScrollingResults) {
      expect(virtualScrollingResults.p95).toBeLessThan(200); // 95% of renders under 200ms
    }
    
    const cacheResults = results['cache_hit'];
    if (cacheResults) {
      expect(cacheResults.mean).toBeLessThan(10); // Cache hits under 10ms average
    }
    
    // Success criteria met
    expect(Object.keys(results).length).toBeGreaterThan(0);
  });
});

// Export test utilities for external use
export {
  PerformanceTestSuite,
  perfTestSuite,
  generateTranscriptSegments,
  generateMeetings
};