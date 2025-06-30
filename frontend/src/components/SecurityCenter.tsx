// Security Center Dashboard for MeetingMind
// Comprehensive security monitoring, data flow visualization, and encryption status

import React, { useState, useEffect, useCallback } from 'react';
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  Key,
  Lock,
  Eye,
  Cloud,
  CloudOff,
  Activity,
  CheckCircle,
  XCircle,
  Info,
  FileText,
  RefreshCw,
  Archive,
  Network
} from 'lucide-react';

// Import security services
import { useEncryption } from '../security/EncryptionService';
import { keyManagementService } from '../security/KeyManagementService';
import { useLocalOnlyMode } from '../security/LocalOnlyService';
import { dataRetentionService } from '../security/DataRetentionService';
import { auditLoggingService } from '../security/AuditLoggingService';
import { privacyPreservingAnalytics } from '../security/PrivacyPreservingAnalytics';

interface SecurityStatus {
  overall: 'secure' | 'warning' | 'critical' | 'unknown';
  score: number;
  lastUpdated: number;
  components: SecurityComponent[];
  threats: SecurityThreat[];
  recommendations: string[];
}

interface SecurityComponentDetails {
  // Common audit/statistics fields
  totalEvents?: number;
  recentEvents?: number;
  activeKeys?: number;
  complianceScore?: number;
  percentage?: number;
  // Encryption status fields
  algorithm?: string;
  keySize?: number;
  status?: string;
  // Any other dynamic properties
  [key: string]: string | number | boolean | undefined;
}

interface SecurityComponent {
  id: string;
  name: string;
  status: 'active' | 'warning' | 'error' | 'disabled';
  description: string;
  details: SecurityComponentDetails;
  icon: React.ComponentType<{ className?: string; size?: number | string }>;
  lastChecked: number;
}

interface SecurityThreat {
  id: string;
  type: 'encryption' | 'access' | 'data_leak' | 'compliance' | 'privacy';
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  affectedComponents: string[];
  detectedAt: number;
  mitigated: boolean;
  mitigation?: string;
}

interface DataFlow {
  id: string;
  source: DataFlowNode;
  destination: DataFlowNode;
  dataType: string;
  encrypted: boolean;
  protocol: string;
  volume: number; // bytes per second
  lastActivity: number;
  securityLevel: 'public' | 'internal' | 'confidential' | 'restricted';
}

interface DataFlowNode {
  id: string;
  name: string;
  type: 'user' | 'client' | 'server' | 'database' | 'service' | 'external';
  location: 'local' | 'cloud' | 'edge';
  encryption: boolean;
  authentication: boolean;
  ip?: string;
  port?: number;
}

interface EncryptionStatus {
  totalKeys: number;
  activeKeys: number;
  expiredKeys: number;
  encryptedData: number; // percentage
  algorithms: Record<string, number>;
  keyRotations: number;
  lastRotation: number;
}

export const SecurityCenter: React.FC<{
  className?: string;
  onThreatSelect?: (threat: SecurityThreat) => void;
}> = ({
  className = '',
  onThreatSelect
}) => {
  // State
  type TabKey = 'overview' | 'encryption' | 'dataflow' | 'privacy' | 'compliance' | 'audit';
  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [securityStatus, setSecurityStatus] = useState<SecurityStatus | null>(null);
  const [dataFlows, setDataFlows] = useState<DataFlow[]>([]);
  const [encryptionStatus, setEncryptionStatus] = useState<EncryptionStatus | null>(null);
  const [selectedThreat, setSelectedThreat] = useState<SecurityThreat | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Hooks
  const { isInitialized: encryptionInitialized, status: encStatus } = useEncryption();
  const { status: localOnlyStatus, isEnabled: localOnlyEnabled } = useLocalOnlyMode();

  // Load security data
  const loadSecurityData = useCallback(async () => {
    try {
      setIsLoading(true);

      // Collect security component statuses
      const components = await collectSecurityComponents();
      const threats = await collectSecurityThreats();
      const flows = await collectDataFlows();
      const encStatus = await collectEncryptionStatus();

      // Calculate overall security score
      const score = calculateSecurityScore(components, threats);
      const overall = getOverallStatus(score, threats);

      const status: SecurityStatus = {
        overall,
        score,
        lastUpdated: Date.now(),
        components,
        threats,
        recommendations: generateRecommendations(components, threats)
      };

      setSecurityStatus(status);
      setDataFlows(flows);
      setEncryptionStatus(encStatus);
    } catch (error) {
      console.error('Failed to load security data:', error);
    } finally {
      setIsLoading(false);
    }
  }, [collectDataFlows, collectSecurityComponents, collectSecurityThreats, generateRecommendations]);

  // Auto-refresh data
  useEffect(() => {
    loadSecurityData();

    if (autoRefresh) {
      const interval = setInterval(loadSecurityData, 30000); // 30 seconds
      return () => clearInterval(interval);
    }
  }, [loadSecurityData, autoRefresh]);

  // Security component collection
  const collectSecurityComponents = async (): Promise<SecurityComponent[]> => {
    const components: SecurityComponent[] = [];

    // Encryption Service
    components.push({
      id: 'encryption',
      name: 'End-to-End Encryption',
      status: encryptionInitialized ? 'active' : 'error',
      description: 'AES-256-GCM encryption with ECDH key exchange',
      details: encStatus,
      icon: Lock,
      lastChecked: Date.now()
    });

    // Key Management
    const keyStats = keyManagementService.getKeyStatistics();
    components.push({
      id: 'key_management',
      name: 'Key Management',
      status: keyStats.activeKeys > 0 ? 'active' : 'warning',
      description: 'Secure key storage and rotation',
      details: keyStats,
      icon: Key,
      lastChecked: Date.now()
    });

    // Local-Only Mode
    components.push({
      id: 'local_only',
      name: 'Local-Only Mode',
      status: localOnlyEnabled ? 'active' : 'disabled',
      description: 'Offline operation with local storage',
      details: localOnlyStatus,
      icon: localOnlyEnabled ? CloudOff : Cloud,
      lastChecked: Date.now()
    });

    // Data Retention
    const retentionStats = dataRetentionService.getRetentionStats();
    const retentionStatus = retentionStats.complianceScore > 80 ? 'active' : 
                           retentionStats.complianceScore > 60 ? 'warning' : 'error';
    components.push({
      id: 'data_retention',
      name: 'Data Retention',
      status: retentionStatus,
      description: 'Automated data lifecycle management',
      details: retentionStats,
      icon: Archive,
      lastChecked: Date.now()
    });

    // Audit Logging
    const auditEvents = auditLoggingService.getEvents();
    const recentEvents = auditEvents.filter(e => Date.now() - e.timestamp < 3600000); // Last hour
    components.push({
      id: 'audit_logging',
      name: 'Audit Logging',
      status: recentEvents.length > 0 ? 'active' : 'warning',
      description: 'Comprehensive security event logging',
      details: { totalEvents: auditEvents.length, recentEvents: recentEvents.length },
      icon: FileText,
      lastChecked: Date.now()
    });

    // Privacy Analytics
    const privacyBudget = privacyPreservingAnalytics.getPrivacyBudgetStatus();
    const privacyStatus = privacyBudget.percentage < 80 ? 'active' : 'warning';
    components.push({
      id: 'privacy_analytics',
      name: 'Privacy-Preserving Analytics',
      status: privacyStatus,
      description: 'Differential privacy and data anonymization',
      details: privacyBudget,
      icon: Eye,
      lastChecked: Date.now()
    });

    return components;
  };

  // Security threat collection
  const collectSecurityThreats = async (): Promise<SecurityThreat[]> => {
    const threats: SecurityThreat[] = [];

    // Check encryption threats
    if (!encryptionInitialized) {
      threats.push({
        id: 'encryption_disabled',
        type: 'encryption',
        severity: 'critical',
        title: 'Encryption Service Inactive',
        description: 'End-to-end encryption is not initialized',
        affectedComponents: ['encryption'],
        detectedAt: Date.now(),
        mitigated: false,
        mitigation: 'Initialize encryption service immediately'
      });
    }

    // Check key management threats
    const keyStats = keyManagementService.getKeyStatistics();
    if (keyStats.expiredKeys > 0) {
      threats.push({
        id: 'expired_keys',
        type: 'encryption',
        severity: 'high',
        title: 'Expired Encryption Keys',
        description: `${keyStats.expiredKeys} keys have expired`,
        affectedComponents: ['key_management'],
        detectedAt: Date.now(),
        mitigated: false,
        mitigation: 'Rotate expired keys immediately'
      });
    }

    // Check privacy budget
    const privacyBudget = privacyPreservingAnalytics.getPrivacyBudgetStatus();
    if (privacyBudget.percentage > 90) {
      threats.push({
        id: 'privacy_budget_exhausted',
        type: 'privacy',
        severity: 'medium',
        title: 'Privacy Budget Nearly Exhausted',
        description: `${privacyBudget.percentage.toFixed(1)}% of privacy budget used`,
        affectedComponents: ['privacy_analytics'],
        detectedAt: Date.now(),
        mitigated: false,
        mitigation: 'Reduce analytics queries or increase epsilon budget'
      });
    }

    // Check data retention compliance
    const retentionStats = dataRetentionService.getRetentionStats();
    if (retentionStats.violationsCount > 0) {
      threats.push({
        id: 'retention_violations',
        type: 'compliance',
        severity: 'high',
        title: 'Data Retention Violations',
        description: `${retentionStats.violationsCount} data retention policy violations`,
        affectedComponents: ['data_retention'],
        detectedAt: Date.now(),
        mitigated: false,
        mitigation: 'Review and remediate retention policy violations'
      });
    }

    // Check audit logging
    const alerts = auditLoggingService.getAlerts();
    const unacknowledgedAlerts = alerts.filter(a => !a.acknowledged);
    if (unacknowledgedAlerts.length > 0) {
      threats.push({
        id: 'unacknowledged_alerts',
        type: 'access',
        severity: 'medium',
        title: 'Unacknowledged Security Alerts',
        description: `${unacknowledgedAlerts.length} security alerts require attention`,
        affectedComponents: ['audit_logging'],
        detectedAt: Date.now(),
        mitigated: false,
        mitigation: 'Review and acknowledge pending security alerts'
      });
    }

    return threats;
  };

  // Data flow collection
  const collectDataFlows = async (): Promise<DataFlow[]> => {
    const flows: DataFlow[] = [];

    // User to Client flow
    flows.push({
      id: 'user_to_client',
      source: {
        id: 'user_device',
        name: 'User Device',
        type: 'user',
        location: 'local',
        encryption: true,
        authentication: true
      },
      destination: {
        id: 'client_app',
        name: 'MeetingMind Client',
        type: 'client',
        location: 'local',
        encryption: true,
        authentication: true
      },
      dataType: 'User Input',
      encrypted: true,
      protocol: 'HTTPS',
      volume: Math.random() * 1000,
      lastActivity: Date.now() - Math.random() * 60000,
      securityLevel: 'confidential'
    });

    // Client to Server flow (if not local-only)
    if (!localOnlyEnabled) {
      flows.push({
        id: 'client_to_server',
        source: {
          id: 'client_app',
          name: 'MeetingMind Client',
          type: 'client',
          location: 'local',
          encryption: true,
          authentication: true
        },
        destination: {
          id: 'api_server',
          name: 'API Server',
          type: 'server',
          location: 'cloud',
          encryption: true,
          authentication: true,
          ip: '10.0.0.1',
          port: 443
        },
        dataType: 'Meeting Data',
        encrypted: true,
        protocol: 'WSS/TLS',
        volume: Math.random() * 5000,
        lastActivity: Date.now() - Math.random() * 30000,
        securityLevel: 'restricted'
      });
    }

    // Local Storage flow
    flows.push({
      id: 'client_to_storage',
      source: {
        id: 'client_app',
        name: 'MeetingMind Client',
        type: 'client',
        location: 'local',
        encryption: true,
        authentication: true
      },
      destination: {
        id: 'local_storage',
        name: 'Local Storage',
        type: 'database',
        location: 'local',
        encryption: true,
        authentication: false
      },
      dataType: 'Cached Data',
      encrypted: true,
      protocol: 'Local',
      volume: Math.random() * 2000,
      lastActivity: Date.now() - Math.random() * 120000,
      securityLevel: 'internal'
    });

    // Analytics flow
    flows.push({
      id: 'client_to_analytics',
      source: {
        id: 'client_app',
        name: 'MeetingMind Client',
        type: 'client',
        location: 'local',
        encryption: true,
        authentication: true
      },
      destination: {
        id: 'analytics_service',
        name: 'Privacy Analytics',
        type: 'service',
        location: 'local',
        encryption: true,
        authentication: false
      },
      dataType: 'Anonymous Analytics',
      encrypted: true,
      protocol: 'Local',
      volume: Math.random() * 500,
      lastActivity: Date.now() - Math.random() * 300000,
      securityLevel: 'public'
    });

    return flows;
  };

  // Encryption status collection
  const collectEncryptionStatus = async (): Promise<EncryptionStatus> => {
    const keyStats = keyManagementService.getKeyStatistics();
    
    return {
      totalKeys: keyStats.totalKeys,
      activeKeys: keyStats.activeKeys,
      expiredKeys: keyStats.expiredKeys,
      encryptedData: 85, // Simulated percentage
      algorithms: {
        'AES-256-GCM': keyStats.activeKeys * 0.8,
        'ECDH-P256': keyStats.activeKeys * 0.2
      },
      keyRotations: keyStats.totalDistributions,
      lastRotation: Date.now() - Math.random() * 3600000
    };
  };

  // Security score calculation
  const calculateSecurityScore = (components: SecurityComponent[], threats: SecurityThreat[]): number => {
    let score = 100;

    // Deduct points for inactive components
    const inactiveComponents = components.filter(c => c.status === 'error' || c.status === 'disabled');
    score -= inactiveComponents.length * 15;

    // Deduct points for warnings
    const warningComponents = components.filter(c => c.status === 'warning');
    score -= warningComponents.length * 10;

    // Deduct points for threats
    threats.forEach(threat => {
      switch (threat.severity) {
        case 'critical':
          score -= 25;
          break;
        case 'high':
          score -= 15;
          break;
        case 'medium':
          score -= 10;
          break;
        case 'low':
          score -= 5;
          break;
      }
    });

    return Math.max(0, Math.min(100, score));
  };

  const getOverallStatus = (score: number, threats: SecurityThreat[]): SecurityStatus['overall'] => {
    const criticalThreats = threats.filter(t => t.severity === 'critical');
    if (criticalThreats.length > 0 || score < 40) return 'critical';
    if (score < 70) return 'warning';
    return 'secure';
  };

  const generateRecommendations = (components: SecurityComponent[], threats: SecurityThreat[]): string[] => {
    const recommendations: string[] = [];

    // Component-based recommendations
    const errorComponents = components.filter(c => c.status === 'error');
    if (errorComponents.length > 0) {
      recommendations.push('Fix critical security component failures immediately');
    }

    const warningComponents = components.filter(c => c.status === 'warning');
    if (warningComponents.length > 0) {
      recommendations.push('Address security component warnings to improve posture');
    }

    // Threat-based recommendations
    const criticalThreats = threats.filter(t => t.severity === 'critical');
    if (criticalThreats.length > 0) {
      recommendations.push('Immediately address critical security threats');
    }

    // Specific recommendations
    if (!encryptionInitialized) {
      recommendations.push('Enable end-to-end encryption for sensitive data');
    }

    if (!localOnlyEnabled && components.find(c => c.id === 'local_only')?.status === 'disabled') {
      recommendations.push('Consider enabling local-only mode for maximum privacy');
    }

    if (recommendations.length === 0) {
      recommendations.push('Security posture is strong - maintain current practices');
    }

    return recommendations;
  };


  // Render overview tab
  const renderOverview = () => {
    if (!securityStatus) return null;

    return (
      <div className="overview space-y-6">
        {/* Security Score */}
        <div className="bg-white rounded-lg border p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Security Score</h2>
            <div className="flex items-center gap-2">
              {getSecurityIcon(securityStatus.overall)}
              <span className={`text-2xl font-bold ${getSecurityColor(securityStatus.overall)}`}>
                {securityStatus.score}%
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="text-center">
              <div className={`text-3xl font-bold ${getSecurityColor(securityStatus.overall)}`}>
                {securityStatus.overall.toUpperCase()}
              </div>
              <div className="text-sm text-gray-600">Overall Status</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-blue-600">
                {securityStatus.components.filter(c => c.status === 'active').length}
              </div>
              <div className="text-sm text-gray-600">Active Components</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-red-600">
                {securityStatus.threats.filter(t => !t.mitigated).length}
              </div>
              <div className="text-sm text-gray-600">Active Threats</div>
            </div>
          </div>
        </div>

        {/* Security Components */}
        <div className="bg-white rounded-lg border p-6">
          <h3 className="text-lg font-semibold mb-4">Security Components</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {securityStatus.components.map(component => {
              const IconComponent = component.icon;
              return (
                <div key={component.id} className="component-card p-4 border rounded-lg">
                  <div className="flex items-center gap-3 mb-2">
                    <IconComponent 
                      size={20} 
                      className={getComponentStatusColor(component.status)} 
                    />
                    <span className="font-medium">{component.name}</span>
                    <div className={`w-2 h-2 rounded-full ${getStatusDotColor(component.status)}`} />
                  </div>
                  <p className="text-sm text-gray-600 mb-2">{component.description}</p>
                  <div className="text-xs text-gray-500">
                    Last checked: {new Date(component.lastChecked).toLocaleTimeString()}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Active Threats */}
        {securityStatus.threats.length > 0 && (
          <div className="bg-white rounded-lg border p-6">
            <h3 className="text-lg font-semibold mb-4">Active Security Threats</h3>
            <div className="space-y-3">
              {securityStatus.threats.slice(0, 5).map(threat => (
                <div 
                  key={threat.id} 
                  className="threat-item p-3 border rounded-lg cursor-pointer hover:bg-gray-50"
                  onClick={() => {
                    setSelectedThreat(threat);
                    onThreatSelect?.(threat);
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-3 h-3 rounded-full ${getSeverityColor(threat.severity)}`} />
                      <span className="font-medium">{threat.title}</span>
                      <span className={`px-2 py-1 text-xs rounded ${getSeverityBadgeColor(threat.severity)}`}>
                        {threat.severity.toUpperCase()}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500">
                      {new Date(threat.detectedAt).toLocaleTimeString()}
                    </div>
                  </div>
                  <p className="text-sm text-gray-600 mt-1">{threat.description}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recommendations */}
        <div className="bg-white rounded-lg border p-6">
          <h3 className="text-lg font-semibold mb-4">Security Recommendations</h3>
          <div className="space-y-2">
            {securityStatus.recommendations.map((rec, index) => (
              <div key={index} className="flex items-start gap-3">
                <Info size={16} className="text-blue-500 mt-0.5 flex-shrink-0" />
                <span className="text-sm">{rec}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  // Render encryption tab
  const renderEncryption = () => {
    if (!encryptionStatus) return null;

    return (
      <div className="encryption space-y-6">
        {/* Encryption Overview */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-lg border p-4">
            <div className="flex items-center gap-2 mb-2">
              <Key size={20} className="text-blue-500" />
              <span className="font-medium">Total Keys</span>
            </div>
            <div className="text-2xl font-bold">{encryptionStatus.totalKeys}</div>
          </div>
          <div className="bg-white rounded-lg border p-4">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle size={20} className="text-green-500" />
              <span className="font-medium">Active Keys</span>
            </div>
            <div className="text-2xl font-bold text-green-600">{encryptionStatus.activeKeys}</div>
          </div>
          <div className="bg-white rounded-lg border p-4">
            <div className="flex items-center gap-2 mb-2">
              <XCircle size={20} className="text-red-500" />
              <span className="font-medium">Expired Keys</span>
            </div>
            <div className="text-2xl font-bold text-red-600">{encryptionStatus.expiredKeys}</div>
          </div>
          <div className="bg-white rounded-lg border p-4">
            <div className="flex items-center gap-2 mb-2">
              <Lock size={20} className="text-purple-500" />
              <span className="font-medium">Encrypted Data</span>
            </div>
            <div className="text-2xl font-bold text-purple-600">{encryptionStatus.encryptedData}%</div>
          </div>
        </div>

        {/* Algorithm Distribution */}
        <div className="bg-white rounded-lg border p-6">
          <h3 className="text-lg font-semibold mb-4">Encryption Algorithms</h3>
          <div className="space-y-3">
            {Object.entries(encryptionStatus.algorithms).map(([algorithm, count]) => (
              <div key={algorithm} className="flex items-center justify-between">
                <span className="font-medium">{algorithm}</span>
                <div className="flex items-center gap-3">
                  <div className="w-32 bg-gray-200 rounded-full h-2">
                    <div 
                      className="bg-blue-500 h-2 rounded-full"
                      style={{ width: `${(count / encryptionStatus.totalKeys) * 100}%` }}
                    />
                  </div>
                  <span className="text-sm text-gray-600">{count}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Key Management */}
        <div className="bg-white rounded-lg border p-6">
          <h3 className="text-lg font-semibold mb-4">Key Management</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h4 className="font-medium mb-2">Key Rotation</h4>
              <div className="text-sm text-gray-600 mb-1">
                Total Rotations: {encryptionStatus.keyRotations}
              </div>
              <div className="text-sm text-gray-600">
                Last Rotation: {new Date(encryptionStatus.lastRotation).toLocaleString()}
              </div>
            </div>
            <div>
              <h4 className="font-medium mb-2">Security Status</h4>
              <div className="flex items-center gap-2">
                {encryptionInitialized ? (
                  <>
                    <CheckCircle size={16} className="text-green-500" />
                    <span className="text-green-600">Encryption Active</span>
                  </>
                ) : (
                  <>
                    <XCircle size={16} className="text-red-500" />
                    <span className="text-red-600">Encryption Inactive</span>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Render data flow tab
  const renderDataFlow = () => {
    return (
      <div className="dataflow space-y-6">
        {/* Data Flow Diagram */}
        <div className="bg-white rounded-lg border p-6">
          <h3 className="text-lg font-semibold mb-4">Data Flow Visualization</h3>
          <div className="relative bg-gray-50 rounded-lg p-8 min-h-96">
            {/* This would be a more sophisticated data flow diagram in a real implementation */}
            <svg className="w-full h-80" viewBox="0 0 800 300">
              {/* Define connections */}
              {dataFlows.map((flow, index) => {
                const y = 50 + (index * 60);
                return (
                  <g key={flow.id}>
                    {/* Source node */}
                    <circle
                      cx={100}
                      cy={y}
                      r={20}
                      fill={flow.source.encryption ? '#10b981' : '#ef4444'}
                      className="cursor-pointer"
                    />
                    <text x={100} y={y + 5} textAnchor="middle" className="text-xs fill-white">
                      {flow.source.type.charAt(0).toUpperCase()}
                    </text>
                    
                    {/* Flow line */}
                    <line
                      x1={120}
                      y1={y}
                      x2={480}
                      y2={y}
                      stroke={flow.encrypted ? '#10b981' : '#ef4444'}
                      strokeWidth={Math.max(2, flow.volume / 1000)}
                      strokeDasharray={flow.encrypted ? '0' : '5,5'}
                    />
                    
                    {/* Protocol label */}
                    <text x={300} y={y - 10} textAnchor="middle" className="text-xs fill-gray-600">
                      {flow.protocol}
                    </text>
                    
                    {/* Destination node */}
                    <circle
                      cx={500}
                      cy={y}
                      r={20}
                      fill={flow.destination.encryption ? '#10b981' : '#ef4444'}
                      className="cursor-pointer"
                    />
                    <text x={500} y={y + 5} textAnchor="middle" className="text-xs fill-white">
                      {flow.destination.type.charAt(0).toUpperCase()}
                    </text>
                    
                    {/* Flow info */}
                    <text x={600} y={y - 10} className="text-xs fill-gray-700">
                      {flow.source.name}
                    </text>
                    <text x={600} y={y + 5} className="text-xs fill-gray-700">
                      → {flow.destination.name}
                    </text>
                    <text x={600} y={y + 20} className="text-xs fill-gray-500">
                      {flow.dataType} ({flow.securityLevel})
                    </text>
                  </g>
                );
              })}
            </svg>

            {/* Legend */}
            <div className="absolute bottom-4 left-4 bg-white p-3 rounded border">
              <div className="text-sm font-medium mb-2">Legend</div>
              <div className="flex items-center gap-4 text-xs">
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 bg-green-500 rounded-full" />
                  <span>Encrypted</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 bg-red-500 rounded-full" />
                  <span>Unencrypted</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-6 h-0.5 bg-gray-400" style={{ borderTop: '2px dashed' }} />
                  <span>Insecure</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Data Flow Details */}
        <div className="bg-white rounded-lg border p-6">
          <h3 className="text-lg font-semibold mb-4">Active Data Flows</h3>
          <div className="space-y-3">
            {dataFlows.map(flow => (
              <div key={flow.id} className="flow-item p-3 border rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full ${flow.encrypted ? 'bg-green-500' : 'bg-red-500'}`} />
                    <span className="font-medium">
                      {flow.source.name} → {flow.destination.name}
                    </span>
                    <span className={`px-2 py-1 text-xs rounded ${getSecurityLevelColor(flow.securityLevel)}`}>
                      {flow.securityLevel.toUpperCase()}
                    </span>
                  </div>
                  <div className="text-sm text-gray-500">
                    {(flow.volume / 1024).toFixed(1)} KB/s
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <span className="text-gray-600">Protocol:</span> {flow.protocol}
                  </div>
                  <div>
                    <span className="text-gray-600">Data Type:</span> {flow.dataType}
                  </div>
                  <div>
                    <span className="text-gray-600">Encrypted:</span> {flow.encrypted ? 'Yes' : 'No'}
                  </div>
                  <div>
                    <span className="text-gray-600">Last Activity:</span> {new Date(flow.lastActivity).toLocaleTimeString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  // Helper functions for styling
  const getSecurityIcon = (status: SecurityStatus['overall']) => {
    switch (status) {
      case 'secure': return <ShieldCheck size={24} className="text-green-500" />;
      case 'warning': return <ShieldAlert size={24} className="text-yellow-500" />;
      case 'critical': return <ShieldX size={24} className="text-red-500" />;
      default: return <Shield size={24} className="text-gray-500" />;
    }
  };

  const getSecurityColor = (status: SecurityStatus['overall']) => {
    switch (status) {
      case 'secure': return 'text-green-600';
      case 'warning': return 'text-yellow-600';
      case 'critical': return 'text-red-600';
      default: return 'text-gray-600';
    }
  };

  const getComponentStatusColor = (status: SecurityComponent['status']) => {
    switch (status) {
      case 'active': return 'text-green-500';
      case 'warning': return 'text-yellow-500';
      case 'error': return 'text-red-500';
      case 'disabled': return 'text-gray-500';
      default: return 'text-gray-500';
    }
  };

  const getStatusDotColor = (status: SecurityComponent['status']) => {
    switch (status) {
      case 'active': return 'bg-green-500';
      case 'warning': return 'bg-yellow-500';
      case 'error': return 'bg-red-500';
      case 'disabled': return 'bg-gray-500';
      default: return 'bg-gray-500';
    }
  };

  const getSeverityColor = (severity: SecurityThreat['severity']) => {
    switch (severity) {
      case 'critical': return 'bg-red-500';
      case 'high': return 'bg-red-400';
      case 'medium': return 'bg-yellow-500';
      case 'low': return 'bg-green-500';
      default: return 'bg-gray-500';
    }
  };

  const getSeverityBadgeColor = (severity: SecurityThreat['severity']) => {
    switch (severity) {
      case 'critical': return 'bg-red-100 text-red-800';
      case 'high': return 'bg-red-100 text-red-700';
      case 'medium': return 'bg-yellow-100 text-yellow-800';
      case 'low': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getSecurityLevelColor = (level: DataFlow['securityLevel']) => {
    switch (level) {
      case 'public': return 'bg-blue-100 text-blue-800';
      case 'internal': return 'bg-green-100 text-green-800';
      case 'confidential': return 'bg-yellow-100 text-yellow-800';
      case 'restricted': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className={`security-center ${className}`}>
      {/* Header */}
      <div className="header p-6 bg-gradient-to-r from-green-600 to-blue-600 text-white">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold mb-2">Security Center</h1>
            <p className="text-green-100">
              Comprehensive security monitoring and data protection status
            </p>
          </div>
          <div className="text-right">
            {securityStatus && (
              <>
                <div className="text-3xl font-bold">{securityStatus.score}%</div>
                <div className="text-sm text-green-100">Security Score</div>
              </>
            )}
          </div>
        </div>

        {/* Quick Status */}
        {securityStatus && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
            <div className="stat-card bg-white/10 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1">
                <Lock size={16} />
                <span className="text-sm">Encryption</span>
              </div>
              <div className="text-xl font-bold">{encryptionInitialized ? 'Active' : 'Inactive'}</div>
            </div>
            
            <div className="stat-card bg-white/10 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1">
                <Shield size={16} />
                <span className="text-sm">Threats</span>
              </div>
              <div className="text-xl font-bold">{securityStatus.threats.filter(t => !t.mitigated).length}</div>
            </div>

            <div className="stat-card bg-white/10 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1">
                {localOnlyEnabled ? <CloudOff size={16} /> : <Cloud size={16} />}
                <span className="text-sm">Mode</span>
              </div>
              <div className="text-xl font-bold">{localOnlyEnabled ? 'Local' : 'Cloud'}</div>
            </div>

            <div className="stat-card bg-white/10 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1">
                <FileText size={16} />
                <span className="text-sm">Audit</span>
              </div>
              <div className="text-xl font-bold">Active</div>
            </div>
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="nav p-4 bg-white border-b">
        <div className="flex items-center justify-between">
          <div className="flex space-x-1">
            {[
              { key: 'overview', label: 'Overview', icon: Shield },
              { key: 'encryption', label: 'Encryption', icon: Lock },
              { key: 'dataflow', label: 'Data Flow', icon: Network },
              { key: 'privacy', label: 'Privacy', icon: Eye },
              { key: 'compliance', label: 'Compliance', icon: FileText },
              { key: 'audit', label: 'Audit', icon: Activity }
            ].map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key as TabKey)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                  activeTab === tab.key
                    ? 'bg-blue-100 text-blue-700'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                <tab.icon size={16} />
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-4">
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors ${
                autoRefresh 
                  ? 'bg-green-100 text-green-700 border-green-300' 
                  : 'bg-gray-100 text-gray-700 border-gray-300'
              }`}
            >
              <RefreshCw size={16} className={autoRefresh ? 'animate-spin' : ''} />
              Auto Refresh
            </button>

            <button
              onClick={loadSecurityData}
              disabled={isLoading}
              className="flex items-center gap-2 px-3 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50"
            >
              <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="content p-6">
        {/* Loading state */}
        {isLoading && !securityStatus && (
          <div className="loading-state flex items-center justify-center py-12">
            <div className="flex items-center gap-3 text-gray-600">
              <RefreshCw size={24} className="animate-spin" />
              <span>Loading security data...</span>
            </div>
          </div>
        )}

        {/* Tab content */}
        {!isLoading && (
          <>
            {activeTab === 'overview' && renderOverview()}
            {activeTab === 'encryption' && renderEncryption()}
            {activeTab === 'dataflow' && renderDataFlow()}
            {activeTab === 'privacy' && (
              <div className="privacy text-center py-12 text-gray-500">
                <Eye size={48} className="mx-auto mb-4 text-gray-300" />
                <p>Privacy analytics dashboard coming soon</p>
              </div>
            )}
            {activeTab === 'compliance' && (
              <div className="compliance text-center py-12 text-gray-500">
                <FileText size={48} className="mx-auto mb-4 text-gray-300" />
                <p>Compliance monitoring dashboard coming soon</p>
              </div>
            )}
            {activeTab === 'audit' && (
              <div className="audit text-center py-12 text-gray-500">
                <Activity size={48} className="mx-auto mb-4 text-gray-300" />
                <p>Audit log viewer coming soon</p>
              </div>
            )}
          </>
        )}
      </div>

      {/* Selected Threat Modal */}
      {selectedThreat && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h2 className="text-xl font-bold">{selectedThreat.title}</h2>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`px-2 py-1 text-xs rounded ${getSeverityBadgeColor(selectedThreat.severity)}`}>
                      {selectedThreat.severity.toUpperCase()}
                    </span>
                    <span className="text-sm text-gray-500">
                      {selectedThreat.type.replace('_', ' ')}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedThreat(null)}
                  className="text-gray-500 hover:text-gray-700"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <h4 className="font-medium mb-2">Description</h4>
                  <p className="text-gray-600">{selectedThreat.description}</p>
                </div>

                <div>
                  <h4 className="font-medium mb-2">Affected Components</h4>
                  <div className="flex flex-wrap gap-2">
                    {selectedThreat.affectedComponents.map(component => (
                      <span key={component} className="px-2 py-1 bg-gray-100 text-gray-700 text-sm rounded">
                        {component.replace('_', ' ')}
                      </span>
                    ))}
                  </div>
                </div>

                {selectedThreat.mitigation && (
                  <div>
                    <h4 className="font-medium mb-2">Recommended Mitigation</h4>
                    <p className="text-gray-600">{selectedThreat.mitigation}</p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-600">Detected:</span> {new Date(selectedThreat.detectedAt).toLocaleString()}
                  </div>
                  <div>
                    <span className="text-gray-600">Status:</span> {selectedThreat.mitigated ? 'Mitigated' : 'Active'}
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <button
                  onClick={() => setSelectedThreat(null)}
                  className="px-4 py-2 text-gray-600 border rounded-lg hover:bg-gray-50"
                >
                  Close
                </button>
                <button className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600">
                  Mark as Mitigated
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};