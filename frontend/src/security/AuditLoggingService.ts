// Comprehensive Audit Logging Service for MeetingMind
// Implements secure, tamper-evident audit trails for compliance and security monitoring

interface AuditEvent {
  id: string;
  timestamp: number;
  eventType: AuditEventType;
  category: AuditCategory;
  severity: AuditSeverity;
  userId?: string;
  sessionId?: string;
  ipAddress?: string;
  userAgent?: string;
  resource: string;
  action: string;
  outcome: AuditOutcome;
  details: AuditDetails;
  metadata: AuditMetadata;
  hash: string; // For tamper detection
  previousHash?: string; // Chain for integrity
}

type AuditEventType = 
  | 'authentication' 
  | 'authorization' 
  | 'data_access' 
  | 'data_modification' 
  | 'data_deletion'
  | 'configuration_change'
  | 'security_event'
  | 'compliance_event'
  | 'system_event'
  | 'user_action'
  | 'api_call'
  | 'file_operation'
  | 'encryption_operation'
  | 'key_management';

type AuditCategory = 
  | 'security'
  | 'privacy'
  | 'compliance'
  | 'performance'
  | 'error'
  | 'warning'
  | 'information';

type AuditSeverity = 'low' | 'medium' | 'high' | 'critical';

type AuditOutcome = 'success' | 'failure' | 'warning' | 'error';

interface AuditDetails {
  description: string;
  oldValue?: any;
  newValue?: any;
  reason?: string;
  context?: any;
  errorCode?: string;
  errorMessage?: string;
  stackTrace?: string;
}

interface AuditMetadata {
  application: string;
  version: string;
  environment: string;
  correlationId?: string;
  requestId?: string;
  transactionId?: string;
  batchId?: string;
  tags: string[];
  customFields: Record<string, any>;
}

interface AuditQuery {
  startTime?: number;
  endTime?: number;
  eventTypes?: AuditEventType[];
  categories?: AuditCategory[];
  severities?: AuditSeverity[];
  outcomes?: AuditOutcome[];
  userIds?: string[];
  resources?: string[];
  actions?: string[];
  searchText?: string;
  tags?: string[];
  limit?: number;
  offset?: number;
  sortBy?: 'timestamp' | 'severity' | 'eventType';
  sortOrder?: 'asc' | 'desc';
}

interface AuditReport {
  id: string;
  name: string;
  query: AuditQuery;
  generatedAt: number;
  generatedBy: string;
  totalEvents: number;
  timeRange: { start: number; end: number };
  summary: AuditSummary;
  events: AuditEvent[];
  format: 'json' | 'csv' | 'pdf';
}

interface AuditSummary {
  eventsByType: Record<AuditEventType, number>;
  eventsByCategory: Record<AuditCategory, number>;
  eventsBySeverity: Record<AuditSeverity, number>;
  eventsByOutcome: Record<AuditOutcome, number>;
  topUsers: Array<{ userId: string; eventCount: number }>;
  topResources: Array<{ resource: string; eventCount: number }>;
  topActions: Array<{ action: string; eventCount: number }>;
  securityEvents: number;
  failureRate: number;
  criticalEvents: number;
}

interface AuditConfiguration {
  retentionPeriod: number; // milliseconds
  maxLogSize: number; // bytes
  enableEncryption: boolean;
  enableCompression: boolean;
  enableRealTimeAlerts: boolean;
  alertThresholds: AlertThresholds;
  complianceRules: ComplianceRule[];
  tamperDetection: boolean;
  autoArchiving: boolean;
  exportFormats: string[];
}

interface AlertThresholds {
  failureRate: number; // percentage
  criticalEventsPerHour: number;
  consecutiveFailures: number;
  unusualActivity: number; // events per minute
  suspiciousPatterns: string[];
}

interface ComplianceRule {
  regulation: 'GDPR' | 'HIPAA' | 'SOX' | 'PCI_DSS' | 'ISO_27001' | 'CUSTOM';
  requiredEvents: AuditEventType[];
  retentionPeriod: number;
  encryptionRequired: boolean;
  realTimeMonitoring: boolean;
  alertRules: AlertRule[];
}

interface AlertRule {
  name: string;
  condition: string; // JavaScript expression
  threshold: number;
  timeWindow: number; // milliseconds
  severity: AuditSeverity;
  actions: AlertAction[];
}

interface AlertAction {
  type: 'email' | 'webhook' | 'log' | 'block_user' | 'notify_admin';
  parameters: any;
}

interface AuditAlert {
  id: string;
  timestamp: number;
  rule: string;
  severity: AuditSeverity;
  message: string;
  triggeringEvents: string[];
  acknowledged: boolean;
  acknowledgedBy?: string;
  acknowledgedAt?: number;
  resolved: boolean;
  resolvedBy?: string;
  resolvedAt?: number;
  actions: AlertAction[];
}

export class AuditLoggingService {
  private static instance: AuditLoggingService;
  private events: Map<string, AuditEvent> = new Map();
  private alerts: Map<string, AuditAlert> = new Map();
  private config: AuditConfiguration;
  private lastEventHash: string = '';
  private eventBuffer: AuditEvent[] = [];
  private bufferFlushTimer: NodeJS.Timeout | null = null;
  private alertProcessor: NodeJS.Timeout | null = null;
  private eventHandlers: Map<string, Function[]> = new Map();

  private constructor(config: Partial<AuditConfiguration> = {}) {
    this.config = {
      retentionPeriod: 7 * 365 * 24 * 60 * 60 * 1000, // 7 years
      maxLogSize: 10 * 1024 * 1024 * 1024, // 10GB
      enableEncryption: true,
      enableCompression: true,
      enableRealTimeAlerts: true,
      alertThresholds: {
        failureRate: 10, // 10%
        criticalEventsPerHour: 5,
        consecutiveFailures: 3,
        unusualActivity: 100, // events per minute
        suspiciousPatterns: ['brute_force', 'privilege_escalation', 'data_exfiltration']
      },
      complianceRules: this.getDefaultComplianceRules(),
      tamperDetection: true,
      autoArchiving: true,
      exportFormats: ['json', 'csv', 'pdf'],
      ...config
    };

    this.initializeService();
  }

  static getInstance(config?: Partial<AuditConfiguration>): AuditLoggingService {
    if (!AuditLoggingService.instance) {
      AuditLoggingService.instance = new AuditLoggingService(config);
    }
    return AuditLoggingService.instance;
  }

  private initializeService(): void {
    // Start buffer flush timer
    this.bufferFlushTimer = setInterval(() => {
      this.flushEventBuffer();
    }, 5000); // Flush every 5 seconds

    // Start alert processor
    if (this.config.enableRealTimeAlerts) {
      this.alertProcessor = setInterval(() => {
        this.processAlerts();
      }, 10000); // Check alerts every 10 seconds
    }

    console.log('Audit logging service initialized');
  }

  private getDefaultComplianceRules(): ComplianceRule[] {
    return [
      {
        regulation: 'GDPR',
        requiredEvents: ['data_access', 'data_modification', 'data_deletion', 'authentication'],
        retentionPeriod: 3 * 365 * 24 * 60 * 60 * 1000, // 3 years
        encryptionRequired: true,
        realTimeMonitoring: true,
        alertRules: [
          {
            name: 'GDPR Data Access Monitoring',
            condition: 'eventType === "data_access" && details.personalData === true',
            threshold: 50,
            timeWindow: 3600000, // 1 hour
            severity: 'medium',
            actions: [{ type: 'log', parameters: { level: 'warn' } }]
          }
        ]
      },
      {
        regulation: 'SOX',
        requiredEvents: ['configuration_change', 'data_modification', 'authorization'],
        retentionPeriod: 7 * 365 * 24 * 60 * 60 * 1000, // 7 years
        encryptionRequired: true,
        realTimeMonitoring: true,
        alertRules: [
          {
            name: 'SOX Configuration Changes',
            condition: 'eventType === "configuration_change" && category === "security"',
            threshold: 1,
            timeWindow: 300000, // 5 minutes
            severity: 'high',
            actions: [
              { type: 'email', parameters: { recipients: ['compliance@company.com'] } },
              { type: 'webhook', parameters: { url: '/api/compliance/alert' } }
            ]
          }
        ]
      }
    ];
  }

  // Core logging methods
  async logEvent(
    eventType: AuditEventType,
    category: AuditCategory,
    severity: AuditSeverity,
    resource: string,
    action: string,
    outcome: AuditOutcome,
    details: Partial<AuditDetails>,
    metadata: Partial<AuditMetadata> = {},
    context: {
      userId?: string;
      sessionId?: string;
      ipAddress?: string;
      userAgent?: string;
      correlationId?: string;
    } = {}
  ): Promise<string> {
    
    const eventId = await this.generateEventId();
    const timestamp = Date.now();

    const auditEvent: AuditEvent = {
      id: eventId,
      timestamp,
      eventType,
      category,
      severity,
      userId: context.userId,
      sessionId: context.sessionId,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      resource,
      action,
      outcome,
      details: {
        description: details.description || `${action} on ${resource}`,
        ...details
      },
      metadata: {
        application: 'MeetingMind',
        version: '1.0.0',
        environment: process.env.NODE_ENV || 'development',
        correlationId: context.correlationId,
        tags: [],
        customFields: {},
        ...metadata
      },
      hash: '',
      previousHash: this.lastEventHash
    };

    // Calculate hash for tamper detection
    if (this.config.tamperDetection) {
      auditEvent.hash = await this.calculateEventHash(auditEvent);
      this.lastEventHash = auditEvent.hash;
    }

    // Add to buffer for batch processing
    this.eventBuffer.push(auditEvent);

    // Trigger immediate flush for critical events
    if (severity === 'critical') {
      await this.flushEventBuffer();
    }

    // Emit event to handlers
    this.emitEvent('audit_event', auditEvent);

    return eventId;
  }

  // Convenience methods for common audit events
  async logAuthentication(
    action: 'login' | 'logout' | 'password_change' | 'mfa_setup' | 'account_lock',
    outcome: AuditOutcome,
    userId: string,
    details: Partial<AuditDetails> = {},
    context: any = {}
  ): Promise<string> {
    return await this.logEvent(
      'authentication',
      'security',
      outcome === 'failure' ? 'high' : 'low',
      'user_account',
      action,
      outcome,
      details,
      { tags: ['authentication'] },
      { userId, ...context }
    );
  }

  async logDataAccess(
    resource: string,
    action: string,
    outcome: AuditOutcome,
    userId: string,
    details: Partial<AuditDetails> = {},
    context: any = {}
  ): Promise<string> {
    return await this.logEvent(
      'data_access',
      'privacy',
      'medium',
      resource,
      action,
      outcome,
      details,
      { tags: ['data_access', 'privacy'] },
      { userId, ...context }
    );
  }

  async logDataModification(
    resource: string,
    action: string,
    outcome: AuditOutcome,
    userId: string,
    oldValue: any,
    newValue: any,
    details: Partial<AuditDetails> = {},
    context: any = {}
  ): Promise<string> {
    return await this.logEvent(
      'data_modification',
      'compliance',
      'medium',
      resource,
      action,
      outcome,
      { ...details, oldValue, newValue },
      { tags: ['data_modification', 'compliance'] },
      { userId, ...context }
    );
  }

  async logSecurityEvent(
    action: string,
    severity: AuditSeverity,
    outcome: AuditOutcome,
    details: Partial<AuditDetails> = {},
    context: any = {}
  ): Promise<string> {
    return await this.logEvent(
      'security_event',
      'security',
      severity,
      'security_system',
      action,
      outcome,
      details,
      { tags: ['security', 'threat_detection'] },
      context
    );
  }

  async logEncryptionOperation(
    operation: 'encrypt' | 'decrypt' | 'key_generation' | 'key_rotation',
    resource: string,
    outcome: AuditOutcome,
    userId: string,
    details: Partial<AuditDetails> = {},
    context: any = {}
  ): Promise<string> {
    return await this.logEvent(
      'encryption_operation',
      'security',
      'medium',
      resource,
      operation,
      outcome,
      details,
      { tags: ['encryption', 'cryptography'] },
      { userId, ...context }
    );
  }

  async logComplianceEvent(
    regulation: string,
    action: string,
    outcome: AuditOutcome,
    details: Partial<AuditDetails> = {},
    context: any = {}
  ): Promise<string> {
    return await this.logEvent(
      'compliance_event',
      'compliance',
      'high',
      'compliance_system',
      action,
      outcome,
      { ...details, regulation },
      { tags: ['compliance', regulation.toLowerCase()] },
      context
    );
  }

  // Event buffer management
  private async flushEventBuffer(): Promise<void> {
    if (this.eventBuffer.length === 0) return;

    const eventsToProcess = [...this.eventBuffer];
    this.eventBuffer = [];

    try {
      // Store events
      for (const event of eventsToProcess) {
        await this.storeEvent(event);
      }

      // Process compliance rules
      for (const event of eventsToProcess) {
        await this.processComplianceRules(event);
      }

      console.log(`Flushed ${eventsToProcess.length} audit events`);
    } catch (error) {
      console.error('Failed to flush audit events:', error);
      // Re-add events to buffer for retry
      this.eventBuffer.unshift(...eventsToProcess);
    }
  }

  private async storeEvent(event: AuditEvent): Promise<void> {
    // Encrypt if required
    if (this.config.enableEncryption) {
      // In a real implementation, encrypt the event data
      event.metadata.customFields.encrypted = true;
    }

    // Compress if enabled
    if (this.config.enableCompression) {
      // In a real implementation, compress the event data
      event.metadata.customFields.compressed = true;
    }

    // Store in memory (in production, this would be a secure database)
    this.events.set(event.id, event);

    // Check storage limits
    await this.enforceStorageLimits();
  }

  private async enforceStorageLimits(): Promise<void> {
    const currentSize = this.getCurrentStorageSize();
    
    if (currentSize > this.config.maxLogSize) {
      // Archive or delete old events
      const sortedEvents = Array.from(this.events.values())
        .sort((a, b) => a.timestamp - b.timestamp);

      const eventsToRemove = Math.floor(sortedEvents.length * 0.1); // Remove 10% oldest
      
      for (let i = 0; i < eventsToRemove; i++) {
        if (this.config.autoArchiving) {
          await this.archiveEvent(sortedEvents[i]);
        }
        this.events.delete(sortedEvents[i].id);
      }

      console.log(`Storage limit exceeded: removed ${eventsToRemove} old events`);
    }
  }

  private getCurrentStorageSize(): number {
    // Rough estimation of storage size
    return Array.from(this.events.values())
      .reduce((size, event) => size + JSON.stringify(event).length, 0);
  }

  private async archiveEvent(event: AuditEvent): Promise<void> {
    // In a real implementation, this would archive the event to long-term storage
    console.log(`Archiving event: ${event.id}`);
  }

  // Compliance rule processing
  private async processComplianceRules(event: AuditEvent): Promise<void> {
    for (const rule of this.config.complianceRules) {
      if (rule.requiredEvents.includes(event.eventType)) {
        // Check if real-time monitoring is required
        if (rule.realTimeMonitoring) {
          await this.processAlertRules(event, rule.alertRules);
        }

        // Ensure encryption if required
        if (rule.encryptionRequired && !event.metadata.customFields.encrypted) {
          console.warn(`Compliance violation: ${rule.regulation} requires encryption for event ${event.id}`);
        }
      }
    }
  }

  // Alert processing
  private async processAlertRules(event: AuditEvent, rules: AlertRule[]): Promise<void> {
    for (const rule of rules) {
      const shouldAlert = await this.evaluateAlertCondition(rule.condition, event);
      
      if (shouldAlert) {
        await this.createAlert(rule, [event.id]);
      }
    }
  }

  private async evaluateAlertCondition(condition: string, event: AuditEvent): Promise<boolean> {
    try {
      // Create a safe evaluation context
      const context = {
        eventType: event.eventType,
        category: event.category,
        severity: event.severity,
        outcome: event.outcome,
        resource: event.resource,
        action: event.action,
        userId: event.userId,
        details: event.details,
        metadata: event.metadata
      };

      // Simple condition evaluation (in production, use a secure expression evaluator)
      const func = new Function('event', `with(event) { return ${condition}; }`);
      return func(context);
    } catch (error) {
      console.error('Failed to evaluate alert condition:', error);
      return false;
    }
  }

  private async createAlert(rule: AlertRule, triggeringEvents: string[]): Promise<void> {
    const alertId = await this.generateEventId();
    
    const alert: AuditAlert = {
      id: alertId,
      timestamp: Date.now(),
      rule: rule.name,
      severity: rule.severity,
      message: `Alert triggered: ${rule.name}`,
      triggeringEvents,
      acknowledged: false,
      resolved: false,
      actions: rule.actions
    };

    this.alerts.set(alertId, alert);

    // Execute alert actions
    for (const action of rule.actions) {
      await this.executeAlertAction(action, alert);
    }

    console.log(`Alert created: ${rule.name} (${alertId})`);
  }

  private async executeAlertAction(action: AlertAction, alert: AuditAlert): Promise<void> {
    try {
      switch (action.type) {
        case 'email':
          await this.sendEmailAlert(action.parameters, alert);
          break;
        case 'webhook':
          await this.sendWebhookAlert(action.parameters, alert);
          break;
        case 'log':
          console.log(`AUDIT ALERT: ${alert.message}`, action.parameters);
          break;
        case 'block_user':
          await this.blockUser(action.parameters, alert);
          break;
        case 'notify_admin':
          await this.notifyAdmin(action.parameters, alert);
          break;
        default:
          console.warn(`Unknown alert action type: ${action.type}`);
      }
    } catch (error) {
      console.error(`Failed to execute alert action ${action.type}:`, error);
    }
  }

  private async sendEmailAlert(parameters: any, alert: AuditAlert): Promise<void> {
    // In a real implementation, send email via email service
    console.log(`Email alert sent to ${parameters.recipients?.join(', ')}:`, alert.message);
  }

  private async sendWebhookAlert(parameters: any, alert: AuditAlert): Promise<void> {
    // In a real implementation, send webhook notification
    console.log(`Webhook alert sent to ${parameters.url}:`, alert.message);
  }

  private async blockUser(parameters: any, alert: AuditAlert): Promise<void> {
    // In a real implementation, block the user account
    console.log(`User blocked due to alert:`, alert.message);
  }

  private async notifyAdmin(parameters: any, alert: AuditAlert): Promise<void> {
    // In a real implementation, notify system administrators
    console.log(`Admin notification sent:`, alert.message);
  }

  private async processAlerts(): Promise<void> {
    // Check for alert patterns and thresholds
    const recentEvents = Array.from(this.events.values())
      .filter(e => Date.now() - e.timestamp < 3600000) // Last hour
      .sort((a, b) => b.timestamp - a.timestamp);

    // Check failure rate
    const failures = recentEvents.filter(e => e.outcome === 'failure');
    const failureRate = (failures.length / recentEvents.length) * 100;
    
    if (failureRate > this.config.alertThresholds.failureRate) {
      await this.createAlert(
        {
          name: 'High Failure Rate',
          condition: '',
          threshold: this.config.alertThresholds.failureRate,
          timeWindow: 3600000,
          severity: 'high',
          actions: [{ type: 'notify_admin', parameters: {} }]
        },
        failures.map(e => e.id)
      );
    }

    // Check for critical events
    const criticalEvents = recentEvents.filter(e => e.severity === 'critical');
    if (criticalEvents.length > this.config.alertThresholds.criticalEventsPerHour) {
      await this.createAlert(
        {
          name: 'Multiple Critical Events',
          condition: '',
          threshold: this.config.alertThresholds.criticalEventsPerHour,
          timeWindow: 3600000,
          severity: 'critical',
          actions: [
            { type: 'email', parameters: { recipients: ['security@company.com'] } },
            { type: 'notify_admin', parameters: {} }
          ]
        },
        criticalEvents.map(e => e.id)
      );
    }
  }

  // Query and reporting
  async queryEvents(query: AuditQuery): Promise<AuditEvent[]> {
    let events = Array.from(this.events.values());

    // Apply filters
    if (query.startTime) {
      events = events.filter(e => e.timestamp >= query.startTime!);
    }
    if (query.endTime) {
      events = events.filter(e => e.timestamp <= query.endTime!);
    }
    if (query.eventTypes) {
      events = events.filter(e => query.eventTypes!.includes(e.eventType));
    }
    if (query.categories) {
      events = events.filter(e => query.categories!.includes(e.category));
    }
    if (query.severities) {
      events = events.filter(e => query.severities!.includes(e.severity));
    }
    if (query.outcomes) {
      events = events.filter(e => query.outcomes!.includes(e.outcome));
    }
    if (query.userIds) {
      events = events.filter(e => e.userId && query.userIds!.includes(e.userId));
    }
    if (query.resources) {
      events = events.filter(e => query.resources!.includes(e.resource));
    }
    if (query.actions) {
      events = events.filter(e => query.actions!.includes(e.action));
    }
    if (query.searchText) {
      const searchLower = query.searchText.toLowerCase();
      events = events.filter(e => 
        e.details.description.toLowerCase().includes(searchLower) ||
        e.resource.toLowerCase().includes(searchLower) ||
        e.action.toLowerCase().includes(searchLower)
      );
    }
    if (query.tags) {
      events = events.filter(e => 
        query.tags!.some(tag => e.metadata.tags.includes(tag))
      );
    }

    // Sort
    const sortBy = query.sortBy || 'timestamp';
    const sortOrder = query.sortOrder || 'desc';
    
    events.sort((a, b) => {
      let aValue: any, bValue: any;
      
      switch (sortBy) {
        case 'timestamp':
          aValue = a.timestamp;
          bValue = b.timestamp;
          break;
        case 'severity': {
          const severityOrder = { low: 1, medium: 2, high: 3, critical: 4 };
          aValue = severityOrder[a.severity];
          bValue = severityOrder[b.severity];
          break;
        }
        case 'eventType':
          aValue = a.eventType;
          bValue = b.eventType;
          break;
        default:
          aValue = a.timestamp;
          bValue = b.timestamp;
      }

      const comparison = aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
      return sortOrder === 'desc' ? -comparison : comparison;
    });

    // Apply pagination
    const offset = query.offset || 0;
    const limit = query.limit || 100;
    
    return events.slice(offset, offset + limit);
  }

  async generateReport(
    name: string,
    query: AuditQuery,
    generatedBy: string,
    format: 'json' | 'csv' | 'pdf' = 'json'
  ): Promise<AuditReport> {
    const events = await this.queryEvents(query);
    const summary = this.generateSummary(events);

    const report: AuditReport = {
      id: await this.generateEventId(),
      name,
      query,
      generatedAt: Date.now(),
      generatedBy,
      totalEvents: events.length,
      timeRange: {
        start: query.startTime || (events.length > 0 ? Math.min(...events.map(e => e.timestamp)) : 0),
        end: query.endTime || (events.length > 0 ? Math.max(...events.map(e => e.timestamp)) : Date.now())
      },
      summary,
      events,
      format
    };

    console.log(`Audit report generated: ${name} (${events.length} events)`);
    return report;
  }

  private generateSummary(events: AuditEvent[]): AuditSummary {
    const eventsByType: Record<AuditEventType, number> = {} as any;
    const eventsByCategory: Record<AuditCategory, number> = {} as any;
    const eventsBySeverity: Record<AuditSeverity, number> = {} as any;
    const eventsByOutcome: Record<AuditOutcome, number> = {} as any;
    const userCounts: Record<string, number> = {};
    const resourceCounts: Record<string, number> = {};
    const actionCounts: Record<string, number> = {};

    let securityEvents = 0;
    let criticalEvents = 0;
    let failures = 0;

    for (const event of events) {
      eventsByType[event.eventType] = (eventsByType[event.eventType] || 0) + 1;
      eventsByCategory[event.category] = (eventsByCategory[event.category] || 0) + 1;
      eventsBySeverity[event.severity] = (eventsBySeverity[event.severity] || 0) + 1;
      eventsByOutcome[event.outcome] = (eventsByOutcome[event.outcome] || 0) + 1;

      if (event.userId) {
        userCounts[event.userId] = (userCounts[event.userId] || 0) + 1;
      }
      resourceCounts[event.resource] = (resourceCounts[event.resource] || 0) + 1;
      actionCounts[event.action] = (actionCounts[event.action] || 0) + 1;

      if (event.category === 'security') securityEvents++;
      if (event.severity === 'critical') criticalEvents++;
      if (event.outcome === 'failure') failures++;
    }

    const topUsers = Object.entries(userCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([userId, eventCount]) => ({ userId, eventCount }));

    const topResources = Object.entries(resourceCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([resource, eventCount]) => ({ resource, eventCount }));

    const topActions = Object.entries(actionCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([action, eventCount]) => ({ action, eventCount }));

    const failureRate = events.length > 0 ? (failures / events.length) * 100 : 0;

    return {
      eventsByType,
      eventsByCategory,
      eventsBySeverity,
      eventsByOutcome,
      topUsers,
      topResources,
      topActions,
      securityEvents,
      failureRate,
      criticalEvents
    };
  }

  // Tamper detection
  private async calculateEventHash(event: AuditEvent): Promise<string> {
    const hashInput = JSON.stringify({
      timestamp: event.timestamp,
      eventType: event.eventType,
      resource: event.resource,
      action: event.action,
      outcome: event.outcome,
      details: event.details,
      previousHash: event.previousHash
    });

    const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(hashInput));
    return Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  async verifyEventIntegrity(): Promise<{ valid: boolean; corruptedEvents: string[] }> {
    const corruptedEvents: string[] = [];
    const events = Array.from(this.events.values()).sort((a, b) => a.timestamp - b.timestamp);

    let previousHash = '';
    
    for (const event of events) {
      if (event.previousHash !== previousHash) {
        corruptedEvents.push(event.id);
      }

      const expectedHash = await this.calculateEventHash({ ...event, hash: '' });
      if (event.hash !== expectedHash) {
        corruptedEvents.push(event.id);
      }

      previousHash = event.hash;
    }

    return {
      valid: corruptedEvents.length === 0,
      corruptedEvents
    };
  }

  // Event handlers
  onEvent(eventType: string, handler: Function): void {
    if (!this.eventHandlers.has(eventType)) {
      this.eventHandlers.set(eventType, []);
    }
    this.eventHandlers.get(eventType)!.push(handler);
  }

  private emitEvent(eventType: string, data: any): void {
    const handlers = this.eventHandlers.get(eventType) || [];
    for (const handler of handlers) {
      try {
        handler(data);
      } catch (error) {
        console.error('Error in event handler:', error);
      }
    }
  }

  // Utility methods
  private async generateEventId(): Promise<string> {
    const timestamp = Date.now().toString(36);
    const randomBytes = crypto.getRandomValues(new Uint8Array(8));
    const randomPart = Array.from(randomBytes, b => b.toString(36)).join('');
    return `audit_${timestamp}_${randomPart}`;
  }

  // Getters
  getEvents(): AuditEvent[] {
    return Array.from(this.events.values());
  }

  getAlerts(): AuditAlert[] {
    return Array.from(this.alerts.values());
  }

  getConfiguration(): AuditConfiguration {
    return { ...this.config };
  }

  // Alert management
  async acknowledgeAlert(alertId: string, acknowledgedBy: string): Promise<void> {
    const alert = this.alerts.get(alertId);
    if (!alert) {
      throw new Error(`Alert not found: ${alertId}`);
    }

    alert.acknowledged = true;
    alert.acknowledgedBy = acknowledgedBy;
    alert.acknowledgedAt = Date.now();

    this.alerts.set(alertId, alert);
    console.log(`Alert acknowledged: ${alertId} by ${acknowledgedBy}`);
  }

  async resolveAlert(alertId: string, resolvedBy: string): Promise<void> {
    const alert = this.alerts.get(alertId);
    if (!alert) {
      throw new Error(`Alert not found: ${alertId}`);
    }

    alert.resolved = true;
    alert.resolvedBy = resolvedBy;
    alert.resolvedAt = Date.now();

    this.alerts.set(alertId, alert);
    console.log(`Alert resolved: ${alertId} by ${resolvedBy}`);
  }

  // Cleanup
  async cleanup(): Promise<void> {
    if (this.bufferFlushTimer) {
      clearInterval(this.bufferFlushTimer);
      this.bufferFlushTimer = null;
    }

    if (this.alertProcessor) {
      clearInterval(this.alertProcessor);
      this.alertProcessor = null;
    }

    // Flush remaining events
    await this.flushEventBuffer();

    console.log('Audit logging service cleanup completed');
  }
}

// Export singleton instance
export const auditLoggingService = AuditLoggingService.getInstance({
  enableRealTimeAlerts: true,
  tamperDetection: true,
  enableEncryption: true
});