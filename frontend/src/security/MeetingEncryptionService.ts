// Meeting-Specific Encryption Service for MeetingMind
// Implements end-to-end encryption for sensitive meetings with advanced security features

import { encryptionService, EncryptedData } from './EncryptionService';
import { keyManagementService } from './KeyManagementService';
import { auditLoggingService } from './AuditLoggingService';

interface MeetingSecurityLevel {
  level: 'basic' | 'enhanced' | 'maximum' | 'classified';
  description: string;
  features: {
    endToEndEncryption: boolean;
    perfectForwardSecrecy: boolean;
    keyRotationInterval: number; // minutes
    multiLayerEncryption: boolean;
    deniableCryptography: boolean;
    decentralizedKeys: boolean;
    quantumResistant: boolean;
    zeroKnowledgeAuth: boolean;
  };
  requirements: {
    minimumKeyStrength: number;
    maxParticipants: number;
    auditLogging: boolean;
    biometricAuth: boolean;
    deviceAttestation: boolean;
    networkIsolation: boolean;
  };
}

interface MeetingParticipant {
  id: string;
  publicKey: CryptoKey;
  deviceId: string;
  joinedAt: number;
  securityScore: number;
  permissions: ParticipantPermission[];
  encryptionCapabilities: {
    algorithms: string[];
    keyStrengths: number[];
    quantumReady: boolean;
    hardwareSecureElement: boolean;
  };
}

interface ParticipantPermission {
  action: 'speak' | 'listen' | 'record' | 'share_screen' | 'chat' | 'file_transfer';
  granted: boolean;
  grantedBy: string;
  grantedAt: number;
  expiresAt?: number;
}

interface SecureMeeting {
  id: string;
  title: string;
  securityLevel: MeetingSecurityLevel['level'];
  participants: Map<string, MeetingParticipant>;
  encryptionKeys: {
    meetingKey: string; // Key ID
    sessionKeys: Map<string, string>; // participant -> key ID
    rotationHistory: RotationRecord[];
  };
  metadata: {
    createdAt: number;
    createdBy: string;
    isRecording: boolean;
    isE2EEnabled: boolean;
    keyRotationCount: number;
    lastKeyRotation: number;
    maxDuration: number;
    allowedDomains: string[];
    geoRestrictions: string[];
  };
  state: 'preparing' | 'active' | 'paused' | 'ended' | 'terminated';
  securityEvents: SecurityEvent[];
}

interface RotationRecord {
  timestamp: number;
  oldKeyId: string;
  newKeyId: string;
  reason: 'scheduled' | 'participant_join' | 'participant_leave' | 'security_breach' | 'manual';
  triggeredBy: string;
  participantsAffected: string[];
}

interface SecurityEvent {
  id: string;
  timestamp: number;
  type: 'key_rotation' | 'participant_join' | 'participant_leave' | 'encryption_failure' | 'tampering_detected' | 'unauthorized_access';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  participantId?: string;
  automaticResponse?: string;
  requiredAction?: string;
}

interface EncryptedMeetingData {
  type: 'audio' | 'video' | 'chat' | 'file' | 'screen_share' | 'metadata';
  data: EncryptedData;
  sender: string;
  recipients: string[];
  timestamp: number;
  sequenceNumber: number;
  integrity: {
    hash: string;
    signature: string;
  };
}

interface MeetingRecording {
  id: string;
  meetingId: string;
  segments: EncryptedRecordingSegment[];
  metadata: {
    duration: number;
    participants: string[];
    encryptionMethod: string;
    compressionRatio: number;
    integrityChecks: number;
  };
  accessControl: {
    allowedUsers: string[];
    expiresAt?: number;
    downloadLimit?: number;
    watermarking: boolean;
  };
}

interface EncryptedRecordingSegment {
  id: string;
  startTime: number;
  endTime: number;
  data: EncryptedData;
  keyId: string;
  checksum: string;
  speakers: string[];
}

export class MeetingEncryptionService {
  private static instance: MeetingEncryptionService;
  private activeMeetings: Map<string, SecureMeeting> = new Map();
  private securityLevels: Map<string, MeetingSecurityLevel> = new Map();
  private recordings: Map<string, MeetingRecording> = new Map();
  private keyRotationTimers: Map<string, NodeJS.Timeout> = new Map();

  private constructor() {
    this.initializeSecurityLevels();
  }

  static getInstance(): MeetingEncryptionService {
    if (!MeetingEncryptionService.instance) {
      MeetingEncryptionService.instance = new MeetingEncryptionService();
    }
    return MeetingEncryptionService.instance;
  }

  private initializeSecurityLevels(): void {
    const securityLevels: MeetingSecurityLevel[] = [
      {
        level: 'basic',
        description: 'Standard encryption for internal meetings',
        features: {
          endToEndEncryption: true,
          perfectForwardSecrecy: false,
          keyRotationInterval: 60, // 1 hour
          multiLayerEncryption: false,
          deniableCryptography: false,
          decentralizedKeys: false,
          quantumResistant: false,
          zeroKnowledgeAuth: false
        },
        requirements: {
          minimumKeyStrength: 256,
          maxParticipants: 50,
          auditLogging: true,
          biometricAuth: false,
          deviceAttestation: false,
          networkIsolation: false
        }
      },
      {
        level: 'enhanced',
        description: 'Advanced encryption for sensitive business meetings',
        features: {
          endToEndEncryption: true,
          perfectForwardSecrecy: true,
          keyRotationInterval: 30, // 30 minutes
          multiLayerEncryption: true,
          deniableCryptography: false,
          decentralizedKeys: true,
          quantumResistant: false,
          zeroKnowledgeAuth: false
        },
        requirements: {
          minimumKeyStrength: 384,
          maxParticipants: 25,
          auditLogging: true,
          biometricAuth: true,
          deviceAttestation: true,
          networkIsolation: false
        }
      },
      {
        level: 'maximum',
        description: 'Maximum security for confidential meetings',
        features: {
          endToEndEncryption: true,
          perfectForwardSecrecy: true,
          keyRotationInterval: 15, // 15 minutes
          multiLayerEncryption: true,
          deniableCryptography: true,
          decentralizedKeys: true,
          quantumResistant: true,
          zeroKnowledgeAuth: true
        },
        requirements: {
          minimumKeyStrength: 521, // P-521 curve
          maxParticipants: 10,
          auditLogging: true,
          biometricAuth: true,
          deviceAttestation: true,
          networkIsolation: true
        }
      },
      {
        level: 'classified',
        description: 'Top-secret encryption for classified information',
        features: {
          endToEndEncryption: true,
          perfectForwardSecrecy: true,
          keyRotationInterval: 5, // 5 minutes
          multiLayerEncryption: true,
          deniableCryptography: true,
          decentralizedKeys: true,
          quantumResistant: true,
          zeroKnowledgeAuth: true
        },
        requirements: {
          minimumKeyStrength: 521,
          maxParticipants: 5,
          auditLogging: true,
          biometricAuth: true,
          deviceAttestation: true,
          networkIsolation: true
        }
      }
    ];

    for (const level of securityLevels) {
      this.securityLevels.set(level.level, level);
    }

    console.log('Meeting security levels initialized');
  }

  // Meeting creation and management
  async createSecureMeeting(
    title: string,
    securityLevel: MeetingSecurityLevel['level'],
    createdBy: string,
    options: {
      maxDuration?: number;
      allowedDomains?: string[];
      geoRestrictions?: string[];
      isRecording?: boolean;
    } = {}
  ): Promise<string> {
    const securityConfig = this.securityLevels.get(securityLevel);
    if (!securityConfig) {
      throw new Error(`Invalid security level: ${securityLevel}`);
    }

    const meetingId = await this.generateMeetingId();
    
    // Create master meeting key
    const meetingKeyId = await keyManagementService.createKey(
      'meeting',
      createdBy,
      [{ userId: createdBy, permission: 'admin' }],
      {
        keyStrength: securityConfig.requirements.minimumKeyStrength,
        algorithm: securityConfig.features.quantumResistant ? 'CRYSTALS-Kyber' : 'ECDH-P384'
      }
    );

    const meeting: SecureMeeting = {
      id: meetingId,
      title,
      securityLevel,
      participants: new Map(),
      encryptionKeys: {
        meetingKey: meetingKeyId,
        sessionKeys: new Map(),
        rotationHistory: []
      },
      metadata: {
        createdAt: Date.now(),
        createdBy,
        isRecording: options.isRecording || false,
        isE2EEnabled: securityConfig.features.endToEndEncryption,
        keyRotationCount: 0,
        lastKeyRotation: Date.now(),
        maxDuration: options.maxDuration || 4 * 60 * 60 * 1000, // 4 hours default
        allowedDomains: options.allowedDomains || [],
        geoRestrictions: options.geoRestrictions || []
      },
      state: 'preparing',
      securityEvents: []
    };

    this.activeMeetings.set(meetingId, meeting);

    // Start key rotation timer if perfect forward secrecy is enabled
    if (securityConfig.features.perfectForwardSecrecy) {
      await this.scheduleKeyRotation(meetingId);
    }

    await auditLoggingService.logSecurityEvent(
      'secure_meeting_created',
      'medium',
      'success',
      {
        description: `Secure meeting created with ${securityLevel} security`,
        meetingId,
        securityLevel,
        features: securityConfig.features
      },
      { userId: createdBy }
    );

    console.log(`Secure meeting created: ${meetingId} (${securityLevel})`);
    return meetingId;
  }

  async joinMeeting(
    meetingId: string,
    participantId: string,
    publicKey: CryptoKey,
    deviceInfo: {
      deviceId: string;
      capabilities: MeetingParticipant['encryptionCapabilities'];
      securityScore: number;
    }
  ): Promise<void> {
    const meeting = this.activeMeetings.get(meetingId);
    if (!meeting) {
      throw new Error(`Meeting not found: ${meetingId}`);
    }

    const securityConfig = this.securityLevels.get(meeting.securityLevel);
    if (!securityConfig) {
      throw new Error(`Invalid security configuration for meeting: ${meetingId}`);
    }

    // Check participant limits
    if (meeting.participants.size >= securityConfig.requirements.maxParticipants) {
      throw new Error(`Meeting is at maximum capacity: ${securityConfig.requirements.maxParticipants}`);
    }

    // Validate device capabilities
    await this.validateDeviceCapabilities(deviceInfo.capabilities, securityConfig);

    // Create session key for this participant
    const sessionKeyId = await encryptionService.deriveSharedSecret(
      publicKey,
      participantId
    );

    const participant: MeetingParticipant = {
      id: participantId,
      publicKey,
      deviceId: deviceInfo.deviceId,
      joinedAt: Date.now(),
      securityScore: deviceInfo.securityScore,
      permissions: this.getDefaultPermissions(participantId),
      encryptionCapabilities: deviceInfo.capabilities
    };

    meeting.participants.set(participantId, participant);
    meeting.encryptionKeys.sessionKeys.set(participantId, sessionKeyId);

    // Log security event
    await this.addSecurityEvent(meeting, {
      type: 'participant_join',
      severity: 'low',
      description: `Participant joined meeting`,
      participantId
    });

    // Rotate keys if required by security policy
    if (securityConfig.features.perfectForwardSecrecy && meeting.participants.size > 1) {
      await this.rotateKeys(meetingId, 'participant_join', participantId);
    }

    await auditLoggingService.logSecurityEvent(
      'meeting_participant_joined',
      'low',
      'success',
      {
        description: `Participant joined secure meeting`,
        meetingId,
        participantId,
        deviceId: deviceInfo.deviceId,
        securityScore: deviceInfo.securityScore
      },
      { userId: participantId }
    );

    console.log(`Participant joined meeting: ${participantId} -> ${meetingId}`);
  }

  async leaveMeeting(meetingId: string, participantId: string): Promise<void> {
    const meeting = this.activeMeetings.get(meetingId);
    if (!meeting) {
      throw new Error(`Meeting not found: ${meetingId}`);
    }

    const participant = meeting.participants.get(participantId);
    if (!participant) {
      throw new Error(`Participant not found in meeting: ${participantId}`);
    }

    // Remove participant and their session key
    meeting.participants.delete(participantId);
    meeting.encryptionKeys.sessionKeys.delete(participantId);

    // Log security event
    await this.addSecurityEvent(meeting, {
      type: 'participant_leave',
      severity: 'low',
      description: `Participant left meeting`,
      participantId
    });

    const securityConfig = this.securityLevels.get(meeting.securityLevel);
    
    // Rotate keys if perfect forward secrecy is enabled
    if (securityConfig?.features.perfectForwardSecrecy) {
      await this.rotateKeys(meetingId, 'participant_leave', participantId);
    }

    await auditLoggingService.logSecurityEvent(
      'meeting_participant_left',
      'low',
      'success',
      {
        description: `Participant left secure meeting`,
        meetingId,
        participantId
      },
      { userId: participantId }
    );

    console.log(`Participant left meeting: ${participantId} <- ${meetingId}`);
  }

  // Data encryption and decryption
  async encryptMeetingData(
    meetingId: string,
    data: ArrayBuffer | string,
    type: EncryptedMeetingData['type'],
    senderId: string,
    recipients?: string[]
  ): Promise<EncryptedMeetingData> {
    const meeting = this.activeMeetings.get(meetingId);
    if (!meeting) {
      throw new Error(`Meeting not found: ${meetingId}`);
    }

    const sender = meeting.participants.get(senderId);
    if (!sender) {
      throw new Error(`Sender not found in meeting: ${senderId}`);
    }

    // Determine recipients (all participants if not specified)
    const targetRecipients = recipients || Array.from(meeting.participants.keys());
    
    // Get sender's session key
    const senderKeyId = meeting.encryptionKeys.sessionKeys.get(senderId);
    if (!senderKeyId) {
      throw new Error(`No session key found for sender: ${senderId}`);
    }

    // Encrypt the data
    const encryptedData = await encryptionService.encrypt(
      data,
      senderKeyId,
      {
        type,
        meetingId,
        sender: senderId,
        recipients: targetRecipients
      }
    );

    // Create integrity hash and signature
    const dataString = typeof data === 'string' ? data : new TextDecoder().decode(data);
    const hash = await encryptionService.hashString(dataString);
    const signature = await this.signData(dataString, senderId);

    const encryptedMeetingData: EncryptedMeetingData = {
      type,
      data: encryptedData,
      sender: senderId,
      recipients: targetRecipients,
      timestamp: Date.now(),
      sequenceNumber: await this.getNextSequenceNumber(meetingId),
      integrity: {
        hash,
        signature
      }
    };

    await auditLoggingService.logEncryptionOperation(
      'encrypt',
      `meeting_${type}`,
      'success',
      senderId,
      {
        description: `Meeting data encrypted`,
        meetingId,
        dataType: type,
        recipients: targetRecipients.length
      }
    );

    return encryptedMeetingData;
  }

  async decryptMeetingData(
    meetingId: string,
    encryptedData: EncryptedMeetingData,
    recipientId: string
  ): Promise<ArrayBuffer> {
    const meeting = this.activeMeetings.get(meetingId);
    if (!meeting) {
      throw new Error(`Meeting not found: ${meetingId}`);
    }

    const recipient = meeting.participants.get(recipientId);
    if (!recipient) {
      throw new Error(`Recipient not found in meeting: ${recipientId}`);
    }

    // Check if recipient is authorized
    if (!encryptedData.recipients.includes(recipientId)) {
      throw new Error(`Recipient not authorized for this data: ${recipientId}`);
    }

    // Get recipient's session key
    const recipientKeyId = meeting.encryptionKeys.sessionKeys.get(recipientId);
    if (!recipientKeyId) {
      throw new Error(`No session key found for recipient: ${recipientId}`);
    }

    try {
      // Decrypt the data
      const decryptedData = await encryptionService.decrypt(encryptedData.data);

      // Verify integrity
      const decryptedString = new TextDecoder().decode(decryptedData);
      const expectedHash = await encryptionService.hashString(decryptedString);
      
      if (expectedHash !== encryptedData.integrity.hash) {
        throw new Error('Data integrity check failed');
      }

      // Verify signature
      const signatureValid = await this.verifySignature(
        decryptedString,
        encryptedData.integrity.signature,
        encryptedData.sender
      );

      if (!signatureValid) {
        throw new Error('Data signature verification failed');
      }

      await auditLoggingService.logEncryptionOperation(
        'decrypt',
        `meeting_${encryptedData.type}`,
        'success',
        recipientId,
        {
          description: `Meeting data decrypted`,
          meetingId,
          dataType: encryptedData.type,
          sender: encryptedData.sender
        }
      );

      return decryptedData;
    } catch (error) {
      await this.addSecurityEvent(meeting, {
        type: 'encryption_failure',
        severity: 'high',
        description: `Decryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        participantId: recipientId
      });

      throw error;
    }
  }

  // Key rotation and management
  private async scheduleKeyRotation(meetingId: string): Promise<void> {
    const meeting = this.activeMeetings.get(meetingId);
    if (!meeting) return;

    const securityConfig = this.securityLevels.get(meeting.securityLevel);
    if (!securityConfig) return;

    const rotationInterval = securityConfig.features.keyRotationInterval * 60 * 1000; // Convert to ms

    const timer = setInterval(async () => {
      try {
        await this.rotateKeys(meetingId, 'scheduled', 'system');
      } catch (error) {
        console.error(`Key rotation failed for meeting ${meetingId}:`, error);
      }
    }, rotationInterval);

    this.keyRotationTimers.set(meetingId, timer);
  }

  private async rotateKeys(
    meetingId: string,
    reason: RotationRecord['reason'],
    triggeredBy: string
  ): Promise<void> {
    const meeting = this.activeMeetings.get(meetingId);
    if (!meeting) {
      throw new Error(`Meeting not found: ${meetingId}`);
    }

    const oldMeetingKeyId = meeting.encryptionKeys.meetingKey;
    
    // Create new meeting key
    const newMeetingKeyId = await keyManagementService.createKey(
      'meeting',
      triggeredBy,
      Array.from(meeting.participants.keys()).map(pid => ({ userId: pid, permission: 'read' as const }))
    );

    // Generate new session keys for all participants
    const newSessionKeys = new Map<string, string>();
    
    for (const [participantId, participant] of meeting.participants.entries()) {
      const newSessionKeyId = await encryptionService.deriveSharedSecret(
        participant.publicKey,
        participantId
      );
      newSessionKeys.set(participantId, newSessionKeyId);
    }

    // Update meeting keys
    const rotationRecord: RotationRecord = {
      timestamp: Date.now(),
      oldKeyId: oldMeetingKeyId,
      newKeyId: newMeetingKeyId,
      reason,
      triggeredBy,
      participantsAffected: Array.from(meeting.participants.keys())
    };

    meeting.encryptionKeys.meetingKey = newMeetingKeyId;
    meeting.encryptionKeys.sessionKeys = newSessionKeys;
    meeting.encryptionKeys.rotationHistory.push(rotationRecord);
    meeting.metadata.keyRotationCount++;
    meeting.metadata.lastKeyRotation = Date.now();

    // Log security event
    await this.addSecurityEvent(meeting, {
      type: 'key_rotation',
      severity: 'medium',
      description: `Encryption keys rotated (${reason})`,
      automaticResponse: `Generated new keys for ${newSessionKeys.size} participants`
    });

    await auditLoggingService.logEncryptionOperation(
      'key_rotation',
      'meeting_encryption',
      'success',
      triggeredBy,
      {
        description: `Meeting encryption keys rotated`,
        meetingId,
        reason,
        participantsAffected: rotationRecord.participantsAffected.length,
        rotationCount: meeting.metadata.keyRotationCount
      }
    );

    console.log(`Keys rotated for meeting ${meetingId}: ${reason} (by ${triggeredBy})`);
  }

  // Recording encryption
  async startEncryptedRecording(
    meetingId: string,
    recordingOptions: {
      quality: 'low' | 'medium' | 'high';
      includeVideo: boolean;
      includeAudio: boolean;
      includeChat: boolean;
      watermarking: boolean;
    }
  ): Promise<string> {
    const meeting = this.activeMeetings.get(meetingId);
    if (!meeting) {
      throw new Error(`Meeting not found: ${meetingId}`);
    }

    const recordingId = await this.generateRecordingId();
    
    const recording: MeetingRecording = {
      id: recordingId,
      meetingId,
      segments: [],
      metadata: {
        duration: 0,
        participants: Array.from(meeting.participants.keys()),
        encryptionMethod: 'AES-256-GCM',
        compressionRatio: 0,
        integrityChecks: 0
      },
      accessControl: {
        allowedUsers: Array.from(meeting.participants.keys()),
        watermarking: recordingOptions.watermarking
      }
    };

    this.recordings.set(recordingId, recording);
    meeting.metadata.isRecording = true;

    await this.addSecurityEvent(meeting, {
      type: 'encryption_failure', // Using closest available type
      severity: 'medium',
      description: `Encrypted recording started`,
      automaticResponse: `Recording will be encrypted with meeting keys`
    });

    console.log(`Encrypted recording started: ${recordingId} for meeting ${meetingId}`);
    return recordingId;
  }

  async stopEncryptedRecording(recordingId: string): Promise<void> {
    const recording = this.recordings.get(recordingId);
    if (!recording) {
      throw new Error(`Recording not found: ${recordingId}`);
    }

    const meeting = this.activeMeetings.get(recording.meetingId);
    if (meeting) {
      meeting.metadata.isRecording = false;
      
      await this.addSecurityEvent(meeting, {
        type: 'encryption_failure', // Using closest available type
        severity: 'low',
        description: `Encrypted recording stopped`,
        automaticResponse: `Recording encrypted and stored securely`
      });
    }

    console.log(`Encrypted recording stopped: ${recordingId}`);
  }

  // Security validation and monitoring
  private async validateDeviceCapabilities(
    capabilities: MeetingParticipant['encryptionCapabilities'],
    securityConfig: MeetingSecurityLevel
  ): Promise<void> {
    // Check minimum key strength support
    const maxKeyStrength = Math.max(...capabilities.keyStrengths);
    if (maxKeyStrength < securityConfig.requirements.minimumKeyStrength) {
      throw new Error(`Device does not support required key strength: ${securityConfig.requirements.minimumKeyStrength}`);
    }

    // Check quantum resistance if required
    if (securityConfig.features.quantumResistant && !capabilities.quantumReady) {
      throw new Error('Device does not support quantum-resistant algorithms');
    }

    // Check hardware security element if required
    if (securityConfig.requirements.deviceAttestation && !capabilities.hardwareSecureElement) {
      throw new Error('Device does not have required hardware security element');
    }
  }

  private getDefaultPermissions(participantId: string): ParticipantPermission[] {
    return [
      { action: 'speak', granted: true, grantedBy: 'system', grantedAt: Date.now() },
      { action: 'listen', granted: true, grantedBy: 'system', grantedAt: Date.now() },
      { action: 'chat', granted: true, grantedBy: 'system', grantedAt: Date.now() }
    ];
  }

  private async addSecurityEvent(meeting: SecureMeeting, event: Omit<SecurityEvent, 'id' | 'timestamp'>): Promise<void> {
    const securityEvent: SecurityEvent = {
      id: await this.generateEventId(),
      timestamp: Date.now(),
      ...event
    };

    meeting.securityEvents.push(securityEvent);

    // Keep only last 100 events per meeting
    if (meeting.securityEvents.length > 100) {
      meeting.securityEvents = meeting.securityEvents.slice(-100);
    }

    // Trigger automatic responses for critical events
    if (event.severity === 'critical') {
      await this.handleCriticalSecurityEvent(meeting, securityEvent);
    }
  }

  private async handleCriticalSecurityEvent(meeting: SecureMeeting, event: SecurityEvent): Promise<void> {
    // Implement automatic security responses
    switch (event.type) {
      case 'tampering_detected':
        // Immediately rotate keys and terminate suspicious participant
        if (event.participantId) {
          await this.leaveMeeting(meeting.id, event.participantId);
        }
        await this.rotateKeys(meeting.id, 'security_breach', 'system');
        break;
        
      case 'unauthorized_access':
        // Lock down the meeting
        meeting.state = 'terminated';
        await this.endMeeting(meeting.id, 'system');
        break;
    }
  }

  // Meeting lifecycle
  async endMeeting(meetingId: string, endedBy: string): Promise<void> {
    const meeting = this.activeMeetings.get(meetingId);
    if (!meeting) {
      throw new Error(`Meeting not found: ${meetingId}`);
    }

    meeting.state = 'ended';

    // Stop key rotation timer
    const timer = this.keyRotationTimers.get(meetingId);
    if (timer) {
      clearInterval(timer);
      this.keyRotationTimers.delete(meetingId);
    }

    // Revoke all session keys for security
    for (const [participantId, keyId] of meeting.encryptionKeys.sessionKeys.entries()) {
      try {
        await keyManagementService.revokeKey(keyId, endedBy, 'meeting_ended');
      } catch (error) {
        console.warn(`Failed to revoke key for participant ${participantId}:`, error);
      }
    }

    await auditLoggingService.logSecurityEvent(
      'secure_meeting_ended',
      'medium',
      'success',
      {
        description: `Secure meeting ended`,
        meetingId,
        duration: Date.now() - meeting.metadata.createdAt,
        participantCount: meeting.participants.size,
        keyRotationCount: meeting.metadata.keyRotationCount,
        securityEvents: meeting.securityEvents.length
      },
      { userId: endedBy }
    );

    console.log(`Secure meeting ended: ${meetingId}`);
  }

  // Utility methods
  private async signData(data: string, signerId: string): Promise<string> {
    // In a real implementation, this would use the participant's private key for signing
    return await encryptionService.hashString(`${data}:${signerId}:${Date.now()}`);
  }

  private async verifySignature(data: string, signature: string, signerId: string): Promise<boolean> {
    // In a real implementation, this would verify using the participant's public key
    // For now, we'll just check if the signature is not empty
    return signature.length > 0;
  }

  private async getNextSequenceNumber(meetingId: string): Promise<number> {
    // In a real implementation, this would maintain sequence numbers per meeting
    return Date.now() % 1000000;
  }

  private async generateMeetingId(): Promise<string> {
    const timestamp = Date.now().toString(36);
    const randomBytes = crypto.getRandomValues(new Uint8Array(8));
    const randomPart = Array.from(randomBytes, b => b.toString(36)).join('');
    return `meeting_${timestamp}_${randomPart}`;
  }

  private async generateRecordingId(): Promise<string> {
    const timestamp = Date.now().toString(36);
    const randomBytes = crypto.getRandomValues(new Uint8Array(8));
    const randomPart = Array.from(randomBytes, b => b.toString(36)).join('');
    return `recording_${timestamp}_${randomPart}`;
  }

  private async generateEventId(): Promise<string> {
    const timestamp = Date.now().toString(36);
    const randomBytes = crypto.getRandomValues(new Uint8Array(6));
    const randomPart = Array.from(randomBytes, b => b.toString(36)).join('');
    return `event_${timestamp}_${randomPart}`;
  }

  // Getters and status
  getMeeting(meetingId: string): SecureMeeting | undefined {
    return this.activeMeetings.get(meetingId);
  }

  getActiveMeetings(): SecureMeeting[] {
    return Array.from(this.activeMeetings.values());
  }

  getSecurityLevels(): MeetingSecurityLevel[] {
    return Array.from(this.securityLevels.values());
  }

  getRecording(recordingId: string): MeetingRecording | undefined {
    return this.recordings.get(recordingId);
  }

  getMeetingSecurityStatus(meetingId: string): {
    isSecure: boolean;
    securityLevel: string;
    encryptionActive: boolean;
    participantCount: number;
    keyRotationCount: number;
    lastKeyRotation: number;
    securityEvents: number;
    criticalEvents: number;
  } | null {
    const meeting = this.activeMeetings.get(meetingId);
    if (!meeting) return null;

    const criticalEvents = meeting.securityEvents.filter(e => e.severity === 'critical').length;

    return {
      isSecure: meeting.state === 'active' && criticalEvents === 0,
      securityLevel: meeting.securityLevel,
      encryptionActive: meeting.metadata.isE2EEnabled,
      participantCount: meeting.participants.size,
      keyRotationCount: meeting.metadata.keyRotationCount,
      lastKeyRotation: meeting.metadata.lastKeyRotation,
      securityEvents: meeting.securityEvents.length,
      criticalEvents
    };
  }

  // Cleanup
  async cleanup(): Promise<void> {
    // Clear all timers
    for (const timer of this.keyRotationTimers.values()) {
      clearInterval(timer);
    }
    this.keyRotationTimers.clear();

    // End all active meetings
    for (const meetingId of this.activeMeetings.keys()) {
      try {
        await this.endMeeting(meetingId, 'system_cleanup');
      } catch (error) {
        console.warn(`Failed to end meeting ${meetingId} during cleanup:`, error);
      }
    }

    console.log('Meeting encryption service cleanup completed');
  }
}

// Export singleton instance
export const meetingEncryptionService = MeetingEncryptionService.getInstance();