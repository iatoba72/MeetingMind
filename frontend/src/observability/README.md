# MeetingMind Observability System

A comprehensive observability solution for the MeetingMind application featuring distributed tracing, metrics collection, structured logging, and health monitoring.

## 🏗️ Architecture Overview

The observability system is built on industry-standard tools and follows best practices for production monitoring:

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend      │    │  OpenTelemetry  │    │   Backends      │
│   Application   │───▶│   Collector     │───▶│                 │
│                 │    │                 │    │  • Jaeger       │
│  • Tracing      │    │  • Receives     │    │  • Prometheus   │
│  • Metrics      │    │  • Processes    │    │  • Elasticsearch│
│  • Logging      │    │  • Routes       │    │  • Grafana      │
│  • Health       │    │                 │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## 🎯 Key Features

### ✅ Distributed Tracing
- **OpenTelemetry Integration**: Full W3C trace context propagation
- **Custom Instrumentation**: Business logic and user interactions
- **Performance Tracking**: Component render times, API calls, async operations
- **Correlation IDs**: Automatic trace/span correlation across the stack

### 📊 Comprehensive Metrics
- **Business Metrics**: Meeting creation, audio quality, user engagement
- **System Metrics**: Memory usage, FPS, network latency, error rates
- **Custom Metrics**: Application-specific KPIs and performance indicators
- **Real-time Monitoring**: Live dashboards and alerting

### 📝 Structured Logging
- **Correlation IDs**: Automatic trace/span correlation
- **Context Enrichment**: User, session, meeting, and component context
- **Log Levels**: DEBUG, INFO, WARN, ERROR with environment-based filtering
- **Remote Aggregation**: Centralized log collection and analysis

### 🏥 Health Monitoring
- **System Health Checks**: Memory, performance, network, audio, errors
- **Proactive Monitoring**: Continuous health assessment
- **Performance Diagnostics**: FPS monitoring, memory leak detection
- **Business Health**: Meeting success rates, user engagement metrics

## 🚀 Quick Start

### 1. Install Dependencies

```bash
npm install @opentelemetry/api @opentelemetry/sdk-trace-web @opentelemetry/auto-instrumentations-web
```

### 2. Initialize Observability

```typescript
import { initializeObservability, createObservabilityConfig } from './observability';

// Initialize with environment-specific configuration
const config = createObservabilityConfig(
  'production', // environment
  'meetingmind-frontend', // service name
  '1.0.0', // service version
  {
    telemetry: {
      tracing: {
        enabled: true,
        otlpEndpoint: 'http://localhost:4318/v1/traces',
        sampleRate: 0.1, // 10% sampling in production
      },
    },
    logging: {
      level: LogLevel.INFO,
      enableRemote: true,
      remoteEndpoint: 'http://localhost:4318/v1/logs',
    },
    metrics: {
      enabled: true,
      reportingInterval: 5000,
    },
  }
);

await initializeObservability(config);
```

### 3. Use in Components

```typescript
import { useObservability, usePerformanceMonitoring } from './observability/hooks';

function MyComponent() {
  const { log, logError, trace, recordPerformance } = useObservability('MyComponent');
  usePerformanceMonitoring('MyComponent');

  const handleAsyncOperation = async () => {
    await trace('complex_operation', async () => {
      // Your async operation here
      const result = await someAsyncWork();
      return result;
    });
  };

  return <div>My Component</div>;
}
```

## 📁 File Structure

```
src/observability/
├── index.ts                 # Main entry point and manager
├── telemetry.ts            # OpenTelemetry configuration
├── tracing.ts              # Distributed tracing utilities
├── metrics.ts              # Custom metrics collection
├── logging.ts              # Structured logging system
├── health.ts               # Health monitoring and checks
├── hooks.ts                # React hooks for components
├── config/                 # Configuration files
│   ├── docker-compose.observability.yml
│   ├── otel-collector-config.yaml
│   ├── prometheus.yml
│   └── alert_rules.yml
└── README.md               # This file
```

## 🔧 Configuration

### Environment Variables

```bash
# Telemetry Configuration
REACT_APP_TELEMETRY_AUTO_INIT=true
REACT_APP_JAEGER_ENDPOINT=http://localhost:14268/api/traces
REACT_APP_OTLP_TRACE_ENDPOINT=http://localhost:4318/v1/traces
REACT_APP_OTLP_METRICS_ENDPOINT=http://localhost:4318/v1/metrics
REACT_APP_TRACE_SAMPLE_RATE=1.0

# Logging Configuration
REACT_APP_LOG_ENDPOINT=http://localhost:4318/v1/logs
REACT_APP_LOG_LEVEL=info

# Metrics Configuration
REACT_APP_PROMETHEUS_PORT=9090
REACT_APP_METRICS_INTERVAL=5000

# Health Monitoring
REACT_APP_HEALTH_MONITORING=true

# Service Information
REACT_APP_SERVICE_NAME=meetingmind-frontend
REACT_APP_VERSION=1.0.0
REACT_APP_ENVIRONMENT=production
```

### Backend Infrastructure

Deploy the observability stack using Docker Compose:

```bash
cd src/observability/config
docker-compose -f docker-compose.observability.yml up -d
```

This starts:
- **Jaeger UI**: http://localhost:16686
- **Prometheus**: http://localhost:9090
- **Grafana**: http://localhost:3001 (admin/admin)
- **Kibana**: http://localhost:5601
- **OpenTelemetry Collector**: Ports 4317/4318

## 📊 Metrics Collected

### Business Metrics
```typescript
// Meeting metrics
meetingmind_meetings_total{status="created|started|ended|error"}
meetingmind_meeting_duration_seconds
meetingmind_meeting_participants

// Audio metrics  
meetingmind_audio_quality_score
meetingmind_audio_latency_ms
meetingmind_audio_sessions_total

// AI metrics
meetingmind_ai_requests_total{provider="openai|anthropic|local"}
meetingmind_ai_response_time_ms
meetingmind_ai_token_usage

// User metrics
meetingmind_user_actions_total{action="click|input|navigation"}
meetingmind_active_users
```

### System Metrics
```typescript
// Performance metrics
meetingmind_ui_render_time_ms
meetingmind_memory_usage_bytes  
meetingmind_performance_fps
meetingmind_network_latency_ms

// Error metrics
meetingmind_errors_total{type="ui|network|audio|ai", severity="low|medium|high|critical"}
meetingmind_error_rate
```

## 🔍 Tracing

### Automatic Instrumentation
- **HTTP Requests**: Fetch and XMLHttpRequest calls
- **User Interactions**: Clicks, form submissions, navigation
- **Component Lifecycle**: Mount, unmount, renders
- **Store Actions**: Zustand state mutations

### Custom Tracing
```typescript
// Trace business operations
await MeetingMindTracer.traceMeetingOperation(
  'create_meeting',
  meetingId,
  async (operation) => {
    operation.setAttributes({
      'meeting.participant_count': participants.length,
      'meeting.has_recording': true,
    });
    
    const result = await createMeeting(data);
    return result;
  }
);

// Trace AI operations
await MeetingMindTracer.traceAIOperation(
  'transcription',
  'openai',
  async (operation) => {
    const result = await transcribeAudio(audioData);
    operation.setAttributes({
      'ai.model': 'whisper-1',
      'ai.duration': audioData.duration,
      'ai.confidence': result.confidence,
    });
    return result;
  }
);
```

## 📝 Logging

### Log Levels and Context
```typescript
import { LoggerFactory, LogLevel } from './observability/logging';

const logger = LoggerFactory.getLogger('MyComponent', {
  userId: 'user123',
  sessionId: 'session456',
});

// Structured logging with context
logger.info('User started meeting', {
  meetingId: 'meeting789',
  participantCount: 5,
});

// Error logging with stack traces
logger.error('Failed to initialize audio', error, {
  deviceId: 'device123',
  operation: 'audio_init',
});

// Business event logging
logger.businessEvent('meeting_created', {
  meetingId: 'meeting789',
  duration: 3600,
  participants: ['user1', 'user2'],
});
```

### Correlation IDs
All logs automatically include trace and span IDs for correlation:
```json
{
  "timestamp": "2025-01-10T10:30:00.000Z",
  "level": "INFO",
  "message": "Meeting created successfully",
  "traceId": "4bf92f3577b34da6a3ce929d0e0e4736",
  "spanId": "00f067aa0ba902b7",
  "context": {
    "component": "MeetingManager",
    "meetingId": "meeting_123",
    "userId": "user_456"
  }
}
```

## 🏥 Health Monitoring

### Built-in Health Checks
- **Memory Usage**: Tracks JS heap usage and memory leaks
- **Performance**: Monitors FPS and render times
- **Network**: Tests connectivity and latency
- **Audio System**: Validates audio devices and permissions
- **Error Rate**: Monitors application error frequency

### Custom Health Checks
```typescript
import { HealthCheck, HealthStatus } from './observability/health';

class CustomHealthCheck implements HealthCheck {
  name = 'my_service';
  critical = true;
  timeout = 5000;

  async execute(): Promise<HealthCheckResult> {
    // Your health check logic
    const isHealthy = await checkMyService();
    
    return {
      name: this.name,
      status: isHealthy ? HealthStatus.HEALTHY : HealthStatus.UNHEALTHY,
      message: isHealthy ? 'Service is running' : 'Service is down',
      details: { lastCheck: new Date() },
      duration: 100,
      timestamp: new Date(),
      critical: this.critical,
    };
  }
}

// Register the health check
healthMonitor.registerCheck(new CustomHealthCheck());
```

## 🚨 Alerting

### Prometheus Alerts
The system includes pre-configured alerts for:
- **High Error Rate**: >10% error rate for 2 minutes
- **Critical Errors**: Any critical errors detected
- **High Memory Usage**: >100MB memory usage for 5 minutes
- **Poor Performance**: >50ms render time for 3 minutes
- **Low FPS**: <30 FPS for 2 minutes
- **Network Issues**: >1000ms latency for 1 minute
- **Service Downtime**: Service unavailable for 1 minute

### Custom Alerts
Add custom alerts to `alert_rules.yml`:
```yaml
- alert: CustomBusinessAlert
  expr: rate(meetingmind_custom_metric[5m]) > 0.1
  for: 2m
  labels:
    severity: warning
  annotations:
    summary: "Custom business condition detected"
    description: "Custom metric exceeded threshold: {{ $value }}"
```

## 🎛️ Dashboards

### Grafana Dashboards
Pre-built dashboards include:
- **Application Overview**: High-level metrics and health status
- **Performance Dashboard**: FPS, memory, render times, user experience
- **Business Metrics**: Meeting success rates, user engagement, feature usage
- **Error Analysis**: Error rates, types, trends, and resolution tracking
- **Infrastructure**: System resources, network, and service health

### Custom Dashboards
Create custom Grafana dashboards using:
```json
{
  "dashboard": {
    "title": "MeetingMind Custom Dashboard",
    "panels": [
      {
        "title": "Meeting Success Rate",
        "targets": [
          {
            "expr": "rate(meetingmind_meetings_total{status=\"completed\"}[5m]) / rate(meetingmind_meetings_total[5m])"
          }
        ]
      }
    ]
  }
}
```

## 🔒 Security and Privacy

### Data Sanitization
- **PII Removal**: Automatic sanitization of passwords, tokens, and secrets
- **URL Cleaning**: Removal of sensitive query parameters
- **Field Filtering**: Configurable field blacklisting

### Sampling and Retention
- **Trace Sampling**: Configurable sampling rates for production
- **Log Rotation**: Automatic log cleanup and archival
- **Data Retention**: Configurable retention policies for different data types

## 🚀 Performance Optimization

### Minimal Overhead
- **Async Processing**: Non-blocking telemetry collection
- **Batching**: Efficient batching of traces, metrics, and logs
- **Sampling**: Intelligent sampling to reduce data volume
- **Memory Management**: Automatic cleanup and memory limits

### Production Tuning
```typescript
const productionConfig = {
  telemetry: {
    tracing: {
      sampleRate: 0.01, // 1% sampling
    },
  },
  metrics: {
    reportingInterval: 30000, // 30 seconds
  },
  logging: {
    level: LogLevel.WARN, // Reduce log volume
  },
  health: {
    checkInterval: 60000, // 1 minute
  },
};
```

## 🛠️ Development and Debugging

### Debug Mode
Enable comprehensive debugging:
```typescript
// Enable debug mode
useStore.getState().enableDebugMode();

// Export observability data
const debugData = await useStore.getState().exportObservabilityData();
console.log('Debug data:', debugData);
```

### Local Development
```bash
# Start local observability stack
docker-compose -f src/observability/config/docker-compose.observability.yml up -d

# Set development environment variables
export REACT_APP_TRACE_SAMPLE_RATE=1.0
export REACT_APP_LOG_LEVEL=debug
export REACT_APP_OTLP_TRACE_ENDPOINT=http://localhost:4318/v1/traces
```

## 📚 Best Practices

### Tracing
1. **Meaningful Span Names**: Use descriptive, consistent naming
2. **Rich Attributes**: Add relevant business and technical context
3. **Error Handling**: Always set span status and record exceptions
4. **Sampling**: Use appropriate sampling rates for different environments

### Metrics
1. **Consistent Labels**: Use standardized label names and values
2. **Cardinality Management**: Avoid high-cardinality labels
3. **Business Relevance**: Focus on metrics that drive business decisions
4. **Alerting**: Set up alerts on actionable metrics

### Logging
1. **Structured Logs**: Always use structured logging with context
2. **Log Levels**: Use appropriate log levels for different information
3. **Sensitive Data**: Never log passwords, tokens, or PII
4. **Performance**: Use async logging and appropriate log levels

### Health Monitoring
1. **Critical vs Non-Critical**: Properly categorize health checks
2. **Timeouts**: Set appropriate timeouts for health checks
3. **Dependencies**: Include dependency health in overall status
4. **Recovery**: Implement automatic recovery mechanisms where possible

## 🤝 Contributing

### Adding New Metrics
1. Define the metric in `metrics.ts`
2. Add business logic in appropriate slice
3. Create alerts in `alert_rules.yml`
4. Document in this README

### Adding New Health Checks
1. Implement the `HealthCheck` interface
2. Register with the health monitor
3. Add appropriate alerts
4. Include in documentation

### Custom Instrumentation
1. Use existing tracing utilities when possible
2. Follow naming conventions
3. Add appropriate attributes and context
4. Test in development environment

## 📄 License

This observability system is part of the MeetingMind application and follows the same licensing terms.

---

## 🔗 Useful Links

- [OpenTelemetry Documentation](https://opentelemetry.io/docs/)
- [Prometheus Best Practices](https://prometheus.io/docs/practices/)
- [Grafana Dashboard Design](https://grafana.com/docs/grafana/latest/best-practices/)
- [Jaeger Tracing Guide](https://www.jaegertracing.io/docs/)
- [ELK Stack Documentation](https://www.elastic.co/guide/index.html)