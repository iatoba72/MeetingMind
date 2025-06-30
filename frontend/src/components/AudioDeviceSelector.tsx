// Audio Device Selection Component
// Provides interface for selecting and managing audio input devices
// Educational component demonstrating MediaDevices API usage

import { useEffect, useState } from 'react';
import { AudioDevice } from '../hooks/useAudioCapture';

interface AudioDeviceSelectorProps {
  availableDevices: AudioDevice[];
  selectedDevice: AudioDevice | null;
  onDeviceSelect: (deviceId: string) => Promise<void>;
  onRefreshDevices: () => Promise<void>;
  isRecording: boolean;
}

/**
 * AudioDeviceSelector Component
 * 
 * This component demonstrates audio device management concepts:
 * 
 * MediaDevices API:
 * - navigator.mediaDevices.enumerateDevices() lists available devices
 * - Device permissions affect what information is available
 * - Device labels require microphone permission to be visible
 * - DeviceId values are persistent across browser sessions
 * 
 * Device Selection:
 * - Users can choose from multiple microphones/audio sources
 * - Different devices may have different capabilities
 * - Some devices support different sample rates or channel counts
 * - Professional audio interfaces often provide higher quality
 * 
 * Privacy Considerations:
 * - Device enumeration requires user permission
 * - Device labels are only available after permission granted
 * - Browser may show generic names until permission granted
 * - Users should understand what devices are being accessed
 * 
 * Device Characteristics:
 * - Built-in microphones: Generally mono, lower quality
 * - USB microphones: Often better quality, may support stereo
 * - Audio interfaces: Professional quality, multiple inputs
 * - Bluetooth devices: Wireless convenience, potential latency
 */
export const AudioDeviceSelector: React.FC<AudioDeviceSelectorProps> = ({
  availableDevices,
  selectedDevice,
  onDeviceSelect,
  onRefreshDevices,
  isRecording
}) => {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [devicePermissionStatus, setDevicePermissionStatus] = useState<'unknown' | 'granted' | 'denied'>('unknown');
  
  // Check device permission status
  useEffect(() => {
    const checkPermissions = async () => {
      try {
        if ('permissions' in navigator) {
          const permission = await navigator.permissions.query({ name: 'microphone' as PermissionName });
          setDevicePermissionStatus(permission.state as 'granted' | 'denied');
          
          // Listen for permission changes
          permission.onchange = () => {
            setDevicePermissionStatus(permission.state as 'granted' | 'denied');
          };
        }
      } catch {
        // Permission check not supported in this browser
      }
    };
    
    checkPermissions();
  }, []);
  
  // Handle device refresh
  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await onRefreshDevices();
    } catch (error) {
      console.error('Failed to refresh devices:', error);
    } finally {
      setIsRefreshing(false);
    }
  };
  
  // Handle device selection
  const handleDeviceSelect = async (deviceId: string) => {
    if (deviceId === selectedDevice?.deviceId) return;
    
    try {
      await onDeviceSelect(deviceId);
    } catch (error) {
      console.error('Failed to select device:', error);
    }
  };
  
  // Get device type icon
  const getDeviceIcon = (device: AudioDevice) => {
    const label = device.label.toLowerCase();
    
    if (label.includes('bluetooth') || label.includes('wireless')) {
      return '📱'; // Bluetooth/wireless
    } else if (label.includes('usb') || label.includes('external')) {
      return '🎤'; // External microphone
    } else if (label.includes('built-in') || label.includes('internal')) {
      return '💻'; // Built-in microphone
    } else if (label.includes('headset') || label.includes('headphone')) {
      return '🎧'; // Headset
    } else {
      return '🔊'; // Generic audio device
    }
  };
  
  // Get device quality indicator
  const getDeviceQuality = (device: AudioDevice) => {
    const label = device.label.toLowerCase();
    
    if (label.includes('built-in') || label.includes('internal')) {
      return { level: 'basic', color: 'text-yellow-600', description: 'Basic quality' };
    } else if (label.includes('usb') || label.includes('external')) {
      return { level: 'good', color: 'text-green-600', description: 'Good quality' };
    } else if (label.includes('professional') || label.includes('studio')) {
      return { level: 'professional', color: 'text-blue-600', description: 'Professional quality' };
    } else {
      return { level: 'standard', color: 'text-gray-600', description: 'Standard quality' };
    }
  };
  
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Audio Input Device</h3>
        <button
          onClick={handleRefresh}
          disabled={isRefreshing || isRecording}
          className="px-3 py-1 text-sm bg-gray-600 text-white rounded hover:bg-gray-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center space-x-1"
        >
          {isRefreshing ? (
            <>
              <div className="animate-spin w-3 h-3 border border-white border-t-transparent rounded-full"></div>
              <span>Refreshing...</span>
            </>
          ) : (
            <>
              <span>🔄</span>
              <span>Refresh</span>
            </>
          )}
        </button>
      </div>
      
      {/* Permission Status */}
      {devicePermissionStatus !== 'granted' && (
        <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
          <div className="flex items-center space-x-2">
            <span className="text-yellow-600">⚠️</span>
            <div>
              <div className="font-medium text-yellow-800">Microphone Permission Required</div>
              <div className="text-sm text-yellow-700 mt-1">
                {devicePermissionStatus === 'denied' 
                  ? 'Microphone access denied. Please enable it in browser settings.'
                  : 'Grant microphone permission to see device names and select specific devices.'
                }
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Device List */}
      <div className="space-y-2">
        {availableDevices.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <div className="text-4xl mb-2">🎤</div>
            <p>No audio devices found</p>
            <p className="text-sm mt-1">
              Make sure your microphone is connected and permissions are granted
            </p>
          </div>
        ) : (
          availableDevices.map((device) => {
            const isSelected = device.deviceId === selectedDevice?.deviceId;
            const quality = getDeviceQuality(device);
            
            return (
              <div
                key={device.deviceId}
                className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                  isSelected
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                } ${isRecording ? 'cursor-not-allowed opacity-60' : ''}`}
                onClick={() => !isRecording && handleDeviceSelect(device.deviceId)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    {/* Device Icon */}
                    <span className="text-xl">{getDeviceIcon(device)}</span>
                    
                    {/* Device Information */}
                    <div>
                      <div className="font-medium text-gray-900">
                        {device.label || `Microphone ${device.deviceId.slice(0, 8)}`}
                      </div>
                      <div className="text-sm text-gray-600">
                        ID: {device.deviceId.slice(0, 12)}...
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    {/* Quality Indicator */}
                    <div className={`text-xs font-medium ${quality.color}`}>
                      {quality.description}
                    </div>
                    
                    {/* Selection Indicator */}
                    {isSelected && (
                      <div className="w-4 h-4 bg-blue-600 rounded-full flex items-center justify-center">
                        <div className="w-2 h-2 bg-white rounded-full"></div>
                      </div>
                    )}
                  </div>
                </div>
                
                {/* Device Details (when selected) */}
                {isSelected && (
                  <div className="mt-2 pt-2 border-t border-blue-200">
                    <div className="grid grid-cols-2 gap-4 text-xs text-blue-800">
                      <div>
                        <span className="font-medium">Device ID:</span>
                        <div className="font-mono mt-1 break-all">{device.deviceId}</div>
                      </div>
                      <div>
                        <span className="font-medium">Group ID:</span>
                        <div className="font-mono mt-1 break-all">{device.groupId || 'N/A'}</div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
      
      {/* Device Information */}
      {selectedDevice && (
        <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="text-sm">
            <div className="font-semibold text-blue-900 mb-2">Selected Device Details:</div>
            <div className="space-y-1 text-blue-800">
              <div><strong>Name:</strong> {selectedDevice.label}</div>
              <div><strong>Type:</strong> {selectedDevice.kind}</div>
              <div><strong>Status:</strong> {isRecording ? '🔴 Recording' : '⚫ Ready'}</div>
            </div>
          </div>
        </div>
      )}
      
      {/* Educational Information */}
      <div className="mt-4 p-3 bg-gray-50 border border-gray-200 rounded text-sm">
        <div className="font-semibold text-gray-800 mb-2">🎓 Device Selection Tips:</div>
        <ul className="text-gray-700 space-y-1">
          <li>• <strong>Built-in mics:</strong> Convenient but may pick up system noise</li>
          <li>• <strong>USB microphones:</strong> Better quality, reduced background noise</li>
          <li>• <strong>Headset mics:</strong> Close proximity reduces room acoustics</li>
          <li>• <strong>Professional interfaces:</strong> Highest quality, multiple inputs</li>
          <li>• <strong>Bluetooth devices:</strong> Wireless but may add latency</li>
        </ul>
      </div>
      
      {/* Recording Warning */}
      {isRecording && (
        <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-center space-x-2 text-red-800">
            <span>🔴</span>
            <div>
              <div className="font-medium">Recording in Progress</div>
              <div className="text-sm">Stop recording to change audio devices</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};