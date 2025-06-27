// Shared constants for MeetingMind application
// Centralizes configuration values and ensures consistency across frontend and backend

// Helper function to parse environment variables with defaults
const getEnvNumber = (envVar: string | undefined, defaultValue: number): number => {
  const parsed = envVar ? parseInt(envVar, 10) : NaN;
  return isNaN(parsed) ? defaultValue : parsed;
};

const getEnvBoolean = (envVar: string | undefined, defaultValue: boolean): boolean => {
  if (!envVar) return defaultValue;
  return envVar.toLowerCase() === 'true' || envVar === '1';
};

const getEnvArray = (envVar: string | undefined, defaultValue: string[]): string[] => {
  if (!envVar) return defaultValue;
  return envVar.split(',').map(item => item.trim()).filter(item => item.length > 0);
};

// API Configuration
export const API_CONFIG = {
  BASE_URL: process.env.VITE_API_BASE_URL || process.env.REACT_APP_API_BASE_URL || 'http://localhost:8000',
  WS_URL: process.env.VITE_WS_URL || process.env.REACT_APP_WS_URL || 'ws://localhost:8000/ws',
  TIMEOUT: getEnvNumber(process.env.VITE_API_TIMEOUT || process.env.REACT_APP_API_TIMEOUT, 30000),
  RETRY_ATTEMPTS: getEnvNumber(process.env.VITE_API_RETRY_ATTEMPTS || process.env.REACT_APP_API_RETRY_ATTEMPTS, 3),
  RETRY_DELAY: getEnvNumber(process.env.VITE_API_RETRY_DELAY || process.env.REACT_APP_API_RETRY_DELAY, 1000)
} as const;

// WebSocket Configuration
export const WS_CONFIG = {
  RECONNECT_INTERVAL: getEnvNumber(process.env.VITE_WS_RECONNECT_INTERVAL || process.env.REACT_APP_WS_RECONNECT_INTERVAL, 5000),
  MAX_RECONNECT_ATTEMPTS: getEnvNumber(process.env.VITE_WS_MAX_RECONNECT_ATTEMPTS || process.env.REACT_APP_WS_MAX_RECONNECT_ATTEMPTS, 10),
  HEARTBEAT_INTERVAL: getEnvNumber(process.env.VITE_WS_HEARTBEAT_INTERVAL || process.env.REACT_APP_WS_HEARTBEAT_INTERVAL, 30000),
  MESSAGE_QUEUE_SIZE: getEnvNumber(process.env.VITE_WS_MESSAGE_QUEUE_SIZE || process.env.REACT_APP_WS_MESSAGE_QUEUE_SIZE, 100)
} as const;

// Audio Configuration for transcription
export const AUDIO_CONFIG = {
  SAMPLE_RATE: getEnvNumber(process.env.VITE_AUDIO_SAMPLE_RATE || process.env.REACT_APP_AUDIO_SAMPLE_RATE, 16000),
  CHANNELS: getEnvNumber(process.env.VITE_AUDIO_CHANNELS || process.env.REACT_APP_AUDIO_CHANNELS, 1),
  BIT_DEPTH: getEnvNumber(process.env.VITE_AUDIO_BIT_DEPTH || process.env.REACT_APP_AUDIO_BIT_DEPTH, 16),
  CHUNK_SIZE: getEnvNumber(process.env.VITE_AUDIO_CHUNK_SIZE || process.env.REACT_APP_AUDIO_CHUNK_SIZE, 4096),
  MAX_RECORDING_DURATION: getEnvNumber(process.env.VITE_AUDIO_MAX_RECORDING_DURATION || process.env.REACT_APP_AUDIO_MAX_RECORDING_DURATION, 10800000),
  SILENCE_THRESHOLD: parseFloat(process.env.VITE_AUDIO_SILENCE_THRESHOLD || process.env.REACT_APP_AUDIO_SILENCE_THRESHOLD || '0.01'),
  SILENCE_DURATION: getEnvNumber(process.env.VITE_AUDIO_SILENCE_DURATION || process.env.REACT_APP_AUDIO_SILENCE_DURATION, 2000)
} as const;

// Meeting Configuration
export const MEETING_CONFIG = {
  MAX_PARTICIPANTS: getEnvNumber(process.env.VITE_MEETING_MAX_PARTICIPANTS || process.env.REACT_APP_MEETING_MAX_PARTICIPANTS, 50),
  MAX_MEETING_DURATION: getEnvNumber(process.env.VITE_MEETING_MAX_DURATION || process.env.REACT_APP_MEETING_MAX_DURATION, 480),
  AUTO_SAVE_INTERVAL: getEnvNumber(process.env.VITE_MEETING_AUTO_SAVE_INTERVAL || process.env.REACT_APP_MEETING_AUTO_SAVE_INTERVAL, 30000),
  SUMMARY_GENERATION_DELAY: getEnvNumber(process.env.VITE_MEETING_SUMMARY_DELAY || process.env.REACT_APP_MEETING_SUMMARY_DELAY, 5000),
  ACTION_ITEM_DETECTION_KEYWORDS: getEnvArray(
    process.env.VITE_MEETING_ACTION_KEYWORDS || process.env.REACT_APP_MEETING_ACTION_KEYWORDS,
    ['action item', 'todo', 'follow up', 'next step', 'assign', 'due date', 'deadline', 'responsible for']
  )
} as const;

// AI Configuration
export const AI_CONFIG = {
  MIN_TRANSCRIPTION_LENGTH: getEnvNumber(process.env.VITE_AI_MIN_TRANSCRIPTION_LENGTH || process.env.REACT_APP_AI_MIN_TRANSCRIPTION_LENGTH, 50),
  SUMMARY_UPDATE_INTERVAL: getEnvNumber(process.env.VITE_AI_SUMMARY_UPDATE_INTERVAL || process.env.REACT_APP_AI_SUMMARY_UPDATE_INTERVAL, 60000),
  SENTIMENT_ANALYSIS_WINDOW: getEnvNumber(process.env.VITE_AI_SENTIMENT_WINDOW || process.env.REACT_APP_AI_SENTIMENT_WINDOW, 300000),
  ACTION_ITEM_CONFIDENCE_THRESHOLD: parseFloat(process.env.VITE_AI_ACTION_CONFIDENCE || process.env.REACT_APP_AI_ACTION_CONFIDENCE || '0.7'),
  SPEAKER_IDENTIFICATION_THRESHOLD: parseFloat(process.env.VITE_AI_SPEAKER_THRESHOLD || process.env.REACT_APP_AI_SPEAKER_THRESHOLD || '0.8')
} as const;

// UI Configuration
export const UI_CONFIG = {
  NOTIFICATION_DURATION: getEnvNumber(process.env.VITE_UI_NOTIFICATION_DURATION || process.env.REACT_APP_UI_NOTIFICATION_DURATION, 5000),
  SEARCH_DEBOUNCE_DELAY: getEnvNumber(process.env.VITE_UI_SEARCH_DEBOUNCE || process.env.REACT_APP_UI_SEARCH_DEBOUNCE, 300),
  INFINITE_SCROLL_THRESHOLD: getEnvNumber(process.env.VITE_UI_SCROLL_THRESHOLD || process.env.REACT_APP_UI_SCROLL_THRESHOLD, 100),
  MAX_UPLOAD_SIZE: getEnvNumber(process.env.VITE_UI_MAX_UPLOAD_SIZE || process.env.REACT_APP_UI_MAX_UPLOAD_SIZE, 10485760),
  SUPPORTED_FILE_TYPES: getEnvArray(
    process.env.VITE_UI_SUPPORTED_FILE_TYPES || process.env.REACT_APP_UI_SUPPORTED_FILE_TYPES,
    ['audio/mpeg', 'audio/wav', 'audio/mp4', 'video/mp4', 'video/webm']
  )
} as const;

// Database Configuration (for backend reference)
export const DB_CONFIG = {
  MAX_CONNECTIONS: getEnvNumber(process.env.VITE_DB_MAX_CONNECTIONS || process.env.REACT_APP_DB_MAX_CONNECTIONS, 20),
  CONNECTION_TIMEOUT: getEnvNumber(process.env.VITE_DB_CONNECTION_TIMEOUT || process.env.REACT_APP_DB_CONNECTION_TIMEOUT, 30000),
  QUERY_TIMEOUT: getEnvNumber(process.env.VITE_DB_QUERY_TIMEOUT || process.env.REACT_APP_DB_QUERY_TIMEOUT, 15000),
  RETRY_ATTEMPTS: getEnvNumber(process.env.VITE_DB_RETRY_ATTEMPTS || process.env.REACT_APP_DB_RETRY_ATTEMPTS, 3)
} as const;

// Security Configuration
export const SECURITY_CONFIG = {
  JWT_EXPIRY: getEnvNumber(process.env.VITE_SECURITY_JWT_EXPIRY || process.env.REACT_APP_SECURITY_JWT_EXPIRY, 3600),
  REFRESH_TOKEN_EXPIRY: getEnvNumber(process.env.VITE_SECURITY_REFRESH_EXPIRY || process.env.REACT_APP_SECURITY_REFRESH_EXPIRY, 604800),
  PASSWORD_MIN_LENGTH: getEnvNumber(process.env.VITE_SECURITY_PASSWORD_MIN_LENGTH || process.env.REACT_APP_SECURITY_PASSWORD_MIN_LENGTH, 8),
  PASSWORD_REQUIREMENTS: {
    uppercase: getEnvBoolean(process.env.VITE_SECURITY_PASSWORD_UPPERCASE || process.env.REACT_APP_SECURITY_PASSWORD_UPPERCASE, true),
    lowercase: getEnvBoolean(process.env.VITE_SECURITY_PASSWORD_LOWERCASE || process.env.REACT_APP_SECURITY_PASSWORD_LOWERCASE, true),
    numbers: getEnvBoolean(process.env.VITE_SECURITY_PASSWORD_NUMBERS || process.env.REACT_APP_SECURITY_PASSWORD_NUMBERS, true),
    symbols: getEnvBoolean(process.env.VITE_SECURITY_PASSWORD_SYMBOLS || process.env.REACT_APP_SECURITY_PASSWORD_SYMBOLS, false)
  },
  RATE_LIMITS: {
    AUTH: { 
      requests: getEnvNumber(process.env.VITE_SECURITY_AUTH_RATE_REQUESTS || process.env.REACT_APP_SECURITY_AUTH_RATE_REQUESTS, 5), 
      window: getEnvNumber(process.env.VITE_SECURITY_AUTH_RATE_WINDOW || process.env.REACT_APP_SECURITY_AUTH_RATE_WINDOW, 900000) 
    },
    API: { 
      requests: getEnvNumber(process.env.VITE_SECURITY_API_RATE_REQUESTS || process.env.REACT_APP_SECURITY_API_RATE_REQUESTS, 100), 
      window: getEnvNumber(process.env.VITE_SECURITY_API_RATE_WINDOW || process.env.REACT_APP_SECURITY_API_RATE_WINDOW, 60000) 
    },
    UPLOAD: { 
      requests: getEnvNumber(process.env.VITE_SECURITY_UPLOAD_RATE_REQUESTS || process.env.REACT_APP_SECURITY_UPLOAD_RATE_REQUESTS, 10), 
      window: getEnvNumber(process.env.VITE_SECURITY_UPLOAD_RATE_WINDOW || process.env.REACT_APP_SECURITY_UPLOAD_RATE_WINDOW, 60000) 
    }
  }
} as const;

// Feature Flags
export const FEATURES = {
  AI_INSIGHTS: getEnvBoolean(process.env.VITE_FEATURE_AI_INSIGHTS || process.env.REACT_APP_FEATURE_AI_INSIGHTS, true),
  REAL_TIME_TRANSCRIPTION: getEnvBoolean(process.env.VITE_FEATURE_REAL_TIME_TRANSCRIPTION || process.env.REACT_APP_FEATURE_REAL_TIME_TRANSCRIPTION, true),
  SENTIMENT_ANALYSIS: getEnvBoolean(process.env.VITE_FEATURE_SENTIMENT_ANALYSIS || process.env.REACT_APP_FEATURE_SENTIMENT_ANALYSIS, true),
  ACTION_ITEM_DETECTION: getEnvBoolean(process.env.VITE_FEATURE_ACTION_ITEM_DETECTION || process.env.REACT_APP_FEATURE_ACTION_ITEM_DETECTION, true),
  SPEAKER_IDENTIFICATION: getEnvBoolean(process.env.VITE_FEATURE_SPEAKER_IDENTIFICATION || process.env.REACT_APP_FEATURE_SPEAKER_IDENTIFICATION, false),
  MEETING_ANALYTICS: getEnvBoolean(process.env.VITE_FEATURE_MEETING_ANALYTICS || process.env.REACT_APP_FEATURE_MEETING_ANALYTICS, true),
  CALENDAR_INTEGRATION: getEnvBoolean(process.env.VITE_FEATURE_CALENDAR_INTEGRATION || process.env.REACT_APP_FEATURE_CALENDAR_INTEGRATION, false),
  MULTI_LANGUAGE_SUPPORT: getEnvBoolean(process.env.VITE_FEATURE_MULTI_LANGUAGE_SUPPORT || process.env.REACT_APP_FEATURE_MULTI_LANGUAGE_SUPPORT, false)
} as const;

// Error Messages
export const ERROR_MESSAGES = {
  NETWORK_ERROR: 'Network connection failed. Please check your internet connection.',
  WEBSOCKET_ERROR: 'Real-time connection lost. Attempting to reconnect...',
  AUDIO_PERMISSION_DENIED: 'Microphone access is required for transcription.',
  MEETING_NOT_FOUND: 'Meeting not found or access denied.',
  INVALID_FILE_TYPE: 'File type not supported. Please upload audio or video files.',
  FILE_TOO_LARGE: 'File size exceeds maximum limit of 10MB.',
  TRANSCRIPTION_FAILED: 'Transcription service is currently unavailable.',
  AI_SERVICE_ERROR: 'AI analysis service is temporarily unavailable.',
  AUTHENTICATION_ERROR: 'Authentication failed. Please log in again.',
  PERMISSION_DENIED: 'You do not have permission to perform this action.'
} as const;

// Success Messages
export const SUCCESS_MESSAGES = {
  MEETING_CREATED: 'Meeting created successfully.',
  MEETING_JOINED: 'Successfully joined the meeting.',
  TRANSCRIPTION_STARTED: 'Live transcription activated.',
  FILE_UPLOADED: 'File uploaded and processing started.',
  SETTINGS_SAVED: 'Settings saved successfully.',
  ACTION_ITEM_CREATED: 'Action item added to the list.',
  SUMMARY_GENERATED: 'Meeting summary generated.'
} as const;

// Time and Date Formats
export const DATE_FORMATS = {
  DATE_TIME: 'yyyy-MM-dd HH:mm:ss',
  DATE_ONLY: 'yyyy-MM-dd',
  TIME_ONLY: 'HH:mm:ss',
  DISPLAY_DATE: 'MMM dd, yyyy',
  DISPLAY_TIME: 'h:mm a',
  DISPLAY_DATE_TIME: 'MMM dd, yyyy h:mm a'
} as const;