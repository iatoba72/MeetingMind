// Shared constants for MeetingMind application
// Centralizes configuration values and ensures consistency across frontend and backend

// API Configuration
export const API_CONFIG = {
  BASE_URL: process.env.VITE_API_BASE_URL || process.env.REACT_APP_API_BASE_URL || 'http://localhost:8000',
  WS_URL: process.env.VITE_WS_URL || process.env.REACT_APP_WS_URL || 'ws://localhost:8000/ws',
  TIMEOUT: 30000, // 30 seconds
  RETRY_ATTEMPTS: 3,
  RETRY_DELAY: 1000 // 1 second
} as const;

// WebSocket Configuration
export const WS_CONFIG = {
  RECONNECT_INTERVAL: 5000, // 5 seconds
  MAX_RECONNECT_ATTEMPTS: 10,
  HEARTBEAT_INTERVAL: 30000, // 30 seconds
  MESSAGE_QUEUE_SIZE: 100
} as const;

// Audio Configuration for transcription
export const AUDIO_CONFIG = {
  SAMPLE_RATE: 16000, // Standard for speech recognition
  CHANNELS: 1, // Mono audio
  BIT_DEPTH: 16,
  CHUNK_SIZE: 4096,
  MAX_RECORDING_DURATION: 10800000, // 3 hours in milliseconds
  SILENCE_THRESHOLD: 0.01,
  SILENCE_DURATION: 2000 // 2 seconds of silence before stopping
} as const;

// Meeting Configuration
export const MEETING_CONFIG = {
  MAX_PARTICIPANTS: 50,
  MAX_MEETING_DURATION: 480, // 8 hours in minutes
  AUTO_SAVE_INTERVAL: 30000, // 30 seconds
  SUMMARY_GENERATION_DELAY: 5000, // 5 seconds after meeting ends
  ACTION_ITEM_DETECTION_KEYWORDS: [
    'action item',
    'todo',
    'follow up',
    'next step',
    'assign',
    'due date',
    'deadline',
    'responsible for'
  ]
} as const;

// AI Configuration
export const AI_CONFIG = {
  MIN_TRANSCRIPTION_LENGTH: 50, // Minimum characters for AI processing
  SUMMARY_UPDATE_INTERVAL: 60000, // 1 minute
  SENTIMENT_ANALYSIS_WINDOW: 300000, // 5 minutes
  ACTION_ITEM_CONFIDENCE_THRESHOLD: 0.7,
  SPEAKER_IDENTIFICATION_THRESHOLD: 0.8
} as const;

// UI Configuration
export const UI_CONFIG = {
  NOTIFICATION_DURATION: 5000, // 5 seconds
  SEARCH_DEBOUNCE_DELAY: 300, // 300ms
  INFINITE_SCROLL_THRESHOLD: 100, // pixels from bottom
  MAX_UPLOAD_SIZE: 10485760, // 10MB
  SUPPORTED_FILE_TYPES: [
    'audio/mpeg',
    'audio/wav',
    'audio/mp4',
    'video/mp4',
    'video/webm'
  ]
} as const;

// Database Configuration (for backend reference)
export const DB_CONFIG = {
  MAX_CONNECTIONS: 20,
  CONNECTION_TIMEOUT: 30000,
  QUERY_TIMEOUT: 15000,
  RETRY_ATTEMPTS: 3
} as const;

// Security Configuration
export const SECURITY_CONFIG = {
  JWT_EXPIRY: 3600, // 1 hour in seconds
  REFRESH_TOKEN_EXPIRY: 604800, // 7 days in seconds
  PASSWORD_MIN_LENGTH: 8,
  PASSWORD_REQUIREMENTS: {
    uppercase: true,
    lowercase: true,
    numbers: true,
    symbols: false
  },
  RATE_LIMITS: {
    AUTH: { requests: 5, window: 900000 }, // 5 requests per 15 minutes
    API: { requests: 100, window: 60000 }, // 100 requests per minute
    UPLOAD: { requests: 10, window: 60000 } // 10 uploads per minute
  }
} as const;

// Feature Flags
export const FEATURES = {
  AI_INSIGHTS: true,
  REAL_TIME_TRANSCRIPTION: true,
  SENTIMENT_ANALYSIS: true,
  ACTION_ITEM_DETECTION: true,
  SPEAKER_IDENTIFICATION: false, // Coming soon
  MEETING_ANALYTICS: true,
  CALENDAR_INTEGRATION: false, // Coming soon
  MULTI_LANGUAGE_SUPPORT: false // Coming soon
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