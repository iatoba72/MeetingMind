# MeetingMind Configuration Guide

This document explains how to configure MeetingMind using environment variables instead of hardcoded values.

## Overview

MeetingMind now supports configuration through environment variables, allowing you to customize behavior without modifying source code. This is especially useful for:

- **Production deployments** with different limits and settings
- **Development environments** with specific configurations
- **Docker deployments** with container-specific settings
- **CI/CD pipelines** with environment-specific configurations

## Quick Start

1. **Copy the example environment file:**
   ```bash
   cp .env.example .env
   ```

2. **Modify the values** in `.env` to match your requirements

3. **Restart the application** to apply changes

## Environment Variable Structure

Environment variables follow this naming pattern:
- **Vite (frontend)**: `VITE_<CATEGORY>_<SETTING>`
- **React (legacy)**: `REACT_APP_<CATEGORY>_<SETTING>`

Both prefixes are supported for compatibility.

## Configuration Categories

### 🔗 API Configuration

Controls how the frontend communicates with the backend.

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_API_BASE_URL` | `http://localhost:8000` | Backend API base URL |
| `VITE_WS_URL` | `ws://localhost:8000/ws` | WebSocket endpoint |
| `VITE_API_TIMEOUT` | `30000` | Request timeout (ms) |
| `VITE_API_RETRY_ATTEMPTS` | `3` | Failed request retries |
| `VITE_API_RETRY_DELAY` | `1000` | Retry delay (ms) |

**Production Example:**
```bash
VITE_API_BASE_URL=https://api.meetingmind.app
VITE_WS_URL=wss://api.meetingmind.app/ws
VITE_API_TIMEOUT=45000
```

### 📡 WebSocket Configuration

Real-time communication settings.

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_WS_RECONNECT_INTERVAL` | `5000` | Reconnection delay (ms) |
| `VITE_WS_MAX_RECONNECT_ATTEMPTS` | `10` | Max reconnection tries |
| `VITE_WS_HEARTBEAT_INTERVAL` | `30000` | Keep-alive interval (ms) |
| `VITE_WS_MESSAGE_QUEUE_SIZE` | `100` | Offline message buffer |

### 🎤 Audio Configuration

Audio recording and processing settings.

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_AUDIO_SAMPLE_RATE` | `16000` | Sample rate (Hz) |
| `VITE_AUDIO_CHANNELS` | `1` | Audio channels (1=mono) |
| `VITE_AUDIO_CHUNK_SIZE` | `4096` | Processing chunk size |
| `VITE_AUDIO_MAX_RECORDING_DURATION` | `10800000` | Max recording (ms, 3hrs) |
| `VITE_AUDIO_SILENCE_THRESHOLD` | `0.01` | Silence detection (0-1) |

**High-Quality Example:**
```bash
VITE_AUDIO_SAMPLE_RATE=48000
VITE_AUDIO_CHANNELS=2
VITE_AUDIO_CHUNK_SIZE=8192
```

### 👥 Meeting Configuration

Meeting limits and behavior.

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_MEETING_MAX_PARTICIPANTS` | `50` | Max participants per meeting |
| `VITE_MEETING_MAX_DURATION` | `480` | Max duration (minutes, 8hrs) |
| `VITE_MEETING_AUTO_SAVE_INTERVAL` | `30000` | Auto-save frequency (ms) |
| `VITE_MEETING_SUMMARY_DELAY` | `5000` | Summary generation delay (ms) |

**Enterprise Example:**
```bash
VITE_MEETING_MAX_PARTICIPANTS=200
VITE_MEETING_MAX_DURATION=1440  # 24 hours
VITE_MEETING_AUTO_SAVE_INTERVAL=15000  # 15 seconds
```

### 🤖 AI Configuration

AI processing and analysis settings.

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_AI_MIN_TRANSCRIPTION_LENGTH` | `50` | Min text for AI (chars) |
| `VITE_AI_SUMMARY_UPDATE_INTERVAL` | `60000` | Summary refresh (ms) |
| `VITE_AI_SENTIMENT_WINDOW` | `300000` | Sentiment analysis window (ms) |
| `VITE_AI_ACTION_CONFIDENCE` | `0.7` | Action item threshold (0-1) |
| `VITE_AI_SPEAKER_THRESHOLD` | `0.8` | Speaker ID threshold (0-1) |

### 🎨 UI Configuration

User interface behavior settings.

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_UI_NOTIFICATION_DURATION` | `5000` | Notification display time (ms) |
| `VITE_UI_SEARCH_DEBOUNCE` | `300` | Search input delay (ms) |
| `VITE_UI_MAX_UPLOAD_SIZE` | `10485760` | Max file size (bytes, 10MB) |

**Large Files Example:**
```bash
VITE_UI_MAX_UPLOAD_SIZE=104857600  # 100MB
VITE_UI_SUPPORTED_FILE_TYPES=audio/mpeg,audio/wav,video/mp4,video/webm,video/avi
```

### 🔒 Security Configuration

Authentication and security settings.

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_SECURITY_JWT_EXPIRY` | `3600` | JWT lifetime (seconds, 1hr) |
| `VITE_SECURITY_PASSWORD_MIN_LENGTH` | `8` | Minimum password length |
| `VITE_SECURITY_AUTH_RATE_REQUESTS` | `5` | Auth attempts per window |
| `VITE_SECURITY_AUTH_RATE_WINDOW` | `900000` | Auth rate window (ms, 15min) |

**Secure Production Example:**
```bash
VITE_SECURITY_JWT_EXPIRY=1800  # 30 minutes
VITE_SECURITY_PASSWORD_MIN_LENGTH=12
VITE_SECURITY_PASSWORD_SYMBOLS=true
VITE_SECURITY_AUTH_RATE_REQUESTS=3  # Stricter rate limiting
```

### 🚀 Feature Flags

Enable/disable features dynamically.

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_FEATURE_AI_INSIGHTS` | `true` | AI-powered insights |
| `VITE_FEATURE_REAL_TIME_TRANSCRIPTION` | `true` | Live transcription |
| `VITE_FEATURE_SENTIMENT_ANALYSIS` | `true` | Sentiment tracking |
| `VITE_FEATURE_ACTION_ITEM_DETECTION` | `true` | Action item detection |
| `VITE_FEATURE_SPEAKER_IDENTIFICATION` | `false` | Speaker recognition |

**Minimal Feature Set:**
```bash
VITE_FEATURE_AI_INSIGHTS=false
VITE_FEATURE_SENTIMENT_ANALYSIS=false
VITE_FEATURE_ACTION_ITEM_DETECTION=false
```

## Deployment Examples

### 🐳 Docker Deployment

**docker-compose.yml:**
```yaml
services:
  meetingmind:
    image: meetingmind:latest
    environment:
      - VITE_API_BASE_URL=https://api.meetingmind.app
      - VITE_MEETING_MAX_PARTICIPANTS=100
      - VITE_SECURITY_JWT_EXPIRY=1800
      - VITE_FEATURE_AI_INSIGHTS=true
    ports:
      - "3000:3000"
```

### ☁️ Cloud Deployment

**Kubernetes ConfigMap:**
```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: meetingmind-config
data:
  VITE_API_BASE_URL: "https://api.meetingmind.app"
  VITE_MEETING_MAX_PARTICIPANTS: "200"
  VITE_UI_MAX_UPLOAD_SIZE: "52428800"
  VITE_SECURITY_JWT_EXPIRY: "1800"
```

### 🔧 Development Environment

**.env.development:**
```bash
# Development-specific settings
VITE_API_BASE_URL=http://localhost:8000
VITE_MEETING_MAX_PARTICIPANTS=10
VITE_SECURITY_JWT_EXPIRY=7200  # 2 hours for development
VITE_FEATURE_SPEAKER_IDENTIFICATION=true  # Test experimental features
```

## Validation and Defaults

The configuration system includes:

- **Type validation**: Numbers are parsed and validated
- **Fallback defaults**: If parsing fails, safe defaults are used
- **Array parsing**: Comma-separated values for lists
- **Boolean parsing**: Supports `true/false` and `1/0`

**Examples:**
```bash
# Numbers
VITE_MEETING_MAX_PARTICIPANTS=invalid  # Falls back to 50

# Booleans
VITE_FEATURE_AI_INSIGHTS=1  # Parsed as true
VITE_FEATURE_AI_INSIGHTS=false  # Parsed as false

# Arrays
VITE_MEETING_ACTION_KEYWORDS=todo,task,action,follow-up
```

## Best Practices

### 🔒 Security
- **Never commit** `.env` files to version control
- **Use environment-specific** configurations
- **Validate sensitive settings** in production
- **Rotate secrets** regularly

### 📊 Performance
- **Monitor timeout values** in production
- **Adjust upload limits** based on infrastructure
- **Tune rate limits** for your user base
- **Optimize WebSocket settings** for network conditions

### 🚀 Deployment
- **Document environment** requirements
- **Test configuration** changes in staging
- **Use infrastructure as code** for consistency
- **Monitor configuration** drift

## Troubleshooting

### Common Issues

**1. Configuration not applied:**
- Ensure environment variables have correct prefixes (`VITE_` or `REACT_APP_`)
- Restart the application after changes
- Check for typos in variable names

**2. Invalid values:**
- Check browser console for parsing errors
- Verify numeric values are valid numbers
- Ensure boolean values are `true/false` or `1/0`

**3. Performance issues:**
- Review timeout and interval settings
- Check upload size limits
- Monitor rate limiting configurations

### Debug Configuration

Add this to your component to debug current configuration:

```typescript
import { MEETING_CONFIG, API_CONFIG } from '../shared/constants';

console.log('Current Configuration:', {
  maxParticipants: MEETING_CONFIG.MAX_PARTICIPANTS,
  apiBaseUrl: API_CONFIG.BASE_URL,
  // ... other settings
});
```

## Migration Guide

### From Hardcoded Values

1. **Identify current values** in your deployment
2. **Set equivalent environment variables**
3. **Test in development environment**
4. **Deploy incrementally** to production

### Legacy React Apps

The system supports both `VITE_` and `REACT_APP_` prefixes:

```bash
# Both work
VITE_MEETING_MAX_PARTICIPANTS=100
REACT_APP_MEETING_MAX_PARTICIPANTS=100
```

## Support

For configuration questions:
- Check the [FAQ](../FAQ.md)
- Review [deployment documentation](../DEPLOYMENT.md)
- Submit an issue on GitHub