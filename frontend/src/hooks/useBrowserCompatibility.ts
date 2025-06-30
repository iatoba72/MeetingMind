import { useState, useEffect } from 'react';

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

// Browser support detection utilities
const BrowserSupport = {
  mediaRecorder: () => 'MediaRecorder' in window,
  getUserMedia: () => !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia),
  webAudio: () => 'AudioContext' in window || 'webkitAudioContext' in window,
  webRTC: () => 'RTCPeerConnection' in window,
  fileAPI: () => 'File' in window && 'FileReader' in window,
  webWorkers: () => 'Worker' in window,
  getSupportedMimeTypes: () => {
    const types = ['audio/webm', 'audio/mp4', 'audio/wav', 'audio/ogg'];
    return types.filter(type => MediaRecorder.isTypeSupported(type));
  }
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