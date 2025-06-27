// Collaboration Playground
// Testing environment for concurrent edits and collaboration features

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  Users,
  Zap,
  Settings,
  Download,
  Upload,
  Copy,
  Share,
  Bug,
  TestTube,
  Clock,
  Activity,
  AlertTriangle,
  CheckCircle,
  Info,
  Circle,
  TrendingUp,
  FileText,
  MessageSquare,
  Mouse,
  Eye,
  Square,
  GitBranch,
  Shuffle
} from 'lucide-react';

import { AnnotationSystem } from './AnnotationSystem';
import { ActionItemsBoard } from './ActionItemsBoard';
import { PresenceSystem } from './PresenceSystem';

interface SimulatedUser {
  id: string;
  name: string;
  color: string;
  avatar?: string;
  speed: number; // Characters per second
  behavior: 'collaborative' | 'aggressive' | 'passive' | 'chaotic';
  active: boolean;
}

interface TestScenario {
  id: string;
  name: string;
  description: string;
  duration: number; // seconds
  users: SimulatedUser[];
  operations: TestOperation[];
}

interface TestOperation {
  type: 'insert' | 'delete' | 'replace' | 'annotation' | 'action_item' | 'cursor_move';
  delay: number; // milliseconds from start
  userId: string;
  position?: number;
  content?: string;
  length?: number;
  data?: any;
}

interface TestResult {
  scenario: string;
  duration: number;
  operations: number;
  conflicts: number;
  resolutions: number;
  finalContent: string;
  convergence: boolean;
  performanceMetrics: {
    avgResponseTime: number;
    maxResponseTime: number;
    operationsPerSecond: number;
    memoryUsage: number;
  };
}

const SAMPLE_SCENARIOS: TestScenario[] = [
  {
    id: 'concurrent-editing',
    name: 'Concurrent Editing',
    description: 'Multiple users editing the same document simultaneously',
    duration: 30,
    users: [
      { id: 'alice', name: 'Alice', color: '#FF6B6B', speed: 2, behavior: 'collaborative', active: true },
      { id: 'bob', name: 'Bob', color: '#4ECDC4', speed: 3, behavior: 'collaborative', active: true },
      { id: 'charlie', name: 'Charlie', color: '#45B7D1', speed: 1.5, behavior: 'passive', active: true }
    ],
    operations: []
  },
  {
    id: 'conflict-resolution',
    name: 'Conflict Resolution',
    description: 'Test operational transform conflict resolution',
    duration: 20,
    users: [
      { id: 'alice', name: 'Alice', color: '#FF6B6B', speed: 5, behavior: 'aggressive', active: true },
      { id: 'bob', name: 'Bob', color: '#4ECDC4', speed: 5, behavior: 'aggressive', active: true }
    ],
    operations: []
  },
  {
    id: 'annotation-stress',
    name: 'Annotation Stress Test',
    description: 'Heavy annotation and commenting activity',
    duration: 25,
    users: [
      { id: 'alice', name: 'Alice', color: '#FF6B6B', speed: 1, behavior: 'collaborative', active: true },
      { id: 'bob', name: 'Bob', color: '#4ECDC4', speed: 1, behavior: 'collaborative', active: true },
      { id: 'charlie', name: 'Charlie', color: '#45B7D1', speed: 1, behavior: 'collaborative', active: true },
      { id: 'diana', name: 'Diana', color: '#96CEB4', speed: 1, behavior: 'collaborative', active: true }
    ],
    operations: []
  },
  {
    id: 'chaos-mode',
    name: 'Chaos Mode',
    description: 'Random operations to test system resilience',
    duration: 60,
    users: [
      { id: 'alice', name: 'Alice', color: '#FF6B6B', speed: 10, behavior: 'chaotic', active: true },
      { id: 'bob', name: 'Bob', color: '#4ECDC4', speed: 8, behavior: 'chaotic', active: true },
      { id: 'charlie', name: 'Charlie', color: '#45B7D1', speed: 12, behavior: 'chaotic', active: true }
    ],
    operations: []
  }
];

const SAMPLE_CONTENT = `# Meeting Notes - Product Planning

## Agenda
1. Q4 Goals Review
2. Feature Prioritization
3. Resource Allocation
4. Timeline Discussion

## Action Items
- [ ] Create user research plan
- [ ] Review competitive analysis
- [ ] Schedule design reviews
- [ ] Update project timeline

## Discussion Points
The team discussed the upcoming product launch and identified several key areas that need attention. We need to focus on user experience improvements and ensure our feature set aligns with customer needs.

## Decisions Made
1. Prioritize mobile experience
2. Delay advanced analytics features
3. Increase QA resources
4. Schedule weekly sync meetings

## Next Steps
Schedule follow-up meetings with stakeholders and begin implementation of the discussed action items.`;

export const CollaborationPlayground: React.FC = () => {
  const [selectedScenario, setSelectedScenario] = useState<TestScenario>(SAMPLE_SCENARIOS[0]);
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [documentContent, setDocumentContent] = useState(SAMPLE_CONTENT);
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const [activeUsers, setActiveUsers] = useState<SimulatedUser[]>([]);
  const [operations, setOperations] = useState<any[]>([]);
  const [annotations, setAnnotations] = useState<any[]>([]);
  const [actionItems, setActionItems] = useState<any[]>([]);
  const [conflicts, setConflicts] = useState<number>(0);
  const [showMetrics, setShowMetrics] = useState(true);
  const [showLogs, setShowLogs] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);

  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const operationQueue = useRef<TestOperation[]>([]);
  const startTime = useRef<number>(0);
  const performanceMetrics = useRef({
    operationTimes: [] as number[],
    conflicts: 0,
    resolutions: 0
  });

  // Add log entry
  const addLog = useCallback((message: string, type: 'info' | 'warning' | 'error' = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = `[${timestamp}] ${type.toUpperCase()}: ${message}`;
    setLogs(prev => [...prev.slice(-99), logEntry]); // Keep last 100 logs
  }, []);

  // Generate random operations for a scenario
  const generateOperations = useCallback((scenario: TestScenario): TestOperation[] => {
    const operations: TestOperation[] = [];
    const contentLength = SAMPLE_CONTENT.length;
    
    scenario.users.forEach(user => {
      if (!user.active) return;
      
      const operationCount = Math.floor((scenario.duration * user.speed) / 2);
      
      for (let i = 0; i < operationCount; i++) {
        const delay = Math.random() * scenario.duration * 1000;
        
        switch (user.behavior) {
          case 'collaborative':
            // Balanced mix of operations
            operations.push({
              type: Math.random() < 0.6 ? 'insert' : Math.random() < 0.8 ? 'cursor_move' : 'annotation',
              delay,
              userId: user.id,
              position: Math.floor(Math.random() * contentLength),
              content: Math.random() < 0.5 ? ' collaborative edit' : '\n- New point',
              data: { type: 'comment', content: 'Good point!' }
            });
            break;
            
          case 'aggressive':
            // More frequent edits, potential conflicts
            operations.push({
              type: Math.random() < 0.8 ? 'insert' : 'delete',
              delay,
              userId: user.id,
              position: Math.floor(Math.random() * Math.min(contentLength, 100)), // Focus on start
              content: Math.random() < 0.5 ? 'URGENT: ' : 'IMPORTANT: ',
              length: Math.floor(Math.random() * 10) + 1
            });
            break;
            
          case 'passive':
            // Mostly cursor movements and reading
            operations.push({
              type: Math.random() < 0.8 ? 'cursor_move' : 'annotation',
              delay,
              userId: user.id,
              position: Math.floor(Math.random() * contentLength),
              data: { type: 'highlight', color: user.color }
            });
            break;
            
          case 'chaotic':
            // Random operations
            const opTypes = ['insert', 'delete', 'replace', 'annotation', 'cursor_move'];
            operations.push({
              type: opTypes[Math.floor(Math.random() * opTypes.length)] as any,
              delay,
              userId: user.id,
              position: Math.floor(Math.random() * contentLength),
              content: Math.random().toString(36).substring(7),
              length: Math.floor(Math.random() * 20) + 1,
              data: { chaos: true }
            });
            break;
        }
      }
    });
    
    return operations.sort((a, b) => a.delay - b.delay);
  }, []);

  // Execute a test operation
  const executeOperation = useCallback((operation: TestOperation) => {
    const startTime = performance.now();
    
    try {
      switch (operation.type) {
        case 'insert':
          setDocumentContent(prev => {
            const pos = Math.min(operation.position || 0, prev.length);
            return prev.slice(0, pos) + (operation.content || '') + prev.slice(pos);
          });
          addLog(`${operation.userId} inserted text at position ${operation.position}`);
          break;
          
        case 'delete':
          setDocumentContent(prev => {
            const start = Math.min(operation.position || 0, prev.length);
            const end = Math.min(start + (operation.length || 1), prev.length);
            return prev.slice(0, start) + prev.slice(end);
          });
          addLog(`${operation.userId} deleted ${operation.length} characters`);
          break;
          
        case 'replace':
          setDocumentContent(prev => {
            const start = Math.min(operation.position || 0, prev.length);
            const end = Math.min(start + (operation.length || 1), prev.length);
            return prev.slice(0, start) + (operation.content || '') + prev.slice(end);
          });
          addLog(`${operation.userId} replaced text`);
          break;
          
        case 'annotation':
          const newAnnotation = {
            id: `annotation-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            type: operation.data?.type || 'comment',
            startOffset: operation.position || 0,
            endOffset: (operation.position || 0) + (operation.length || 10),
            text: documentContent.slice(operation.position || 0, (operation.position || 0) + (operation.length || 10)),
            content: operation.data?.content || 'Simulated annotation',
            author: operation.userId,
            authorName: selectedScenario.users.find(u => u.id === operation.userId)?.name || 'Unknown',
            authorColor: selectedScenario.users.find(u => u.id === operation.userId)?.color || '#000000',
            createdAt: new Date().toISOString(),
            tags: [],
            resolved: false
          };
          setAnnotations(prev => [...prev, newAnnotation]);
          addLog(`${operation.userId} added annotation`);
          break;
          
        case 'action_item':
          const newActionItem = {
            id: `action-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            title: operation.data?.title || 'Simulated action item',
            description: operation.data?.description || 'Generated during test',
            status: 'open' as const,
            priority: 'medium' as const,
            author: operation.userId,
            authorName: selectedScenario.users.find(u => u.id === operation.userId)?.name || 'Unknown',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            tags: [],
            comments: []
          };
          setActionItems(prev => [...prev, newActionItem]);
          addLog(`${operation.userId} created action item`);
          break;
          
        case 'cursor_move':
          // Simulate cursor movement (would update presence in real system)
          addLog(`${operation.userId} moved cursor to position ${operation.position}`, 'info');
          break;
      }
      
      const endTime = performance.now();
      performanceMetrics.current.operationTimes.push(endTime - startTime);
      
      // Simulate conflict detection
      if (Math.random() < 0.1) { // 10% chance of conflict
        setConflicts(prev => prev + 1);
        performanceMetrics.current.conflicts++;
        addLog(`Conflict detected for operation by ${operation.userId}`, 'warning');
        
        // Simulate resolution
        setTimeout(() => {
          performanceMetrics.current.resolutions++;
          addLog(`Conflict resolved using operational transform`, 'info');
        }, 50);
      }
      
    } catch (error) {
      addLog(`Error executing operation: ${error}`, 'error');
    }
  }, [documentContent, selectedScenario.users, addLog]);

  // Start test scenario
  const startTest = useCallback(() => {
    if (isRunning) return;
    
    setIsRunning(true);
    setIsPaused(false);
    setCurrentTime(0);
    setConflicts(0);
    setOperations([]);
    setLogs([]);
    startTime.current = Date.now();
    
    // Generate operations for the scenario
    const scenarioOperations = generateOperations(selectedScenario);
    operationQueue.current = [...scenarioOperations];
    setActiveUsers(selectedScenario.users.filter(u => u.active));
    
    addLog(`Starting test scenario: ${selectedScenario.name}`);
    addLog(`Generated ${scenarioOperations.length} operations`);
    
    // Start the test timer
    intervalRef.current = setInterval(() => {
      const elapsed = Date.now() - startTime.current;
      setCurrentTime(elapsed / 1000);
      
      // Execute operations that are due
      while (operationQueue.current.length > 0 && operationQueue.current[0].delay <= elapsed) {
        const operation = operationQueue.current.shift()!;
        executeOperation(operation);
        setOperations(prev => [...prev, operation]);
      }
      
      // Check if test is complete
      if (elapsed >= selectedScenario.duration * 1000) {
        setIsRunning(false);
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
        }
        
        // Calculate final results
        const result: TestResult = {
          scenario: selectedScenario.name,
          duration: elapsed / 1000,
          operations: operations.length,
          conflicts: performanceMetrics.current.conflicts,
          resolutions: performanceMetrics.current.resolutions,
          finalContent: documentContent,
          convergence: true, // Would check actual convergence in real implementation
          performanceMetrics: {
            avgResponseTime: performanceMetrics.current.operationTimes.reduce((a, b) => a + b, 0) / performanceMetrics.current.operationTimes.length || 0,
            maxResponseTime: Math.max(...performanceMetrics.current.operationTimes, 0),
            operationsPerSecond: operations.length / (elapsed / 1000),
            memoryUsage: (performance as any).memory?.usedJSHeapSize || 0
          }
        };
        
        setTestResults(prev => [...prev, result]);
        addLog(`Test completed: ${result.operations} operations, ${result.conflicts} conflicts`);
      }
    }, 100);
  }, [isRunning, selectedScenario, generateOperations, executeOperation, operations.length, documentContent, addLog]);

  // Pause/resume test
  const togglePause = useCallback(() => {
    if (!isRunning) return;
    
    setIsPaused(!isPaused);
    
    if (isPaused) {
      // Resume
      startTime.current = Date.now() - (currentTime * 1000);
      intervalRef.current = setInterval(() => {
        const elapsed = Date.now() - startTime.current;
        setCurrentTime(elapsed / 1000);
        
        while (operationQueue.current.length > 0 && operationQueue.current[0].delay <= elapsed) {
          const operation = operationQueue.current.shift()!;
          executeOperation(operation);
          setOperations(prev => [...prev, operation]);
        }
        
        if (elapsed >= selectedScenario.duration * 1000) {
          setIsRunning(false);
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
          }
        }
      }, 100);
    } else {
      // Pause
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    }
  }, [isRunning, isPaused, currentTime, executeOperation, selectedScenario.duration]);

  // Reset test
  const resetTest = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    
    setIsRunning(false);
    setIsPaused(false);
    setCurrentTime(0);
    setDocumentContent(SAMPLE_CONTENT);
    setOperations([]);
    setAnnotations([]);
    setActionItems([]);
    setConflicts(0);
    setActiveUsers([]);
    setLogs([]);
    operationQueue.current = [];
    performanceMetrics.current = {
      operationTimes: [],
      conflicts: 0,
      resolutions: 0
    };
  }, []);

  // Export test results
  const exportResults = useCallback(() => {
    const data = {
      scenario: selectedScenario,
      results: testResults,
      logs: logs,
      timestamp: new Date().toISOString()
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `collaboration-test-${selectedScenario.id}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [selectedScenario, testResults, logs]);

  // Progress percentage
  const progress = (currentTime / selectedScenario.duration) * 100;

  return (
    <div className="collaboration-playground h-full flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b p-4">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <TestTube className="text-blue-500" />
            Collaboration Playground
          </h1>
          
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowMetrics(!showMetrics)}
              className={`px-3 py-1 rounded text-sm ${showMetrics ? 'bg-blue-500 text-white' : 'bg-gray-200'}`}
            >
              <Activity size={16} className="inline mr-1" />
              Metrics
            </button>
            
            <button
              onClick={() => setShowLogs(!showLogs)}
              className={`px-3 py-1 rounded text-sm ${showLogs ? 'bg-green-500 text-white' : 'bg-gray-200'}`}
            >
              <Bug size={16} className="inline mr-1" />
              Logs
            </button>
            
            <button
              onClick={exportResults}
              className="px-3 py-1 bg-purple-500 text-white rounded text-sm"
              disabled={testResults.length === 0}
            >
              <Download size={16} className="inline mr-1" />
              Export
            </button>
          </div>
        </div>

        {/* Scenario selection and controls */}
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <select
              value={selectedScenario.id}
              onChange={(e) => {
                const scenario = SAMPLE_SCENARIOS.find(s => s.id === e.target.value);
                if (scenario) setSelectedScenario(scenario);
              }}
              disabled={isRunning}
              className="w-full border rounded px-3 py-2"
            >
              {SAMPLE_SCENARIOS.map(scenario => (
                <option key={scenario.id} value={scenario.id}>
                  {scenario.name} - {scenario.description}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={startTest}
              disabled={isRunning}
              className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50"
            >
              <Play size={16} />
              Start Test
            </button>
            
            <button
              onClick={togglePause}
              disabled={!isRunning}
              className="flex items-center gap-2 px-4 py-2 bg-yellow-500 text-white rounded hover:bg-yellow-600 disabled:opacity-50"
            >
              {isPaused ? <Play size={16} /> : <Pause size={16} />}
              {isPaused ? 'Resume' : 'Pause'}
            </button>
            
            <button
              onClick={resetTest}
              className="flex items-center gap-2 px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
            >
              <RotateCcw size={16} />
              Reset
            </button>
          </div>
        </div>

        {/* Progress bar */}
        {isRunning && (
          <div className="mt-4">
            <div className="flex items-center justify-between text-sm text-gray-600 mb-1">
              <span>{selectedScenario.name}</span>
              <span>{currentTime.toFixed(1)}s / {selectedScenario.duration}s</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div 
                className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                style={{ width: `${Math.min(progress, 100)}%` }}
              />
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Metrics sidebar */}
        {showMetrics && (
          <div className="w-80 bg-white border-r p-4 overflow-y-auto">
            <h3 className="font-medium mb-4 flex items-center gap-2">
              <Activity size={16} />
              Real-time Metrics
            </h3>

            {/* Active users */}
            <div className="mb-4">
              <h4 className="text-sm font-medium mb-2">Active Users</h4>
              <div className="space-y-2">
                {activeUsers.map(user => (
                  <div key={user.id} className="flex items-center gap-2 text-sm">
                    <div 
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: user.color }}
                    />
                    <span>{user.name}</span>
                    <span className="text-gray-500">({user.behavior})</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Current stats */}
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span>Operations:</span>
                <span className="font-mono">{operations.length}</span>
              </div>
              
              <div className="flex justify-between text-sm">
                <span>Conflicts:</span>
                <span className="font-mono text-orange-600">{conflicts}</span>
              </div>
              
              <div className="flex justify-between text-sm">
                <span>Content Length:</span>
                <span className="font-mono">{documentContent.length}</span>
              </div>
              
              <div className="flex justify-between text-sm">
                <span>Annotations:</span>
                <span className="font-mono">{annotations.length}</span>
              </div>
              
              <div className="flex justify-between text-sm">
                <span>Action Items:</span>
                <span className="font-mono">{actionItems.length}</span>
              </div>
            </div>

            {/* Performance metrics */}
            {performanceMetrics.current.operationTimes.length > 0 && (
              <div className="mt-4 pt-4 border-t">
                <h4 className="text-sm font-medium mb-2">Performance</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span>Avg Response:</span>
                    <span className="font-mono">
                      {(performanceMetrics.current.operationTimes.reduce((a, b) => a + b, 0) / performanceMetrics.current.operationTimes.length).toFixed(2)}ms
                    </span>
                  </div>
                  
                  <div className="flex justify-between">
                    <span>Max Response:</span>
                    <span className="font-mono">
                      {Math.max(...performanceMetrics.current.operationTimes).toFixed(2)}ms
                    </span>
                  </div>
                  
                  <div className="flex justify-between">
                    <span>Ops/Second:</span>
                    <span className="font-mono">
                      {currentTime > 0 ? (operations.length / currentTime).toFixed(1) : '0'}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Test results history */}
            {testResults.length > 0 && (
              <div className="mt-4 pt-4 border-t">
                <h4 className="text-sm font-medium mb-2">Previous Results</h4>
                <div className="space-y-2">
                  {testResults.slice(-3).map((result, index) => (
                    <div key={index} className="text-xs bg-gray-50 p-2 rounded">
                      <div className="font-medium">{result.scenario}</div>
                      <div className="text-gray-600">
                        {result.operations} ops, {result.conflicts} conflicts
                      </div>
                      <div className="text-gray-600">
                        {result.performanceMetrics.avgResponseTime.toFixed(2)}ms avg
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Main content area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Document editor */}
          <div className="flex-1 bg-white">
            <AnnotationSystem
              documentContent={documentContent}
              annotations={annotations}
              currentUser={{
                id: 'test-user',
                name: 'Test User',
                color: '#000000'
              }}
              users={activeUsers.map(u => ({
                id: u.id,
                name: u.name,
                color: u.color
              }))}
              onAddAnnotation={(annotation) => {
                const newAnnotation = {
                  ...annotation,
                  id: `annotation-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                  createdAt: new Date().toISOString()
                };
                setAnnotations(prev => [...prev, newAnnotation]);
              }}
              onUpdateAnnotation={(id, updates) => {
                setAnnotations(prev => prev.map(a => a.id === id ? { ...a, ...updates } : a));
              }}
              onDeleteAnnotation={(id) => {
                setAnnotations(prev => prev.filter(a => a.id !== id));
              }}
              onAddReply={(annotationId, reply) => {
                setAnnotations(prev => prev.map(a => 
                  a.id === annotationId 
                    ? { 
                        ...a, 
                        replies: [
                          ...(a.replies || []), 
                          {
                            ...reply,
                            id: `reply-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                            createdAt: new Date().toISOString()
                          }
                        ]
                      }
                    : a
                ));
              }}
              readOnly={isRunning}
            />
          </div>

          {/* Action items board */}
          <div className="h-80 border-t">
            <ActionItemsBoard
              actionItems={actionItems}
              users={activeUsers.map(u => ({
                id: u.id,
                name: u.name,
                color: u.color
              }))}
              currentUser={{
                id: 'test-user',
                name: 'Test User',
                color: '#000000'
              }}
              onAddItem={(item) => {
                const newItem = {
                  ...item,
                  id: `action-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString()
                };
                setActionItems(prev => [...prev, newItem]);
              }}
              onUpdateItem={(id, updates) => {
                setActionItems(prev => prev.map(item => 
                  item.id === id 
                    ? { ...item, ...updates, updatedAt: new Date().toISOString() }
                    : item
                ));
              }}
              onDeleteItem={(id) => {
                setActionItems(prev => prev.filter(item => item.id !== id));
              }}
              onAddComment={(itemId, comment) => {
                setActionItems(prev => prev.map(item =>
                  item.id === itemId
                    ? {
                        ...item,
                        comments: [
                          ...item.comments,
                          {
                            ...comment,
                            id: `comment-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                            createdAt: new Date().toISOString()
                          }
                        ]
                      }
                    : item
                ));
              }}
              readOnly={isRunning}
            />
          </div>
        </div>

        {/* Logs sidebar */}
        {showLogs && (
          <div className="w-80 bg-gray-900 text-green-400 p-4 overflow-hidden flex flex-col">
            <h3 className="font-medium mb-4 text-white flex items-center gap-2">
              <Bug size={16} />
              System Logs
            </h3>
            
            <div className="flex-1 overflow-y-auto font-mono text-xs space-y-1">
              {logs.map((log, index) => (
                <div 
                  key={index} 
                  className={`${
                    log.includes('ERROR') ? 'text-red-400' :
                    log.includes('WARNING') ? 'text-yellow-400' :
                    'text-green-400'
                  }`}
                >
                  {log}
                </div>
              ))}
              
              {logs.length === 0 && (
                <div className="text-gray-500">No logs yet. Start a test to see system activity.</div>
              )}
            </div>
            
            <button
              onClick={() => setLogs([])}
              className="mt-2 px-3 py-1 bg-gray-700 text-white rounded text-sm hover:bg-gray-600"
            >
              Clear Logs
            </button>
          </div>
        )}
      </div>

      {/* Status bar */}
      <div className="bg-gray-800 text-white px-4 py-2 flex items-center justify-between text-sm">
        <div className="flex items-center gap-4">
          <span className={`flex items-center gap-1 ${isRunning ? 'text-green-400' : 'text-gray-400'}`}>
            {isRunning ? <Zap size={16} /> : <Circle size={16} />}
            {isRunning ? (isPaused ? 'Paused' : 'Running') : 'Ready'}
          </span>
          
          {isRunning && (
            <span>{operations.length} operations executed</span>
          )}
          
          {conflicts > 0 && (
            <span className="text-orange-400">
              <AlertTriangle size={16} className="inline mr-1" />
              {conflicts} conflicts
            </span>
          )}
        </div>

        <div className="flex items-center gap-4">
          <span>Active Users: {activeUsers.length}</span>
          <span>Content: {documentContent.length} chars</span>
          <span className="text-gray-400">
            <Clock size={16} className="inline mr-1" />
            {currentTime.toFixed(1)}s
          </span>
        </div>
      </div>
    </div>
  );
};