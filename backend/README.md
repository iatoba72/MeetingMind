# MeetingMind Backend

FastAPI-based backend for the MeetingMind AI meeting assistant.

## 🎯 Overview

This backend provides a modern, async API built with FastAPI that handles:
- **Real-time WebSocket communication** for live meeting features
- **RESTful API endpoints** for meeting management
- **AI integration points** for transcription and analysis
- **Database operations** with SQLAlchemy (coming soon)

## 🚀 Quick Start

```bash
# Create and activate virtual environment
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env

# Start development server
python main.py
```

The server will start at http://localhost:8000

## 📚 API Documentation

FastAPI automatically generates interactive API documentation:
- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc

## 🏗️ Architecture

### Why FastAPI?

FastAPI was chosen for its exceptional capabilities in building modern APIs:

**Async by Default**
```python
# FastAPI handles async operations naturally
@app.websocket("/ws/{client_id}")
async def websocket_endpoint(websocket: WebSocket, client_id: int):
    await manager.connect(websocket)
    # Handles multiple concurrent connections efficiently
```

**Automatic Documentation**
- API documentation generated from code
- Interactive testing interface included
- OpenAPI/Swagger compliance out of the box

**Type Safety with Pydantic**
```python
from pydantic import BaseModel

class Meeting(BaseModel):
    title: str
    description: Optional[str] = None
    start_time: datetime
    
# Automatic validation and serialization
@app.post("/meetings")
async def create_meeting(meeting: Meeting):
    return meeting  # Automatically validated and serialized
```

**Performance**
- One of the fastest Python frameworks
- Comparable performance to Node.js and Go
- Built on Starlette and Uvicorn for speed

## 🔌 WebSocket Implementation

The real-time features use WebSockets for low-latency communication:

```python
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    async def broadcast(self, message: str):
        for connection in self.active_connections:
            await connection.send_text(message)
```

**Key Features:**
- Connection management with automatic cleanup
- Broadcast messaging for meeting updates
- JSON message formatting for structured communication
- Error handling for connection drops

## 📦 Dependencies Explained

### Core FastAPI Stack
```python
fastapi==0.104.1          # Modern web framework
uvicorn[standard]==0.24.0 # ASGI server for production
websockets==12.0          # WebSocket support
```

**Why These Versions?**
- FastAPI 0.104.1: Latest stable with all features we need
- Uvicorn with [standard]: Includes optimizations and HTTP/2 support
- WebSockets 12.0: Most recent stable version with security updates

### Database (Future)
```python
sqlalchemy==2.0.23        # Modern ORM with async support
alembic==1.12.1          # Database migrations
```

### Data Validation
```python
pydantic==2.5.0          # Runtime validation with type hints
pydantic-settings==2.1.0 # Environment variable management
```

### Development Tools
```python
pytest==7.4.3           # Testing framework
pytest-asyncio==0.21.1  # Async test support
httpx==0.25.2           # HTTP client for testing APIs
```

### Security
```python
python-jose[cryptography]==3.3.0 # JWT token handling
passlib[bcrypt]==1.7.4   # Password hashing
```

## 🔧 Development Commands

```bash
# Start development server with auto-reload
python main.py

# Alternative: Use uvicorn directly
uvicorn main:app --reload --host 0.0.0.0 --port 8000

# Run tests (when implemented)
pytest

# Run tests with coverage
pytest --cov=.

# Format code with Black
black .

# Type checking with MyPy
mypy .

# Lint with Flake8
flake8 .
```

## 🌐 Environment Configuration

Create a `.env` file based on `.env.example`:

```bash
# Database
DATABASE_URL=sqlite:///./meetingmind.db

# API Configuration
API_HOST=0.0.0.0
API_PORT=8000
DEBUG=True

# Security
SECRET_KEY=your-secret-key-here-change-in-production
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30

# CORS Settings
ALLOWED_ORIGINS=http://localhost:5173

# AI Services (for future integration)
OPENAI_API_KEY=your-openai-key
AZURE_SPEECH_KEY=your-azure-speech-key
AZURE_SPEECH_REGION=your-region
```

## 🧪 Testing WebSocket Connections

### Using Browser JavaScript Console
```javascript
const ws = new WebSocket('ws://localhost:8000/ws/1');
ws.onopen = () => console.log('Connected');
ws.onmessage = (event) => console.log('Received:', event.data);
ws.send(JSON.stringify({type: 'test', data: 'Hello, WebSocket!'}));
```

### Using wscat (Command Line)
```bash
# Install wscat globally
npm install -g wscat

# Connect to WebSocket
wscat -c ws://localhost:8000/ws/1

# Send test message
{"type": "test", "data": "Hello from wscat"}
```

### Using Postman
1. Create new WebSocket request
2. URL: `ws://localhost:8000/ws/1`
3. Connect and send JSON messages

## 🔜 Planned Features

### Database Integration
```python
# Coming soon: SQLAlchemy models
from sqlalchemy import Column, Integer, String, DateTime
from sqlalchemy.ext.declarative import declarative_base

Base = declarative_base()

class Meeting(Base):
    __tablename__ = "meetings"
    
    id = Column(Integer, primary_key=True)
    title = Column(String, nullable=False)
    start_time = Column(DateTime, nullable=False)
```

### Authentication
```python
# JWT-based authentication
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer

security = HTTPBearer()

async def get_current_user(token: str = Depends(security)):
    # Token validation logic
    pass
```

### AI Integration
```python
# Speech-to-text integration
import openai

async def transcribe_audio(audio_data: bytes):
    # OpenAI Whisper integration
    response = await openai.Audio.atranscribe(
        model="whisper-1",
        file=audio_data
    )
    return response["text"]
```

## 📝 API Endpoints

### Current Endpoints
- `GET /` - Root endpoint with API information
- `GET /health` - Health check for monitoring
- `GET /meetings` - List meetings (placeholder)
- `POST /meetings` - Create meeting (placeholder)
- `WebSocket /ws/{client_id}` - Real-time communication

### Planned Endpoints
- `POST /auth/login` - User authentication
- `POST /auth/register` - User registration
- `GET /meetings/{meeting_id}` - Get specific meeting
- `PUT /meetings/{meeting_id}` - Update meeting
- `DELETE /meetings/{meeting_id}` - Delete meeting
- `POST /meetings/{meeting_id}/transcribe` - Upload audio for transcription
- `GET /meetings/{meeting_id}/summary` - Get AI-generated summary

## 🚀 Deployment

### Development
```bash
python main.py
```

### Production with Uvicorn
```bash
uvicorn main:app --host 0.0.0.0 --port 8000 --workers 4
```

### Docker (Coming Soon)
```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY . .
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

## 🎓 Learning Resources

### FastAPI Fundamentals
- [FastAPI Tutorial](https://fastapi.tiangolo.com/tutorial/) - Official comprehensive guide
- [FastAPI Advanced Features](https://fastapi.tiangolo.com/advanced/) - WebSockets, middleware, testing

### Async Python
- [Python Async/Await Tutorial](https://realpython.com/async-io-python/) - Understanding async programming
- [AsyncIO Documentation](https://docs.python.org/3/library/asyncio.html) - Official Python async docs

### API Design
- [REST API Design](https://restfulapi.net/) - RESTful API principles
- [API Security Best Practices](https://owasp.org/www-project-api-security/) - Security guidelines

### WebSocket Development
- [WebSocket Protocol RFC](https://tools.ietf.org/html/rfc6455) - Technical specification
- [Real-time Applications Guide](https://ably.com/topic/websockets) - Practical patterns

This backend provides a solid foundation for building scalable, real-time meeting applications with modern Python tools and practices.