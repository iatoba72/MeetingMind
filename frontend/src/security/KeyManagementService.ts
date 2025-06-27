// Key Management Service for MeetingMind
// Handles secure key storage, distribution, and lifecycle management

import { encryptionService, EncryptedData } from './EncryptionService';

interface KeyMetadata {
  keyId: string;
  purpose: 'meeting' | 'transcript' | 'file' | 'session';
  algorithm: string;
  keyStrength: number;
  createdAt: number;
  expiresAt?: number;
  createdBy: string;
  permissions: KeyPermission[];
  usageCount: number;
  maxUsage?: number;
  isRevoked: boolean;
  revokedAt?: number;
  revokedBy?: string;
  revokedReason?: string;
}

interface KeyPermission {
  userId: string;
  permission: 'read' | 'write' | 'admin';
  grantedAt: number;
  grantedBy: string;
  expiresAt?: number;
}

interface KeyDistributionPackage {
  keyId: string;
  encryptedKey: EncryptedData;
  recipientId: string;
  permissions: KeyPermission;
  signature: string;
  createdAt: number;
}

interface KeyBackup {
  keyId: string;
  encryptedKeyData: string;
  metadata: KeyMetadata;
  backupPassword: string; // Hashed
  createdAt: number;
  salt: string;
}

interface KeyAuditEvent {
  eventId: string;
  keyId: string;
  eventType: 'created' | 'accessed' | 'distributed' | 'revoked' | 'expired' | 'backed_up' | 'restored';
  userId: string;
  timestamp: number;
  details: any;
  ipAddress?: string;
  userAgent?: string;
}

interface KeyHealth {
  keyId: string;
  isValid: boolean;
  strength: 'weak' | 'moderate' | 'strong' | 'very_strong';
  age: number;
  usageRatio: number; // usageCount / maxUsage
  timeToExpiry?: number;
  recommendations: string[];
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
}

export class KeyManagementService {
  private static instance: KeyManagementService;
  private keyMetadata: Map<string, KeyMetadata> = new Map();
  private keyPermissions: Map<string, KeyPermission[]> = new Map();
  private distributedKeys: Map<string, KeyDistributionPackage[]> = new Map();
  private keyBackups: Map<string, KeyBackup> = new Map();
  private auditLog: KeyAuditEvent[] = [];
  private keyHealthCache: Map<string, KeyHealth> = new Map();
  private cleanupTimer: NodeJS.Timeout | null = null;

  private constructor() {
    this.startCleanupTimer();
  }

  static getInstance(): KeyManagementService {
    if (!KeyManagementService.instance) {
      KeyManagementService.instance = new KeyManagementService();
    }
    return KeyManagementService.instance;
  }

  // Key lifecycle management
  async createKey(
    purpose: KeyMetadata['purpose'],
    createdBy: string,
    permissions: Omit<KeyPermission, 'grantedAt' | 'grantedBy'>[],
    options: {
      expiresIn?: number; // milliseconds
      maxUsage?: number;
      algorithm?: string;
      keyStrength?: number;
    } = {}
  ): Promise<string> {
    try {
      // Generate new key ID
      const keyId = await this.generateKeyId();
      
      // Create key metadata
      const metadata: KeyMetadata = {
        keyId,
        purpose,
        algorithm: options.algorithm || 'AES-GCM-256',
        keyStrength: options.keyStrength || 256,
        createdAt: Date.now(),
        expiresAt: options.expiresIn ? Date.now() + options.expiresIn : undefined,
        createdBy,
        permissions: permissions.map(p => ({
          ...p,
          grantedAt: Date.now(),
          grantedBy: createdBy
        })),
        usageCount: 0,
        maxUsage: options.maxUsage,
        isRevoked: false
      };

      // Store metadata
      this.keyMetadata.set(keyId, metadata);
      this.keyPermissions.set(keyId, metadata.permissions);

      // Log audit event
      await this.logAuditEvent({
        eventId: await this.generateEventId(),
        keyId,
        eventType: 'created',
        userId: createdBy,
        timestamp: Date.now(),
        details: {
          purpose,
          algorithm: metadata.algorithm,
          keyStrength: metadata.keyStrength,
          maxUsage: options.maxUsage,
          expiresAt: metadata.expiresAt
        }
      });

      console.log(`Key created: ${keyId} for ${purpose}`);
      return keyId;
    } catch (error) {
      console.error('Failed to create key:', error);
      throw error;
    }
  }

  async distributeKey(
    keyId: string,
    recipientId: string,
    distributedBy: string,
    permission: KeyPermission['permission']
  ): Promise<KeyDistributionPackage> {
    const metadata = this.keyMetadata.get(keyId);
    if (!metadata) {
      throw new Error(`Key not found: ${keyId}`);
    }

    if (metadata.isRevoked) {
      throw new Error(`Key is revoked: ${keyId}`);
    }

    // Check if distributor has admin permission
    const hasPermission = await this.checkPermission(keyId, distributedBy, 'admin');
    if (!hasPermission) {
      throw new Error('Insufficient permissions to distribute key');
    }

    try {
      // Get recipient's public key (would come from user management)
      const recipientPublicKey = await this.getRecipientPublicKey(recipientId);
      
      // Create shared secret for this recipient
      const secretId = await encryptionService.deriveSharedSecret(
        recipientPublicKey,
        recipientId
      );

      // Encrypt the key for the recipient
      const keyData = await this.exportKey(keyId);
      const encryptedKey = await encryptionService.encrypt(
        JSON.stringify(keyData),
        secretId,
        { purpose: 'key_distribution', keyId, recipientId }
      );

      // Create permission for recipient
      const recipientPermission: KeyPermission = {
        userId: recipientId,
        permission,
        grantedAt: Date.now(),
        grantedBy: distributedBy
      };

      // Add permission to key
      const existingPermissions = this.keyPermissions.get(keyId) || [];
      existingPermissions.push(recipientPermission);
      this.keyPermissions.set(keyId, existingPermissions);

      // Create distribution package
      const distributionPackage: KeyDistributionPackage = {
        keyId,
        encryptedKey,
        recipientId,
        permissions: recipientPermission,
        signature: await this.signDistributionPackage(keyId, recipientId, encryptedKey),
        createdAt: Date.now()
      };

      // Store distribution record
      const distributions = this.distributedKeys.get(keyId) || [];
      distributions.push(distributionPackage);
      this.distributedKeys.set(keyId, distributions);

      // Log audit event
      await this.logAuditEvent({
        eventId: await this.generateEventId(),
        keyId,
        eventType: 'distributed',
        userId: distributedBy,
        timestamp: Date.now(),
        details: {
          recipientId,
          permission,
          distributionMethod: 'direct_encryption'
        }
      });

      return distributionPackage;
    } catch (error) {
      console.error('Failed to distribute key:', error);
      throw error;
    }
  }

  async revokeKey(
    keyId: string,
    revokedBy: string,
    reason: string
  ): Promise<void> {
    const metadata = this.keyMetadata.get(keyId);
    if (!metadata) {
      throw new Error(`Key not found: ${keyId}`);
    }

    // Check permissions
    const hasPermission = await this.checkPermission(keyId, revokedBy, 'admin');
    if (!hasPermission) {
      throw new Error('Insufficient permissions to revoke key');
    }

    // Update metadata
    metadata.isRevoked = true;
    metadata.revokedAt = Date.now();
    metadata.revokedBy = revokedBy;
    metadata.revokedReason = reason;

    this.keyMetadata.set(keyId, metadata);

    // Log audit event
    await this.logAuditEvent({
      eventId: await this.generateEventId(),
      keyId,
      eventType: 'revoked',
      userId: revokedBy,
      timestamp: Date.now(),
      details: {
        reason,
        distributionCount: this.distributedKeys.get(keyId)?.length || 0
      }
    });

    console.log(`Key revoked: ${keyId} by ${revokedBy}`);
  }

  // Permission management
  async checkPermission(
    keyId: string,
    userId: string,
    requiredPermission: KeyPermission['permission']
  ): Promise<boolean> {
    const permissions = this.keyPermissions.get(keyId) || [];
    const userPermission = permissions.find(p => p.userId === userId);

    if (!userPermission) {
      return false;
    }

    // Check if permission has expired
    if (userPermission.expiresAt && Date.now() > userPermission.expiresAt) {
      return false;
    }

    // Permission hierarchy: admin > write > read
    const permissionLevels = { read: 1, write: 2, admin: 3 };
    const userLevel = permissionLevels[userPermission.permission];
    const requiredLevel = permissionLevels[requiredPermission];

    return userLevel >= requiredLevel;
  }

  async grantPermission(
    keyId: string,
    userId: string,
    permission: KeyPermission['permission'],
    grantedBy: string,
    expiresIn?: number
  ): Promise<void> {
    // Check if granter has admin permission
    const hasPermission = await this.checkPermission(keyId, grantedBy, 'admin');
    if (!hasPermission) {
      throw new Error('Insufficient permissions to grant access');
    }

    const permissions = this.keyPermissions.get(keyId) || [];
    
    // Remove existing permission for this user
    const filteredPermissions = permissions.filter(p => p.userId !== userId);
    
    // Add new permission
    const newPermission: KeyPermission = {
      userId,
      permission,
      grantedAt: Date.now(),
      grantedBy,
      expiresAt: expiresIn ? Date.now() + expiresIn : undefined
    };

    filteredPermissions.push(newPermission);
    this.keyPermissions.set(keyId, filteredPermissions);

    console.log(`Permission granted: ${permission} to ${userId} for key ${keyId}`);
  }

  async revokePermission(keyId: string, userId: string, revokedBy: string): Promise<void> {
    const hasPermission = await this.checkPermission(keyId, revokedBy, 'admin');
    if (!hasPermission) {
      throw new Error('Insufficient permissions to revoke access');
    }

    const permissions = this.keyPermissions.get(keyId) || [];
    const filteredPermissions = permissions.filter(p => p.userId !== userId);
    this.keyPermissions.set(keyId, filteredPermissions);

    console.log(`Permission revoked for ${userId} on key ${keyId}`);
  }

  // Key backup and recovery
  async createKeyBackup(
    keyId: string,
    backupPassword: string,
    createdBy: string
  ): Promise<string> {
    const hasPermission = await this.checkPermission(keyId, createdBy, 'admin');
    if (!hasPermission) {
      throw new Error('Insufficient permissions to backup key');
    }

    const metadata = this.keyMetadata.get(keyId);
    if (!metadata) {
      throw new Error(`Key not found: ${keyId}`);
    }

    try {
      // Export key data
      const keyData = await this.exportKey(keyId);
      
      // Generate salt for password derivation
      const salt = encryptionService.generateSecureRandom(32);
      
      // Derive backup key from password
      const backupKey = await encryptionService.deriveKeyFromPassword(
        backupPassword,
        salt.buffer
      );

      // Encrypt key data with backup password
      const iv = encryptionService.generateSecureRandom(12);
      const encryptedKeyBuffer = await crypto.subtle.encrypt(
        {
          name: 'AES-GCM',
          iv: iv,
          tagLength: 128
        },
        backupKey,
        new TextEncoder().encode(JSON.stringify(keyData))
      );

      const backup: KeyBackup = {
        keyId,
        encryptedKeyData: encryptionService.arrayBufferToBase64(encryptedKeyBuffer),
        metadata: { ...metadata },
        backupPassword: await encryptionService.hashString(backupPassword),
        createdAt: Date.now(),
        salt: encryptionService.arrayBufferToBase64(salt.buffer)
      };

      // Generate backup ID
      const backupId = await this.generateBackupId();
      this.keyBackups.set(backupId, backup);

      // Log audit event
      await this.logAuditEvent({
        eventId: await this.generateEventId(),
        keyId,
        eventType: 'backed_up',
        userId: createdBy,
        timestamp: Date.now(),
        details: {
          backupId,
          backupMethod: 'password_encrypted'
        }
      });

      return backupId;
    } catch (error) {
      console.error('Failed to create key backup:', error);
      throw error;
    }
  }

  async restoreKeyFromBackup(
    backupId: string,
    backupPassword: string,
    restoredBy: string
  ): Promise<string> {
    const backup = this.keyBackups.get(backupId);
    if (!backup) {
      throw new Error(`Backup not found: ${backupId}`);
    }

    try {
      // Verify backup password
      const passwordHash = await encryptionService.hashString(backupPassword);
      if (passwordHash !== backup.backupPassword) {
        throw new Error('Invalid backup password');
      }

      // Derive backup key from password
      const salt = encryptionService.base64ToArrayBuffer(backup.salt);
      const backupKey = await encryptionService.deriveKeyFromPassword(
        backupPassword,
        salt
      );

      // Decrypt key data
      const encryptedKeyBuffer = encryptionService.base64ToArrayBuffer(backup.encryptedKeyData);
      const decryptedKeyBuffer = await crypto.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv: salt.slice(0, 12), // Use first 12 bytes of salt as IV
          tagLength: 128
        },
        backupKey,
        encryptedKeyBuffer
      );

      const keyData = JSON.parse(new TextDecoder().decode(decryptedKeyBuffer));

      // Restore key metadata
      const newKeyId = await this.generateKeyId();
      const restoredMetadata: KeyMetadata = {
        ...backup.metadata,
        keyId: newKeyId,
        createdAt: Date.now(), // New creation time
        createdBy: restoredBy,
        usageCount: 0, // Reset usage count
        isRevoked: false, // Reset revocation status
        permissions: [{
          userId: restoredBy,
          permission: 'admin',
          grantedAt: Date.now(),
          grantedBy: restoredBy
        }]
      };

      this.keyMetadata.set(newKeyId, restoredMetadata);
      this.keyPermissions.set(newKeyId, restoredMetadata.permissions);

      // Log audit event
      await this.logAuditEvent({
        eventId: await this.generateEventId(),
        keyId: newKeyId,
        eventType: 'restored',
        userId: restoredBy,
        timestamp: Date.now(),
        details: {
          originalKeyId: backup.keyId,
          backupId,
          restorationMethod: 'password_decryption'
        }
      });

      return newKeyId;
    } catch (error) {
      console.error('Failed to restore key from backup:', error);
      throw error;
    }
  }

  // Key health monitoring
  async assessKeyHealth(keyId: string): Promise<KeyHealth> {
    const metadata = this.keyMetadata.get(keyId);
    if (!metadata) {
      throw new Error(`Key not found: ${keyId}`);
    }

    const now = Date.now();
    const age = now - metadata.createdAt;
    const usageRatio = metadata.maxUsage ? metadata.usageCount / metadata.maxUsage : 0;
    const timeToExpiry = metadata.expiresAt ? metadata.expiresAt - now : undefined;

    let strength: KeyHealth['strength'] = 'very_strong';
    let riskLevel: KeyHealth['riskLevel'] = 'low';
    const recommendations: string[] = [];

    // Assess key strength
    if (metadata.keyStrength < 128) {
      strength = 'weak';
      riskLevel = 'critical';
      recommendations.push('Upgrade to stronger encryption (256-bit minimum)');
    } else if (metadata.keyStrength < 256) {
      strength = 'moderate';
      riskLevel = 'medium';
      recommendations.push('Consider upgrading to 256-bit encryption');
    }

    // Assess age
    const maxAge = 90 * 24 * 60 * 60 * 1000; // 90 days
    if (age > maxAge) {
      riskLevel = Math.max(riskLevel === 'low' ? 1 : riskLevel === 'medium' ? 2 : 3, 2) === 2 ? 'medium' : 'high';
      recommendations.push('Key is old - consider rotation');
    }

    // Assess usage
    if (usageRatio > 0.9) {
      riskLevel = 'high';
      recommendations.push('Key approaching usage limit - prepare for rotation');
    } else if (usageRatio > 0.7) {
      riskLevel = Math.max(riskLevel === 'low' ? 1 : riskLevel === 'medium' ? 2 : 3, 2) === 2 ? 'medium' : 'high';
      recommendations.push('High key usage - monitor closely');
    }

    // Check expiry
    if (timeToExpiry && timeToExpiry < 7 * 24 * 60 * 60 * 1000) { // 7 days
      riskLevel = 'high';
      recommendations.push('Key expires soon - renew immediately');
    }

    // Check revocation status
    if (metadata.isRevoked) {
      riskLevel = 'critical';
      recommendations.push('Key is revoked - do not use');
    }

    const health: KeyHealth = {
      keyId,
      isValid: !metadata.isRevoked && (!metadata.expiresAt || metadata.expiresAt > now),
      strength,
      age,
      usageRatio,
      timeToExpiry,
      recommendations,
      riskLevel
    };

    // Cache health assessment
    this.keyHealthCache.set(keyId, health);

    return health;
  }

  // Audit and compliance
  private async logAuditEvent(event: KeyAuditEvent): Promise<void> {
    this.auditLog.push(event);
    
    // Keep only last 10000 events to prevent memory issues
    if (this.auditLog.length > 10000) {
      this.auditLog = this.auditLog.slice(-10000);
    }

    // In production, this would be sent to a secure audit logging service
    if (process.env.NODE_ENV === 'development') {
      console.log('Key audit event:', event);
    }
  }

  getAuditLog(filters: {
    keyId?: string;
    userId?: string;
    eventType?: KeyAuditEvent['eventType'];
    startTime?: number;
    endTime?: number;
  } = {}): KeyAuditEvent[] {
    let filtered = this.auditLog;

    if (filters.keyId) {
      filtered = filtered.filter(e => e.keyId === filters.keyId);
    }
    if (filters.userId) {
      filtered = filtered.filter(e => e.userId === filters.userId);
    }
    if (filters.eventType) {
      filtered = filtered.filter(e => e.eventType === filters.eventType);
    }
    if (filters.startTime) {
      filtered = filtered.filter(e => e.timestamp >= filters.startTime!);
    }
    if (filters.endTime) {
      filtered = filtered.filter(e => e.timestamp <= filters.endTime!);
    }

    return filtered.sort((a, b) => b.timestamp - a.timestamp);
  }

  // Utility methods
  private async generateKeyId(): Promise<string> {
    const randomBytes = encryptionService.generateSecureRandom(16);
    const hash = await encryptionService.hash(randomBytes.buffer);
    return Array.from(new Uint8Array(hash))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
      .substring(0, 32);
  }

  private async generateEventId(): Promise<string> {
    const randomBytes = encryptionService.generateSecureRandom(12);
    return Array.from(randomBytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  private async generateBackupId(): Promise<string> {
    const timestamp = Date.now().toString(36);
    const randomBytes = encryptionService.generateSecureRandom(8);
    const randomPart = Array.from(randomBytes)
      .map(b => b.toString(36))
      .join('');
    return `backup_${timestamp}_${randomPart}`;
  }

  private async exportKey(keyId: string): Promise<any> {
    // In a real implementation, this would export the actual key material
    // For security, we return metadata instead
    const metadata = this.keyMetadata.get(keyId);
    return {
      keyId,
      metadata,
      exportedAt: Date.now()
    };
  }

  private async getRecipientPublicKey(recipientId: string): Promise<CryptoKey> {
    // In a real implementation, this would fetch the recipient's public key
    // from a secure key server or directory service
    // For now, we'll use the encryption service to generate a mock key
    return await encryptionService.importPublicKey({
      kty: 'EC',
      crv: 'P-256',
      x: 'mock_x_coordinate',
      y: 'mock_y_coordinate'
    } as any);
  }

  private async signDistributionPackage(
    keyId: string,
    recipientId: string,
    encryptedKey: EncryptedData
  ): Promise<string> {
    // Create signature data
    const signData = {
      keyId,
      recipientId,
      encryptedKeyHash: await encryptionService.hashString(
        encryptionService.arrayBufferToBase64(encryptedKey.data)
      ),
      timestamp: Date.now()
    };

    // In a real implementation, this would use a digital signature
    return await encryptionService.hashString(JSON.stringify(signData));
  }

  private startCleanupTimer(): void {
    // Clean up expired keys and audit events every hour
    this.cleanupTimer = setInterval(() => {
      this.performCleanup();
    }, 3600000); // 1 hour
  }

  private performCleanup(): void {
    const now = Date.now();

    // Clean expired keys from health cache
    for (const [keyId, health] of this.keyHealthCache.entries()) {
      if (health.timeToExpiry && health.timeToExpiry < 0) {
        this.keyHealthCache.delete(keyId);
      }
    }

    // Clean old audit events (keep 30 days)
    const thirtyDaysAgo = now - (30 * 24 * 60 * 60 * 1000);
    this.auditLog = this.auditLog.filter(event => event.timestamp > thirtyDaysAgo);

    console.log('Key management cleanup completed');
  }

  // Statistics and reporting
  getKeyStatistics(): {
    totalKeys: number;
    activeKeys: number;
    revokedKeys: number;
    expiredKeys: number;
    keysByPurpose: Record<string, number>;
    averageKeyAge: number;
    totalDistributions: number;
    totalBackups: number;
  } {
    const now = Date.now();
    const keys = Array.from(this.keyMetadata.values());

    const activeKeys = keys.filter(k => !k.isRevoked && (!k.expiresAt || k.expiresAt > now));
    const revokedKeys = keys.filter(k => k.isRevoked);
    const expiredKeys = keys.filter(k => k.expiresAt && k.expiresAt <= now && !k.isRevoked);

    const keysByPurpose = keys.reduce((acc, key) => {
      acc[key.purpose] = (acc[key.purpose] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const averageKeyAge = keys.length > 0
      ? keys.reduce((sum, key) => sum + (now - key.createdAt), 0) / keys.length
      : 0;

    const totalDistributions = Array.from(this.distributedKeys.values())
      .reduce((sum, distributions) => sum + distributions.length, 0);

    return {
      totalKeys: keys.length,
      activeKeys: activeKeys.length,
      revokedKeys: revokedKeys.length,
      expiredKeys: expiredKeys.length,
      keysByPurpose,
      averageKeyAge,
      totalDistributions,
      totalBackups: this.keyBackups.size
    };
  }

  // Cleanup
  async cleanup(): Promise<void> {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    // Clear all sensitive data
    this.keyMetadata.clear();
    this.keyPermissions.clear();
    this.distributedKeys.clear();
    this.keyBackups.clear();
    this.auditLog.length = 0;
    this.keyHealthCache.clear();

    console.log('Key management service cleanup completed');
  }
}

// Export singleton instance
export const keyManagementService = KeyManagementService.getInstance();