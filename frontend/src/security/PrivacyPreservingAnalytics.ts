// Privacy-Preserving Analytics Service for MeetingMind
// Implements differential privacy, data anonymization, and federated analytics

interface AnalyticsEvent {
  id: string;
  timestamp: number;
  eventType: string;
  category: 'usage' | 'performance' | 'feature' | 'error' | 'engagement';
  userId?: string; // Optional, can be anonymized
  sessionId: string;
  properties: Record<string, any>;
  context: AnalyticsContext;
  privacyLevel: PrivacyLevel;
  anonymized: boolean;
  synthetic: boolean; // For differential privacy
}

interface AnalyticsContext {
  platform: string;
  version: string;
  userAgent?: string;
  location?: {
    country?: string;
    timezone?: string;
  };
  device?: {
    type: 'desktop' | 'mobile' | 'tablet';
    screen?: { width: number; height: number };
  };
  environment: 'production' | 'development' | 'testing';
}

type PrivacyLevel = 'public' | 'aggregated' | 'anonymized' | 'pseudonymized' | 'encrypted';

interface PrivacyConfiguration {
  enableDifferentialPrivacy: boolean;
  epsilonBudget: number; // Privacy budget for differential privacy
  k_anonymity: number; // Minimum group size for k-anonymity
  l_diversity: number; // Minimum diversity for l-diversity
  enableDataMinimization: boolean;
  enableConsentManagement: boolean;
  retentionPeriod: number; // milliseconds
  anonymizationDelay: number; // milliseconds before anonymizing data
  aggregationThreshold: number; // Minimum count for publishing aggregated data
  noiseParameters: {
    mechanism: 'laplace' | 'gaussian' | 'exponential';
    sensitivity: number;
    scale: number;
  };
}

interface AnonymizationRule {
  field: string;
  method: 'remove' | 'hash' | 'generalize' | 'suppress' | 'noise' | 'k_anonymize';
  parameters: any;
  conditions: Array<{
    field: string;
    operator: string;
    value: any;
  }>;
}

interface AggregatedMetric {
  id: string;
  name: string;
  description: string;
  metric: string;
  aggregationType: 'count' | 'sum' | 'average' | 'median' | 'percentile' | 'min' | 'max';
  dimensions: string[];
  filters: Record<string, any>;
  timeRange: { start: number; end: number };
  value: number;
  count: number; // Number of events contributing to this metric
  confidence: number; // Confidence level for the metric
  noiseAdded: number; // Amount of noise added for privacy
  privacyLevel: PrivacyLevel;
  generatedAt: number;
}

interface FederatedAnalytics {
  enabled: boolean;
  participants: string[]; // List of participant nodes
  aggregationRounds: number;
  consensus: {
    threshold: number; // Minimum participants required
    algorithm: 'byzantine_fault_tolerant' | 'simple_majority';
  };
  privacyPreserving: {
    method: 'secure_aggregation' | 'homomorphic_encryption' | 'differential_privacy';
    parameters: any;
  };
}

interface UserConsent {
  userId: string;
  grantedAt: number;
  expiresAt?: number;
  purposes: ConsentPurpose[];
  dataTypes: string[];
  optedOut: boolean;
  optOutAt?: number;
  withdrawnAt?: number;
  consentVersion: string;
}

interface ConsentPurpose {
  purpose: 'analytics' | 'personalization' | 'performance' | 'research' | 'marketing';
  essential: boolean;
  description: string;
  dataRetention: number; // milliseconds
}

interface PrivacyReport {
  id: string;
  generatedAt: number;
  timeRange: { start: number; end: number };
  totalEvents: number;
  anonymizedEvents: number;
  syntheticEvents: number;
  privacyBudgetUsed: number;
  privacyBudgetRemaining: number;
  complianceScore: number;
  risks: PrivacyRisk[];
  recommendations: string[];
  metrics: AggregatedMetric[];
}

interface PrivacyRisk {
  id: string;
  type: 'reidentification' | 'data_linkage' | 'inference' | 'membership';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  affectedData: string[];
  mitigation: string;
  likelihood: number; // 0-1
  impact: number; // 0-1
}

export class PrivacyPreservingAnalytics {
  private static instance: PrivacyPreservingAnalytics;
  private config: PrivacyConfiguration;
  private events: Map<string, AnalyticsEvent> = new Map();
  private aggregatedMetrics: Map<string, AggregatedMetric> = new Map();
  private userConsents: Map<string, UserConsent> = new Map();
  private anonymizationRules: AnonymizationRule[] = [];
  private privacyBudget: number;
  private usedPrivacyBudget: number = 0;
  private processTimer: NodeJS.Timeout | null = null;
  private federatedAnalytics?: FederatedAnalytics;

  private constructor(config: Partial<PrivacyConfiguration> = {}) {
    this.config = {
      enableDifferentialPrivacy: true,
      epsilonBudget: 1.0, // Standard epsilon value
      k_anonymity: 5,
      l_diversity: 2,
      enableDataMinimization: true,
      enableConsentManagement: true,
      retentionPeriod: 365 * 24 * 60 * 60 * 1000, // 1 year
      anonymizationDelay: 24 * 60 * 60 * 1000, // 24 hours
      aggregationThreshold: 10,
      noiseParameters: {
        mechanism: 'laplace',
        sensitivity: 1.0,
        scale: 1.0
      },
      ...config
    };

    this.privacyBudget = this.config.epsilonBudget;
    this.initializeAnonymizationRules();
    this.startProcessingTimer();
  }

  static getInstance(config?: Partial<PrivacyConfiguration>): PrivacyPreservingAnalytics {
    if (!PrivacyPreservingAnalytics.instance) {
      PrivacyPreservingAnalytics.instance = new PrivacyPreservingAnalytics(config);
    }
    return PrivacyPreservingAnalytics.instance;
  }

  private initializeAnonymizationRules(): void {
    this.anonymizationRules = [
      {
        field: 'userId',
        method: 'hash',
        parameters: { algorithm: 'SHA-256', salt: 'analytics_salt' },
        conditions: []
      },
      {
        field: 'userAgent',
        method: 'generalize',
        parameters: { keepMajorVersion: true },
        conditions: []
      },
      {
        field: 'ipAddress',
        method: 'suppress',
        parameters: {},
        conditions: []
      },
      {
        field: 'email',
        method: 'remove',
        parameters: {},
        conditions: []
      },
      {
        field: 'location.exact',
        method: 'generalize',
        parameters: { precision: 'city' },
        conditions: []
      }
    ];
  }

  private startProcessingTimer(): void {
    // Process analytics events every 5 minutes
    this.processTimer = setInterval(() => {
      this.processAnalyticsEvents();
    }, 5 * 60 * 1000);
  }

  // Event collection with privacy controls
  async trackEvent(
    eventType: string,
    category: AnalyticsEvent['category'],
    properties: Record<string, any>,
    context: Partial<AnalyticsContext> = {},
    options: {
      userId?: string;
      sessionId?: string;
      privacyLevel?: PrivacyLevel;
      respectConsent?: boolean;
    } = {}
  ): Promise<string> {
    // Check user consent if required
    if (this.config.enableConsentManagement && options.respectConsent && options.userId) {
      const hasConsent = await this.checkUserConsent(options.userId, 'analytics');
      if (!hasConsent) {
        console.log('Analytics tracking skipped: no user consent');
        return 'consent_denied';
      }
    }

    // Apply data minimization
    if (this.config.enableDataMinimization) {
      properties = this.applyDataMinimization(properties);
    }

    const eventId = await this.generateEventId();
    const event: AnalyticsEvent = {
      id: eventId,
      timestamp: Date.now(),
      eventType,
      category,
      userId: options.userId,
      sessionId: options.sessionId || await this.generateSessionId(),
      properties,
      context: {
        platform: 'web',
        version: '1.0.0',
        environment: process.env.NODE_ENV as any || 'development',
        ...context
      },
      privacyLevel: options.privacyLevel || 'anonymized',
      anonymized: false,
      synthetic: false
    };

    // Apply immediate anonymization for high privacy levels
    if (event.privacyLevel === 'anonymized') {
      await this.anonymizeEvent(event);
    }

    this.events.set(eventId, event);

    // Schedule delayed anonymization
    if (event.privacyLevel !== 'public' && !event.anonymized) {
      setTimeout(() => {
        this.scheduleAnonymization(eventId);
      }, this.config.anonymizationDelay);
    }

    return eventId;
  }

  // Convenience methods for common analytics events
  async trackPageView(
    page: string,
    userId?: string,
    properties: Record<string, any> = {}
  ): Promise<string> {
    return await this.trackEvent(
      'page_view',
      'usage',
      { page, ...properties },
      {},
      { userId, privacyLevel: 'aggregated' }
    );
  }

  async trackFeatureUsage(
    feature: string,
    action: string,
    userId?: string,
    properties: Record<string, any> = {}
  ): Promise<string> {
    return await this.trackEvent(
      'feature_usage',
      'feature',
      { feature, action, ...properties },
      {},
      { userId, privacyLevel: 'anonymized' }
    );
  }

  async trackPerformanceMetric(
    metric: string,
    value: number,
    properties: Record<string, any> = {}
  ): Promise<string> {
    return await this.trackEvent(
      'performance_metric',
      'performance',
      { metric, value, ...properties },
      {},
      { privacyLevel: 'aggregated' }
    );
  }

  async trackError(
    error: string,
    context: Record<string, any> = {},
    userId?: string
  ): Promise<string> {
    return await this.trackEvent(
      'error',
      'error',
      { error, context },
      {},
      { userId, privacyLevel: 'anonymized', respectConsent: false } // Errors tracked for system health
    );
  }

  // Data anonymization
  private async anonymizeEvent(event: AnalyticsEvent): Promise<void> {
    for (const rule of this.anonymizationRules) {
      if (this.shouldApplyRule(rule, event)) {
        await this.applyAnonymizationRule(rule, event);
      }
    }

    event.anonymized = true;
    event.userId = undefined; // Remove user ID after anonymization
  }

  private shouldApplyRule(rule: AnonymizationRule, event: AnalyticsEvent): boolean {
    return rule.conditions.every(condition => {
      const value = this.getNestedValue(event, condition.field);
      return this.evaluateCondition(value, condition.operator, condition.value);
    });
  }

  private async applyAnonymizationRule(rule: AnonymizationRule, event: AnalyticsEvent): Promise<void> {
    const value = this.getNestedValue(event, rule.field);
    if (value === undefined) return;

    let anonymizedValue: any;

    switch (rule.method) {
      case 'remove':
        anonymizedValue = undefined;
        break;
      case 'hash':
        anonymizedValue = await this.hashValue(value, rule.parameters);
        break;
      case 'generalize':
        anonymizedValue = this.generalizeValue(value, rule.parameters);
        break;
      case 'suppress':
        anonymizedValue = '[SUPPRESSED]';
        break;
      case 'noise':
        anonymizedValue = this.addNoise(value, rule.parameters);
        break;
      case 'k_anonymize':
        // K-anonymity requires group processing, handled separately
        break;
    }

    this.setNestedValue(event, rule.field, anonymizedValue);
  }

  private async hashValue(value: any, parameters: any): Promise<string> {
    const input = String(value) + (parameters.salt || '');
    const hashBuffer = await crypto.subtle.digest(
      parameters.algorithm || 'SHA-256',
      new TextEncoder().encode(input)
    );
    return Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
      .substring(0, 16); // Truncate for privacy
  }

  private generalizeValue(value: any, parameters: any): any {
    if (typeof value === 'string' && parameters.keepMajorVersion) {
      // For user agents, keep only major version
      return value.replace(/(\d+\.\d+)\.\d+/g, '$1.x');
    }
    
    if (typeof value === 'number' && parameters.precision) {
      // Round numbers to specified precision
      return Math.round(value / parameters.precision) * parameters.precision;
    }

    if (typeof value === 'object' && parameters.precision === 'city') {
      // For location, keep only city level
      return { ...value, exact: undefined, coordinates: undefined };
    }

    return value;
  }

  private addNoise(value: any, parameters: any): any {
    if (typeof value !== 'number') return value;

    const epsilon = parameters.epsilon || 0.1;
    const sensitivity = parameters.sensitivity || 1.0;
    
    // Add Laplace noise for differential privacy
    const noise = this.generateLaplaceNoise(sensitivity / epsilon);
    return value + noise;
  }

  private generateLaplaceNoise(scale: number): number {
    // Generate Laplace noise using inverse transform sampling
    const u1 = Math.random();
    const u2 = Math.random();
    
    if (u1 < 0.5) {
      return -scale * Math.log(2 * u1);
    } else {
      return scale * Math.log(2 * (1 - u1));
    }
  }

  // Differential privacy
  async addDifferentialPrivacy(query: string, result: number): Promise<number> {
    if (!this.config.enableDifferentialPrivacy) {
      return result;
    }

    const epsilon = this.allocatePrivacyBudget(0.1); // Allocate small amount
    if (epsilon <= 0) {
      throw new Error('Privacy budget exhausted');
    }

    const { sensitivity, scale } = this.config.noiseParameters;
    const noise = this.generateLaplaceNoise(scale);
    
    this.usedPrivacyBudget += epsilon;
    
    return result + noise;
  }

  private allocatePrivacyBudget(requested: number): number {
    const remaining = this.privacyBudget - this.usedPrivacyBudget;
    return Math.min(requested, remaining);
  }

  // K-anonymity and L-diversity
  async applyKAnonymity(events: AnalyticsEvent[]): Promise<AnalyticsEvent[]> {
    // Group events by quasi-identifiers
    const groups = this.groupEventsByQuasiIdentifiers(events);
    const anonymizedEvents: AnalyticsEvent[] = [];

    for (const group of groups) {
      if (group.length >= this.config.k_anonymity) {
        // Group meets k-anonymity requirement
        anonymizedEvents.push(...group);
      } else {
        // Suppress or generalize the group
        const generalizedGroup = this.generalizeGroup(group);
        anonymizedEvents.push(...generalizedGroup);
      }
    }

    return anonymizedEvents;
  }

  private groupEventsByQuasiIdentifiers(events: AnalyticsEvent[]): AnalyticsEvent[][] {
    const groups = new Map<string, AnalyticsEvent[]>();

    for (const event of events) {
      // Create a key from quasi-identifiers
      const key = this.createQuasiIdentifierKey(event);
      
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(event);
    }

    return Array.from(groups.values());
  }

  private createQuasiIdentifierKey(event: AnalyticsEvent): string {
    // Use combinations of fields that could identify users
    const identifiers = [
      event.context.device?.type,
      event.context.location?.country,
      event.context.location?.timezone,
      event.timestamp.toString().substring(0, 10) // Date only
    ];

    return identifiers.filter(Boolean).join('|');
  }

  private generalizeGroup(events: AnalyticsEvent[]): AnalyticsEvent[] {
    // Apply additional generalization to meet k-anonymity
    return events.map(event => ({
      ...event,
      context: {
        ...event.context,
        device: { type: 'generalized' as any },
        location: { country: 'generalized' }
      }
    }));
  }

  // Aggregated analytics
  async generateAggregatedMetrics(
    metricName: string,
    aggregationType: AggregatedMetric['aggregationType'],
    dimensions: string[],
    filters: Record<string, any> = {},
    timeRange: { start: number; end: number }
  ): Promise<AggregatedMetric> {
    // Filter events
    const filteredEvents = Array.from(this.events.values()).filter(event => {
      // Time range filter
      if (event.timestamp < timeRange.start || event.timestamp > timeRange.end) {
        return false;
      }

      // Apply other filters
      for (const [key, value] of Object.entries(filters)) {
        const eventValue = this.getNestedValue(event, key);
        if (eventValue !== value) {
          return false;
        }
      }

      return true;
    });

    // Check aggregation threshold
    if (filteredEvents.length < this.config.aggregationThreshold) {
      throw new Error(`Insufficient data for aggregation (minimum ${this.config.aggregationThreshold} events required)`);
    }

    // Calculate metric value
    let value: number;
    switch (aggregationType) {
      case 'count':
        value = filteredEvents.length;
        break;
      case 'sum':
        value = filteredEvents.reduce((sum, event) => {
          const eventValue = this.getNestedValue(event, metricName);
          return sum + (typeof eventValue === 'number' ? eventValue : 0);
        }, 0);
        break;
      case 'average': {
        const total = filteredEvents.reduce((sum, event) => {
          const eventValue = this.getNestedValue(event, metricName);
          return sum + (typeof eventValue === 'number' ? eventValue : 0);
        }, 0);
        value = total / filteredEvents.length;
        break;
      }
      case 'median': {
        const values = filteredEvents
          .map(event => this.getNestedValue(event, metricName))
          .filter(val => typeof val === 'number')
          .sort((a, b) => a - b);
        value = values.length > 0 ? values[Math.floor(values.length / 2)] : 0;
        break;
      }
      default:
        value = filteredEvents.length;
    }

    // Apply differential privacy noise
    const noiseAdded = this.config.enableDifferentialPrivacy ? 
      this.generateLaplaceNoise(this.config.noiseParameters.scale) : 0;
    value += noiseAdded;

    const metric: AggregatedMetric = {
      id: await this.generateEventId(),
      name: metricName,
      description: `${aggregationType} of ${metricName}`,
      metric: metricName,
      aggregationType,
      dimensions,
      filters,
      timeRange,
      value,
      count: filteredEvents.length,
      confidence: this.calculateConfidence(filteredEvents.length),
      noiseAdded: Math.abs(noiseAdded),
      privacyLevel: 'aggregated',
      generatedAt: Date.now()
    };

    this.aggregatedMetrics.set(metric.id, metric);
    return metric;
  }

  private calculateConfidence(sampleSize: number): number {
    // Simple confidence calculation based on sample size
    if (sampleSize < 10) return 0.3;
    if (sampleSize < 100) return 0.7;
    if (sampleSize < 1000) return 0.9;
    return 0.95;
  }

  // Consent management
  async recordUserConsent(
    userId: string,
    purposes: ConsentPurpose[],
    dataTypes: string[],
    consentVersion: string = '1.0',
    expiresIn?: number
  ): Promise<void> {
    const consent: UserConsent = {
      userId,
      grantedAt: Date.now(),
      expiresAt: expiresIn ? Date.now() + expiresIn : undefined,
      purposes,
      dataTypes,
      optedOut: false,
      consentVersion
    };

    this.userConsents.set(userId, consent);
    console.log(`User consent recorded: ${userId}`);
  }

  async withdrawUserConsent(userId: string): Promise<void> {
    const consent = this.userConsents.get(userId);
    if (consent) {
      consent.optedOut = true;
      consent.withdrawnAt = Date.now();
      this.userConsents.set(userId, consent);

      // Anonymize or delete existing data
      await this.handleConsentWithdrawal(userId);
    }
  }

  async checkUserConsent(userId: string, purpose: ConsentPurpose['purpose']): Promise<boolean> {
    const consent = this.userConsents.get(userId);
    if (!consent || consent.optedOut) {
      return false;
    }

    // Check if consent has expired
    if (consent.expiresAt && Date.now() > consent.expiresAt) {
      return false;
    }

    // Check if the specific purpose is consented
    return consent.purposes.some(p => p.purpose === purpose);
  }

  private async handleConsentWithdrawal(userId: string): Promise<void> {
    // Anonymize or delete all events for this user
    for (const [eventId, event] of this.events.entries()) {
      if (event.userId === userId) {
        await this.anonymizeEvent(event);
        event.userId = undefined;
        this.events.set(eventId, event);
      }
    }

    console.log(`User data anonymized after consent withdrawal: ${userId}`);
  }

  // Synthetic data generation
  async generateSyntheticEvents(count: number, template: Partial<AnalyticsEvent>): Promise<AnalyticsEvent[]> {
    const syntheticEvents: AnalyticsEvent[] = [];

    for (let i = 0; i < count; i++) {
      const event: AnalyticsEvent = {
        id: await this.generateEventId(),
        timestamp: Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000, // Last 30 days
        eventType: template.eventType || 'synthetic_event',
        category: template.category || 'usage',
        properties: this.generateSyntheticProperties(template.properties),
        context: this.generateSyntheticContext(template.context),
        privacyLevel: 'public',
        anonymized: true,
        synthetic: true
      };

      syntheticEvents.push(event);
    }

    return syntheticEvents;
  }

  private generateSyntheticProperties(template?: Record<string, any>): Record<string, any> {
    const properties: Record<string, any> = {};

    if (template) {
      for (const [key, value] of Object.entries(template)) {
        if (typeof value === 'number') {
          properties[key] = value + (Math.random() - 0.5) * value * 0.2; // ±10% variation
        } else if (typeof value === 'string') {
          properties[key] = `synthetic_${value}`;
        } else {
          properties[key] = value;
        }
      }
    }

    return properties;
  }

  private generateSyntheticContext(template?: Partial<AnalyticsContext>): AnalyticsContext {
    return {
      platform: 'web',
      version: '1.0.0',
      environment: 'production',
      device: {
        type: ['desktop', 'mobile', 'tablet'][Math.floor(Math.random() * 3)] as any,
        screen: {
          width: 800 + Math.floor(Math.random() * 1200),
          height: 600 + Math.floor(Math.random() * 800)
        }
      },
      location: {
        country: ['US', 'GB', 'DE', 'FR', 'CA'][Math.floor(Math.random() * 5)],
        timezone: 'UTC'
      },
      ...template
    };
  }

  // Processing and maintenance
  private async processAnalyticsEvents(): Promise<void> {
    console.log('Processing analytics events for privacy compliance...');

    // Apply k-anonymity to recent events
    const recentEvents = Array.from(this.events.values())
      .filter(event => !event.anonymized && Date.now() - event.timestamp > this.config.anonymizationDelay);

    if (recentEvents.length > 0) {
      const anonymizedEvents = await this.applyKAnonymity(recentEvents);
      
      for (const event of anonymizedEvents) {
        this.events.set(event.id, event);
      }
    }

    // Clean up old events
    await this.cleanupOldEvents();

    // Reset privacy budget periodically (e.g., daily)
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    if (this.usedPrivacyBudget > 0) {
      this.usedPrivacyBudget = Math.max(0, this.usedPrivacyBudget - 0.1); // Gradual budget recovery
    }
  }

  private async scheduleAnonymization(eventId: string): Promise<void> {
    const event = this.events.get(eventId);
    if (event && !event.anonymized) {
      await this.anonymizeEvent(event);
      this.events.set(eventId, event);
    }
  }

  private async cleanupOldEvents(): Promise<void> {
    const cutoffTime = Date.now() - this.config.retentionPeriod;
    const eventsToDelete: string[] = [];

    for (const [eventId, event] of this.events.entries()) {
      if (event.timestamp < cutoffTime) {
        eventsToDelete.push(eventId);
      }
    }

    for (const eventId of eventsToDelete) {
      this.events.delete(eventId);
    }

    if (eventsToDelete.length > 0) {
      console.log(`Cleaned up ${eventsToDelete.length} old analytics events`);
    }
  }

  // Privacy risk assessment
  async assessPrivacyRisks(): Promise<PrivacyRisk[]> {
    const risks: PrivacyRisk[] = [];

    // Check for potential re-identification risks
    const unanonymizedEvents = Array.from(this.events.values())
      .filter(event => !event.anonymized && event.userId);

    if (unanonymizedEvents.length > 100) {
      risks.push({
        id: 'high_unanonymized_data',
        type: 'reidentification',
        severity: 'high',
        description: `${unanonymizedEvents.length} events contain identifiable data`,
        affectedData: ['user_identifiers'],
        mitigation: 'Schedule immediate anonymization',
        likelihood: 0.7,
        impact: 0.8
      });
    }

    // Check privacy budget usage
    const budgetUsageRatio = this.usedPrivacyBudget / this.privacyBudget;
    if (budgetUsageRatio > 0.8) {
      risks.push({
        id: 'privacy_budget_exhaustion',
        type: 'inference',
        severity: 'medium',
        description: 'Privacy budget nearly exhausted',
        affectedData: ['differential_privacy_queries'],
        mitigation: 'Reduce query frequency or increase epsilon budget',
        likelihood: 0.9,
        impact: 0.6
      });
    }

    // Check for small group sizes in aggregations
    const smallGroups = Array.from(this.aggregatedMetrics.values())
      .filter(metric => metric.count < this.config.k_anonymity);

    if (smallGroups.length > 0) {
      risks.push({
        id: 'small_group_aggregation',
        type: 'reidentification',
        severity: 'medium',
        description: `${smallGroups.length} metrics have insufficient group size`,
        affectedData: ['aggregated_metrics'],
        mitigation: 'Increase aggregation threshold or suppress small groups',
        likelihood: 0.5,
        impact: 0.7
      });
    }

    return risks;
  }

  // Privacy report generation
  async generatePrivacyReport(timeRange: { start: number; end: number }): Promise<PrivacyReport> {
    const events = Array.from(this.events.values())
      .filter(event => event.timestamp >= timeRange.start && event.timestamp <= timeRange.end);

    const anonymizedEvents = events.filter(event => event.anonymized);
    const syntheticEvents = events.filter(event => event.synthetic);
    const risks = await this.assessPrivacyRisks();

    // Calculate compliance score
    const complianceScore = this.calculateComplianceScore(events, risks);

    const report: PrivacyReport = {
      id: await this.generateEventId(),
      generatedAt: Date.now(),
      timeRange,
      totalEvents: events.length,
      anonymizedEvents: anonymizedEvents.length,
      syntheticEvents: syntheticEvents.length,
      privacyBudgetUsed: this.usedPrivacyBudget,
      privacyBudgetRemaining: this.privacyBudget - this.usedPrivacyBudget,
      complianceScore,
      risks,
      recommendations: this.generateRecommendations(risks),
      metrics: Array.from(this.aggregatedMetrics.values())
        .filter(metric => 
          metric.generatedAt >= timeRange.start && 
          metric.generatedAt <= timeRange.end
        )
    };

    return report;
  }

  private calculateComplianceScore(events: AnalyticsEvent[], risks: PrivacyRisk[]): number {
    let score = 100;

    // Deduct points for unanonymized events
    const unanonymizedRatio = events.filter(e => !e.anonymized && e.userId).length / events.length;
    score -= unanonymizedRatio * 30;

    // Deduct points for high-severity risks
    const highRisks = risks.filter(r => r.severity === 'high' || r.severity === 'critical');
    score -= highRisks.length * 20;

    // Deduct points for medium-severity risks
    const mediumRisks = risks.filter(r => r.severity === 'medium');
    score -= mediumRisks.length * 10;

    // Deduct points for privacy budget usage
    const budgetUsageRatio = this.usedPrivacyBudget / this.privacyBudget;
    score -= budgetUsageRatio * 15;

    return Math.max(0, Math.min(100, score));
  }

  private generateRecommendations(risks: PrivacyRisk[]): string[] {
    const recommendations: string[] = [];

    if (risks.some(r => r.type === 'reidentification')) {
      recommendations.push('Increase anonymization frequency and strengthen quasi-identifier generalization');
    }

    if (risks.some(r => r.severity === 'high' || r.severity === 'critical')) {
      recommendations.push('Address high-severity privacy risks immediately');
    }

    if (this.usedPrivacyBudget / this.privacyBudget > 0.7) {
      recommendations.push('Consider increasing privacy budget or reducing query frequency');
    }

    const smallGroupMetrics = Array.from(this.aggregatedMetrics.values())
      .filter(m => m.count < this.config.k_anonymity);
    
    if (smallGroupMetrics.length > 0) {
      recommendations.push('Suppress or generalize aggregated metrics with small group sizes');
    }

    if (recommendations.length === 0) {
      recommendations.push('Privacy posture is good - continue current practices');
    }

    return recommendations;
  }

  // Utility methods
  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => current && current[key], obj);
  }

  private setNestedValue(obj: any, path: string, value: any): void {
    const keys = path.split('.');
    const lastKey = keys.pop()!;
    const target = keys.reduce((current, key) => {
      if (!current[key]) current[key] = {};
      return current[key];
    }, obj);
    
    if (value === undefined) {
      delete target[lastKey];
    } else {
      target[lastKey] = value;
    }
  }

  private evaluateCondition(value: any, operator: string, expected: any): boolean {
    switch (operator) {
      case 'equals': return value === expected;
      case 'not_equals': return value !== expected;
      case 'greater_than': return value > expected;
      case 'less_than': return value < expected;
      case 'contains': return String(value).includes(String(expected));
      default: return false;
    }
  }

  private applyDataMinimization(properties: Record<string, any>): Record<string, any> {
    // Remove unnecessary fields that could be identifying
    const minimizedProperties = { ...properties };
    
    // Remove direct identifiers
    delete minimizedProperties.email;
    delete minimizedProperties.phone;
    delete minimizedProperties.ipAddress;
    delete minimizedProperties.deviceId;

    // Generalize timestamps to hour precision
    if (minimizedProperties.timestamp) {
      const date = new Date(minimizedProperties.timestamp);
      date.setMinutes(0, 0, 0);
      minimizedProperties.timestamp = date.getTime();
    }

    return minimizedProperties;
  }

  private async generateEventId(): Promise<string> {
    const timestamp = Date.now().toString(36);
    const randomBytes = crypto.getRandomValues(new Uint8Array(8));
    const randomPart = Array.from(randomBytes, b => b.toString(36)).join('');
    return `pa_${timestamp}_${randomPart}`;
  }

  private async generateSessionId(): Promise<string> {
    const randomBytes = crypto.getRandomValues(new Uint8Array(16));
    return Array.from(randomBytes, b => b.toString(16).padStart(2, '0')).join('');
  }

  // Getters
  getEvents(): AnalyticsEvent[] {
    return Array.from(this.events.values());
  }

  getAggregatedMetrics(): AggregatedMetric[] {
    return Array.from(this.aggregatedMetrics.values());
  }

  getUserConsents(): UserConsent[] {
    return Array.from(this.userConsents.values());
  }

  getPrivacyBudgetStatus(): { used: number; remaining: number; percentage: number } {
    return {
      used: this.usedPrivacyBudget,
      remaining: this.privacyBudget - this.usedPrivacyBudget,
      percentage: (this.usedPrivacyBudget / this.privacyBudget) * 100
    };
  }

  // Cleanup
  async cleanup(): Promise<void> {
    if (this.processTimer) {
      clearInterval(this.processTimer);
      this.processTimer = null;
    }

    console.log('Privacy-preserving analytics service cleanup completed');
  }
}

// Export singleton instance
export const privacyPreservingAnalytics = PrivacyPreservingAnalytics.getInstance({
  enableDifferentialPrivacy: true,
  epsilonBudget: 1.0,
  k_anonymity: 5,
  enableConsentManagement: true
});