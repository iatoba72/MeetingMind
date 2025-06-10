# Whisper Transcription Setup Instructions

This guide provides detailed setup instructions for integrating OpenAI Whisper local transcription with MeetingMind across different operating systems.

## Prerequisites

- Python 3.8+ (3.9+ recommended)
- Node.js 16+ for the frontend
- Redis server for queue management
- Git for version control

## Quick Start

1. **Clone and navigate to the project:**
   ```bash
   git clone <repository-url>
   cd meeting-mind
   ```

2. **Set up the backend with Whisper:**
   ```bash
   cd backend
   pip install -r requirements.txt
   python main.py
   ```

3. **Set up the frontend:**
   ```bash
   cd ../frontend
   npm install
   npm run dev
   ```

4. **Access the application:**
   - Frontend: http://localhost:5173
   - Backend API: http://localhost:8000
   - API Documentation: http://localhost:8000/docs

## Detailed Platform-Specific Setup

### Windows Setup

#### 1. Install Python Dependencies

```powershell
# Open PowerShell as Administrator
# Install Python 3.9+ from python.org if not already installed

# Navigate to backend directory
cd backend

# Create virtual environment (recommended)
python -m venv whisper_env
whisper_env\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Install additional Windows-specific dependencies
pip install pyaudio  # For microphone access on Windows
```

#### 2. Install Redis

**Option A: Using Chocolatey (Recommended)**
```powershell
# Install Chocolatey if not already installed
Set-ExecutionPolicy Bypass -Scope Process -Force; [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072; iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))

# Install Redis
choco install redis-64
```

**Option B: Using Windows Subsystem for Linux (WSL)**
```bash
# Install WSL2 and Ubuntu
wsl --install

# Inside WSL Ubuntu terminal
sudo apt update
sudo apt install redis-server
redis-server --daemonize yes
```

**Option C: Using Docker**
```powershell
# Install Docker Desktop for Windows
# Then run Redis in a container
docker run -d -p 6379:6379 --name redis redis:alpine
```

#### 3. GPU Acceleration (Optional but Recommended)

```powershell
# Install CUDA Toolkit 11.8 or 12.x from NVIDIA website
# https://developer.nvidia.com/cuda-downloads

# Install PyTorch with CUDA support
pip uninstall torch torchaudio
pip install torch torchaudio --index-url https://download.pytorch.org/whl/cu118

# Verify CUDA installation
python -c "import torch; print(f'CUDA available: {torch.cuda.is_available()}')"
```

#### 4. Audio System Setup

```powershell
# Install additional audio dependencies
pip install sounddevice portaudio

# For Windows-specific audio handling
pip install winsound
```

### macOS Setup

#### 1. Install Dependencies

```bash
# Install Homebrew if not already installed
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install Python 3.9+
brew install python@3.9

# Navigate to backend directory
cd backend

# Create virtual environment
python3 -m venv whisper_env
source whisper_env/bin/activate

# Install Python dependencies
pip install -r requirements.txt

# Install macOS-specific audio dependencies
brew install portaudio
pip install pyaudio
```

#### 2. Install Redis

```bash
# Install Redis via Homebrew
brew install redis

# Start Redis service
brew services start redis

# Or run Redis manually
redis-server
```

#### 3. GPU Acceleration (Apple Silicon)

```bash
# For Apple Silicon Macs (M1/M2/M3)
# Install PyTorch with Metal Performance Shaders (MPS) support
pip install torch torchaudio

# For Intel Macs, follow similar CUDA setup as Linux if you have a compatible GPU
# Most Intel Macs don't have CUDA-compatible GPUs, so CPU inference will be used
```

#### 4. Audio Permissions

```bash
# Grant microphone permissions to Terminal/iTerm
# System Preferences > Security & Privacy > Privacy > Microphone
# Add Terminal or your development environment

# Test microphone access
python -c "import sounddevice as sd; print('Audio devices:', sd.query_devices())"
```

### Linux Setup (Ubuntu/Debian)

#### 1. Install System Dependencies

```bash
# Update package list
sudo apt update

# Install Python and development tools
sudo apt install python3 python3-pip python3-venv python3-dev

# Install audio system dependencies
sudo apt install portaudio19-dev python3-pyaudio
sudo apt install ffmpeg  # Required for audio processing

# Install build tools (may be needed for some packages)
sudo apt install build-essential

# Navigate to backend directory
cd backend

# Create virtual environment
python3 -m venv whisper_env
source whisper_env/bin/activate

# Install Python dependencies
pip install -r requirements.txt
```

#### 2. Install Redis

```bash
# Install Redis server
sudo apt install redis-server

# Start Redis service
sudo systemctl start redis-server
sudo systemctl enable redis-server  # Auto-start on boot

# Verify Redis is running
redis-cli ping  # Should return "PONG"
```

#### 3. GPU Acceleration (NVIDIA)

```bash
# Install NVIDIA drivers (if not already installed)
sudo apt install nvidia-driver-470  # or latest version

# Install CUDA Toolkit
wget https://developer.download.nvidia.com/compute/cuda/repos/ubuntu2004/x86_64/cuda-ubuntu2004.pin
sudo mv cuda-ubuntu2004.pin /etc/apt/preferences.d/cuda-repository-pin-600
wget https://developer.download.nvidia.com/compute/cuda/11.8.0/local_installers/cuda-repo-ubuntu2004-11-8-local_11.8.0-520.61.05-1_amd64.deb
sudo dpkg -i cuda-repo-ubuntu2004-11-8-local_11.8.0-520.61.05-1_amd64.deb
sudo cp /var/cuda-repo-ubuntu2004-11-8-local/cuda-*-keyring.gpg /usr/share/keyrings/
sudo apt-get update
sudo apt-get -y install cuda

# Install PyTorch with CUDA support
pip uninstall torch torchaudio
pip install torch torchaudio --index-url https://download.pytorch.org/whl/cu118

# Verify CUDA installation
python -c "import torch; print(f'CUDA available: {torch.cuda.is_available()}')"
python -c "import torch; print(f'GPU count: {torch.cuda.device_count()}')"
```

#### 4. Audio System Setup

```bash
# Install ALSA utilities (if not already installed)
sudo apt install alsa-utils

# Test audio recording
arecord -l  # List recording devices
arecord -d 5 test.wav  # Record 5 seconds to test.wav

# Install PulseAudio (usually pre-installed on desktop Ubuntu)
sudo apt install pulseaudio pulseaudio-utils

# Test with Python
python -c "import sounddevice as sd; print('Audio devices:', sd.query_devices())"
```

## Configuration

### 1. Environment Variables

Create a `.env` file in the backend directory:

```bash
# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379

# Celery Configuration
CELERY_BROKER=redis://localhost:6379/0
CELERY_BACKEND=redis://localhost:6379/0

# Whisper Configuration
WHISPER_CACHE_DIR=./models  # Directory to store downloaded models
WHISPER_DEFAULT_MODEL=base  # Default model size

# System Configuration
MAX_WORKERS=2  # Number of concurrent transcription workers
TRANSCRIPTION_TIMEOUT=30  # Timeout in seconds for transcription
```

### 2. Model Download and Caching

```bash
# Pre-download models to avoid delays during first use
python -c "
from faster_whisper import WhisperModel
models = ['tiny', 'base', 'small', 'medium']
for model in models:
    print(f'Downloading {model} model...')
    WhisperModel(model, download_root='./models')
    print(f'{model} model downloaded successfully')
"
```

### 3. Frontend Configuration

Update `frontend/src/config.ts` or create it:

```typescript
export const API_BASE_URL = 'http://localhost:8000';
export const WS_BASE_URL = 'ws://localhost:8000';

export const TRANSCRIPTION_CONFIG = {
  defaultModel: 'base',
  defaultLanguage: null, // Auto-detect
  chunkDuration: 3000, // 3 seconds
  silenceTimeout: 2000, // 2 seconds
  confidenceThreshold: 0.6
};
```

## Testing the Setup

### 1. Backend Test

```bash
# Navigate to backend directory
cd backend
source whisper_env/bin/activate  # On Windows: whisper_env\Scripts\activate

# Start the backend server
python main.py

# In another terminal, test the API
curl http://localhost:8000/health
curl http://localhost:8000/transcription/models
```

### 2. Redis Test

```bash
# Test Redis connection
redis-cli ping

# Check Redis logs
redis-cli monitor
```

### 3. Whisper Test

```python
# Test Whisper transcription (save as test_whisper.py)
import asyncio
from transcription_service import transcription_service, TranscriptionConfig, WhisperModelSize

async def test_whisper():
    # Load a model
    success = await transcription_service.load_model(WhisperModelSize.BASE)
    print(f"Model loaded: {success}")
    
    # Get system info
    info = await transcription_service.get_system_info()
    print(f"System info: {info}")

# Run test
asyncio.run(test_whisper())
```

### 4. Frontend Test

```bash
# Navigate to frontend directory
cd frontend

# Install dependencies
npm install

# Start development server
npm run dev

# Open browser to http://localhost:5173
# Test model selection and real-time transcription
```

## Performance Optimization

### 1. Model Selection Guidelines

- **tiny**: Real-time transcription, low accuracy (~32x speed)
- **base**: Good balance for live use (~16x speed)
- **small**: Better accuracy, still real-time capable (~6x speed)
- **medium**: High accuracy, may not be real-time (~2x speed)
- **large/large-v3**: Best accuracy, offline processing only (~1x speed)

### 2. Hardware Recommendations

**For Real-time Transcription:**
- CPU: Intel i5/AMD Ryzen 5 or better
- RAM: 8GB minimum, 16GB recommended
- GPU: NVIDIA GTX 1060 or better (optional but recommended)

**For High-Accuracy Offline Processing:**
- CPU: Intel i7/AMD Ryzen 7 or better
- RAM: 16GB minimum, 32GB recommended
- GPU: NVIDIA RTX 3060 or better with 8GB+ VRAM

### 3. System Optimization

```bash
# Increase Redis memory limit (if needed)
redis-cli config set maxmemory 1gb
redis-cli config set maxmemory-policy allkeys-lru

# Optimize Python for audio processing
export PYTHONOPTIMIZE=2
export OMP_NUM_THREADS=4  # Adjust based on CPU cores

# For Linux: Increase audio buffer size if experiencing dropouts
echo 'vm.swappiness=10' | sudo tee -a /etc/sysctl.conf
```

## Troubleshooting

### Common Issues

1. **"No module named 'faster_whisper'"**
   ```bash
   # Ensure you're in the virtual environment
   source whisper_env/bin/activate  # Linux/Mac
   whisper_env\Scripts\activate     # Windows
   pip install faster-whisper
   ```

2. **Redis connection failed**
   ```bash
   # Check if Redis is running
   redis-cli ping
   
   # Start Redis service
   # Linux: sudo systemctl start redis-server
   # Mac: brew services start redis
   # Windows: redis-server or Docker
   ```

3. **CUDA out of memory**
   ```python
   # Use smaller model or reduce batch size
   # In transcription_service.py, modify:
   compute_type = "int8"  # Instead of "float16"
   ```

4. **Audio permission denied**
   ```bash
   # Linux: Add user to audio group
   sudo usermod -a -G audio $USER
   
   # Mac: Grant microphone permissions in System Preferences
   # Windows: Check Windows Privacy settings
   ```

5. **Poor transcription quality**
   - Check microphone quality and positioning
   - Reduce background noise
   - Use a larger model for better accuracy
   - Ensure proper audio levels (not too quiet or loud)

### Performance Issues

1. **Slow transcription**
   - Use GPU acceleration if available
   - Use smaller models for real-time processing
   - Reduce audio chunk size
   - Close unnecessary applications

2. **High memory usage**
   - Use smaller models
   - Limit concurrent transcription workers
   - Monitor and restart services if memory leaks occur

3. **Queue backlog**
   - Increase worker count in configuration
   - Use smaller models for faster processing
   - Implement priority queuing for important sessions

## API Endpoints Reference

### Transcription Endpoints

- `GET /transcription/models` - List available models
- `POST /transcription/load-model` - Load specific model
- `POST /transcription/process-chunk` - Process audio chunk
- `POST /transcription/enqueue-chunk` - Add to processing queue
- `GET /transcription/queue/stats` - Queue statistics
- `GET /transcription/system-info` - System information

### WebSocket Events

- `audio_start_session` - Initialize audio session
- `audio_chunk_data` - Send audio data
- `transcription_result` - Receive transcription results
- `metrics_update` - Performance metrics updates

## Support and Updates

For issues and updates:
1. Check the project's GitHub repository
2. Review the API documentation at `/docs`
3. Monitor system logs for error details
4. Use the built-in metrics dashboard for performance monitoring

## Security Considerations

1. **Audio Privacy**: Audio data is processed locally and not sent to external services
2. **Network Security**: Use HTTPS in production environments
3. **Access Control**: Implement authentication for production deployments
4. **Data Storage**: Configure appropriate data retention policies

This setup guide should get you up and running with local Whisper transcription in MeetingMind. Adjust configurations based on your specific hardware and performance requirements.