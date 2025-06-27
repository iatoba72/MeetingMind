# OBS Studio Configuration Guide for MeetingMind Streaming Server

This guide provides detailed instructions for configuring OBS Studio to stream to the MeetingMind Streaming Server using different protocols: RTMP, SRT, and WebRTC WHIP.

## Prerequisites

1. **OBS Studio** version 28.0 or later
2. **Stream Key** generated from the MeetingMind dashboard
3. **Server IP/Domain** of your MeetingMind streaming server
4. **Network access** to the streaming server ports

## Protocol Overview

| Protocol | Latency | Reliability | Compatibility | Use Case |
|----------|---------|-------------|---------------|----------|
| RTMP | 3-10 seconds | High | Universal | Standard streaming |
| SRT | 0.5-2 seconds | Very High | OBS 28+ | Low-latency streaming |
| WebRTC WHIP | 0.1-0.5 seconds | High | Limited | Ultra-low latency |

---

## 1. RTMP Streaming Configuration

RTMP (Real-Time Messaging Protocol) is the most widely supported streaming protocol.

### Step 1: Configure Stream Settings

1. Open **OBS Studio**
2. Go to **Settings** → **Stream**
3. Set the following:
   - **Service**: Custom...
   - **Server**: `rtmp://your-server-ip:1935/live`
   - **Stream Key**: `your-stream-key`

### Step 2: Configure Output Settings

1. Go to **Settings** → **Output**
2. Set **Output Mode** to "Advanced"
3. **Streaming** tab settings:
   - **Audio Encoder**: AAC
   - **Rescale Output**: 1920x1080 (or desired resolution)
   - **Rate Control**: CBR (Constant Bitrate)
   - **Bitrate**: 2500-6000 Kbps (depending on upload speed)
   - **Keyframe Interval**: 2 seconds
   - **CPU Usage Preset**: veryfast to medium
   - **Profile**: main
   - **Tune**: zerolatency

### Step 3: Configure Video Settings

1. Go to **Settings** → **Video**
2. Set:
   - **Base Resolution**: 1920x1080
   - **Output Resolution**: 1920x1080 (or scaled down)
   - **Downscale Filter**: Bicubic
   - **FPS**: 30 or 60

### Step 4: Configure Audio Settings

1. Go to **Settings** → **Audio**
2. Set:
   - **Sample Rate**: 44.1 kHz
   - **Channels**: Stereo

### Example Configuration:
```
Server: rtmp://meetingmind.example.com:1935/live
Stream Key: abc123def456-meeting-room-1
Bitrate: 3500 Kbps
Resolution: 1920x1080
FPS: 30
Audio: 44.1kHz Stereo, 160 Kbps AAC
```

---

## 2. SRT Streaming Configuration

SRT (Secure Reliable Transport) provides low-latency streaming with error correction.

### Step 1: Install SRT Plugin (if needed)

OBS Studio 28+ has built-in SRT support. For older versions:
1. Download the SRT plugin from the OBS website
2. Install according to plugin instructions

### Step 2: Configure Stream Settings

1. Open **OBS Studio**
2. Go to **Settings** → **Stream**
3. Set the following:
   - **Service**: Custom...
   - **Server**: `srt://your-server-ip:9998?streamid=your-stream-key`
   - **Stream Key**: Leave empty (included in server URL)

### Step 3: Advanced SRT Configuration

For optimal SRT performance, add these parameters to the server URL:

```
srt://your-server-ip:9998?streamid=your-stream-key&latency=120&maxbw=10000000&pbkeylen=16
```

Parameters explained:
- `streamid`: Your stream authentication key
- `latency`: Buffer size in milliseconds (120ms recommended)
- `maxbw`: Maximum bandwidth in bytes per second
- `pbkeylen`: Encryption key length (16 or 32)

### Step 4: Output Settings for SRT

1. Go to **Settings** → **Output**
2. **Streaming** tab settings:
   - **Rate Control**: CBR
   - **Bitrate**: 1500-5000 Kbps
   - **Keyframe Interval**: 1 second (for low latency)
   - **CPU Usage Preset**: ultrafast to veryfast
   - **Tune**: zerolatency
   - **x264 Options**: `bframes=0:force-cfr=1:no-mbtree=1`

### Example Configuration:
```
Server: srt://meetingmind.example.com:9998?streamid=abc123def456-meeting-room-1&latency=120
Bitrate: 2500 Kbps
Keyframe Interval: 1 second
Preset: veryfast
Tune: zerolatency
```

---

## 3. WebRTC WHIP Configuration

WebRTC WHIP (WebRTC-HTTP Ingestion Protocol) offers the lowest latency but requires specific setup.

### Step 1: Install WHIP Plugin

1. Download the OBS WebRTC plugin from: https://github.com/CoSMoSoftware/OBS-studio-webrtc
2. Install the plugin following the provided instructions
3. Restart OBS Studio

### Step 2: Configure WebRTC Output

1. In OBS, go to **Settings** → **Output**
2. Select **WebRTC** as output type
3. Set the following:
   - **WHIP Endpoint**: `https://your-server-ip:8443/whip/meeting-room-1`
   - **Bearer Token**: `your-stream-key`
   - **Video Bitrate**: 1000-3000 Kbps
   - **Audio Bitrate**: 128-256 Kbps

### Step 3: WebRTC Specific Settings

1. **Video Settings**:
   - **Resolution**: 1280x720 or 1920x1080
   - **FPS**: 30 (WebRTC optimized)
   - **Codec**: VP8 or H.264

2. **Audio Settings**:
   - **Codec**: Opus
   - **Sample Rate**: 48 kHz
   - **Channels**: Stereo

### Example Configuration:
```
WHIP Endpoint: https://meetingmind.example.com:8443/whip/meeting-room-1
Bearer Token: abc123def456-meeting-room-1
Video Codec: H.264
Video Bitrate: 2000 Kbps
Audio Codec: Opus
Audio Bitrate: 128 Kbps
```

---

## 4. Quality Optimization Settings

### For High Quality Streaming:
```
Resolution: 1920x1080
FPS: 60
Bitrate: 6000-8000 Kbps
Encoder: Hardware (NVENC/AMF) if available
Preset: Quality
```

### For Low Latency Streaming:
```
Resolution: 1280x720
FPS: 30
Bitrate: 2500-4000 Kbps
Keyframe Interval: 1 second
Encoder Preset: ultrafast
Tune: zerolatency
B-frames: 0
```

### For Bandwidth-Constrained Networks:
```
Resolution: 1280x720
FPS: 30
Bitrate: 1500-2500 Kbps
Encoder Preset: veryfast
Rate Control: CBR
```

---

## 5. Advanced Configuration

### Hardware Encoding Settings

#### NVIDIA NVENC:
```
Encoder: NVENC H.264
Rate Control: CBR
Bitrate: 3500 Kbps
Max Quality: Enabled
Two-Pass Encoding: Enabled
GPU: 0 (Primary GPU)
Max B-frames: 2
```

#### AMD AMF:
```
Encoder: AMD HW H.264
Rate Control: CBR
Bitrate: 3500 Kbps
Quality Preset: Quality
Profile: High
```

#### Intel QuickSync:
```
Encoder: QuickSync H.264
Rate Control: CBR
Bitrate: 3500 Kbps
Target Usage: Quality
Profile: High
```

### Audio Configuration

#### High Quality Audio:
```
Sample Rate: 48 kHz
Bitrate: 320 Kbps
Encoder: AAC
Channels: Stereo
```

#### Low Latency Audio:
```
Sample Rate: 44.1 kHz
Bitrate: 128 Kbps
Encoder: AAC
Channels: Stereo
```

---

## 6. Troubleshooting

### Common Issues and Solutions

#### Stream Not Connecting:
1. Verify server URL and port accessibility
2. Check firewall settings
3. Confirm stream key validity
4. Test with a basic RTMP configuration first

#### High Latency:
1. Use SRT or WebRTC protocols
2. Reduce keyframe interval to 1 second
3. Enable zero-latency tuning
4. Disable B-frames
5. Use hardware encoding if available

#### Poor Quality:
1. Increase bitrate (if bandwidth allows)
2. Use hardware encoding
3. Adjust encoder preset to slower settings
4. Increase resolution if CPU/GPU can handle it

#### Audio Issues:
1. Check audio sample rate matches server expectations
2. Verify audio codec compatibility
3. Test with different audio bitrates
4. Ensure audio sources are configured correctly

#### Connection Drops:
1. Use SRT protocol for better reliability
2. Check network stability
3. Implement automatic reconnection
4. Monitor bandwidth usage

### Network Requirements

#### Minimum Requirements:
- **Upload Speed**: 3x your streaming bitrate
- **Latency**: < 100ms to server
- **Packet Loss**: < 0.1%

#### Recommended Requirements:
- **Upload Speed**: 5x your streaming bitrate
- **Latency**: < 50ms to server
- **Packet Loss**: < 0.01%

---

## 7. Testing and Validation

### Pre-Stream Checklist:
1. ✅ Stream key is valid and not expired
2. ✅ Server is accessible on the configured port
3. ✅ OBS shows "Connected" status
4. ✅ Video and audio sources are configured
5. ✅ Bandwidth test shows adequate upload speed
6. ✅ Dashboard shows stream as "Live"

### Performance Monitoring:
1. Monitor **Dropped Frames** in OBS stats
2. Check **Network** indicator for issues
3. Use MeetingMind dashboard for stream health
4. Monitor **CPU/GPU** usage during stream

### Quality Validation:
1. Test stream with different devices
2. Verify audio/video sync
3. Check for artifacts or pixelation
4. Validate latency measurements

---

## 8. Protocol Selection Guide

### Choose RTMP when:
- Maximum compatibility is needed
- Streaming to multiple platforms
- Standard latency requirements (3-10 seconds)
- Using older OBS versions

### Choose SRT when:
- Low latency is required (0.5-2 seconds)
- Network reliability is a concern
- Professional streaming setup
- OBS 28+ is available

### Choose WebRTC WHIP when:
- Ultra-low latency is critical (< 0.5 seconds)
- Interactive streaming scenarios
- Browser-based viewers
- Willing to use experimental features

---

## 9. Security Considerations

### Stream Key Security:
- Never share stream keys publicly
- Regenerate keys regularly
- Use HTTPS for WebRTC endpoints
- Monitor unauthorized access attempts

### Network Security:
- Use VPN for sensitive streams
- Enable SSL/TLS where supported
- Restrict server access by IP if possible
- Monitor stream access logs

---

## 10. Support and Resources

### Getting Help:
1. Check MeetingMind dashboard for error messages
2. Review OBS log files for detailed errors
3. Test with basic RTMP configuration first
4. Contact system administrator for server issues

### Useful OBS Hotkeys:
- **Start/Stop Streaming**: Configurable
- **Start/Stop Recording**: Configurable
- **Scene Switching**: F1-F12
- **Audio Mute**: Configurable per source

### Performance Tips:
1. Close unnecessary applications
2. Use dedicated streaming PC if possible
3. Monitor system resources during stream
4. Keep OBS and plugins updated
5. Use wired network connection when possible

---

This configuration guide should enable successful streaming to the MeetingMind Streaming Server using any of the supported protocols. For the best experience, start with RTMP for compatibility, then move to SRT for low latency, or WebRTC WHIP for ultra-low latency scenarios.