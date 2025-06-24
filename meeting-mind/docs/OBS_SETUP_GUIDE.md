# MeetingMind OBS Setup Guide

Complete guide for configuring OBS Studio with MeetingMind for professional meeting streaming and recording.

## 📋 Table of Contents

1. [Quick Start](#quick-start)
2. [OBS WebSocket Setup](#obs-websocket-setup)
3. [Audio Configuration](#audio-configuration)
4. [Multi-PC Audio Setup](#multi-pc-audio-setup)
5. [Network Optimization](#network-optimization)
6. [Scene Collections](#scene-collections)
7. [Advanced Settings](#advanced-settings)
8. [Troubleshooting](#troubleshooting)

## 🚀 Quick Start

### Prerequisites
- **OBS Studio 28.0+** (required for WebSocket support)
- **MeetingMind Server** running on your network
- **Sufficient System Resources**:
  - CPU: 4+ cores (8+ recommended)
  - RAM: 8GB minimum (16GB+ recommended)
  - GPU: Hardware encoder support (NVIDIA/AMD/Intel)
  - Network: 10+ Mbps upload bandwidth

### Basic Setup Steps

1. **Install OBS Studio**
   ```bash
   # Windows: Download from obsproject.com
   # macOS: Download from obsproject.com or use Homebrew
   brew install --cask obs
   
   # Linux (Ubuntu/Debian)
   sudo apt install obs-studio
   ```

2. **Enable WebSocket Server**
   - Open OBS Studio
   - Go to `Tools → WebSocket Server Settings`
   - Check "Enable WebSocket server"
   - Set port to `4455` (default)
   - Set a secure password
   - Click "Apply" and "OK"

3. **Install MeetingMind Plugin** (Optional but recommended)
   - Download from releases page
   - Extract to OBS plugins folder:
     - Windows: `C:\Program Files\obs-studio\obs-plugins\64bit\`
     - macOS: `/Applications/OBS.app/Contents/PlugIns/`
     - Linux: `~/.config/obs-studio/plugins/`

4. **Run Setup Wizard**
   - Open MeetingMind web interface
   - Navigate to Settings → OBS Integration
   - Click "Setup Wizard"
   - Follow the guided configuration

## 🔌 OBS WebSocket Setup

### Manual Configuration

1. **WebSocket Server Settings**
   ```
   Host: localhost (or your OBS machine IP)
   Port: 4455
   Password: [your-secure-password]
   ```

2. **Connection Testing**
   ```bash
   # Test WebSocket connection
   curl -i -N -H "Connection: Upgrade" \
        -H "Upgrade: websocket" \
        -H "Host: localhost:4455" \
        -H "Origin: http://localhost" \
        ws://localhost:4455
   ```

3. **Authentication Setup**
   - Generate secure password: `openssl rand -base64 32`
   - Store in MeetingMind configuration
   - Test connection in Setup Wizard

### Firewall Configuration

```bash
# Windows Firewall
netsh advfirewall firewall add rule name="OBS WebSocket" dir=in action=allow protocol=TCP localport=4455

# Linux UFW
sudo ufw allow 4455/tcp

# macOS (add to /etc/pf.conf)
pass in proto tcp from any to any port 4455
```

## 🎵 Audio Configuration

### Single PC Setup

#### 1. Audio Sources Configuration

**Microphone Setup:**
```
Source Type: Audio Input Capture
Device: Your microphone
Filters:
  - Noise Suppression (RNNoise or Speex)
  - Gain (+3 to +10 dB as needed)
  - Compressor (Ratio: 4:1, Threshold: -18dB)
  - Limiter (Threshold: -6dB, Release: 60ms)
```

**Desktop Audio Setup:**
```
Source Type: Audio Output Capture  
Device: Default Desktop Audio
Filters:
  - Gain (-10 to -20 dB to balance with mic)
  - High-pass Filter (80Hz to remove low rumble)
```

**Meeting Audio Setup:**
```
Source Type: Audio Input Capture
Device: Virtual Audio Cable (see below)
Purpose: Capture meeting participants' audio
```

#### 2. Virtual Audio Cable Setup

**Windows - VB-Cable:**
```bash
# Download VB-Cable from vb-audio.com
# Install and restart
# In Windows Sound Settings:
#   Set VB-Cable Input as meeting app output
#   Set VB-Cable Output as OBS input source
```

**macOS - BlackHole:**
```bash
# Install BlackHole
brew install blackhole-2ch

# Create Multi-Output Device in Audio MIDI Setup:
# 1. Open Audio MIDI Setup
# 2. Create Multi-Output Device
# 3. Add Built-in Output + BlackHole 2ch
# 4. Use Multi-Output as system output
# 5. Use BlackHole 2ch as OBS input
```

**Linux - PulseAudio:**
```bash
# Create virtual sink
pacmd load-module module-null-sink sink_name=virtual_sink sink_properties=device.description=Virtual_Sink

# Create loopback to speakers
pacmd load-module module-loopback source=virtual_sink.monitor sink=alsa_output.pci-0000_00_1f.3.analog-stereo

# In OBS, use virtual_sink.monitor as audio source
```

#### 3. Audio Routing Diagram

```
┌─────────────┐    ┌──────────────┐    ┌─────────────┐
│ Microphone  │────┤ OBS Mic      │────┤ Stream Mix  │
└─────────────┘    │ Input        │    │             │
                   └──────────────┘    │             │
┌─────────────┐    ┌──────────────┐    │             │
│ Desktop     │────┤ OBS Desktop  │────┤             │
│ Audio       │    │ Audio        │    │             │
└─────────────┘    └──────────────┘    │             │
                                       │             │
┌─────────────┐    ┌──────────────┐    │             │
│ Meeting     │────┤ Virtual      │────┤             │
│ App Audio   │    │ Cable/OBS    │    │             │
└─────────────┘    └──────────────┘    └─────────────┘
```

### Audio Monitoring Setup

```
OBS Audio Mixer Settings:
├── Microphone
│   ├── Monitor: Monitor Off (to avoid feedback)
│   └── Volume: -6dB to -12dB
├── Desktop Audio  
│   ├── Monitor: Monitor and Output
│   └── Volume: -20dB to -30dB
└── Meeting Audio
    ├── Monitor: Monitor and Output
    └── Volume: -6dB to -12dB
```

## 🖥️ Multi-PC Audio Setup

### Two-PC Streaming Setup

#### Primary PC (Meeting/Gaming)
- Runs meeting software
- Sends audio to secondary PC
- No OBS running

#### Secondary PC (Streaming)
- Runs OBS Studio
- Captures audio from primary PC
- Handles encoding and streaming

### Hardware Requirements

**Audio Interface Method:**
```
Equipment Needed:
- Audio interface with multiple inputs (Focusrite Scarlett, PreSonus, etc.)
- 3.5mm to XLR/TRS cables
- Audio monitoring headphones

Connection:
Primary PC Line Out → Audio Interface Input 1
Microphone → Audio Interface Input 2
Audio Interface USB → Secondary PC
```

**Network Audio Method:**
```bash
# Install VoiceMeeter on Primary PC
# Download from vb-audio.com

# Configure VoiceMeeter:
# Hardware Input 1: Microphone
# Hardware Input 2: Meeting App (via Virtual Cable)
# Hardware Out A1: Speakers/Headphones
# Virtual Output: Network stream to secondary PC

# On Secondary PC:
# Install VoiceMeeter or use network audio receiver
# Route received audio to OBS
```

### Network Audio Streaming

**Using NDI (Recommended):**
```bash
# Primary PC - Install NDI Tools
# Configure NDI Audio Direct to stream system audio

# Secondary PC - OBS NDI Plugin
# Add NDI Source in OBS
# Select Primary PC NDI audio stream
```

**Using Dante Via:**
```bash
# Commercial solution for low-latency audio over network
# Install Dante Via on both PCs
# Route audio channels between machines
# Professional grade with redundancy
```

## 🌐 Network Optimization

### Local Network Setup

#### Ethernet Configuration (Recommended)
```bash
# Use gigabit ethernet for best performance
# Avoid WiFi for streaming PC if possible

# Windows Network Optimization
netsh int tcp set global autotuninglevel=normal
netsh int tcp set global chimney=enabled
netsh int tcp set global rss=enabled

# Linux Network Optimization  
echo 'net.core.rmem_max = 134217728' >> /etc/sysctl.conf
echo 'net.core.wmem_max = 134217728' >> /etc/sysctl.conf
echo 'net.ipv4.tcp_rmem = 4096 87380 134217728' >> /etc/sysctl.conf
sysctl -p
```

#### Quality of Service (QoS)
```
Router QoS Settings:
├── Streaming PC: Highest Priority
├── Gaming/Meeting PC: High Priority  
├── Video Traffic: High Priority
├── Audio Traffic: Highest Priority
└── Other Devices: Normal Priority

Bandwidth Allocation:
├── Upload: Reserve 80% for streaming
├── Download: Reserve 50% for meeting apps
└── Buffer: 20% for overhead and spikes
```

### Internet Connection Optimization

#### Upload Speed Requirements
```
Meeting Quality Settings:
├── 720p30 @ 2.5 Mbps: 5+ Mbps upload needed
├── 1080p30 @ 4.5 Mbps: 8+ Mbps upload needed  
├── 1080p60 @ 6 Mbps: 10+ Mbps upload needed
└── 4K30 @ 15 Mbps: 25+ Mbps upload needed

Recommended: 2x your streaming bitrate for overhead
```

#### Network Testing
```bash
# Test upload speed
speedtest-cli --upload-only

# Test latency and jitter
ping -c 100 8.8.8.8

# Test packet loss
mtr --report --report-cycles 100 google.com

# OBS Network Test
# Use OBS Stats dock to monitor:
# - Skipped frames due to encoding lag
# - Dropped frames due to network issues  
# - Connection health indicators
```

### Network Hardware Recommendations

**Router Requirements:**
- Gigabit ethernet ports
- QoS/Traffic shaping support
- Dual-band WiFi 6 (for wireless devices)
- Gaming/streaming optimized firmware

**Switch Configuration:**
```
Managed Switch Benefits:
├── VLAN separation for streaming traffic
├── Port prioritization 
├── Bandwidth monitoring
├── Multicast optimization for NDI
└── Link aggregation for high bandwidth
```

## 🎬 Scene Collections

### Meeting Scene Templates

#### 1. Professional Discussion Scene Collection

**Scene 1: Pre-Meeting**
```
Sources:
├── Webcam (Center, 1280x720)
├── Welcome Overlay (Text/Image)
├── Background Music (Low volume)
├── Company Logo (Corner)
└── "Starting Soon" Timer

Transitions: Fade (300ms)
Hotkey: F1
```

**Scene 2: Main Discussion**
```
Sources:
├── Webcam (Corner, 320x240)
├── Screen Share (Main, 1600x900)
├── Microphone Audio
├── Meeting Audio (Participants)
├── Lower Third (Name/Title)
└── Mute Indicator

Transitions: Cut (0ms)
Hotkey: F2
```

**Scene 3: Full Camera**
```
Sources:
├── Webcam (Full screen, 1920x1080)
├── Background (Virtual or physical)
├── Microphone Audio
├── Frame/Border overlay
└── Meeting Audio

Transitions: Slide (500ms)
Hotkey: F3
```

**Scene 4: Screen Share Focus**
```
Sources:
├── Screen Capture (Full, 1920x1080)
├── Webcam (Small corner, 240x180)
├── System Audio
├── Microphone Audio (Push-to-talk)
└── Recording Indicator

Transitions: Fade (200ms)
Hotkey: F4
```

#### 2. Presentation Scene Collection

**Scene 1: Title Slide**
```
Sources:
├── Presentation Capture (Main)
├── Webcam (Side panel, 480x360)
├── Company Branding
├── Session Title Overlay
└── Speaker Information

Layout: Side-by-side
Transition: Fade (400ms)
```

**Scene 2: Content Slides**
```
Sources:
├── Presentation Capture (80% width)
├── Webcam (20% width, right side)
├── Slide Progress Indicator
├── QR Code for Resources
└── Audio sources

Layout: Presenter + Content
Transition: Cut (0ms)
```

**Scene 3: Demonstration**
```
Sources:
├── Application Capture (Main)
├── Webcam (Picture-in-Picture)
├── Cursor Highlight
├── Keystroke Display
└── Timer (for demos)

Layout: Demo-focused
Transition: Slide (300ms)
```

#### 3. Webinar Scene Collection

**Scene 1: Countdown**
```
Sources:
├── Countdown Timer (Center)
├── Event Branding
├── Background Music
├── Social Media Links
├── Agenda Preview
└── Registration Info

Duration: 5-10 minutes
Auto-transition: To welcome scene
```

**Scene 2: Welcome & Intro**
```
Sources:
├── Host Webcam (Center)
├── Event Title Overlay
├── Speaker Introductions
├── Agenda Slides
└── Sponsor Logos

Duration: 5 minutes
Hotkey: Ctrl+1
```

**Scene 3: Main Content**
```
Sources:
├── Content Screen (70%)
├── Host Camera (30%)
├── Progress Bar
├── Time Remaining
├── Q&A Submit Info
└── Emergency Contact

Primary scene for presentation
Hotkey: Ctrl+2
```

**Scene 4: Q&A Session**
```
Sources:
├── Host Camera (Main)
├── Question Display Overlay
├── Participant Video (if enabled)
├── Chat/Questions Feed
├── Moderator Tools
└── Timer for questions

Interactive segment
Hotkey: Ctrl+3
```

**Scene 5: Closing/Thank You**
```
Sources:
├── Thank you message
├── Contact Information
├── Next Event Promotion
├── Social Media CTAs
├── Recording Availability
└── Survey Links

Final scene
Auto-transition: After 2 minutes
```

### Scene Automation Scripts

#### AutoHotkey Script (Windows)
```autohotkey
; OBS Scene Switching for Meetings
#IfWinActive ahk_exe obs64.exe

; Meeting scenes
F1::Send ^1  ; Pre-meeting
F2::Send ^2  ; Discussion
F3::Send ^3  ; Full camera
F4::Send ^4  ; Screen share

; Quick actions
F5::Send ^m  ; Mute microphone
F6::Send ^h  ; Hide/show webcam
F7::Send ^r  ; Start/stop recording
F8::Send ^s  ; Start/stop streaming

; Push-to-talk
Space::
    Send ^t  ; Toggle mute
    KeyWait Space
    Send ^t  ; Toggle mute again
return
```

#### OBS Studio Hotkeys Configuration
```
Scene Switching:
├── Scene 1 (Welcome): Ctrl+1
├── Scene 2 (Main): Ctrl+2  
├── Scene 3 (Break): Ctrl+3
├── Scene 4 (Q&A): Ctrl+4
└── Scene 5 (End): Ctrl+5

Audio Control:
├── Mute Microphone: Ctrl+M
├── Push-to-Talk: Space (hold)
├── Desktop Audio Mute: Ctrl+D
└── Master Volume Down/Up: Ctrl+- / Ctrl+=

Recording/Streaming:
├── Start/Stop Recording: Ctrl+R
├── Start/Stop Streaming: Ctrl+S
├── Pause Recording: Ctrl+P
└── Screenshot: Ctrl+Shift+S

Source Control:
├── Toggle Webcam: Ctrl+W
├── Toggle Screen Capture: Ctrl+Shift+C
├── Refresh Browser Source: Ctrl+F5
└── Studio Mode: Ctrl+Shift+T
```

## ⚙️ Advanced Settings

### Encoder Optimization

#### Hardware Encoders

**NVIDIA NVENC (RTX/GTX series):**
```
Encoder Settings:
├── Rate Control: CBR (Constant Bitrate)
├── Bitrate: Based on upload speed
├── Keyframe Interval: 2 seconds
├── Preset: Quality (for RTX) or Performance (for GTX)
├── Profile: High
├── Look-ahead: Enabled (RTX only)
├── Psycho Visual Tuning: Enabled
└── GPU: 0 (or specific GPU index)

Advanced Options:
├── B-frames: 2 (RTX cards)
├── Adaptive Quantization: Enabled  
├── Maximum B-frames: 2
└── Multipass: Quarter Resolution (RTX 40 series)
```

**AMD VCE/VCN:**
```
Encoder Settings:
├── Rate Control: CBR
├── Target Bitrate: Upload speed * 0.8
├── Peak Bitrate: Target * 1.2
├── Keyframe Interval: 2s
├── Preset: Quality
├── Profile: Main or High
├── Tier: Main
└── Filler Data: Enabled

Quality Settings:
├── QP: 20-23 for quality, 25-28 for performance
├── Lookahead: Enabled
├── Temporal AQ: Enabled
└── Spatial AQ: Enabled
```

**Intel QuickSync (QSV):**
```
Encoder Settings:
├── Target Usage: Quality (TU4) or Balanced (TU7)
├── Rate Control: CBR  
├── Bitrate: Target streaming bitrate
├── Max Bitrate: Target * 1.5
├── ICQ Quality: 20-25
├── Keyframe Interval: 2s
├── Async Depth: 4
└── B-Frames: 3

Advanced:
├── Low Latency: Enabled for streaming
├── Rate Distortion Optimization: Enabled
├── Adaptive I/B frames: Enabled
└── Weighthed Prediction: Enabled
```

#### Software Encoder (x264)

**High Quality Settings:**
```
Encoder: x264
Rate Control: CBR
Bitrate: Target upload * 0.8
Keyframe Interval: 2s
CPU Usage Preset: veryfast to medium
Profile: main
Tune: zerolatency (for streaming)

Advanced:
├── x264 Options: bframes=0 for lowest latency
├── Threads: CPU cores - 2
├── Lookahead: 40 frames
└── Psychovisual Tuning: Enabled
```

### Recording Settings

#### High Quality Recording
```
Recording Format: mp4
Recording Quality: Indistinguishable Quality, Large File Size
Recording Encoder: Use stream encoder or separate
Recording Path: Fast SSD with ample space

Video Settings:
├── Container: MP4 (widely compatible)
├── Video Encoder: x264 or hardware encoder
├── Rate Control: CRF (Constant Rate Factor)
├── CRF Value: 15-20 (lower = higher quality)
├── Preset: slow to medium (for x264)
└── Audio: 320kbps AAC or lossless FLAC

Alternative High Quality:
├── Container: MKV (recording) → MP4 (remux)
├── Video: CQP/CRF 15-18
├── Audio: 48kHz 320kbps AAC
└── Separate tracks for each audio source
```

### Audio Advanced Configuration

#### Professional Audio Chain
```
Signal Flow:
Microphone → Audio Interface → OBS → Processing

OBS Audio Filters (in order):
1. Noise Gate
   ├── Close Threshold: -40dB
   ├── Open Threshold: -35dB  
   ├── Attack Time: 25ms
   ├── Hold Time: 200ms
   └── Release Time: 150ms

2. Noise Suppression
   ├── Method: RNNoise (AI-based)
   ├── Suppression Level: -30dB
   └── Alternative: Speex (-20dB)

3. EQ (if needed)
   ├── High-pass: 80Hz (remove low rumble)
   ├── Presence boost: +3dB at 3kHz
   └── De-ess: -2dB at 6-8kHz if sibilant

4. Compressor
   ├── Ratio: 3:1 to 4:1
   ├── Threshold: -18dB to -15dB
   ├── Attack: 6ms
   ├── Release: 60ms
   └── Makeup Gain: As needed

5. Limiter (final stage)
   ├── Threshold: -6dB to -3dB
   ├── Release: 60ms
   └── Prevents clipping/distortion
```

#### Audio Monitoring Setup
```
Monitoring Configuration:
├── Main Mix: Monitor and Output
├── Microphone: Monitor Off (avoid feedback)
├── Desktop Audio: Monitor and Output  
├── Meeting Audio: Monitor and Output
└── Music/SFX: Monitor Only (for cueing)

Hardware Monitoring:
├── Audio interface direct monitoring for microphone
├── Software monitoring for processed audio
├── Separate headphone mix for presenter
└── Confidence monitoring for participants
```

## 🔧 Troubleshooting

### Common Issues and Solutions

#### 1. High CPU Usage
```
Symptoms: Encoding lag, dropped frames, system slowdown

Solutions:
├── Lower video resolution (1080p → 720p)
├── Reduce frame rate (60fps → 30fps)
├── Use hardware encoder instead of x264
├── Close unnecessary programs
├── Increase process priority for OBS
├── Check for background Windows updates
└── Disable Windows Game Mode

OBS Settings to Reduce CPU:
├── Video → Downscale Filter: Bilinear (fastest)
├── Video → Common FPS: 30 instead of 60
├── Advanced → Process Priority: High
└── Advanced → Color Format: NV12
```

#### 2. Audio Issues

**Audio Out of Sync:**
```
Causes and Fixes:
├── Audio buffering: Reduce buffer size in audio settings
├── USB audio devices: Use dedicated audio interface
├── Multiple monitoring: Disable unnecessary monitoring
├── Audio filters: Remove heavy processing filters
└── Sample rate mismatch: Use consistent 48kHz

Sync Adjustment:
├── Advanced Audio Properties → Sync Offset
├── Test with clapping or countdown
├── Adjust in +/- 25ms increments
└── Different offset may be needed for recording vs streaming
```

**Audio Crackling/Dropouts:**
```
Solutions:
├── Increase audio buffer size (512 or 1024 samples)
├── Use USB 3.0 ports for audio interfaces
├── Disable USB power management
├── Update audio drivers  
├── Close other audio applications
├── Check for ground loops (use DI boxes)
└── Ensure consistent sample rates across all devices
```

#### 3. Network/Streaming Issues

**Connection Unstable:**
```
Diagnostics:
├── OBS Stats → Dropped frames %
├── Network test: speedtest-cli
├── Ping test: ping -c 100 streaming-server
├── Check QoS settings on router
└── Monitor bandwidth usage

Fixes:
├── Reduce bitrate by 20-30%
├── Enable CBR (Constant Bitrate)
├── Use ethernet instead of WiFi
├── Check for bandwidth-heavy applications
├── Contact ISP about upload stability
└── Use streaming server closer to your location
```

**Frame Drops:**
```
Types and Solutions:

Encoding Lag (Red):
├── High CPU usage → Use hardware encoder
├── Complex scenes → Simplify overlays/filters
├── Wrong encoder settings → Reduce quality preset
└── Insufficient processing power → Upgrade hardware

Network Issues (Orange/Yellow):
├── Insufficient upload → Reduce bitrate
├── Network congestion → Use QoS/traffic shaping
├── ISP throttling → Contact provider
└── WiFi interference → Use ethernet

Rendering Lag (Blue):
├── GPU overload → Lower resolution/fps
├── Complex sources → Optimize scene composition
├── Driver issues → Update graphics drivers
└── Multiple monitors → Disable hardware acceleration in browsers
```

#### 4. Hardware-Specific Issues

**NVIDIA GPU Problems:**
```
NVENC Not Available:
├── Update GPU drivers to latest
├── Enable GPU scheduling in Windows
├── Restart NVENC service
├── Check OBS log for NVENC errors
└── Try different NVENC preset

NVENC Quality Issues:
├── Lower preset for quality (Quality > Performance)
├── Enable Look-ahead (RTX cards only)
├── Adjust Psycho Visual Tuning
├── Check bitrate allocation
└── Consider two-pass encoding for recording
```

**AMD GPU Problems:**
```
VCE/VCN Issues:
├── Update AMD drivers (Adrenalin software)
├── Enable GPU scheduling
├── Check OBS log for VCE errors
├── Try different rate control modes
└── Adjust quality settings

Performance Optimization:
├── Use AMF encoder instead of VCE for newer cards
├── Enable spatial/temporal AQ
├── Adjust pre-analysis settings
├── Monitor GPU memory usage
└── Check for memory overclocking stability
```

### Performance Monitoring

#### OBS Stats to Monitor
```
Stats Dock Information:
├── CPU Usage: <80% recommended
├── Memory Usage: <70% of available RAM
├── Dropped Frames: <0.5% acceptable
├── Skipped Frames: <0.1% target
├── Render Lag: <5ms ideal
├── Stream Health: Green preferred
└── Disk Space: >10GB free for recording

External Monitoring:
├── Task Manager: Monitor OBS process
├── GPU-Z: Graphics card utilization  
├── HWiNFO64: Comprehensive system monitoring
├── Process Monitor: File/registry access
└── Windows Performance Toolkit: Advanced analysis
```

#### Logging and Diagnostics
```bash
# Enable OBS verbose logging
# Help → Log Files → Upload Current Log File

# Analyze logs for:
# - Hardware encoder initialization
# - Audio device conflicts  
# - Network connectivity issues
# - Plugin loading problems
# - Performance bottlenecks

# Windows Event Viewer
# Check Application logs for OBS crashes
# Look for hardware errors
# Monitor system stability during streaming
```

### Emergency Procedures

#### Stream Recovery
```
Connection Lost:
1. Check OBS connection status
2. Verify internet connectivity  
3. Restart streaming with backup settings
4. Switch to backup internet (mobile hotspot)
5. Notify audience via chat/email
6. Continue recording locally

Audio Failure:
1. Check audio source connections
2. Restart audio service in OBS
3. Switch to backup microphone
4. Use push-to-talk if possible
5. Continue with text chat backup
6. Fix audio during break if available

Video Failure:
1. Switch to audio-only mode
2. Use static image or slides
3. Continue presentation without video
4. Fix during natural break
5. Restart OBS if necessary
6. Have backup camera ready
```

#### Backup Configurations
```
Maintain Multiple Profiles:
├── High Quality (primary)
├── Medium Quality (backup)
├── Low Latency (emergency)
├── Audio Only (contingency)
└── Recovery (minimal settings)

Scene Collections:
├── Primary presentation setup
├── Simplified backup setup  
├── Audio-only scenes
├── Emergency static scenes
└── Test/calibration scenes

Export/Backup:
├── Regular profile exports
├── Scene collection backups
├── Settings documentation
├── Hardware configuration notes
└── Contact information for support
```

---

## 📞 Support Resources

### Documentation Links
- [OBS Studio Documentation](https://obsproject.com/wiki/)
- [OBS WebSocket Protocol](https://github.com/obsproject/obs-websocket)
- [MeetingMind API Documentation](./API_REFERENCE.md)

### Community Support  
- [OBS Project Forums](https://obsproject.com/forum/)
- [MeetingMind Discord](https://discord.gg/meetingmind)
- [Reddit /r/obs](https://reddit.com/r/obs)

### Professional Support
- Hardware recommendations and purchasing
- Custom configuration and optimization
- On-site setup and training
- 24/7 technical support for enterprise customers

---

*Last updated: [Current Date]*
*Version: 1.0.0*