// MeetingMind Deployment Wizard
// Interactive wizard for easy deployment setup

import React, { useState, useEffect } from 'react';
import { 
  Shield, 
  Server, 
  // Globe, 
  Check, 
  AlertCircle, 
  ChevronRight, 
  ChevronLeft,
  Download,
  Copy,
  ExternalLink,
  Play,
  Settings,
  Lock,
  Monitor,
  Cloud,
  Database,
  Zap
} from 'lucide-react';

interface DeploymentConfig {
  type: 'docker' | 'kubernetes' | 'standalone';
  environment: 'development' | 'staging' | 'production';
  domain: string;
  email: string;
  ssl: boolean;
  monitoring: boolean;
  backup: boolean;
  authentication: 'local' | 'oauth' | 'ldap';
  database: 'sqlite' | 'postgresql' | 'mysql';
  storage: 'local' | 's3' | 'azure' | 'gcs';
  scale: 'small' | 'medium' | 'large' | 'enterprise';
}

interface Step {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  component: React.ComponentType<StepProps>;
}

interface StepProps {
  config: DeploymentConfig;
  onConfigChange: (updates: Partial<DeploymentConfig>) => void;
  onNext: () => void;
  onPrevious: () => void;
  isValid: boolean;
}

const DeploymentWizard: React.FC = () => {
  const [currentStep, setCurrentStep] = useState(0);
  const [config, setConfig] = useState<DeploymentConfig>({
    type: 'docker',
    environment: 'production',
    domain: '',
    email: '',
    ssl: true,
    monitoring: false,
    backup: false,
    authentication: 'local',
    database: 'postgresql',
    storage: 'local',
    scale: 'small'
  });
  const [generatedCommands, setGeneratedCommands] = useState<string[]>([]);
  const [isComplete, setIsComplete] = useState(false);

  const steps: Step[] = [
    {
      id: 'deployment-type',
      title: 'Deployment Type',
      description: 'Choose how you want to deploy MeetingMind',
      icon: <Server className="w-6 h-6" />,
      component: DeploymentTypeStep
    },
    {
      id: 'environment',
      title: 'Environment Setup',
      description: 'Configure your deployment environment',
      icon: <Settings className="w-6 h-6" />,
      component: EnvironmentStep
    },
    {
      id: 'domain-ssl',
      title: 'Domain & SSL',
      description: 'Set up your domain and security',
      icon: <Lock className="w-6 h-6" />,
      component: DomainSSLStep
    },
    {
      id: 'features',
      title: 'Features',
      description: 'Enable additional features',
      icon: <Zap className="w-6 h-6" />,
      component: FeaturesStep
    },
    {
      id: 'scaling',
      title: 'Scaling',
      description: 'Configure performance and capacity',
      icon: <Monitor className="w-6 h-6" />,
      component: ScalingStep
    },
    {
      id: 'review',
      title: 'Review & Deploy',
      description: 'Review configuration and get deployment commands',
      icon: <Play className="w-6 h-6" />,
      component: ReviewStep
    }
  ];

  const handleConfigChange = (updates: Partial<DeploymentConfig>) => {
    setConfig(prev => ({ ...prev, ...updates }));
  };

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(prev => prev + 1);
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
    }
  };

  const isStepValid = (stepIndex: number): boolean => {
    switch (stepIndex) {
      case 0: return true; // Deployment type always valid
      case 1: return true; // Environment always valid
      case 2: return config.domain.length > 0 && config.email.length > 0;
      case 3: return true; // Features always valid
      case 4: return true; // Scaling always valid
      case 5: return true; // Review always valid
      default: return false;
    }
  };

  useEffect(() => {
    generateDeploymentCommands();
  }, [config]);

  const generateDeploymentCommands = () => {
    const commands: string[] = [];
    
    // Base deployment command
    let deployCmd = `./deployment/scripts/deploy.sh`;
    deployCmd += ` --type ${config.type}`;
    deployCmd += ` --env ${config.environment}`;
    
    if (config.domain) {
      deployCmd += ` --domain ${config.domain}`;
    }
    
    if (config.email) {
      deployCmd += ` --email ${config.email}`;
    }
    
    if (config.ssl) {
      deployCmd += ` --ssl`;
    }
    
    if (config.monitoring) {
      deployCmd += ` --monitoring`;
    }
    
    if (config.backup) {
      deployCmd += ` --backup`;
    }
    
    commands.push(deployCmd);
    
    // Additional setup commands based on configuration
    if (config.type === 'kubernetes' && config.monitoring) {
      commands.push('kubectl apply -f deployment/kubernetes/monitoring/');
    }
    
    if (config.scale === 'enterprise') {
      commands.push('# Configure load balancer and high availability');
      commands.push('./deployment/scripts/setup-ha.sh');
    }
    
    setGeneratedCommands(commands);
  };

  const CurrentStepComponent = steps[currentStep].component;

  return (
    <div className="max-w-6xl mx-auto p-6 bg-white rounded-xl shadow-lg">
      {/* Header */}
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          MeetingMind Deployment Wizard
        </h1>
        <p className="text-gray-600">
          Set up your secure meeting platform in minutes
        </p>
      </div>

      {/* Progress Bar */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm text-gray-500">
            Step {currentStep + 1} of {steps.length}
          </span>
          <span className="text-sm text-gray-500">
            {Math.round(((currentStep + 1) / steps.length) * 100)}% Complete
          </span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div 
            className="bg-blue-600 h-2 rounded-full transition-all duration-300"
            style={{ width: `${((currentStep + 1) / steps.length) * 100}%` }}
          />
        </div>
      </div>

      {/* Steps Navigation */}
      <div className="flex justify-between mb-8 overflow-x-auto">
        {steps.map((step, index) => (
          <div 
            key={step.id}
            className={`flex flex-col items-center min-w-0 flex-1 px-2 cursor-pointer transition-all duration-200 ${
              index === currentStep 
                ? 'text-blue-600' 
                : index < currentStep 
                  ? 'text-green-600' 
                  : 'text-gray-400'
            }`}
            onClick={() => index <= currentStep && setCurrentStep(index)}
          >
            <div className={`
              w-10 h-10 rounded-full flex items-center justify-center mb-2 transition-all duration-200
              ${index === currentStep 
                ? 'bg-blue-100 text-blue-600 ring-2 ring-blue-600' 
                : index < currentStep 
                  ? 'bg-green-100 text-green-600' 
                  : 'bg-gray-100 text-gray-400'
              }
            `}>
              {index < currentStep ? (
                <Check className="w-5 h-5" />
              ) : (
                step.icon
              )}
            </div>
            <span className="text-xs font-medium text-center leading-tight">
              {step.title}
            </span>
          </div>
        ))}
      </div>

      {/* Current Step Content */}
      <div className="bg-gray-50 rounded-lg p-6 mb-6 min-h-[400px]">
        <div className="mb-4">
          <h2 className="text-xl font-semibold text-gray-900">
            {steps[currentStep].title}
          </h2>
          <p className="text-gray-600">
            {steps[currentStep].description}
          </p>
        </div>
        
        <CurrentStepComponent
          config={config}
          onConfigChange={handleConfigChange}
          onNext={handleNext}
          onPrevious={handlePrevious}
          isValid={isStepValid(currentStep)}
        />
      </div>

      {/* Navigation Buttons */}
      <div className="flex justify-between">
        <button
          onClick={handlePrevious}
          disabled={currentStep === 0}
          className="flex items-center px-4 py-2 text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
        >
          <ChevronLeft className="w-4 h-4 mr-2" />
          Previous
        </button>

        <div className="flex space-x-3">
          {currentStep === steps.length - 1 ? (
            <button
              onClick={() => setIsComplete(true)}
              className="flex items-center px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors duration-200"
            >
              <Play className="w-4 h-4 mr-2" />
              Deploy Now
            </button>
          ) : (
            <button
              onClick={handleNext}
              disabled={!isStepValid(currentStep)}
              className="flex items-center px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
            >
              Next
              <ChevronRight className="w-4 h-4 ml-2" />
            </button>
          )}
        </div>
      </div>

      {/* Completion Modal */}
      {isComplete && (
        <DeploymentCompleteModal 
          config={config}
          commands={generatedCommands}
          onClose={() => setIsComplete(false)}
        />
      )}
    </div>
  );
};

// Individual Step Components

const DeploymentTypeStep: React.FC<StepProps> = ({ config, onConfigChange }) => {
  const deploymentTypes = [
    {
      type: 'docker' as const,
      title: 'Docker Compose',
      description: 'Quick setup with containers - perfect for most deployments',
      icon: <Server className="w-8 h-8" />,
      pros: ['Easy to manage', 'Quick setup', 'Good for small to medium scale'],
      cons: ['Single server', 'Manual scaling'],
      recommended: true
    },
    {
      type: 'kubernetes' as const,
      title: 'Kubernetes',
      description: 'Enterprise-grade container orchestration',
      icon: <Cloud className="w-8 h-8" />,
      pros: ['Auto-scaling', 'High availability', 'Enterprise ready'],
      cons: ['Complex setup', 'Requires K8s knowledge'],
      recommended: false
    },
    {
      type: 'standalone' as const,
      title: 'Standalone',
      description: 'Direct installation on the server',
      icon: <Monitor className="w-8 h-8" />,
      pros: ['Full control', 'No containers', 'Easy debugging'],
      cons: ['Manual dependency management', 'More maintenance'],
      recommended: false
    }
  ];

  return (
    <div className="grid md:grid-cols-3 gap-4">
      {deploymentTypes.map((type) => (
        <div
          key={type.type}
          className={`relative p-6 border-2 rounded-lg cursor-pointer transition-all duration-200 ${
            config.type === type.type
              ? 'border-blue-500 bg-blue-50'
              : 'border-gray-200 hover:border-gray-300'
          }`}
          onClick={() => onConfigChange({ type: type.type })}
        >
          {type.recommended && (
            <div className="absolute -top-2 -right-2 bg-green-500 text-white text-xs px-2 py-1 rounded-full">
              Recommended
            </div>
          )}
          
          <div className="flex items-center mb-4">
            <div className={`p-2 rounded-lg ${
              config.type === type.type ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-600'
            }`}>
              {type.icon}
            </div>
            <div className="ml-3">
              <h3 className="font-semibold text-gray-900">{type.title}</h3>
            </div>
          </div>
          
          <p className="text-sm text-gray-600 mb-4">{type.description}</p>
          
          <div className="space-y-2">
            <div>
              <h4 className="text-xs font-medium text-green-600 mb-1">Pros:</h4>
              <ul className="text-xs text-gray-600 space-y-1">
                {type.pros.map((pro, index) => (
                  <li key={index} className="flex items-center">
                    <Check className="w-3 h-3 text-green-500 mr-1" />
                    {pro}
                  </li>
                ))}
              </ul>
            </div>
            
            <div>
              <h4 className="text-xs font-medium text-orange-600 mb-1">Considerations:</h4>
              <ul className="text-xs text-gray-600 space-y-1">
                {type.cons.map((con, index) => (
                  <li key={index} className="flex items-center">
                    <AlertCircle className="w-3 h-3 text-orange-500 mr-1" />
                    {con}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

const EnvironmentStep: React.FC<StepProps> = ({ config, onConfigChange }) => {
  return (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Environment
        </label>
        <div className="grid grid-cols-3 gap-3">
          {(['development', 'staging', 'production'] as const).map((env) => (
            <button
              key={env}
              onClick={() => onConfigChange({ environment: env })}
              className={`p-3 text-sm font-medium rounded-lg border transition-colors duration-200 ${
                config.environment === env
                  ? 'bg-blue-50 border-blue-500 text-blue-700'
                  : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
              }`}
            >
              {env.charAt(0).toUpperCase() + env.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Database
        </label>
        <div className="grid grid-cols-3 gap-3">
          {([
            { value: 'sqlite', label: 'SQLite', desc: 'Simple file-based' },
            { value: 'postgresql', label: 'PostgreSQL', desc: 'Production ready' },
            { value: 'mysql', label: 'MySQL', desc: 'Widely supported' }
          ] as const).map((db) => (
            <button
              key={db.value}
              onClick={() => onConfigChange({ database: db.value })}
              className={`p-3 text-left rounded-lg border transition-colors duration-200 ${
                config.database === db.value
                  ? 'bg-blue-50 border-blue-500'
                  : 'bg-white border-gray-300 hover:bg-gray-50'
              }`}
            >
              <div className="font-medium text-gray-900">{db.label}</div>
              <div className="text-xs text-gray-600">{db.desc}</div>
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Authentication
        </label>
        <div className="grid grid-cols-3 gap-3">
          {([
            { value: 'local', label: 'Local Auth', desc: 'Built-in authentication' },
            { value: 'oauth', label: 'OAuth', desc: 'Google, GitHub, etc.' },
            { value: 'ldap', label: 'LDAP/AD', desc: 'Enterprise directory' }
          ] as const).map((auth) => (
            <button
              key={auth.value}
              onClick={() => onConfigChange({ authentication: auth.value })}
              className={`p-3 text-left rounded-lg border transition-colors duration-200 ${
                config.authentication === auth.value
                  ? 'bg-blue-50 border-blue-500'
                  : 'bg-white border-gray-300 hover:bg-gray-50'
              }`}
            >
              <div className="font-medium text-gray-900">{auth.label}</div>
              <div className="text-xs text-gray-600">{auth.desc}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

const DomainSSLStep: React.FC<StepProps> = ({ config, onConfigChange }) => {
  return (
    <div className="space-y-6">
      <div className="grid md:grid-cols-2 gap-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Domain Name *
          </label>
          <input
            type="text"
            value={config.domain}
            onChange={(e) => onConfigChange({ domain: e.target.value })}
            placeholder="meetingmind.example.com"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
          <p className="text-xs text-gray-600 mt-1">
            The domain where MeetingMind will be accessible
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Admin Email *
          </label>
          <input
            type="email"
            value={config.email}
            onChange={(e) => onConfigChange({ email: e.target.value })}
            placeholder="admin@example.com"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
          <p className="text-xs text-gray-600 mt-1">
            Used for SSL certificate registration and admin notifications
          </p>
        </div>
      </div>

      <div className="border rounded-lg p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center">
            <Lock className="w-5 h-5 text-green-600 mr-2" />
            <span className="font-medium text-gray-900">SSL/HTTPS</span>
          </div>
          <button
            onClick={() => onConfigChange({ ssl: !config.ssl })}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 ${
              config.ssl ? 'bg-green-600' : 'bg-gray-200'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-200 ${
                config.ssl ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
        <p className="text-sm text-gray-600">
          {config.ssl 
            ? 'SSL certificate will be automatically generated using Let\'s Encrypt'
            : 'WARNING: Disabling SSL is not recommended for production environments'
          }
        </p>
      </div>

      {!config.ssl && (
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
          <div className="flex items-center">
            <AlertCircle className="w-5 h-5 text-orange-500 mr-2" />
            <span className="font-medium text-orange-800">Security Warning</span>
          </div>
          <p className="text-sm text-orange-700 mt-1">
            Without SSL, all communication will be unencrypted. This is only suitable for development environments.
          </p>
        </div>
      )}
    </div>
  );
};

const FeaturesStep: React.FC<StepProps> = ({ config, onConfigChange }) => {
  const features = [
    {
      key: 'monitoring',
      title: 'Monitoring & Analytics',
      description: 'Prometheus and Grafana for system monitoring',
      icon: <Monitor className="w-5 h-5" />,
      enabled: config.monitoring
    },
    {
      key: 'backup',
      title: 'Automated Backups',
      description: 'Daily automated backups of your data',
      icon: <Database className="w-5 h-5" />,
      enabled: config.backup
    }
  ];

  return (
    <div className="space-y-4">
      <div className="mb-6">
        <h3 className="text-lg font-medium text-gray-900 mb-2">Optional Features</h3>
        <p className="text-gray-600">Enable additional features for your deployment</p>
      </div>

      {features.map((feature) => (
        <div key={feature.key} className="border rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <div className="p-2 bg-blue-100 text-blue-600 rounded-lg mr-3">
                {feature.icon}
              </div>
              <div>
                <h4 className="font-medium text-gray-900">{feature.title}</h4>
                <p className="text-sm text-gray-600">{feature.description}</p>
              </div>
            </div>
            <button
              onClick={() => onConfigChange({ [feature.key]: !feature.enabled })}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 ${
                feature.enabled ? 'bg-blue-600' : 'bg-gray-200'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-200 ${
                  feature.enabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </div>
      ))}

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-center">
          <Shield className="w-5 h-5 text-blue-500 mr-2" />
          <span className="font-medium text-blue-800">Security Features</span>
        </div>
        <p className="text-sm text-blue-700 mt-1">
          End-to-end encryption, audit logging, and privacy controls are always enabled by default.
        </p>
      </div>
    </div>
  );
};

const ScalingStep: React.FC<StepProps> = ({ config, onConfigChange }) => {
  const scaleOptions = [
    {
      value: 'small',
      title: 'Small',
      description: 'Up to 50 concurrent users',
      specs: '2 CPU, 4GB RAM, 50GB storage',
      cost: 'Lowest cost'
    },
    {
      value: 'medium',
      title: 'Medium',
      description: 'Up to 200 concurrent users',
      specs: '4 CPU, 8GB RAM, 200GB storage',
      cost: 'Balanced performance'
    },
    {
      value: 'large',
      title: 'Large',
      description: 'Up to 1000 concurrent users',
      specs: '8 CPU, 16GB RAM, 500GB storage',
      cost: 'High performance'
    },
    {
      value: 'enterprise',
      title: 'Enterprise',
      description: 'Unlimited users with high availability',
      specs: 'Multi-node cluster, auto-scaling',
      cost: 'Maximum reliability'
    }
  ];

  return (
    <div className="space-y-6">
      <div className="mb-6">
        <h3 className="text-lg font-medium text-gray-900 mb-2">Performance & Capacity</h3>
        <p className="text-gray-600">Choose the right size for your expected usage</p>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {scaleOptions.map((option) => (
          <div
            key={option.value}
            className={`p-4 border-2 rounded-lg cursor-pointer transition-all duration-200 ${
              config.scale === option.value
                ? 'border-blue-500 bg-blue-50'
                : 'border-gray-200 hover:border-gray-300'
            }`}
            onClick={() => onConfigChange({ scale: option.value as any })}
          >
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-semibold text-gray-900">{option.title}</h4>
              {config.scale === option.value && (
                <Check className="w-5 h-5 text-blue-600" />
              )}
            </div>
            
            <p className="text-sm text-gray-600 mb-2">{option.description}</p>
            <p className="text-xs text-gray-500 mb-2">{option.specs}</p>
            <p className="text-xs font-medium text-green-600">{option.cost}</p>
          </div>
        ))}
      </div>

      {config.scale === 'enterprise' && (
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
          <div className="flex items-center">
            <Crown className="w-5 h-5 text-purple-500 mr-2" />
            <span className="font-medium text-purple-800">Enterprise Features</span>
          </div>
          <div className="mt-2 text-sm text-purple-700">
            <ul className="list-disc list-inside space-y-1">
              <li>Load balancing across multiple nodes</li>
              <li>Automatic failover and recovery</li>
              <li>Horizontal auto-scaling</li>
              <li>Advanced monitoring and alerting</li>
              <li>Priority support included</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
};

const ReviewStep: React.FC<StepProps> = ({ config }) => {
  const [copied, setCopied] = useState(false);
  
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const deploymentCommand = `./deployment/scripts/deploy.sh \\
  --type ${config.type} \\
  --env ${config.environment} \\
  --domain ${config.domain} \\
  --email ${config.email}${config.ssl ? ' \\n  --ssl' : ''}${config.monitoring ? ' \\n  --monitoring' : ''}${config.backup ? ' \\n  --backup' : ''}`;

  return (
    <div className="space-y-6">
      <div className="mb-6">
        <h3 className="text-lg font-medium text-gray-900 mb-2">Configuration Summary</h3>
        <p className="text-gray-600">Review your settings before deployment</p>
      </div>

      {/* Configuration Summary */}
      <div className="grid md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div>
            <h4 className="font-medium text-gray-900 mb-2">Deployment</h4>
            <div className="bg-gray-50 rounded p-3 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Type:</span>
                <span className="font-medium">{config.type.charAt(0).toUpperCase() + config.type.slice(1)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Environment:</span>
                <span className="font-medium">{config.environment.charAt(0).toUpperCase() + config.environment.slice(1)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Scale:</span>
                <span className="font-medium">{config.scale.charAt(0).toUpperCase() + config.scale.slice(1)}</span>
              </div>
            </div>
          </div>

          <div>
            <h4 className="font-medium text-gray-900 mb-2">Network</h4>
            <div className="bg-gray-50 rounded p-3 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Domain:</span>
                <span className="font-medium">{config.domain}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">SSL:</span>
                <span className={`font-medium ${config.ssl ? 'text-green-600' : 'text-red-600'}`}>
                  {config.ssl ? 'Enabled' : 'Disabled'}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <h4 className="font-medium text-gray-900 mb-2">Services</h4>
            <div className="bg-gray-50 rounded p-3 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Database:</span>
                <span className="font-medium">{config.database.toUpperCase()}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Authentication:</span>
                <span className="font-medium">{config.authentication.toUpperCase()}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Storage:</span>
                <span className="font-medium">{config.storage.charAt(0).toUpperCase() + config.storage.slice(1)}</span>
              </div>
            </div>
          </div>

          <div>
            <h4 className="font-medium text-gray-900 mb-2">Features</h4>
            <div className="bg-gray-50 rounded p-3 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Monitoring:</span>
                <span className={`font-medium ${config.monitoring ? 'text-green-600' : 'text-gray-400'}`}>
                  {config.monitoring ? 'Enabled' : 'Disabled'}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Backups:</span>
                <span className={`font-medium ${config.backup ? 'text-green-600' : 'text-gray-400'}`}>
                  {config.backup ? 'Enabled' : 'Disabled'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Deployment Command */}
      <div>
        <h4 className="font-medium text-gray-900 mb-2">Deployment Command</h4>
        <div className="bg-gray-900 rounded-lg p-4 text-green-400 font-mono text-sm relative">
          <pre className="whitespace-pre-wrap">{deploymentCommand}</pre>
          <button
            onClick={() => copyToClipboard(deploymentCommand)}
            className="absolute top-2 right-2 p-2 text-gray-400 hover:text-white transition-colors duration-200"
            title="Copy to clipboard"
          >
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Next Steps */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h4 className="font-medium text-blue-800 mb-2">Next Steps</h4>
        <ol className="text-sm text-blue-700 space-y-1 list-decimal list-inside">
          <li>Download the deployment scripts</li>
          <li>Run the command above on your target server</li>
          <li>Configure DNS to point {config.domain} to your server</li>
          <li>Access your MeetingMind installation</li>
        </ol>
      </div>
    </div>
  );
};

// Completion Modal
const DeploymentCompleteModal: React.FC<{
  config: DeploymentConfig;
  commands: string[];
  onClose: () => void;
}> = ({ config, commands, onClose }) => {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center">
              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mr-4">
                <Check className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <h3 className="text-xl font-semibold text-gray-900">Ready to Deploy!</h3>
                <p className="text-gray-600">Your MeetingMind configuration is complete</p>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <h4 className="font-medium text-gray-900 mb-2">Download Deployment Scripts</h4>
              <button className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors duration-200">
                <Download className="w-4 h-4 mr-2" />
                Download Scripts
              </button>
            </div>

            <div>
              <h4 className="font-medium text-gray-900 mb-2">Run These Commands</h4>
              <div className="bg-gray-900 rounded-lg p-4 text-green-400 font-mono text-sm">
                {commands.map((cmd, index) => (
                  <div key={index} className="mb-2 last:mb-0">
                    {cmd.startsWith('#') ? (
                      <div className="text-gray-500">{cmd}</div>
                    ) : (
                      <div>{cmd}</div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h4 className="font-medium text-gray-900 mb-2">Access Your Installation</h4>
              <div className="flex items-center space-x-2">
                <span className="text-gray-600">URL:</span>
                <code className="bg-gray-100 px-2 py-1 rounded text-sm">
                  http{config.ssl ? 's' : ''}://{config.domain}
                </code>
                <button
                  onClick={() => window.open(`http${config.ssl ? 's' : ''}://${config.domain}`, '_blank')}
                  className="p-1 text-gray-400 hover:text-blue-600"
                >
                  <ExternalLink className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          <div className="flex justify-end mt-6 pt-4 border-t">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors duration-200"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// Helper component for Crown icon (missing from lucide-react)
const Crown: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M6 6h12l-2 10H8L6 6Z"/>
    <path d="M6 6L2 2"/>
    <path d="M18 6l4-4"/>
    <path d="M12 6V2"/>
  </svg>
);

export default DeploymentWizard;