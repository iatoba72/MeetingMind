# MeetingMind Deployment Configuration

## Environment Variable Configuration

### ⚠️ Critical Configuration Fix

**Issue**: Previously, API URLs were determined solely by `NODE_ENV`, which could lead to production failures if the environment variable was not set correctly.

**Solution**: Now uses explicit environment variables for API configuration with fallbacks.

## Frontend Environment Variables

### Required for Production

Create a `.env.local` file in the frontend directory with these variables:

```bash
# API Configuration - REQUIRED
VITE_API_BASE_URL=https://your-api-domain.com
VITE_WS_URL=wss://your-api-domain.com/ws
```

### Development Configuration

```bash
# Development (default values)
VITE_API_BASE_URL=http://localhost:8000
VITE_WS_URL=ws://localhost:8000/ws
VITE_DEV_MODE=true
VITE_DEBUG=true
```

### Optional Configuration

```bash
# Analytics
VITE_ANALYTICS_ID=your-analytics-id
VITE_SENTRY_DSN=your-sentry-dsn

# Feature Flags (override defaults)
VITE_ENABLE_AI_INSIGHTS=true
VITE_ENABLE_REAL_TIME_TRANSCRIPTION=true
VITE_ENABLE_SENTIMENT_ANALYSIS=true
```

## Environment-Specific Examples

### Local Development
```bash
VITE_API_BASE_URL=http://localhost:8000
VITE_WS_URL=ws://localhost:8000/ws
```

### Staging Environment
```bash
VITE_API_BASE_URL=https://staging-api.meetingmind.app
VITE_WS_URL=wss://staging-api.meetingmind.app/ws
```

### Production Environment
```bash
VITE_API_BASE_URL=https://api.meetingmind.app
VITE_WS_URL=wss://api.meetingmind.app/ws
```

## Configuration Priority

The system checks environment variables in this order:

1. `VITE_API_BASE_URL` (Vite-specific)
2. `REACT_APP_API_BASE_URL` (Create React App compatibility)
3. `http://localhost:8000` (fallback for development)

## Deployment Checklist

### Before Deployment

- [ ] Set `VITE_API_BASE_URL` explicitly for your environment
- [ ] Set `VITE_WS_URL` explicitly for your environment
- [ ] Verify URLs are accessible from the deployment environment
- [ ] Test API connectivity in staging environment

### Verification

After deployment, verify the configuration:

```javascript
// In browser console
console.log('API Base URL:', window.location.origin);
// Should show your actual API URL, not localhost
```

### Common Issues

1. **API URL defaults to localhost in production**
   - **Cause**: Environment variables not set
   - **Fix**: Explicitly set `VITE_API_BASE_URL`

2. **CORS errors in production**
   - **Cause**: Backend CORS not configured for frontend domain
   - **Fix**: Update backend `ALLOWED_ORIGINS` environment variable

3. **WebSocket connection fails**
   - **Cause**: `VITE_WS_URL` not set or incorrect protocol
   - **Fix**: Ensure WSS for HTTPS deployments, WS for HTTP

## Platform-Specific Configuration

### Vercel
```bash
# Environment Variables in Vercel Dashboard
VITE_API_BASE_URL=https://your-api.vercel.app
VITE_WS_URL=wss://your-api.vercel.app/ws
```

### Netlify
```bash
# In netlify.toml or dashboard
VITE_API_BASE_URL=https://your-api.netlify.app
VITE_WS_URL=wss://your-api.netlify.app/ws
```

### Docker
```dockerfile
# In Dockerfile or docker-compose.yml
ENV VITE_API_BASE_URL=https://api.meetingmind.app
ENV VITE_WS_URL=wss://api.meetingmind.app/ws
```

### Kubernetes
```yaml
# In ConfigMap or Secret
apiVersion: v1
kind: ConfigMap
metadata:
  name: frontend-config
data:
  VITE_API_BASE_URL: "https://api.meetingmind.app"
  VITE_WS_URL: "wss://api.meetingmind.app/ws"
```

## Security Considerations

1. **Never expose sensitive data** in frontend environment variables
2. **Use HTTPS/WSS** in production environments
3. **Validate API URLs** before making requests
4. **Implement proper CORS** on the backend

## Testing Configuration

### Local Testing
```bash
# Test with different API URLs
VITE_API_BASE_URL=http://localhost:3001 npm run dev
```

### Integration Testing
```bash
# Test against staging API
VITE_API_BASE_URL=https://staging-api.example.com npm run build
```

## Monitoring

Monitor these metrics to ensure proper configuration:

- API request success rate
- WebSocket connection stability
- CORS error frequency
- Failed API calls due to incorrect URLs

## Migration Guide

If upgrading from the old `NODE_ENV`-based configuration:

1. **Backup** your current environment configuration
2. **Set** explicit `VITE_API_BASE_URL` and `VITE_WS_URL`
3. **Remove** reliance on `NODE_ENV` for API URL determination
4. **Test** thoroughly in each environment
5. **Deploy** with new configuration

This change eliminates the risk of production deployments defaulting to localhost URLs.