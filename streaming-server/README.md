# MeetingMind Network Streaming Server

A comprehensive streaming server that supports RTMP, SRT, and WebRTC WHIP protocols for professional streaming integration with OBS Studio and other broadcasting software.

## 🌟 Features

### Multi-Protocol Support
- **RTMP**: Universal compatibility, standard streaming protocol
- **SRT**: Low-latency streaming with error correction (0.5-2 seconds)
- **WebRTC WHIP**: Ultra-low latency browser streaming (0.1-0.5 seconds)

### Professional Features
- **Stream Authentication**: Secure stream keys with expiration
- **Health Monitoring**: Real-time stream quality and performance tracking
- **Stream Analytics**: Comprehensive metrics and reporting
- **Auto-scaling**: Handle multiple concurrent streams
- **Dashboard**: Web-based management interface

### Enterprise Ready
- **Docker Support**: Containerized deployment
- **Monitoring**: Prometheus metrics and Grafana dashboards
- **Load Balancing**: Nginx reverse proxy configuration
- **SSL/TLS**: HTTPS and secure WebRTC support

## 🚀 Quick Start

### Method 1: Docker Compose (Recommended)

```bash
# Clone repository
git clone <repository-url>
cd streaming-server

# Configure environment
cp .env.example .env
# Edit .env with your settings

# Start all services
docker-compose up -d

# View logs
docker-compose logs -f streaming-server
```

### Method 2: Manual Installation

```bash
# Install Node.js dependencies
npm install

# Install system dependencies (Ubuntu/Debian)
sudo apt update
sudo apt install ffmpeg

# Configure environment
cp .env.example .env

# Start the server
npm start
```

## 📋 Prerequisites

### System Requirements
- **CPU**: 2+ cores (4+ recommended for multiple streams)
- **RAM**: 4GB minimum (8GB+ recommended)
- **Network**: 100Mbps+ upload bandwidth
- **Storage**: 10GB+ for logs and recordings

### Software Dependencies
- **Node.js**: 18.0+
- **FFmpeg**: 4.0+ (for SRT relay and processing)
- **Redis**: 6.0+ (for session management)
- **SSL Certificates**: For WebRTC WHIP (can be self-signed for testing)

## 🔧 Configuration

### Environment Variables

```bash
# Server Configuration
PORT=3001
NODE_ENV=production

# Protocol Ports
RTMP_PORT=1935
SRT_PORT=9998
WEBRTC_PORT=8443

# Authentication
JWT_SECRET=your-super-secure-jwt-secret-key
STREAM_KEY_LENGTH=32
DEFAULT_STREAM_EXPIRY=86400

# SSL Certificates (for WebRTC)
WEBRTC_CERT_PATH=/path/to/cert.pem
WEBRTC_KEY_PATH=/path/to/key.pem

# Monitoring
ENABLE_METRICS=true
METRICS_PORT=9090
LOG_LEVEL=info

# Stream Limits
MAX_STREAMS=10
MAX_BITRATE=10000
MAX_RESOLUTION=1920x1080
MAX_FPS=60
```

### SSL Certificate Setup

For WebRTC WHIP support, you need SSL certificates:

```bash
# Self-signed certificate (development)
openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -days 365 -nodes

# Let's Encrypt (production)
certbot certonly --standalone -d your-domain.com
```

## 🎮 OBS Studio Configuration

### RTMP Setup
1. Open OBS Studio → Settings → Stream
2. Service: Custom...
3. Server: `rtmp://your-server-ip:1935/live`
4. Stream Key: `your-generated-stream-key`

### SRT Setup (OBS 28+)
1. Service: Custom...
2. Server: `srt://your-server-ip:9998?streamid=your-stream-key&latency=120`
3. Leave Stream Key empty

### WebRTC WHIP Setup (Plugin Required)
1. Install OBS WebRTC plugin
2. Configure WHIP endpoint: `https://your-server-ip:8443/whip/meeting-room-id`
3. Bearer Token: `your-stream-key`

## 📊 API Documentation

### Authentication Endpoints

#### Generate Stream Key
```http
POST /api/auth/stream-keys
Content-Type: application/json

{
  "meetingId": "meeting-123",
  "userId": "user-456",
  "permissions": ["publish"],
  "expiresIn": "24h"
}
```

#### Revoke Stream Key
```http
DELETE /api/auth/stream-keys/{keyId}
```

### Stream Management

#### Get Active Streams
```http
GET /api/streams
GET /api/streams?meetingId=meeting-123
```

#### Get Stream Details
```http
GET /api/streams/{streamId}
```

### Monitoring Endpoints

#### System Metrics
```http
GET /api/metrics
```

#### Health Status
```http
GET /api/health-monitor
```

### WebSocket Events

Connect to `/` for real-time updates:

```javascript
const socket = io('http://your-server:3001');

socket.on('stream-live', (data) => {
  console.log('Stream went live:', data);
});

socket.on('stream-ended', (data) => {
  console.log('Stream ended:', data);
});

socket.on('health-alert', (alert) => {
  console.log('Health alert:', alert);
});
```

## 🎯 Stream Protocols Comparison

| Feature | RTMP | SRT | WebRTC |
|---------|------|-----|---------|
| **Latency** | 3-10s | 0.5-2s | 0.1-0.5s |
| **Reliability** | High | Very High | High |
| **CPU Usage** | Low | Medium | High |
| **Compatibility** | Universal | OBS 28+ | Plugin Required |
| **Use Case** | Standard | Low Latency | Interactive |

## 📈 Monitoring & Analytics

### Grafana Dashboards
Access Grafana at `http://your-server:3000` (admin/admin):

- **System Overview**: Server performance and resource usage
- **Stream Quality**: Bitrate, FPS, and latency metrics
- **Network Performance**: Bandwidth usage and packet loss
- **Alert Status**: Active alerts and health indicators

### Prometheus Metrics
Metrics available at `http://your-server:9090`:

```
# Stream metrics
streams_active_total
streams_bitrate_bytes_per_second
streams_fps_total
streams_latency_milliseconds

# System metrics
system_cpu_usage_percent
system_memory_usage_bytes
system_network_bandwidth_bytes
```

### Health Monitoring
The system monitors:

- **Stream Quality**: Bitrate drops, FPS issues, resolution problems
- **Network Health**: Latency spikes, packet loss, connection drops
- **System Performance**: CPU usage, memory consumption, disk space
- **Service Availability**: Component health checks and uptime

## 🔐 Security

### Stream Authentication
- **JWT-based tokens**: Secure, stateless authentication
- **Expiring keys**: Automatic cleanup of old keys
- **Rate limiting**: Prevent abuse and DOS attacks
- **IP restrictions**: Optional whitelist functionality

### Network Security
- **SSL/TLS encryption**: Secure WebRTC connections
- **Firewall configuration**: Restrict access to necessary ports
- **VPN support**: Secure tunneling for sensitive streams
- **Audit logging**: Complete activity tracking

### Recommended Firewall Rules
```bash
# Allow HTTP/HTTPS
ufw allow 80/tcp
ufw allow 443/tcp

# Allow streaming protocols
ufw allow 1935/tcp  # RTMP
ufw allow 9998/udp  # SRT
ufw allow 8443/tcp  # WebRTC WHIP

# Allow monitoring (restrict to admin network)
ufw allow from 10.0.0.0/8 to any port 3000  # Grafana
ufw allow from 10.0.0.0/8 to any port 9090  # Prometheus
```

## 🚨 Troubleshooting

### Common Issues

#### RTMP Connection Failed
```bash
# Check RTMP server status
curl http://localhost:3001/health

# Test RTMP connectivity
ffmpeg -f lavfi -i testsrc -t 10 -f flv rtmp://localhost:1935/live/test-key
```

#### SRT High Latency
```bash
# Adjust SRT parameters
srt://server:9998?streamid=key&latency=120&maxbw=5000000

# Check network performance
ping -c 10 your-server
traceroute your-server
```

#### WebRTC WHIP Issues
```bash
# Verify SSL certificate
openssl s_client -connect your-server:8443 -servername your-domain

# Check WebRTC logs
docker-compose logs streaming-server | grep webrtc
```

### Performance Optimization

#### High CPU Usage
1. Enable hardware encoding in OBS
2. Reduce stream resolution/bitrate
3. Scale to multiple server instances
4. Use dedicated encoding hardware

#### Memory Issues
```bash
# Monitor memory usage
docker stats streaming-server

# Adjust Node.js memory limit
NODE_OPTIONS="--max-old-space-size=4096" npm start
```

#### Network Bottlenecks
1. Increase server bandwidth
2. Use CDN for stream distribution
3. Implement stream quality adaptation
4. Configure load balancing

## 🔄 Scaling

### Horizontal Scaling
```yaml
# docker-compose.yml
services:
  streaming-server:
    deploy:
      replicas: 3
    
  nginx:
    # Load balancer configuration
    depends_on:
      - streaming-server
```

### Load Balancing
Configure Nginx upstream:

```nginx
upstream streaming_servers {
    least_conn;
    server streaming-server-1:3001;
    server streaming-server-2:3001;
    server streaming-server-3:3001;
}
```

### Geographic Distribution
- Deploy servers in multiple regions
- Use DNS-based routing
- Implement stream replication
- Configure edge caching

## 📞 Support

### Getting Help
1. **Documentation**: Check this README and OBS configuration guide
2. **Logs**: Review application logs for error details
3. **Health Dashboard**: Monitor system status at `/dashboard`
4. **Community**: Join our Discord/Slack for support

### Reporting Issues
When reporting issues, include:
- Server logs from the time of the issue
- OBS configuration screenshots
- Network diagnostic information
- System specifications

### Performance Tuning
For optimal performance:
1. Use dedicated streaming servers
2. Configure appropriate bitrates for your bandwidth
3. Monitor system resources continuously
4. Implement proper error handling in streaming applications

---

## 📄 License

This project is licensed under the MIT License. See LICENSE file for details.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Submit a pull request

## 🙏 Acknowledgments

- **Node Media Server**: RTMP protocol implementation
- **MediaSoup**: WebRTC infrastructure
- **FFmpeg**: Audio/video processing
- **Socket.IO**: Real-time communication