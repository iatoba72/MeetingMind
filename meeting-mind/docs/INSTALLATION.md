# MeetingMind Installation Guide

Complete installation instructions for MeetingMind across all supported platforms.

## Quick Start

### Desktop Application (Recommended)

The easiest way to get started with MeetingMind is to download the desktop application:

1. **Download**: Visit [releases page](https://github.com/meetingmind/desktop/releases/latest)
2. **Install**: Follow platform-specific instructions below
3. **Launch**: Start MeetingMind from your applications menu

### Web Application

Access MeetingMind directly in your browser at: `https://app.meetingmind.com`

## Platform-Specific Installation

### Windows

#### Option 1: Installer (Recommended)
1. Download `MeetingMind-Setup-*.exe` from the releases page
2. Run the installer as Administrator
3. Follow the installation wizard
4. Launch MeetingMind from Start Menu or Desktop shortcut

#### Option 2: Portable Version
1. Download `MeetingMind-*-win.exe`
2. Run directly - no installation required
3. Create shortcut if desired

#### System Requirements
- Windows 10 or later (64-bit)
- 4 GB RAM minimum, 8 GB recommended
- 500 MB disk space
- Microphone and camera (for video meetings)

### macOS

#### Option 1: DMG Package (Recommended)
1. Download `MeetingMind-*.dmg` from the releases page
2. Open the DMG file
3. Drag MeetingMind to Applications folder
4. Launch from Applications or Spotlight

#### Option 2: ZIP Archive
1. Download `MeetingMind-*-mac.zip`
2. Extract the archive
3. Move MeetingMind.app to Applications folder
4. Launch from Applications

#### Security Note
On first launch, you may see a security warning. To resolve:
1. Go to System Preferences → Security & Privacy
2. Click "Open Anyway" for MeetingMind
3. Alternatively, right-click the app and select "Open"

#### System Requirements
- macOS 10.15 (Catalina) or later
- 4 GB RAM minimum, 8 GB recommended
- 500 MB disk space
- Microphone and camera (for video meetings)

### Linux

#### Option 1: AppImage (Universal)
1. Download `MeetingMind-*.AppImage`
2. Make it executable: `chmod +x MeetingMind-*.AppImage`
3. Run directly: `./MeetingMind-*.AppImage`

#### Option 2: Debian/Ubuntu (.deb)
```bash
# Download the .deb package
wget https://github.com/meetingmind/desktop/releases/latest/download/meetingmind_*_amd64.deb

# Install
sudo dpkg -i meetingmind_*_amd64.deb

# Fix dependencies if needed
sudo apt-get install -f

# Launch
meetingmind
```

#### Option 3: RedHat/Fedora (.rpm)
```bash
# Download the .rpm package
wget https://github.com/meetingmind/desktop/releases/latest/download/meetingmind-*.x86_64.rpm

# Install (Fedora)
sudo dnf install meetingmind-*.x86_64.rpm

# Install (RHEL/CentOS)
sudo yum install meetingmind-*.x86_64.rpm

# Launch
meetingmind
```

#### System Requirements
- Modern Linux distribution (Ubuntu 18.04+, Fedora 30+, etc.)
- 4 GB RAM minimum, 8 GB recommended
- 500 MB disk space
- Audio system (ALSA/PulseAudio)
- Video4Linux compatible camera

## Server Deployment

### Docker Deployment (Recommended)

#### Prerequisites
- Docker Engine 20.10+
- Docker Compose 2.0+
- 2 GB RAM minimum
- 10 GB disk space

#### Quick Start
```bash
# Clone the repository
git clone https://github.com/meetingmind/meetingmind.git
cd meetingmind

# Run deployment script
./deployment/scripts/deploy.sh --env production --domain meetingmind.example.com --ssl --email admin@example.com

# Or manually with Docker Compose
docker-compose up -d
```

#### Environment Variables
Create `.env` file with:
```env
NODE_ENV=production
DOMAIN=meetingmind.example.com
SSL_ENABLED=true
EMAIL=admin@example.com
```

### Kubernetes Deployment

#### Prerequisites
- Kubernetes cluster 1.20+
- kubectl configured
- Helm 3.0+
- Ingress controller (nginx recommended)
- cert-manager for SSL

#### Installation
```bash
# Add Helm repository
helm repo add meetingmind https://charts.meetingmind.com
helm repo update

# Install with Helm
helm install meetingmind meetingmind/meetingmind \
  --set domain=meetingmind.example.com \
  --set ssl.enabled=true \
  --set ssl.email=admin@example.com

# Or use deployment script
./deployment/scripts/deploy.sh --type kubernetes --domain meetingmind.example.com
```

### Standalone Deployment

#### Prerequisites
- Node.js 18+
- Python 3.9+
- PostgreSQL 13+
- Redis 6+

#### Installation Steps
```bash
# Clone repository
git clone https://github.com/meetingmind/meetingmind.git
cd meetingmind

# Install frontend dependencies
cd frontend
npm install
npm run build
cd ..

# Install backend dependencies
cd backend
pip install -r requirements.txt
cd ..

# Configure environment
cp .env.example .env
# Edit .env with your configuration

# Setup database
cd backend
python -m alembic upgrade head
cd ..

# Start services
./deployment/scripts/deploy.sh --type standalone
```

## Auto-Update Configuration

### Desktop Application

The desktop application includes automatic updates:

1. **Automatic**: Updates check and install automatically
2. **Manual**: Check via Help → Check for Updates
3. **Configuration**: Updates can be disabled in settings

### Update Server Setup

For organizations wanting to host their own update server:

```bash
# Setup update server
./deployment/scripts/setup-update-server.sh \
  --domain updates.example.com \
  --email admin@example.com \
  --token your-github-token \
  --webhook webhook-secret
```

## Security Configuration

### End-to-End Encryption

Enable E2E encryption in settings:
1. Open Settings → Security
2. Enable "End-to-End Encryption"
3. Choose security level (Basic/Enhanced/Maximum/Classified)
4. Generate or import encryption keys

### Local-Only Mode

For maximum privacy:
1. Open Settings → Privacy
2. Enable "Local-Only Mode"
3. Disable cloud services
4. All data stays on device

### Audit Logging

Enable compliance logging:
1. Open Settings → Compliance
2. Enable "Audit Logging"
3. Configure retention policies
4. Export logs as needed

## Troubleshooting

### Common Issues

#### Desktop Application Won't Start
- **Windows**: Run as Administrator, check antivirus
- **macOS**: Check Security & Privacy settings
- **Linux**: Install missing dependencies

#### Audio/Video Issues
- Check microphone/camera permissions
- Test with other applications
- Update audio/video drivers
- Restart the application

#### Network Issues
- Check firewall settings
- Verify internet connection
- Test with different network
- Contact IT administrator

#### Update Issues
- Check internet connectivity
- Verify update server availability
- Manual download from releases page
- Contact support if persistent

### Log Files

Application logs are stored at:
- **Windows**: `%APPDATA%\MeetingMind\logs\`
- **macOS**: `~/Library/Logs/MeetingMind/`
- **Linux**: `~/.config/MeetingMind/logs/`

### Support Channels

- **Documentation**: https://docs.meetingmind.com
- **Issues**: https://github.com/meetingmind/desktop/issues
- **Community**: https://community.meetingmind.com
- **Email**: support@meetingmind.com

## Advanced Configuration

### Custom Themes

Create custom themes:
1. Copy default theme from `themes/default/`
2. Modify CSS variables in `theme.css`
3. Place in `themes/custom/`
4. Select in Settings → Appearance

### Plugin Development

Develop custom plugins:
1. Use Plugin SDK: `npm install @meetingmind/plugin-sdk`
2. Follow plugin development guide
3. Install via Settings → Plugins
4. Share with community

### Enterprise Features

Contact sales for enterprise features:
- Single Sign-On (SSO)
- Active Directory integration
- Custom branding
- Priority support
- Professional services

## System Requirements Summary

| Platform | Minimum | Recommended |
|----------|---------|-------------|
| **Windows** | 10 (64-bit), 4GB RAM | 11, 8GB RAM |
| **macOS** | 10.15, 4GB RAM | 12.0+, 8GB RAM |
| **Linux** | Ubuntu 18.04+, 4GB RAM | Ubuntu 22.04+, 8GB RAM |
| **Browser** | Chrome 90+, Firefox 88+ | Latest versions |
| **Server** | 2 CPU, 4GB RAM, 20GB disk | 4 CPU, 8GB RAM, 100GB disk |

## License

MeetingMind is released under the MIT License. See [LICENSE](LICENSE) for details.

## Contributing

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

---

**Need help?** Contact our support team at support@meetingmind.com or visit our [documentation](https://docs.meetingmind.com).