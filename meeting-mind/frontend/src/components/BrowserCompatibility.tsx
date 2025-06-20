// Browser Compatibility Checker and Fallback Component
// Ensures media features work across different browsers with appropriate fallbacks

import React, { useState, useEffect } from 'react';
import { BrowserSupport } from '../utils/mediaUtils';

interface BrowserCompatibilityProps {
  children: React.ReactNode;
  requireMediaRecorder?: boolean;
  requireWebAudio?: boolean;
  requireWebRTC?: boolean;
  onUnsupported?: (missingFeatures: string[]) => void;
}

interface CompatibilityStatus {
  isSupported: boolean;
  missingFeatures: string[];
  warnings: string[];
  browserInfo: {
    name: string;
    version: string;
    isMobile: boolean;
  };
}

export const BrowserCompatibility: React.FC<BrowserCompatibilityProps> = ({
  children,
  requireMediaRecorder = false,
  requireWebAudio = false,
  requireWebRTC = false,
  onUnsupported,
}) => {
  const [status, setStatus] = useState<CompatibilityStatus | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    const checkCompatibility = (): CompatibilityStatus => {
      const missingFeatures: string[] = [];
      const warnings: string[] = [];

      // Check required features
      if (requireMediaRecorder && !BrowserSupport.mediaRecorder()) {
        missingFeatures.push('MediaRecorder API');
      }

      if (requireWebAudio && !BrowserSupport.webAudio()) {
        missingFeatures.push('Web Audio API');
      }

      if (requireWebRTC && !BrowserSupport.webRTC()) {
        missingFeatures.push('WebRTC');
      }

      // Check optional features and add warnings
      if (!BrowserSupport.getUserMedia()) {
        warnings.push('Camera/microphone access may not work');
      }

      if (!BrowserSupport.fileAPI()) {
        warnings.push('File operations may be limited');
      }

      if (!BrowserSupport.webWorkers()) {
        warnings.push('Background processing will be limited');
      }

      // Get browser info
      const browserInfo = getBrowserInfo();

      const status: CompatibilityStatus = {
        isSupported: missingFeatures.length === 0,
        missingFeatures,
        warnings,
        browserInfo,
      };

      return status;
    };

    const compatibilityStatus = checkCompatibility();
    setStatus(compatibilityStatus);

    if (!compatibilityStatus.isSupported) {
      onUnsupported?.(compatibilityStatus.missingFeatures);
    }
  }, [requireMediaRecorder, requireWebAudio, requireWebRTC, onUnsupported]);

  const getBrowserInfo = () => {
    const userAgent = navigator.userAgent;
    let browserName = 'Unknown';
    let version = 'Unknown';

    // Detect browser
    if (userAgent.includes('Chrome')) {
      browserName = 'Chrome';
      const match = userAgent.match(/Chrome\/(\d+)/);
      version = match ? match[1] : 'Unknown';
    } else if (userAgent.includes('Firefox')) {
      browserName = 'Firefox';
      const match = userAgent.match(/Firefox\/(\d+)/);
      version = match ? match[1] : 'Unknown';
    } else if (userAgent.includes('Safari') && !userAgent.includes('Chrome')) {
      browserName = 'Safari';
      const match = userAgent.match(/Version\/(\d+)/);
      version = match ? match[1] : 'Unknown';
    } else if (userAgent.includes('Edge')) {
      browserName = 'Edge';
      const match = userAgent.match(/Edge\/(\d+)/);
      version = match ? match[1] : 'Unknown';
    }

    return {
      name: browserName,
      version,
      isMobile: /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent),
    };
  };

  const getSupportedMimeTypes = (): string[] => {
    return BrowserSupport.getSupportedMimeTypes();
  };

  const getRecommendations = (): string[] => {
    if (!status) return [];

    const recommendations: string[] = [];

    if (status.browserInfo.name === 'Safari') {
      recommendations.push('For best recording quality, consider using Chrome or Firefox');
    }

    if (status.browserInfo.isMobile) {
      recommendations.push('Mobile recording may have limitations compared to desktop');
    }

    if (status.missingFeatures.includes('MediaRecorder API')) {
      recommendations.push('Please update your browser or try Chrome/Firefox for recording features');
    }

    if (status.missingFeatures.includes('Web Audio API')) {
      recommendations.push('Audio visualization and processing features require a modern browser');
    }

    return recommendations;
  };

  if (!status) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-2">Checking browser compatibility...</span>
      </div>
    );
  }

  if (!status.isSupported) {
    return (
      <div className="min-h-[400px] flex items-center justify-center p-8">
        <div className="max-w-lg mx-auto text-center">
          <div className="text-6xl mb-4">🚫</div>
          <h2 className="text-2xl font-bold text-gray-900 mb-4">
            Browser Not Supported
          </h2>
          
          <div className="text-gray-600 mb-6">
            <p className="mb-4">
              Your browser doesn't support some required features for this application.
            </p>
            
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
              <h3 className="font-medium text-red-900 mb-2">Missing Features:</h3>
              <ul className="text-sm text-red-700 space-y-1">
                {status.missingFeatures.map((feature, index) => (
                  <li key={index}>• {feature}</li>
                ))}
              </ul>
            </div>
            
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h3 className="font-medium text-blue-900 mb-2">Recommendations:</h3>
              <ul className="text-sm text-blue-700 space-y-1">
                {getRecommendations().map((rec, index) => (
                  <li key={index}>• {rec}</li>
                ))}
              </ul>
            </div>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Retry
            </button>
            
            <button
              onClick={() => setShowDetails(!showDetails)}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50"
            >
              {showDetails ? 'Hide' : 'Show'} Details
            </button>
          </div>
          
          {showDetails && (
            <div className="mt-6 text-left bg-gray-50 rounded-lg p-4">
              <h3 className="font-medium mb-2">Browser Information:</h3>
              <div className="text-sm space-y-1">
                <div>Browser: {status.browserInfo.name} {status.browserInfo.version}</div>
                <div>Platform: {status.browserInfo.isMobile ? 'Mobile' : 'Desktop'}</div>
                <div>User Agent: <code className="text-xs">{navigator.userAgent}</code></div>
              </div>
              
              {getSupportedMimeTypes().length > 0 && (
                <div className="mt-4">
                  <h4 className="font-medium mb-2">Supported Formats:</h4>
                  <div className="text-sm">
                    {getSupportedMimeTypes().map((type, index) => (
                      <div key={index} className="font-mono text-xs">{type}</div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Show warnings if any
  if (status.warnings.length > 0) {
    return (
      <div>
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
          <div className="flex items-start">
            <div className="text-yellow-400 mr-3 mt-0.5">⚠️</div>
            <div>
              <h3 className="font-medium text-yellow-900 mb-1">Compatibility Warnings</h3>
              <ul className="text-sm text-yellow-700 space-y-1">
                {status.warnings.map((warning, index) => (
                  <li key={index}>• {warning}</li>
                ))}
              </ul>
              
              {getRecommendations().length > 0 && (
                <div className="mt-2">
                  <h4 className="font-medium text-yellow-900 mb-1">Recommendations:</h4>
                  <ul className="text-sm text-yellow-700 space-y-1">
                    {getRecommendations().map((rec, index) => (
                      <li key={index}>• {rec}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
        {children}
      </div>
    );
  }

  // All good, render children
  return <>{children}</>;
};

// Hook for getting browser compatibility info
export const useBrowserCompatibility = () => {
  const [status, setStatus] = useState<CompatibilityStatus | null>(null);

  useEffect(() => {
    const checkCompatibility = () => {
      const missingFeatures: string[] = [];
      const warnings: string[] = [];

      // Check all features
      if (!BrowserSupport.mediaRecorder()) {
        missingFeatures.push('MediaRecorder API');
      }
      if (!BrowserSupport.getUserMedia()) {
        missingFeatures.push('getUserMedia API');
      }
      if (!BrowserSupport.webAudio()) {
        warnings.push('Web Audio API not available');
      }
      if (!BrowserSupport.webRTC()) {
        warnings.push('WebRTC not available');
      }
      if (!BrowserSupport.fileAPI()) {
        warnings.push('File API limited');
      }
      if (!BrowserSupport.webWorkers()) {
        warnings.push('Web Workers not available');
      }

      const browserInfo = {
        name: 'Unknown',
        version: 'Unknown',
        isMobile: /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent),
      };

      setStatus({
        isSupported: missingFeatures.length === 0,
        missingFeatures,
        warnings,
        browserInfo,
      });
    };

    checkCompatibility();
  }, []);

  return {
    status,
    isSupported: status?.isSupported ?? false,
    missingFeatures: status?.missingFeatures ?? [],
    warnings: status?.warnings ?? [],
    getSupportedMimeTypes: BrowserSupport.getSupportedMimeTypes,
  };
};