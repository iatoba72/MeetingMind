// Data Retention and Auto-Deletion Service for MeetingMind
// Implements comprehensive data lifecycle management with privacy compliance and automated deletion

interface RetentionPolicy {
  id: string;
  name: string;
  description: string;
  dataTypes: DataType[];
  retentionPeriod: number; // milliseconds
  gracePeriod: number; // milliseconds
  isActive: boolean;
  createdBy: string;
  createdAt: number;
  lastModified: number;
  priority: number; // Higher number = higher priority
  conditions: RetentionCondition[];
  actions: RetentionAction[];
  complianceRules: ComplianceRule[];
}

interface DataType {
  type: 'meeting' | 'transcript' | 'recording' | 'chat' | 'file' | 'analytics' | 'logs' | 'user_data';
  subtype?: string;
  sensitivity: 'public' | 'internal' | 'confidential' | 'restricted';
  personalData: boolean;
  encryptionRequired: boolean;
}

interface RetentionCondition {
  field: string;
  operator: 'equals' | 'not_equals' | 'greater_than' | 'less_than' | 'contains' | 'regex';
  value: any;
  logicalOperator?: 'AND' | 'OR';
}

interface RetentionAction {
  type: 'delete' | 'archive' | 'anonymize' | 'encrypt' | 'notify';
  parameters: any;
  executeAfter: number; // milliseconds after retention period
  requiresApproval: boolean;
  approvers: string[];
}

interface ComplianceRule {
  regulation: 'GDPR' | 'CCPA' | 'HIPAA' | 'SOX' | 'CUSTOM';
  requirements: string[];
  maxRetentionPeriod?: number;
  deleteOnRequest: boolean;
  anonymizationRequired: boolean;
  auditTrailRequired: boolean;
}

interface DataItem {
  id: string;
  type: DataType['type'];
  subtype?: string;
  createdAt: number;
  lastModified: number;
  lastAccessed: number;
  size: number;
  owner: string;
  accessCount: number;
  tags: string[];
  metadata: any;
  retentionPolicyIds: string[];
  isProtected: boolean;
  protectionReason?: string;
  scheduledDeletion?: number;
}

interface RetentionJob {
  id: string;
  policyId: string;
  scheduledTime: number;
  dataItems: string[];
  action: RetentionAction;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  approvalStatus?: 'pending' | 'approved' | 'rejected';
  approvedBy?: string;
  approvedAt?: number;
  startedAt?: number;
  completedAt?: number;
  errors: string[];
  results: RetentionJobResult[];
}

interface RetentionJobResult {
  dataItemId: string;
  action: string;
  success: boolean;
  error?: string;
  sizeBefore?: number;
  sizeAfter?: number;
  timestamp: number;
}

interface DataRetentionStats {
  totalDataItems: number;
  dataByType: Record<string, number>;
  dataBySize: Record<string, number>;
  retentionPolicies: number;
  activePolicies: number;
  scheduledJobs: number;
  completedJobs: number;
  totalSizeManaged: number;
  complianceScore: number;
  nextCleanup: number;
  violationsCount: number;
}

export class DataRetentionService {
  private static instance: DataRetentionService;
  private retentionPolicies: Map<string, RetentionPolicy> = new Map();
  private dataItems: Map<string, DataItem> = new Map();
  private retentionJobs: Map<string, RetentionJob> = new Map();
  private schedulerTimer: NodeJS.Timeout | null = null;
  private complianceRules: Map<string, ComplianceRule> = new Map();
  private protectedData: Set<string> = new Set();

  private constructor() {
    this.initializeDefaultPolicies();
    this.startScheduler();
  }

  static getInstance(): DataRetentionService {
    if (!DataRetentionService.instance) {
      DataRetentionService.instance = new DataRetentionService();
    }
    return DataRetentionService.instance;
  }

  private initializeDefaultPolicies(): void {
    // GDPR Compliance Policy
    const gdprPolicy: RetentionPolicy = {
      id: 'gdpr_default',
      name: 'GDPR Data Retention',
      description: 'Default GDPR compliant retention policy for personal data',
      dataTypes: [{
        type: 'user_data',
        sensitivity: 'confidential',
        personalData: true,
        encryptionRequired: true
      }],
      retentionPeriod: 3 * 365 * 24 * 60 * 60 * 1000, // 3 years
      gracePeriod: 30 * 24 * 60 * 60 * 1000, // 30 days
      isActive: true,
      createdBy: 'system',
      createdAt: Date.now(),
      lastModified: Date.now(),
      priority: 100,
      conditions: [{
        field: 'personalData',
        operator: 'equals',
        value: true
      }],
      actions: [{
        type: 'anonymize',
        parameters: { method: 'hash', preserveAnalytics: true },
        executeAfter: 0,
        requiresApproval: false,
        approvers: []
      }],
      complianceRules: [{
        regulation: 'GDPR',
        requirements: ['Right to erasure', 'Data minimization', 'Storage limitation'],
        deleteOnRequest: true,
        anonymizationRequired: true,
        auditTrailRequired: true
      }]
    };

    // Meeting Data Policy
    const meetingPolicy: RetentionPolicy = {
      id: 'meeting_default',
      name: 'Meeting Data Retention',
      description: 'Standard retention policy for meeting recordings and transcripts',
      dataTypes: [
        { type: 'meeting', sensitivity: 'internal', personalData: false, encryptionRequired: false },
        { type: 'transcript', sensitivity: 'internal', personalData: true, encryptionRequired: true },
        { type: 'recording', sensitivity: 'confidential', personalData: true, encryptionRequired: true }
      ],
      retentionPeriod: 2 * 365 * 24 * 60 * 60 * 1000, // 2 years
      gracePeriod: 90 * 24 * 60 * 60 * 1000, // 90 days
      isActive: true,
      createdBy: 'system',
      createdAt: Date.now(),
      lastModified: Date.now(),
      priority: 50,
      conditions: [],
      actions: [
        {
          type: 'archive',
          parameters: { location: 'cold_storage', compress: true },
          executeAfter: 0,
          requiresApproval: false,
          approvers: []
        },
        {
          type: 'delete',
          parameters: { secure: true, auditLog: true },
          executeAfter: 90 * 24 * 60 * 60 * 1000, // 90 days after archival
          requiresApproval: true,
          approvers: ['data_officer', 'legal_team']
        }
      ],
      complianceRules: []
    };

    // Analytics Data Policy
    const analyticsPolicy: RetentionPolicy = {
      id: 'analytics_default',
      name: 'Analytics Data Retention',
      description: 'Retention policy for anonymized analytics and usage data',
      dataTypes: [{
        type: 'analytics',
        sensitivity: 'internal',
        personalData: false,
        encryptionRequired: false
      }],
      retentionPeriod: 5 * 365 * 24 * 60 * 60 * 1000, // 5 years
      gracePeriod: 0,
      isActive: true,
      createdBy: 'system',
      createdAt: Date.now(),
      lastModified: Date.now(),
      priority: 10,
      conditions: [{
        field: 'type',
        operator: 'equals',
        value: 'analytics'
      }],
      actions: [{
        type: 'delete',
        parameters: { secure: false, auditLog: true },
        executeAfter: 0,
        requiresApproval: false,
        approvers: []
      }],
      complianceRules: []
    };

    this.retentionPolicies.set(gdprPolicy.id, gdprPolicy);
    this.retentionPolicies.set(meetingPolicy.id, meetingPolicy);
    this.retentionPolicies.set(analyticsPolicy.id, analyticsPolicy);
  }

  // Policy management
  async createRetentionPolicy(policy: Omit<RetentionPolicy, 'id' | 'createdAt' | 'lastModified'>): Promise<string> {
    const id = await this.generateId();
    const newPolicy: RetentionPolicy = {
      ...policy,
      id,
      createdAt: Date.now(),
      lastModified: Date.now()
    };

    // Validate policy
    await this.validatePolicy(newPolicy);

    this.retentionPolicies.set(id, newPolicy);
    
    console.log(`Retention policy created: ${policy.name}`);
    return id;
  }

  async updateRetentionPolicy(id: string, updates: Partial<RetentionPolicy>): Promise<void> {
    const policy = this.retentionPolicies.get(id);
    if (!policy) {
      throw new Error(`Policy not found: ${id}`);
    }

    const updatedPolicy = {
      ...policy,
      ...updates,
      lastModified: Date.now()
    };

    await this.validatePolicy(updatedPolicy);
    this.retentionPolicies.set(id, updatedPolicy);

    console.log(`Retention policy updated: ${id}`);
  }

  async deleteRetentionPolicy(id: string): Promise<void> {
    const policy = this.retentionPolicies.get(id);
    if (!policy) {
      throw new Error(`Policy not found: ${id}`);
    }

    // Check if policy is in use
    const dataItemsUsingPolicy = Array.from(this.dataItems.values())
      .filter(item => item.retentionPolicyIds.includes(id));

    if (dataItemsUsingPolicy.length > 0) {
      throw new Error(`Cannot delete policy ${id}: ${dataItemsUsingPolicy.length} data items are using it`);
    }

    this.retentionPolicies.delete(id);
    console.log(`Retention policy deleted: ${id}`);
  }

  private async validatePolicy(policy: RetentionPolicy): Promise<void> {
    // Validate retention period
    if (policy.retentionPeriod < 0) {
      throw new Error('Retention period must be positive');
    }

    // Validate compliance rules
    for (const rule of policy.complianceRules) {
      if (rule.maxRetentionPeriod && policy.retentionPeriod > rule.maxRetentionPeriod) {
        throw new Error(`Retention period exceeds ${rule.regulation} maximum: ${rule.maxRetentionPeriod}ms`);
      }
    }

    // Validate conditions
    for (const condition of policy.conditions) {
      if (!['equals', 'not_equals', 'greater_than', 'less_than', 'contains', 'regex'].includes(condition.operator)) {
        throw new Error(`Invalid condition operator: ${condition.operator}`);
      }
    }

    // Validate actions
    for (const action of policy.actions) {
      if (!['delete', 'archive', 'anonymize', 'encrypt', 'notify'].includes(action.type)) {
        throw new Error(`Invalid action type: ${action.type}`);
      }
    }
  }

  // Data item management
  async registerDataItem(item: Omit<DataItem, 'id' | 'createdAt' | 'lastModified' | 'lastAccessed'>): Promise<string> {
    const id = await this.generateId();
    const dataItem: DataItem = {
      ...item,
      id,
      createdAt: Date.now(),
      lastModified: Date.now(),
      lastAccessed: Date.now()
    };

    // Apply retention policies
    dataItem.retentionPolicyIds = await this.findApplicablePolicies(dataItem);

    this.dataItems.set(id, dataItem);
    
    // Schedule retention jobs if needed
    await this.scheduleRetentionJobs(dataItem);

    return id;
  }

  async updateDataItem(id: string, updates: Partial<DataItem>): Promise<void> {
    const item = this.dataItems.get(id);
    if (!item) {
      throw new Error(`Data item not found: ${id}`);
    }

    const updatedItem = {
      ...item,
      ...updates,
      lastModified: Date.now()
    };

    // Re-evaluate policies if data type changed
    if (updates.type || updates.subtype || updates.tags) {
      updatedItem.retentionPolicyIds = await this.findApplicablePolicies(updatedItem);
      await this.scheduleRetentionJobs(updatedItem);
    }

    this.dataItems.set(id, updatedItem);
  }

  async accessDataItem(id: string): Promise<void> {
    const item = this.dataItems.get(id);
    if (item) {
      item.lastAccessed = Date.now();
      item.accessCount++;
      this.dataItems.set(id, item);
    }
  }

  async deleteDataItem(id: string, reason: string = 'manual_deletion'): Promise<void> {
    const item = this.dataItems.get(id);
    if (!item) {
      throw new Error(`Data item not found: ${id}`);
    }

    // Check if item is protected
    if (item.isProtected) {
      throw new Error(`Cannot delete protected data item: ${item.protectionReason}`);
    }

    // Cancel any scheduled jobs for this item
    for (const job of this.retentionJobs.values()) {
      if (job.dataItems.includes(id) && job.status === 'pending') {
        job.status = 'cancelled';
      }
    }

    this.dataItems.delete(id);
    console.log(`Data item deleted: ${id} (${reason})`);
  }

  // Policy application
  private async findApplicablePolicies(dataItem: DataItem): Promise<string[]> {
    const applicablePolicies: string[] = [];

    for (const policy of this.retentionPolicies.values()) {
      if (!policy.isActive) continue;

      // Check if data type matches
      const typeMatches = policy.dataTypes.some(policyType => 
        policyType.type === dataItem.type && 
        (!policyType.subtype || policyType.subtype === dataItem.subtype)
      );

      if (!typeMatches) continue;

      // Check conditions
      const conditionsMatch = await this.evaluateConditions(policy.conditions, dataItem);
      if (conditionsMatch) {
        applicablePolicies.push(policy.id);
      }
    }

    // Sort by priority (highest first)
    return applicablePolicies.sort((a, b) => {
      const policyA = this.retentionPolicies.get(a)!;
      const policyB = this.retentionPolicies.get(b)!;
      return policyB.priority - policyA.priority;
    });
  }

  private async evaluateConditions(conditions: RetentionCondition[], dataItem: DataItem): Promise<boolean> {
    if (conditions.length === 0) return true;

    let result = true;
    let currentLogicalOp: 'AND' | 'OR' = 'AND';

    for (let i = 0; i < conditions.length; i++) {
      const condition = conditions[i];
      const conditionResult = this.evaluateCondition(condition, dataItem);

      if (i === 0) {
        result = conditionResult;
      } else {
        if (currentLogicalOp === 'AND') {
          result = result && conditionResult;
        } else {
          result = result || conditionResult;
        }
      }

      currentLogicalOp = condition.logicalOperator || 'AND';
    }

    return result;
  }

  private evaluateCondition(condition: RetentionCondition, dataItem: DataItem): boolean {
    const value = this.getFieldValue(condition.field, dataItem);

    switch (condition.operator) {
      case 'equals':
        return value === condition.value;
      case 'not_equals':
        return value !== condition.value;
      case 'greater_than':
        return value > condition.value;
      case 'less_than':
        return value < condition.value;
      case 'contains':
        return String(value).includes(String(condition.value));
      case 'regex':
        return new RegExp(condition.value).test(String(value));
      default:
        return false;
    }
  }

  private getFieldValue(field: string, dataItem: DataItem): any {
    const fieldParts = field.split('.');
    let value: any = dataItem;

    for (const part of fieldParts) {
      if (value && typeof value === 'object' && part in value) {
        value = value[part];
      } else {
        return undefined;
      }
    }

    return value;
  }

  // Job scheduling and execution
  private async scheduleRetentionJobs(dataItem: DataItem): Promise<void> {
    for (const policyId of dataItem.retentionPolicyIds) {
      const policy = this.retentionPolicies.get(policyId);
      if (!policy) continue;

      for (const action of policy.actions) {
        const scheduledTime = dataItem.createdAt + policy.retentionPeriod + action.executeAfter;
        
        // Only schedule if in the future
        if (scheduledTime > Date.now()) {
          const jobId = await this.generateId();
          const job: RetentionJob = {
            id: jobId,
            policyId,
            scheduledTime,
            dataItems: [dataItem.id],
            action,
            status: 'pending',
            approvalStatus: action.requiresApproval ? 'pending' : undefined,
            errors: [],
            results: []
          };

          this.retentionJobs.set(jobId, job);
        }
      }
    }
  }

  private startScheduler(): void {
    // Check for jobs to execute every minute
    this.schedulerTimer = setInterval(() => {
      this.processScheduledJobs();
    }, 60000);
  }

  private async processScheduledJobs(): Promise<void> {
    const now = Date.now();

    for (const job of this.retentionJobs.values()) {
      if (job.status !== 'pending') continue;
      if (job.scheduledTime > now) continue;
      if (job.approvalStatus === 'pending') continue;
      if (job.approvalStatus === 'rejected') {
        job.status = 'cancelled';
        continue;
      }

      await this.executeRetentionJob(job);
    }
  }

  private async executeRetentionJob(job: RetentionJob): Promise<void> {
    job.status = 'running';
    job.startedAt = Date.now();

    try {
      for (const dataItemId of job.dataItems) {
        const dataItem = this.dataItems.get(dataItemId);
        if (!dataItem) {
          job.results.push({
            dataItemId,
            action: job.action.type,
            success: false,
            error: 'Data item not found',
            timestamp: Date.now()
          });
          continue;
        }

        // Check if item is protected
        if (dataItem.isProtected && job.action.type === 'delete') {
          job.results.push({
            dataItemId,
            action: job.action.type,
            success: false,
            error: `Protected data: ${dataItem.protectionReason}`,
            timestamp: Date.now()
          });
          continue;
        }

        const result = await this.executeAction(job.action, dataItem);
        job.results.push(result);
      }

      job.status = 'completed';
      job.completedAt = Date.now();
      console.log(`Retention job completed: ${job.id}`);
    } catch (error) {
      job.status = 'failed';
      job.errors.push(error instanceof Error ? error.message : String(error));
      console.error(`Retention job failed: ${job.id}`, error);
    }
  }

  private async executeAction(action: RetentionAction, dataItem: DataItem): Promise<RetentionJobResult> {
    const sizeBefore = dataItem.size;
    let sizeAfter = sizeBefore;
    let success = true;
    let error: string | undefined;

    try {
      switch (action.type) {
        case 'delete':
          await this.deleteDataItem(dataItem.id, 'retention_policy');
          sizeAfter = 0;
          break;

        case 'archive':
          await this.archiveDataItem(dataItem, action.parameters);
          // Size might be reduced due to compression
          sizeAfter = action.parameters.compress ? sizeBefore * 0.3 : sizeBefore;
          break;

        case 'anonymize':
          await this.anonymizeDataItem(dataItem, action.parameters);
          // Size typically remains similar
          sizeAfter = sizeBefore;
          break;

        case 'encrypt':
          await this.encryptDataItem(dataItem, action.parameters);
          // Encryption adds some overhead
          sizeAfter = sizeBefore * 1.1;
          break;

        case 'notify':
          await this.sendNotification(dataItem, action.parameters);
          sizeAfter = sizeBefore;
          break;

        default:
          throw new Error(`Unknown action type: ${action.type}`);
      }
    } catch (err) {
      success = false;
      error = err instanceof Error ? err.message : String(err);
    }

    return {
      dataItemId: dataItem.id,
      action: action.type,
      success,
      error,
      sizeBefore,
      sizeAfter,
      timestamp: Date.now()
    };
  }

  private async archiveDataItem(dataItem: DataItem, parameters: any): Promise<void> {
    // In a real implementation, this would move data to cold storage
    dataItem.metadata = {
      ...dataItem.metadata,
      archived: true,
      archiveLocation: parameters.location,
      archivedAt: Date.now(),
      compressed: parameters.compress
    };

    dataItem.tags.push('archived');
    this.dataItems.set(dataItem.id, dataItem);
    
    console.log(`Data item archived: ${dataItem.id}`);
  }

  private async anonymizeDataItem(dataItem: DataItem, parameters: any): Promise<void> {
    // In a real implementation, this would apply anonymization techniques
    dataItem.metadata = {
      ...dataItem.metadata,
      anonymized: true,
      anonymizationMethod: parameters.method,
      anonymizedAt: Date.now(),
      preserveAnalytics: parameters.preserveAnalytics
    };

    // Remove owner information
    dataItem.owner = 'anonymous';
    dataItem.tags.push('anonymized');
    
    this.dataItems.set(dataItem.id, dataItem);
    console.log(`Data item anonymized: ${dataItem.id}`);
  }

  private async encryptDataItem(dataItem: DataItem, parameters: any): Promise<void> {
    // In a real implementation, this would encrypt the data
    dataItem.metadata = {
      ...dataItem.metadata,
      encrypted: true,
      encryptionAlgorithm: parameters.algorithm || 'AES-256-GCM',
      encryptedAt: Date.now()
    };

    dataItem.tags.push('encrypted');
    this.dataItems.set(dataItem.id, dataItem);
    
    console.log(`Data item encrypted: ${dataItem.id}`);
  }

  private async sendNotification(dataItem: DataItem, parameters: any): Promise<void> {
    // In a real implementation, this would send notifications
    console.log(`Notification sent for data item: ${dataItem.id}`, parameters);
  }

  // Data protection
  async protectDataItem(id: string, reason: string, protectedBy: string): Promise<void> {
    const item = this.dataItems.get(id);
    if (!item) {
      throw new Error(`Data item not found: ${id}`);
    }

    item.isProtected = true;
    item.protectionReason = reason;
    item.metadata = {
      ...item.metadata,
      protectedBy,
      protectedAt: Date.now()
    };

    this.dataItems.set(id, item);
    this.protectedData.add(id);

    console.log(`Data item protected: ${id} (${reason})`);
  }

  async unprotectDataItem(id: string, unprotectedBy: string): Promise<void> {
    const item = this.dataItems.get(id);
    if (!item) {
      throw new Error(`Data item not found: ${id}`);
    }

    item.isProtected = false;
    item.protectionReason = undefined;
    item.metadata = {
      ...item.metadata,
      unprotectedBy,
      unprotectedAt: Date.now()
    };

    this.dataItems.set(id, item);
    this.protectedData.delete(id);

    console.log(`Data item unprotected: ${id}`);
  }

  // Right to erasure (GDPR Article 17)
  async requestDataDeletion(userId: string, requestedBy: string): Promise<string[]> {
    const deletedItems: string[] = [];
    
    for (const [id, item] of this.dataItems.entries()) {
      // Find items owned by or containing data about the user
      if (item.owner === userId || 
          (item.metadata && (
            item.metadata.userId === userId || 
            item.metadata.participants?.includes(userId)
          ))) {
        
        if (item.isProtected) {
          console.warn(`Cannot delete protected item: ${id} (${item.protectionReason})`);
          continue;
        }

        await this.deleteDataItem(id, `gdpr_erasure_request_by_${requestedBy}`);
        deletedItems.push(id);
      }
    }

    console.log(`GDPR deletion request processed: ${deletedItems.length} items deleted for user ${userId}`);
    return deletedItems;
  }

  // Approval management
  async approveRetentionJob(jobId: string, approvedBy: string): Promise<void> {
    const job = this.retentionJobs.get(jobId);
    if (!job) {
      throw new Error(`Retention job not found: ${jobId}`);
    }

    if (!job.action.requiresApproval) {
      throw new Error('Job does not require approval');
    }

    if (!job.action.approvers.includes(approvedBy)) {
      throw new Error('User not authorized to approve this job');
    }

    job.approvalStatus = 'approved';
    job.approvedBy = approvedBy;
    job.approvedAt = Date.now();

    console.log(`Retention job approved: ${jobId} by ${approvedBy}`);
  }

  async rejectRetentionJob(jobId: string, rejectedBy: string, reason: string): Promise<void> {
    const job = this.retentionJobs.get(jobId);
    if (!job) {
      throw new Error(`Retention job not found: ${jobId}`);
    }

    job.approvalStatus = 'rejected';
    job.errors.push(`Rejected by ${rejectedBy}: ${reason}`);

    console.log(`Retention job rejected: ${jobId} by ${rejectedBy}`);
  }

  // Statistics and reporting
  getRetentionStats(): DataRetentionStats {
    const dataByType: Record<string, number> = {};
    const dataBySize: Record<string, number> = {};
    let totalSize = 0;
    let violationsCount = 0;

    for (const item of this.dataItems.values()) {
      dataByType[item.type] = (dataByType[item.type] || 0) + 1;
      dataBySize[item.type] = (dataBySize[item.type] || 0) + item.size;
      totalSize += item.size;

      // Check for violations (items past retention period without scheduled deletion)
      for (const policyId of item.retentionPolicyIds) {
        const policy = this.retentionPolicies.get(policyId);
        if (policy && Date.now() > item.createdAt + policy.retentionPeriod) {
          if (!item.scheduledDeletion) {
            violationsCount++;
          }
        }
      }
    }

    const activePolicies = Array.from(this.retentionPolicies.values()).filter(p => p.isActive).length;
    const scheduledJobs = Array.from(this.retentionJobs.values()).filter(j => j.status === 'pending').length;
    const completedJobs = Array.from(this.retentionJobs.values()).filter(j => j.status === 'completed').length;

    // Calculate next cleanup time
    const nextCleanup = Math.min(
      ...Array.from(this.retentionJobs.values())
        .filter(j => j.status === 'pending')
        .map(j => j.scheduledTime)
    ) || 0;

    // Calculate compliance score (100 - percentage of violations)
    const complianceScore = this.dataItems.size > 0 
      ? Math.max(0, 100 - (violationsCount / this.dataItems.size) * 100)
      : 100;

    return {
      totalDataItems: this.dataItems.size,
      dataByType,
      dataBySize,
      retentionPolicies: this.retentionPolicies.size,
      activePolicies,
      scheduledJobs,
      completedJobs,
      totalSizeManaged: totalSize,
      complianceScore,
      nextCleanup,
      violationsCount
    };
  }

  // Utility methods
  private async generateId(): Promise<string> {
    const timestamp = Date.now().toString(36);
    const randomBytes = crypto.getRandomValues(new Uint8Array(8));
    const randomPart = Array.from(randomBytes, b => b.toString(36)).join('');
    return `${timestamp}_${randomPart}`;
  }

  // Getters
  getRetentionPolicies(): RetentionPolicy[] {
    return Array.from(this.retentionPolicies.values());
  }

  getRetentionPolicy(id: string): RetentionPolicy | undefined {
    return this.retentionPolicies.get(id);
  }

  getDataItems(): DataItem[] {
    return Array.from(this.dataItems.values());
  }

  getDataItem(id: string): DataItem | undefined {
    return this.dataItems.get(id);
  }

  getRetentionJobs(): RetentionJob[] {
    return Array.from(this.retentionJobs.values());
  }

  getPendingApprovals(): RetentionJob[] {
    return Array.from(this.retentionJobs.values())
      .filter(job => job.approvalStatus === 'pending');
  }

  // Cleanup
  async cleanup(): Promise<void> {
    if (this.schedulerTimer) {
      clearInterval(this.schedulerTimer);
      this.schedulerTimer = null;
    }

    console.log('Data retention service cleanup completed');
  }
}

// Export singleton instance
export const dataRetentionService = DataRetentionService.getInstance();