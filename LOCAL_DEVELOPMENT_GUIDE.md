# 🚀 MeetingMind Local Development Deployment Guide

This comprehensive guide will walk you through setting up the MeetingMind project for local development. The project is a full-stack enterprise AI meeting assistant with real-time transcription, multi-provider AI integration, and collaborative features.

## 📋 Prerequisites

Before starting, ensure you have the following installed on your system:

### Required Software
- **Python 3.8+** (recommended: Python 3.11+)
- **Node.js 18+** (recommended: Node.js 20+)
- **Git** for version control
- **Docker & Docker Compose** (optional but recommended)

### System Requirements
- **RAM**: Minimum 8GB (16GB+ recommended for AI models)
- **Storage**: At least 5GB free space
- **OS**: Windows 10/11, macOS 10.15+, or Linux Ubuntu 18.04+

## 🎯 Quick Start (Recommended)

### Option 1: Docker Development Setup (Fastest)

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd MeetingsHacker
   ```

2. **Start development environment**
   ```bash
   # Start core services (database, redis, backend, frontend)
   docker-compose -f docker-compose.dev.yml up -d

   # View logs
   docker-compose -f docker-compose.dev.yml logs -f
   ```

   **Note**: The project now uses a unified multi-stage `Dockerfile.frontend` that supports both development and production builds. The development target is automatically selected in the dev compose file.

3. **Access the application**
   - **Frontend**: http://localhost:3000
   - **Backend API**: http://localhost:8000
   - **API Documentation**: http://localhost:8000/docs
   - **Database Admin**: http://localhost:5050 (admin@meetingmind.local / admin_password)
   - **Redis Admin**: http://localhost:8081

### Option 2: Manual Setup (More Control)

## 🛠️ Manual Development Setup

### Step 1: Backend Setup

1. **Navigate to backend directory**
   ```bash
   cd backend
   ```

2. **Create and activate virtual environment**
   ```bash
   # Create virtual environment
   python -m venv venv

   # Activate virtual environment
   # On Windows:
   venv\Scripts\activate
   # On macOS/Linux:
   source venv/bin/activate
   ```

3. **Install Python dependencies**
   ```bash
   pip install -r requirements.txt
   ```

4. **Set up environment variables**
   ```bash
   # Copy example environment file
   cp .env.example .env
   
   # Edit .env file with your settings
   nano .env  # or use your preferred editor
   ```

   **Essential Environment Variables:**
   ```bash
   # Database
   DATABASE_URL=sqlite:///./meetingmind.db  # For development
   
   # AI Provider API Keys (optional for basic functionality)
   OPENAI_API_KEY=your_openai_api_key_here
   ANTHROPIC_API_KEY=your_anthropic_api_key_here
   
   # Security (use secure values in production)
   SECRET_KEY=dev-secret-key-change-in-production
   JWT_SECRET=dev-jwt-secret-change-in-production
   
   # Development settings
   DEBUG=true
   LOG_LEVEL=DEBUG
   ```

5. **Initialize the database**
   ```bash
   # Run database migrations
   alembic upgrade head
   
   # Optional: Create initial data
   python -c "from database import create_initial_data; create_initial_data()"
   ```

6. **Start the backend server**
   ```bash
   python main.py
   ```

   The backend will be available at:
   - **API**: http://localhost:8000
   - **WebSocket**: ws://localhost:8001
   - **API Docs**: http://localhost:8000/docs
   - **OpenAPI Spec**: http://localhost:8000/openapi.json

### Step 2: Frontend Setup

1. **Open a new terminal and navigate to frontend directory**
   ```bash
   cd frontend
   ```

2. **Install Node.js dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**
   ```bash
   # Copy example environment file
   cp .env.example .env.local
   
   # Edit .env.local with your settings
   nano .env.local  # or use your preferred editor
   ```

   **Essential Frontend Environment Variables:**
   ```bash
   # API Configuration
   VITE_API_URL=http://localhost:8000
   VITE_WS_URL=ws://localhost:8001
   
   # Feature Flags
   VITE_FEATURE_AI_INSIGHTS=true
   VITE_FEATURE_REAL_TIME_TRANSCRIPTION=true
   VITE_FEATURE_SPEAKER_IDENTIFICATION=true
   
   # Development settings
   VITE_DEV_MODE=true
   VITE_LOG_LEVEL=debug
   ```

4. **Start the frontend development server**
   ```bash
   npm run dev
   ```

   The frontend will be available at:
   - **Application**: http://localhost:5173 (Vite default) or http://localhost:3000

## 🗄️ Database Setup Options

### Option 1: SQLite (Default - Easiest)
SQLite is configured by default and requires no additional setup. Perfect for development.

### Option 2: PostgreSQL (Recommended for Production-like Development)

1. **Install PostgreSQL**
   ```bash
   # Ubuntu/Debian
   sudo apt-get install postgresql postgresql-contrib
   
   # macOS with Homebrew
   brew install postgresql
   brew services start postgresql
   
   # Windows: Download from https://www.postgresql.org/download/windows/
   ```

2. **Create database and user**
   ```bash
   sudo -u postgres psql
   CREATE DATABASE meetingmind_dev;
   CREATE USER dev_user WITH PASSWORD 'dev_password';
   GRANT ALL PRIVILEGES ON DATABASE meetingmind_dev TO dev_user;
   \q
   ```

3. **Update DATABASE_URL in backend/.env**
   ```bash
   DATABASE_URL=postgresql://dev_user:dev_password@localhost/meetingmind_dev
   ```

### Option 3: Docker Database Services

```bash
# Start only database services
docker-compose -f docker-compose.dev.yml up -d database redis

# Database will be available at localhost:5433
# Redis will be available at localhost:6380
```

## 🔧 Additional Development Services

### Redis (For Caching and Real-time Features)

1. **Install Redis**
   ```bash
   # Ubuntu/Debian
   sudo apt-get install redis-server
   
   # macOS with Homebrew
   brew install redis
   brew services start redis
   
   # Windows: Use Docker or WSL
   ```

2. **Update REDIS_URL in backend/.env**
   ```bash
   REDIS_URL=redis://localhost:6379/0
   ```

### Elasticsearch (Optional - For Advanced Search)

```bash
# Start Elasticsearch with Docker
docker-compose -f docker-compose.dev.yml up -d elasticsearch kibana --profile search

# Elasticsearch: http://localhost:9200
# Kibana: http://localhost:5601
```

## 🤖 AI Provider Setup

### OpenAI Setup
1. Get API key from https://platform.openai.com/api-keys
2. Add to backend/.env: `OPENAI_API_KEY=your_key_here`

### Anthropic Claude Setup
1. Get API key from https://console.anthropic.com/
2. Add to backend/.env: `ANTHROPIC_API_KEY=your_key_here`

### Local AI Models (Optional)
For privacy-focused development, you can use local models:

```bash
# Install Ollama (local AI runner)
curl -fsSL https://ollama.ai/install.sh | sh

# Pull models
ollama pull llama2
ollama pull codellama

# Configure in backend/.env
LOCAL_AI_ENABLED=true
OLLAMA_BASE_URL=http://localhost:11434
```

## 🎵 Audio Processing Setup

### Whisper Model Setup
The system will automatically download Whisper models on first use. For faster startup:

```bash
# Pre-download models (optional)
cd backend
python -c "
import whisper
whisper.load_model('tiny')  # Fast, less accurate
whisper.load_model('base')  # Balanced
whisper.load_model('small') # Better accuracy
"
```

### System Audio Dependencies

**Windows:**
```bash
# Usually included with Python
pip install pyaudio
```

**macOS:**
```bash
# Install PortAudio
brew install portaudio
pip install pyaudio
```

**Linux:**
```bash
# Install system dependencies
sudo apt-get install portaudio19-dev python3-pyaudio
pip install pyaudio
```

## 🧪 Verification & Testing

### Health Checks

1. **Backend Health Check**
   ```bash
   curl http://localhost:8000/health
   # Expected: {"status": "healthy", "timestamp": "..."}
   ```

2. **Frontend Connection Test**
   - Open http://localhost:5173
   - Check connection status indicator (should show "Connected")
   - Open browser developer tools to see WebSocket messages

3. **Database Connection Test**
   ```bash
   cd backend
   python -c "
   from database import get_db
   from sqlalchemy import text
   db = next(get_db())
   result = db.execute(text('SELECT 1')).fetchone()
   print('Database OK:', result)
   "
   ```

### Feature Testing

1. **Real-time Communication**
   - Open multiple browser tabs
   - Test WebSocket connectivity
   - Verify real-time updates

2. **Audio Processing**
   - Test microphone access
   - Verify audio visualization
   - Test transcription services

3. **AI Integration**
   - Navigate to AI Playground
   - Test different providers
   - Verify response streaming

## 🔍 Troubleshooting

### Common Issues

#### Backend Won't Start
```bash
# Check Python version
python --version  # Should be 3.8+

# Check virtual environment is activated
which python  # Should point to venv/bin/python

# Check dependencies
pip list | grep fastapi

# Check port availability
lsof -i :8000  # macOS/Linux
netstat -an | findstr :8000  # Windows
```

#### Frontend Won't Start
```bash
# Check Node.js version
node --version  # Should be 18+

# Clear npm cache
npm cache clean --force

# Delete and reinstall node_modules
rm -rf node_modules package-lock.json
npm install

# Check port availability
lsof -i :5173  # macOS/Linux
netstat -an | findstr :5173  # Windows
```

#### Database Connection Issues
```bash
# SQLite permissions (if using SQLite)
ls -la *.db
chmod 664 meetingmind.db

# PostgreSQL connection test
psql -h localhost -U dev_user -d meetingmind_dev -c "SELECT version();"
```

#### WebSocket Connection Issues
- Check CORS settings in backend configuration
- Verify WebSocket URL in frontend environment variables
- Check firewall settings
- Test with different browsers

### Development Tools

#### Database Management
```bash
# PGAdmin (for PostgreSQL)
docker-compose -f docker-compose.dev.yml up -d pgadmin --profile admin
# Access: http://localhost:5050

# Redis Commander
docker-compose -f docker-compose.dev.yml up -d redis-commander --profile admin
# Access: http://localhost:8081
```

#### Email Testing (Development)
```bash
# MailHog for testing email features
docker-compose -f docker-compose.dev.yml up -d mailhog --profile email
# Access: http://localhost:8025
```

#### Log Monitoring
```bash
# Follow backend logs
tail -f backend/logs/app.log

# Follow all Docker services
docker-compose -f docker-compose.dev.yml logs -f

# Follow specific service
docker-compose -f docker-compose.dev.yml logs -f backend
```

## 🔧 Development Workflow

### Docker Multi-Stage Architecture
The project uses modern Docker best practices with unified multi-stage builds:

- **Dockerfile.frontend**: Single file with `development`, `builder`, and `production` stages
- **Dockerfile.backend**: Single file with `development` and `production` stages  
- **Automatic Target Selection**: Docker Compose files select appropriate build targets
- **Optimized for Development**: Development stages include hot reload and debugging tools

### Daily Development Routine

1. **Start services**
   ```bash
   # Start all services (uses development targets automatically)
   docker-compose -f docker-compose.dev.yml up -d
   
   # Or start manually
   cd backend && python main.py &
   cd frontend && npm run dev &
   ```

2. **Development tasks**
   ```bash
   # Backend code changes trigger auto-reload
   # Frontend changes trigger hot module replacement
   
   # Run tests
   cd backend && pytest
   cd frontend && npm test
   
   # Check code quality
   cd backend && black . && flake8
   cd frontend && npm run lint
   ```

3. **Stop services**
   ```bash
   # Stop Docker services
   docker-compose -f docker-compose.dev.yml down
   
   # Or stop manual processes
   # Ctrl+C in each terminal
   ```

### Git Workflow
```bash
# Create feature branch
git checkout -b feature/your-feature-name

# Make changes and commit
git add .
git commit -m "feat: description of changes"

# Push and create pull request
git push origin feature/your-feature-name
```

## 📊 Monitoring & Observability

### Development Monitoring
```bash
# Start monitoring stack
docker-compose -f docker-compose.dev.yml up -d --profile monitoring

# Access monitoring tools
# Prometheus: http://localhost:9090
# Grafana: http://localhost:3001
# Jaeger: http://localhost:16686
```

### Performance Profiling
```bash
# Backend performance monitoring
cd backend
python -m cProfile -o profile.stats main.py
python -c "import pstats; pstats.Stats('profile.stats').sort_stats('cumulative').print_stats(10)"

# Frontend performance
# Use browser developer tools -> Performance tab
```

## 🚀 Production-Ready Features

Even in development, you can test production features:

### Security Features
- JWT authentication
- Rate limiting
- Input validation
- CORS protection
- Security headers

### AI Features
- Multi-provider AI routing
- Cost optimization
- Fallback chains
- A/B testing framework

### Real-time Features
- WebSocket communication
- Live transcription
- Collaborative editing
- Presence awareness

### Analytics
- Meeting insights
- Performance metrics
- User engagement tracking
- System health monitoring

## 📚 Additional Resources

### Documentation
- [Architecture Guide](docs/ARCHITECTURE.md)
- [Configuration Guide](docs/CONFIGURATION.md)
- [Security Guide](JITTER_BUFFER_SECURITY.md)
- [API Documentation](http://localhost:8000/docs) (when backend is running)

### Learning Resources
- [FastAPI Tutorial](https://fastapi.tiangolo.com/tutorial/)
- [React + Vite Guide](https://vitejs.dev/guide/)
- [Tailwind CSS Docs](https://tailwindcss.com/docs)
- [WebSocket Guide](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket)

## 🆘 Getting Help

### Debug Information Collection
If you encounter issues, collect this information:

```bash
# System information
uname -a  # Linux/macOS
systeminfo  # Windows

# Python environment
python --version
pip list

# Node.js environment
node --version
npm --version

# Service status
curl -f http://localhost:8000/health
curl -f http://localhost:5173

# Logs
docker-compose -f docker-compose.dev.yml logs --tail=50
```

### Support Channels
- Check existing issues in the repository
- Review troubleshooting section above
- Create detailed issue reports with debug information

---

## 🎉 Success!

If you've followed this guide successfully, you should have:

✅ Backend API running at http://localhost:8000  
✅ Frontend application at http://localhost:5173  
✅ Database connected and initialized  
✅ WebSocket real-time communication working  
✅ AI providers configured (optional)  
✅ Audio processing capabilities  
✅ Development tools and monitoring set up  

You're now ready to develop with MeetingMind! The application includes comprehensive features for meeting management, real-time transcription, AI-powered insights, and collaborative tools.

**Happy coding! 🚀**