// End-to-End Encryption Service for MeetingMind
// Implements AES-256-GCM encryption with ECDH key exchange and perfect forward secrecy

interface EncryptionConfig {
  algorithm: 'AES-GCM';
  keyLength: 128 | 256;
  ivLength: 12;
  tagLength: 16;
  keyDerivationIterations: 100000;
  enablePerfectForwardSecrecy: boolean;
  keyRotationInterval: number; // milliseconds
}

interface EncryptedData {
  data: ArrayBuffer;
  iv: ArrayBuffer;
  tag: ArrayBuffer;
  keyId: string;
  timestamp: number;
  algorithm: string;
  metadata?: any;
}

interface KeyPair {
  publicKey: CryptoKey;
  privateKey: CryptoKey;
  keyId: string;
  createdAt: number;
  expiresAt?: number;
}

interface SharedSecret {
  key: CryptoKey;
  keyId: string;
  participantId: string;
  createdAt: number;
  expiresAt?: number;
  usageCount: number;
  maxUsage?: number;
}

interface EncryptionStatus {
  isEnabled: boolean;
  algorithm: string;
  keyStrength: number;
  activeKeys: number;
  lastKeyRotation: number;
  encryptionOverhead: number;
  perfOptimizations: boolean;
}

export class EncryptionService {
  private static instance: EncryptionService;
  private config: EncryptionConfig;
  private keyPairs: Map<string, KeyPair> = new Map();
  private sharedSecrets: Map<string, SharedSecret> = new Map();
  private encryptionKeys: Map<string, CryptoKey> = new Map();
  private keyRotationTimer: NodeJS.Timeout | null = null;
  private isInitialized: boolean = false;

  constructor(config: Partial<EncryptionConfig> = {}) {
    this.config = {
      algorithm: 'AES-GCM',
      keyLength: 256,
      ivLength: 12,
      tagLength: 16,
      keyDerivationIterations: 100000,
      enablePerfectForwardSecrecy: true,
      keyRotationInterval: 3600000, // 1 hour
      ...config
    };
  }

  static getInstance(config?: Partial<EncryptionConfig>): EncryptionService {
    if (!EncryptionService.instance) {
      EncryptionService.instance = new EncryptionService(config);
    }
    return EncryptionService.instance;
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Check crypto support
      if (!crypto.subtle) {
        throw new Error('Web Crypto API not supported');
      }

      // Generate initial key pair for this session
      await this.generateSessionKeyPair();

      // Start key rotation if enabled
      if (this.config.enablePerfectForwardSecrecy) {
        this.startKeyRotation();
      }

      this.isInitialized = true;
      console.log('Encryption service initialized');
    } catch (error) {
      console.error('Failed to initialize encryption service:', error);
      throw error;
    }
  }

  private async generateSessionKeyPair(): Promise<KeyPair> {
    const keyPair = await crypto.subtle.generateKey(
      {
        name: 'ECDH',
        namedCurve: 'P-256'
      },
      false, // not extractable for security
      ['deriveKey']
    );

    const keyId = await this.generateKeyId();
    const sessionKeyPair: KeyPair = {
      publicKey: keyPair.publicKey,
      privateKey: keyPair.privateKey,
      keyId,
      createdAt: Date.now(),
      expiresAt: this.config.enablePerfectForwardSecrecy 
        ? Date.now() + this.config.keyRotationInterval 
        : undefined
    };

    this.keyPairs.set(keyId, sessionKeyPair);
    return sessionKeyPair;
  }

  private async generateKeyId(): Promise<string> {
    const randomBytes = crypto.getRandomValues(new Uint8Array(16));
    const hashBuffer = await crypto.subtle.digest('SHA-256', randomBytes);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 16);
  }

  async deriveSharedSecret(
    participantPublicKey: CryptoKey, 
    participantId: string,
    ownKeyId?: string
  ): Promise<string> {
    const keyPair = ownKeyId 
      ? this.keyPairs.get(ownKeyId)
      : Array.from(this.keyPairs.values())[0];

    if (!keyPair) {
      throw new Error('No key pair available for secret derivation');
    }

    try {
      // Derive shared secret using ECDH
      const sharedKey = await crypto.subtle.deriveKey(
        {
          name: 'ECDH',
          public: participantPublicKey
        },
        keyPair.privateKey,
        {
          name: 'AES-GCM',
          length: this.config.keyLength
        },
        false, // not extractable
        ['encrypt', 'decrypt']
      );

      const secretId = await this.generateKeyId();
      const sharedSecret: SharedSecret = {
        key: sharedKey,
        keyId: secretId,
        participantId,
        createdAt: Date.now(),
        expiresAt: this.config.enablePerfectForwardSecrecy 
          ? Date.now() + this.config.keyRotationInterval 
          : undefined,
        usageCount: 0,
        maxUsage: this.config.enablePerfectForwardSecrecy ? 1000 : undefined
      };

      this.sharedSecrets.set(secretId, sharedSecret);
      return secretId;
    } catch (error) {
      console.error('Failed to derive shared secret:', error);
      throw error;
    }
  }

  async encrypt(
    data: string | ArrayBuffer, 
    secretId: string,
    metadata?: any
  ): Promise<EncryptedData> {
    const sharedSecret = this.sharedSecrets.get(secretId);
    if (!sharedSecret) {
      throw new Error(`Shared secret not found: ${secretId}`);
    }

    // Check if key has expired or reached usage limit
    if (sharedSecret.expiresAt && Date.now() > sharedSecret.expiresAt) {
      throw new Error('Shared secret has expired');
    }
    if (sharedSecret.maxUsage && sharedSecret.usageCount >= sharedSecret.maxUsage) {
      throw new Error('Shared secret usage limit exceeded');
    }

    try {
      // Convert string to ArrayBuffer if needed
      const dataBuffer = typeof data === 'string' 
        ? new TextEncoder().encode(data)
        : data;

      // Generate random IV
      const iv = crypto.getRandomValues(new Uint8Array(this.config.ivLength));

      // Encrypt data
      const encryptedBuffer = await crypto.subtle.encrypt(
        {
          name: this.config.algorithm,
          iv: iv,
          tagLength: this.config.tagLength * 8 // Convert to bits
        },
        sharedSecret.key,
        dataBuffer
      );

      // Extract tag (last 16 bytes for AES-GCM)
      const encrypted = new Uint8Array(encryptedBuffer);
      const tagStart = encrypted.length - this.config.tagLength;
      const encryptedData = encrypted.slice(0, tagStart);
      const tag = encrypted.slice(tagStart);

      // Update usage count
      sharedSecret.usageCount++;

      return {
        data: encryptedData.buffer,
        iv: iv.buffer,
        tag: tag.buffer,
        keyId: secretId,
        timestamp: Date.now(),
        algorithm: this.config.algorithm,
        metadata
      };
    } catch (error) {
      console.error('Encryption failed:', error);
      throw error;
    }
  }

  async decrypt(encryptedData: EncryptedData): Promise<ArrayBuffer> {
    const sharedSecret = this.sharedSecrets.get(encryptedData.keyId);
    if (!sharedSecret) {
      throw new Error(`Shared secret not found: ${encryptedData.keyId}`);
    }

    try {
      // Combine encrypted data and tag
      const encryptedArray = new Uint8Array(encryptedData.data);
      const tagArray = new Uint8Array(encryptedData.tag);
      const combined = new Uint8Array(encryptedArray.length + tagArray.length);
      combined.set(encryptedArray);
      combined.set(tagArray, encryptedArray.length);

      // Decrypt data
      const decryptedBuffer = await crypto.subtle.decrypt(
        {
          name: encryptedData.algorithm as any,
          iv: encryptedData.iv,
          tagLength: this.config.tagLength * 8
        },
        sharedSecret.key,
        combined.buffer
      );

      return decryptedBuffer;
    } catch (error) {
      console.error('Decryption failed:', error);
      throw error;
    }
  }

  async decryptToString(encryptedData: EncryptedData): Promise<string> {
    const decryptedBuffer = await this.decrypt(encryptedData);
    return new TextDecoder().decode(decryptedBuffer);
  }

  // Key management methods
  async exportPublicKey(keyId?: string): Promise<JsonWebKey> {
    const keyPair = keyId 
      ? this.keyPairs.get(keyId)
      : Array.from(this.keyPairs.values())[0];

    if (!keyPair) {
      throw new Error('No key pair available for export');
    }

    return await crypto.subtle.exportKey('jwk', keyPair.publicKey);
  }

  async importPublicKey(jwk: JsonWebKey): Promise<CryptoKey> {
    return await crypto.subtle.importKey(
      'jwk',
      jwk,
      {
        name: 'ECDH',
        namedCurve: 'P-256'
      },
      false,
      []
    );
  }

  private startKeyRotation(): void {
    if (this.keyRotationTimer) return;

    this.keyRotationTimer = setInterval(async () => {
      try {
        await this.rotateKeys();
      } catch (error) {
        console.error('Key rotation failed:', error);
      }
    }, this.config.keyRotationInterval);
  }

  private async rotateKeys(): Promise<void> {
    console.log('Rotating encryption keys...');

    // Generate new key pair
    const newKeyPair = await this.generateSessionKeyPair();

    // Mark old keys as expired
    for (const keyPair of this.keyPairs.values()) {
      if (keyPair.keyId !== newKeyPair.keyId && !keyPair.expiresAt) {
        keyPair.expiresAt = Date.now() + 60000; // 1 minute grace period
      }
    }

    // Clean up expired shared secrets
    const now = Date.now();
    for (const [secretId, secret] of this.sharedSecrets.entries()) {
      if (secret.expiresAt && now > secret.expiresAt) {
        this.sharedSecrets.delete(secretId);
      }
    }

    console.log(`Key rotation completed. Active keys: ${this.keyPairs.size}`);
  }

  // Meeting-specific encryption methods
  async encryptMeetingData(meetingData: any, participantIds: string[]): Promise<{
    encryptedData: EncryptedData;
    keyDistribution: Map<string, string>;
  }> {
    // Serialize meeting data
    const serializedData = JSON.stringify(meetingData);

    // Generate a unique encryption key for this meeting
    const meetingKey = await crypto.subtle.generateKey(
      {
        name: 'AES-GCM',
        length: this.config.keyLength
      },
      true, // extractable for key distribution
      ['encrypt', 'decrypt']
    );

    // Generate IV and encrypt meeting data
    const iv = crypto.getRandomValues(new Uint8Array(this.config.ivLength));
    const encryptedBuffer = await crypto.subtle.encrypt(
      {
        name: this.config.algorithm,
        iv: iv,
        tagLength: this.config.tagLength * 8
      },
      meetingKey,
      new TextEncoder().encode(serializedData)
    );

    // Extract tag
    const encrypted = new Uint8Array(encryptedBuffer);
    const tagStart = encrypted.length - this.config.tagLength;
    const encryptedData = encrypted.slice(0, tagStart);
    const tag = encrypted.slice(tagStart);

    const meetingKeyId = await this.generateKeyId();
    
    // Store the meeting key temporarily for distribution
    this.encryptionKeys.set(meetingKeyId, meetingKey);

    const result: EncryptedData = {
      data: encryptedData.buffer,
      iv: iv.buffer,
      tag: tag.buffer,
      keyId: meetingKeyId,
      timestamp: Date.now(),
      algorithm: this.config.algorithm,
      metadata: {
        meetingId: meetingData.id,
        participantCount: participantIds.length
      }
    };

    // Create key distribution map (would be encrypted for each participant)
    const keyDistribution = new Map<string, string>();
    for (const participantId of participantIds) {
      keyDistribution.set(participantId, meetingKeyId);
    }

    return { encryptedData: result, keyDistribution };
  }

  async encryptTranscriptSegment(
    segment: any, 
    secretId: string
  ): Promise<EncryptedData> {
    const segmentData = {
      ...segment,
      encryptedAt: Date.now()
    };

    return await this.encrypt(JSON.stringify(segmentData), secretId, {
      type: 'transcript_segment',
      segmentId: segment.id,
      meetingId: segment.meetingId
    });
  }

  async decryptTranscriptSegment(encryptedSegment: EncryptedData): Promise<any> {
    const decryptedData = await this.decryptToString(encryptedSegment);
    return JSON.parse(decryptedData);
  }

  // Security status and monitoring
  getEncryptionStatus(): EncryptionStatus {
    const activeKeys = this.keyPairs.size + this.sharedSecrets.size;
    const lastRotation = Math.max(
      ...Array.from(this.keyPairs.values()).map(k => k.createdAt),
      0
    );

    return {
      isEnabled: this.isInitialized,
      algorithm: `${this.config.algorithm}-${this.config.keyLength}`,
      keyStrength: this.config.keyLength,
      activeKeys,
      lastKeyRotation: lastRotation,
      encryptionOverhead: this.calculateEncryptionOverhead(),
      perfOptimizations: this.config.enablePerfectForwardSecrecy
    };
  }

  private calculateEncryptionOverhead(): number {
    // Calculate average overhead of encryption (IV + tag + metadata)
    return this.config.ivLength + this.config.tagLength + 64; // ~64 bytes for metadata
  }

  // Cleanup and security
  async cleanup(): Promise<void> {
    if (this.keyRotationTimer) {
      clearInterval(this.keyRotationTimer);
      this.keyRotationTimer = null;
    }

    // Clear all keys from memory
    this.keyPairs.clear();
    this.sharedSecrets.clear();
    this.encryptionKeys.clear();

    this.isInitialized = false;
    console.log('Encryption service cleanup completed');
  }

  // Key derivation for password-based encryption
  async deriveKeyFromPassword(
    password: string, 
    salt: ArrayBuffer
  ): Promise<CryptoKey> {
    // Import password as key material
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(password),
      'PBKDF2',
      false,
      ['deriveKey']
    );

    // Derive AES key from password
    return await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: salt,
        iterations: this.config.keyDerivationIterations,
        hash: 'SHA-256'
      },
      keyMaterial,
      {
        name: 'AES-GCM',
        length: this.config.keyLength
      },
      false,
      ['encrypt', 'decrypt']
    );
  }

  // Generate cryptographically secure random values
  generateSecureRandom(length: number): Uint8Array {
    return crypto.getRandomValues(new Uint8Array(length));
  }

  // Hash functions for integrity checking
  async hash(data: ArrayBuffer, algorithm: 'SHA-256' | 'SHA-512' = 'SHA-256'): Promise<ArrayBuffer> {
    return await crypto.subtle.digest(algorithm, data);
  }

  async hashString(data: string, algorithm: 'SHA-256' | 'SHA-512' = 'SHA-256'): Promise<string> {
    const buffer = await this.hash(new TextEncoder().encode(data), algorithm);
    return Array.from(new Uint8Array(buffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  // Utility methods
  arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }

  // Debug and testing methods (development only)
  getDebugInfo(): any {
    if (process.env.NODE_ENV === 'production') {
      return { message: 'Debug info not available in production' };
    }

    return {
      keyPairs: this.keyPairs.size,
      sharedSecrets: this.sharedSecrets.size,
      encryptionKeys: this.encryptionKeys.size,
      config: this.config,
      isInitialized: this.isInitialized
    };
  }
}

// Export singleton instance
export const encryptionService = EncryptionService.getInstance({
  enablePerfectForwardSecrecy: true,
  keyRotationInterval: 3600000, // 1 hour
  keyLength: 256
});

// React hook for encryption
export function useEncryption() {
  const [isInitialized, setIsInitialized] = React.useState(false);
  const [status, setStatus] = React.useState<EncryptionStatus | null>(null);

  React.useEffect(() => {
    const initializeEncryption = async () => {
      try {
        await encryptionService.initialize();
        setIsInitialized(true);
        setStatus(encryptionService.getEncryptionStatus());
      } catch (error) {
        console.error('Failed to initialize encryption:', error);
      }
    };

    initializeEncryption();

    // Update status periodically
    const statusInterval = setInterval(() => {
      if (encryptionService.getEncryptionStatus().isEnabled) {
        setStatus(encryptionService.getEncryptionStatus());
      }
    }, 5000);

    return () => {
      clearInterval(statusInterval);
    };
  }, []);

  const encrypt = React.useCallback(async (data: string, secretId: string) => {
    return await encryptionService.encrypt(data, secretId);
  }, []);

  const decrypt = React.useCallback(async (encryptedData: EncryptedData) => {
    return await encryptionService.decryptToString(encryptedData);
  }, []);

  const generateKeyPair = React.useCallback(async () => {
    return await encryptionService.exportPublicKey();
  }, []);

  return {
    isInitialized,
    status,
    encrypt,
    decrypt,
    generateKeyPair,
    encryptionService
  };
}